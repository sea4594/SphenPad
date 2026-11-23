const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const read = (file) => fs.readFileSync(file, 'utf8');
const puzzle = read('src/ui/PuzzlePage.tsx');
const archive = read('src/ui/CtCArchivePage.tsx');
const afterPaint = read('src/ui/AfterFirstPaint.tsx');

for (const [name, body] of [
  ['src/ui/PuzzlePage.tsx', puzzle],
  ['src/ui/CtCArchivePage.tsx', archive],
  ['src/ui/AfterFirstPaint.tsx', afterPaint],
]) {
  const out = ts.transpileModule(body, {
    fileName: name,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  assert.deepEqual((out.diagnostics || []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [], `${name} syntax`);
}

assert.match(afterPaint, /const \[ready, setReady\] = useState\(false\)/, 'board must not mount before first paint');
assert.match(afterPaint, /requestAnimationFrame\(\(\) => \{\s*secondFrame = window\.requestAnimationFrame\(\(\) => setReady\(true\)\)/, 'defer until a subsequent frame');
assert.match(afterPaint, /return \(\) => \{\s*window\.cancelAnimationFrame\(firstFrame\);/, 'cancel postponed work if dialog or puzzle closes');
assert.match(afterPaint, /return ready \? <>{children}<\/> : null/, 'show board permanently after first mount');

assert.match(puzzle, /const \[loadedPuzzleKey, setLoadedPuzzleKey\]/, 'route-keyed data must prevent showing prior puzzle');
assert.match(puzzle, /if \(cancelled\) return;\s*if \(!local\)/, 'late read must not update a left puzzle');
assert.match(puzzle, /return \(\) => \{ cancelled = true; \};/, 'unsubscribe initial puzzle read');
assert.match(puzzle, /if \(!data \|\| loadedPuzzleKey !== key\) return \(/, 'show puzzle shell while loading');
assert.match(puzzle, /className="topbar puzzleTopbar"/, 'puzzle shell has controls');
assert.match(puzzle, /aria-label="Back"/, 'back control works without puzzle data');
assert.match(puzzle, /<AfterFirstPaint key=\{key\}>\s*<GridCanvas/, 'defer primary board only');
assert.match(puzzle, /<\/AfterFirstPaint>/, 'board gate closes');
assert.match(puzzle, /<Keyboard/, 'keyboard remains mounted immediately after puzzle record');

const cardStart = archive.indexOf('className="archivePreviewStack"');
const rulesStart = archive.indexOf('className="archiveRulesPreview"');
assert.ok(cardStart >= 0 && rulesStart > cardStart, 'archive cards and rules dialog exist in order');
const cardMarkup = archive.slice(cardStart, rulesStart);
assert.match(cardMarkup, /<(?:GridCanvas|ArchivePreviewCanvas)\b/, 'catalog cards retain an immediate puzzle preview');
assert.doesNotMatch(cardMarkup, /<AfterFirstPaint\b/, 'catalog card previews must not be deferred');
const dialog = archive.split('className="archiveRulesPreview"')[1];
assert.ok(dialog, 'Import rules dialog remains present');
if (dialog.includes('<AfterFirstPaint key={rulesDialogEntry.id}>')) {
  assert.ok(dialog.indexOf('<AfterFirstPaint') < dialog.indexOf('<GridCanvas'), 'dialog controls appear before heavy SVG');
} else {
  assert.ok(!archive.includes('import { AfterFirstPaint } from "./AfterFirstPaint";') || archive.includes('<AfterFirstPaint'), 'no unused Import deferral import');
}
console.log('Phase 4: immediate puzzle shell and controls, deferred large SVG, safe route switching, existing scrolling previews PASS');
