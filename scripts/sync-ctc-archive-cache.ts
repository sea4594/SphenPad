/**
 * Syncs the CtC archive cache.
 *
 * Run with: npm run sync-archive-cache
 *
 * Writes:
 *   public/archive/archive-manifest.json   – list of all archive entries (metadata)
 *   public/archive/puzzles/<key>.json      – raw puzzle payload per entry
 *
 * Incremental: skips puzzle files that already exist on disk.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
};

type Manifest = {
  generatedAt: string;
  entries: ArchiveEntry[];
};

type PuzzleCache = {
  stableKey: string;
  payload: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CTC_ARCHIVE_SHEET_SOURCE =
  "https://docs.google.com/spreadsheets/d/11TrxONoAWMvP8ibULZqtNwG4WWripAcPIS9J-wi3emc/edit#gid=0";

const EDIT_PAGE_CELL_TEXT_KEY = "7";
const EDIT_PAGE_CELL_HYPERLINK_KEY = "24";
const EDIT_PAGE_SP_HYPERLINK_PATTERN = `\\\\"${EDIT_PAGE_CELL_TEXT_KEY}\\\\":\\[2,\\\\"🔢\\\\"\\][\\s\\S]*?\\\\"${EDIT_PAGE_CELL_HYPERLINK_KEY}\\\\":\\\\"([^\\\\"]+)\\\\"`;
const SUDOKUPAD_URL_IN_ROW_REGEX =
  /https?:\/\/(?:sudokupad\.app|app\.crackingthecryptic\.com)\//i;
const ARCHIVE_VIDEO_TYPE_SUDOKU = "sudoku";
const SP_ICON_TEXT = "🔢";

const SUDOKUPAD_API_BASE = "https://sudokupad.app/api/puzzle";
// Limit parallel SudokuPad API requests to avoid being rate-limited.
const FETCH_CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 15_000;

const FALLBACK_TITLE_INDEX = 0;
const FALLBACK_CONSTRAINTS_INDEX = 1;
const FALLBACK_VIDEO_TITLE_INDEX = 2;
const FALLBACK_VIDEO_LENGTH_INDEX = 3;
const FALLBACK_VIDEO_DATE_INDEX = 4;

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const MANIFEST_PATH = join(REPO_ROOT, "public", "archive", "archive-manifest.json");
const PUZZLES_DIR = join(REPO_ROOT, "public", "archive", "puzzles");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clean(v: string | undefined): string {
  return (v ?? "").trim();
}

function log(msg: string) {
  process.stdout.write(msg + "\n");
}

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Run tasks with a bounded concurrency pool. */
async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const iter = items[Symbol.iterator]();
  async function worker(): Promise<void> {
    for (;;) {
      const result = iter.next();
      if (result.done) break;
      await fn(result.value);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
}

// ---------------------------------------------------------------------------
// Google Sheets parsing (mirrors CtCArchivePage.tsx logic)
// ---------------------------------------------------------------------------

function decodeGoogleEscaped(v: string): string {
  return v
    .replace(/\\u003d/gi, "=")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u003a/gi, ":")
    .replace(/\\u003f/gi, "?");
}

function parseGvizJsonRows(payload: string): string[][] {
  const prefix = "google.visualization.Query.setResponse(";
  const start = payload.indexOf(prefix);
  if (start < 0) return [];
  let jsonText = payload.slice(start + prefix.length).trim();
  if (jsonText.endsWith(");")) jsonText = jsonText.slice(0, -2);
  const parsed = JSON.parse(jsonText) as {
    table?: {
      cols?: Array<{ label?: string }>;
      rows?: Array<{ c?: Array<{ v?: unknown } | null> }>;
    };
  };
  const cols = parsed.table?.cols ?? [];
  const rows = parsed.table?.rows ?? [];
  const header = cols.map((c) => clean(c.label));
  const body = rows.map((row) =>
    (row.c ?? []).map((cell) => {
      if (!cell || cell.v == null) return "";
      const value = cell.v;
      if (typeof value === "string") return clean(value);
      return clean(String(value));
    })
  );
  return [header, ...body].filter((r) => r.some((c) => clean(c)));
}

async function fetchGvizRows(): Promise<string[][]> {
  const sheetMatch = CTC_ARCHIVE_SHEET_SOURCE.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = sheetMatch?.[1] ?? "";
  const gidMatch = CTC_ARCHIVE_SHEET_SOURCE.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch?.[1] ?? "";
  const gidSuffix = gid ? `&gid=${encodeURIComponent(gid)}` : "";
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json${gidSuffix}`;

  log(`Fetching sheet: ${url}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching sheet`);
  const text = await res.text();
  const rows = parseGvizJsonRows(text);
  if (rows.length < 2) throw new Error("Unexpected sheet payload (too few rows)");
  return rows;
}

async function fetchSudokuPadLinks(): Promise<string[]> {
  log(`Fetching SP hyperlinks from sheet edit page…`);
  try {
    const res = await fetchWithTimeout(CTC_ARCHIVE_SHEET_SOURCE);
    if (!res.ok) return [];
    const text = await res.text();
    const links: string[] = [];
    const linkRegex = new RegExp(EDIT_PAGE_SP_HYPERLINK_PATTERN, "g");
    for (const match of text.matchAll(linkRegex)) {
      const decoded = clean(decodeGoogleEscaped(match[1] ?? ""));
      if (decoded) links.push(decoded);
    }
    return links;
  } catch (err) {
    log(`Warning: could not fetch SP hyperlinks: ${String(err)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Row parsing
// ---------------------------------------------------------------------------

function normalizeHeader(v: string) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findIndexByAliases(headers: string[], aliases: string[]) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases.map(normalizeHeader)) {
    const idx = normalized.findIndex((h) => h === alias || h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
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

function toStableKey(sourceId: string): string {
  return sourceId
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/, "")
    .slice(0, 200) || "unknown";
}

function looksLikeSudokuPadUrl(value: string): boolean {
  return SUDOKUPAD_URL_IN_ROW_REGEX.test(clean(value));
}

function pickSudokuPadUrl(
  row: string[],
  iSudokuPad: number,
  links: string[],
  linkIndexRef: { current: number }
): string {
  const fromColumn = clean(iSudokuPad >= 0 ? row[iSudokuPad] : "");
  if (looksLikeSudokuPadUrl(fromColumn)) return fromColumn;
  const discovered = clean(
    row.find((cell) => SUDOKUPAD_URL_IN_ROW_REGEX.test(cell ?? ""))?.trim() ?? ""
  );
  if (fromColumn === SP_ICON_TEXT) {
    const fromHyperlink = clean(links[linkIndexRef.current] ?? "");
    linkIndexRef.current += 1;
    return fromHyperlink || discovered;
  }
  return discovered;
}

function parseArchiveRows(rows: string[][], sudokuPadLinks: string[] = []): ArchiveEntry[] {
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
  const iSudokuPad = findIndexByAliases(header, ["sp", "sudokupad", "sudoku pad", "puzzle link", "sudokupadlink"]);
  const iYoutube = findIndexByAliases(header, ["youtube", "video link", "youtube link"]);

  const linkIndexRef = { current: 0 };
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
      const youtubeFromColumn = byIdx(iYoutube);
      const sudokuPadUrl = pickSudokuPadUrl(row, iSudokuPad, sudokuPadLinks, linkIndexRef);
      const youtubeUrl =
        youtubeFromColumn ||
        row.find((cell) => /youtu\.?be|youtube\.com/i.test(cell ?? ""))?.trim() ||
        "";
      const sourceId = extractSourceId(sudokuPadUrl);
      const stableKey = toStableKey(sourceId);
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
        stableKey,
      } satisfies ArchiveEntry;
    })
    .filter((entry) => clean(entry.videoType).toLowerCase() === ARCHIVE_VIDEO_TYPE_SUDOKU)
    .filter((entry) => entry.title || entry.sudokuPadUrl || entry.videoTitle);
}

// ---------------------------------------------------------------------------
// SudokuPad puzzle payload fetching
// ---------------------------------------------------------------------------

function looksLikePuzzlePayload(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^<!doctype html/i.test(t) || /^<html[\s>]/i.test(t)) return false;
  if (/^(scl|ctc|fpuz|fpuzzles)/i.test(t)) return true;
  if (/^[[{]/.test(t)) return true;
  return false;
}

async function fetchPuzzlePayload(sourceId: string): Promise<string | null> {
  const encoded = sourceId.split("/").map(encodeURIComponent).join("/");
  const url = `${SUDOKUPAD_API_BASE}/${encoded}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      log(`  SKIP ${sourceId}: HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    if (!looksLikePuzzlePayload(text)) {
      log(`  SKIP ${sourceId}: non-puzzle response`);
      return null;
    }
    return text;
  } catch (err) {
    log(`  SKIP ${sourceId}: ${String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Ensure output directories exist.
  mkdirSync(PUZZLES_DIR, { recursive: true });

  // Load existing manifest (if any) for incremental detection.
  let existingEntryIds = new Set<string>();
  if (existsSync(MANIFEST_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
      existingEntryIds = new Set((existing.entries ?? []).map((e) => e.id));
      log(`Loaded existing manifest with ${existingEntryIds.size} entries.`);
    } catch {
      log("Could not parse existing manifest; will regenerate.");
    }
  }

  // 1. Fetch sheet data.
  const [rows, sudokuPadLinks] = await Promise.all([
    fetchGvizRows(),
    fetchSudokuPadLinks(),
  ]);

  // 2. Parse entries.
  const entries = parseArchiveRows(rows, sudokuPadLinks);
  log(`Parsed ${entries.length} archive entries.`);

  // 3. Fetch puzzle payloads for entries that don't have a cached file yet.
  const toFetch = entries.filter((e) => {
    if (!e.sourceId) return false;
    const puzzlePath = join(PUZZLES_DIR, `${e.stableKey}.json`);
    return !existsSync(puzzlePath);
  });

  if (toFetch.length === 0) {
    log("All puzzle payloads already cached. Nothing to fetch.");
  } else {
    log(`Fetching ${toFetch.length} new puzzle payload(s) (concurrency=${FETCH_CONCURRENCY})…`);
    let fetched = 0;
    let skipped = 0;

    await withConcurrency(toFetch, FETCH_CONCURRENCY, async (entry) => {
      const payload = await fetchPuzzlePayload(entry.sourceId);
      if (payload) {
        const cache: PuzzleCache = { stableKey: entry.stableKey, payload };
        const puzzlePath = join(PUZZLES_DIR, `${entry.stableKey}.json`);
        writeFileSync(puzzlePath, JSON.stringify(cache), "utf8");
        fetched++;
        log(`  OK   ${entry.stableKey}`);
      } else {
        skipped++;
      }
    });

    log(`Done: ${fetched} fetched, ${skipped} skipped.`);
  }

  // 4. Write manifest.
  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    entries,
  };
  const newCount = entries.filter((e) => !existingEntryIds.has(e.id)).length;
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest), "utf8");
  log(`Wrote manifest: ${entries.length} entries (${newCount} new).`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${String(err)}\n`);
  process.exit(1);
});
