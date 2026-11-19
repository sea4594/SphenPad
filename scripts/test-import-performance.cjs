const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ui = fs.readFileSync('src/ui/CtCArchivePage.tsx','utf8');
const app = fs.readFileSync('src/app/App.tsx','utf8');

test('Import previews are loaded only when near the viewport', () => {
  assert.match(ui, /new IntersectionObserver\(/);
  assert.match(ui, /archiveListRef\.current\?\.querySelectorAll/);
  assert.match(ui, /if \(!item\.isIntersecting\) continue/);
  assert.doesNotMatch(ui, /visibleRows\.forEach\(\(entry\) => \{\s*queuePreviewLoad\(entry\)/);
  assert.match(ui, /visibleRows\.slice\(0, 3\)\.forEach\(queuePreviewLoad\)/);
});
test('Each decoded preview retains its memoized progress and render subtree', () => {
  assert.match(ui, /const ArchivePreviewCanvas = memo\(/);
  assert.match(ui, /const progress = useMemo\(\(\) => makeInitialProgress\(def\), \[def\]\)/);
  assert.match(ui, /<ArchivePreviewCanvas def=\{previewDef\} strictScale \/>/);
  assert.match(ui, /<ArchivePreviewCanvas def=\{previewedPuzzles\.get\(rulesDialogEntry\.id\)!\} \/>/);
});
test('Observer callbacks do not change on every preview result', () => {
  assert.match(ui, /previewCacheRef\.current\.get\(entry\.id\)/);
  assert.match(ui, /\}, \[catalog\]\);\s*const processPreviewQueue/);
  assert.match(ui, /\}, \[active, processPreviewQueue\]\);/);
  assert.match(ui, /\}, \[active, visibleRows, queuePreviewLoad\]\);/);
  assert.match(ui, /previewAttemptedRef\.current\.has\(entry\.id\)/);
});
test('Tab switches cancel stale work and never mix CtC and LMG previews', () => {
  assert.match(ui, /if \(generation !== manifestRequestRef\.current\) return null/);
  assert.match(ui, /if \(generation === manifestRequestRef\.current\)/);
  assert.equal((ui.match(/previewCacheRef\.current\.clear\(\)/g) || []).length, 2);
  assert.equal((ui.match(/loadCountRef\.current = 0/g) || []).length, 2);
  assert.match(ui, /archive\/archive-manifest\.json/);
  assert.match(ui, /lmg\/lmg-manifest\.json/);
});
test('Global viewport sizing does not run for every scroll movement', () => {
  assert.doesNotMatch(app, /viewport\?\.(?:add|remove)EventListener\("scroll", scheduleViewportSync\)/);
  assert.match(app, /viewport\?\.addEventListener\("resize", scheduleViewportSync\)/);
  assert.match(app, /window\.addEventListener\("orientationchange", scheduleViewportSync\)/);
});
test('Import/save and storage boundaries remain present', () => {
  assert.match(ui, /importArchiveEntry\(/);
  assert.match(ui, /getPuzzle\(key\)/);
  assert.match(ui, /upsertPuzzle\(/);
  assert.match(ui, /loadCachedPuzzlePayload\(entry, catalog\)/);
});

test('Puzzles and Folders reuse unchanged preview boards when opening Settings', () => {
  const menu = fs.readFileSync('src/ui/MainMenu.tsx','utf8');
  const folders = fs.readFileSync('src/ui/FoldersPage.tsx','utf8');
  const preview = fs.readFileSync('src/ui/PuzzleListPreview.tsx','utf8');
  assert.equal((menu.match(/<PuzzleListPreview /g) || []).length, 3);
  assert.equal((folders.match(/<PuzzleListPreview /g) || []).length, 1);
  assert.doesNotMatch(menu, /<GridCanvas/);
  assert.doesNotMatch(folders, /<GridCanvas/);
  assert.match(preview, /memo\(function PuzzleListPreview/);
  assert.match(preview, /useMemo\([\s\S]*\[progress\]/);
  assert.match(preview, /progress=\{previewProgress\}/);
  assert.match(preview, /strictScale/);
});
