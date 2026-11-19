import assert from 'node:assert/strict';
import { test } from 'node:test';

test('sync continues safely from valid 5423-row workbook when optional Datasette mirror times out', async () => {
  const { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = mkdtempSync(join(tmpdir(), 'sphenpad-ctc-mirror-outage-'));
  const scripts = dirname(fileURLToPath(import.meta.url));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'node_modules/xlsx'), { recursive: true });
  mkdirSync(join(root, 'public/archive/puzzles'), { recursive: true });
  cpSync(join(scripts, 'ctc-original-catalog-utils.mjs'), join(root, 'scripts/ctc-original-catalog-utils.mjs'));
  cpSync(join(scripts, 'sync-ctc-original-catalog.mjs'), join(root, 'scripts/sync-ctc-original-catalog.mjs'));
  writeFileSync(join(root, 'node_modules/xlsx/package.json'), JSON.stringify({ name: 'xlsx', type: 'module', exports: './index.mjs' }));
  writeFileSync(join(root, 'node_modules/xlsx/index.mjs'),
    `export function read() { return globalThis.__ctcPartialWorkbook; }
     export const utils = { sheet_to_json: sheet => sheet.data,
       encode_cell: ({ r, c }) => String.fromCharCode(65 + c) + (r + 1) };`);
  const table = [['Id', 'Puzzle Title', 'Type', 'Video']];
  for (let i = 0; i < 5423; i++) {
    table.push([`${i}`, `Puzzle ${i}`, 'Sudoku', `https://youtu.be/${i.toString(36).padStart(11, '0')}`]);
  }
  globalThis.__ctcPartialWorkbook = { SheetNames: ['Landing', 'Catalogue', 'Notes'], Sheets: {
    Landing: { data: [['no']] }, Catalogue: { data: table }, Notes: { data: [['none']] },
  } };
  const existingRecord = { sourceId: 'existingID0000', cacheKey: 'existingID0000', stableKey: 'existingID0000',
    payload: '{id:"valid",cs:50,ce:[[],[]]}' };
  const oldFile = join(root, 'public/archive/puzzles/existingID0000.json');
  const oldContent = JSON.stringify(existingRecord);
  writeFileSync(oldFile, oldContent);
  writeFileSync(join(root, 'public/archive/archive-manifest.json'), JSON.stringify({
    generatedAt: '2026-11-17', entries: [{ id: 'legacy-ctc', title: 'Older puzzle',
      youtubeUrl: 'https://youtu.be/ZZZZZZZZZZZ', ...existingRecord }],
  }));
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.YOUTUBE_API_KEY;
  const previousLimit = process.env.CTC_MAX_VIDEOS_PER_RUN;
  try {
    process.env.YOUTUBE_API_KEY = 'test-only';
    process.env.CTC_MAX_VIDEOS_PER_RUN = '1';
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.startsWith('https://docs.google.com/')) return new Response(new Uint8Array(60_000));
      if (url === 'https://ctc-catalogue.com/') throw new DOMException('This operation was aborted', 'AbortError');
      if (url.startsWith('https://www.googleapis.com/youtube/v3/videos')) return Response.json({ items: [] });
      throw new Error(`Unexpected network call: ${url}`);
    };
    await import(join(root, 'scripts/sync-ctc-original-catalog.mjs'));
    const auditFile = join(root, 'reports/ctc-original-catalog-audit.json');
    for (let retry = 0; retry < 300 && !existsSync(auditFile); retry++) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(existsSync(auditFile), 'sync must complete and generate audit even when mirror unavailable');
    const audit = JSON.parse(readFileSync(auditFile, 'utf8'));
    assert.equal(audit.originalCatalogEntries, 5423);
    assert.equal(audit.originalCatalogCoverage.mode, 'workbook-partial');
    assert.match(audit.originalCatalogCoverage.mirrorError, /AbortError/);
    assert.equal(readFileSync(oldFile, 'utf8'), oldContent, 'existing cached payload is unchanged');
    const manifest = JSON.parse(readFileSync(join(root, 'public/archive/archive-manifest.json'), 'utf8'));
    assert.ok(manifest.entries.some(item => item.id === 'legacy-ctc'), 'existing visible cache survives source outage');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = previousKey;
    if (previousLimit === undefined) delete process.env.CTC_MAX_VIDEOS_PER_RUN;
    else process.env.CTC_MAX_VIDEOS_PER_RUN = previousLimit;
    delete globalThis.__ctcPartialWorkbook;
    rmSync(root, { recursive: true, force: true });
  }
});
