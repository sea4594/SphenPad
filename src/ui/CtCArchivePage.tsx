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
  sudokuPadUrl: string;
  youtubeUrl: string;
  sourceId: string;
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

const SEARCH_FIELDS = new Set<SearchField>(["any", "title", "constraints", "video_title", "author", "host", "collection"]);
const SORT_FIELDS = new Set<SortField>(["title", "video_length", "date"]);

const FALLBACK_TITLE_INDEX = 0;
const FALLBACK_CONSTRAINTS_INDEX = 1;
const FALLBACK_VIDEO_TITLE_INDEX = 2;
const FALLBACK_VIDEO_LENGTH_INDEX = 3;
const FALLBACK_VIDEO_DATE_INDEX = 4;

const CTC_ARCHIVE_SHEET_SOURCE = "https://docs.google.com/spreadsheets/d/11TrxONoAWMvP8ibULZqtNwG4WWripAcPIS9J-wi3emc/edit#gid=0";

function timeout(ms: number) {
  return new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms));
}

function clean(v: string | undefined) {
  return (v ?? "").trim();
}

function parseDurationSeconds(text: string): number | null {
  const s = clean(text).toLowerCase();
  if (!s) return null;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(":").map((n) => Number(n));
    if (parts.some((n) => Number.isNaN(n))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  const h = Number((s.match(/(\d+)\s*h/) ?? [])[1] ?? 0);
  const m = Number((s.match(/(\d+)\s*m/) ?? [])[1] ?? 0);
  const sec = Number((s.match(/(\d+)\s*s/) ?? [])[1] ?? 0);
  const total = h * 3600 + m * 60 + sec;
  return total > 0 ? total : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        cur += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    cur += ch;
  }
  row.push(cur);
  rows.push(row);
  return rows.filter((r) => r.some((c) => clean(c)));
}

function normalizeHeader(v: string) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function extractSourceId(rawInput: string): string {
  const s = clean(rawInput);
  if (!s) return "";
  try {
    const u = new URL(s);
    const path = u.pathname.replace(/^\/+/, "");
    const hash = u.hash.replace(/^#/, "");
    const qp = u.searchParams.get("load") ?? u.searchParams.get("puzzle") ?? "";
    return clean(path || hash || qp || s);
  } catch {
    return s.replace(/^\/+/, "");
  }
}

function isSearchField(value: string): value is SearchField {
  return SEARCH_FIELDS.has(value as SearchField);
}

function isSortField(value: string): value is SortField {
  return SORT_FIELDS.has(value as SortField);
}

function buildSourceCandidates(baseUrl: string) {
  const encoded = encodeURIComponent(baseUrl);
  return [
    baseUrl,
    `https://api.allorigins.win/raw?url=${encoded}`,
    `https://api.codetabs.com/v1/proxy/?quest=${encoded}`,
  ];
}

async function fetchArchiveCsv(): Promise<string> {
  const sheetMatch = CTC_ARCHIVE_SHEET_SOURCE.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = sheetMatch?.[1] ?? clean(CTC_ARCHIVE_SHEET_SOURCE);
  const gidMatch =
    CTC_ARCHIVE_SHEET_SOURCE.match(/[?#&]gid=(\d+)/) ??
    CTC_ARCHIVE_SHEET_SOURCE.match(/#gid=(\d+)/);
  const gid = gidMatch?.[1] ?? "";
  const gidSuffix = gid ? `&gid=${encodeURIComponent(gid)}` : "";
  const baseUrls = [
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv${gidSuffix}`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${encodeURIComponent(gid)}` : ""}`,
  ];
  const urls = baseUrls.flatMap(buildSourceCandidates);
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = (await Promise.race([fetch(url), timeout(12000)])) as Response;
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      if (text.includes(",")) return text;
      lastErr = new Error("Unexpected archive payload");
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Unable to load CtC archive sheet");
}

function findIndexByAliases(headers: string[], aliases: string[]) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases.map(normalizeHeader)) {
    const idx = normalized.findIndex((h) => h === alias || h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseArchiveRows(csv: string): ArchiveEntry[] {
  const rows = parseCsv(csv);
  if (!rows.length) return [];
  const header = rows[0];
  const body = rows.slice(1);

  const iTitle = findIndexByAliases(header, ["puzzle title", "puzzle name", "title", "puzzle", "name"]);
  const iConstraints = findIndexByAliases(header, ["puzzle sub-type / constraints", "constraints", "sub-type"]);
  const iVideoTitle = findIndexByAliases(header, ["video title", "video"]);
  const iVideoLength = findIndexByAliases(header, ["video length", "duration", "length"]);
  const iVideoDate = findIndexByAliases(header, ["video date", "date", "published"]);
  const iPuzzleAuthor = findIndexByAliases(header, ["puzzle author", "author", "setter"]);
  const iVideoHost = findIndexByAliases(header, ["video host", "host", "channel"]);
  const iCollection = findIndexByAliases(header, ["collection", "series"]);
  const iSudokuPad = findIndexByAliases(header, ["sudokupad", "sudoku pad", "puzzle link"]);
  const iYoutube = findIndexByAliases(header, ["youtube", "video link", "youtube link"]);

  return body
    .map((row, idx) => {
      const byIdx = (i: number, fallback = "") => clean(i >= 0 ? row[i] : fallback);
      const title = byIdx(iTitle, row[FALLBACK_TITLE_INDEX] ?? "");
      const subTypeConstraints = byIdx(iConstraints, row[FALLBACK_CONSTRAINTS_INDEX] ?? "");
      const videoTitle = byIdx(iVideoTitle, row[FALLBACK_VIDEO_TITLE_INDEX] ?? "");
      const videoLength = byIdx(iVideoLength, row[FALLBACK_VIDEO_LENGTH_INDEX] ?? "");
      const videoDate = byIdx(iVideoDate, row[FALLBACK_VIDEO_DATE_INDEX] ?? "");
      const parsedDateTs = Date.parse(videoDate);
      const puzzleAuthor = byIdx(iPuzzleAuthor);
      const videoHost = byIdx(iVideoHost);
      const collection = byIdx(iCollection);
      const sudokuPadFromColumn = byIdx(iSudokuPad);
      const youtubeFromColumn = byIdx(iYoutube);
      const sudokuPadUrl =
        sudokuPadFromColumn ||
        row.find((cell) => /sudokupad\.app/i.test(cell ?? ""))?.trim() ||
        "";
      const youtubeUrl =
        youtubeFromColumn ||
        row.find((cell) => /youtu\.?be|youtube\.com/i.test(cell ?? ""))?.trim() ||
        "";
      const sourceId = extractSourceId(sudokuPadUrl);
      return {
        id: `${title || "entry"}-${idx}`,
        title,
        subTypeConstraints,
        videoTitle,
        videoLength,
        videoLengthSeconds: parseDurationSeconds(videoLength),
        videoDate,
        videoDateTs: Number.isFinite(parsedDateTs) ? parsedDateTs : null,
        puzzleAuthor,
        videoHost,
        collection,
        sudokuPadUrl,
        youtubeUrl,
        sourceId,
      } satisfies ArchiveEntry;
    })
    .filter((entry) => entry.title || entry.sudokuPadUrl || entry.videoTitle);
}

export function CtCArchivePage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string>("");
  const [importingId, setImportingId] = useState<string>("");
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

  async function refreshRows() {
    setLoading(true);
    setError("");
    try {
      const csv = await fetchArchiveCsv();
      setRows(parseArchiveRows(csv));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshCompleted() {
    const puzzles = await listPuzzles();
    setCompletedKeys(new Set(puzzles.filter((p) => p.progress?.status === "complete").map((p) => p.key)));
  }

  useEffect(() => {
    refreshRows();
    refreshCompleted();
  }, []);

  const hosts = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.videoHost).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [rows]
  );
  const authors = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.puzzleAuthor).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [rows]
  );
  const collections = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.collection).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [rows]
  );

  const filteredRows = useMemo(() => {
    const q = clean(query).toLowerCase();
    const minSeconds = minLength ? parseDurationSeconds(minLength) : null;
    const maxSeconds = maxLength ? parseDurationSeconds(maxLength) : null;

    const getSearchText = (r: ArchiveEntry) => {
      if (searchField === "title") return r.title;
      if (searchField === "constraints") return r.subTypeConstraints;
      if (searchField === "video_title") return r.videoTitle;
      if (searchField === "author") return r.puzzleAuthor;
      if (searchField === "host") return r.videoHost;
      if (searchField === "collection") return r.collection;
      return [r.title, r.subTypeConstraints, r.videoTitle, r.puzzleAuthor, r.videoHost, r.collection].join(" ");
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
  }, [rows, query, searchField, sortField, hostFilter, authorFilter, collectionFilter, minLength, maxLength]);

  async function onImport(entry: ArchiveEntry) {
    if (!entry.sudokuPadUrl) {
      setUiMessage("This archive row does not have a SudokuPad link.");
      return;
    }
    setUiMessage("");
    setImportingId(entry.id);
    try {
      const { key, def } = await loadFromSudokuPad(entry.sudokuPadUrl);
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
        <button className="btn" onClick={() => nav("/")}>Back</button>
        <div className="brand">CtC Archive</div>
        <div className="spacer" />
        <button className="btn" onClick={refreshRows} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
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
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <select className="btn menuControlSelect" value={hostFilter} onChange={(e) => setHostFilter(e.target.value)}>
                {hosts.map((v) => <option key={v} value={v}>{v === "all" ? "Host: All" : `Host: ${v}`}</option>)}
              </select>
              <select className="btn menuControlSelect" value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)}>
                {authors.map((v) => <option key={v} value={v}>{v === "all" ? "Author: All" : `Author: ${v}`}</option>)}
              </select>
              <select className="btn menuControlSelect" value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}>
                {collections.map((v) => <option key={v} value={v}>{v === "all" ? "Collection: All" : `Collection: ${v}`}</option>)}
              </select>
              <input className="url archiveLenInput" placeholder="Min length (e.g. 15:00)" value={minLength} onChange={(e) => setMinLength(e.target.value)} />
              <input className="url archiveLenInput" placeholder="Max length (e.g. 1:00:00)" value={maxLength} onChange={(e) => setMaxLength(e.target.value)} />
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="menuSectionTitle">CtC Archive Puzzles</div>
              <div className="muted">{filteredRows.length} shown</div>
            </div>

            {error && <div className="muted" style={{ marginTop: 10 }}>{error}</div>}
            {loading && <div className="muted" style={{ marginTop: 10 }}>Loading archive…</div>}
            {!!uiMessage && <div className="muted" style={{ marginTop: 10 }}>{uiMessage}</div>}

            <div className="menuPuzzleList">
              {filteredRows.map((entry) => {
                const solved = entry.sourceId ? completedKeys.has(normalizePuzzleKey(entry.sourceId)) : false;
                const isExpanded = expanded === entry.id;
                return (
                  <div key={entry.id} className="card archiveEntryCard">
                    <div className="archiveEntryHead">
                      <button className="btn primary" disabled={importingId === entry.id} onClick={() => onImport(entry)}>
                        {importingId === entry.id ? "Importing…" : "Import puzzle"}
                      </button>
                      <div className="archiveEntryMain">
                        <div className="archiveEntryTitle">
                          {solved ? "✓ " : ""}
                          {entry.title || "(untitled puzzle)"}
                        </div>
                        <div className="muted" style={{ fontSize: 13 }}>{entry.subTypeConstraints || "(no sub-type / constraints listed)"}</div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {entry.videoTitle ? `"${entry.videoTitle}"` : "\"(no video title)\""}
                          {entry.videoLength ? `   ${entry.videoLength}` : ""}
                        </div>
                      </div>
                      <button className="btn" onClick={() => setExpanded(isExpanded ? "" : entry.id)} title="Details">⋯</button>
                    </div>
                    {isExpanded && (
                      <div className="archiveDetails">
                        <div><strong>Puzzle name:</strong> {entry.title || "—"}</div>
                        <div><strong>Puzzle author:</strong> {entry.puzzleAuthor || "—"}</div>
                        <div><strong>Video title:</strong> {entry.videoTitle || "—"}</div>
                        <div><strong>Video host:</strong> {entry.videoHost || "—"}</div>
                        <div><strong>Video length:</strong> {entry.videoLength || "—"}</div>
                        <div><strong>Video date:</strong> {entry.videoDate || "—"}</div>
                        <div className="row">
                          <a className="btn" href={entry.sudokuPadUrl} target="_blank" rel="noreferrer noopener" aria-disabled={!entry.sudokuPadUrl}>
                            Open SudokuPad
                          </a>
                          <a className="btn" href={entry.youtubeUrl} target="_blank" rel="noreferrer noopener" aria-disabled={!entry.youtubeUrl}>
                            Open YouTube
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!loading && !filteredRows.length && !error && <div className="muted">No archive puzzles match the current search/filter.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
