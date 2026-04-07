import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  addPuzzleToFolder,
  createFolder,
  deletePuzzle,
  listFolders,
  listPuzzles,
  removePuzzleFromFolder,
  type PuzzleFolder,
  upsertPuzzle,
} from "../core/storage";
import { setSyncedLocalStorageItem } from "../core/localDataState";
import { fillProgressWithSolutionDigits } from "../core/solutionFill";
import { fmtHMS } from "../core/time";
import { GridCanvas } from "./GridCanvas";
import { AppBrand } from "./AppBrand";
import { IconFolder, IconHome, IconImport, IconSettings, IconSort, IconSortAsc, IconSortDesc } from "./icons";
import { MobileMultiSelectFilter } from "./MobileMultiSelectFilter";
import { PopupMenuButton } from "./PopupMenuButton";
import { SelectControl, type SelectControlOption } from "./SelectControl";
import { SettingsOverlay } from "./SettingsOverlay";
import {
  clearReturnStateFromHistory,
  currentRoutePath,
  readCurrentScrollPosition,
  readPuzzleReturnState,
  restoreWindowScroll,
  withPuzzleOriginState,
} from "./puzzleNavState";

type SortOrder = "recent" | "az" | "date";
type SortDirection = "asc" | "desc";
type PuzzlePlayStatus = "not_started" | "in_progress" | "complete";
type FilterStatus = PuzzlePlayStatus;
type FolderFilterStatus = "all" | PuzzlePlayStatus;
type MainMenuSearchField = "any" | "title" | "constraints" | "author" | "collection";
type StoredPuzzle = Awaited<ReturnType<typeof listPuzzles>>[number];

type MainMenuFilterPrefs = {
  sortOrder: SortOrder;
  sortDirection: SortDirection;
  filterStatusList: FilterStatus[];
  query: string;
  searchField: MainMenuSearchField;
  authorFilters: string[];
  collectionFilters: string[];
  constraintFilters: string[];
};

type FolderMenuPrefs = {
  sortOrder: SortOrder;
  sortDirection: SortDirection;
  filterStatus: "all" | FilterStatus;
};

const MAIN_MENU_FILTER_PREFS_KEY = "sphenpad-main-menu-filters-v1";
const FOLDER_MENU_PREFS_KEY = "sphenpad-folder-menu-filters-v1";
const MOBILE_FILTER_MEDIA_QUERY = "(max-width: 760px)";
const MAIN_MENU_SEARCH_FIELDS = new Set<MainMenuSearchField>(["any", "title", "constraints", "author", "collection"]);
const MAIN_MENU_SEARCH_FIELD_OPTIONS: SelectControlOption[] = [
  { value: "any", label: "Search: Any field" },
  { value: "title", label: "Title" },
  { value: "constraints", label: "Constraints" },
  { value: "author", label: "Author" },
  { value: "collection", label: "Collection" },
];
const PUZZLE_SORT_OPTIONS: SelectControlOption[] = [
  { value: "recent", label: "Recent" },
  { value: "az", label: "A - Z" },
  { value: "date", label: "Video Date" },
];
const FOLDER_SORT_OPTIONS: SelectControlOption[] = [
  { value: "recent", label: "Recent" },
  { value: "az", label: "A - Z" },
];

const DEFAULT_MAIN_MENU_FILTER_PREFS: MainMenuFilterPrefs = {
  sortOrder: "recent",
  sortDirection: "desc",
  filterStatusList: [],
  query: "",
  searchField: "any",
  authorFilters: [],
  collectionFilters: [],
  constraintFilters: [],
};

function splitSemicolonValues(value: string): string[] {
  return value
    .split(";")
    .map((part) => clean(part))
    .filter(Boolean);
}

function orderSelectedFirst(options: string[], selected: string[]): string[] {
  const selectedSet = new Set(selected);
  const selectedOptions = options.filter((option) => selectedSet.has(option));
  const remainingOptions = options.filter((option) => !selectedSet.has(option));
  return [...selectedOptions, ...remainingOptions];
}

function incrementCountMap(counts: Map<string, number>, values: Iterable<string>) {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
}

const NOOP = () => {};

function isSortOrder(value: string): value is SortOrder {
  return value === "recent" || value === "az" || value === "date";
}

function isSortDirection(value: string): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isPuzzlePlayStatus(value: string): value is PuzzlePlayStatus {
  return value === "not_started" || value === "in_progress" || value === "complete";
}

function isFilterStatus(value: string): value is "all" | FilterStatus {
  return value === "all" || isPuzzlePlayStatus(value);
}

function isMainMenuSearchField(value: string): value is MainMenuSearchField {
  return MAIN_MENU_SEARCH_FIELDS.has(value as MainMenuSearchField);
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function readInitialMainMenuFilterPrefs(): MainMenuFilterPrefs {
  try {
    const raw = localStorage.getItem(MAIN_MENU_FILTER_PREFS_KEY);
    if (!raw) return DEFAULT_MAIN_MENU_FILTER_PREFS;

    const parsed = JSON.parse(raw) as {
      sortOrder?: string;
      sortDirection?: string;
      filterStatusList?: unknown[];
      query?: string;
      searchField?: string;
      authorFilter?: string;
      collectionFilter?: string;
      authorFilters?: string[];
      collectionFilters?: string[];
      constraintFilters?: string[];
    };
    const parsedSortOrder = parsed.sortOrder;
    const parsedSortDirection = parsed.sortDirection;
    const parsedFilterStatusList = parsed.filterStatusList;
    const parsedSearchField = parsed.searchField;

    return {
      sortOrder: typeof parsedSortOrder === "string" && isSortOrder(parsedSortOrder)
        ? parsedSortOrder
        : DEFAULT_MAIN_MENU_FILTER_PREFS.sortOrder,
      sortDirection: typeof parsedSortDirection === "string" && isSortDirection(parsedSortDirection)
        ? parsedSortDirection
        : DEFAULT_MAIN_MENU_FILTER_PREFS.sortDirection,
      filterStatusList: Array.isArray(parsedFilterStatusList)
        ? parsedFilterStatusList.filter((v): v is FilterStatus => typeof v === "string" && isPuzzlePlayStatus(v))
        : DEFAULT_MAIN_MENU_FILTER_PREFS.filterStatusList,
      query: typeof parsed.query === "string" ? parsed.query : DEFAULT_MAIN_MENU_FILTER_PREFS.query,
      searchField: typeof parsedSearchField === "string" && isMainMenuSearchField(parsedSearchField)
        ? parsedSearchField
        : DEFAULT_MAIN_MENU_FILTER_PREFS.searchField,
      authorFilters: Array.isArray(parsed.authorFilters)
        ? parsed.authorFilters.filter((value): value is string => typeof value === "string").map((value) => clean(value)).filter(Boolean)
        : (typeof parsed.authorFilter === "string" && clean(parsed.authorFilter).toLowerCase() !== "all"
          ? [clean(parsed.authorFilter)]
          : DEFAULT_MAIN_MENU_FILTER_PREFS.authorFilters),
      collectionFilters: Array.isArray(parsed.collectionFilters)
        ? parsed.collectionFilters.filter((value): value is string => typeof value === "string").map((value) => clean(value)).filter(Boolean)
        : (typeof parsed.collectionFilter === "string" && clean(parsed.collectionFilter).toLowerCase() !== "all"
          ? [clean(parsed.collectionFilter)]
          : DEFAULT_MAIN_MENU_FILTER_PREFS.collectionFilters),
      constraintFilters: Array.isArray(parsed.constraintFilters)
        ? parsed.constraintFilters.filter((value): value is string => typeof value === "string")
        : DEFAULT_MAIN_MENU_FILTER_PREFS.constraintFilters,
    };
  } catch {
    return DEFAULT_MAIN_MENU_FILTER_PREFS;
  }
}

function readInitialFolderMenuPrefs(): FolderMenuPrefs {
  try {
    const raw = localStorage.getItem(FOLDER_MENU_PREFS_KEY);
    if (!raw) return { sortOrder: "recent", sortDirection: "desc", filterStatus: "all" };

    const parsed = JSON.parse(raw) as {
      sortOrder?: string;
      sortDirection?: string;
      filterStatus?: string;
    };
    const parsedSortOrder = parsed.sortOrder;
    const parsedSortDirection = parsed.sortDirection;
    const parsedFilterStatus = parsed.filterStatus;

    return {
      sortOrder: typeof parsedSortOrder === "string" && isSortOrder(parsedSortOrder) ? parsedSortOrder : "recent",
      sortDirection: typeof parsedSortDirection === "string" && isSortDirection(parsedSortDirection) ? parsedSortDirection : "desc",
      filterStatus: typeof parsedFilterStatus === "string" && isFilterStatus(parsedFilterStatus) ? parsedFilterStatus : "all",
    };
  } catch {
    return { sortOrder: "recent", sortDirection: "desc", filterStatus: "all" };
  }
}

function puzzleStatus(row: StoredPuzzle): Exclude<FilterStatus, "all"> {
  const status = row.progress?.status ?? "not_started";
  if (status === "complete") return "complete";
  if (status === "in_progress") return "in_progress";
  return "not_started";
}

function statusLabel(status: PuzzlePlayStatus): string {
  if (status === "not_started") return "Not Started";
  if (status === "in_progress") return "In Progress";
  return "Complete";
}

function matchesStatusList(row: StoredPuzzle, statuses: FilterStatus[]): boolean {
  if (!statuses.length) return true;
  return statuses.includes(puzzleStatus(row));
}

function puzzleVideoDateTs(row: StoredPuzzle): number | null {
  const raw = clean(row.def?.meta?.archiveVideoDate);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortPuzzles(rows: StoredPuzzle[], sortOrder: SortOrder, sortDirection: SortDirection): StoredPuzzle[] {
  const next = [...rows];
  const directionFactor = sortDirection === "asc" ? 1 : -1;
  if (sortOrder === "recent") {
    next.sort((a, b) => (a.updatedAt - b.updatedAt) * directionFactor);
    return next;
  }
  if (sortOrder === "date") {
    next.sort((a, b) => {
      const av = puzzleVideoDateTs(a);
      const bv = puzzleVideoDateTs(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * directionFactor;
    });
    return next;
  }

  next.sort((a, b) => {
    const ta = (a.def?.meta?.title ?? "").toLowerCase();
    const tb = (b.def?.meta?.title ?? "").toLowerCase();
    if (!ta && tb) return 1;
    if (ta && !tb) return -1;
    return ta.localeCompare(tb) * directionFactor;
  });
  return next;
}

function sortFolders(rows: PuzzleFolder[], sortOrder: SortOrder, sortDirection: SortDirection): PuzzleFolder[] {
  const next = [...rows];
  const directionFactor = sortDirection === "asc" ? 1 : -1;
  if (sortOrder === "recent") {
    next.sort((a, b) => (a.updatedAt - b.updatedAt) * directionFactor);
    return next;
  }

  next.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * directionFactor);
  return next;
}

function puzzleTitle(row: StoredPuzzle): string {
  return clean(row.def?.meta?.title);
}

function puzzleAuthor(row: StoredPuzzle): string {
  return clean(row.def?.meta?.author);
}

function puzzleAuthors(row: StoredPuzzle): string[] {
  return splitSemicolonValues(puzzleAuthor(row));
}

function puzzleCollection(row: StoredPuzzle): string {
  return clean(row.def?.meta?.collection);
}

function matchesMainMenuSearch(
  row: StoredPuzzle,
  constraints: string[],
  searchField: MainMenuSearchField,
  queryLower: string,
): boolean {
  if (!queryLower) return true;

  const titleLower = puzzleTitle(row).toLowerCase();
  const authorLower = puzzleAuthor(row).toLowerCase();
  const collectionLower = puzzleCollection(row).toLowerCase();
  const constraintsLower = constraints.join(" ").toLowerCase();

  if (searchField === "title") return titleLower.includes(queryLower);
  if (searchField === "constraints") return constraintsLower.includes(queryLower);
  if (searchField === "author") return authorLower.includes(queryLower);
  if (searchField === "collection") return collectionLower.includes(queryLower);

  return [titleLower, constraintsLower, authorLower, collectionLower].join(" ").includes(queryLower);
}

function buildFolderPath(folder: PuzzleFolder, folderById: Map<string, PuzzleFolder>): string {
  const names: string[] = [folder.name];
  const seen = new Set<string>([folder.id]);
  let cursor = folder.parentId ? folderById.get(folder.parentId) ?? null : null;

  while (cursor && !seen.has(cursor.id)) {
    names.unshift(cursor.name);
    seen.add(cursor.id);
    cursor = cursor.parentId ? folderById.get(cursor.parentId) ?? null : null;
  }

  return names.join(" / ");
}

function hasBorderClues(clues: { top?: string[]; bottom?: string[]; left?: string[]; right?: string[] } | undefined): boolean {
  if (!clues) return false;
  const sides = [clues.top, clues.bottom, clues.left, clues.right];
  return sides.some((side) => Array.isArray(side) && side.some((v) => String(v ?? "").trim().length > 0));
}

function extractConstraintBullets(def: StoredPuzzle["def"]): string[] {
  const out = new Set<string>();
  const cosmetics = def.cosmetics;

  if (cosmetics.cages?.length) out.add("Killer cages");
  if (cosmetics.arrows?.length) out.add("Arrow constraints");
  if (cosmetics.dots?.length) {
    const hasBlack = cosmetics.dots.some((d) => d.kind === "black");
    const hasWhite = cosmetics.dots.some((d) => d.kind === "white");
    if (hasBlack && hasWhite) out.add("Black and white dots");
    else if (hasBlack) out.add("Black dots");
    else if (hasWhite) out.add("White dots");
  }

  if (cosmetics.thermolines?.length) out.add("Thermo lines");
  if (cosmetics.whispers?.length || cosmetics.germanwhispers?.length) out.add("Whisper lines");
  if (cosmetics.palindromes?.length) out.add("Palindrome lines");
  if (cosmetics.renbanlines?.length) out.add("Renban lines");
  if (cosmetics.entropics?.length) out.add("Entropic lines");
  if (cosmetics.modularlines?.length) out.add("Modular lines");

  if (hasBorderClues(cosmetics.skyscraper)) out.add("Skyscraper clues");
  if (hasBorderClues(cosmetics.sandwich)) out.add("Sandwich clues");
  if (hasBorderClues(cosmetics.xsum)) out.add("X-sum clues");
  if (cosmetics.littlekillers?.length) out.add("Little killer clues");

  if (cosmetics.irregularRegions?.length) out.add("Irregular regions");
  if (cosmetics.disjointGroups?.length) out.add("Disjoint groups");

  if (cosmetics.antiKnight) out.add("Anti-knight");
  if (cosmetics.antiKing) out.add("Anti-king");
  if (cosmetics.antiRook) out.add("Anti-rook");

  if ((cosmetics.fogLights?.length ?? 0) > 0 || (cosmetics.fogTriggerEffects?.length ?? 0) > 0) {
    out.add("Fog of war");
  }

  const rules = (def.meta?.rules ?? "").toLowerCase();
  const keywordMap: Array<[RegExp, string]> = [
    [/\bthermo\b/, "Thermo lines"],
    [/\bwhisper\b/, "Whisper lines"],
    [/\brenban\b/, "Renban lines"],
    [/\bpalindrome\b/, "Palindrome lines"],
    [/\barrow\b/, "Arrow constraints"],
    [/\bkiller\b/, "Killer cages"],
    [/\bsandwich\b/, "Sandwich clues"],
    [/\bx\s*-?\s*sum\b/, "X-sum clues"],
    [/\bskyscraper\b/, "Skyscraper clues"],
    [/\blittle\s*killer\b/, "Little killer clues"],
    [/\banti\s*-?\s*knight\b/, "Anti-knight"],
    [/\banti\s*-?\s*king\b/, "Anti-king"],
    [/\banti\s*-?\s*rook\b/, "Anti-rook"],
    [/\bfog\b/, "Fog of war"],
    [/\bentropic\b|\bentropy\b/, "Entropic lines"],
  ];
  for (const [pattern, label] of keywordMap) {
    if (pattern.test(rules)) out.add(label);
  }

  if (!out.size) return ["Normal Sudoku rules only"];
  return Array.from(out);
}

export function MainMenu() {
  const nav = useNavigate();
  const location = useLocation();
  const initialFilterPrefs = useMemo(readInitialMainMenuFilterPrefs, []);
  const initialFolderPrefs = useMemo(readInitialFolderMenuPrefs, []);
  const appliedReturnStateRef = useRef(false);

  const [rows, setRows] = useState<StoredPuzzle[]>([]);
  const [folders, setFolders] = useState<PuzzleFolder[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialFilterPrefs.sortOrder);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialFilterPrefs.sortDirection);
  const [filterStatusList, setFilterStatusList] = useState<FilterStatus[]>(initialFilterPrefs.filterStatusList);
  const [query, setQuery] = useState(initialFilterPrefs.query);
  const [searchField, setSearchField] = useState<MainMenuSearchField>(initialFilterPrefs.searchField);
  const [authorFilters, setAuthorFilters] = useState<string[]>(initialFilterPrefs.authorFilters);
  const [collectionFilters, setCollectionFilters] = useState<string[]>(initialFilterPrefs.collectionFilters);
  const [constraintFilters, setConstraintFilters] = useState<string[]>(initialFilterPrefs.constraintFilters);
  const [authorFilterQuery, setAuthorFilterQuery] = useState("");
  const [collectionFilterQuery, setCollectionFilterQuery] = useState("");
  const [constraintFilterQuery, setConstraintFilterQuery] = useState("");
  const [mobileFilters, setMobileFilters] = useState(() => typeof window !== "undefined" && window.matchMedia(MOBILE_FILTER_MEDIA_QUERY).matches);
  const deferredQuery = useDeferredValue(query);

  const [foldersOpen, setFoldersOpen] = useState(false);
  const [folderSortOrder, setFolderSortOrder] = useState<SortOrder>(initialFolderPrefs.sortOrder);
  const [folderSortDirection, setFolderSortDirection] = useState<SortDirection>(initialFolderPrefs.sortDirection);
  const [folderFilterStatus, setFolderFilterStatus] = useState<FolderFilterStatus>(initialFolderPrefs.filterStatus);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [initialFoldersLoaded, setInitialFoldersLoaded] = useState(false);
  const [folderCreateDialogOpen, setFolderCreateDialogOpen] = useState(false);
  const [folderCreateContext, setFolderCreateContext] = useState<"folders" | "add-dialog">("folders");
  const [folderCreateName, setFolderCreateName] = useState("");
  const [folderCreateBusy, setFolderCreateBusy] = useState("");
  const [, setFolderPuzzleMenu] = useState<{ folderId: string; puzzleKey: string } | null>(null);
  const [folderActionBusyKey, setFolderActionBusyKey] = useState<string | null>(null);

  const [deleteCandidate, setDeleteCandidate] = useState<StoredPuzzle | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [, setMainPuzzleMenuKey] = useState<string | null>(null);
  const [, setMainPuzzleStatusMenuKey] = useState<string | null>(null);

  const [addToFolderPuzzle, setAddToFolderPuzzle] = useState<StoredPuzzle | null>(null);
  const [addFolderNavId, setAddFolderNavId] = useState<string | null>(null);
  const [addToFolderBusy, setAddToFolderBusy] = useState("");

  async function refreshPuzzles() {
    setRows(await listPuzzles());
  }

  async function refreshFolders() {
    setFolders(await listFolders());
    setInitialFoldersLoaded(true);
  }

  useEffect(() => {
    void refreshPuzzles();
    void refreshFolders();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(MOBILE_FILTER_MEDIA_QUERY);
    const onChange = () => setMobileFilters(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setSyncedLocalStorageItem(
      MAIN_MENU_FILTER_PREFS_KEY,
      JSON.stringify({
        sortOrder,
        sortDirection,
        filterStatusList,
        query,
        searchField,
        authorFilters,
        collectionFilters,
        constraintFilters,
      } satisfies MainMenuFilterPrefs),
    );
  }, [sortOrder, sortDirection, filterStatusList, query, searchField, authorFilters, collectionFilters, constraintFilters]);

  useEffect(() => {
    setSyncedLocalStorageItem(
      FOLDER_MENU_PREFS_KEY,
      JSON.stringify({ sortOrder: folderSortOrder, sortDirection: folderSortDirection, filterStatus: folderFilterStatus } satisfies FolderMenuPrefs),
    );
  }, [folderSortOrder, folderSortDirection, folderFilterStatus]);

  useEffect(() => {
    if (!initialFoldersLoaded) return;
    if (activeFolderId && !folders.some((folder) => folder.id === activeFolderId)) {
      setActiveFolderId(null);
    }
  }, [activeFolderId, folders, initialFoldersLoaded]);

  useEffect(() => {
    if (addFolderNavId && !folders.some((folder) => folder.id === addFolderNavId)) {
      setAddFolderNavId(null);
    }
  }, [addFolderNavId, folders]);

  useEffect(() => {
    setFolderPuzzleMenu(null);
  }, [activeFolderId, foldersOpen]);

  useEffect(() => {
    if (appliedReturnStateRef.current) return;
    const returned = readPuzzleReturnState(location.state);
    if (!returned || returned.page !== "main-menu") return;

    appliedReturnStateRef.current = true;
    const foldersOpenTarget = Boolean(returned.context?.foldersOpen);
    const activeFolderIdTarget = returned.context?.activeFolderId ?? null;
    
    console.log(
      "[MainMenu] Restoring state:",
      `foldersOpen=${foldersOpenTarget}`,
      `activeFolderId=${activeFolderIdTarget}`
    );
    
    setFoldersOpen(foldersOpenTarget);
    setActiveFolderId(activeFolderIdTarget);
    restoreWindowScroll(returned.scrollY);
    clearReturnStateFromHistory();
  }, [location.state]);

  const folderById = useMemo(() => {
    return new Map(folders.map((folder) => [folder.id, folder]));
  }, [folders]);

  const puzzleByKey = useMemo(() => {
    return new Map(rows.map((row) => [row.key, row]));
  }, [rows]);

  const constraintBulletsByPuzzle = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const row of rows) {
      out.set(row.key, extractConstraintBullets(row.def));
    }
    return out;
  }, [rows]);

  const authors = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => puzzleAuthors(row)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const collections = useMemo(
    () => Array.from(new Set(rows.map((row) => puzzleCollection(row)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const constraintOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => constraintBulletsByPuzzle.get(row.key) ?? []).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows, constraintBulletsByPuzzle],
  );

  const filteredAuthorOptions = useMemo(() => {
    const q = clean(authorFilterQuery).toLowerCase();
    const matched = q ? authors.filter((value) => value.toLowerCase().includes(q)) : authors;
    return orderSelectedFirst(matched, authorFilters);
  }, [authors, authorFilterQuery, authorFilters]);

  const filteredCollectionOptions = useMemo(() => {
    const q = clean(collectionFilterQuery).toLowerCase();
    const matched = q ? collections.filter((value) => value.toLowerCase().includes(q)) : collections;
    return orderSelectedFirst(matched, collectionFilters);
  }, [collections, collectionFilterQuery, collectionFilters]);

  const filteredConstraintOptions = useMemo(() => {
    const q = clean(constraintFilterQuery).toLowerCase();
    const matched = q ? constraintOptions.filter((value) => value.toLowerCase().includes(q)) : constraintOptions;
    return orderSelectedFirst(matched, constraintFilters);
  }, [constraintOptions, constraintFilterQuery, constraintFilters]);

  const authorOptionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const queryLower = clean(deferredQuery).toLowerCase();

    for (const row of rows) {
      const rowConstraints = constraintBulletsByPuzzle.get(row.key) ?? [];
      const rowCollection = puzzleCollection(row);
      if (collectionFilters.length && !collectionFilters.includes(rowCollection)) continue;
      if (constraintFilters.length && !constraintFilters.every((selectedConstraint) => rowConstraints.includes(selectedConstraint))) continue;
      if (!matchesMainMenuSearch(row, rowConstraints, searchField, queryLower)) continue;
      incrementCountMap(counts, puzzleAuthors(row));
    }

    return counts;
  }, [rows, constraintBulletsByPuzzle, collectionFilters, constraintFilters, deferredQuery, searchField]);

  const collectionOptionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const queryLower = clean(deferredQuery).toLowerCase();

    for (const row of rows) {
      const rowConstraints = constraintBulletsByPuzzle.get(row.key) ?? [];
      const rowAuthors = puzzleAuthors(row);
      if (authorFilters.length && !authorFilters.some((selectedAuthor) => rowAuthors.includes(selectedAuthor))) continue;
      if (constraintFilters.length && !constraintFilters.every((selectedConstraint) => rowConstraints.includes(selectedConstraint))) continue;
      if (!matchesMainMenuSearch(row, rowConstraints, searchField, queryLower)) continue;
      incrementCountMap(counts, [puzzleCollection(row)]);
    }

    return counts;
  }, [rows, constraintBulletsByPuzzle, authorFilters, constraintFilters, deferredQuery, searchField]);

  const constraintOptionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const queryLower = clean(deferredQuery).toLowerCase();

    for (const row of rows) {
      const rowAuthors = puzzleAuthors(row);
      const rowCollection = puzzleCollection(row);
      if (authorFilters.length && !authorFilters.some((selectedAuthor) => rowAuthors.includes(selectedAuthor))) continue;
      if (collectionFilters.length && !collectionFilters.includes(rowCollection)) continue;
      const rowConstraints = constraintBulletsByPuzzle.get(row.key) ?? [];
      if (!matchesMainMenuSearch(row, rowConstraints, searchField, queryLower)) continue;
      incrementCountMap(counts, rowConstraints);
    }

    return counts;
  }, [rows, constraintBulletsByPuzzle, authorFilters, collectionFilters, deferredQuery, searchField]);

  const authorFilterOptions = useMemo(() => {
    return filteredAuthorOptions.map((value) => ({
      value,
      label: value,
      count: authorOptionCounts.get(value) ?? 0,
    } satisfies SelectControlOption));
  }, [filteredAuthorOptions, authorOptionCounts]);

  const collectionFilterOptions = useMemo(() => {
    return filteredCollectionOptions.map((value) => ({
      value,
      label: value,
      count: collectionOptionCounts.get(value) ?? 0,
    } satisfies SelectControlOption));
  }, [filteredCollectionOptions, collectionOptionCounts]);

  const constraintFilterOptions = useMemo(() => {
    return filteredConstraintOptions.map((value) => ({
      value,
      label: value,
      count: constraintOptionCounts.get(value) ?? 0,
    } satisfies SelectControlOption));
  }, [filteredConstraintOptions, constraintOptionCounts]);

  useEffect(() => {
    if (!rows.length) return;

    setAuthorFilters((current) => {
      if (!current.length) return current;
      const valid = new Set(authors);
      const next = current.filter((value) => valid.has(value));
      return next.length === current.length ? current : next;
    });
    setCollectionFilters((current) => {
      if (!current.length) return current;
      const valid = new Set(collections);
      const next = current.filter((value) => valid.has(value));
      return next.length === current.length ? current : next;
    });
    setConstraintFilters((current) => {
      if (!current.length) return current;
      const valid = new Set(constraintOptions);
      const next = current.filter((value) => valid.has(value));
      return next.length === current.length ? current : next;
    });
  }, [rows, authors, collections, constraintOptions]);

  const rowsMatchingSearchFilters = useMemo(() => {
    const queryLower = clean(deferredQuery).toLowerCase();

    return rows.filter((row) => {
      const rowAuthors = puzzleAuthors(row);
      const rowCollection = puzzleCollection(row);
      const rowConstraints = constraintBulletsByPuzzle.get(row.key) ?? [];

      if (authorFilters.length && !authorFilters.some((selectedAuthor) => rowAuthors.includes(selectedAuthor))) return false;
      if (collectionFilters.length && !collectionFilters.includes(rowCollection)) return false;

      if (constraintFilters.length) {
        const hasAllConstraints = constraintFilters.every((selectedConstraint) => rowConstraints.includes(selectedConstraint));
        if (!hasAllConstraints) return false;
      }

      if (!matchesMainMenuSearch(row, rowConstraints, searchField, queryLower)) return false;
      return true;
    });
  }, [rows, deferredQuery, searchField, authorFilters, collectionFilters, constraintFilters, constraintBulletsByPuzzle]);

  const displayRows = useMemo(() => {
    return sortPuzzles(
      rowsMatchingSearchFilters.filter((row) => matchesStatusList(row, filterStatusList)),
      sortOrder,
      sortDirection,
    );
  }, [rowsMatchingSearchFilters, sortOrder, sortDirection, filterStatusList]);

  const hasMainMenuSearchFilters =
    !!clean(query) ||
    searchField !== "any" ||
    authorFilters.length > 0 ||
    collectionFilters.length > 0 ||
    constraintFilters.length > 0 ||
    filterStatusList.length > 0;

  const statusCounts = useMemo(() => {
    const counts: Record<PuzzlePlayStatus, number> = {
      not_started: 0,
      in_progress: 0,
      complete: 0,
    };

    for (const row of rowsMatchingSearchFilters) {
      counts[puzzleStatus(row)] += 1;
    }
    return counts;
  }, [rowsMatchingSearchFilters]);

  const folderChildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of folders) {
      if (!folder.parentId) continue;
      counts.set(folder.parentId, (counts.get(folder.parentId) ?? 0) + 1);
    }
    return counts;
  }, [folders]);

  const activeFolder = activeFolderId ? folderById.get(activeFolderId) ?? null : null;
  const addFolderNav = addFolderNavId ? folderById.get(addFolderNavId) ?? null : null;
  const folderCreateParentId = folderCreateContext === "add-dialog" ? addFolderNavId : activeFolderId;
  const folderCreateParent = folderCreateParentId ? folderById.get(folderCreateParentId) ?? null : null;

  const activeFolderTrail = useMemo(() => {
    const out: PuzzleFolder[] = [];
    if (!activeFolderId) return out;

    const seen = new Set<string>();
    let cursor: PuzzleFolder | null = folderById.get(activeFolderId) ?? null;
    while (cursor && !seen.has(cursor.id)) {
      out.unshift(cursor);
      seen.add(cursor.id);
      cursor = cursor.parentId ? folderById.get(cursor.parentId) ?? null : null;
    }

    return out;
  }, [activeFolderId, folderById]);

  const addFolderTrail = useMemo(() => {
    const out: PuzzleFolder[] = [];
    if (!addFolderNavId) return out;

    const seen = new Set<string>();
    let cursor: PuzzleFolder | null = folderById.get(addFolderNavId) ?? null;
    while (cursor && !seen.has(cursor.id)) {
      out.unshift(cursor);
      seen.add(cursor.id);
      cursor = cursor.parentId ? folderById.get(cursor.parentId) ?? null : null;
    }

    return out;
  }, [addFolderNavId, folderById]);

  const visibleChildFolders = useMemo(() => {
    return sortFolders(
      folders.filter((folder) => (folder.parentId ?? null) === activeFolderId),
      folderSortOrder,
      folderSortDirection,
    );
  }, [folders, activeFolderId, folderSortOrder, folderSortDirection]);

  const activeFolderResolvedPuzzles = useMemo(() => {
    if (!activeFolder) return [];

    return activeFolder.puzzleKeys
      .map((key) => puzzleByKey.get(key))
      .filter((row): row is StoredPuzzle => Boolean(row));
  }, [activeFolder, puzzleByKey]);

  const folderStatusCounts = useMemo(() => {
    const counts: Record<FolderFilterStatus, number> = {
      all: activeFolderResolvedPuzzles.length,
      not_started: 0,
      in_progress: 0,
      complete: 0,
    };

    for (const row of activeFolderResolvedPuzzles) {
      counts[puzzleStatus(row)] += 1;
    }

    return counts;
  }, [activeFolderResolvedPuzzles]);

  const folderFilterOptions = useMemo(() => {
    return [
      { value: "all", label: "All", count: folderStatusCounts.all },
      { value: "not_started", label: "Not Started", count: folderStatusCounts.not_started },
      { value: "in_progress", label: "In Progress", count: folderStatusCounts.in_progress },
      { value: "complete", label: "Complete", count: folderStatusCounts.complete },
    ] satisfies SelectControlOption[];
  }, [folderStatusCounts]);

  const visibleFolderPuzzles = useMemo(() => {
    return sortPuzzles(
      activeFolderResolvedPuzzles.filter((row) => matchesStatusList(row, folderFilterStatus === "all" ? [] : [folderFilterStatus])),
      folderSortOrder,
      folderSortDirection,
    );
  }, [activeFolderResolvedPuzzles, folderFilterStatus, folderSortOrder, folderSortDirection]);

  const addDialogChildFolders = useMemo(() => {
    return sortFolders(
      folders.filter((folder) => (folder.parentId ?? null) === addFolderNavId),
      "az",
      "asc",
    );
  }, [folders, addFolderNavId]);

  const selectedPuzzleFolderIds = useMemo(() => {
    const ids = new Set<string>();
    if (!addToFolderPuzzle) return ids;

    for (const folder of folders) {
      if (folder.puzzleKeys.includes(addToFolderPuzzle.key)) ids.add(folder.id);
    }

    return ids;
  }, [addToFolderPuzzle, folders]);

  const canAddToCurrentFolder = Boolean(addFolderNav);
  const isCurrentFolderAlreadyAdded = addFolderNav ? selectedPuzzleFolderIds.has(addFolderNav.id) : false;

  async function onConfirmDeletePuzzle() {
    if (!deleteCandidate || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deletePuzzle(deleteCandidate.key);
      await refreshPuzzles();
      await refreshFolders();
      setDeleteCandidate(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setDeleteBusy(false);
    }
  }

  function openPuzzle(key: string) {
    const scrollY = readCurrentScrollPosition();
    console.log(
      "[MainMenu] Capturing origin state for puzzle:",
      `key=${key}`,
      `foldersOpen=${foldersOpen}`,
      `activeFolderId=${activeFolderId}`,
      `scrollY=${scrollY}`
    );
    
    nav(`/p/${encodeURIComponent(key)}`, {
      state: withPuzzleOriginState(location.state, {
        version: 1,
        page: "main-menu",
        path: currentRoutePath(location.pathname, location.search, location.hash),
        scrollY,
        context: {
          foldersOpen,
          activeFolderId,
        },
      }),
    });
  }

  function sudokuPadUrlFor(row: StoredPuzzle): string | null {
    const source = (row.def?.sourceId ?? row.key).trim();
    if (!source) return null;
    if (/^https?:\/\//i.test(source)) return source;
    return `https://sudokupad.app/${encodeURI(source.replace(/^\/+/, ""))}`;
  }

  function onOpenPuzzleInSudokuPad(row: StoredPuzzle) {
    const url = sudokuPadUrlFor(row);
    if (!url) {
      alert("No SudokuPad source URL found for this puzzle.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setMainPuzzleMenuKey(null);
    setMainPuzzleStatusMenuKey(null);
  }

  async function onSetPuzzleStatus(row: StoredPuzzle, status: PuzzlePlayStatus) {
    const now = Date.now();
    const solvedProgress =
      status === "complete"
        ? fillProgressWithSolutionDigits(row.progress, row.def.cosmetics.solution)
        : row.progress;
    const nextProgress = {
      ...solvedProgress,
      status,
      startedAt: status === "not_started" ? undefined : (row.progress.startedAt ?? now),
      paused: status === "complete" ? false : solvedProgress.paused,
    };

    try {
      await upsertPuzzle(row.key, {
        def: row.def,
        progress: nextProgress,
        undo: row.undo,
        redo: row.redo,
        updatedAt: now,
        createdAt: row.createdAt,
      });
      await refreshPuzzles();
      await refreshFolders();
      setMainPuzzleStatusMenuKey(null);
      setMainPuzzleMenuKey(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    }
  }

  function onOpenAddToFolder(puzzle: StoredPuzzle) {
    setMainPuzzleMenuKey(null);
    setMainPuzzleStatusMenuKey(null);
    setAddToFolderPuzzle(puzzle);
    setAddFolderNavId(null);
    setAddToFolderBusy("");
    void refreshFolders();
  }

  async function onAddPuzzleToExistingFolder(folderId: string) {
    if (!addToFolderPuzzle) return;
    setAddToFolderBusy("Adding puzzle to folder...");
    try {
      await addPuzzleToFolder(folderId, addToFolderPuzzle.key);
      await refreshFolders();
      setAddToFolderPuzzle(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setAddToFolderBusy("");
    }
  }

  function openFolderCreateDialog(context: "folders" | "add-dialog") {
    if (folderCreateBusy) return;

    const parentId = context === "add-dialog" ? addFolderNavId : activeFolderId;
    const parent = parentId ? folderById.get(parentId) ?? null : null;
    const parentLabel = parent
      ? buildFolderPath(parent, folderById)
      : "Top-level folders";
    const input = window.prompt(`Create folder\nParent: ${parentLabel}\n\nFolder name:`);
    if (input == null) return;

    const folderName = input.trim();
    if (!folderName) {
      alert("Folder name cannot be empty.");
      return;
    }

    setFolderCreateContext(context);
    setFolderCreateBusy("Creating folder...");
    void (async () => {
      try {
        const created = await createFolder(folderName, parentId ?? null);
        await refreshFolders();
        if (context === "add-dialog") {
          setAddFolderNavId(created.id);
        } else {
          setActiveFolderId(created.id);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(msg);
      } finally {
        setFolderCreateBusy("");
      }
    })();
  }

  async function onDeletePuzzleWithConfirm(row: StoredPuzzle) {
    if (deleteBusy) return;
    const title = row.def?.meta?.title || "(untitled)";
    const shouldDelete = window.confirm(`Delete puzzle?\n\n${title}`);
    if (!shouldDelete) return;

    setDeleteBusy(true);
    try {
      await deletePuzzle(row.key);
      await refreshPuzzles();
      await refreshFolders();
      setDeleteCandidate(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onCreateFolder() {
    const folderName = folderCreateName.trim();
    if (!folderName || folderCreateBusy) return;

    setFolderCreateBusy("Creating folder...");
    try {
      const created = await createFolder(folderName, folderCreateParentId ?? null);
      await refreshFolders();
      setFolderCreateName("");
      setFolderCreateDialogOpen(false);
      if (folderCreateContext === "add-dialog") {
        setAddFolderNavId(created.id);
      } else {
        setActiveFolderId(created.id);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setFolderCreateBusy("");
    }
  }

  async function onRemovePuzzleFromFolder(folderId: string, puzzleKey: string) {
    if (folderActionBusyKey) return;
    setFolderActionBusyKey(puzzleKey);
    try {
      await removePuzzleFromFolder(folderId, puzzleKey);
      await refreshFolders();
      setFolderPuzzleMenu(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setFolderActionBusyKey(null);
    }
  }

  async function onMainPuzzleAction(
    row: StoredPuzzle,
    action: "add_to_folder" | "open_in_sudokupad" | "status_not_started" | "status_in_progress" | "status_complete" | "delete",
  ) {
    if (action === "add_to_folder") {
      onOpenAddToFolder(row);
      return;
    }
    if (action === "open_in_sudokupad") {
      onOpenPuzzleInSudokuPad(row);
      return;
    }
    if (action === "status_not_started") {
      await onSetPuzzleStatus(row, "not_started");
      return;
    }
    if (action === "status_in_progress") {
      await onSetPuzzleStatus(row, "in_progress");
      return;
    }
    if (action === "status_complete") {
      await onSetPuzzleStatus(row, "complete");
      return;
    }
    await onDeletePuzzleWithConfirm(row);
  }

  async function onFolderPuzzleAction(
    folderId: string,
    row: StoredPuzzle,
    action: "remove_from_folder" | "open_in_sudokupad" | "status_not_started" | "status_in_progress" | "status_complete" | "delete",
  ) {
    if (action === "remove_from_folder") {
      await onRemovePuzzleFromFolder(folderId, row.key);
      return;
    }
    if (action === "open_in_sudokupad") {
      onOpenPuzzleInSudokuPad(row);
      return;
    }
    if (action === "status_not_started") {
      await onSetPuzzleStatus(row, "not_started");
      return;
    }
    if (action === "status_in_progress") {
      await onSetPuzzleStatus(row, "in_progress");
      return;
    }
    if (action === "status_complete") {
      await onSetPuzzleStatus(row, "complete");
      return;
    }
    await onDeletePuzzleWithConfirm(row);
  }

  function onClearMainMenuFilters() {
    setQuery("");
    setSearchField("any");
    setAuthorFilters([]);
    setCollectionFilters([]);
    setConstraintFilters([]);
    setAuthorFilterQuery("");
    setCollectionFilterQuery("");
    setConstraintFilterQuery("");
    setFilterStatusList([]);
  }

  return (
    <div className="shell">
      <div className="topbar">
        <AppBrand />
        <div className="topbarModeTabs" role="tablist" aria-label="Main navigation">
          <button className="btn primary topbarModeTab" onClick={() => nav("/")} type="button">
            <IconHome />
            <span>Puzzles</span>
          </button>
          <button className="btn topbarModeTab" onClick={() => nav("/folders")} type="button">
            <IconFolder />
            <span>Folders</span>
          </button>
          <button className="btn topbarModeTab" onClick={() => nav("/archive")} type="button">
            <IconImport />
            <span>Import</span>
          </button>
        </div>
        <button className="btn topbarSettingsButton" onClick={() => setSettingsOpen(true)} title="Settings" type="button">
          <IconSettings />
        </button>
      </div>

      <div className="page">
        <div className="mainMenuWrap">
          <div className="card menuFilterPanelCard">
            <div className="archiveControls">
              <div className="row">
                <input
                  className="url"
                  placeholder="Search your puzzles..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />

                <SelectControl
                  className="btn menuControlSelect"
                  value={searchField}
                  onValueChange={(value) => {
                    if (isMainMenuSearchField(value)) setSearchField(value);
                  }}
                  options={MAIN_MENU_SEARCH_FIELD_OPTIONS}
                />
              </div>

              <div className="archiveFilterRow">
                {mobileFilters ? (
                  <>
                    <div className="archiveFilterControl is-mobile-popup">
                      <MobileMultiSelectFilter
                        label="Author"
                        searchPlaceholder="Search authors..."
                        searchQuery={authorFilterQuery}
                        onSearchQueryChange={setAuthorFilterQuery}
                        options={authorFilterOptions}
                        selectedValues={authorFilters}
                        onSelectedValuesChange={setAuthorFilters}
                        emptyText="No authors found"
                        summaryText={authorFilters.length ? `${authorFilters.length} selected` : "All"}
                      />
                    </div>
                    <div className="archiveFilterControl is-mobile-popup">
                      <MobileMultiSelectFilter
                        label="Collection"
                        searchPlaceholder="Search collections..."
                        searchQuery={collectionFilterQuery}
                        onSearchQueryChange={setCollectionFilterQuery}
                        options={collectionFilterOptions}
                        selectedValues={collectionFilters}
                        onSelectedValuesChange={setCollectionFilters}
                        emptyText="No collections found"
                        summaryText={collectionFilters.length ? `${collectionFilters.length} selected` : "All"}
                      />
                    </div>
                    <div className="archiveFilterControl is-mobile-popup">
                      <MobileMultiSelectFilter
                        label="Constraints"
                        searchPlaceholder="Search constraints..."
                        searchQuery={constraintFilterQuery}
                        onSearchQueryChange={setConstraintFilterQuery}
                        options={constraintFilterOptions}
                        selectedValues={constraintFilters}
                        onSelectedValuesChange={setConstraintFilters}
                        emptyText="No constraints found"
                        summaryText={constraintOptions.length
                          ? (constraintFilters.length ? `${constraintFilters.length} selected` : "All")
                          : "No constraints found"}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <label className="archiveFilterControl">
                      <span className="muted archiveFilterLabel">Author</span>
                      <input
                        className="url"
                        placeholder="Search authors..."
                        value={authorFilterQuery}
                        onChange={(event) => setAuthorFilterQuery(event.target.value)}
                        aria-label="Search author filter options"
                      />
                      <SelectControl
                        className="archiveConstraintSelect"
                        multiple
                        size={Math.min(8, Math.max(4, filteredAuthorOptions.length || 4))}
                        value={authorFilters}
                        onValuesChange={setAuthorFilters}
                        aria-label="Filter puzzles by author"
                        options={authorFilterOptions}
                      />
                      <span className="muted archiveFilterHint">
                        {authorFilters.length ? `${authorFilters.length} selected` : "All"}
                      </span>
                    </label>

                    <label className="archiveFilterControl">
                      <span className="muted archiveFilterLabel">Collection</span>
                      <input
                        className="url"
                        placeholder="Search collections..."
                        value={collectionFilterQuery}
                        onChange={(event) => setCollectionFilterQuery(event.target.value)}
                        aria-label="Search collection filter options"
                      />
                      <SelectControl
                        className="archiveConstraintSelect"
                        multiple
                        size={Math.min(8, Math.max(4, filteredCollectionOptions.length || 4))}
                        value={collectionFilters}
                        onValuesChange={setCollectionFilters}
                        aria-label="Filter puzzles by collection"
                        options={collectionFilterOptions}
                      />
                      <span className="muted archiveFilterHint">
                        {collectionFilters.length ? `${collectionFilters.length} selected` : "All"}
                      </span>
                    </label>

                    <label className="archiveFilterControl">
                      <span className="muted archiveFilterLabel">Constraints</span>
                      <input
                        className="url"
                        placeholder="Search constraints..."
                        value={constraintFilterQuery}
                        onChange={(event) => setConstraintFilterQuery(event.target.value)}
                        aria-label="Search constraint filter options"
                      />
                      <SelectControl
                        className="archiveConstraintSelect"
                        multiple
                        size={Math.min(8, Math.max(4, filteredConstraintOptions.length || 4))}
                        value={constraintFilters}
                        onValuesChange={setConstraintFilters}
                        aria-label="Filter puzzles by constraints"
                        options={constraintFilterOptions}
                      />
                      <span className="muted archiveFilterHint">
                        {constraintOptions.length
                          ? (constraintFilters.length ? `${constraintFilters.length} selected` : "All")
                          : "No constraints found"}
                      </span>
                    </label>
                  </>
                )}
              </div>

              <div className="archiveFilterActions">
                <button type="button" className="btn" onClick={onClearMainMenuFilters}>
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="menuSectionTitle">Your puzzles</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  {filterStatusList.length > 0
                    ? `${displayRows.length} of ${rowsMatchingSearchFilters.length}`
                    : hasMainMenuSearchFilters
                      ? `${displayRows.length} of ${rows.length}`
                      : `${rows.length} total`}
                </div>
              </div>
              <div className="sortControlGroup">
                <div className="sortSelectWrap">
                  <IconSort />
                  <SelectControl
                    className="btn menuControlSelect"
                    value={sortOrder}
                    onValueChange={(value) => setSortOrder(value as SortOrder)}
                    aria-label="Sort puzzles"
                    options={PUZZLE_SORT_OPTIONS}
                  />
                </div>
                <button
                  className="btn sortDirectionButton"
                  onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                  aria-label={sortDirection === "asc" ? "Sort ascending" : "Sort descending"}
                  title={sortDirection === "asc" ? "Ascending" : "Descending"}
                  type="button"
                >
                  {sortDirection === "asc" ? <IconSortAsc /> : <IconSortDesc />}
                </button>
              </div>
            </div>

            <div className="menuSecondaryControls">
              <div className="menuStatusTabs">
                {(["not_started", "in_progress", "complete"] as const).map((status) => (
                  <button
                    key={status}
                    className={`btn menuStatusTab ${filterStatusList.includes(status) ? "is-active" : ""}`}
                    onClick={() => setFilterStatusList((prev) =>
                      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
                    )}
                    type="button"
                  >
                    {statusLabel(status)} ({statusCounts[status]})
                  </button>
                ))}
              </div>
            </div>

            <div className="menuPuzzleList">
              {displayRows.map((row) => {
                const previewProgress = {
                  ...row.progress,
                  selection: [],
                  multiSelect: false,
                };
                const constraintBullets = constraintBulletsByPuzzle.get(row.key) ?? ["Normal Sudoku rules only"];
                return (
                  <div
                    key={row.key}
                    className="card menuPuzzleRow"
                    onClick={() => openPuzzle(row.key)}
                  >
                    <div className="menuPuzzleSummary">
                      <div className="menuPuzzleTitleWrap">
                        <div className="menuPuzzleTitle">{row.def?.meta?.title || "(untitled)"}</div>
                        {row.def?.meta?.author ? (
                          <div className="muted menuPuzzleAuthor">
                            {row.def.meta.author}
                          </div>
                        ) : null}
                        <ul className="menuPuzzleConstraintList">
                          {constraintBullets.map((constraint) => (
                            <li key={`${row.key}-${constraint}`}>{constraint}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="row menuPuzzleMeta">
                        <div>{fmtHMS(row.progress?.totalMillis ?? 0)}</div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {statusLabel(puzzleStatus(row))}
                        </div>
                      </div>
                    </div>

                    <div className="menuPuzzleDeleteStack">
                      <div className="menuPuzzlePreview" aria-hidden="true">
                        <GridCanvas
                          def={row.def}
                          progress={previewProgress}
                          onSelection={NOOP}
                          onLineStroke={NOOP}
                          onLineTapCell={NOOP}
                          onLineTapEdge={NOOP}
                          onDoubleCell={NOOP}
                          interactive={false}
                          previewMode
                        />
                      </div>

                      <div className="row menuPuzzleActions">
                        <PopupMenuButton
                          ariaLabel={`Options for ${row.def?.meta?.title || "puzzle"}`}
                          title="Puzzle options"
                          items={[
                            { label: "Add to folder", onSelect: () => void onMainPuzzleAction(row, "add_to_folder") },
                            { label: "Open in SudokuPad", onSelect: () => void onMainPuzzleAction(row, "open_in_sudokupad") },
                            {
                              label: "Set status",
                              submenu: [
                                { label: "Not started", onSelect: () => void onMainPuzzleAction(row, "status_not_started") },
                                { label: "In progress", onSelect: () => void onMainPuzzleAction(row, "status_in_progress") },
                                { label: "Complete", onSelect: () => void onMainPuzzleAction(row, "status_complete") },
                              ],
                            },
                            { label: "Delete", onSelect: () => void onMainPuzzleAction(row, "delete"), tone: "danger" },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {!displayRows.length ? (
                <div className="muted">
                  {rows.length && (filterStatusList.length > 0 || hasMainMenuSearchFilters)
                    ? "No puzzles match the current search/filter."
                    : "No puzzles loaded yet."}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {foldersOpen ? (
        <div className="overlayBackdrop foldersOverlayBackdrop" onClick={() => {
          setFolderPuzzleMenu(null);
          setFolderCreateDialogOpen(false);
          setFoldersOpen(false);
        }}>
          <div
            className="card foldersOverlayCard"
            role="dialog"
            aria-modal="true"
            aria-label="Folders"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
              <div className="menuSectionTitle">Folders</div>
              <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <button
                  className="btn primary"
                  onClick={() => openFolderCreateDialog("folders")}
                  type="button"
                >
                  New Folder
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setFolderCreateDialogOpen(false);
                    setFoldersOpen(false);
                  }}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <label className="menuControlLabel">
                <span className="muted" style={{ fontSize: 13 }}>Sort</span>
                <div className="sortControlGroup">
                  <SelectControl
                    className="btn menuControlSelect"
                    value={folderSortOrder}
                    onValueChange={(value) => setFolderSortOrder(value as SortOrder)}
                    options={FOLDER_SORT_OPTIONS}
                  />
                  <button
                    className="btn sortDirectionButton"
                    onClick={() => setFolderSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                    aria-label={folderSortDirection === "asc" ? "Sort ascending" : "Sort descending"}
                    title={folderSortDirection === "asc" ? "Ascending" : "Descending"}
                    type="button"
                  >
                    {folderSortDirection === "asc" ? <IconSortAsc /> : <IconSortDesc />}
                  </button>
                </div>
              </label>
              <label className="menuControlLabel">
                <span className="muted" style={{ fontSize: 13 }}>Filter</span>
                <SelectControl
                  className="btn menuControlSelect"
                  value={folderFilterStatus}
                  onValueChange={(value) => setFolderFilterStatus(value as FolderFilterStatus)}
                  searchable
                  searchPlaceholder="Search statuses..."
                  options={folderFilterOptions}
                />
              </label>
            </div>

            <div className="row folderBreadcrumbRow" style={{ marginTop: 10 }}>
              <button
                className={`btn ${activeFolderId === null ? "primary" : ""}`}
                onClick={() => setActiveFolderId(null)}
                type="button"
              >
                Top Level
              </button>
              {activeFolderTrail.map((folder) => (
                <button
                  key={folder.id}
                  className={`btn ${activeFolderId === folder.id ? "primary" : ""}`}
                  onClick={() => setActiveFolderId(folder.id)}
                  type="button"
                >
                  {folder.name}
                </button>
              ))}
            </div>

            <div className="foldersOverlayScroll">
              <div className="menuPuzzleList" style={{ marginTop: 0 }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {activeFolder ? buildFolderPath(activeFolder, folderById) : "Top-level folders"}
                </div>

                {visibleChildFolders.map((folder) => {
                  const childCount = folderChildCounts.get(folder.id) ?? 0;
                  const puzzleCount = folder.puzzleKeys.length;
                  return (
                    <button
                      key={folder.id}
                      className="card folderBrowserItem"
                      onClick={() => setActiveFolderId(folder.id)}
                      type="button"
                    >
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div className="row" style={{ gap: 6 }}>
                          <IconFolder />
                          <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{folder.name}</div>
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {puzzleCount} puzzle{puzzleCount === 1 ? "" : "s"} | {childCount} subfolder{childCount === 1 ? "" : "s"}
                      </div>
                    </button>
                  );
                })}

                {activeFolder ? (
                  <>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Puzzles in this folder</div>
                    {visibleFolderPuzzles.map((row) => {
                      const previewProgress = {
                        ...row.progress,
                        selection: [],
                        multiSelect: false,
                      };
                      const constraintBullets = constraintBulletsByPuzzle.get(row.key) ?? ["Normal Sudoku rules only"];
                      const menuBusy = folderActionBusyKey === row.key;

                      return (
                        <div
                          key={`${activeFolder.id}-${row.key}`}
                          className="card menuPuzzleRow"
                          onClick={() => openPuzzle(row.key)}
                        >
                          <div className="menuPuzzleSummary">
                            <div className="menuPuzzleTitleWrap">
                              <div className="menuPuzzleTitle">{row.def?.meta?.title || "(untitled)"}</div>
                              {row.def?.meta?.author ? (
                                <div className="muted menuPuzzleAuthor">
                                  {row.def.meta.author}
                                </div>
                              ) : null}
                              <ul className="menuPuzzleConstraintList">
                                {constraintBullets.map((constraint) => (
                                  <li key={`${row.key}-${constraint}`}>{constraint}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="row menuPuzzleMeta">
                              <div>{fmtHMS(row.progress?.totalMillis ?? 0)}</div>
                              <div className="muted" style={{ fontSize: 13 }}>
                                {statusLabel(puzzleStatus(row))}
                              </div>
                            </div>
                          </div>

                          <div className="menuPuzzleDeleteStack">
                            <div className="menuPuzzlePreview" aria-hidden="true">
                              <GridCanvas
                                def={row.def}
                                progress={previewProgress}
                                onSelection={NOOP}
                                onLineStroke={NOOP}
                                onLineTapCell={NOOP}
                                onLineTapEdge={NOOP}
                                onDoubleCell={NOOP}
                                interactive={false}
                                previewMode
                              />
                            </div>

                            <div className="row menuPuzzleActions">
                              <PopupMenuButton
                                ariaLabel={`Actions for ${row.def?.meta?.title || "puzzle"}`}
                                title="Puzzle actions"
                                disabled={menuBusy}
                                items={[
                                  { label: "Remove from folder", onSelect: () => void onFolderPuzzleAction(activeFolder.id, row, "remove_from_folder"), disabled: menuBusy },
                                  { label: "Open in SudokuPad", onSelect: () => void onFolderPuzzleAction(activeFolder.id, row, "open_in_sudokupad") },
                                  {
                                    label: "Set status",
                                    submenu: [
                                      { label: "Not started", onSelect: () => void onFolderPuzzleAction(activeFolder.id, row, "status_not_started") },
                                      { label: "In progress", onSelect: () => void onFolderPuzzleAction(activeFolder.id, row, "status_in_progress") },
                                      { label: "Complete", onSelect: () => void onFolderPuzzleAction(activeFolder.id, row, "status_complete") },
                                    ],
                                  },
                                  { label: "Delete", onSelect: () => void onFolderPuzzleAction(activeFolder.id, row, "delete"), tone: "danger", disabled: menuBusy },
                                ]}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!visibleFolderPuzzles.length ? (
                      <div className="muted" style={{ marginTop: 2 }}>
                        No puzzles in this folder match the current filter.
                      </div>
                    ) : null}
                  </>
                ) : null}
            </div>
          </div>
        </div>
        </div>
      ) : null}

      {folderCreateDialogOpen ? (
        <div
          className="overlayBackdrop folderCreateOverlayBackdrop"
          onClick={() => (!folderCreateBusy ? setFolderCreateDialogOpen(false) : null)}
        >
          <div
            className="card confirmDialogCard"
            role="dialog"
            aria-modal="true"
            aria-label="Create folder"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Create folder</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {folderCreateParent
                ? `Parent: ${buildFolderPath(folderCreateParent, folderById)}`
                : "Parent: Top-level folders"}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                className="url"
                placeholder="Folder name"
                value={folderCreateName}
                onChange={(event) => setFolderCreateName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button
                className="btn"
                onClick={() => setFolderCreateDialogOpen(false)}
                disabled={!!folderCreateBusy}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  void onCreateFolder();
                }}
                disabled={!folderCreateName.trim() || !!folderCreateBusy}
                type="button"
              >
                {folderCreateBusy ? "Creating..." : "New Folder"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addToFolderPuzzle ? (
        <div className="overlayBackdrop" onClick={() => setAddToFolderPuzzle(null)}>
          <div
            className="card folderPickerCard"
            role="dialog"
            aria-modal="true"
            aria-label="Add puzzle to folder"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="menuSectionTitle">Add to folder</div>
              <button className="btn" onClick={() => setAddToFolderPuzzle(null)} type="button">Close</button>
            </div>
            <div className="muted" style={{ marginTop: 4, overflowWrap: "anywhere" }}>
              {addToFolderPuzzle.def?.meta?.title || "(untitled)"}
            </div>

            <div className="row folderBreadcrumbRow folderBreadcrumbTrail" style={{ marginTop: 10 }}>
              {[{ id: null, name: "Top Level" }, ...addFolderTrail].map((folder, index) => (
                <Fragment key={`add-trail-${folder.id ?? "top-level"}`}>
                  {index > 0 ? <span className="folderBreadcrumbSeparator" aria-hidden="true">-&gt;</span> : null}
                  <button
                    className={`folderBreadcrumbLink ${addFolderNavId === folder.id ? "is-active" : ""}`}
                    onClick={() => setAddFolderNavId(folder.id)}
                    type="button"
                  >
                    {folder.name}
                  </button>
                </Fragment>
              ))}
            </div>

            <div className="addFolderDialogBody">
              <div className="row" style={{ justifyContent: "flex-end", alignItems: "center" }}>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button
                    className="btn"
                    onClick={() => openFolderCreateDialog("add-dialog")}
                    disabled={!!folderCreateBusy}
                    type="button"
                  >
                    New Folder
                  </button>
                </div>
              </div>

              <div className="menuPuzzleList addFolderNavigatorList" style={{ marginTop: 10 }}>
                {addDialogChildFolders.map((folder) => {
                  return (
                    <button
                      key={`add-folder-nav-${folder.id}`}
                      className="card folderBrowserItem"
                      onClick={() => setAddFolderNavId(folder.id)}
                      type="button"
                    >
                      <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
                        <IconFolder />
                        <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{folder.name}</div>
                      </div>
                    </button>
                  );
                })}
                {!addDialogChildFolders.length ? (
                  <div className="muted">No folders in this location.</div>
                ) : null}
              </div>

              <div className="muted addFolderBusyLine">{addToFolderBusy || "\u00A0"}</div>

              <div className="row addFolderDialogFooter">
                <button
                  className={`btn ${canAddToCurrentFolder && !isCurrentFolderAlreadyAdded ? "primary" : ""}`}
                  onClick={() => {
                    if (!addFolderNav) return;
                    void onAddPuzzleToExistingFolder(addFolderNav.id);
                  }}
                  disabled={!canAddToCurrentFolder || isCurrentFolderAlreadyAdded || !!addToFolderBusy}
                  type="button"
                >
                  {isCurrentFolderAlreadyAdded
                    ? "Already Added"
                    : addToFolderBusy
                      ? "Adding..."
                      : "Add Here"}
                </button>
              </div>
            </div>
        </div>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div className="overlayBackdrop" onClick={() => (!deleteBusy ? setDeleteCandidate(null) : null)}>
          <div
            className="card confirmDialogCard"
            role="dialog"
            aria-modal="true"
            aria-label="Delete puzzle"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Delete puzzle?</div>
            <div style={{ marginTop: 8 }}>Are you sure you want to delete this puzzle?</div>
            <div className="muted" style={{ marginTop: 6, overflowWrap: "anywhere" }}>
              {deleteCandidate.def?.meta?.title || "(untitled)"}
            </div>

            <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setDeleteCandidate(null)} disabled={deleteBusy} type="button">
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  void onConfirmDeletePuzzle();
                }}
                disabled={deleteBusy}
                type="button"
              >
                {deleteBusy ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
