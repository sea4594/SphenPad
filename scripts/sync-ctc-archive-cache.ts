/**
 * Syncs the CtC archive cache.
 *
 * Run with:
 *   npm run sync-archive-cache
 *
 * Writes:
 *   public/archive/archive-manifest.json  - list of all archive entries (metadata)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

type ParsedSheetRow = string[];

const CTC_ARCHIVE_SHEET_SOURCE =
  "https://docs.google.com/spreadsheets/d/11TrxONoAWMvP8ibULZqtNwG4WWripAcPIS9J-wi3emc/edit#gid=0";

const ARCHIVE_VIDEO_TYPE_SUDOKU = "sudoku";
const SUDOKUPAD_URL_REGEX =
  /https?:\/\/(?:sudokupad\.app|app\.crackingthecryptic\.com)\/[^\s"'<>)]*/i;
const YOUTUBE_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s"'<>)]*/i;
const HTTP_URL_REGEX = /^https?:\/\//i;

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

function clean(v: string | undefined | null): string {
  return (v ?? "").trim();
}

function log(msg: string) {
  process.stdout.write(msg + "\n");
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function writeTextIfChanged(path: string, next: string): boolean {
  if (existsSync(path)) {
    const prev = readFileSync(path, "utf8");
    if (prev === next) return false;
  }

  writeFileSync(path, next, "utf8");
  return true;
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
  const normalizedHeaders = headers.map(normalizeHeader);
  const normalizedAliases = aliases.map(normalizeHeader).filter(Boolean);

  for (const alias of normalizedAliases) {
    const exactIdx = normalizedHeaders.findIndex((header) => header === alias);
    if (exactIdx >= 0) return exactIdx;
  }

  for (const alias of normalizedAliases) {
    const containsIdx = normalizedHeaders.findIndex((header) => header.includes(alias));
    if (containsIdx >= 0) return containsIdx;
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

function looksLikeHttpUrl(value: string): boolean {
  return HTTP_URL_REGEX.test(clean(value));
}

function normalizeSudokuPadLink(value: string): string {
  const url = clean(value);
  if (!url) return "";
  if (!looksLikeHttpUrl(url)) return "";
  return url;
}

function normalizeYouTubeLink(value: string): string {
  const url = clean(value);
  if (!url) return "";
  return looksLikeYouTubeUrl(url) ? url : "";
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

  let res: Response;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    throw new Error(`Failed to fetch workbook export: ${String(err)}`);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} fetching workbook`);

  let buffer: ArrayBuffer;
  try {
    buffer = await res.arrayBuffer();
  } catch (err) {
    throw new Error(`Failed to read workbook export response body: ${String(err)}`);
  }

  try {
    return XLSX.read(buffer, { type: "array" });
  } catch (err) {
    throw new Error(`Failed to parse workbook export as XLSX: ${String(err)}`);
  }
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

function parseWorksheetRows(sheet: XLSX.WorkSheet): ParsedSheetRow[] {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as Array<Array<string | number | boolean | null | undefined>>;

  return rows
    .map((row) => row.map((value) => clean(String(value ?? ""))))
    .filter((row) => row.some((value) => value));
}

function parseArchiveRows(rows: ParsedSheetRow[]): ArchiveEntry[] {
  if (!rows.length) return [];

  const header = rows[0];
  const body = rows.slice(1);

  const iTitle = findIndexByAliases(header, ["puzzle title", "puzzle name", "title"]);
  const iConstraints = findIndexByAliases(header, ["puzzle sub-type / constraints", "constraints", "sub-type"]);
  const iVideoTitle = findIndexByAliases(header, ["video title", "title"]);
  const iVideoLength = findIndexByAliases(header, ["video length", "duration", "length"]);
  const iVideoDate = findIndexByAliases(header, ["video date", "date"]);
  const iPuzzleAuthor = findIndexByAliases(header, ["setter", "puzzle author", "author"]);
  const iVideoHost = findIndexByAliases(header, ["host/solver", "video host", "host", "channel"]);
  const iVideoType = findIndexByAliases(header, ["video type", "type"]);
  const iCollection = findIndexByAliases(header, ["collection", "series"]);
  const iSudokuPad = findIndexByAliases(header, ["puzzle link", "sudoku pad link", "sudokupad link", "sudokupad"]);
  const iYoutube = findIndexByAliases(header, ["link yt", "youtube link", "youtube", "video link"]);

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

      const sudokuPadUrl = normalizeSudokuPadLink(byIdx(iSudokuPad));
      const youtubeUrl = normalizeYouTubeLink(byIdx(iYoutube));

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

async function resolveSudokuPadRedirect(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(url);
    const finalUrl = clean(res.url);
    return looksLikeSudokuPadUrl(finalUrl) ? finalUrl : "";
  } catch {
    return "";
  }
}

async function normalizeNonDirectSudokuPadLinks(entries: ArchiveEntry[]): Promise<void> {
  const nonDirectUrls = Array.from(
    new Set(
      entries
        .map((entry) => clean(entry.sudokuPadUrl))
        .filter((url) => url && !looksLikeSudokuPadUrl(url)),
    ),
  );

  if (!nonDirectUrls.length) return;

  log(`Resolving ${nonDirectUrls.length} non-direct SudokuPad link(s)...`);

  const resolvedByUrl = new Map<string, string>();
  await withConcurrency(nonDirectUrls, FETCH_CONCURRENCY, async (url) => {
    const resolved = await resolveSudokuPadRedirect(url);
    if (resolved) resolvedByUrl.set(url, resolved);
  });

  let resolvedCount = 0;
  let droppedCount = 0;

  for (const entry of entries) {
    const current = clean(entry.sudokuPadUrl);
    if (!current || looksLikeSudokuPadUrl(current)) continue;

    const resolved = resolvedByUrl.get(current);
    if (!resolved) {
      entry.sudokuPadUrl = "";
      entry.sourceId = "";
      entry.stableKey = "unknown";
      droppedCount += 1;
      continue;
    }

    entry.sudokuPadUrl = resolved;
    entry.sourceId = extractSourceId(resolved);
    entry.stableKey = toStableKey(entry.sourceId);
    resolvedCount += 1;
  }

  log(`Non-direct link normalization: ${resolvedCount} resolved, ${droppedCount} removed.`);
}

async function main() {
  let existingEntryIds = new Set<string>();
  let existingManifest: Manifest | null = null;

  if (existsSync(MANIFEST_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
      existingManifest = existing;
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
    throw new Error("Workbook export did not contain enough rows in the selected sheet.");
  }

  const entries = parseArchiveRows(sheetRows);
  await normalizeNonDirectSudokuPadLinks(entries);

  log(`Parsed ${entries.length} archive entries.`);

  const withSudokuPad = entries.filter((e) => !!e.sudokuPadUrl).length;
  const withYouTube = entries.filter((e) => !!e.youtubeUrl).length;
  log(`Entries with SudokuPad URL: ${withSudokuPad}/${entries.length}`);
  log(`Entries with YouTube URL:   ${withYouTube}/${entries.length}`);

  if (withSudokuPad === 0) {
    throw new Error("No SudokuPad URLs were found. Check the Puzzle Link column in the source sheet.");
  }

  const missingSudokuPad = entries.filter((e) => !e.sudokuPadUrl);
  if (missingSudokuPad.length) {
    log("Missing SudokuPad URLs:");
    for (const entry of missingSudokuPad.slice(0, 20)) {
      log(`  - ${entry.title || "(untitled)"} | ${entry.videoDate} | ${entry.videoTitle}`);
    }
  }

  const manifest: Manifest = {
    generatedAt:
      existingManifest != null &&
      toJson(existingManifest.entries ?? []) === toJson(entries) &&
      typeof existingManifest.generatedAt === "string" &&
      clean(existingManifest.generatedAt)
        ? existingManifest.generatedAt
        : new Date().toISOString(),
    entries,
  };

  const newCount = entries.filter((e) => !existingEntryIds.has(e.id)).length;
  const manifestText = toJson(manifest);
  const didWriteManifest = writeTextIfChanged(MANIFEST_PATH, manifestText);
  if (didWriteManifest) {
    log(`Wrote manifest: ${entries.length} entries (${newCount} new).`);
  } else {
    log(`Manifest unchanged: ${entries.length} entries (${newCount} new).`);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${String(err)}\n`);
  process.exit(1);
});
