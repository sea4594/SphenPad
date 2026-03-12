/**
 * Syncs the CtC archive cache.
 *
 * Run with:
 *   npm run sync-archive-cache
 *
 * Writes:
 *   public/archive/archive-manifest.json  - list of all archive entries (metadata)
 *   public/archive/puzzles/*.json         - cached SudokuPad payloads
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
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
  cacheKey: string;
};

type Manifest = {
  generatedAt: string;
  entries: ArchiveEntry[];
};

type PuzzleCacheRecord = {
  sourceId: string;
  stableKey: string;
  cacheKey: string;
  sudokuPadUrl: string;
  fetchedAt: string;
  payload: string;
};

type PuzzleCacheTarget = {
  sourceId: string;
  cacheKey: string;
  stableKey: string;
  sudokuPadUrl: string;
};

type PuzzleCacheSyncResult = {
  totalTargets: number;
  written: number;
  unchanged: number;
  failed: number;
  missingWithoutCache: number;
  removed: number;
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
const BARE_TINYURL_REGEX = /^(?:www\.)?tinyurl\.com\/[A-Za-z0-9_-]+(?:[/?#][^\s"'<>)]*)?$/i;
const ENCODED_SUDOKUPAD_URL_REGEX =
  /https?%3A%2F%2F(?:sudokupad\.app|app\.crackingthecryptic\.com)%2F[A-Za-z0-9%._~!$&'()*+,;=:@/-]+/i;

const FETCH_CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 15_000;
const SUDOKUPAD_API_BASE = "https://sudokupad.app/api/puzzle";

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

function ensureDirectory(path: string) {
  if (existsSync(path)) return;
  mkdirSync(path, { recursive: true });
}

function buildPuzzleCachePath(cacheKey: string): string {
  return join(PUZZLES_DIR, `${cacheKey}.json`);
}

function listPuzzleCacheFiles(): string[] {
  ensureDirectory(PUZZLES_DIR);
  return readdirSync(PUZZLES_DIR).filter((name) => name.endsWith(".json"));
}

function readPuzzleCacheRecord(path: string): PuzzleCacheRecord | null {
  if (!existsSync(path)) return null;

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PuzzleCacheRecord>;
    const payload = typeof parsed.payload === "string" ? parsed.payload : "";
    const sourceId = clean(parsed.sourceId);
    if (!payload || !sourceId) return null;

    return {
      sourceId,
      stableKey: clean(parsed.stableKey) || toStableKey(sourceId),
      cacheKey: clean(parsed.cacheKey),
      sudokuPadUrl: clean(parsed.sudokuPadUrl),
      fetchedAt: clean(parsed.fetchedAt),
      payload,
    };
  } catch {
    return null;
  }
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

function isEmbeddedPuzzlePayload(sourceId: string): boolean {
  return /^(scl|ctc|fpuz|fpuzzles)/i.test(clean(sourceId));
}

function looksLikePuzzlePayload(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^<!doctype html/i.test(t) || /^<html[\s>]/i.test(t)) return false;
  if (/^(scl|ctc|fpuz|fpuzzles)/i.test(t)) return true;
  if (/^[[{]/.test(t)) return true;
  return false;
}

function buildSudokuPadApiUrl(sourceId: string): string {
  const encoded = sourceId.split("/").map(encodeURIComponent).join("/");
  return `${SUDOKUPAD_API_BASE}/${encoded}`;
}

async function fetchPuzzlePayload(sourceId: string): Promise<string> {
  const normalizedSourceId = clean(sourceId);
  if (!normalizedSourceId) throw new Error("Missing SudokuPad source ID");

  if (isEmbeddedPuzzlePayload(normalizedSourceId)) {
    return normalizedSourceId;
  }

  const url = buildSudokuPadApiUrl(normalizedSourceId);
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching puzzle payload for ${normalizedSourceId}`);
  }

  const payload = await res.text();
  if (!looksLikePuzzlePayload(payload)) {
    throw new Error(`Unexpected puzzle payload format for ${normalizedSourceId}`);
  }

  return payload;
}

function assignCacheKeys(entries: ArchiveEntry[]): void {
  const sourceToCacheKey = new Map<string, string>();
  const usedCacheKeys = new Set<string>();

  for (const entry of entries) {
    const sourceId = clean(entry.sourceId);
    if (!sourceId) {
      entry.cacheKey = "";
      continue;
    }

    const existingCacheKey = sourceToCacheKey.get(sourceId);
    if (existingCacheKey) {
      entry.cacheKey = existingCacheKey;
      continue;
    }

    const baseKey = toStableKey(sourceId);
    let candidate = baseKey;
    let suffix = 2;
    while (usedCacheKeys.has(candidate)) {
      candidate = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    sourceToCacheKey.set(sourceId, candidate);
    usedCacheKeys.add(candidate);
    entry.cacheKey = candidate;
  }
}

function buildPuzzleCacheTargets(entries: ArchiveEntry[]): PuzzleCacheTarget[] {
  const byCacheKey = new Map<string, PuzzleCacheTarget>();

  for (const entry of entries) {
    const sourceId = clean(entry.sourceId);
    const cacheKey = clean(entry.cacheKey || entry.stableKey);
    if (!sourceId || !cacheKey) continue;

    const existing = byCacheKey.get(cacheKey);
    if (existing) {
      if (existing.sourceId !== sourceId) {
        log(
          `WARN: cache key collision for ${cacheKey}; keeping ${existing.sourceId} and skipping ${sourceId}.`,
        );
      } else if (!existing.sudokuPadUrl && clean(entry.sudokuPadUrl)) {
        existing.sudokuPadUrl = clean(entry.sudokuPadUrl);
      }
      continue;
    }

    byCacheKey.set(cacheKey, {
      sourceId,
      cacheKey,
      stableKey: toStableKey(sourceId),
      sudokuPadUrl: clean(entry.sudokuPadUrl),
    });
  }

  return Array.from(byCacheKey.values()).sort((a, b) => a.cacheKey.localeCompare(b.cacheKey));
}

async function syncPuzzlePayloadCache(entries: ArchiveEntry[]): Promise<PuzzleCacheSyncResult> {
  ensureDirectory(PUZZLES_DIR);

  const targets = buildPuzzleCacheTargets(entries);
  const existingFiles = listPuzzleCacheFiles();
  const expectedFiles = new Set(targets.map((target) => `${target.cacheKey}.json`));

  let written = 0;
  let unchanged = 0;
  let failed = 0;
  let missingWithoutCache = 0;

  if (targets.length) {
    log(`Syncing ${targets.length} puzzle cache payload(s)...`);
  }

  await withConcurrency(targets, FETCH_CONCURRENCY, async (target) => {
    const path = buildPuzzleCachePath(target.cacheKey);
    const existing = readPuzzleCacheRecord(path);

    let payload = "";
    try {
      payload = await fetchPuzzlePayload(target.sourceId);
    } catch (err) {
      failed += 1;
      if (existing?.payload) {
        log(`WARN: failed to refresh ${target.cacheKey}; keeping previous cache. ${String(err)}`);
        return;
      }

      missingWithoutCache += 1;
      log(`WARN: failed to fetch ${target.cacheKey}; no local cache exists. ${String(err)}`);
      return;
    }

    if (
      existing &&
      existing.sourceId === target.sourceId &&
      existing.cacheKey === target.cacheKey &&
      existing.stableKey === target.stableKey &&
      existing.sudokuPadUrl === target.sudokuPadUrl &&
      existing.payload === payload
    ) {
      unchanged += 1;
      return;
    }

    const record: PuzzleCacheRecord = {
      sourceId: target.sourceId,
      stableKey: target.stableKey,
      cacheKey: target.cacheKey,
      sudokuPadUrl: target.sudokuPadUrl,
      fetchedAt: new Date().toISOString(),
      payload,
    };

    const didWrite = writeTextIfChanged(path, toJson(record));
    if (didWrite) {
      written += 1;
    } else {
      unchanged += 1;
    }
  });

  let removed = 0;
  for (const fileName of existingFiles) {
    if (expectedFiles.has(fileName)) continue;
    rmSync(join(PUZZLES_DIR, fileName));
    removed += 1;
  }

  return {
    totalTargets: targets.length,
    written,
    unchanged,
    failed,
    missingWithoutCache,
    removed,
  };
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

function normalizeTinyUrl(value: string): string {
  const url = clean(value);
  if (!url) return "";
  if (looksLikeHttpUrl(url)) return url;
  if (!BARE_TINYURL_REGEX.test(url)) return "";
  return `https://${url.replace(/^\/+/, "")}`;
}

function normalizeSudokuPadLink(value: string): string {
  const url = clean(value);
  if (!url) return "";
  const normalizedTinyUrl = normalizeTinyUrl(url);
  if (normalizedTinyUrl) return normalizedTinyUrl;
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
        cacheKey: stableKey,
      } satisfies ArchiveEntry;
    })
    .filter((entry) => clean(entry.videoType).toLowerCase() === ARCHIVE_VIDEO_TYPE_SUDOKU)
    .filter((entry) => entry.title || entry.sudokuPadUrl || entry.videoTitle);
}

async function resolveSudokuPadRedirect(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(url);
    const finalUrl = clean(res.url);
    if (looksLikeSudokuPadUrl(finalUrl)) return finalUrl;

    const body = await res.text();
    const directMatch = clean(body.match(SUDOKUPAD_URL_REGEX)?.[0]);
    if (looksLikeSudokuPadUrl(directMatch)) return directMatch;

    const encodedMatch = clean(body.match(ENCODED_SUDOKUPAD_URL_REGEX)?.[0]);
    if (encodedMatch) {
      try {
        const decoded = decodeURIComponent(encodedMatch);
        if (looksLikeSudokuPadUrl(decoded)) return decoded;
      } catch {
        // Ignore malformed percent-encoding and continue.
      }
    }

    return "";
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
  assignCacheKeys(entries);

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

  const cacheSyncResult = await syncPuzzlePayloadCache(entries);
  log(
    `Puzzle cache sync: ${cacheSyncResult.written} updated, ${cacheSyncResult.unchanged} unchanged, ` +
      `${cacheSyncResult.removed} removed, ${cacheSyncResult.failed} fetch warnings.`,
  );
  if (cacheSyncResult.missingWithoutCache > 0) {
    log(
      `WARN: ${cacheSyncResult.missingWithoutCache} puzzle payload(s) could not be fetched and have no local cache yet.`,
    );
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
