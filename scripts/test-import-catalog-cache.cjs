#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/core/archiveCatalogCache.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/ui/CtCArchivePage.tsx'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function loadFresh() {
  const mod = new Module(path.join(root, 'src/core/archiveCatalogCache.js'), module);
  mod.filename = path.join(root, 'src/core/archiveCatalogCache.js');
  mod.paths = module.paths;
  mod._compile(js, mod.filename);
  return mod.exports;
}

function fakeIndexedDB() {
  const databases = new Map();
  const stats = { opens: 0, writes: 0, reads: 0 };
  return { stats, open(name) {
    stats.opens++;
    const request = { result: null, error: null, onsuccess: null, onupgradeneeded: null, onerror: null, onblocked: null };
    queueMicrotask(() => {
      let store = databases.get(name);
      const upgrade = !store;
      if (!store) { store = new Map(); databases.set(name, store); }
      const database = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => {},
        close: () => {},
        transaction: () => ({ objectStore: () => ({
          get(key) {
            stats.reads++;
            const req = { onsuccess: null, onerror: null, result: undefined };
            queueMicrotask(() => { req.result = store.get(key); req.onsuccess?.(); });
            return req;
          },
          put(row) {
            stats.writes++;
            const req = { onsuccess: null, onerror: null };
            queueMicrotask(() => { store.set(row.key, structuredClone(row)); req.onsuccess?.(); });
            return req;
          },
        }) }),
      };
      request.result = database;
      if (upgrade) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  } };
}

async function run() {
  const db = fakeIndexedDB();
  globalThis.indexedDB = db;
  const oldCrypto = globalThis.crypto;
  globalThis.crypto = require('node:crypto').webcrypto;
  const oldFetch = globalThis.fetch;
  const realNow = Date.now;
  let now = 10_000_000;
  Date.now = () => now;
  const fetched = [];
  const versions = new Map([
    ['/archive/archive-manifest.json', { entries: [{id:'one',title:'CtC'}] }],
    ['/lmg/lmg-manifest.json', {entries: [{id:'two',title:'LMG'}]}],
  ]);
  const failures = new Set();
  globalThis.fetch = async (url, options) => {
    fetched.push({url, options});
    if (failures.has(url)) throw new Error('offline');
    return { ok: true, text: async () => JSON.stringify(versions.get(url)) };
  };

  try {
    let cache = loadFresh();
    const ctc = '/archive/archive-manifest.json';
    const lmg = '/lmg/lmg-manifest.json';
    assert.equal(cache.peekCatalog('ctc', ctc), null);
    assert.equal(await cache.readCatalog('ctc', ctc), null);
    const initial = await cache.refreshCatalog('ctc', ctc);
    assert.deepEqual(initial.entries.map(e=>e.id), ['one']);
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].options.cache, 'no-cache');
    assert.strictEqual(await cache.refreshCatalog('ctc', ctc), initial, '15-minute freshness must skip duplicate fetch');
    assert.equal(fetched.length, 1);
    assert.strictEqual(cache.peekCatalog('ctc', ctc), initial);
    await new Promise(r=>setImmediate(r)); // Wait for asynchronous IDB write.
    assert.equal(db.stats.writes, 1);

    const lmgSnap = await cache.refreshCatalog('lmg', lmg);
    assert.deepEqual(lmgSnap.entries.map(e=>e.id), ['two']);
    assert.equal(fetched.length, 2);
    await new Promise(r=>setImmediate(r));

    // A fresh JS session must recover both catalogs from IDB, without a network fetch.
    cache = loadFresh();
    assert.equal(cache.peekCatalog('ctc', ctc), null);
    const recovered = await cache.readCatalog('ctc', ctc);
    assert.deepEqual(recovered.entries, initial.entries);
    assert.strictEqual(await cache.refreshCatalog('ctc', ctc), recovered);
    assert.equal(fetched.length, 2);
    assert.deepEqual((await cache.readCatalog('lmg', lmg)).entries, lmgSnap.entries);

    now += 16 * 60 * 1000;
    const unchanged = await cache.refreshCatalog('ctc', ctc);
    assert.strictEqual(unchanged.entries, recovered.entries, 'unchanged catalogs reuse parsed entry objects');
    assert.equal(unchanged.fingerprint, recovered.fingerprint);
    assert.equal(fetched.length, 3);

    now += 16 * 60 * 1000;
    versions.set(ctc, {entries: [{id:'one',title:'Updated'},{id:'new',title:'New puzzle'}]});
    const changed = await cache.refreshCatalog('ctc', ctc);
    assert.equal(changed.entries.length, 2);
    assert.equal(changed.entries[0].title, 'Updated');

    now += 16 * 60 * 1000;
    failures.add(ctc);
    const offline = await cache.refreshCatalog('ctc', ctc);
    assert.equal(offline.entries.length, 2, 'offline refresh cannot erase catalog');
    const countAfterFail = fetched.length;
    await cache.refreshCatalog('ctc', ctc);
    assert.equal(fetched.length, countAfterFail, 'temporary failures are throttled');
    failures.delete(ctc);
    now += 3 * 60 * 1000;
    assert.equal((await cache.refreshCatalog('ctc', ctc)).entries.length, 2);

    now += 16 * 60 * 1000;
    versions.set(lmg, {entries: [{id:'malformed'}]});
    const prevLmg = await cache.readCatalog('lmg', lmg);
    // A bad JSON response must never replace previously valid content.
    globalThis.fetch = async (url) => url === lmg ? {ok:true,text:async()=>'{bad json'} : {ok:true,text:async()=>JSON.stringify(versions.get(url))};
    assert.strictEqual((await cache.refreshCatalog('lmg', lmg)).entries, prevLmg.entries);

    // Request coalescing on cold access, even with multiple components/tabs.
    const clean = loadFresh();
    const [a,b] = await Promise.all([clean.readCatalog('ctc', ctc),clean.readCatalog('ctc', ctc)]);
    assert.strictEqual(a,b);

    // This is strictly a catalog cache; no puzzle/account storage or payload endpoint changes.
    assert.match(page, /peekCatalog\(selectedCatalog, manifestUrl\)/);
    assert.match(page, /await readCatalog\(selectedCatalog, manifestUrl\)/);
    assert.match(page, /await refreshCatalog\(selectedCatalog, manifestUrl\)/);
    assert.match(page, /setRows\(\(old\) => old === prepared \? old : prepared\)/);
    assert.match(page, /onSwitchCatalog\(next: ArchiveCatalog\)/);
    assert.match(page, /loadCachedPuzzlePayload\(entry: ArchiveEntry, catalog: ArchiveCatalog\)/);
    assert.doesNotMatch(source, /indexedDB\.deleteDatabase|objectStore\.clear\(/);
    assert.doesNotMatch(source, /(?:getPuzzle|upsertPuzzle|deletePuzzle|setSyncedLocalStorageItem)\s*\(/);

    console.log('Import catalog cache: persistence, independent tabs, TTL, no duplicate loads, revalidation, offline fallback, stale safety PASS');
  } finally {
    Date.now = realNow;
    globalThis.fetch = oldFetch;
    globalThis.crypto = oldCrypto;
    delete globalThis.indexedDB;
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
