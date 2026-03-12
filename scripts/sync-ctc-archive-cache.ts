/**
 * Syncs the CtC archive cache.
 *
 * Run with:
 *   npm run sync-archive-cache
 *
 * Writes:
 *   public/archive/archive-manifest.json  - list of all archive entries (metadata)
 *   public/archive/puzzles/*.json         - raw puzzle payload per entry
 *
 * Incremental:
 *   skips puzzle files that already exist on disk.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

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

type SheetCell = XLSX.CellObject & {
  l?: {
    Target?: string;
  };
};

type ParsedSheetRow = {
  values: string[];
  hyperlinks: string[];
};

const CTC_ARCHIVE_SHEET_SOURCE =
  "https://docs.google.com/spreadsheets/d/11TrxONoAWMvP8ibULZqtNwG4WWripAcPIS9J-wi3emc/edit#gid=0";

const ARCHIVE_VIDEO_TYPE_SUDOKU = "sudoku";
const SUDOKUPAD_API_BASE = "https://sudokupad.app/api/puzzle";
const SUDOKUPAD_URL_REGEX =
  /https?:\/\/(?:sudokupad\.app|app\.crackingthecryptic\.com)\/[^\s"'<>)]*/i;
const YOUTUBE_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s"'<>)]*/i;

const FETCH_CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 15_000;

const FALLBACK_TITLE_INDEX = 0;
const FALLBACK_CONSTRAINTS_INDEX = 1;
const FALLBACK_VIDEO_TITLE_INDEX = 2;
const FALLBACK_VIDEO_LENGTH_INDEX = 3;
const FALLBACK_VIDEO_DATE_INDEX = 4;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const MANIFEST_PATH = join(REPO_ROOT, "public", "archive", "archive-manifest.json");
const PUZZLES_DIR = join(REPO_ROOT, "public", "archive", "puzzles");

function clean(v: string | undefined | null): string {
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

async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const iter = items[Symbol.iterator]();

  async function worker(): Promise<void> {
    for (;;) {
      const result = iter.next();
      if (result.done) break;
      await fn(result.value);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

function normalizeHeader(v: string): string {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findIndexByAliases(headers: string[], aliases: string[]): number {
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
  return (
    sourceId
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 200) || "unknown"
  );
}

function looksLikeSudokuPadUrl(value: string): boolean {
  return SUDOKUPAD_URL_REGEX.test(clean(value));
}

function looksLikeYouTubeUrl(value: string): boolean {
  return YOUTUBE_URL_REGEX.test(clean(value));
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const next = clean(value);
    if (next) return next;
  }
  return "";
}

function buildSheetExportXlsxUrl(source: string): string {
  const trimmed = clean(source);
  const sheetMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = sheetMatch?.[1] ?? trimmed;
  const gidMatch = trimmed.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx&gid=${encodeURIComponent(gid)}`;
}

async function fetchWorkbook(): Promise<XLSX.WorkBook> {
  const url = buildSheetExportXlsxUrl(CTC_ARCHIVE_SHEET_SOURCE);
  log(`Fetching workbook: ${url}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching workbook`);
  const buffer = await res.arrayBuffer();
  return XLSX.read(buffer, { type: "array" });
}

function pickWorksheet(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  const preferredName =
    workbook.SheetNames.find((name) => clean(name).toLowerCase() === "external") ??
    workbook.SheetNames[0];

  if (!preferredName) {
    throw new Error("Workbook contains no sheets");
  }

  const sheet = workbook.Sheets[preferredName];
  if (!sheet) {
    throw new Error(`Worksheet not found: ${preferredName}`);
  }

  return sheet;
}

function extractHyperlinkFromCell(cell: SheetCell | undefined): string {
  const direct = clean(cell?.l?.Target);
  if (direct) return direct;

  const formula = clean(typeof cell?.f === "string" ? cell.f : "");
  if (formula) {
    const match = formula.match(/HYPERLINK\(\s*"([^"]+)"/i);
    if (match?.[1]) return clean(match[1]);
  }

  const rawValue =
    typeof cell?.w === "string"
      ? clean(cell.w)
      : cell?.v == null
        ? ""
        : clean(String(cell.v));

  if (looksLikeSudokuPadUrl(rawValue) || looksLikeYouTubeUrl(rawValue)) {
    return rawValue;
  }

  return "";
}

function parseWorksheetRows(sheet: XLSX.WorkSheet): ParsedSheetRow[] {
  const ref = sheet["!ref"];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const rows: ParsedSheetRow[] = [];

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const values: string[] = [];
    const hyperlinks: string[] = [];

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address] as SheetCell | undefined;

      const value =
        typeof cell?.w === "string"
          ? clean(cell.w)
          : cell?.v == null
            ? ""
            : clean(String(cell.v));

      values.push(value);
      hyperlinks.push(extractHyperlinkFromCell(cell));
    }

    if (values.some((v) => clean(v)) || hyperlinks.some((v) => clean(v))) {
      rows.push({ values, hyperlinks });
    }
  }

  return rows;
}

function parseArchiveRows(rows: ParsedSheetRow[]): ArchiveEntry[] {
  if (!rows.length) return [];

  const header = rows[0].values;
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

  return body
    .map((row, idx) => {
      const byIdx = (i: number, fallback = "") => clean(i >= 0 ? row.values[i] : fallback);
      const linkByIdx = (i: number) => clean(i >= 0 ? row.hyperlinks[i] : "");

      const title = byIdx(iTitle, row.values[FALLBACK_TITLE_INDEX] ?? "");
      const subTypeConstraints = byIdx(iConstraints, row.values[FALLBACK_CONSTRAINTS_INDEX] ?? "");
      const videoTitle = byIdx(iVideoTitle, row.values[FALLBACK_VIDEO_TITLE_INDEX] ?? "");
      const videoLength = byIdx(iVideoLength, row.values[FALLBACK_VIDEO_LENGTH_INDEX] ?? "");
      const videoDate = byIdx(iVideoDate, row.values[FALLBACK_VIDEO_DATE_INDEX] ?? "");
      const parsedDateTs = Date.parse(videoDate);
      const puzzleAuthor = byIdx(iPuzzleAuthor);
      const videoHost = byIdx(iVideoHost);
      const videoType = byIdx(iVideoType);
      const collection = byIdx(iCollection);

      const sudokuPadUrl = firstNonEmpty(
        linkByIdx(iSudokuPad),
        looksLikeSudokuPadUrl(byIdx(iSudokuPad)) ? byIdx(iSudokuPad) : "",
        row.hyperlinks.find((value) => looksLikeSudokuPadUrl(value)),
        row.values.find((value) => looksLikeSudokuPadUrl(value)),
      );

      const youtubeUrl = firstNonEmpty(
        linkByIdx(iYoutube),
        looksLikeYouTubeUrl(byIdx(iYoutube)) ? byIdx(iYoutube) : "",
        row.hyperlinks.find((value) => looksLikeYouTubeUrl(value)),
        row.values.find((value) => looksLikeYouTubeUrl(value)),
      );

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

function looksLikePuzzlePayload(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^]/i.test(t)) return false;
  if (/^(scl|ctc|fpuz|fpuzzles)/i.test(t)) return true;
  if (/^[\[{]/.test(t)) return true;
  return false;
}

async function fetchPuzzlePayload(sourceId: string): Promise<string | null> {
  const encoded = sourceId
    .split("/")
    .map(encodeURIComponent)
    .join("/");

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

async function main() {
  mkdirSync(PUZZLES_DIR, { recursive: true });

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

  const workbook = await fetchWorkbook();
  const sheet = pickWorksheet(workbook);
  const sheetRows = parseWorksheetRows(sheet);
  if (sheetRows.length < 2) {
    throw new Error("Unexpected workbook payload (too few rows)");
  }

  const entries = parseArchiveRows(sheetRows);
  log(`Parsed ${entries.length} archive entries.`);

  const withSudokuPad = entries.filter((e) => !!e.sudokuPadUrl).length;
  const withYouTube = entries.filter((e) => !!e.youtubeUrl).length;
  log(`Entries with SudokuPad URL: ${withSudokuPad}/${entries.length}`);
  log(`Entries with YouTube URL:   ${withYouTube}/${entries.length}`);

  const missingSudokuPad = entries.filter((e) => !e.sudokuPadUrl);
  if (missingSudokuPad.length) {
    log("Missing SudokuPad URLs:");
    for (const entry of missingSudokuPad.slice(0, 20)) {
      log(`  - ${entry.title || "(untitled)"} | ${entry.videoDate} | ${entry.videoTitle}`);
    }
    throw new Error(`Found ${missingSudokuPad.length} sudoku archive entries without SudokuPad URLs`);
  }

  const toFetch = entries.filter((e) => {
    if (!e.sourceId) return false;
    const puzzlePath = join(PUZZLES_DIR, `${e.stableKey}.json`);
    return !existsSync(puzzlePath);
  });

  if (toFetch.length === 0) {
    log("All puzzle payloads already cached.\nNothing to fetch.");
  } else {
    log(`Fetching ${toFetch.length} new puzzle payload(s) (concurrency=${FETCH_CONCURRENCY})…`);

    let fetched = 0;
    let skipped = 0;

    await withConcurrency(toFetch, FETCH_CONCURRENCY, async (entry) => {
      const payload = await fetchPuzzlePayload(entry.sourceId);
      if (payload) {
        const cache: PuzzleCache = {
          stableKey: entry.stableKey,
          payload,
        };
        const puzzlePath = join(PUZZLES_DIR, `${entry.stableKey}.json`);
        writeFileSync(puzzlePath, JSON.stringify(cache), "utf8");
        fetched += 1;
        log(`  OK ${entry.stableKey}`);
      } else {
        skipped += 1;
      }
    });

    log(`Done: ${fetched} fetched, ${skipped} skipped.`);
  }

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
