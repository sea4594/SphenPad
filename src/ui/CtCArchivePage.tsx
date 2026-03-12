import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { normalizePuzzleKey } from "../core/id";
import { makeInitialProgress } from "../core/scl";
import { getPuzzle, listCompletedPuzzleKeys, upsertPuzzle } from "../core/storage";
import { loadFromSudokuPad } from "../core/sudokupad";

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
    const payload = typeof data.payload === "string" ? data.payload.trim() : "";
    return payload || null;
  } catch {
    return null;
  }
}

export function CtCArchivePage() {
  const nav = useNavigate();
  const [renderConfig] = useState(getRenderConfig);

  const [rows, setRows] = useState<PreparedArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importingId, setImportingId] = useState("");
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [uiMessage, setUiMessage] = useState("");
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("any");
  const [sortField, setSortField] = useState<SortField>("date");
  const [hostFilter, setHostFilter] = useState("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [minLength, setMinLength] = useState("");
  const [maxLength, setMaxLength] = useState("");
  const [visibleRowsCount, setVisibleRowsCount] = useState(renderConfig.initialVisibleRows);
  const deferredQuery = useDeferredValue(query);

  async function refreshCompleted() {
    const completed = await listCompletedPuzzleKeys();
    setCompletedKeys(new Set(completed));
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
    minLength,
    maxLength,
    rows,
  ]);

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleRowsCount),
    [filteredRows, visibleRowsCount],
  );

  const hasMoreRows = visibleRowsCount < filteredRows.length;

  const onLoadMoreRows = useCallback(() => {
    setVisibleRowsCount((count) => count + renderConfig.visibleRowsStep);
  }, [renderConfig.visibleRowsStep]);

  async function onImport(entry: PreparedArchiveEntry) {
    const importSource = clean(entry.sourceId || entry.sudokuPadUrl);
    if (!importSource) {
      setUiMessage("No puzzle source ID found in archive metadata.");
      return;
    }

    setUiMessage("");
    setImportingId(entry.id);
    await waitForNextFrame();

    try {
      const cachedPayload = await loadCachedPuzzlePayload(entry);
      if (!cachedPayload) {
        setUiMessage("No cached puzzle payload found. Run archive sync to regenerate local cache files.");
        return;
      }

      const { key, def } = await loadFromSudokuPad(importSource, {
        preloadedPayload: cachedPayload,
        skipCounterFetch: true,
      });

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

      setCompletedKeys((prev) => {
        const next = new Set(prev);
        if (nextProgress.status === "complete") next.add(key);
        else next.delete(key);
        return next;
      });

      setUiMessage(`Imported: ${def.meta?.title ?? key}`);
    } catch (e: unknown) {
      setUiMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setImportingId("");
    }
  }

  return (
    <div className="shell">
      <div className="topbar">
        <button className="btn" onClick={() => nav("/")}>
          Back
        </button>
        <div className="brand">CtC Archive</div>
        <div className="spacer" />
      </div>

      <div className="page">
        <div className="mainMenuWrap">
          <div className="card archiveControls">
            <div className="row">
              <input
                className="url"
                placeholder="Search CtC archive..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <select
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
              </select>
            </div>

            <div className="archiveFilterRow" style={{ marginTop: 8 }}>
              <label className="archiveFilterControl">
                <span className="muted archiveFilterLabel">Host</span>
                <select
                  className="btn menuControlSelect"
                  value={hostFilter}
                  onChange={(e) => setHostFilter(e.target.value)}
                >
                  {hosts.map((v) => (
                    <option key={v} value={v}>
                      {v === "all" ? "All" : v}
                    </option>
                  ))}
                </select>
              </label>

              <label className="archiveFilterControl">
                <span className="muted archiveFilterLabel">Author</span>
                <select
                  className="btn menuControlSelect"
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                >
                  {authors.map((v) => (
                    <option key={v} value={v}>
                      {v === "all" ? "All" : v}
                    </option>
                  ))}
                </select>
              </label>

              <label className="archiveFilterControl">
                <span className="muted archiveFilterLabel">Collection</span>
                <select
                  className="btn menuControlSelect"
                  value={collectionFilter}
                  onChange={(e) => setCollectionFilter(e.target.value)}
                >
                  {collections.map((v) => (
                    <option key={v} value={v}>
                      {v === "all" ? "All" : displayCollection(v) || "None"}
                    </option>
                  ))}
                </select>
              </label>

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
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="menuSectionTitle">CtC Archive Puzzles</div>

              <div className="row">
                <select
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
                </select>

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

                return (
                  <div key={entry.id} className="card archiveEntryCard">
                    <div className="archiveEntryHead">
                      <div className="archiveEntryMain archiveDetailsGrid">
                        <button
                          className="btn primary archiveImportBtn"
                          disabled={importingId === entry.id}
                          onClick={() => onImport(entry)}
                          aria-label="Import Puzzle"
                        >
                          {importingId === entry.id ? "Importing…" : "IMPORT"}
                        </button>

                        {entry.sudokuPadUrl ? (
                          <a
                            className="btn archiveOpenIcon"
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
                            className="btn archiveOpenIcon"
                            disabled
                            title="Open SudokuPad"
                            aria-label="Open SudokuPad"
                          >
                            <img src={SUDOKUPAD_ICON_URL} alt="" className="archiveIconImage" />
                          </button>
                        )}

                        <div className="archiveInfoText">
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
                            className="btn archiveOpenIcon"
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
                            className="btn archiveOpenIcon"
                            disabled
                            title="Open YouTube"
                            aria-label="Open YouTube"
                          >
                            <img src={YOUTUBE_ICON_DATA_URL} alt="" className="archiveIconImage" />
                          </button>
                        )}

                        <div className="archiveInfoText">
                          <div className="archiveVideoTitle">{display(entry.videoTitle)}</div>
                          <div className="archiveMetaSmall">{display(entry.videoDate)}</div>
                          <div className="archiveMetaMedium">
                            {formatDurationHm(entry.videoLengthSeconds)} - {display(entry.videoHost)}
                          </div>
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
    </div>
  );
}
