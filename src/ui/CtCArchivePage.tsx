import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { normalizePuzzleKey } from "../core/id";
import { makeInitialProgress } from "../core/scl";
import { listPuzzles, upsertPuzzle } from "../core/storage";
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

  const [rows, setRows] = useState<ArchiveEntry[]>([]);
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

  async function refreshCompleted() {
    const puzzles = await listPuzzles();
    setCompletedKeys(
      new Set(
        puzzles
          .filter((p) => p.progress?.status === "complete")
          .map((p) => p.key),
      ),
    );
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
      setRows(manifestEntries);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshRows();
    void refreshCompleted();
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

  const filteredRows = useMemo(() => {
    const q = clean(query).toLowerCase();
    const minSeconds = minLength ? parseMinutesToSeconds(minLength) : null;
    const maxSeconds = maxLength ? parseMinutesToSeconds(maxLength) : null;

    const getSearchText = (r: ArchiveEntry) => {
      if (searchField === "title") return r.title;
      if (searchField === "constraints") return r.subTypeConstraints;
      if (searchField === "video_title") return r.videoTitle;
      if (searchField === "author") return r.puzzleAuthor;
      if (searchField === "host") return r.videoHost;
      if (searchField === "collection") return r.collection;
      return [
        r.title,
        r.subTypeConstraints,
        r.videoTitle,
        r.puzzleAuthor,
        r.videoHost,
        r.collection,
      ].join(" ");
    };

    const list = rows.filter((r) => {
      if (hostFilter !== "all" && r.videoHost !== hostFilter) return false;
      if (authorFilter !== "all" && r.puzzleAuthor !== authorFilter) return false;
      if (collectionFilter !== "all" && r.collection !== collectionFilter) return false;
      if (minSeconds != null && (r.videoLengthSeconds == null || r.videoLengthSeconds < minSeconds)) return false;
      if (maxSeconds != null && (r.videoLengthSeconds == null || r.videoLengthSeconds > maxSeconds)) return false;
      if (q && !getSearchText(r).toLowerCase().includes(q)) return false;
      return true;
    });

    list.sort((a, b) => {
      if (sortField === "title") return a.title.localeCompare(b.title);
      if (sortField === "video_length") {
        const av = a.videoLengthSeconds ?? Number.MAX_SAFE_INTEGER;
        const bv = b.videoLengthSeconds ?? Number.MAX_SAFE_INTEGER;
        return av - bv;
      }
      const av = a.videoDateTs ?? 0;
      const bv = b.videoDateTs ?? 0;
      return bv - av;
    });

    return list;
  }, [
    rows,
    query,
    searchField,
    sortField,
    hostFilter,
    authorFilter,
    collectionFilter,
    minLength,
    maxLength,
  ]);

  async function onImport(entry: ArchiveEntry) {
    const importSource = clean(entry.sourceId || entry.sudokuPadUrl);
    if (!importSource) {
      setUiMessage("No puzzle source ID found in archive metadata.");
      return;
    }

    setUiMessage("");
    setImportingId(entry.id);

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
      const existing = (await listPuzzles()).find((p) => p.key === key);

      await upsertPuzzle(key, {
        def,
        progress: existing?.progress ?? makeInitialProgress(def),
        undo: existing?.undo ?? [],
        redo: existing?.redo ?? [],
        updatedAt: now,
        createdAt: existing?.createdAt ?? now,
      });

      setUiMessage(`Imported: ${def.meta?.title ?? key}`);
      await refreshCompleted();
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
              <select
                className="btn menuControlSelect"
                value={hostFilter}
                onChange={(e) => setHostFilter(e.target.value)}
              >
                {hosts.map((v) => (
                  <option key={v} value={v}>
                    {v === "all" ? "Host: All" : `Host: ${v}`}
                  </option>
                ))}
              </select>

              <select
                className="btn menuControlSelect"
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
              >
                {authors.map((v) => (
                  <option key={v} value={v}>
                    {v === "all" ? "Author: All" : `Author: ${v}`}
                  </option>
                ))}
              </select>

              <select
                className="btn menuControlSelect"
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
              >
                {collections.map((v) => (
                  <option key={v} value={v}>
                    {v === "all" ? "Collection: All" : `Collection: ${v}`}
                  </option>
                ))}
              </select>

              <input
                className="url archiveLenInput"
                placeholder="Min length (minutes)"
                value={minLength}
                onChange={(e) => setMinLength(e.target.value)}
              />

              <input
                className="url archiveLenInput"
                placeholder="Max length (minutes)"
                value={maxLength}
                onChange={(e) => setMaxLength(e.target.value)}
              />
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

                <div className="muted">{filteredRows.length} shown</div>
              </div>
            </div>

            {error && <div className="muted" style={{ marginTop: 10 }}>{error}</div>}
            {loading && <div className="muted" style={{ marginTop: 10 }}>Loading archive…</div>}
            {!!uiMessage && <div className="muted" style={{ marginTop: 10 }}>{uiMessage}</div>}

            <div className="menuPuzzleList">
              {filteredRows.map((entry) => {
                const solved = entry.sourceId
                  ? completedKeys.has(normalizePuzzleKey(entry.sourceId))
                  : false;
                const display = (value: string) => clean(value) || "~";
                const constraints = splitConstraintTypes(entry.subTypeConstraints);
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
