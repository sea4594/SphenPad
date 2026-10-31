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
// A held number/color in the tool controls matches only visible pencil marks,
// and toggles off an already selected matching group in either selection mode.
function keyboardMatchingFunction(state) {
  const js = extract(page, 'selectMatchingCells');
  return new Function('data', 'rcKey', 'normalizeHighlightColor', 'setSelection', 'patchAt', 'applySessionPatches', `${js}\nreturn selectMatchingCells;`)(
    state.data,
    (rc) => `${rc.r},${rc.c}`,
    (color) => color.toLowerCase(),
    (selection) => { state.selection = selection; state.data.progress.selection = selection; },
    (_, path, value) => ({ path, value }),
    (patches) => {
      for (const { path, value } of patches) state.data.progress[path[0]] = value;
      state.selection = state.data.progress.selection;
    },
  );
}
{
  const state = { data: { progress: { activeTool: 'center', multiSelect: false, selection: [], lines: [], lineCenterMarks: [], cells: [
    [cell(undefined, { center: ['2'], corner: ['3'] }), cell('8', { center: ['2'], corner: ['3'] }), { ...cell(undefined, { center: ['2'], corner: ['3'] }), given: '9' }],
    [cell(undefined, { center: ['3'], corner: ['4'] }), cell(undefined, { highlights: ['#ff0000'] }), cell('1', { highlights: ['#ff0000'] })],
  ] } }, selection: [] };
  const fn = keyboardMatchingFunction(state);
  fn('2');
  assert.deepEqual(keys(state.selection), ['0,0'], 'center-note hold must ignore pencil marks behind filled digits and givens');
  fn('2');
  assert.deepEqual(keys(state.selection), [], 'repeating an already selected center note must deselect it with multi-select off');
  state.data.progress.activeTool = 'corner';
  fn('3');
  assert.deepEqual(keys(state.selection), ['0,0'], 'corner-note hold must ignore pencil marks behind filled digits and givens');
  state.data.progress.activeTool = 'highlight';
  fn('#ff0000');
  assert.deepEqual(keys(state.selection), ['1,1', '1,2'], 'highlight matching must still include colored cells with digits');
  fn('#ff0000');
  assert.deepEqual(keys(state.selection), [], 'holding an already selected highlight color must deselect its matches');
  fn('#ff0000');
  state.data.progress.activeTool = 'center';
  state.data.progress.multiSelect = true;
  fn('2');
  fn('3');
  assert.deepEqual(keys(state.selection), ['0,0', '1,0', '1,1', '1,2'], 'multi-select must retain earlier selections and union new pencil-mark matches');
  fn('3');
  assert.deepEqual(keys(state.selection), ['0,0', '1,1', '1,2'], 'holding the same number again must deselect only its matches in multi-select mode');
  fn('3');
  assert.deepEqual(keys(state.selection), ['0,0', '1,0', '1,1', '1,2'], 'holding it again must add the matches back without duplicating cells');
  state.data.progress.multiSelect = false;
  fn('3');
  assert.deepEqual(keys(state.selection), ['0,0', '1,1', '1,2'], 'single-select hold must also deselect the fully selected group, preserving other cells');
  fn('3');
  assert.deepEqual(keys(state.selection), ['1,0'], 'single-select hold must replace selection when matches are not all selected');
  fn('3');
  assert.deepEqual(keys(state.selection), [], 'single-select hold must toggle off the group when all its cells are selected');
  state.data.progress.selection = [{ r: 1, c: 2 }];
  fn('9');
  assert.deepEqual(keys(state.data.progress.selection), ['1,2'], 'holding an unmatched number must not deselect unrelated cells');
}
{
  const state = { data: { progress: { activeTool: 'line', multiSelect: true,
    selection: [], storedSelectionWhenLineTool: [{ r: 1, c: 1 }],
    cells: [[cell(undefined), cell(undefined)], [cell(undefined), cell(undefined)]],
    lines: [{ kind: 'center', color: '#ff0000', segments: [{ a: { r: 0, c: 0 }, b: { r: 0, c: 1 } }] }],
    lineCenterMarks: [{ color: '#ff0000', rc: { r: 0, c: 1 } }],
  } }, selection: [] };
  const fn = keyboardMatchingFunction(state);
  fn('#ff0000');
  assert.deepEqual(keys(state.selection), ['0,0', '0,1', '1,1'], 'line-color hold must merge with the stored selection');
  assert.deepEqual(keys(state.data.progress.storedSelectionWhenLineTool), ['0,0', '0,1', '1,1'], 'line tool must preserve the merged selection when switching tools');
  fn('#ff0000');
  assert.deepEqual(keys(state.selection), ['1,1'], 'holding an already selected line color must preserve unrelated selections');
  assert.deepEqual(keys(state.data.progress.storedSelectionWhenLineTool), ['1,1'], 'line tool stored selection must follow group deselection');
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
