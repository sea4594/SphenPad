import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
import { fmtHMS } from "../core/time";
import { firebaseEnabled, googleLogin, googleLogout } from "../firebase/client";
import { GridCanvas } from "./GridCanvas";
import { AppBrand } from "./AppBrand";
import { IconFolder, IconHome, IconImport, IconSettings } from "./icons";
import { SelectControl } from "./SelectControl";
import { SettingsOverlay } from "./SettingsOverlay";
import {
  clearReturnStateFromHistory,
  currentRoutePath,
  readCurrentScrollPosition,
  readPuzzleReturnState,
  restoreWindowScroll,
  withPuzzleOriginState,
} from "./puzzleNavState";

type SortOrder = "recent" | "az";
type FilterStatus = "all" | "not_started" | "in_progress" | "complete";
type PuzzlePlayStatus = Exclude<FilterStatus, "all">;
type MainMenuSearchField = "any" | "title" | "constraints" | "author" | "collection";
type StoredPuzzle = Awaited<ReturnType<typeof listPuzzles>>[number];

type MainMenuFilterPrefs = {
  sortOrder: SortOrder;
  filterStatus: FilterStatus;
  query: string;
  searchField: MainMenuSearchField;
  authorFilter: string;
  collectionFilter: string;
  constraintFilters: string[];
};

type FolderMenuPrefs = {
  sortOrder: SortOrder;
  filterStatus: FilterStatus;
};

const MAIN_MENU_FILTER_PREFS_KEY = "sphenpad-main-menu-filters-v1";
const FOLDER_MENU_PREFS_KEY = "sphenpad-folder-menu-filters-v1";
const MAIN_MENU_SEARCH_FIELDS = new Set<MainMenuSearchField>(["any", "title", "constraints", "author", "collection"]);

const DEFAULT_MAIN_MENU_FILTER_PREFS: MainMenuFilterPrefs = {
  sortOrder: "recent",
  filterStatus: "all",
  query: "",
  searchField: "any",
  authorFilter: "all",
  collectionFilter: "all",
  constraintFilters: [],
};

const NOOP = () => {};

function isSortOrder(value: string): value is SortOrder {
  return value === "recent" || value === "az";
}

function isFilterStatus(value: string): value is FilterStatus {
  return value === "all" || value === "not_started" || value === "in_progress" || value === "complete";
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
      filterStatus?: string;
      query?: string;
      searchField?: string;
      authorFilter?: string;
      collectionFilter?: string;
      constraintFilters?: string[];
    };
    const parsedSortOrder = parsed.sortOrder;
    const parsedFilterStatus = parsed.filterStatus;
    const parsedSearchField = parsed.searchField;

    return {
      sortOrder: typeof parsedSortOrder === "string" && isSortOrder(parsedSortOrder)
        ? parsedSortOrder
        : DEFAULT_MAIN_MENU_FILTER_PREFS.sortOrder,
      filterStatus: typeof parsedFilterStatus === "string" && isFilterStatus(parsedFilterStatus)
        ? parsedFilterStatus
        : DEFAULT_MAIN_MENU_FILTER_PREFS.filterStatus,
      query: typeof parsed.query === "string" ? parsed.query : DEFAULT_MAIN_MENU_FILTER_PREFS.query,
      searchField: typeof parsedSearchField === "string" && isMainMenuSearchField(parsedSearchField)
        ? parsedSearchField
        : DEFAULT_MAIN_MENU_FILTER_PREFS.searchField,
      authorFilter: typeof parsed.authorFilter === "string"
        ? parsed.authorFilter
        : DEFAULT_MAIN_MENU_FILTER_PREFS.authorFilter,
      collectionFilter: typeof parsed.collectionFilter === "string"
        ? parsed.collectionFilter
        : DEFAULT_MAIN_MENU_FILTER_PREFS.collectionFilter,
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
    if (!raw) return { sortOrder: "recent", filterStatus: "all" };

    const parsed = JSON.parse(raw) as {
      sortOrder?: string;
      filterStatus?: string;
    };
    const parsedSortOrder = parsed.sortOrder;
    const parsedFilterStatus = parsed.filterStatus;

    return {
      sortOrder: typeof parsedSortOrder === "string" && isSortOrder(parsedSortOrder) ? parsedSortOrder : "recent",
      filterStatus: typeof parsedFilterStatus === "string" && isFilterStatus(parsedFilterStatus) ? parsedFilterStatus : "all",
    };
  } catch {
    return { sortOrder: "recent", filterStatus: "all" };
  }
}

function puzzleStatus(row: StoredPuzzle): Exclude<FilterStatus, "all"> {
  const status = row.progress?.status ?? "not_started";
  if (status === "complete") return "complete";
  if (status === "in_progress") return "in_progress";
  return "not_started";
}

function statusLabel(status: FilterStatus): string {
  if (status === "not_started") return "Not Started";
  if (status === "in_progress") return "In Progress";
  if (status === "complete") return "Complete";
  return "All";
}

function matchesStatus(row: StoredPuzzle, status: FilterStatus): boolean {
  if (status === "all") return true;
  return puzzleStatus(row) === status;
}

function sortPuzzles(rows: StoredPuzzle[], sortOrder: SortOrder): StoredPuzzle[] {
  const next = [...rows];
  if (sortOrder === "recent") {
    next.sort((a, b) => b.updatedAt - a.updatedAt);
    return next;
  }

  next.sort((a, b) => {
    const ta = (a.def?.meta?.title ?? "").toLowerCase();
    const tb = (b.def?.meta?.title ?? "").toLowerCase();
    if (!ta && tb) return 1;
    if (ta && !tb) return -1;
    return ta.localeCompare(tb);
  });
  return next;
}

function sortFolders(rows: PuzzleFolder[], sortOrder: SortOrder): PuzzleFolder[] {
  const next = [...rows];
  if (sortOrder === "recent") {
    next.sort((a, b) => b.updatedAt - a.updatedAt);
    return next;
  }

  next.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return next;
}

function puzzleTitle(row: StoredPuzzle): string {
  return clean(row.def?.meta?.title);
}

function puzzleAuthor(row: StoredPuzzle): string {
  return clean(row.def?.meta?.author);
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
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(initialFilterPrefs.filterStatus);
  const [query, setQuery] = useState(initialFilterPrefs.query);
  const [searchField, setSearchField] = useState<MainMenuSearchField>(initialFilterPrefs.searchField);
  const [authorFilter, setAuthorFilter] = useState(initialFilterPrefs.authorFilter);
  const [collectionFilter, setCollectionFilter] = useState(initialFilterPrefs.collectionFilter);
  const [constraintFilters, setConstraintFilters] = useState<string[]>(initialFilterPrefs.constraintFilters);
  const deferredQuery = useDeferredValue(query);

  const [foldersOpen, setFoldersOpen] = useState(false);
  const [folderSortOrder, setFolderSortOrder] = useState<SortOrder>(initialFolderPrefs.sortOrder);
  const [folderFilterStatus, setFolderFilterStatus] = useState<FilterStatus>(initialFolderPrefs.filterStatus);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [folderCreateDialogOpen, setFolderCreateDialogOpen] = useState(false);
  const [folderCreateContext, setFolderCreateContext] = useState<"folders" | "add-dialog">("folders");
  const [folderCreateName, setFolderCreateName] = useState("");
  const [folderCreateBusy, setFolderCreateBusy] = useState("");
  const [folderPuzzleMenu, setFolderPuzzleMenu] = useState<{ folderId: string; puzzleKey: string } | null>(null);
  const [folderActionBusyKey, setFolderActionBusyKey] = useState<string | null>(null);

  const [deleteCandidate, setDeleteCandidate] = useState<StoredPuzzle | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [mainPuzzleMenuKey, setMainPuzzleMenuKey] = useState<string | null>(null);
  const [mainPuzzleStatusMenuKey, setMainPuzzleStatusMenuKey] = useState<string | null>(null);

  const [addToFolderPuzzle, setAddToFolderPuzzle] = useState<StoredPuzzle | null>(null);
  const [addFolderNavId, setAddFolderNavId] = useState<string | null>(null);
  const [addToFolderBusy, setAddToFolderBusy] = useState("");

  async function refreshPuzzles() {
    setRows(await listPuzzles());
  }

  async function refreshFolders() {
    setFolders(await listFolders());
  }

  useEffect(() => {
    void refreshPuzzles();
    void refreshFolders();
  }, []);

  useEffect(() => {
    localStorage.setItem(
      MAIN_MENU_FILTER_PREFS_KEY,
      JSON.stringify({
        sortOrder,
        filterStatus,
        query,
        searchField,
        authorFilter,
        collectionFilter,
        constraintFilters,
      } satisfies MainMenuFilterPrefs),
    );
  }, [sortOrder, filterStatus, query, searchField, authorFilter, collectionFilter, constraintFilters]);

  useEffect(() => {
    localStorage.setItem(
      FOLDER_MENU_PREFS_KEY,
      JSON.stringify({ sortOrder: folderSortOrder, filterStatus: folderFilterStatus } satisfies FolderMenuPrefs),
    );
  }, [folderSortOrder, folderFilterStatus]);

  useEffect(() => {
    if (activeFolderId && !folders.some((folder) => folder.id === activeFolderId)) {
      setActiveFolderId(null);
    }
  }, [activeFolderId, folders]);

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
    () => ["all", ...Array.from(new Set(rows.map((row) => puzzleAuthor(row)).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [rows],
  );

  const collections = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((row) => puzzleCollection(row)).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [rows],
  );

  const constraintOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => constraintBulletsByPuzzle.get(row.key) ?? []).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows, constraintBulletsByPuzzle],
  );

  useEffect(() => {
    if (!rows.length) return;

    setAuthorFilter((current) => (current === "all" || authors.includes(current) ? current : "all"));
    setCollectionFilter((current) => (current === "all" || collections.includes(current) ? current : "all"));
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
      const rowAuthor = puzzleAuthor(row);
      const rowCollection = puzzleCollection(row);
      const rowConstraints = constraintBulletsByPuzzle.get(row.key) ?? [];

      if (authorFilter !== "all" && rowAuthor !== authorFilter) return false;
      if (collectionFilter !== "all" && rowCollection !== collectionFilter) return false;

      if (constraintFilters.length) {
        const hasAllConstraints = constraintFilters.every((selectedConstraint) => rowConstraints.includes(selectedConstraint));
        if (!hasAllConstraints) return false;
      }

      if (!matchesMainMenuSearch(row, rowConstraints, searchField, queryLower)) return false;
      return true;
    });
  }, [rows, deferredQuery, searchField, authorFilter, collectionFilter, constraintFilters, constraintBulletsByPuzzle]);

  const displayRows = useMemo(() => {
    return sortPuzzles(
      rowsMatchingSearchFilters.filter((row) => matchesStatus(row, filterStatus)),
      sortOrder,
    );
  }, [rowsMatchingSearchFilters, sortOrder, filterStatus]);

  const hasMainMenuSearchFilters =
    !!clean(query) ||
    searchField !== "any" ||
    authorFilter !== "all" ||
    collectionFilter !== "all" ||
    constraintFilters.length > 0;

  const statusCounts = useMemo(() => {
    const counts: Record<FilterStatus, number> = {
      all: rowsMatchingSearchFilters.length,
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
    );
  }, [folders, activeFolderId, folderSortOrder]);

  const visibleFolderPuzzles = useMemo(() => {
    if (!activeFolder) return [];

    const resolved = activeFolder.puzzleKeys
      .map((key) => puzzleByKey.get(key))
      .filter((row): row is StoredPuzzle => Boolean(row));

    return sortPuzzles(
      resolved.filter((row) => matchesStatus(row, folderFilterStatus)),
      folderSortOrder,
    );
  }, [activeFolder, puzzleByKey, folderFilterStatus, folderSortOrder]);

  const addDialogChildFolders = useMemo(() => {
    return sortFolders(
      folders.filter((folder) => (folder.parentId ?? null) === addFolderNavId),
      "az",
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
    const nextProgress = {
      ...row.progress,
      status,
      startedAt: status === "not_started" ? undefined : (row.progress.startedAt ?? now),
      paused: status === "complete" ? false : row.progress.paused,
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
    setFolderCreateContext(context);
    setFolderCreateName("");
    setFolderCreateDialogOpen(true);
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

  function onClearMainMenuFilters() {
    setQuery("");
    setSearchField("any");
    setAuthorFilter("all");
    setCollectionFilter("all");
    setConstraintFilters([]);
    setFilterStatus("all");
  }

  function onConstraintMouseDown(event: MouseEvent<HTMLSelectElement>) {
    const target = event.target;
    if (!(target instanceof HTMLOptionElement)) return;
    event.preventDefault();
    const value = target.value;
    setConstraintFilters((current) => (
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value]
    ));
  }

  return (
    <div className="shell">
      <div className="topbar">
        <AppBrand />
        <div className="spacer" />
        <button className="btn" onClick={() => setSettingsOpen(true)} title="Settings" type="button">
          <IconSettings />
        </button>
        {firebaseEnabled ? (
          <div className="row">
            <button className="btn" onClick={() => googleLogin().catch((e) => alert(e.message))} type="button">Google login</button>
            <button className="btn" onClick={() => googleLogout().catch((e) => alert(e.message))} type="button">Logout</button>
          </div>
        ) : null}
      </div>

      <div className="page">
        <div className="mainMenuWrap">
          <div className="card">
            <div className="row menuModeTabs" style={{ marginTop: 2 }}>
              <button className="btn primary menuModeTab" onClick={() => nav("/")} type="button">
                <IconHome />
                <span>My Puzzles</span>
              </button>
              <button className="btn menuModeTab" onClick={() => nav("/folders")} type="button">
                <IconFolder />
                <span>Folders</span>
              </button>
              <button className="btn menuModeTab" onClick={() => nav("/archive")} type="button">
                <IconImport />
                <span>Import</span>
              </button>
            </div>
          </div>

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
                  onChange={(event) => {
                    const value = event.target.value;
                    if (isMainMenuSearchField(value)) setSearchField(value);
                  }}
                >
                  <option value="any">Search: Any field</option>
                  <option value="title">Title</option>
                  <option value="constraints">Constraints</option>
                  <option value="author">Author</option>
                  <option value="collection">Collection</option>
                </SelectControl>
              </div>

              <div className="archiveFilterRow">
                <label className="archiveFilterControl">
                  <span className="muted archiveFilterLabel">Author</span>
                  <SelectControl
                    className="btn menuControlSelect"
                    value={authorFilter}
                    onChange={(event) => setAuthorFilter(event.target.value)}
                  >
                    {authors.map((value) => (
                      <option key={value} value={value}>
                        {value === "all" ? "All" : value}
                      </option>
                    ))}
                  </SelectControl>
                </label>

                <label className="archiveFilterControl">
                  <span className="muted archiveFilterLabel">Collection</span>
                  <SelectControl
                    className="btn menuControlSelect"
                    value={collectionFilter}
                    onChange={(event) => setCollectionFilter(event.target.value)}
                  >
                    {collections.map((value) => (
                      <option key={value} value={value}>
                        {value === "all" ? "All" : value}
                      </option>
                    ))}
                  </SelectControl>
                </label>

                <label className="archiveFilterControl">
                  <span className="muted archiveFilterLabel">Constraints</span>
                  <SelectControl
                    className="archiveConstraintSelect"
                    multiple
                    size={Math.min(8, Math.max(4, constraintOptions.length || 4))}
                    value={constraintFilters}
                    onMouseDown={onConstraintMouseDown}
                    onChange={(event) => {
                      const nextSelected = Array.from(event.target.selectedOptions, (option) => option.value);
                      setConstraintFilters(nextSelected);
                    }}
                    aria-label="Filter puzzles by constraints"
                  >
                    {constraintOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </SelectControl>
                  <span className="muted archiveFilterHint">
                    {constraintOptions.length
                      ? (constraintFilters.length ? `${constraintFilters.length} selected` : "All")
                      : "No constraints found"}
                  </span>
                </label>
              </div>

              <div className="archiveFilterActions">
                <button type="button" className="btn" onClick={onClearMainMenuFilters}>
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="menuSectionTitle">Your puzzles</div>
              <div className="muted">
                {filterStatus !== "all"
                  ? `${displayRows.length} of ${rowsMatchingSearchFilters.length}`
                  : hasMainMenuSearchFilters
                    ? `${displayRows.length} of ${rows.length}`
                    : `${rows.length} total`}
              </div>
            </div>

            <div className="menuSecondaryControls">
              <div className="row" style={{ justifyContent: "flex-start", alignItems: "flex-end" }}>
                <SelectControl
                  className="btn menuControlSelect"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  aria-label="Sort puzzles"
                >
                  <option value="recent">Recent</option>
                  <option value="az">A - Z</option>
                </SelectControl>
              </div>

              <div className="menuStatusTabs">
                {(["all", "not_started", "in_progress", "complete"] as const).map((status) => (
                  <button
                    key={status}
                    className={`btn menuStatusTab ${filterStatus === status ? "is-active" : ""}`}
                    onClick={() => setFilterStatus(status)}
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
                const puzzlePlayStatus = puzzleStatus(row);

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
                        {mainPuzzleMenuKey === row.key ? (
                          <div
                            className="card menuPuzzleMoreMenu"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              className="btn menuPuzzleMoreItem"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenAddToFolder(row);
                              }}
                              type="button"
                            >
                              Add to folder
                            </button>
                            <button
                              className="btn menuPuzzleMoreItem"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenPuzzleInSudokuPad(row);
                              }}
                              type="button"
                            >
                              Open in SudokuPad
                            </button>

                            <button
                              className="btn menuPuzzleMoreItem"
                              onClick={(event) => {
                                event.stopPropagation();
                                setMainPuzzleStatusMenuKey((current) => (current === row.key ? null : row.key));
                              }}
                              type="button"
                            >
                              Set status
                            </button>

                            {mainPuzzleStatusMenuKey === row.key ? (
                              <div className="menuPuzzleStatusList">
                                <button
                                  className={`btn menuPuzzleMoreItem ${puzzlePlayStatus === "not_started" ? "primary" : ""}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void onSetPuzzleStatus(row, "not_started");
                                  }}
                                  type="button"
                                >
                                  Not Started
                                </button>
                                <button
                                  className={`btn menuPuzzleMoreItem ${puzzlePlayStatus === "in_progress" ? "primary" : ""}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void onSetPuzzleStatus(row, "in_progress");
                                  }}
                                  type="button"
                                >
                                  In Progress
                                </button>
                                <button
                                  className={`btn menuPuzzleMoreItem ${puzzlePlayStatus === "complete" ? "primary" : ""}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void onSetPuzzleStatus(row, "complete");
                                  }}
                                  type="button"
                                >
                                  Complete
                                </button>
                              </div>
                            ) : null}

                            <button
                              className="btn danger menuPuzzleMoreItem"
                              onClick={(event) => {
                                event.stopPropagation();
                                setMainPuzzleMenuKey(null);
                                setMainPuzzleStatusMenuKey(null);
                                setDeleteCandidate(row);
                              }}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}

                        <button
                          className="btn menuPuzzleWideButton menuPuzzleMoreButton"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMainPuzzleStatusMenuKey(null);
                            setMainPuzzleMenuKey((current) => (current === row.key ? null : row.key));
                          }}
                          title="Puzzle options"
                          aria-label={`Options for ${row.def?.meta?.title || "puzzle"}`}
                          type="button"
                        >
                          <span aria-hidden>...</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!displayRows.length ? (
                <div className="muted">
                  {rows.length && (filterStatus !== "all" || hasMainMenuSearchFilters)
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
                <SelectControl
                  className="btn menuControlSelect"
                  value={folderSortOrder}
                  onChange={(e) => setFolderSortOrder(e.target.value as SortOrder)}
                >
                  <option value="recent">Recent</option>
                  <option value="az">A - Z</option>
                </SelectControl>
              </label>
              <label className="menuControlLabel">
                <span className="muted" style={{ fontSize: 13 }}>Filter</span>
                <SelectControl
                  className="btn menuControlSelect"
                  value={folderFilterStatus}
                  onChange={(e) => setFolderFilterStatus(e.target.value as FilterStatus)}
                >
                  <option value="all">All</option>
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="complete">Complete</option>
                </SelectControl>
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
                      const menuOpen =
                        folderPuzzleMenu?.folderId === activeFolder.id && folderPuzzleMenu.puzzleKey === row.key;
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
                              <button
                                className="btn menuPuzzleIconButton menuPuzzleMoreButton"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setFolderPuzzleMenu((current) => {
                                    if (!current || current.folderId !== activeFolder.id || current.puzzleKey !== row.key) {
                                      return { folderId: activeFolder.id, puzzleKey: row.key };
                                    }
                                    return null;
                                  });
                                }}
                                title="Puzzle actions"
                                aria-label={`Actions for ${row.def?.meta?.title || "puzzle"}`}
                                type="button"
                              >
                                <span aria-hidden>...</span>
                              </button>

                              {menuOpen ? (
                                <div
                                  className="card menuPuzzleMoreMenu"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <button
                                    className="btn menuPuzzleMoreItem"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void onRemovePuzzleFromFolder(activeFolder.id, row.key);
                                    }}
                                    disabled={menuBusy}
                                    type="button"
                                  >
                                    Remove from folder
                                  </button>
                                  <button
                                    className="btn danger menuPuzzleMoreItem"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setFolderPuzzleMenu(null);
                                      setDeleteCandidate(row);
                                    }}
                                    disabled={menuBusy}
                                    type="button"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!visibleFolderPuzzles.length ? (
                      <div className="muted" style={{ marginTop: 2 }}>
                        {folderFilterStatus === "all"
                          ? "This folder has no puzzles yet."
                          : "No puzzles in this folder match the current filter."}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {!visibleChildFolders.length && !activeFolder ? (
                  <div className="muted">No folders yet. Use New Folder to get started.</div>
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
