// Navigation, fractional line traversal, hold preview, and unique marker regressions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const interaction = read('src/ui/BoardInteractionLayer.tsx');
const navigation = read('src/ui/useCreatorBoardNavigation.ts');
const canvas = read('src/ui/GridCanvas.tsx');
const creator = read('src/ui/PuzzleEditorPage.tsx');
const group = read('src/sudokupad/creator/groupConstraints.ts');
function syntax(name, scriptKind = ts.ScriptKind.TS) {
  const text = read(name);
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, scriptKind);
  assert.equal(source.parseDiagnostics.length, 0, `${name} has invalid TypeScript syntax: ${source.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`);
  return source;
}
for (const name of ['src/ui/BoardInteractionLayer.tsx','src/ui/PuzzleEditorPage.tsx','src/ui/GridCanvas.tsx']) syntax(name, ts.ScriptKind.TSX);
for (const name of ['src/ui/useCreatorBoardNavigation.ts','src/sudokupad/creator/groupConstraints.ts']) syntax(name);
function extract(text, name) {
  const ast = ts.createSourceFile('fixture.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function find(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node; return ts.forEachChild(node, find); }
  const fn = find(ast); assert.ok(fn, `missing ${name}`);
  return ts.transpileModule(fn.getText(ast), { compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None} }).outputText;
}
const snapFunction = new Function('pointerGridPoint','creatorGridResolution','props','rows','cols',
  `${extract(interaction, 'creatorSnappedPoint')}\nreturn creatorSnappedPoint;`);
function snap(resolution, x, y) {
  const fn = snapFunction((a,b)=>({gx:a,gy:b}),()=>resolution,{creatorSnapMode:'centers'},9,9);
  return fn(x,y);
}
assert.deepEqual(snap(1,.51,.49),{r:.5,c:.5},'resolution 1 must target cell centers');
assert.deepEqual(snap(4,.39,.62),{r:.625,c:.375},'higher resolutions use fractional subcell centers');
const hopsFunction = new Function('pointerGridPoint','creatorGridResolution','rows','cols','LINE_NODE_RADIUS',
  `${extract(interaction, 'creatorFreeLineHops')}\nreturn creatorFreeLineHops;`);
function sweep(resolution,a,b) {
  const fn = hopsFunction((x,y)=>({gx:x,gy:y}),()=>resolution,9,9,.5);
  return fn(a[0],a[1],b[0],b[1]).map((pt)=>`${pt.r},${pt.c}`);
}
assert.deepEqual([...new Set(sweep(1,[.5,.5],[3.5,.5]))],['0.5,0.5','0.5,1.5','0.5,2.5','0.5,3.5']);
assert.deepEqual([...new Set(sweep(4,[.125,.125],[.875,.125]))],['0.125,0.125','0.125,0.375','0.125,0.625','0.125,0.875']);
assert.match(interaction,/const LONG_PRESS_DELAY_MS = 750/);
assert.match(interaction,/const DOUBLE_TAP_WINDOW_MS = 400/);
const held = extract(interaction,'startLongPress');
assert.ok(held.indexOf('setSelectionPreview(null)') < held.indexOf('props.onDoubleCell'), 'held matching must clear preview before publishing matches');
assert.match(interaction,/abortForNavigation\(\)/);
assert.match(navigation,/onPinchStart\?\.\(\)/);
assert.match(creator,/beforePinchRef\.current\.selection/);
assert.match(navigation,/onPointerDownCapture/);
assert.match(navigation,/onPointerMoveCapture/);
assert.match(navigation,/passive: false/);
assert.match(navigation,/wheelHandler\.current/);
assert.match(canvas,/feMorphology/);
assert.match(canvas,/feComposite/);
assert.match(canvas,/CREATOR_OUTLINE_COLORS\[theme\.selectionColor\]/);
assert.match(canvas,/nested \|\| node\.closest/);
// Run the actual creation helper with an isolated native-constraint stub.
const source = ts.transpileModule(group,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mock = {exports:{}}; let inserts = 0;
vm.runInNewContext(source, {module:mock,exports:mock.exports,require:(name)=>name==='./gridStructure'
  ? {creatorDigitCount:()=>9,creatorDigitRange:()=>({min:1,max:9})}
  : {creatorConstraints:def=>def.logic.constraints,addCreatorConstraint:(def,input)=>{
    inserts++;return {...def,logic:{...def.logic,constraints:[...def.logic.constraints,{...input,id:'created'}]}};
  },creatorPartConstraint:()=>undefined,removeCreatorConstraint:()=>undefined}
});
const add = mock.exports.addCreatorGroupConstraint;
const same = (type,sourceElementId,cells) => ({id:'original',type,sourceElementId,cells});
const p0={r:0,c:0},p1={r:0,c:1},p2={r:0,c:2};
let def={rows:9,cols:9,logic:{constraints:[same('difference','difference-kropki',[p0,p1])]}};
let result=add(def,'ratio-kropki',[p1,p0]);
assert.equal(result.def,def,'opposite Kropki type on the same edge must select existing mark');
assert.equal(result.constraintId,'original');
assert.equal(inserts,0);
result=add(def,'ratio-kropki',[p1,p2]);
assert.equal(inserts,1,'a mark on a different edge must still be creatable');
assert.notEqual(result.def,def);
def={rows:9,cols:9,logic:{constraints:[same('even','even',[p0])]}};
result=add(def,'odd',[p0]);
assert.equal(result.def,def,'conflicting single-cell parity marks cannot stack');
assert.equal(inserts,1);
console.log('Creator gesture polish: hold preview, high-resolution line sweep, pan/pinch safeguards, perimeter outline, and duplicate markers passed');
