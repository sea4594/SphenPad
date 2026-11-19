import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractLmgMetadata, catalogEntryFromSource, extractDescriptionPuzzleLinks, parseLmgPublishedDate } from './lmg-catalog-utils.mjs';

const ui = readFileSync('src/ui/CtCArchivePage.tsx', 'utf8');
const css = readFileSync('src/app/styles.css', 'utf8');
const sync = readFileSync('scripts/sync-lmg-cache.mjs', 'utf8');

test('clear filters remains in search row; Surprise me is full-width and outside collapsible controls', () => {
  const search = ui.slice(ui.indexOf('<div className="archiveSearchRow">'), ui.indexOf('{filtersExpanded && <div'));
  assert.match(search, /archiveClearFiltersButton/);
  assert.doesNotMatch(search, /Surprise me!/);
  const after = ui.slice(ui.indexOf('{filtersExpanded && <div'), ui.indexOf('<div className="menuSectionTitle">{catalog'));
  assert.equal((ui.match(/Surprise me!/g) || []).length, 1);
  assert.match(after, /\}\s*<button type="button" className="btn primary archiveSurpriseButton"/);
  assert.match(css, /\.archiveControls > \.archiveSurpriseButton\s*\{[^}]*width:\s*100%/);
  assert.equal((ui.match(/Clear Filters\s*<\/button>/g) || []).length, 1);
});

test('LMG filter difficulty follows actual ascending difficulty, including very easy', () => {
  assert.match(ui, /const order = \["Very easy", "Easy", "Medium", "Hard", "Very hard", "Unrated"\]/);
  assert.match(ui, /\/very easy\|sehr leicht\/i/);
  assert.match(ui, /\{ value: "date", label: "Published date" \}/);
  assert.doesNotMatch(ui, /catalog === "lmg" && \(sortField === "video_length" \|\| sortField === "date"\)/);
});

test('LMG published dates convert to valid comparable timestamps', () => {
  const newer = parseLmgPublishedDate('Published on 5. August 2026, 05:30');
  const older = parseLmgPublishedDate('11. Januar 2025, 12:53');
  assert.equal(newer, Date.UTC(2026, 7, 5, 5, 30));
  assert.equal(older, Date.UTC(2025, 0, 11, 12, 53));
  assert.ok(newer > older);
  assert.equal(parseLmgPublishedDate('31. Februar 2025'), null);
  assert.equal(parseLmgPublishedDate('Unknown'), null);
});

test('LMG page rating, community difficulty, and upload date are read from LMG detail, not puzzle payload', () => {
  const page = '<p>Published on 5. August 2026, 05:30 by <a href="/user">Author</a></p>' +
    '<a href="https://sudokupad.app/VALID">Play</a>' +
    '<p>Last changed on -</p><h3>Comments</h3>' +
    '<a href="https://sudokupad.app/COMMENT_ONLY">Comment</a>' +
    '<img alt="sehr leichtes Rätsel"><div>Rating: 91 %</div><div>Solved: 115 times</div>';
  const meta = extractLmgMetadata(page, { id: '000SXY', title: 'Example' });
  assert.equal(meta.puzzleAuthor, 'Author');
  assert.equal(meta.rating, 91);
  assert.equal(meta.solves, 115);
  assert.equal(meta.dateTs, Date.UTC(2026,7,5,5,30));
  assert.deepEqual(extractDescriptionPuzzleLinks(page), ['https://sudokupad.app/VALID']);
  const row = catalogEntryFromSource({ ...meta, id:'000SXY', title:'Example' }, 'https://sudokupad.app/VALID', {sourceId:'VALID'}, 'VALID', 1);
  assert.equal(row.videoDateTs, Date.UTC(2026,7,5,5,30));
  assert.equal(row.lmgRating, 91);
  assert.equal(row.lmgSolves, 115);
  const legacy = catalogEntryFromSource({ id:'000SXY', title:'Example', published:'5. August 2026, 05:30' }, 'https://sudokupad.app/VALID', {sourceId:'VALID'}, 'VALID', 1);
  assert.equal(legacy.videoDateTs, Date.UTC(2026,7,5,5,30));
});

test('LMG backfill remains incremental, auditable and bounded; reuses cached payloads', () => {
  assert.match(sync, /DEFAULTS = \{ pages: 25, details: 160, payloads: 100 \}/);
  assert.match(sync, /pendingDetailPages:/);
  assert.match(sync, /pendingPayloads:/);
  assert.match(sync, /if \(sourceCache\.has\(sourceId\)\) continue/);
  assert.match(sync, /if \(oldCtc\.has\(sourceId\)\)/);
});
