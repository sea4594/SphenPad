import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncLmg } from './sync-lmg-cache.mjs';

function id(n) { return String(n).padStart(6, '0'); }
function page(rows) {
  return `<html><table>${rows.map(n => `<tr><td><a href="/Raetselportal/Raetsel/zeigen.php?id=${id(n)}">Puzzle ${n}</a></td></tr>`).join('')}</table></html>`;
}

const payload = '{"grid":[[1,2],[2,1]]}';

test('resumable historical scan, parallel downloads, CtC reuse and no second download', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lmg-full-'));
  const ctc = join(root, 'public/archive/puzzles');
  mkdirSync(ctc, { recursive: true });
  writeFileSync(join(ctc, 'old123.json'), JSON.stringify({ sourceId: 'old123', cacheKey: 'old123', payload }));
  const original = readFileSync(join(ctc, 'old123.json'));
  const fetched = new Map();
  let interrupted = true;
  const http = async url => {
    const listing = new URL(url);
    if (listing.pathname.includes('spezial.php')) {
      const start = Number(listing.searchParams.get('start') || '0');
      if (start === 40 && interrupted) throw new Error('temporary listing timeout');
      return { body: page(Array.from({ length: Math.max(0, Math.min(43 - start, 20)) }, (_, i) => start + i + 1)) };
    }
    if (listing.pathname.includes('zeigen.php')) {
      const n = Number(listing.searchParams.get('id'));
      const source = n === 1 ? 'old123' : `puz${n}`;
      return { body: n % 11 === 0 ? '<p>Image-only puzzle</p>' : `<a href="https://sudokupad.app/${source}">Play</a><div>Zuletzt geändert am</div>` };
    }
    const match = /\/api\/puzzle\/(puz\d+)/.exec(url);
    if (match) {
      fetched.set(match[1], (fetched.get(match[1]) || 0) + 1);
      return { body: payload };
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const config = { root, http, now: 1800000000000, mode: 'backfill',
    concurrency: 4, requestDelayMs: 0, limits: { pages: 2, details: 9, payloads: 5 }, log: () => {} };
  let last = await syncLmg(config);
  assert.equal(last.audit.listingComplete, false);
  assert.equal(last.audit.backfillComplete, false);
  assert.equal(last.audit.stats.reusedCtc, 1);
  assert.equal(last.audit.nextListingStart, 40);
  const cachedBefore = readdirSync(join(root, 'public/lmg/puzzles')).length;
  assert.ok(cachedBefore >= 1);
  last = await syncLmg(config);
  assert.equal(last.audit.listingComplete, false, 'listing error must not be treated as end-of-catalog');
  assert.equal(last.audit.nextListingStart, 40, 'retry the failed listing offset');
  interrupted = false;
  for (let i = 0; i < 20 && !last.audit.backfillComplete; i++) {
    last = await syncLmg(config);
  }
  assert.equal(last.audit.backfillComplete, true, 'all historical listings and first attempts complete');
  assert.equal(last.audit.listingComplete, true);
  assert.equal(last.audit.discoveredPuzzles, 43);
  assert.equal(last.audit.pendingDetailPages, 0);
  assert.equal(last.audit.pendingFirstPassDownloads, 0);
  assert.equal(last.audit.publishedEntries, 40); // 3 entries have no puzzle link
  assert.equal(readFileSync(join(ctc, 'old123.json')).equals(original), true);
  assert.equal(readdirSync(join(root, 'public/lmg/puzzles')).length, 40);
  for (const count of fetched.values()) assert.equal(count, 1, 'download each new payload once');
  const snapshot = [...fetched.entries()];
  const next = await syncLmg({ ...config, mode: 'incremental', now: config.now + 60_000 });
  assert.equal(next.audit.listingComplete, true);
  assert.equal(next.audit.stats.pages, 2, 'after completion only check the newest listing pages');
  assert.deepEqual([...fetched.entries()], snapshot, 'scheduled refresh must not redownload cached puzzles');
  assert.equal(next.manifest.entries.length, 40);
});

test('payload download failures remain auditable without blocking initial scan completion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lmg-failed-'));
  const http = async url => {
    if (url.includes('spezial.php')) return { body: page([1, 2]) };
    if (url.includes('zeigen.php')) return { body: '<a href="https://sudokupad.app/never123">Play</a><div>Zuletzt geändert am</div>' };
    throw new Error('source temporarily unavailable');
  };
  const result = await syncLmg({ root, http, now: 1800000000000,
    mode: 'backfill', limits: { pages: 2, details: 10, payloads: 10 }, log: () => {} });
  assert.equal(result.audit.backfillComplete, true, 'all attempted once; failures stay retryable');
  assert.equal(result.audit.pendingPayloads, 1);
  assert.equal(result.audit.publishedEntries, 0);
  assert.equal(result.audit.stats.failures.some(x => x.type === 'payload'), true);
  assert.ok(Object.keys(JSON.parse(readFileSync(join(root, 'public/lmg/lmg-source-index.json'))).attempts).length);
});
