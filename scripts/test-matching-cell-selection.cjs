// Regression for the original SphenPad double-click / long-press match gestures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const interaction = fs.readFileSync(path.join(root, 'src/ui/BoardInteractionLayer.tsx'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/ui/PuzzlePage.tsx'), 'utf8');
function extract(source, name) {
  const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function find(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node; return ts.forEachChild(node, find); }
  const node = find(ast);
  assert.ok(node, `${name} not found`);
  return ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
function matchingFunction(state) {
  const js = extract(page, 'onDoubleSelectCell');
  return new Function('latestDataRef', 'setSelection', 'rcKey', `${js}\nreturn onDoubleSelectCell;`)(
    { current: state.data }, (cells) => { state.selection = cells; }, (rc) => `${rc.r},${rc.c}`,
  );
}
const cell = (value, opts = {}) => ({ value, notes: { center: new Set(opts.center ?? []), corner: new Set(opts.corner ?? []), candidates: new Set(opts.candidates ?? []) }, highlights: opts.highlights ?? [] });
const keys = (cells) => cells.map((c) => `${c.r},${c.c}`).sort();
{
  const state = { data: { progress: { activeTool: 'value', multiSelect: false, selection: [], cells: [
    [cell('4'), cell('2'), cell('4')],
    [cell(undefined), cell('4'), cell('7')],
  ] } }, selection: [] };
  const fn = matchingFunction(state);
  fn({ r: 0, c: 0 });
  assert.deepEqual(keys(state.selection), ['0,0', '0,2', '1,1'], 'double-click should find all matching digits, including the last column of a rectangular board');
  state.data.progress.cells[0][0].highlights = ['#ff0000'];
  state.data.progress.cells[0][1].highlights = ['#ff0000', '#00ff00'];
  fn({ r: 0, c: 0 }, 1);
  assert.deepEqual(keys(state.selection), ['0,0', '0,1'], 'held selection should cycle to cells containing all target highlights');
  state.data.progress.multiSelect = true;
  state.data.progress.selection = [{ r: 1, c: 2 }];
  fn({ r: 0, c: 0 });
  assert.deepEqual(keys(state.selection), ['0,0', '0,2', '1,1', '1,2'], 'ordinary double click in multi-select mode should merge');
  fn({ r: 0, c: 0 }, 0);
  assert.deepEqual(keys(state.selection), ['0,0', '0,2', '1,1'], 'holding to cycle should replace, not merge, the previous matching group');
}
{
  const state = { data: { progress: { activeTool: 'center', multiSelect: false, selection: [], cells: [
    [cell(undefined, { center: ['1', '3'] }), cell(undefined, { center: ['1', '3', '5'] })],
    [cell(undefined, { center: ['1'] }), cell(undefined, { corner: ['3'] })],
  ] } }, selection: [] };
  const fn = matchingFunction(state);
  fn({ r: 0, c: 0 });
  assert.deepEqual(keys(state.selection), ['0,0', '0,1'], 'matching center notes should allow supersets');
  state.data.progress.activeTool = 'corner';
  fn({ r: 1, c: 1 });
  assert.deepEqual(keys(state.selection), ['1,1'], 'matching corner marks should remain available');
  state.data.progress.cells[1][1] = cell(undefined);
  fn({ r: 1, c: 1 });
  assert.deepEqual(keys(state.selection), ['1,1'], 'blank-cell matching must exclude cells with notes');
}
assert.match(interaction, /props\.onDoubleCell\(rc, drag\.longPressCycleIndex \?\? 0\)/, 'long press must continue cycling matches');
const pointerJs = extract(interaction, 'onPointerUp');
function pointerUpCase({ lastTap, longPressTriggered, startedSelected = false }) {
  const published = []; const events = []; let matched = 0;
  const drag = { last: { r: 0, c: 0 }, path: [], segments: [], moved: false, selectionSet: new Set(['0,0']), startedSelected, startedSelectionSize: startedSelected ? 1 : 0, startedCellKey: '0,0', longPressTriggered };
  const dragRef = { current: drag }, tapRef = { current: lastTap ? { cellKey: '0,0', pointerType: 'mouse', timestamp: Date.now() - 100 } : null };
  const scope = {
    dragRef, tapRef, progress: { activeTool: 'value', multiSelect: false }, interactive: true,
    clearLongPress: () => {}, setPreview: () => {}, setSelectionPreview: () => {},
    props: { onDoubleCell: () => { matched++; events.push('match'); } },
    cellAt: () => ({ r: 0, c: 0 }), keyOf: (rc) => `${rc.r},${rc.c}`,
    rcFromKey: (key) => { const [r, c] = key.split(',').map(Number); return { r, c }; },
    previewSelection: () => {}, publishSelection: (selection) => { published.push(selection); events.push('publish'); },
    DOUBLE_TAP_WINDOW_MS: 400, dragTransformRef: { current: null },
    selectionPreviewRafRef: { current: null }, pendingSelectionPreviewRef: { current: null },
    window: { cancelAnimationFrame: () => {} },
  };
  const names = Object.keys(scope);
  const fn = new Function(...names, `${pointerJs}\nreturn onPointerUp;`)(...names.map((name) => scope[name]));
  fn({ pointerType: 'mouse', clientX: 3, clientY: 3 });
  return { published, matched, dragRef, events };
}
let result = pointerUpCase({ lastTap: true, longPressTriggered: false });
assert.equal(result.matched, 1, 'second tap must invoke matching');
assert.equal(result.published.length, 0, 'second tap must not overwrite matched cells with stale pointer-down selection');
result = pointerUpCase({ lastTap: true, longPressTriggered: false, startedSelected: true });
assert.deepEqual(result.events, ['publish', 'match'], 'a second click that clears its single-cell selection must finish with the matching group');
result = pointerUpCase({ lastTap: false, longPressTriggered: true });
assert.equal(result.published.length, 0, 'long-press release must not overwrite its previously selected matching group');
result = pointerUpCase({ lastTap: false, longPressTriggered: false });
assert.equal(result.published.length, 1, 'ordinary taps must still finalize their normal selection');
console.log('Cell matching: value/highlight/marks/blank/cycle/multi-select and pointer-release regressions passed');
