import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  youtubeId, descriptionLinks, normalizeUrl, sourceFromUrl, parseCatalogTable,
  parseOriginalWorkbook, constraintsToLabels, durationSeconds, reconcileExisting,
  looksLikePayload, stableKey, urlFromCell,
} from './ctc-original-catalog-utils.mjs';

test('recognizes videos from all supported YouTube URL types, not unrelated numbers', () => {
  for (const input of ['https://www.youtube.com/watch?v=AbC_dEF1234&t=3', 'https://youtu.be/AbC_dEF1234',
    'https://youtube.com/live/AbC_dEF1234', 'https://youtube.com/shorts/AbC_dEF1234']) {
    assert.equal(youtubeId(input), 'AbC_dEF1234');
  }
  assert.equal(youtubeId(''), '');
});

test('detects multiple SudokuPad and short links; excludes random sites', () => {
  const links = descriptionLinks(`Play here: https://sudokupad.app/ab1234, then https://tinyurl.com/puzzleA.\nAlternate: https://f-puzzles.com/?load=N4IgzglgXgpiBcBOANCALhNAbO8Q.\nIgnore: https://youtube.com/watch?v=AbC_dEF1234`);
  assert.equal(links.length, 3);
  assert.equal(links[0], 'https://sudokupad.app/ab1234');
  assert.equal(links[1], 'https://tinyurl.com/puzzleA');
  assert.equal(sourceFromUrl(links[2]).sourceId, 'fpuzN4IgzglgXgpiBcBOANCALhNAbO8Q');
});

test('handles CtC and Daily Killer domains and avoids unsupported sites', () => {
  const links = descriptionLinks('A https://app.crackingthecryptic.com/sudoku/abc123 B https://cracking-the-cryptic.web.app/sudoku/abc123 C https://cracking-the-cryptic.firebaseapp.com/sudoku/abc123 D https://dailykillersudoku.com/my-puzzle E https://www.dailykillersudoku.com/my-puzzle F https://tinyurl.com/xy');
  assert.equal(links.length, 6);
  for (const link of links.slice(0,3)) assert.equal(sourceFromUrl(link)?.sourceId, 'sudoku/abc123');
  for (const link of links.slice(3)) assert.equal(sourceFromUrl(link), null, 'redirect URLs require resolving');
});

test('rejects HTML, JS and tracker links as puzzles', () => {
  for (const input of [
    'https://sudokupad.app/counterstats.html',
    'https://sudokupad.app/puzpatcher.bundle.js',
    'https://evil.example/a',
  ]) assert.equal(sourceFromUrl(input), null);
  assert.equal(looksLikePayload('<html><body>not a puzzle</body></html>'), false);
  assert.equal(looksLikePayload('{id:\'sample\',cs:50,ce:[[],[]]}'), true);
  assert.equal(looksLikePayload('fpuzN4IgzglgXgpiBcBOANCALhNAbO8Q'), true);
});

test('decodes embedded formats and retains remote SudokuPad source IDs', () => {
  assert.equal(sourceFromUrl('https://sudokupad.app/sclACDXYZ123456').sourceId, 'sclACDXYZ123456');
  assert.equal(sourceFromUrl('https://app.crackingthecryptic.com/sudoku/abc123').sourceId, 'sudoku/abc123');
  assert.equal(sourceFromUrl('https://sudokupad.app/?load=fpuzN4IgzglgXgpiBcBOANCALhNAbO8Q').sourceId, 'fpuzN4IgzglgXgpiBcBOANCALhNAbO8Q');
});

test('parses original catalog rows including non-Sudoku categories and stable IDs', () => {
  const headers = ['Id', 'Puzzle Title', 'Type', 'Constraints', 'Video', 'Date', 'Setter', 'Solver', 'Video Length'];
  const rows = [
    ['120', 'Star Chart', 'Latin Square', '["Non-Repeat","Odd/Even"]', 'Star Chart video', '2026-11-10', 'Tester', 'Mark', '00:25:14'],
    ['121', 'A Sudoku', 'Sudoku', 'Killer, Arrow', 'Sudoku video', '2026-11-11', 'Author', 'Simon', '14m23s'],
  ];
  const links = [['', '', '', '', 'https://youtu.be/AbC_dEF1234'], ['', '', '', '', 'https://www.youtube.com/watch?v=XyZ-Abc1234']];
  const result = parseCatalogTable({ name: 'Catalogue', headers, rows, cellLinks: links });
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'ctc-120');
  assert.equal(result[0].videoType, 'Latin Square');
  assert.equal(result[0].subTypeConstraints, 'Non-Repeat; Odd/Even');
  assert.equal(result[0].videoLengthSeconds, 1514);
  assert.equal(result[1].videoLengthSeconds, 863);
});

test('preserves old cache URLs, IDs and progress-matching source across migration', () => {
  const incoming = [{ id: 'ctc-120', title: 'Star Chart', youtubeUrl: 'https://youtu.be/AbC_dEF1234', sourceId: '', cacheKey: '' }];
  reconcileExisting(incoming, [{ id: 'Star Chart-123', title: 'Star Chart', youtubeUrl: 'https://youtube.com/watch?v=AbC_dEF1234', sourceId: 'abc123', cacheKey: 'abc123', stableKey: 'abc123', sudokuPadUrl: 'https://sudokupad.app/abc123' }]);
  assert.equal(incoming[0].id, 'Star Chart-123');
  assert.equal(incoming[0].sourceId, 'abc123');
  assert.equal(incoming[0].cacheKey, 'abc123');
});

test('workbook selects puzzle sheets, deduplicates copied rows, reads hyperlinks', () => {
  const headers = ['Id', 'Puzzle Title', 'Type', 'Video'];
  const data = [headers, ['10','Star Chart','Latin Square','See video']];
  const fakeXlsx = {
    utils: {
      sheet_to_json: (sheet) => sheet.data,
      encode_cell: ({ r, c }) => `${String.fromCharCode(65+c)}${r+1}`,
    },
  };
  const sheet = { data, D2: { v: 'video', l: { Target: 'https://youtu.be/AbC_dEF1234' } } };
  const parsed = parseOriginalWorkbook(fakeXlsx, { SheetNames: ['Catalogue', 'Duplicates', 'Notes'], Sheets: {
    Catalogue: sheet, Duplicates: sheet, Notes: { data: [['No title'], ['anything']] },
  } });
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].videoType, 'Latin Square');
  assert.equal(urlFromCell(sheet.D2), 'https://youtu.be/AbC_dEF1234');
});

test('basic normalization utilities', () => {
  assert.equal(normalizeUrl('https://sudokupad.app/xyz),'), 'https://sudokupad.app/xyz');
  assert.equal(durationSeconds('01:02:03'), 3723);
  assert.equal(constraintsToLabels('Killer; Thermo; Killer'), 'Killer; Thermo');
  assert.equal(stableKey('sudoku/abcd'), 'sudoku_abcd');
});

test('end-to-end migration keeps old payloads and incrementally adds original-catalog puzzles', async () => {
  const { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = mkdtempSync(join(tmpdir(), 'sphenpad-ctc-test-'));
  const scripts = dirname(fileURLToPath(import.meta.url));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'node_modules/xlsx'), { recursive: true });
  mkdirSync(join(root, 'public/archive/puzzles'), { recursive: true });
  cpSync(join(scripts, 'ctc-original-catalog-utils.mjs'), join(root, 'scripts/ctc-original-catalog-utils.mjs'));
  cpSync(join(scripts, 'sync-ctc-original-catalog.mjs'), join(root, 'scripts/sync-ctc-original-catalog.mjs'));
  writeFileSync(join(root, 'node_modules/xlsx/package.json'), JSON.stringify({ name: 'xlsx', type: 'module', exports: './index.mjs' }));
  writeFileSync(join(root, 'node_modules/xlsx/index.mjs'),
    `export function read() { return globalThis.__ctcTestWorkbook; }
     export const utils = { sheet_to_json: sheet => sheet.data,
       encode_cell: ({ r, c }) => String.fromCharCode(65 + c) + (r + 1) };`);
  const table = [['Id', 'Puzzle Title', 'Type', 'Constraints', 'Video Title', 'Link YT']];
  for (let i = 0; i < 5030; i++) {
    const video = i.toString(36).padStart(11, '0');
    table.push([`${10000+i}`, `Puzzle ${i}`, i < 340 ? 'Latin Square' : 'Sudoku',
      'Renban', `Video ${i}`, `https://youtu.be/${video}`]);
  }
  globalThis.__ctcTestWorkbook = { SheetNames: ['Catalog'], Sheets: { Catalog: { data: table } } };
  const oldSource = 'puzzle00000000000';
  const oldRecord = { sourceId: oldSource, stableKey: oldSource, cacheKey: oldSource,
    sudokuPadUrl: `https://sudokupad.app/${oldSource}`, payload: '{id:"original",cs:50,ce:[[]]}', fetchedAt: '2025-01-01' };
  const oldFile = join(root, 'public/archive/puzzles', `${oldSource}.json`);
  const oldContent = JSON.stringify(oldRecord);
  writeFileSync(oldFile, oldContent);
  writeFileSync(join(root, 'public/archive/archive-manifest.json'), JSON.stringify({
    generatedAt: '2025-01-01', entries: [{ id: 'Puzzle 0-legacy', title: 'Puzzle 0',
      youtubeUrl: 'https://youtu.be/00000000000', ...oldRecord }],
  }));
  const initialFetch = globalThis.fetch;
  const initialKey = process.env.YOUTUBE_API_KEY;
  const initialMax = process.env.CTC_MAX_VIDEOS_PER_RUN;
  const initialPuzzles = process.env.CTC_MAX_NEW_PUZZLES_PER_RUN;
  let payloadRequests = 0;
  let videoRequests = 0;
  let redirectRequests = 0;
  try {
    process.env.YOUTUBE_API_KEY = 'test-only';
    process.env.CTC_MAX_VIDEOS_PER_RUN = '50';
    process.env.CTC_MAX_NEW_PUZZLES_PER_RUN = '1';
    globalThis.fetch = async input => {
      const address = String(input);
      if (address.includes('docs.google.com/spreadsheets/')) return new Response(new Uint8Array(60000));
      if (address.startsWith('https://www.googleapis.com/youtube/v3/videos')) {
        videoRequests++;
        const ids = new URL(address).searchParams.get('id').split(',');
        return Response.json({ items: ids.map(id => ({ id,
          snippet: { description: id === '00000000001'
            ? 'Play https://dailykillersudoku.com/daily-link'
            : `Play https://sudokupad.app/puzzle${id}` } })) });
      }
      if (address === 'https://dailykillersudoku.com/daily-link') {
        redirectRequests++;
        return new Response(null, { status: 302, headers: { Location: 'https://tinyurl.com/first-hop' } });
      }
      if (address === 'https://tinyurl.com/first-hop') {
        redirectRequests++;
        return new Response(null, { status: 302, headers: { Location: 'https://bit.ly/second-hop' } });
      }
      if (address === 'https://bit.ly/second-hop') {
        redirectRequests++;
        return new Response(null, { status: 301, headers: { Location: 'https://sudokupad.app/puzzle00000000001' } });
      }
      if (address.startsWith('https://sudokupad.app/api/puzzle/')) {
        payloadRequests++;
        return new Response('{id:"downloaded",cs:50,ce:[[]]}');
      }
      throw new Error('Unexpected URL in archive test: ' + address);
    };
    const runner = join(root, 'scripts/sync-ctc-original-catalog.mjs');
    const auditPath = join(root, 'reports/ctc-original-catalog-audit.json');
    const waitAudit = async maximumRemaining => {
      for (let retry = 0; retry < 200; retry++) {
        if (existsSync(auditPath)) {
          const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
          if (audit.youtubeDescriptionsNotYetFetched <= maximumRemaining) return audit;
        }
        await new Promise(r => setTimeout(r, 25));
      }
      throw new Error('Archive migration did not produce expected audit');
    };
    await import(runner);
    const first = await waitAudit(4980);
    assert.equal(first.originalCatalogEntries, 5030);
    assert.equal(first.youtubeDescriptionsFetched, 50);
    assert.equal(payloadRequests, 1);
    assert.equal(redirectRequests, 3, 'Daily Killer and nested short links must resolve through three redirects');
    assert.equal(readFileSync(oldFile, 'utf8'), oldContent, 'Already cached puzzle must remain untouched');
    const manifest = JSON.parse(readFileSync(join(root, 'public/archive/archive-manifest.json'), 'utf8'));
    assert.equal(manifest.entries[0].id, 'Puzzle 0-legacy', 'Existing archive identity must be preserved');
    assert.equal(manifest.entries[0].videoType, 'Latin Square', 'Non-Sudoku categories must remain present');
    assert.equal(manifest.entries.length, 2, 'Only entries with cached payloads may appear in the Import archive');
    assert.equal(first.withheldUncachedEntries, 5028, 'Unresolved entries remain in the audit, not the visible catalog');
    await import(runner + '?second-run');
    const second = await waitAudit(4930);
    assert.equal(second.youtubeDescriptionsFetched, 50);
    assert.equal(payloadRequests, 2, 'Second sync fetches one NEW puzzle, not a previous cache');
    const updatedManifest = JSON.parse(readFileSync(join(root, 'public/archive/archive-manifest.json'), 'utf8'));
    assert.equal(updatedManifest.entries.length, 3, 'Newly downloaded entries become visible alongside old entries');
    assert.equal(videoRequests, 2, 'Second sync indexes the next batch, not previously indexed videos');
    assert.equal(readFileSync(oldFile, 'utf8'), oldContent);
  } finally {
    globalThis.fetch = initialFetch;
    if (initialKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = initialKey;
    if (initialMax === undefined) delete process.env.CTC_MAX_VIDEOS_PER_RUN;
    else process.env.CTC_MAX_VIDEOS_PER_RUN = initialMax;
    if (initialPuzzles === undefined) delete process.env.CTC_MAX_NEW_PUZZLES_PER_RUN;
    else process.env.CTC_MAX_NEW_PUZZLES_PER_RUN = initialPuzzles;
    delete globalThis.__ctcTestWorkbook;
  }
});
