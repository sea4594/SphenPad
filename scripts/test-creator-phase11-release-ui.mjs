import fs from "node:fs";
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const parity = read("src/sudokupad/creator/sudokumakerParity.ts");
const editor = read("src/ui/PuzzleEditorPage.tsx");
const creator = read("src/ui/PuzzleCreatorPage.tsx");
const player = read("src/ui/PuzzlePage.tsx");
const menu = read("src/ui/MainMenu.tsx");
const storage = read("src/core/storage.ts");
const interchange = read("src/sudokupad/creator/interchange.ts");
const worker = read("src/sudokupad/creator/worker.ts");
const accountSync = read("src/app/accountSync.tsx");

const entries = [...parity.matchAll(/e\("([^"]+)",(\d+),"([^"]+)","([^"]+)",\[(.*?)\],"([^"]+)"/g)].map((m) => ({ upstream: m[1], code: Number(m[2]), ids: [...m[5].matchAll(/"([^"]+)"/g)].map((x) => x[1]) }));
if (entries.length !== 47) throw new Error(`expected 47 parity rows, found ${entries.length}`);
if (new Set(entries.map((entry) => entry.code)).size !== 47) throw new Error("duplicate SudokuMaker upstream codes");
for (const entry of entries) {
  if (entry.upstream === "SudokuRules") {
    for (const token of ["creatorSudokuRulesEnabled", "setCreatorSudokuRules", "Standard row/column Sudoku rules"]) if (!editor.includes(token)) throw new Error(`SudokuRules UI missing ${token}`);
    continue;
  }
  for (const id of entry.ids) if (!editor.includes(`"${id}"`)) throw new Error(`${entry.upstream} mapping ${id} is not exposed by PuzzleEditorPage`);
}
const workflowTokens = [
  [creator, "New puzzle", "creator new-project flow"],
  [creator, "Duplicate", "creator duplicate flow"],
  [creator, "Rename", "creator rename flow"],
  [storage, "saveCreatorProject", "creator persistence"],
  [storage, "deleteCreatorProject", "creator tombstone deletion"],
  [editor, "validateGrid", "worker validation"],
  [editor, "findCreatorSolutions", "solution finder"],
  [editor, "importCreatorInterchange", "editable import"],
  [editor, "exportCreatorInterchange", "SudokuPad export"],
  [editor, "?creatorPlaytest=1", "real playtest route"],
  [player, "freshCreatorPlaytestData", "isolated playtest"],
  [menu, "Creator · editable", "My Puzzles creator ownership"],
  [editor, "Save to My Puzzles", "explicit creator publish workflow"],
  [storage, "creatorPublished === true", "unpublished creator projects hidden from My Puzzles"],
  [editor, "copySelectedObjects", "editing clipboard"],
  [editor, "canvasZoom", "creator zoom/pan"],
  [interchange, "custom-runtime-not-exported", "custom runtime export loss reporting"],
  [worker, "not executed", "custom runtime validation limitation"],
  [accountSync, "creatorProjects", "creator account-sync snapshot"],
  [accountSync, "deletedAt", "creator account-sync tombstones"],
];
for (const [source, token, label] of workflowTokens) if (!source.includes(token)) throw new Error(`missing ${label}: ${token}`);

const gridCanvas = read("src/ui/GridCanvas.tsx");
const interaction = read("src/ui/BoardInteractionLayer.tsx");
const styles = read("src/app/styles.css");
for (const [source, token, label] of [
  [gridCanvas, "previewMode ? { ...progress, selection: [], multiSelect: false }", "preview selection suppression"],
  [gridCanvas, "!previewMode ? <BoardInteractionLayer", "preview interaction-layer suppression"],
  [interaction, "getScreenCTM()", "screen-transform-aware board hit testing"],
  [styles, 'vector-effect: none !important', "proportionally scaled preview strokes"],
  [styles, 'margin: 0 !important', "centered native SVG framing"],
]) if (!source.includes(token)) throw new Error(`missing ${label}: ${token}`);

console.log(`Phase 11 release UI/workflow audit passed: ${entries.length}/47 inventory rows exposed and critical workflows wired.`);
