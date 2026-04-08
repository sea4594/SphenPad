import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setSyncedLocalStorageItem } from "../core/localDataState";
import { onLocalAppSnapshotImported } from "../core/appState";
import { normalizePuzzleKey } from "../core/id";
import { type PuzzleDefinition } from "../core/model";
import { makeInitialProgress } from "../core/scl";
import { addPuzzleToFolder, createFolder, getPuzzle, listCompletedPuzzleKeys, listFolders, type PuzzleFolder, upsertPuzzle } from "../core/storage";
import { loadFromSudokuPad } from "../core/sudokupad";
import { AppBrand } from "./AppBrand";
import { GridCanvas } from "./GridCanvas";
import { IconFolder, IconHome, IconImport, IconPlay, IconSettings, IconSort, IconSortAsc, IconSortDesc } from "./icons";
import { MobileMultiSelectFilter } from "./MobileMultiSelectFilter";
import { SelectControl, type SelectControlOption } from "./SelectControl";
import { SettingsOverlay } from "./SettingsOverlay";
import {
  clearReturnStateFromHistory,
  currentRoutePath,
  readCurrentScrollPosition,
  readPuzzleReturnState,
  withPuzzleOriginState,
} from "./puzzleNavState";

type ArchiveEntry = {
  id: string;
  title: string;
  subTypeConstraints: string;
  videoTitle: string;
  videoLength: string;
  videoLengthSeconds: number | null;
  videoDate: string;
  videoDateTs: number | null;
  puzzleAuthor: string;
  videoHost: string;
  collection: string;
  videoType: string;
  sudokuPadUrl: string;
  youtubeUrl: string;
  sourceId: string;
  stableKey: string;
  cacheKey?: string;
};

type PreparedArchiveEntry = ArchiveEntry & {
  sourceKey: string;
  constraintTypes: string[];
  titleLower: string;
  constraintsLower: string;
  videoTitleLower: string;
  puzzleAuthorLower: string;
  videoHostLower: string;
  collectionLower: string;
  searchAnyLower: string;
};

type SearchField =
  | "any"
  | "title"
  | "constraints"
  | "video_title"
  | "author"
  | "host"
  | "collection";

type SortField = "title" | "video_length" | "date";
type SortDirection = "asc" | "desc";

type ArchiveFilterPrefs = {
  query: string;
  searchField: SearchField;
  sortField: SortField;
  sortDirection: SortDirection;
  hostFilters: string[];
  authorFilters: string[];
  collectionFilters: string[];
  constraintFilters: string[];
  minLength: string;
  maxLength: string;
};

const SEARCH_FIELDS = new Set<SearchField>([
  "any",
  "title",
  "constraints",
  "video_title",
  "author",
  "host",
  "collection",
]);

const SORT_FIELDS = new Set<SortField>(["title", "video_length", "date"]);
const ARCHIVE_SEARCH_FIELD_OPTIONS: SelectControlOption[] = [
  { value: "any", label: "Search: Any field" },
  { value: "title", label: "Title" },
  { value: "constraints", label: "Constraints" },
  { value: "video_title", label: "Video title" },
  { value: "author", label: "Puzzle author" },
  { value: "host", label: "Video host" },
  { value: "collection", label: "Collection" },
];
const ARCHIVE_SORT_OPTIONS: SelectControlOption[] = [
  { value: "date", label: "Video date" },
  { value: "title", label: "Puzzle title" },
  { value: "video_length", label: "Video length" },
];

const SUDOKUPAD_ICON_URL =
  "https://sudokupad.app/images/sudokupad_square_logo.png";

const YOUTUBE_ICON_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='1' y='4' width='22' height='16' rx='4' fill='%23ff0000'/%3E%3Cpolygon points='10,8 17,12 10,16' fill='white'/%3E%3C/svg%3E";

const COLLECTION_NONE_VALUE = "none";
const MOBILE_MEDIA_QUERY = "(max-width: 760px)";
const MOBILE_VISIBLE_ROWS_INITIAL = 100;
const MOBILE_VISIBLE_ROWS_STEP = 100;
const DESKTOP_VISIBLE_ROWS_INITIAL = 80;
const DESKTOP_VISIBLE_ROWS_STEP = 80;
const ARCHIVE_FILTER_PREFS_KEY = "sphenpad-archive-filters-v1";

const DEFAULT_ARCHIVE_FILTER_PREFS: ArchiveFilterPrefs = {
  query: "",
  searchField: "any",
  sortField: "date",
  sortDirection: "desc",
  hostFilters: [],
  authorFilters: [],
  collectionFilters: [],
  constraintFilters: [],
  minLength: "",
  maxLength: "",
};

function splitSemicolonValues(value: string): string[] {
  return clean(value)
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

function getRenderConfig() {
  const isMobile =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  if (isMobile) {
    return {
      compact: true,
      initialVisibleRows: MOBILE_VISIBLE_ROWS_INITIAL,
      visibleRowsStep: MOBILE_VISIBLE_ROWS_STEP,
    };
  }
  return {
    compact: false,
    initialVisibleRows: DESKTOP_VISIBLE_ROWS_INITIAL,
    visibleRowsStep: DESKTOP_VISIBLE_ROWS_STEP,
  };
}

function clean(v: string | undefined | null) {
  return (v ?? "").trim();
}

function parseMinutesToSeconds(text: string): number | null {
  const value = Number(clean(text));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 60);
}

function formatDurationHm(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "~";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function displayCollection(collection: string): string {
  const normalized = clean(collection);
  if (!normalized || normalized.toLowerCase() === COLLECTION_NONE_VALUE) return "";
  return normalized;
}

function splitConstraintTypes(value: string): string[] {
  return clean(value)
    .split(";")
    .map((part) => clean(part))
    .filter(Boolean);
}

function prepareArchiveEntry(entry: ArchiveEntry): PreparedArchiveEntry {
  const titleLower = clean(entry.title).toLowerCase();
  const constraintsLower = clean(entry.subTypeConstraints).toLowerCase();
  const videoTitleLower = clean(entry.videoTitle).toLowerCase();
  const puzzleAuthorLower = clean(entry.puzzleAuthor).toLowerCase();
  const videoHostLower = clean(entry.videoHost).toLowerCase();
  const collectionLower = clean(entry.collection).toLowerCase();
  const sourceId = clean(entry.sourceId);

  return {
    ...entry,
    sourceKey: sourceId ? normalizePuzzleKey(sourceId) : "",
    constraintTypes: splitConstraintTypes(entry.subTypeConstraints),
    titleLower,
    constraintsLower,
    videoTitleLower,
    puzzleAuthorLower,
    videoHostLower,
    collectionLower,
    searchAnyLower: [
      titleLower,
      constraintsLower,
      videoTitleLower,
      puzzleAuthorLower,
      videoHostLower,
      collectionLower,
    ].join(" "),
  };
}

function matchesSearch(entry: PreparedArchiveEntry, searchField: SearchField, queryLower: string): boolean {
  if (!queryLower) return true;
  if (searchField === "title") return entry.titleLower.includes(queryLower);
  if (searchField === "constraints") return entry.constraintsLower.includes(queryLower);
  if (searchField === "video_title") return entry.videoTitleLower.includes(queryLower);
  if (searchField === "author") return entry.puzzleAuthorLower.includes(queryLower);
  if (searchField === "host") return entry.videoHostLower.includes(queryLower);
  if (searchField === "collection") return entry.collectionLower.includes(queryLower);
  return entry.searchAnyLower.includes(queryLower);
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

async function waitForNextFrame(): Promise<void> {
  if (typeof window === "undefined") return;
  await new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    window.setTimeout(() => resolve(), 0);
  });
}

function isSearchField(value: string): value is SearchField {
  return SEARCH_FIELDS.has(value as SearchField);
}

function isSortField(value: string): value is SortField {
  return SORT_FIELDS.has(value as SortField);
}

function isSortDirection(value: string): value is SortDirection {
  return value === "asc" || value === "desc";
}

function readInitialArchiveFilterPrefs(): ArchiveFilterPrefs {
  try {
    const raw = localStorage.getItem(ARCHIVE_FILTER_PREFS_KEY);
    if (!raw) return DEFAULT_ARCHIVE_FILTER_PREFS;

    const parsed = JSON.parse(raw) as Partial<ArchiveFilterPrefs>;
    const legacy = parsed as {
      hostFilter?: string;
      authorFilter?: string;
      collectionFilter?: string;
    };

    const searchField = typeof parsed.searchField === "string" && isSearchField(parsed.searchField)
      ? parsed.searchField
      : DEFAULT_ARCHIVE_FILTER_PREFS.searchField;
    const sortField = typeof parsed.sortField === "string" && isSortField(parsed.sortField)
      ? parsed.sortField
      : DEFAULT_ARCHIVE_FILTER_PREFS.sortField;
    const sortDirection = typeof parsed.sortDirection === "string" && isSortDirection(parsed.sortDirection)
      ? parsed.sortDirection
      : DEFAULT_ARCHIVE_FILTER_PREFS.sortDirection;

    return {
      query: typeof parsed.query === "string" ? parsed.query : DEFAULT_ARCHIVE_FILTER_PREFS.query,
      searchField,
      sortField,
      sortDirection,
      hostFilters: Array.isArray(parsed.hostFilters)
        ? parsed.hostFilters.filter((value): value is string => typeof value === "string").map((value) => clean(value)).filter(Boolean)
        : (typeof legacy.hostFilter === "string" && clean(legacy.hostFilter).toLowerCase() !== "all"
          ? [clean(legacy.hostFilter)]
          : DEFAULT_ARCHIVE_FILTER_PREFS.hostFilters),
      authorFilters: Array.isArray(parsed.authorFilters)
        ? parsed.authorFilters.filter((value): value is string => typeof value === "string").map((value) => clean(value)).filter(Boolean)
        : (typeof legacy.authorFilter === "string" && clean(legacy.authorFilter).toLowerCase() !== "all"
          ? [clean(legacy.authorFilter)]
          : DEFAULT_ARCHIVE_FILTER_PREFS.authorFilters),
      collectionFilters: Array.isArray(parsed.collectionFilters)
        ? parsed.collectionFilters.filter((value): value is string => typeof value === "string").map((value) => clean(value)).filter(Boolean)
        : (typeof legacy.collectionFilter === "string" && clean(legacy.collectionFilter).toLowerCase() !== "all"
          ? [clean(legacy.collectionFilter)]
          : DEFAULT_ARCHIVE_FILTER_PREFS.collectionFilters),
      constraintFilters: Array.isArray(parsed.constraintFilters)
        ? parsed.constraintFilters.filter((value): value is string => typeof value === "string")
        : DEFAULT_ARCHIVE_FILTER_PREFS.constraintFilters,
      minLength: typeof parsed.minLength === "string" ? parsed.minLength : DEFAULT_ARCHIVE_FILTER_PREFS.minLength,
      maxLength: typeof parsed.maxLength === "string" ? parsed.maxLength : DEFAULT_ARCHIVE_FILTER_PREFS.maxLength,
    };
  } catch {
    return DEFAULT_ARCHIVE_FILTER_PREFS;
  }
}

type CachedPuzzlePayload = {
  sourceId?: string;
  stableKey?: string;
  cacheKey?: string;
  payload?: string;
};

async function loadManifest(): Promise<ArchiveEntry[] | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}archive/archive-manifest.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as { entries?: ArchiveEntry[] };
    if (!Array.isArray(data.entries) || data.entries.length === 0) return null;
    return data.entries;
  } catch {
    return null;
  }
}

async function loadCachedPuzzlePayload(entry: ArchiveEntry): Promise<string | null> {
  const cacheKey = clean(entry.cacheKey || entry.stableKey);
  if (!cacheKey) return null;

  try {
    const res = await fetch(
      `${import.meta.env.BASE_URL}archive/puzzles/${encodeURIComponent(cacheKey)}.json`,
    );
    if (!res.ok) return null;

    const data = (await res.json()) as CachedPuzzlePayload;
    const payload = typeof data.payload === "string" ? data.payload : "";
    return payload.length ? payload : null;
  } catch {
    return null;
  }
}

export function CtCArchivePage(props: { isVisible?: boolean }) {
  const { isVisible = true } = props;
  const nav = useNavigate();
  const location = useLocation();
  const [hasActivated, setHasActivated] = useState(isVisible);
  const [renderConfig] = useState(getRenderConfig);
  const initialFilterPrefs = useMemo(readInitialArchiveFilterPrefs, []);
  const appliedReturnStateRef = useRef(false);

  const [rows, setRows] = useState<PreparedArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const isMountedRef = useRef(true);
  const [busy, setBusy] = useState("");
  const [importingId, setImportingId] = useState("");
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [uiMessage, setUiMessage] = useState("");
  const [query, setQuery] = useState(initialFilterPrefs.query);
  const [searchField, setSearchField] = useState<SearchField>(initialFilterPrefs.searchField);
  const [sortField, setSortField] = useState<SortField>(initialFilterPrefs.sortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialFilterPrefs.sortDirection);
  const [hostFilters, setHostFilters] = useState<string[]>(initialFilterPrefs.hostFilters);
  const [authorFilters, setAuthorFilters] = useState<string[]>(initialFilterPrefs.authorFilters);
  const [collectionFilters, setCollectionFilters] = useState<string[]>(initialFilterPrefs.collectionFilters);
  const [constraintFilters, setConstraintFilters] = useState<string[]>(initialFilterPrefs.constraintFilters);
  const [hostFilterQuery, setHostFilterQuery] = useState("");
  const [authorFilterQuery, setAuthorFilterQuery] = useState("");
  const [collectionFilterQuery, setCollectionFilterQuery] = useState("");
  const [constraintFilterQuery, setConstraintFilterQuery] = useState("");
  const [minLength, setMinLength] = useState(initialFilterPrefs.minLength);
  const [maxLength, setMaxLength] = useState(initialFilterPrefs.maxLength);
  const [visibleRowsCount, setVisibleRowsCount] = useState(renderConfig.initialVisibleRows);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewedPuzzles, setPreviewedPuzzles] = useState<Map<string, PuzzleDefinition>>(new Map());
  const [previewRulesByEntryId, setPreviewRulesByEntryId] = useState<Map<string, string>>(new Map());
  const [rulesDialogEntry, setRulesDialogEntry] = useState<PreparedArchiveEntry | null>(null);
  const [rulesDialogBusy, setRulesDialogBusy] = useState(false);
  const [folders, setFolders] = useState<PuzzleFolder[]>([]);
  const [importAllMenuOpen, setImportAllMenuOpen] = useState(false);
  const [importAllBusy, setImportAllBusy] = useState("");
  const [importToFolderDialogOpen, setImportToFolderDialogOpen] = useState(false);
  const [importFolderNavId, setImportFolderNavId] = useState<string | null>(null);
  const [importToFolderBusy, setImportToFolderBusy] = useState("");
  const [folderCreateDialogOpen, setFolderCreateDialogOpen] = useState(false);
  const [folderCreateName, setFolderCreateName] = useState("");
  const [folderCreateBusy, setFolderCreateBusy] = useState("");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingQueueRef = useRef<Set<string>>(new Set());
  const loadCountRef = useRef<number>(0);
  const pendingQueueRef = useRef<PreparedArchiveEntry[]>([]);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (isVisible) setHasActivated(true);
  }, [isVisible]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setSyncedLocalStorageItem(
      ARCHIVE_FILTER_PREFS_KEY,
      JSON.stringify({
        query,
        searchField,
        sortField,
        sortDirection,
        hostFilters,
        authorFilters,
        collectionFilters,
        constraintFilters,
        minLength,
        maxLength,
      } satisfies ArchiveFilterPrefs),
    );
  }, [
    query,
    searchField,
    sortField,
    sortDirection,
    hostFilters,
    authorFilters,
    collectionFilters,
    constraintFilters,
    minLength,
    maxLength,
  ]);

  useEffect(() => {
    if (!isVisible) return;
    if (appliedReturnStateRef.current) return;
    const returned = readPuzzleReturnState(location.state);
    if (!returned || returned.page !== "archive") return;

    appliedReturnStateRef.current = true;
    const savedVisibleRowsCount = returned.context?.visibleRowsCount;

    if (typeof savedVisibleRowsCount === "number" && Number.isFinite(savedVisibleRowsCount)) {
      setVisibleRowsCount(Math.max(renderConfig.initialVisibleRows, Math.trunc(savedVisibleRowsCount)));
    }
    clearReturnStateFromHistory();
  }, [isVisible, location.state, renderConfig.initialVisibleRows]);

  async function refreshCompleted() {
    const completed = await listCompletedPuzzleKeys();
    setCompletedKeys(new Set(completed));
  }

  async function refreshFolders() {
    const nextFolders = await listFolders();
    if (isMountedRef.current) {
      setFolders(nextFolders);
    }
  }

  async function refreshRows() {
    if (!isMountedRef.current) return;
    setLoading(true);
    setError("");

    try {
      const manifestEntries = await loadManifest();
      if (!isMountedRef.current) return;
      
      if (!manifestEntries) {
        setRows([]);
        setError("Unable to load archive manifest. Run npm run sync-archive-cache and rebuild.");
        return;
      }
      setRows(manifestEntries.map(prepareArchiveEntry));
    } catch (e: unknown) {
      if (isMountedRef.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!hasActivated) return;
    void refreshRows();

    const run = () => {
      void refreshCompleted();
      void refreshFolders();
    };

    if (typeof window === "undefined") {
      run();
      return;
    }

    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: 500 });
      return () => window.cancelIdleCallback(handle);
    }

    const timer = window.setTimeout(run, 150);
    return () => window.clearTimeout(timer);
  }, [hasActivated]);

  useEffect(() => {
    if (!hasActivated) return;
    return onLocalAppSnapshotImported(() => {
      void refreshCompleted();
      void refreshFolders();
    });
  }, [hasActivated]);

  const hosts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.videoHost).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const authors = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => splitSemicolonValues(r.puzzleAuthor)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const collections = useMemo(
    () => Array.from(new Set(rows.map((r) => r.collection).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const constraintOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.constraintTypes).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filteredHostOptions = useMemo(() => {
    const q = clean(hostFilterQuery).toLowerCase();
    const matched = q ? hosts.filter((value) => value.toLowerCase().includes(q)) : hosts;
    return orderSelectedFirst(matched, hostFilters);
  }, [hosts, hostFilterQuery, hostFilters]);

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

  const hostOptionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const q = clean(deferredQuery).toLowerCase();
    const minSeconds = minLength ? parseMinutesToSeconds(minLength) : null;
    const maxSeconds = maxLength ? parseMinutesToSeconds(maxLength) : null;

    for (const row of rows) {
      const rowAuthors = splitSemicolonValues(row.puzzleAuthor);
      if (authorFilters.length && !authorFilters.some((selectedAuthor) => rowAuthors.includes(selectedAuthor))) continue;
      if (collectionFilters.length && !collectionFilters.includes(row.collection)) continue;
      if (constraintFilters.length && !constraintFilters.every((selectedConstraint) => row.constraintTypes.includes(selectedConstraint))) continue;
      if (minSeconds != null && (row.videoLengthSeconds == null || row.videoLengthSeconds < minSeconds)) continue;
      if (maxSeconds != null && (row.videoLengthSeconds == null || row.videoLengthSeconds > maxSeconds)) continue;
      if (!matchesSearch(row, searchField, q)) continue;
      incrementCountMap(counts, [row.videoHost]);
    }

    return counts;
  }, [rows, deferredQuery, searchField, authorFilters, collectionFilters, constraintFilters, minLength, maxLength]);

  const authorOptionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const q = clean(deferredQuery).toLowerCase();
    const minSeconds = minLength ? parseMinutesToSeconds(minLength) : null;
    const maxSeconds = maxLength ? parseMinutesToSeconds(maxLength) : null;

    for (const row of rows) {
      if (hostFilters.length && !hostFilters.includes(row.videoHost)) continue;
      if (collectionFilters.length && !collectionFilters.includes(row.collection)) continue;
      if (constraintFilters.length && !constraintFilters.every((selectedConstraint) => row.constraintTypes.includes(selectedConstraint))) continue;
      if (minSeconds != null && (row.videoLengthSeconds == null || row.videoLengthSeconds < minSeconds)) continue;
      if (maxSeconds != null && (row.videoLengthSeconds == null || row.videoLengthSeconds > maxSeconds)) continue;
      if (!matchesSearch(row, searchField, q)) continue;
      incrementCountMap(counts, splitSemicolonValues(row.puzzleAuthor));
    }

    return counts;
  }, [rows, deferredQuery, searchField, hostFilters, collectionFilters, constraintFilters, minLength, maxLength]);

  const collectionOptionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const q = clean(deferredQuery).toLowerCase();
    const minSeconds = minLength ? parseMinutesToSeconds(minLength) : null;
    const maxSeconds = maxLength ? parseMinutesToSeconds(maxLength) : null;

    for (const row of rows) {
      const rowAuthors = splitSemicolonValues(row.puzzleAuthor);
      if (hostFilters.length && !hostFilters.includes(row.videoHost)) continue;
      if (authorFilters.length && !authorFilters.some((selectedAuthor) => rowAuthors.includes(selectedAuthor))) continue;
      if (constraintFilters.length && !constraintFilters.every((selectedConstraint) => row.constraintTypes.includes(selectedConstraint))) continue;
      if (minSeconds != null && (row.videoLengthSeconds == null || row.videoLengthSeconds < minSeconds)) continue;
      if (maxSeconds != null && (row.videoLengthSeconds == null || row.videoLengthSeconds > maxSeconds)) continue;
      if (!matchesSearch(row, searchField, q)) continue;
      incrementCountMap(counts, [row.collection]);
    }

    return counts;
  }, [rows, deferredQuery, searchField, hostFilters, authorFilters, constraintFilters, minLength, maxLength]);

  const constraintOptionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const q = clean(deferredQuery).toLowerCase();
    const minSeconds = minLength ? parseMinutesToSeconds(minLength) : null;
    const maxSeconds = maxLength ? parseMinutesToSeconds(maxLength) : null;

    for (const row of rows) {
      const rowAuthors = splitSemicolonValues(row.puzzleAuthor);
      if (hostFilters.length && !hostFilters.includes(row.videoHost)) continue;
      if (authorFilters.length && !authorFilters.some((selectedAuthor) => rowAuthors.includes(selectedAuthor))) continue;
      if (collectionFilters.length && !collectionFilters.includes(row.collection)) continue;
      if (minSeconds != null && (row.videoLengthSeconds == null || row.videoLengthSeconds < minSeconds)) continue;
      if (maxSeconds != null && (row.videoLengthSeconds == null || row.videoLengthSeconds > maxSeconds)) continue;
      if (!matchesSearch(row, searchField, q)) continue;
      incrementCountMap(counts, row.constraintTypes);
    }

    return counts;
  }, [rows, deferredQuery, searchField, hostFilters, authorFilters, collectionFilters, minLength, maxLength]);

  const hostFilterOptions = useMemo(() => {
    return filteredHostOptions.map((value) => ({
      value,
      label: value,
      count: hostOptionCounts.get(value) ?? 0,
    } satisfies SelectControlOption));
  }, [filteredHostOptions, hostOptionCounts]);

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
      label: displayCollection(value) || "None",
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

    setHostFilters((current) => {
      if (!current.length) return current;
      const valid = new Set(hosts);
      const next = current.filter((value) => valid.has(value));
      return next.length === current.length ? current : next;
    });
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
  }, [rows, hosts, authors, collections, constraintOptions]);

  const sortedRows = useMemo(() => {
    const directionFactor = sortDirection === "asc" ? 1 : -1;
    const next = [...rows];

    next.sort((a, b) => {
      if (sortField === "title") {
        return a.title.localeCompare(b.title) * directionFactor;
      }

      if (sortField === "video_length") {
        const av = a.videoLengthSeconds;
        const bv = b.videoLengthSeconds;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * directionFactor;
      }

      const av = a.videoDateTs;
      const bv = b.videoDateTs;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * directionFactor;
    });

    return next;
  }, [rows, sortField, sortDirection]);

  const filteredRows = useMemo(() => {
    const q = clean(deferredQuery).toLowerCase();
    const minSeconds = minLength ? parseMinutesToSeconds(minLength) : null;
    const maxSeconds = maxLength ? parseMinutesToSeconds(maxLength) : null;

    return sortedRows.filter((r) => {
      const rowAuthors = splitSemicolonValues(r.puzzleAuthor);
      if (hostFilters.length && !hostFilters.includes(r.videoHost)) return false;
      if (authorFilters.length && !authorFilters.some((selectedAuthor) => rowAuthors.includes(selectedAuthor))) return false;
      if (collectionFilters.length && !collectionFilters.includes(r.collection)) return false;
      if (constraintFilters.length && !constraintFilters.every((selectedConstraint) => r.constraintTypes.includes(selectedConstraint))) {
        return false;
      }
      if (minSeconds != null && (r.videoLengthSeconds == null || r.videoLengthSeconds < minSeconds)) return false;
      if (maxSeconds != null && (r.videoLengthSeconds == null || r.videoLengthSeconds > maxSeconds)) return false;
      if (!matchesSearch(r, searchField, q)) return false;
      return true;
    });
  }, [
    sortedRows,
    deferredQuery,
    searchField,
    hostFilters,
    authorFilters,
    collectionFilters,
    constraintFilters,
    minLength,
    maxLength,
  ]);

  useEffect(() => {
    setVisibleRowsCount(renderConfig.initialVisibleRows);
  }, [
    renderConfig.initialVisibleRows,
    deferredQuery,
    searchField,
    sortField,
    sortDirection,
    hostFilters,
    authorFilters,
    collectionFilters,
    constraintFilters,
    minLength,
    maxLength,
    rows,
  ]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleRowsCount),
    [filteredRows, visibleRowsCount],
  );

  const loadPuzzlePreview = useCallback(async (entry: PreparedArchiveEntry) => {
    const cached = previewedPuzzles.get(entry.id);
    if (cached) return cached;

    const importSource = clean(entry.sourceId || entry.sudokuPadUrl);
    if (!importSource) {
      loadingQueueRef.current.delete(entry.id);
      return null;
    }

    try {
      const cachedPayload = await loadCachedPuzzlePayload(entry);
      if (!cachedPayload) {
        loadingQueueRef.current.delete(entry.id);
        return null;
      }

      const { def } = await loadFromSudokuPad(importSource, {
        preloadedPayload: cachedPayload,
        skipCounterFetch: true,
      });

      setPreviewedPuzzles((prev) => new Map(prev).set(entry.id, def));
      setPreviewRulesByEntryId((prev) => new Map(prev).set(entry.id, clean(def.meta?.rules) || "No rules available."));
      return def;
    } catch {
      // Silently fail for previews
      return null;
    } finally {
      loadingQueueRef.current.delete(entry.id);
    }
  }, [previewedPuzzles]);

  const processPreviewQueue = useCallback(async () => {
    if (loadCountRef.current >= 2 || pendingQueueRef.current.length === 0) return;

    const entry = pendingQueueRef.current.shift();
    if (!entry) return;

    loadCountRef.current++;
    try {
      await loadPuzzlePreview(entry);
    } finally {
      loadCountRef.current--;
      if (pendingQueueRef.current.length > 0) {
        await processPreviewQueue();
      }
    }
  }, [loadPuzzlePreview]);

  const queuePreviewLoad = useCallback((entry: PreparedArchiveEntry) => {
    if (loadingQueueRef.current.has(entry.id) || previewedPuzzles.has(entry.id)) return;

    loadingQueueRef.current.add(entry.id);
    pendingQueueRef.current.push(entry);
    void processPreviewQueue();
  }, [previewedPuzzles, processPreviewQueue]);

  useEffect(() => {
    if (!hasActivated) return;
    const observerOptions = {
      root: null,
      rootMargin: "50px",
      threshold: 0,
    };

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const entryId = (entry.target as HTMLElement).dataset.entryId;
          if (entryId) {
            const entry_data = visibleRows.find((r) => r.id === entryId);
            if (entry_data) {
              queuePreviewLoad(entry_data);
            }
          }
        }
      });
    };

    observerRef.current = new IntersectionObserver(handleIntersect, observerOptions);

    // Immediately preload all currently visible rows
    visibleRows.forEach((entry) => {
      queuePreviewLoad(entry);
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasActivated, visibleRows, queuePreviewLoad]);

  const hasMoreRows = visibleRowsCount < filteredRows.length;

  const folderById = useMemo(() => {
    return new Map(folders.map((folder) => [folder.id, folder]));
  }, [folders]);

  const importFolderTrail = useMemo(() => {
    const out: PuzzleFolder[] = [];
    if (!importFolderNavId) return out;

    const seen = new Set<string>();
    let cursor: PuzzleFolder | null = folderById.get(importFolderNavId) ?? null;
    while (cursor && !seen.has(cursor.id)) {
      out.unshift(cursor);
      seen.add(cursor.id);
      cursor = cursor.parentId ? folderById.get(cursor.parentId) ?? null : null;
    }

    return out;
  }, [importFolderNavId, folderById]);

  const importFolderChildren = useMemo(() => {
    return [...folders]
      .filter((folder) => (folder.parentId ?? null) === importFolderNavId)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }, [folders, importFolderNavId]);

  const importFolderTarget = importFolderNavId ? folderById.get(importFolderNavId) ?? null : null;

  const onLoadMoreRows = useCallback(() => {
    setVisibleRowsCount((count) => count + renderConfig.visibleRowsStep);
  }, [renderConfig.visibleRowsStep]);

  const onClearFilters = useCallback(() => {
    setQuery("");
    setSearchField("any");
    setHostFilters([]);
    setAuthorFilters([]);
    setCollectionFilters([]);
    setConstraintFilters([]);
    setHostFilterQuery("");
    setAuthorFilterQuery("");
    setCollectionFilterQuery("");
    setConstraintFilterQuery("");
    setMinLength("");
    setMaxLength("");
  }, []);

  async function onLoad() {
    setBusy("Loading puzzle...");
    try {
      const { key, def } = await loadFromSudokuPad(url);
      const now = Date.now();
      const existing = await getPuzzle(key);
      const nextProgress = existing?.progress ?? makeInitialProgress(def);

      await upsertPuzzle(key, {
        def,
        progress: nextProgress,
        undo: existing?.undo ?? [],
        redo: existing?.redo ?? [],
        updatedAt: now,
        createdAt: existing?.createdAt ?? now,
      });

      const scrollY = readCurrentScrollPosition();

      nav(`/p/${encodeURIComponent(key)}`, {
        state: withPuzzleOriginState(location.state, {
          version: 1,
          page: "archive",
          path: currentRoutePath(location.pathname, location.search, location.hash),
          scrollY,
          context: {
            visibleRowsCount,
          },
        }),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setBusy("");
    }
  }

  async function importArchiveEntry(entry: PreparedArchiveEntry): Promise<{ key: string; title: string }> {
    const importSource = clean(entry.sourceId || entry.sudokuPadUrl);
    if (!importSource) {
      throw new Error("No puzzle source ID found in archive metadata.");
    }

    const cachedPayload = await loadCachedPuzzlePayload(entry);
    if (!cachedPayload) {
      throw new Error("No cached puzzle payload found. Run archive sync to regenerate local cache files.");
    }

    const { key, def } = await loadFromSudokuPad(importSource, {
      preloadedPayload: cachedPayload,
      skipCounterFetch: true,
    });

    const fallbackAuthor = clean(entry.puzzleAuthor);
    const collection = clean(entry.collection);
    const constraints = splitConstraintTypes(entry.subTypeConstraints);
    const importedDef = {
      ...def,
      meta: {
        ...def.meta,
        ...(fallbackAuthor && !clean(def.meta?.author) ? { author: fallbackAuthor } : {}),
        ...(collection ? { collection } : {}),
        archiveConstraints: constraints,
        archiveVideoTitle: clean(entry.videoTitle),
        archiveVideoDate: clean(entry.videoDate),
        archiveVideoLengthSeconds: entry.videoLengthSeconds,
        archiveVideoHost: clean(entry.videoHost),
        archiveYouTubeUrl: clean(entry.youtubeUrl),
        archiveSudokuPadUrl: clean(entry.sudokuPadUrl),
      },
    };

    const now = Date.now();
    const existing = await getPuzzle(key);
    const nextProgress = existing?.progress ?? makeInitialProgress(importedDef);

    await upsertPuzzle(key, {
      def: importedDef,
      progress: nextProgress,
      undo: existing?.undo ?? [],
      redo: existing?.redo ?? [],
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    });

    setCompletedKeys((prev) => {
      const next = new Set(prev);
      if (nextProgress.status === "complete") next.add(key);
      else next.delete(key);
      return next;
    });

    return { key, title: importedDef.meta?.title ?? key };
  }

  async function onImport(entry: PreparedArchiveEntry) {
    setUiMessage("");
    setImportingId(entry.id);
    await waitForNextFrame();

    try {
      const imported = await importArchiveEntry(entry);
      setUiMessage(`Imported: ${imported.title}`);
    } catch (e: unknown) {
      setUiMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setImportingId("");
    }
  }

  async function onImportAndPlay(entry: PreparedArchiveEntry) {
    setUiMessage("");
    setImportingId(`${entry.id}:play`);
    await waitForNextFrame();

    try {
      const imported = await importArchiveEntry(entry);
      const scrollY = readCurrentScrollPosition();
      nav(`/p/${encodeURIComponent(imported.key)}`, {
        state: withPuzzleOriginState(location.state, {
          version: 1,
          page: "archive",
          path: currentRoutePath(location.pathname, location.search, location.hash),
          scrollY,
          context: {
            visibleRowsCount,
          },
        }),
      });
    } catch (e: unknown) {
      setUiMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setImportingId("");
    }
  }

  async function onImportAllToMyPuzzles(entries: PreparedArchiveEntry[]) {
    if (!entries.length || importAllBusy) return;
    setImportAllBusy(`Importing 0/${entries.length}...`);
    setImportAllMenuOpen(false);

    let importedCount = 0;
    try {
      for (const [index, entry] of entries.entries()) {
        await importArchiveEntry(entry);
        importedCount = index + 1;
        setImportAllBusy(`Importing ${importedCount}/${entries.length}...`);
      }
      setUiMessage(`Imported ${importedCount} puzzle${importedCount === 1 ? "" : "s"}.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setUiMessage(`Imported ${importedCount} then stopped: ${msg}`);
    } finally {
      setImportAllBusy("");
    }
  }

  async function onImportAllToFolder(entries: PreparedArchiveEntry[], folderId: string) {
    if (!entries.length || importToFolderBusy) return;
    setImportToFolderBusy(`Importing 0/${entries.length}...`);

    let importedCount = 0;
    try {
      for (const [index, entry] of entries.entries()) {
        const imported = await importArchiveEntry(entry);
        await addPuzzleToFolder(folderId, imported.key);
        importedCount = index + 1;
        setImportToFolderBusy(`Importing ${importedCount}/${entries.length}...`);
      }

      setUiMessage(`Imported ${importedCount} puzzle${importedCount === 1 ? "" : "s"} to folder.`);
      setImportToFolderDialogOpen(false);
      setImportFolderNavId(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setUiMessage(`Imported ${importedCount} then stopped: ${msg}`);
    } finally {
      setImportToFolderBusy("");
      setImportAllBusy("");
    }
  }

  function onOpenImportAllMenu() {
    if (!filteredRows.length || importAllBusy) return;
    setImportAllMenuOpen(true);
  }

  function onOpenImportToFolderDialog() {
    setImportAllMenuOpen(false);
    setImportFolderNavId(null);
    setImportToFolderBusy("");
    setImportToFolderDialogOpen(true);
    void refreshFolders();
  }

  async function onCreateFolderForImport() {
    const folderName = folderCreateName.trim();
    if (!folderName || folderCreateBusy) return;

    setFolderCreateBusy("Creating folder...");
    try {
      const created = await createFolder(folderName, importFolderNavId ?? null);
      await refreshFolders();
      setFolderCreateName("");
      setFolderCreateDialogOpen(false);
      setImportFolderNavId(created.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setFolderCreateBusy("");
    }
  }

  function onCreateFolderForImportWithPrompt() {
    if (folderCreateBusy) return;
    const parentLabel = importFolderTarget
      ? buildFolderPath(importFolderTarget, folderById)
      : "Top-level folders";
    const input = window.prompt(`Create folder\nParent: ${parentLabel}\n\nFolder name:`);
    if (input == null) return;

    const folderName = input.trim();
    if (!folderName) {
      alert("Folder name cannot be empty.");
      return;
    }

    setFolderCreateBusy("Creating folder...");
    void (async () => {
      try {
        const created = await createFolder(folderName, importFolderNavId ?? null);
        await refreshFolders();
        setImportFolderNavId(created.id);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(msg);
      } finally {
        setFolderCreateBusy("");
      }
    })();
  }

  async function onOpenRulesDialog(entry: PreparedArchiveEntry) {
    setRulesDialogEntry(entry);
    if (previewRulesByEntryId.has(entry.id)) return;

    setRulesDialogBusy(true);
    try {
      await loadPuzzlePreview(entry);
    } finally {
      setRulesDialogBusy(false);
    }
  }

  function navigateToMainMenu() {
    nav("/");
  }

  function navigateToFolders() {
    nav("/folders");
  }

  const attachCardObserver = useCallback(
    (element: HTMLDivElement | null, entryId: string) => {
      if (!element || !observerRef.current) return;
      element.dataset.entryId = entryId;
      observerRef.current.observe(element);
    },
    [],
  );

  return (
    <div className="shell">
      <div className="topbar">
        <AppBrand />
        <div className="topbarModeTabs" role="tablist" aria-label="Main navigation">
          <button className="btn topbarModeTab" onClick={navigateToMainMenu} type="button">
            <IconHome />
            <span>Puzzles</span>
          </button>
          <button className="btn topbarModeTab" onClick={navigateToFolders} type="button">
            <IconFolder />
            <span>Folders</span>
          </button>
          <button className="btn primary topbarModeTab" onClick={() => nav("/archive")} type="button">
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
          <div className="card">
            <div className="row archiveLoadRow">
              <div className="menuSectionTitle archiveLoadLabel">Puzzle URL</div>
              <input
                className="url"
                placeholder="https://sudokupad.app/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button className="btn primary" onClick={() => void onLoad()} disabled={!url || !!busy} type="button">
                Load
              </button>
            </div>
            {busy ? <div className="muted" style={{ marginTop: 10 }}>{busy}</div> : null}
          </div>

          <div className="card archiveControls">
            <div className="row">
              <input
                className="url"
                placeholder="Search CtC archive..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <SelectControl
                className="btn menuControlSelect"
                value={searchField}
                onValueChange={(value) => {
                  if (isSearchField(value)) setSearchField(value);
                }}
                options={ARCHIVE_SEARCH_FIELD_OPTIONS}
              />
            </div>

            <div className="archiveFilterRow">
              {renderConfig.compact ? (
                <>
                  <div className="archiveFilterControl is-mobile-popup">
                    <MobileMultiSelectFilter
                      label="Host"
                      searchPlaceholder="Search hosts..."
                      searchQuery={hostFilterQuery}
                      onSearchQueryChange={setHostFilterQuery}
                      options={hostFilterOptions}
                      selectedValues={hostFilters}
                      onSelectedValuesChange={setHostFilters}
                      emptyText="No hosts found"
                      summaryText={hostFilters.length ? `${hostFilters.length} selected` : "All"}
                    />
                  </div>
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
                      summaryText={constraintFilters.length ? `${constraintFilters.length} selected` : "All"}
                    />
                  </div>
                </>
              ) : (
                <>
                  <label className="archiveFilterControl">
                    <span className="muted archiveFilterLabel">Host</span>
                    <input
                      className="url"
                      placeholder="Search hosts..."
                      value={hostFilterQuery}
                      onChange={(e) => setHostFilterQuery(e.target.value)}
                      aria-label="Search host filter options"
                    />
                    <SelectControl
                      className="archiveConstraintSelect"
                      multiple
                      size={Math.min(8, Math.max(4, filteredHostOptions.length || 4))}
                      value={hostFilters}
                      onValuesChange={setHostFilters}
                      aria-label="Filter by host"
                      options={hostFilterOptions}
                    />
                    <span className="muted archiveFilterHint">
                      {hostFilters.length ? `${hostFilters.length} selected` : "All"}
                    </span>
                  </label>

                  <label className="archiveFilterControl">
                    <span className="muted archiveFilterLabel">Author</span>
                    <input
                      className="url"
                      placeholder="Search authors..."
                      value={authorFilterQuery}
                      onChange={(e) => setAuthorFilterQuery(e.target.value)}
                      aria-label="Search author filter options"
                    />
                    <SelectControl
                      className="archiveConstraintSelect"
                      multiple
                      size={Math.min(8, Math.max(4, filteredAuthorOptions.length || 4))}
                      value={authorFilters}
                      onValuesChange={setAuthorFilters}
                      aria-label="Filter by author"
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
                      onChange={(e) => setCollectionFilterQuery(e.target.value)}
                      aria-label="Search collection filter options"
                    />
                    <SelectControl
                      className="archiveConstraintSelect"
                      multiple
                      size={Math.min(8, Math.max(4, filteredCollectionOptions.length || 4))}
                      value={collectionFilters}
                      onValuesChange={setCollectionFilters}
                      aria-label="Filter by collection"
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
                      onChange={(e) => setConstraintFilterQuery(e.target.value)}
                      aria-label="Search constraint filter options"
                    />
                    <SelectControl
                      className="archiveConstraintSelect"
                      multiple
                      size={Math.min(8, Math.max(4, filteredConstraintOptions.length || 4))}
                      value={constraintFilters}
                      onValuesChange={setConstraintFilters}
                      aria-label="Filter by constraints"
                      options={constraintFilterOptions}
                    />
                    <span className="muted archiveFilterHint">
                      {constraintFilters.length ? `${constraintFilters.length} selected` : "All"}
                    </span>
                  </label>
                </>
              )}
            </div>

            <div className="archiveLengthRow">
              <label className="archiveFilterControl">
                <span className="muted archiveFilterLabel">Min Length (Minutes)</span>
                <input
                  className="url archiveLenInput"
                  placeholder="Min length"
                  value={minLength}
                  onChange={(e) => setMinLength(e.target.value)}
                />
              </label>

              <label className="archiveFilterControl">
                <span className="muted archiveFilterLabel">Max Length (Minutes)</span>
                <input
                  className="url archiveLenInput"
                  placeholder="Max length"
                  value={maxLength}
                  onChange={(e) => setMaxLength(e.target.value)}
                />
              </label>
            </div>

            <div className="archiveFilterActions">
              <button type="button" className="btn" onClick={onClearFilters}>
                Clear Filters
              </button>
              <button
                type="button"
                className="btn primary archiveImportAllBtn"
                onClick={onOpenImportAllMenu}
                disabled={!filteredRows.length || !!importAllBusy}
              >
                {importAllBusy ? importAllBusy : "Import All"}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="menuSectionTitle">CtC Archive Puzzles</div>

              <div className="row">
                <div className="sortControlGroup">
                  <div className="sortSelectWrap">
                    <IconSort />
                    <SelectControl
                      className="btn menuControlSelect"
                      value={sortField}
                      onValueChange={(value) => {
                        if (isSortField(value)) setSortField(value);
                      }}
                      options={ARCHIVE_SORT_OPTIONS}
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

                <div className="muted">{visibleRows.length} of {filteredRows.length} shown</div>
              </div>
            </div>

            {error && <div className="muted" style={{ marginTop: 10 }}>{error}</div>}
            {loading && <div className="muted" style={{ marginTop: 10 }}>Loading archive…</div>}
            {!!uiMessage && <div className="muted" style={{ marginTop: 10 }}>{uiMessage}</div>}

            <div className="menuPuzzleList">
              {visibleRows.map((entry) => {
                const solved = entry.sourceKey ? completedKeys.has(entry.sourceKey) : false;
                const display = (value: string) => clean(value) || "~";
                const constraints = entry.constraintTypes;
                const collection = displayCollection(entry.collection);
                const previewDef = previewedPuzzles.get(entry.id);

                return (
                  <div
                    key={entry.id}
                    className="card archiveEntryCard"
                    ref={(el) => {
                      if (el) {
                        attachCardObserver(el, entry.id);
                      }
                    }}
                  >
                    <div className="archiveEntryHead">
                      <div className="archiveEntryMain archiveDetailsGrid">
                        {entry.sudokuPadUrl ? (
                          <a
                            className="btn archiveOpenIcon archiveSudokuPadIcon"
                            href={entry.sudokuPadUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            title="Open SudokuPad"
                            aria-label="Open SudokuPad"
                          >
                            <img src={SUDOKUPAD_ICON_URL} alt="" className="archiveIconImage" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="btn archiveOpenIcon archiveSudokuPadIcon"
                            disabled
                            title="Open SudokuPad"
                            aria-label="Open SudokuPad"
                          >
                            <img src={SUDOKUPAD_ICON_URL} alt="" className="archiveIconImage" />
                          </button>
                        )}

                        <div className="archiveInfoText archivePuzzleInfo">
                          <div className="archiveEntryTitle">
                            {solved ? "✓ " : ""}
                            {display(entry.title)}
                            {collection ? (
                              <span className="archiveEntryCollection">
                                {" "}
                                (Collection: {collection})
                              </span>
                            ) : null}
                          </div>

                          <div className="archiveMetaSmall">{display(entry.puzzleAuthor)}</div>

                          {constraints.length ? (
                            <ul className="archiveConstraintList">
                              {constraints.map((constraint) => (
                                <li key={`${entry.id}-${constraint}`}>{constraint}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="archiveMetaMedium">~</div>
                          )}
                        </div>

                        {entry.youtubeUrl ? (
                          <a
                            className="btn archiveOpenIcon archiveYoutubeIcon"
                            href={entry.youtubeUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            title="Open YouTube"
                            aria-label="Open YouTube"
                          >
                            <img src={YOUTUBE_ICON_DATA_URL} alt="" className="archiveIconImage" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="btn archiveOpenIcon archiveYoutubeIcon"
                            disabled
                            title="Open YouTube"
                            aria-label="Open YouTube"
                          >
                            <img src={YOUTUBE_ICON_DATA_URL} alt="" className="archiveIconImage" />
                          </button>
                        )}

                        <div className="archiveInfoText archiveVideoInfo">
                          <div className="archiveVideoTitle">{display(entry.videoTitle)}</div>
                          <div className="archiveMetaSmall">{display(entry.videoDate)}</div>
                          <div className="archiveMetaMedium">
                            {formatDurationHm(entry.videoLengthSeconds)} - {display(entry.videoHost)}
                          </div>
                        </div>
                      </div>

                      <div className="archivePreviewStack">
                        <button
                          className="archivePreviewButton"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onOpenRulesDialog(entry);
                          }}
                          aria-label={`Open rules for ${display(entry.title)}`}
                        >
                          {previewDef ? (
                            <div className="archivePreview" aria-hidden="true">
                              <GridCanvas
                                def={previewDef}
                                progress={makeInitialProgress(previewDef)}
                                onSelection={() => {}}
                                onLineStroke={() => {}}
                                onLineTapCell={() => {}}
                                onLineTapEdge={() => {}}
                                onDoubleCell={() => {}}
                                interactive={false}
                                previewMode
                              />
                            </div>
                          ) : (
                            <div className="archivePreview archivePreviewPlaceholder">
                              <span className="muted">Loading preview...</span>
                            </div>
                          )}
                        </button>

                        <div className="archiveImportActions">
                          <button
                            className="btn primary archiveImportBtn archiveActionHalf"
                            disabled={importingId === entry.id || importingId === `${entry.id}:play` || !!importAllBusy}
                            onClick={(e) => {
                              e.stopPropagation();
                              void onImport(entry);
                            }}
                            aria-label="Import puzzle"
                            title="Import"
                            type="button"
                          >
                            <IconImport />
                          </button>
                          <button
                            className="btn primary archiveImportBtn archiveActionHalf"
                            disabled={importingId === entry.id || importingId === `${entry.id}:play` || !!importAllBusy}
                            onClick={(e) => {
                              e.stopPropagation();
                              void onImportAndPlay(entry);
                            }}
                            aria-label="Import and play puzzle"
                            title="Import and Play"
                            type="button"
                          >
                            <span className="archiveDualIcon" aria-hidden="true">
                              <IconImport />
                              <IconPlay />
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {!loading && hasMoreRows && (
                <div className="row" style={{ marginTop: 10, justifyContent: "center" }}>
                  <button type="button" className="btn" onClick={onLoadMoreRows}>
                    Load {renderConfig.visibleRowsStep} more
                  </button>
                </div>
              )}

              {!loading && !filteredRows.length && !error && (
                <div className="muted">No archive puzzles match the current search/filter.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {rulesDialogEntry ? (
        <div className="overlayBackdrop" onClick={() => (!rulesDialogBusy ? setRulesDialogEntry(null) : null)}>
          <div
            className="card archiveRulesDialog"
            role="dialog"
            aria-modal="true"
            aria-label="Puzzle rules"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="btn archiveRulesClose"
              onClick={() => setRulesDialogEntry(null)}
              type="button"
              aria-label="Close rules"
            >
              x
            </button>
            <div className="menuSectionTitle" style={{ marginRight: 28 }}>
              {clean(rulesDialogEntry.title) || "(untitled)"}
            </div>
            <div className="muted" style={{ marginTop: 6, overflowWrap: "anywhere" }}>
              {clean(rulesDialogEntry.puzzleAuthor) || "Unknown author"}
            </div>
            <div className="archiveRulesPreview" aria-label="Puzzle preview">
              {previewedPuzzles.get(rulesDialogEntry.id) ? (
                <GridCanvas
                  def={previewedPuzzles.get(rulesDialogEntry.id)!}
                  progress={makeInitialProgress(previewedPuzzles.get(rulesDialogEntry.id)!)}
                  onSelection={() => {}}
                  onLineStroke={() => {}}
                  onLineTapCell={() => {}}
                  onLineTapEdge={() => {}}
                  onDoubleCell={() => {}}
                  interactive={false}
                  previewMode
                />
              ) : (
                <div className="archiveRulesPreviewFallback muted">
                  {rulesDialogBusy ? "Loading puzzle..." : "Puzzle preview unavailable."}
                </div>
              )}
            </div>
            <div className="archiveRulesBody">
              {rulesDialogBusy
                ? "Loading rules..."
                : (previewRulesByEntryId.get(rulesDialogEntry.id) || "No rules available.")}
            </div>
          </div>
        </div>
      ) : null}

      {importAllMenuOpen ? (
        <div className="overlayBackdrop" onClick={() => setImportAllMenuOpen(false)}>
          <div
            className="card confirmDialogCard"
            role="dialog"
            aria-modal="true"
            aria-label="Import all options"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Import All</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Import {filteredRows.length} puzzle{filteredRows.length === 1 ? "" : "s"} from the current filtered list.
            </div>
            <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button
                className="btn"
                onClick={() => {
                  void onImportAllToMyPuzzles(filteredRows);
                }}
                type="button"
              >
                Import to My Puzzles
              </button>
              <button
                className="btn primary"
                onClick={onOpenImportToFolderDialog}
                type="button"
              >
                Import to Folder
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importToFolderDialogOpen ? (
        <div className="overlayBackdrop" onClick={() => setImportToFolderDialogOpen(false)}>
          <div
            className="card folderPickerCard"
            role="dialog"
            aria-modal="true"
            aria-label="Import to folder"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="menuSectionTitle">Import to Folder</div>
              <button className="btn" onClick={() => setImportToFolderDialogOpen(false)} type="button">Close</button>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              {filteredRows.length} puzzle{filteredRows.length === 1 ? "" : "s"} will be imported.
            </div>

            <div className="row folderBreadcrumbRow folderBreadcrumbTrail" style={{ marginTop: 10 }}>
              {[{ id: null, name: "Top Level" }, ...importFolderTrail].map((folder, index) => (
                <Fragment key={`archive-import-folder-trail-${folder.id ?? "top-level"}`}>
                  {index > 0 ? <span className="folderBreadcrumbSeparator" aria-hidden="true">-&gt;</span> : null}
                  <button
                    className={`folderBreadcrumbLink ${importFolderNavId === folder.id ? "is-active" : ""}`}
                    onClick={() => setImportFolderNavId(folder.id)}
                    type="button"
                  >
                    {folder.name}
                  </button>
                </Fragment>
              ))}
            </div>

            <div className="addFolderDialogBody">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {importFolderTarget
                    ? buildFolderPath(importFolderTarget, folderById)
                    : "Select a folder location"}
                </div>
                <button
                  className="btn"
                  onClick={onCreateFolderForImportWithPrompt}
                  disabled={!!folderCreateBusy}
                  type="button"
                >
                  New Folder
                </button>
              </div>

              <div className="menuPuzzleList addFolderNavigatorList" style={{ marginTop: 10 }}>
                {importFolderChildren.map((folder) => (
                  <button
                    key={`archive-import-folder-nav-${folder.id}`}
                    className="card folderBrowserItem"
                    onClick={() => setImportFolderNavId(folder.id)}
                    type="button"
                  >
                    <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
                      <IconFolder />
                      <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{folder.name}</div>
                    </div>
                  </button>
                ))}
                {!importFolderChildren.length ? <div className="muted">No folders in this location.</div> : null}
              </div>

              <div className="muted addFolderBusyLine">{importToFolderBusy || "\u00A0"}</div>

              <div className="row addFolderDialogFooter">
                <button
                  className="btn primary"
                  onClick={() => {
                    if (!importFolderTarget) return;
                    void onImportAllToFolder(filteredRows, importFolderTarget.id);
                  }}
                  disabled={!importFolderTarget || !!importToFolderBusy}
                  type="button"
                >
                  {importToFolderBusy ? "Importing..." : "Add Here"}
                </button>
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
              {importFolderTarget
                ? `Parent: ${buildFolderPath(importFolderTarget, folderById)}`
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
                  void onCreateFolderForImport();
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

      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
