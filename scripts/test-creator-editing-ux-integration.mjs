import fs from 'node:fs';
const editor = fs.readFileSync(new URL('../src/ui/PuzzleEditorPage.tsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/app/styles.css', import.meta.url), 'utf8');
const board = fs.readFileSync(new URL('../src/ui/BoardInteractionLayer.tsx', import.meta.url), 'utf8');
const grid = fs.readFileSync(new URL('../src/ui/GridCanvas.tsx', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../src/sudokupad/render/SvgRenderer.ts', import.meta.url), 'utf8');
const renderScene = fs.readFileSync(new URL('../src/sudokupad/render/renderScene.ts', import.meta.url), 'utf8');
const required = [
  'copySelectedObjects', 'pasteSelectedObjects', 'selectAllCatalogObjects', 'deleteSelectedObjects',
  'creatorObjectContextMenu', 'creatorPathPoints', 'setCreatorLinePathPoint', 'reorderCreatorLinePathPoint',
  'snapSelected("cell-center")', 'alignSelected("left")', 'moveSelectedToEdge("front")',
  'creatorToolDefaults', 'Save as defaults', 'canvasZoom', 'canvasPan',
  'const keyToTool: Record<string, PuzzleProgress["activeTool"]> = { z: "value", x: "corner", c: "center", v: "highlight", b: "line" }',
  'key === "n" || key === "m"', 'elementControlsActive && mod && key === "c"', 'elementControlsActive && mod && key === "v"',
  'key === "arrowup"', 'selectAllGridCells();', 'key === "i"', 'key === "pagedown"',
  'applyCreatorDigit(digit, "center")', 'applyCreatorDigit(digit, "corner")', 'highlightPalettePages', 'linePalette'
];
for (const token of required) if (!editor.includes(token)) throw new Error(`missing 11K editor integration token: ${token}`);
for (const token of ['.creatorObjectContextMenu', '.creatorPathPoint', '.creatorCanvasViewport', '.creatorBulkInspector']) if (!styles.includes(token)) throw new Error(`missing 11K style: ${token}`);

for (const token of [
  'setCreatorInteractionMode("add")', 'setCreatorInteractionMode("edit")', 'setCreatorInteractionMode("delete")',
  'selectCreatorObjectFromBoard', 'addCreatorPathFromBoard', 'activeCatalogElement === "cosmetic-lines"', 'creatorPathDrawing=', 'selectedCreatorObjectIds=', 'creatorObjectOnly={creatorDeleteMode}'
]) if (!editor.includes(token)) throw new Error(`missing direct creator interaction token: ${token}`);
for (const token of ['creatorPathDrawing?: boolean', 'creatorObjectAt(', 'screenDistanceToGeometry(', 'drag.creatorPath', 'props.onCreatorPath?.']) if (!board.includes(token)) throw new Error(`missing board direct-interaction token: ${token}`);
for (const token of ['sphenpad-creator-selected', 'onCreatorObjectPointerDown={props.onCreatorObjectPointerDown}', 'creatorObjectOnly={props.creatorObjectOnly}']) if (!grid.includes(token)) throw new Error(`missing creator grid interaction token: ${token}`);
if (!renderer.includes('...creatorDataAttrs(opts)')) throw new Error('creator arrow IDs are not preserved by the SVG renderer');
if (!renderer.includes('...opts.dataAttrs')) throw new Error('creator cage IDs are not preserved by the SVG renderer');
if (!renderScene.includes('dataAttrs: creatorDataAttrs(cage as Record<string, unknown>)')) throw new Error('creator cage IDs are not forwarded into rendering');
if (!styles.includes('.sphenpad-creator-selected')) throw new Error('missing creator board-selection styling');

console.log('creator 11K editor integration checks passed');
