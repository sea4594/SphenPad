/**
 * Incremental LMG Sudoku catalog sync: list -> author-published puzzle links ->
 * SphenPad-compatible hosted payloads. Existing CtC and user data are read-only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LMG_LIST_URL, LMG_DETAIL_URL, LMG_PAGE_SIZE,
  parseLmgListing, extractDescriptionPuzzleLinks, extractLmgMetadata,
  catalogEntryFromSource, nextCacheKey, sourceFromUrl,
} from './lmg-catalog-utils.mjs';
import { isAllowedHost, isPuzzleHost, looksLikePayload } from './ctc-original-catalog-utils.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DAYS = 24 * 60 * 60 * 1000;
const RETRY_AFTER = 2 * DAYS;
const DETAIL_REFRESH = 30 * DAYS;
const MAX_REDIRECTS = 6;
const DEFAULTS = { pages: 25, details: 160, payloads: 100 };
const int = (v, fallback) => Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 2000 ? Number(v) : fallback;
const getText = (v) => String(v ?? '').trim();

function loadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}
function writeJson(file, data) {
  const serialized = JSON.stringify(data);
  if (existsSync(file) && readFileSync(file, 'utf8') === serialized) return false;
  mkdirSync(resolve(file, '..'), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  writeFileSync(temp, serialized);
  renameSync(temp, file);
  return true;
}
function validatedRecord(path) {
  if (!existsSync(path)) return null;
  try {
    const record = JSON.parse(readFileSync(path, 'utf8'));
    return typeof record.sourceId === 'string' && typeof record.payload === 'string'
      && looksLikePayload(record.payload) ? record : null;
  } catch { return null; }
}
function cachedSources(dir) {
  const result = new Map();
  if (!existsSync(dir)) return result;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const record = validatedRecord(join(dir, file));
    if (record) result.set(record.sourceId, { path: join(dir, file), record, key: file.slice(0, -5) });
  }
  return result;
}
function due(isoDate, interval, now) {
  const time = Date.parse(isoDate ?? '');
  return !Number.isFinite(time) || now - time >= interval;
}

/** Worker pool: bounds simultaneous requests, without starting an unbounded Promise.all. */
async function mapLimited(items, parallel, task) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await task(items[index], index);
    }
  }));
  return output;
}

/** One shared request-start limit, even when multiple detail workers are active. */
function throttleHttp(http, delayMs) {
  if (!delayMs) return http;
  let nextStart = 0;
  let queue = Promise.resolve();
  return async (url, options) => {
    const slot = queue.then(async () => {
      const delay = Math.max(0, nextStart - Date.now());
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      nextStart = Date.now() + delayMs;
    });
    queue = slot.catch(() => {});
    await slot;
    return http(url, options);
  };
}

/** Body is read before releasing the timer; handles abruptly terminated bodies. */
export async function readHttp(url, { fetchImpl = fetch, timeoutMs = 45000, attempts = 3, maxBytes = 4_000_000, redirect = 'follow' } = {}) {
  let last;
  for (let n = 1; n <= attempts; n++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, redirect,
        headers: { 'user-agent': 'SphenPadCatalogBot/1.0 (GitHub; Sudoku index)', accept: 'text/html,application/json,text/plain,*/*' } });
      if (!(response.ok || (redirect === 'manual' && response.status >= 300 && response.status < 400))) {
        throw new Error(`HTTP ${response.status} ${new URL(url).hostname}`);
      }
      if (redirect === 'manual' && response.status >= 300 && response.status < 400) return { response, body: '' };
      if (Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('Oversized source response');
      const body = await response.text();
      if (Buffer.byteLength(body) > maxBytes) throw new Error('Oversized response body');
      return { response, body };
    } catch (error) {
      last = error;
      if (n < attempts) await new Promise(r => setTimeout(r, n * 450));
    } finally { clearTimeout(timer); }
  }
  throw last;
}

/** HTTP, META refresh and common JavaScript redirects; no arbitrary-host fetches. */
export async function resolveLmgPuzzleLink(initial, http = readHttp) {
  let url = initial;
  const visited = new Set();
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    if (!isAllowedHost(url) || visited.has(url)) return null;
    visited.add(url);
    const direct = sourceFromUrl(url);
    if (direct) return direct;
    try {
      const { response, body } = await http(url, { redirect: 'manual', timeoutMs: 20000, attempts: 2, maxBytes: 350000 });
      let next = '';
      if (response.status >= 300 && response.status < 400) {
        next = response.headers.get('location') ?? '';
      } else {
        const tag = /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["'][^"']*?url=([^"'\s;>]+)/i.exec(body);
        const js = /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i.exec(body);
        const candidates = [...body.matchAll(/(?:https?:\/\/|www\.)[^\s<>'"`]+/gi)]
          .map(x => x[0]).filter(x => { try { return isPuzzleHost(x); } catch { return false; } });
        next = tag?.[1] || js?.[1] || candidates[0] || '';
      }
      if (!next) return null;
      next = next.replace(/&amp;/gi, '&').replace(/\\\//g, '/');
      url = new URL(next, url).href;
    } catch { return null; }
  }
  return null;
}

export async function retrievePayload(sourceId, http = readHttp) {
  if (/^(?:scl|ctc|fpuz|fpuzzles|scf|pack)/.test(sourceId)) {
    if (!looksLikePayload(sourceId)) throw new Error('Invalid embedded puzzle');
    return sourceId;
  }
  if (!/^[\w/-]{2,200}$/.test(sourceId)) throw new Error('Invalid SudokuPad puzzle ID');
  const encoded = sourceId.split('/').map(encodeURIComponent).join('/');
  const endpoints = [
    `https://sudokupad.app/api/puzzle/${encoded}`,
    `https://sudokupad.svencodes.com/ctclegacy/${encodeURIComponent(sourceId)}`,
    `https://firebasestorage.googleapis.com/v0/b/sudoku-sandbox.appspot.com/o/${encodeURIComponent(sourceId)}?alt=media`,
  ];
  for (const endpoint of endpoints) {
    try {
      const { body } = await http(endpoint, { timeoutMs: 24000, attempts: 2, maxBytes: 8_000_000 });
      if (looksLikePayload(body)) return body;
    } catch { /* try supported fallback */ }
  }
  throw new Error('No valid SudokuPad-compatible payload found');
}

/** Injectable network/time for safe integration tests. */
export async function syncLmg({ root = REPO_ROOT, http = readHttp, now = Date.now(), limits = DEFAULTS,
  log = console.log, mode = 'incremental', concurrency = 4, requestDelayMs = 0 } = {}) {
  if (mode !== 'incremental' && mode !== 'backfill') throw new Error('Invalid LMG sync mode');
  const backfill = mode === 'backfill';
  const parallel = backfill ? Math.max(1, Math.min(6, Number(concurrency) || 4)) : 1;
  const network = backfill ? throttleHttp(http, Math.max(0, Number(requestDelayMs) || 0)) : http;
  const dataDir = join(root, 'public', 'lmg');
  const cacheDir = join(dataDir, 'puzzles');
  const ctcCacheDir = join(root, 'public', 'archive', 'puzzles');
  const statePath = join(dataDir, 'lmg-source-index.json');
  const manifestPath = join(dataDir, 'lmg-manifest.json');
  const auditPath = join(root, 'reports', 'lmg-catalog-audit.json');
  const state = loadJson(statePath, { version: 1, nextStart: 0, entries: {}, resolutions: {}, attempts: {} });
  if (state.version !== 1 || typeof state.entries !== 'object' || !state.entries) throw new Error('Invalid existing LMG sync state');
  state.resolutions ||= {};
  state.attempts ||= {};
  const stats = { pages: 0, discovered: 0, details: 0, links: 0, payloadsDownloaded: 0, reusedCtc: 0, resolvedLinks: 0, failures: [] };
  const error = (type, identifier, err) => stats.failures.push({ type, identifier, error: String(err).slice(0, 250) });
  const caps = { pages: int(limits.pages, DEFAULTS.pages), details: int(limits.details, DEFAULTS.details), payloads: int(limits.payloads, DEFAULTS.payloads) };

  // First-pass historical pagination is persisted. Once exhausted, scheduled runs
  // check only the newest two pages instead of traversing the archive again.
  const starts = [0];
  let nextStart = Number.isInteger(state.nextStart) && state.nextStart >= LMG_PAGE_SIZE
    ? state.nextStart : LMG_PAGE_SIZE;
  if (state.listingComplete) {
    if (!backfill) starts.push(LMG_PAGE_SIZE);
  } else {
    for (let i = 1; i < caps.pages; i++) {
      starts.push(nextStart);
      nextStart += LMG_PAGE_SIZE;
    }
  }
  let firstPageParsed = false;
  const newestIds = new Set();
  let advancedListing = false;
  for (const start of starts) {
    const listUrl = `${LMG_LIST_URL}&start=${start}`;
    try {
      const { body } = await network(listUrl, { timeoutMs: 40000, maxBytes: 2_000_000 });
      const entries = parseLmgListing(body, listUrl);
      if (start === 0 && entries.length < 2) throw new Error('LMG page 1 unexpectedly empty or parser mismatch');
      firstPageParsed = true;
      if (start === 0) for (const entry of entries) newestIds.add(entry.id);
      stats.pages++;
      for (const entry of entries) {
        if (!state.entries[entry.id]) {
          state.entries[entry.id] = { ...entry, checkedAt: '', links: [], sources: [] };
          stats.discovered++;
        } else if (entry.title && state.entries[entry.id].title !== entry.title) {
          state.entries[entry.id].title = entry.title;
        }
      }
      if (!state.listingComplete && start !== 0) advancedListing = true;
      if (entries.length < LMG_PAGE_SIZE && !state.listingComplete) {
        state.listingComplete = true;
        nextStart = LMG_PAGE_SIZE;
        break;
      }
    } catch (err) {
      error('listing', start, err);
      if (start === 0) throw new Error(`LMG listing unavailable: ${err}`);
      if (!state.listingComplete) nextStart = start; // retry interrupted page next run
      break;
    }
  }
  if (!firstPageParsed) throw new Error('LMG listing yielded no puzzles; state unchanged');
  state.nextStart = nextStart;

  // Backfill gives every discovered detail one initial attempt before refreshes.
  const dueDetails = Object.values(state.entries).filter(entry => backfill
    ? !entry.checkedAt
    : due(entry.checkedAt, entry.links?.length ? DETAIL_REFRESH : RETRY_AFTER, now));
  const newest = backfill ? [] : dueDetails.filter(entry => newestIds.has(entry.id)).slice(0, Math.ceil(caps.details / 2));
  const newestSet = new Set(newest.map(entry => entry.id));
  const detailQueue = [...newest, ...dueDetails.filter(entry => !newestSet.has(entry.id))].slice(0, caps.details);
  await mapLimited(detailQueue, parallel, async entry => {
    try {
      const { body } = await network(LMG_DETAIL_URL(entry.id), { timeoutMs: 40000, maxBytes: 1_500_000 });
      const links = extractDescriptionPuzzleLinks(body);
      const meta = extractLmgMetadata(body, entry);
      Object.assign(entry, meta, { checkedAt: new Date(now).toISOString(), links, lmgUrl: LMG_DETAIL_URL(entry.id) });
      delete entry.detailError;
      stats.details++;
      stats.links += links.length;
    } catch (err) {
      error('detail', entry.id, err);
      entry.checkedAt = new Date(now).toISOString();
      entry.detailError = String(err).slice(0, 180); // retry through the regular updater
    }
  });

  const oldLmg = cachedSources(cacheDir);
  const oldCtc = cachedSources(ctcCacheDir);
  const reserved = new Map([...oldLmg].map(([id, record]) => [record.key, id]));
  const sourceCache = new Map([...oldLmg]);
  mkdirSync(cacheDir, { recursive: true });
  // Resolve exactly the author-published URLs; preserve successful prior resolutions.
  const urls = [...new Set(Object.values(state.entries).flatMap(entry => entry.links || []))];
  const toResolve = [];
  let resolutionAttempts = 0;
  for (const url of urls) {
    if (state.resolutions[url]?.status === 'ok') continue;
    if (state.resolutions[url]?.checkedAt && !due(state.resolutions[url].checkedAt, 7 * DAYS, now)) continue;
    if (!sourceFromUrl(url) && ++resolutionAttempts > caps.details * 2) break;
    toResolve.push(url);
  }
  const resolved = await mapLimited(toResolve, parallel, async url =>
    resolveLmgPuzzleLink(url, network));
  for (let i = 0; i < toResolve.length; i++) {
    const url = toResolve[i];
    const result = resolved[i];
    state.resolutions[url] = result
      ? { ...result, status: 'ok', checkedAt: new Date(now).toISOString() }
      : { status: 'invalid', checkedAt: new Date(now).toISOString() };
    stats.resolvedLinks++;
  }

  const sourceIds = [...new Set(urls.map(url => state.resolutions[url]?.sourceId).filter(Boolean))];
  const pendingDownloads = [];
  for (const sourceId of sourceIds) {
    if (sourceCache.has(sourceId)) continue;
    if (oldCtc.has(sourceId)) {
      const old = oldCtc.get(sourceId);
      const key = nextCacheKey(sourceId, reserved);
      writeJson(join(cacheDir, `${key}.json`), { ...old.record, cacheKey: key, stableKey: key });
      reserved.set(key, sourceId);
      sourceCache.set(sourceId, { key });
      stats.reusedCtc++;
      continue;
    }
    if (pendingDownloads.length >= caps.payloads) break;
    if (state.attempts[sourceId] && !due(state.attempts[sourceId].checkedAt, RETRY_AFTER, now)) continue;
    pendingDownloads.push(sourceId);
  }
  const downloads = await mapLimited(pendingDownloads, parallel, async sourceId => {
    try { return { payload: await retrievePayload(sourceId, network) }; }
    catch (err) { return { error: err }; }
  });
  // Write sequentially so the existing stable cache-key collision handling is preserved.
  for (let i = 0; i < pendingDownloads.length; i++) {
    const sourceId = pendingDownloads[i];
    const outcome = downloads[i];
    if (outcome.error) {
      state.attempts[sourceId] = { checkedAt: new Date(now).toISOString(), error: String(outcome.error).slice(0, 200) };
      error('payload', sourceId.slice(0, 100), outcome.error);
      continue;
    }
    const key = nextCacheKey(sourceId, reserved);
    writeJson(join(cacheDir, `${key}.json`), {
      sourceId, stableKey: key, cacheKey: key, payload: outcome.payload, fetchedAt: new Date(now).toISOString(),
    });
    reserved.set(key, sourceId);
    sourceCache.set(sourceId, { key });
    delete state.attempts[sourceId];
    stats.payloadsDownloaded++;
  }

  const entries = [];
  for (const item of Object.values(state.entries)) {
    const seenSourceIds = new Set();
    for (const [index, link] of (item.links || []).entries()) {
      const source = state.resolutions[link];
      if (!source?.sourceId || seenSourceIds.has(source.sourceId)) continue;
      seenSourceIds.add(source.sourceId);
      const cached = sourceCache.get(source.sourceId);
      if (!cached) continue; // Never show an uncached puzzle.
      const row = catalogEntryFromSource(item, link, source, cached.key, index + 1);
      if (row) entries.push(row);
    }
  }
  entries.sort((a, b) => b.lmgId.localeCompare(a.lmgId) || a.id.localeCompare(b.id));
  const audit = {
    timestamp: new Date(now).toISOString(), source: LMG_LIST_URL,
    discoveredPages: stats.pages, discoveredPuzzles: Object.keys(state.entries).length,
    withPuzzleLinks: Object.values(state.entries).filter(item => item.links?.length).length,
    withHostedPayload: new Set(entries.map(row => row.lmgId)).size,
    publishedEntries: entries.length, unresolvedLinks: urls.filter(url => state.resolutions[url]?.status !== 'ok').length,
    pendingPayloads: sourceIds.filter(id => !sourceCache.has(id)).length,
    pendingDetailPages: Object.values(state.entries).filter(entry => !entry.checkedAt).length,
    nextListingStart: state.nextStart,
    listingComplete: !!state.listingComplete,
    pendingFirstPassResolutions: urls.filter(url => !state.resolutions[url]).length,
    pendingFirstPassDownloads: sourceIds.filter(id => !sourceCache.has(id) && !state.attempts[id]).length,
    // "complete" means all listed entries, links, and payloads had an INITIAL attempt.
    // It never implies all puzzles were playable; failures remain in the audit for retry.
    backfillComplete: !!state.listingComplete && Object.values(state.entries).every(entry => !!entry.checkedAt)
      && urls.every(url => !!state.resolutions[url])
      && sourceIds.every(id => sourceCache.has(id) || !!state.attempts[id]),
    backfillProgress: advancedListing || stats.discovered > 0 || stats.details > 0
      || stats.resolvedLinks > 0 || stats.payloadsDownloaded > 0 || stats.reusedCtc > 0,
    stats,
  };
  writeJson(statePath, state);
  writeJson(manifestPath, { version: 1, entries });
  writeJson(auditPath, audit);
  log(`[LMG] pages ${stats.pages}, detail ${stats.details}, new hosted ${stats.payloadsDownloaded}, reused CtC ${stats.reusedCtc}, published ${entries.length}, errors ${stats.failures.length}`);
  return { state, manifest: { version: 1, entries }, audit };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncLmg({
    mode: process.env.LMG_SYNC_MODE === 'backfill' ? 'backfill' : 'incremental',
    concurrency: Number(process.env.LMG_BACKFILL_CONCURRENCY || 4),
    requestDelayMs: process.env.LMG_SYNC_MODE === 'backfill'
      ? Math.max(250, Number(process.env.LMG_BACKFILL_DELAY_MS || 400)) : 0,
    limits: {
      pages: process.env.LMG_MAX_LIST_PAGES_PER_RUN || DEFAULTS.pages,
      details: process.env.LMG_MAX_DETAILS_PER_RUN || DEFAULTS.details,
      payloads: process.env.LMG_MAX_NEW_PUZZLES_PER_RUN || DEFAULTS.payloads,
    },
  }).catch(err => { console.error('[LMG] ERROR:', err); process.exitCode = 1; });
}
