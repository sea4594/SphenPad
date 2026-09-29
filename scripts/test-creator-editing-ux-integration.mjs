import fs from 'node:fs';
const editor = fs.readFileSync(new URL('../src/ui/PuzzleEditorPage.tsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/app/styles.css', import.meta.url), 'utf8');
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
console.log('creator 11K editor integration checks passed');
