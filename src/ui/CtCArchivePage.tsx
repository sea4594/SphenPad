import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { normalizePuzzleKey } from "../core/id";
import { makeInitialProgress } from "../core/scl";
import { addPuzzleToFolder, createFolder, getPuzzle, listCompletedPuzzleKeys, listFolders, type PuzzleFolder, upsertPuzzle } from "../core/storage";
import { loadFromSudokuPad } from "../core/sudokupad";
import { AppBrand } from "./AppBrand";
import { GridCanvas } from "./GridCanvas";
import { IconFolder, IconHome, IconImport, IconPlay, IconSettings } from "./icons";
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

type ArchiveFilterPrefs = {
  query: string;
  searchField: SearchField;
  sortField: SortField;
  hostFilter: string;
  authorFilter: string;
  collectionFilter: string;
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
  hostFilter: "all",
  authorFilter: "all",
  collectionFilter: "all",
  constraintFilters: [],
  minLength: "",
  maxLength: "",
};

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

function sortByDateDesc(a: PreparedArchiveEntry, b: PreparedArchiveEntry): number {
  const av = a.videoDateTs ?? 0;
  const bv = b.videoDateTs ?? 0;
  return bv - av;
}

function sortByTitleAsc(a: PreparedArchiveEntry, b: PreparedArchiveEntry): number {
  return a.title.localeCompare(b.title);
}

function sortByVideoLengthAsc(a: PreparedArchiveEntry, b: PreparedArchiveEntry): number {
  const av = a.videoLengthSeconds ?? Number.MAX_SAFE_INTEGER;
  const bv = b.videoLengthSeconds ?? Number.MAX_SAFE_INTEGER;
  return av - bv;
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

function readInitialArchiveFilterPrefs(): ArchiveFilterPrefs {
  try {
    const raw = localStorage.getItem(ARCHIVE_FILTER_PREFS_KEY);
    if (!raw) return DEFAULT_ARCHIVE_FILTER_PREFS;

    const parsed = JSON.parse(raw) as Partial<ArchiveFilterPrefs>;

    const searchField = typeof parsed.searchField === "string" && isSearchField(parsed.searchField)
      ? parsed.searchField
      : DEFAULT_ARCHIVE_FILTER_PREFS.searchField;
    const sortField = typeof parsed.sortField === "string" && isSortField(parsed.sortField)
      ? parsed.sortField
      : DEFAULT_ARCHIVE_FILTER_PREFS.sortField;

    return {
      query: typeof parsed.query === "string" ? parsed.query : DEFAULT_ARCHIVE_FILTER_PREFS.query,
      searchField,
      sortField,
      hostFilter: typeof parsed.hostFilter === "string" ? parsed.hostFilter : DEFAULT_ARCHIVE_FILTER_PREFS.hostFilter,
      authorFilter: typeof parsed.authorFilter === "string" ? parsed.authorFilter : DEFAULT_ARCHIVE_FILTER_PREFS.authorFilter,
      collectionFilter: typeof parsed.collectionFilter === "string"
        ? parsed.collectionFilter
        : DEFAULT_ARCHIVE_FILTER_PREFS.collectionFilter,
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

export function CtCArchivePage() {
  const nav = useNavigate();
  const location = useLocation();
  const [renderConfig] = useState(getRenderConfig);
  const initialFilterPrefs = useMemo(readInitialArchiveFilterPrefs, []);
  const appliedReturnStateRef = useRef(false);

  const [rows, setRows] = useState<PreparedArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [importingId, setImportingId] = useState("");
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [uiMessage, setUiMessage] = useState("");
  const [query, setQuery] = useState(initialFilterPrefs.query);
  const [searchField, setSearchField] = useState<SearchField>(initialFilterPrefs.searchField);
  const [sortField, setSortField] = useState<SortField>(initialFilterPrefs.sortField);
  const [hostFilter, setHostFilter] = useState(initialFilterPrefs.hostFilter);
  const [authorFilter, setAuthorFilter] = useState(initialFilterPrefs.authorFilter);
  const [collectionFilter, setCollectionFilter] = useState(initialFilterPrefs.collectionFilter);
  const [constraintFilters, setConstraintFilters] = useState<string[]>(initialFilterPrefs.constraintFilters);
  const [minLength, setMinLength] = useState(initialFilterPrefs.minLength);
  const [maxLength, setMaxLength] = useState(initialFilterPrefs.maxLength);
  const [visibleRowsCount, setVisibleRowsCount] = useState(renderConfig.initialVisibleRows);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewedPuzzles, setPreviewedPuzzles] = useState<Map<string, any>>(new Map());
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
    localStorage.setItem(
      ARCHIVE_FILTER_PREFS_KEY,
      JSON.stringify({
        query,
        searchField,
        sortField,
        hostFilter,
        authorFilter,
        collectionFilter,
        constraintFilters,
        minLength,
        maxLength,
      } satisfies ArchiveFilterPrefs),
    );
  }, [
    query,
    searchField,
    sortField,
    hostFilter,
    authorFilter,
    collectionFilter,
    constraintFilters,
    minLength,
    maxLength,
  ]);

  useEffect(() => {
    if (appliedReturnStateRef.current) return;
    const returned = readPuzzleReturnState(location.state);
    if (!returned || returned.page !== "archive") return;

    appliedReturnStateRef.current = true;
    const savedVisibleRowsCount = returned.context?.visibleRowsCount;
    
    console.log(
      "[CtCArchivePage] Restoring state:",
      `visibleRowsCount=${savedVisibleRowsCount || "(not set)"}`
    );
    
    if (typeof savedVisibleRowsCount === "number" && Number.isFinite(savedVisibleRowsCount)) {
      setVisibleRowsCount(Math.max(renderConfig.initialVisibleRows, Math.trunc(savedVisibleRowsCount)));
    }
    restoreWindowScroll(returned.scrollY);
    clearReturnStateFromHistory();
  }, [location.state, renderConfig.initialVisibleRows]);

  async function refreshCompleted() {
    const completed = await listCompletedPuzzleKeys();
    setCompletedKeys(new Set(completed));
  }

  async function refreshFolders() {
    const nextFolders = await listFolders();
    setFolders(nextFolders);
  }

  async function refreshRows() {
    setLoading(true);
    setError("");

    try {
      const manifestEntries = await loadManifest();
      if (!manifestEntries) {
        setRows([]);
        setError("Unable to load archive manifest. Run npm run sync-archive-cache and rebuild.");
        return;
      }
      setRows(manifestEntries.map(prepareArchiveEntry));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
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
  }, []);

  const hosts = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.videoHost).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [rows],
  );

  const authors = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.puzzleAuthor).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [rows],
  );

  const collections = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.collection).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [rows],
  );

  const constraintOptions = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.constraintTypes).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  useEffect(() => {
    if (!rows.length) return;

    setHostFilter((current) => (current === "all" || hosts.includes(current) ? current : "all"));
    setAuthorFilter((current) => (current === "all" || authors.includes(current) ? current : "all"));
    setCollectionFilter((current) => (current === "all" || collections.includes(current) ? current : "all"));
    setConstraintFilters((current) => {
      if (!current.length) return current;
      const valid = new Set(constraintOptions);
      const next = current.filter((value) => valid.has(value));
      return next.length === current.length ? current : next;
    });
  }, [rows, hosts, authors, collections, constraintOptions]);

  const rowsByDate = useMemo(() => [...rows].sort(sortByDateDesc), [rows]);
  const rowsByTitle = useMemo(() => [...rows].sort(sortByTitleAsc), [rows]);
  const rowsByVideoLength = useMemo(() => [...rows].sort(sortByVideoLengthAsc), [rows]);

  const sortedRows = useMemo(() => {
    if (sortField === "title") return rowsByTitle;
    if (sortField === "video_length") return rowsByVideoLength;
    return rowsByDate;
  }, [sortField, rowsByDate, rowsByTitle, rowsByVideoLength]);

  const filteredRows = useMemo(() => {
    const q = clean(deferredQuery).toLowerCase();
    const minSeconds = minLength ? parseMinutesToSeconds(minLength) : null;
    const maxSeconds = maxLength ? parseMinutesToSeconds(maxLength) : null;

    return sortedRows.filter((r) => {
      if (hostFilter !== "all" && r.videoHost !== hostFilter) return false;
      if (authorFilter !== "all" && r.puzzleAuthor !== authorFilter) return false;
      if (collectionFilter !== "all" && r.collection !== collectionFilter) return false;
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
    hostFilter,
    authorFilter,
    collectionFilter,
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
    hostFilter,
    authorFilter,
    collectionFilter,
    constraintFilters,
    minLength,
    maxLength,
    rows,
  ]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleRowsCount),
    [filteredRows, visibleRowsCount],
  );

  useEffect(() => {
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
  }, [visibleRows]);

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
    setHostFilter("all");
    setAuthorFilter("all");
    setCollectionFilter("all");
    setConstraintFilters([]);
    setMinLength("");
    setMaxLength("");
  }, []);

  const onConstraintMouseDown = useCallback((event: MouseEvent<HTMLSelectElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLOptionElement)) return;
    event.preventDefault();
    const value = target.value;
    setConstraintFilters((current) => (
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value]
    ));
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
      console.log(
        "[CtCArchivePage] Capturing origin state for puzzle:",
        `key=${key}`,
        `visibleRowsCount=${visibleRowsCount}`,
        `scrollY=${scrollY}`
      );
      
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
    const importedDef = {
      ...def,
      meta: {
        ...def.meta,
        ...(fallbackAuthor && !clean(def.meta?.author) ? { author: fallbackAuthor } : {}),
        ...(collection ? { collection } : {}),
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

  async function processPreviewQueue() {
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
  }

  function queuePreviewLoad(entry: PreparedArchiveEntry) {
    if (loadingQueueRef.current.has(entry.id) || previewedPuzzles.has(entry.id)) return;

    loadingQueueRef.current.add(entry.id);
    pendingQueueRef.current.push(entry);
    void processPreviewQueue();
  }

  async function loadPuzzlePreview(entry: PreparedArchiveEntry) {
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
  }

  const attachCardObserver = useCallback(
    (element: HTMLDivElement | null, entryId: string) => {
      if (!element || !observerRef.current) return;
      element.dataset.entryId = entryId;
      observerRef.current.observe(element);
    },
    [],
  );
  const rulesDialogPreviewDef = rulesDialogEntry ? previewedPuzzles.get(rulesDialogEntry.id) : null;

  return (
    <div className="shell">
      <div className="topbar">
        <AppBrand />
        <div className="spacer" />
        <button className="btn" onClick={() => setSettingsOpen(true)} title="Settings" type="button">
          <IconSettings />
        </button>
      </div>

      <div className="page">
        <div className="mainMenuWrap">
          <div className="card menuModeTabsCard">
            <div className="row menuModeTabs" style={{ marginTop: 2 }}>
              <button className="btn menuModeTab" onClick={() => nav("/")} type="button">
                <IconHome />
                <span>Puzzles</span>
              </button>
              <button className="btn menuModeTab" onClick={() => nav("/folders")} type="button">
                <IconFolder />
                <span>Folders</span>
              </button>
              <button className="btn primary menuModeTab" onClick={() => nav("/archive")} type="button">
                <IconImport />
                <span>Import</span>
              </button>
            </div>
          </div>

          <div className="card">
            <div className="menuSectionTitle">Load Puzzle</div>
            <div className="muted" style={{ marginTop: 2 }}>Paste a sudokupad.app link or a puzzle id</div>
            <div className="row" style={{ marginTop: 10 }}>
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
                onChange={(e) => {
                  const value = e.target.value;
                  if (isSearchField(value)) setSearchField(value);
                }}
              >
                <option value="any">Search: Any field</option>
                <option value="title">Title</option>
                <option value="constraints">Constraints</option>
                <option value="video_title">Video title</option>
                <option value="author">Puzzle author</option>
                <option value="host">Video host</option>
                <option value="collection">Collection</option>
              </SelectControl>
            </div>

            <div className="archiveFilterRow">
              <label className="archiveFilterControl">
                <span className="muted archiveFilterLabel">Host</span>
                <SelectControl
                  className="btn menuControlSelect"
                  value={hostFilter}
                  onChange={(e) => setHostFilter(e.target.value)}
                >
                  {hosts.map((v) => (
                    <option key={v} value={v}>
                      {v === "all" ? "All" : v}
                    </option>
                  ))}
                </SelectControl>
              </label>

              <label className="archiveFilterControl">
                <span className="muted archiveFilterLabel">Author</span>
                <SelectControl
                  className="btn menuControlSelect"
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                >
                  {authors.map((v) => (
                    <option key={v} value={v}>
                      {v === "all" ? "All" : v}
                    </option>
                  ))}
                </SelectControl>
              </label>

              <label className="archiveFilterControl">
                <span className="muted archiveFilterLabel">Collection</span>
                <SelectControl
                  className="btn menuControlSelect"
                  value={collectionFilter}
                  onChange={(e) => setCollectionFilter(e.target.value)}
                >
                  {collections.map((v) => (
                    <option key={v} value={v}>
                      {v === "all" ? "All" : displayCollection(v) || "None"}
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
                  onChange={(e) => {
                    const nextSelected = Array.from(e.target.selectedOptions, (option) => option.value);
                    setConstraintFilters(nextSelected);
                  }}
                  aria-label="Filter by constraints"
                >
                  {constraintOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SelectControl>
                <span className="muted archiveFilterHint">
                  {constraintFilters.length ? `${constraintFilters.length} selected` : "All"}
                </span>
              </label>
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
                <SelectControl
                  className="btn menuControlSelect"
                  value={sortField}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isSortField(value)) setSortField(value);
                  }}
                >
                  <option value="date">Sort: Video date</option>
                  <option value="title">Sort: Puzzle title</option>
                  <option value="video_length">Sort: Video length</option>
                </SelectControl>

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
            <div className="archiveRulesScrollArea">
              <div className="archiveRulesPreviewWrap">
                {rulesDialogPreviewDef ? (
                  <div className="archivePreview archiveRulesPreview" aria-hidden="true">
                    <GridCanvas
                      def={rulesDialogPreviewDef}
                      progress={makeInitialProgress(rulesDialogPreviewDef)}
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
                  <div className="archivePreview archiveRulesPreview archivePreviewPlaceholder">
                    <span className="muted">{rulesDialogBusy ? "Loading puzzle preview..." : "Preview unavailable."}</span>
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
                  onClick={() => {
                    setFolderCreateName("");
                    setFolderCreateDialogOpen(true);
                  }}
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
