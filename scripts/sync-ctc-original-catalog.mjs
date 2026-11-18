/**
 * CtC archive migration: ORIGINAL catalogue -> YouTube video descriptions ->
 * existing SphenPad SudokuPad-compatible cache. Never deletes cached puzzles.
 *
 * Required GitHub secret: YOUTUBE_API_KEY (YouTube Data API v3 enabled).
 * Optional knobs: CTC_MAX_VIDEOS_PER_RUN, CTC_MAX_NEW_PUZZLES_PER_RUN.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  ORIGINAL_CTC_SHEET, clean, youtubeId, descriptionLinks, isAllowedHost,
  isPuzzleHost, sourceFromUrl, stableKey, looksLikePayload,
  parseOriginalWorkbook, parseCatalogTable, reconcileExisting,
} from './ctc-original-catalog-utils.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA_DIR = join(ROOT, 'public', 'archive');
const PUZZLES_DIR = join(DATA_DIR, 'puzzles');
const MANIFEST = join(DATA_DIR, 'archive-manifest.json');
const VIDEO_INDEX = join(DATA_DIR, 'youtube-description-index.json');
const URL_INDEX = join(DATA_DIR, 'resolved-puzzle-links.json');
const PAYLOAD_ATTEMPTS = join(DATA_DIR, 'payload-attempts.json');
const AUDIT = join(ROOT, 'reports', 'ctc-original-catalog-audit.json');
const API_KEY = clean(process.env.YOUTUBE_API_KEY);
const TIMEOUT_MS = 12000;
const MAX_VIDEOS = parsePositiveInt(process.env.CTC_MAX_VIDEOS_PER_RUN, 12000);
const MAX_NEW_PUZZLES = parsePositiveInt(process.env.CTC_MAX_NEW_PUZZLES_PER_RUN, 250);
const MAX_REDIRECT_HOPS = 5;
const DESCRIPTION_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const MISSING_DESCRIPTION_RETRY_MS = 24 * 60 * 60 * 1000;
const FAILED_RESOLUTION_RETRY_MS = 3 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 8;

function parsePositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 100000 ? number : fallback;
}
function log(message) { console.log(`[CtC] ${message}`); }
function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`Cannot parse existing ${file}: ${String(error)}`); }
}
function writeJsonIfChanged(file, value) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  const text = JSON.stringify(value);
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
  return true;
}
async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, ...options });
    return response;
  } finally { clearTimeout(timeout); }
}
async function requestText(url, options = {}) {
  const response = await request(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 10_000_000) throw new Error('Response is too large');
  return response.text();
}
async function withWorkers(items, concurrency, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }));
}

function linkAndTitle(value) {
  if (value == null) return { url: '', title: '' };
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map(linkAndTitle).find(result => result.url) || { url: '', title: '' };
    return { url: clean(value.href || value.url || value.link),
      title: clean(value.label || value.text || value.title || value.value) };
  }
  const text = clean(value).replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  try { return linkAndTitle(JSON.parse(text)); } catch { /* not JSON */ }
  const href = text.match(/href=["']([^"']+)["']/i)?.[1] || text.match(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s"'<>]+/i)?.[0] || '';
  return { url: href, title: text.replace(/<[^>]+>/g, '').trim() };
}

async function fetchDatasetteCatalog() {
  log('Trying the original-catalogue Datasette mirror (same spreadsheet source)');
  const homepage = await requestText('https://ctc-catalogue.com/');
  const prefix = homepage.match(/(?:\/|href=["']\/?)(ctc-catalogue-[a-z0-9]+)\/(?:sudoku_puzzles|pencil_puzzles)/i)?.[1];
  if (!prefix) throw new Error('Could not discover current CtC Datasette database hash');
  const result = [];
  for (const [table, type] of [['sudoku_puzzles', 'Sudoku'], ['pencil_puzzles', 'Pencil Puzzle']]) {
    let url = `https://ctc-catalogue.com/${prefix}/${table}.json?_size=1000`;
    const collected = [];
    const visited = new Set();
    while (url && !visited.has(url) && visited.size < 20) {
      visited.add(url);
      const response = await request(url);
      if (!response.ok) throw new Error(`CtC Datasette ${table}: HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.rows)) throw new Error(`Unexpected CtC Datasette response for ${table}`);
      collected.push(...data.rows);
      url = data.next_url ? new URL(data.next_url, url).href : '';
    }
    if (url) throw new Error(`CtC Datasette pagination incomplete for ${table}`);
    const headers = ['Id', 'Puzzle Title', 'Type', 'Constraints', 'Video', 'Video Date', 'Setter', 'Solver', 'Video Length'];
    const rows = collected.map(item => {
      const video = linkAndTitle(item.Video);
      return [item.Id, item['Puzzle Title'], item.Type || type, item.Constraints,
        video.title, item.Date, item.Setter, item.Solver, item['Video Length']];
    });
    const cellLinks = collected.map(item => ['', '', '', '', linkAndTitle(item.Video).url]);
    const parsed = parseCatalogTable({ name: table, headers, rows, cellLinks });
    log(`CtC Datasette ${table}: ${parsed.length}/${collected.length} rows with YouTube links`);
    result.push(...parsed);
  }
  return result;
}

async function fetchOriginalCatalog() {
  let fromWorkbook = [];
  let workbookError = '';
  try {
    const response = await request(ORIGINAL_CTC_SHEET);
    if (!response.ok) throw new Error(`Original CtC workbook returned HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 50_000 || bytes.byteLength > 80_000_000) {
      throw new Error(`Unexpected original CtC workbook size: ${bytes.byteLength}`);
    }
    const importedXlsx = await import('xlsx');
    const XLSX = importedXlsx.read ? importedXlsx : importedXlsx.default;
    const workbook = XLSX.read(bytes, { type: 'array', cellText: true, cellFormula: true, cellDates: false });
    const result = parseOriginalWorkbook(XLSX, workbook);
    log(`Original workbook parsed: ${result.sheets.join(', ')}`);
    fromWorkbook = result.entries;
  } catch (error) { workbookError = String(error); log(`Original workbook fallback: ${workbookError}`); }
  const nonSudokuCount = fromWorkbook.filter(item => item.videoType.toLowerCase() !== 'sudoku').length;
  const latinCount = fromWorkbook.filter(item => /latin square/i.test(item.videoType)).length;
  if (fromWorkbook.length < 5000 || nonSudokuCount < 300 || latinCount < 25) {
    // The source workbook sometimes exposes a Sudoku-only view. Never silently
    // reproduce that old exclusion; use the separately published pencil-puzzle table.
    const mirror = await fetchDatasetteCatalog();
    const keys = new Set(mirror.map(item => `${youtubeId(item.youtubeUrl)}|${item.title.toLowerCase()}`));
    for (const entry of fromWorkbook) {
      const key = `${youtubeId(entry.youtubeUrl)}|${entry.title.toLowerCase()}`;
      if (!keys.has(key)) mirror.push(entry);
    }
    if (mirror.length < 5000 || mirror.filter(item => /latin square/i.test(item.videoType)).length < 25) {
      throw new Error(`CtC source incomplete (workbook=${fromWorkbook.length}, mirror=${mirror.length}, pencil=${nonSudokuCount}, latin=${latinCount}). Archive left unchanged.`);
    }
    return mirror;
  }
  return fromWorkbook;
}

async function fetchDescriptions(videoIds, previous) {
  const result = { ...previous };
  const now = Date.now();
  const due = videoIds.filter(id => {
    const row = result[id];
    if (!row) return true;
    const interval = row.status === 'found' ? DESCRIPTION_RETRY_MS : MISSING_DESCRIPTION_RETRY_MS;
    return !row.checkedAt || now - Date.parse(row.checkedAt) >= interval;
  }).slice(0, MAX_VIDEOS);
  log(`YouTube descriptions queued: ${due.length}/${videoIds.length} video IDs`);
  const batches = [];
  for (let i = 0; i < due.length; i += 50) batches.push(due.slice(i, i + 50));
  let retrieved = 0;
  // Commit the description index only when all requested batches succeed.
  await withWorkers(batches, 3, async batch => {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('fields', 'items(id,snippet(description))');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('key', API_KEY);
    const response = await request(url.toString());
    if (!response.ok) throw new Error(`YouTube videos.list failed with HTTP ${response.status}. Check the API key, API permissions and quota.`);
    const json = await response.json();
    if (!Array.isArray(json.items)) throw new Error('YouTube videos.list did not return items');
    const videos = new Map(json.items.map(item => [item.id, item.snippet?.description || '']));
    for (const id of batch) {
      const description = videos.get(id);
      const links = description === undefined ? [] : descriptionLinks(description);
      result[id] = {
        status: description === undefined ? 'unavailable' : links.length ? 'found' : 'no_links',
        links,
        checkedAt: new Date().toISOString(),
      };
      retrieved++;
    }
  });
  return { index: result, retrieved, remaining: videoIds.filter(id => !result[id]).length };
}

function normalizeRedirectMarkup(markup, baseUrl) {
  const html = markup.slice(0, 180_000);
  const values = [];
  const meta = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]+content\s*=\s*["'][^"']*?url=([^"'>\s;]+)/i) ||
    html.match(/<meta[^>]+content\s*=\s*["'][^"']*?url=([^"'>\s;]+)[^>]+http-equiv\s*=\s*["']?refresh/i);
  if (meta) values.push(meta[1]);
  for (const m of html.matchAll(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/gi)) values.push(m[1]);
  for (const m of html.matchAll(/(?:https?:\/\/|www\.)[^\s<>'"`]+/gi)) values.push(m[0]);
  for (const raw of values) {
    try {
      const cleaned = raw.replace(/&amp;/gi, '&').replace(/\\\//g, '/');
      const url = new URL(cleaned, baseUrl).href;
      if (isAllowedHost(url)) return url;
    } catch { /* ignore malformed URLs */ }
  }
  return '';
}

async function resolveLink(initial) {
  let url = initial;
  const visited = new Set();
  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    if (!isAllowedHost(url) || visited.has(url)) break;
    visited.add(url);
    if (isPuzzleHost(url)) {
      const source = sourceFromUrl(url);
      if (source) return source;
    }
    try {
      // Do not let a public shortener redirect our server-side fetch to arbitrary hosts.
      const response = await request(url, { redirect: 'manual' });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) break;
        const next = new URL(location, url).href;
        if (!isAllowedHost(next)) break;
        url = next;
        continue;
      }
      const finalUrl = response.url || url;
      if (!response.ok) break;
      if (!/html|text\/plain/i.test(response.headers.get('content-type') || '')) break;
      const html = await response.text();
      const next = normalizeRedirectMarkup(html, finalUrl);
      if (!next || next === url) break;
      url = next;
    } catch { break; }
  }
  return null;
}

async function resolveDescriptionLinks(videoIndex, urlIndex) {
  const uniqueLinks = [...new Set(Object.values(videoIndex).flatMap(video => video?.links || []))];
  const result = { ...urlIndex };
  const now = Date.now();
  // Direct SudokuPad / f-puzzles links need no network and have no per-run cap.
  for (const url of uniqueLinks) {
    if (result[url]?.status === 'resolved') continue;
    const direct = sourceFromUrl(url);
    if (direct) result[url] = { ...direct, status: 'resolved', checkedAt: new Date().toISOString() };
  }
  const pending = uniqueLinks.filter(url => {
    const row = result[url];
    if (!row) return true;
    if (row.status === 'resolved') return false;
    return !row.checkedAt || now - Date.parse(row.checkedAt) >= FAILED_RESOLUTION_RETRY_MS;
  });
  log(`Puzzle links to resolve: ${pending.length}/${uniqueLinks.length}`);
  // Resolve only bounded new links per run, so a shortener outage can't stall the sync.
  await withWorkers(pending.slice(0, MAX_NEW_PUZZLES * 2), CONCURRENCY, async url => {
    const resolved = await resolveLink(url);
    result[url] = resolved
      ? { ...resolved, status: 'resolved', checkedAt: new Date().toISOString() }
      : { status: 'unresolved', checkedAt: new Date().toISOString() };
  });
  return result;
}

function cacheRecord(path) {
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof data.sourceId !== 'string' || !looksLikePayload(data.payload || '')) return null;
    return data;
  } catch { return null; }
}
function cachedSources() {
  mkdirSync(PUZZLES_DIR, { recursive: true });
  const index = new Map();
  for (const file of readdirSync(PUZZLES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const record = cacheRecord(join(PUZZLES_DIR, file));
    if (record) index.set(record.sourceId, record.cacheKey || file.replace(/\.json$/, ''));
  }
  return index;
}
function newCacheKey(sourceId, reserved) {
  const base = stableKey(sourceId);
  if (!reserved.has(base) || reserved.get(base) === sourceId) return base;
  return `${base.slice(0, 170)}_${createHash('sha256').update(sourceId).digest('hex').slice(0, 12)}`;
}
async function fetchPayload(sourceId) {
  if (/^(?:scl|ctc|fpuz|fpuzzles|scf|pack)/.test(sourceId)) {
    if (!looksLikePayload(sourceId)) throw new Error('Invalid embedded puzzle data');
    return sourceId;
  }
  if (!/^[\w/-]{2,200}$/.test(sourceId)) throw new Error('Invalid remote puzzle ID');
  const encodedId = sourceId.split('/').map(encodeURIComponent).join('/');
  const urls = [
    `https://sudokupad.app/api/puzzle/${encodedId}`,
    `https://sudokupad.svencodes.com/ctclegacy/${encodeURIComponent(sourceId)}`,
    `https://firebasestorage.googleapis.com/v0/b/sudoku-sandbox.appspot.com/o/${encodeURIComponent(sourceId)}?alt=media`,
  ];
  for (const url of urls) {
    try {
      const payload = await requestText(url);
      if (looksLikePayload(payload)) return payload;
    } catch { /* fallback */ }
  }
  throw new Error('No valid payload from compatible SudokuPad backends');
}

function assignLinks(entries, videoIndex, resolutionIndex, caches) {
  const perVideo = new Map();
  for (const entry of entries) {
    const id = youtubeId(entry.youtubeUrl);
    const list = perVideo.get(id) || [];
    list.push(entry);
    perVideo.set(id, list);
  }
  let ambiguous = 0;
  const reservedKeys = new Map([...caches].map(([source, key]) => [key, source]));
  for (const [videoId, siblings] of perVideo) {
    const video = videoIndex[videoId];
    const resolved = [...new Map((video?.links || [])
      .map(url => resolutionIndex[url])
      .filter(item => item?.status === 'resolved' && item.sourceId)
      .map(item => [item.sourceId, item])).values()];
    const missing = siblings.filter(entry => !entry.sourceId || !caches.has(entry.sourceId));
    if (missing.length === 0) continue;
    const claimed = new Set(siblings.filter(entry => caches.has(entry.sourceId)).map(entry => entry.sourceId));
    const unclaimed = resolved.filter(item => !claimed.has(item.sourceId));
    const canAssign = (missing.length === 1 && unclaimed.length >= 1) ||
      (missing.length > 1 && missing.length === unclaimed.length);
    // One video can mention several different puzzles. Preserve the first link
    // for a single catalog row, but make the extra candidates auditable.
    if (missing.length === 1 && unclaimed.length > 1) ambiguous += 1;
    if (!canAssign) {
      if (unclaimed.length > 0) ambiguous += missing.length;
      continue;
    }
    for (let i = 0; i < missing.length; i++) {
      const entry = missing[i];
      const item = unclaimed[i];
      entry.sourceId = item.sourceId;
      entry.sudokuPadUrl = item.sudokuPadUrl;
      entry.stableKey = stableKey(item.sourceId);
      const cacheKey = caches.get(item.sourceId) || newCacheKey(item.sourceId, reservedKeys);
      entry.cacheKey = cacheKey;
      reservedKeys.set(cacheKey, item.sourceId);
    }
  }
  return ambiguous;
}

async function fillMissingPayloads(entries, caches, previousAttempts) {
  const attempts = { ...previousAttempts };
  const retryWindow = 24 * 60 * 60 * 1000;
  const targets = new Map();
  for (const entry of entries) {
    if (!entry.sourceId || !entry.cacheKey) continue;
    const cachePath = join(PUZZLES_DIR, `${entry.cacheKey}.json`);
    if (cacheRecord(cachePath)) continue; // A good puzzle is retrieved EXACTLY ONCE.
    const attemptKey = createHash('sha256').update(entry.sourceId).digest('hex');
    const failure = attempts[attemptKey];
    if (failure && Date.now() - Date.parse(failure.checkedAt) < retryWindow) continue;
    if (!targets.has(entry.sourceId)) targets.set(entry.sourceId, entry);
  }
  const queue = [...targets.values()];
  const failures = [];
  let written = 0;
  await withWorkers(queue.slice(0, MAX_NEW_PUZZLES), CONCURRENCY, async entry => {
    const cachePath = join(PUZZLES_DIR, `${entry.cacheKey}.json`);
    try {
      const payload = await fetchPayload(entry.sourceId);
      const record = {
        sourceId: entry.sourceId, stableKey: entry.stableKey,
        cacheKey: entry.cacheKey, sudokuPadUrl: entry.sudokuPadUrl,
        fetchedAt: new Date().toISOString(), payload,
      };
      if (writeJsonIfChanged(cachePath, record)) written++;
      caches.set(entry.sourceId, entry.cacheKey);
      delete attempts[createHash('sha256').update(entry.sourceId).digest('hex')];
    } catch (error) {
      const message = String(error);
      attempts[createHash('sha256').update(entry.sourceId).digest('hex')] = { checkedAt: new Date().toISOString(), message };
      failures.push({ id: entry.id, sourceId: entry.sourceId, message });
    }
  });
  return { queued: queue.length, attempted: Math.min(queue.length, MAX_NEW_PUZZLES), written, failures, attempts };
}

async function main() {
  if (!API_KEY) throw new Error('YOUTUBE_API_KEY is missing. Add a GitHub Actions repository secret. No archive files were changed.');
  const previousManifest = readJson(MANIFEST, { entries: [] });
  if (!Array.isArray(previousManifest.entries)) throw new Error('Invalid previous CtC archive manifest');
  const oldEntries = previousManifest.entries;
  const entries = await fetchOriginalCatalog();
  reconcileExisting(entries, oldEntries);
  const indexedIds = new Set(entries.map(entry => entry.id));
  // Keep legacy rows during migration if the external catalog changes or a row cannot be matched.
  const legacy = oldEntries.filter(entry => !indexedIds.has(entry.id));
  const all = [...entries, ...legacy];
  const videos = [...new Set(entries.map(entry => youtubeId(entry.youtubeUrl)).filter(Boolean))];
  const oldVideoIndex = readJson(VIDEO_INDEX, {});
  const oldResolutionIndex = readJson(URL_INDEX, {});
  const { index: videoIndex, retrieved, remaining } = await fetchDescriptions(videos, oldVideoIndex);
  const resolutions = await resolveDescriptionLinks(videoIndex, oldResolutionIndex);
  const caches = cachedSources();
  const ambiguous = assignLinks(entries, videoIndex, resolutions, caches);
  const previousAttempts = readJson(PAYLOAD_ATTEMPTS, {});
  const payloads = await fillMissingPayloads(all, caches, previousAttempts);
  // Safety: an unexpectedly smaller catalog cannot erase existing rows or payloads.
  const isHosted = entry => Boolean(entry.sourceId && entry.cacheKey &&
    cacheRecord(join(PUZZLES_DIR, `${entry.cacheKey}.json`))?.sourceId === entry.sourceId);
  // Only publish entries backed by a retained, sanity-checked cached payload.
  // All other original-catalog rows remain tracked via the audit and indexes
  // for incremental retries; don't expose unplayable Import-page entries.
  const hosted = all.filter(isHosted);
  const missingPayload = all.filter(entry => entry.sourceId && !isHosted(entry));
  const noLink = all.filter(entry => !entry.sourceId);
  const audit = {
    generatedAt: new Date().toISOString(),
    originalCatalogEntries: entries.length,
    preservedLegacyEntries: legacy.length,
    catalogAndLegacyEntries: all.length,
    archiveEntries: hosted.length,
    withheldUncachedEntries: all.length - hosted.length,
    uniqueYoutubeVideos: videos.length,
    youtubeDescriptionsFetched: retrieved,
    youtubeDescriptionsNotYetFetched: remaining,
    resolvedLinkCount: Object.values(resolutions).filter(v => v.status === 'resolved').length,
    unresolvedLinkCount: Object.values(resolutions).filter(v => v.status === 'unresolved').length,
    unresolvedLinkSample: Object.entries(resolutions).filter(([, value]) => value.status === 'unresolved').map(([url]) => url),
    distinctCachedPuzzles: caches.size,
    descriptionStatusCounts: Object.fromEntries(['found', 'no_links', 'unavailable', 'pending'].map(status => [status, videos.filter(id => (videoIndex[id]?.status || 'pending') === status).length])),
    ambiguousVideoRows: ambiguous,
    noLinkCount: noLink.length,
    noLinkSample: noLink.map(entry => ({ id: entry.id, title: entry.title, youtubeUrl: entry.youtubeUrl })),
    missingPayloadCount: missingPayload.length,
    missingPayloadSample: missingPayload.map(entry => ({ id: entry.id, sourceId: entry.sourceId })),
    payloads: { queued: payloads.queued, attempted: payloads.attempted, written: payloads.written, failures: payloads.failures },
  };
  log(`Catalogue=${entries.length}, legacy preserved=${legacy.length}, published=${hosted.length}, cached=${caches.size}, no link=${noLink.length}, payload pending=${missingPayload.length}, ambiguous=${ambiguous}`);
  // Write the source indexes before the manifest so subsequent runs can resume partial discovery.
  writeJsonIfChanged(VIDEO_INDEX, videoIndex);
  writeJsonIfChanged(URL_INDEX, resolutions);
  writeJsonIfChanged(PAYLOAD_ATTEMPTS, payloads.attempts);
  const sorted = hosted; // One Import-page archive; cached old and new puzzles are indistinguishable.
  const manifestEntriesSame = JSON.stringify(oldEntries) === JSON.stringify(sorted);
  writeJsonIfChanged(MANIFEST, {
    generatedAt: manifestEntriesSame && previousManifest.generatedAt ? previousManifest.generatedAt : new Date().toISOString(),
    entries: sorted,
  });
  const existingAudit = readJson(AUDIT, null);
  if (existingAudit) {
    const withoutTime = value => JSON.stringify({ ...value, generatedAt: null, youtubeDescriptionsFetched: null });
    if (withoutTime(existingAudit) === withoutTime(audit)) audit.generatedAt = existingAudit.generatedAt;
  }
  writeJsonIfChanged(AUDIT, audit);
  if (payloads.failures.length) log(`WARN ${payloads.failures.length} payload downloads failed; files retained and reported`);
  if (remaining) log(`INFO ${remaining} video descriptions not yet indexed; scheduled sync will continue`);
  log('Sync complete: no existing puzzle payload files removed');
}
main().catch(error => { console.error(`[CtC] ERROR: ${String(error)}`); process.exitCode = 1; });
