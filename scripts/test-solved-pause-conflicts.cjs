const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const page = fs.readFileSync('src/ui/PuzzlePage.tsx', 'utf8');
const first = page.match(/setPauseMenuOpen\(editor \|\| creatorPlaytest \? false : Boolean\(([^;]+?)\)\);/);
const refreshed = page.match(/setPauseMenuOpen\(editor \? false : Boolean\(([^;]+?)\)\);/);
assert.ok(first && refreshed, 'initial load and background refresh must both guard auto-pause');
const evaluate = (expression, status, paused) =>
  Function('normalized', `return Boolean(${expression});`)({ progress: { status, paused } });
for (const expression of [first[1], refreshed[1]]) {
  assert.equal(evaluate(expression, 'complete', true), false, 'completed puzzle never auto-opens pause');
  assert.equal(evaluate(expression, 'in_progress', true), true, 'paused unfinished puzzle still opens pause');
  assert.equal(evaluate(expression, 'not_started', false), false, 'unpaused puzzle stays on board');
}
assert.ok(page.includes('if (data.progress.status === "complete") {\n      setPauseMenuOpen(true);'), 'explicit pause button still opens menu on a completed puzzle');

// Exercise the production TS renderer (without a browser or DOM package).
const input = fs.readFileSync('src/sudokupad/render/renderCells.ts', 'utf8');
const js = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const transpiledExports = {};
vm.runInNewContext(js, {
  exports: transpiledExports,
  require: name => {
    if (name === './constants') return { CELL_COLOR_VALUES: {} };
    throw new Error(`Unexpected import: ${name}`);
  },
  document: {
    createElementNS: () => ({ dataset: {}, classList: { add() {} }, textContent: '' }),
  },
});
const renderCell = cell => {
  const texts = [], rects = [];
  transpiledExports.renderSceneCells({
    renderText: options => { texts.push(options); return { dataset: {}, appendChild() {} }; },
    renderRect: options => { rects.push(options); },
    renderCellWedge() {},
    renderPen() {},
  }, [[cell]]);
  return { texts, rects };
};
let output = renderCell({ value: '5', hasError: true });
assert.equal(output.texts.length, 1);
assert.equal(output.texts[0].className, 'cell-value digit-error', 'conflicting player digit must be red');
assert.equal(output.rects.length, 0, 'conflicting big digit must not highlight cell');
output = renderCell({ given: '5', hasError: true });
assert.equal(output.texts[0].className, 'cell-given digit-error', 'conflicting given must be red');
assert.equal(output.rects.length, 0);
output = renderCell({ value: '5' });
assert.equal(output.texts[0].className, 'cell-value', 'normal digit must remain normal');
output = renderCell({ hasError: true });
assert.equal(output.rects.length, 1, 'empty creator-validation cell retains visible error indication');
output = renderCell({ value: '5', hasError: true, hideClue: true, given: '3' });
assert.equal(output.rects.length, 0, 'fog digit conflict must not color cell background');
assert.ok(output.texts.every(text => text.className.endsWith('digit-error')), 'both fog digit layers flag conflict');

const css = fs.readFileSync('src/sudokupad/styles/sudokupad-renderer.css', 'utf8');
assert.match(css, /\.cell-given\.digit-error,\s*\.sphenpad-sudokupad-renderer \.cell-value\.digit-error\s*\{\s*fill:\s*var\(--puzzle-pencilmarkerror\)\s*!important;/);
assert.match(css, /\.cell-pencilmark\.mark-error/, 'pencilmark conflicts stay red');
const fixture = fs.readFileSync('scripts/run-sudokupad-browser-conformance.py', 'utf8');
assert.match(fixture, /#cell-values \.cell-value\.digit-error/, 'conformance fixture must check new conflict style');
console.log('PASS solved-puzzle pause restoration and red big-digit conflict regressions');
