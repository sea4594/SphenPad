import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseLmgListing, extractDescriptionPuzzleLinks, extractLmgMetadata,
  sourceFromUrl, catalogEntryFromSource, nextCacheKey,
} from './lmg-catalog-utils.mjs';
import { syncLmg, resolveLmgPuzzleLink, readHttp } from './sync-lmg-cache.mjs';

const listPage = (puzzles) => `<html><table>${puzzles.map(([id, title]) =>
  `<tr><td><a href="/Raetselportal/Raetsel/zeigen.php?chlang=en&amp;id=${id}">${title}</a></td><td>Difficulty</td></tr>`).join('')}</table></html>`;
const first = listPage([['000AB1','Simple Renban'],['000AB2','Second Puzzle']]);
const commentOnly = `<div class="description">Author link: <a href="https://sudokupad.app/foo123456">SudokuPad</a><p>Some rules</p></div>
<div>Zuletzt geändert am 2026-11-18</div><h3>Kommentare</h3>
<p>https://sudokupad.app/COMMENTONLY</p>`;

test('LMG listing extracts distinct puzzle IDs and titles', () => {
  assert.deepEqual(parseLmgListing(first).map(x => x.id), ['000AB1','000AB2']);
  assert.equal(parseLmgListing(first)[0].title, 'Simple Renban');
  assert.deepEqual(parseLmgListing('<a href="https://evil.example/Raetselportal/Raetsel/zeigen.php?id=000BAD">evil</a>'), []);
});
test('description finds author-published links and excludes comments', () => {
  assert.deepEqual(extractDescriptionPuzzleLinks(commentOnly), ['https://sudokupad.app/foo123456']);
  assert.deepEqual(extractDescriptionPuzzleLinks('<h3>Kommentare</h3><a href="https://sudokupad.app/BAD123">B</a>'), []);
});
test('multiple puzzle links, f-puzzles parameters, and CtC hosts are discovered', () => {
  const html = '<section><a href="https://sudokupad.app/abc123">SudokuPad</a>' +
    '<a href="https://f-puzzles.com/?load=abcdefghijk01234567890&amp;foo=bar">f-puzzles</a>' +
    '<a href="https://app.crackingthecryptic.com/sudoku/abcdef">CtC</a>' +
    '</section><div>Zuletzt geändert am today</div><h3>Kommentare</h3>' +
    '<a href="https://sudokupad.app/comment123">Comment-only</a>';
  const links = extractDescriptionPuzzleLinks(html);
  assert.equal(links.length, 3);
  assert.ok(links.some(url => url.startsWith('https://f-puzzles.com/?load=')));
  assert.ok(links.some(url => url.startsWith('https://app.crackingthecryptic.com/')));
  assert.ok(!links.some(url => url.includes('comment123')));
});
test('LMG metadata parses difficulty, rating and solve count', () => {
  const out = extractLmgMetadata('<img alt="leichtes Rätsel"> <p>Bewertung: 89 %</p> <p>Gelöst: 37 mal</p>', {title:'A'});
  assert.equal(out.rating, 89); assert.equal(out.solves, 37);
  assert.match(out.difficulty, /leichtes/);
});
test('SudokuPad/f-puzzles links keep their original SphenPad source identities', () => {
  assert.equal(sourceFromUrl('https://sudokupad.app/abc123').sourceId, 'abc123');
  assert.ok(sourceFromUrl('https://f-puzzles.com/?load=abcdefghijk01234567890').sourceId.startsWith('fpuz'));
  const entry = catalogEntryFromSource({id:'000AB1',title:'T'}, 'https://sudokupad.app/abc123', {sourceId:'abc123'}, 'abc123', 1);
  assert.equal(entry.sourceId,'abc123');
  assert.equal(entry.lmgUrl, 'https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000AB1');
  assert.equal(nextCacheKey('abc123',new Map()), 'abc123');
});
test('multi-hop redirect resolves only to recognized puzzle hosts', async () => {
  const mock = async url => {
    if (url === 'https://tinyurl.com/one') return { response: new Response(null, {status:302,headers:{location:'https://bit.ly/two'}}), body:'' };
    if (url === 'https://bit.ly/two') return {response:new Response('<meta http-equiv="refresh" content="0;url=https://sudokupad.app/correct123">'),body:'<meta http-equiv="refresh" content="0;url=https://sudokupad.app/correct123">'};
    throw new Error(`unexpected redirect ${url}`);
  };
  assert.equal((await resolveLmgPuzzleLink('https://tinyurl.com/one',mock)).sourceId,'correct123');
});
test('network fetch retries interrupted response bodies', async () => {
  let count = 0;
  const mockedFetch = async () => {
    count++;
    if (count === 1) return { ok:true,headers:new Headers(),text:async()=>{throw new TypeError('terminated');} };
    return new Response('<html>ok</html>');
  };
  assert.equal((await readHttp('https://logic-masters.de/',{fetchImpl:mockedFetch})).body,'<html>ok</html>');
  assert.equal(count,2);
});
test('end to end: LMG + CtC cache reuse, valid-only manifest, repeat sync does not redownload', async () => {
  const root = mkdtempSync(join(tmpdir(),'lmg-test-'));
  const ctcDir = join(root,'public','archive','puzzles');
  mkdirSync(ctcDir,{recursive:true});
  const originalRecord = JSON.stringify({sourceId:'reuse123',cacheKey:'reuse123',payload:'{"grid":[[1,2],[2,1]]}'});
  writeFileSync(join(ctcDir,'reuse123.json'),originalRecord);
  let downloadCount = 0;
  const http = async url => {
    if (url.includes('spezial.php') && url.includes('start=0')) return {body:first};
    if (url.includes('spezial.php') && url.includes('start=20')) return {body:listPage([['000AB3','third']])};
    if (url.includes('zeigen.php') && url.includes('000AB1')) return {body:'<main><a href="https://sudokupad.app/reuse123">Play</a></main><div>Zuletzt geändert am</div><h2>Kommentare</h2><a href="https://sudokupad.app/commentonly">no</a>'};
    if (url.includes('zeigen.php') && url.includes('000AB2')) return {body:'<a href="https://sudokupad.app/new123">Play</a><div>Zuletzt geändert am</div>'};
    if (url.includes('zeigen.php') && url.includes('000AB3')) return {body:'<p>No SudokuPad link.</p>'};
    if (url.includes('/api/puzzle/new123')) { downloadCount++; return {body:'{"grid":[[1,2],[2,1]]}'}; }
    throw new Error(`unexpected request: ${url}`);
  };
  const firstRun = await syncLmg({root,http,now:1_800_000_000_000,limits:{pages:2,details:4,payloads:4},log:()=>{}});
  assert.equal(firstRun.manifest.entries.length,2);
  assert.equal(firstRun.audit.stats.reusedCtc,1);
  assert.equal(firstRun.audit.stats.payloadsDownloaded,1);
  assert.equal(downloadCount,1);
  assert.equal(firstRun.audit.withHostedPayload,2);
  const cached = readFileSync(join(ctcDir,'reuse123.json'),'utf8');
  const second = await syncLmg({root,http,now:1_800_000_000_000 + 3600000,limits:{pages:2,details:4,payloads:4},log:()=>{}});
  assert.equal(second.manifest.entries.length,2);
  assert.equal(downloadCount,1);
  assert.equal(readFileSync(join(ctcDir,'reuse123.json'),'utf8'),cached);
  assert.equal(readdirSync(join(root,'public','lmg','puzzles')).length,2);
});
test('Archive UI implementation keeps CtC files and user storage separate', () => {
  const ui = readFileSync(new URL('../src/ui/CtCArchivePage.tsx',import.meta.url),'utf8');
  assert.match(ui,/loadManifest\(catalog\)/);
  assert.match(ui,/catalog === "lmg" \? "lmg\/lmg-manifest\.json"/);
  assert.match(ui,/loadCachedPuzzlePayload\(entry, catalog\)/);
  assert.match(ui,/role="tab" aria-selected=\{catalog === "lmg"\}/);
});
