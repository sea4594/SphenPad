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
const ARCHIVE_VIDEO_TYPE_SUDOKU = "sudoku";
const ARCHIVE_EDIT_CELL_TO_LINK_SEARCH_WINDOW = 1200;
const SUDOKUPAD_ICON_URL = "https://sudokupad.app/images/sudokupad_square_logo.png";
const YOUTUBE_ICON_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='1' y='4' width='22' height='16' rx='4' fill='%23ff0000'/%3E%3Cpolygon points='10,8 17,12 10,16' fill='white'/%3E%3C/svg%3E";

// Accepts either a full Google Sheets URL or a bare sheet ID.
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

function isSudokuPadUrl(value: string): boolean {
  return /^https?:\/\/(?:sudokupad\.app|app\.crackingthecryptic\.com)\//i.test(clean(value));
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

function buildArchiveCsvUrls(source: string): string[] {
  const trimmed = clean(source);
  if (!trimmed) return [];
  if (/^https?:\/\//i.test(trimmed) && !/\/spreadsheets\/d\//i.test(trimmed)) {
    return buildSourceCandidates(trimmed);
  }
  const sheetMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = sheetMatch?.[1] ?? trimmed;
  const gidMatch = trimmed.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch?.[1] ?? "";
  const gidSuffix = gid ? `&gid=${encodeURIComponent(gid)}` : "";
  const baseUrls = [
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidSuffix}`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv${gidSuffix}`,
  ];
  return baseUrls.flatMap(buildSourceCandidates);
}

function buildArchiveEditUrls(source: string): string[] {
  const trimmed = clean(source);
  if (!trimmed) return [];
  const sheetMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = sheetMatch?.[1] ?? trimmed;
  const gidMatch = trimmed.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch?.[1] ?? "0";
  const baseUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit?gid=${encodeURIComponent(gid)}`;
  return buildSourceCandidates(baseUrl);
}

async function fetchArchiveCsv(): Promise<string> {
  const urls = buildArchiveCsvUrls(CTC_ARCHIVE_SHEET_SOURCE);
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

async function fetchArchiveSudokuPadLinks(): Promise<Map<string, string>> {
  const urls = buildArchiveEditUrls(CTC_ARCHIVE_SHEET_SOURCE);
  let html = "";
  for (const url of urls) {
    try {
      const res = (await Promise.race([fetch(url), timeout(12000)])) as Response;
      if (!res.ok) continue;
      const text = await res.text();
      if (/sudokupad\.app|app\.crackingthecryptic\.com/i.test(text)) {
        html = text;
        break;
      }
    } catch {
      // try next source candidate
    }
  }
  const linksByUrlCell = new Map<string, string>();
  if (!html) return linksByUrlCell;
  const patterns = [
    new RegExp(
      `\\\\"3\\\\":\\[2,\\\\"([A-Z]+\\\\d+)\\\\"\\][\\\\s\\\\S]{0,${ARCHIVE_EDIT_CELL_TO_LINK_SEARCH_WINDOW}}?\\\\"24\\\\":\\\\"(https?:\\\\/\\\\/(?:sudokupad\\\\.app|app\\\\.crackingthecryptic\\\\.com)[^\\\\"]+)\\\\"`,
      "gi"
    ),
    new RegExp(
      `"3":\\[2,"([A-Z]+\\d+)"\\][\\s\\S]{0,${ARCHIVE_EDIT_CELL_TO_LINK_SEARCH_WINDOW}}?"24":"(https?:\\/\\/(?:sudokupad\\.app|app\\.crackingthecryptic\\.com)[^"]+)"`,
      "gi"
    ),
  ];
  for (const re of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = re.exec(html))) {
      const urlCell = clean(match[1]).toUpperCase();
      const rawUrl = clean(match[2]).replace(/\\u003d/g, "=").replace(/\\\//g, "/");
      const url = clean(rawUrl);
      if (urlCell && url && !linksByUrlCell.has(urlCell)) {
        linksByUrlCell.set(urlCell, url);
      }
    }
  }
  return linksByUrlCell;
}

function findIndexByAliases(headers: string[], aliases: string[]) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases.map(normalizeHeader)) {
    const idx = normalized.findIndex((h) => h === alias || h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseArchiveRows(csv: string, sudokuPadLinksByUrlCell: Map<string, string>): ArchiveEntry[] {
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
  const iVideoType = findIndexByAliases(header, ["video type", "type"]);
  const iCollection = findIndexByAliases(header, ["collection", "series"]);
  const iSudokuPad = findIndexByAliases(header, ["sudokupad", "sudoku pad", "puzzle link", "sp"]);
  const iYoutube = findIndexByAliases(header, ["youtube", "video link", "youtube link"]);
  const iUrlCell = findIndexByAliases(header, ["url cell"]);

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
      const videoType = byIdx(iVideoType);
      const collection = byIdx(iCollection);
      const sudokuPadFromColumn = byIdx(iSudokuPad);
      const youtubeFromColumn = byIdx(iYoutube);
      const urlCell = byIdx(iUrlCell).replace(/\$/g, "").toUpperCase();
      const sudokuPadFromUrlCell = sudokuPadLinksByUrlCell.get(urlCell) ?? "";
      const sudokuPadFromAnyColumn = row.find((cell) => isSudokuPadUrl(cell ?? ""))?.trim() ?? "";
      const sudokuPadUrl =
        (isSudokuPadUrl(sudokuPadFromUrlCell) ? sudokuPadFromUrlCell : "") ||
        (isSudokuPadUrl(sudokuPadFromColumn) ? sudokuPadFromColumn : "") ||
        (isSudokuPadUrl(sudokuPadFromAnyColumn) ? sudokuPadFromAnyColumn : "");
      const youtubeUrl =
        youtubeFromColumn ||
        row.find((cell) => /youtu\.?be|youtube\.com/i.test(cell ?? ""))?.trim() ||
        "";
      const sourceId = sudokuPadUrl;
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
        videoType,
        collection,
        sudokuPadUrl,
        youtubeUrl,
        sourceId,
      } satisfies ArchiveEntry;
    })
    .filter((entry) => clean(entry.videoType).toLowerCase() === ARCHIVE_VIDEO_TYPE_SUDOKU)
    .filter((entry) => entry.title || entry.sudokuPadUrl || entry.videoTitle);
}

export function CtCArchivePage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      const [csv, sudokuPadLinksByUrlCell] = await Promise.all([fetchArchiveCsv(), fetchArchiveSudokuPadLinks()]);
      setRows(parseArchiveRows(csv, sudokuPadLinksByUrlCell));
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
    const minSeconds = minLength ? parseMinutesToSeconds(minLength) : null;
    const maxSeconds = maxLength ? parseMinutesToSeconds(maxLength) : null;

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
      setUiMessage("No SudokuPad link found.");
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
            </div>
            <div className="archiveFilterRow" style={{ marginTop: 8 }}>
              <select className="btn menuControlSelect" value={hostFilter} onChange={(e) => setHostFilter(e.target.value)}>
                {hosts.map((v) => <option key={v} value={v}>{v === "all" ? "Host: All" : `Host: ${v}`}</option>)}
              </select>
              <select className="btn menuControlSelect" value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)}>
                {authors.map((v) => <option key={v} value={v}>{v === "all" ? "Author: All" : `Author: ${v}`}</option>)}
              </select>
              <select className="btn menuControlSelect" value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}>
                {collections.map((v) => <option key={v} value={v}>{v === "all" ? "Collection: All" : `Collection: ${v}`}</option>)}
              </select>
              <input className="url archiveLenInput" placeholder="Min length (minutes)" value={minLength} onChange={(e) => setMinLength(e.target.value)} />
              <input className="url archiveLenInput" placeholder="Max length (minutes)" value={maxLength} onChange={(e) => setMaxLength(e.target.value)} />
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
                const solved = entry.sourceId ? completedKeys.has(normalizePuzzleKey(entry.sourceId)) : false;
                const display = (value: string) => clean(value) || "~";
                return (
                  <div key={entry.id} className="card archiveEntryCard">
                    <div className="archiveEntryHead">
                      <div className="archiveEntryMain archiveDetailsGrid">
                        <button className="btn primary archiveImportBtn" disabled={importingId === entry.id} onClick={() => onImport(entry)} aria-label="Import Puzzle">
                          {importingId === entry.id ? "Importing…" : <span className="archiveImportText"><span>IMPORT</span><span>PUZZLE</span></span>}
                        </button>
                        {entry.sudokuPadUrl ? (
                          <a className="btn archiveOpenIcon" href={entry.sudokuPadUrl} target="_blank" rel="noreferrer noopener" title="Open SudokuPad" aria-label="Open SudokuPad">
                            <img src={SUDOKUPAD_ICON_URL} alt="" className="archiveIconImage" />
                          </a>
                        ) : (
                          <button type="button" className="btn archiveOpenIcon" disabled title="Open SudokuPad" aria-label="Open SudokuPad">
                            <img src={SUDOKUPAD_ICON_URL} alt="" className="archiveIconImage" />
                          </button>
                        )}
                        <div className="archiveInfoText">
                          <div className="archiveEntryTitle">
                            {solved ? "✓ " : ""}
                            {display(entry.title)}
                            <span className="archiveEntryCollection"> ({display(entry.collection)})</span>
                          </div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {display(entry.puzzleAuthor)} • {display(entry.subTypeConstraints)}
                          </div>
                        </div>
                        {entry.youtubeUrl ? (
                          <a className="btn archiveOpenIcon" href={entry.youtubeUrl} target="_blank" rel="noreferrer noopener" title="Open YouTube" aria-label="Open YouTube">
                            <img src={YOUTUBE_ICON_DATA_URL} alt="" className="archiveIconImage" />
                          </a>
                        ) : (
                          <button type="button" className="btn archiveOpenIcon" disabled title="Open YouTube" aria-label="Open YouTube">
                            <img src={YOUTUBE_ICON_DATA_URL} alt="" className="archiveIconImage" />
                          </button>
                        )}
                        <div className="archiveInfoText">
                          <div style={{ fontSize: 14 }}>{display(entry.videoTitle)}</div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {display(entry.videoHost)} • {display(entry.videoDate)} • {formatDurationHm(entry.videoLengthSeconds)}
                          </div>
                        </div>
                      </div>
                    </div>
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
