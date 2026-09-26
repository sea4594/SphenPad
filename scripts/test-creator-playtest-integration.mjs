import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const requireText = (source, text, label) => { if (!source.includes(text)) throw new Error(`missing ${label}: ${text}`); };
const forbidText = (source, text, label) => { if (source.includes(text)) throw new Error(`unexpected ${label}: ${text}`); };

const storage = read("src/core/storage.ts");
const editor = read("src/ui/PuzzleEditorPage.tsx");
const player = read("src/ui/PuzzlePage.tsx");
const menu = read("src/ui/MainMenu.tsx");
const folders = read("src/ui/FoldersPage.tsx");

requireText(storage, "rebaseCreatorSolveState(existing, def)", "solve-progress rebasing");
requireText(editor, "?creatorPlaytest=1", "real PuzzlePage playtest route");
requireText(editor, "makeCreatorPlaytestRouteState", "editor session return state");
requireText(editor, "Save to My Puzzles", "explicit My Puzzles publish action");
requireText(editor, "setCreatorProjectPublished(key, true)", "explicit creator publish call");
requireText(player, "freshCreatorPlaytestData", "isolated fresh playtest state");
requireText(player, "if (!requestedCreatorPlaytest) await upsertPuzzle", "playtest persistence isolation");
requireText(player, "state: location.state", "creator return state forwarding");
requireText(player, "creatorSudokuPadUrl(data.def)", "creator SudokuPad link export");
requireText(menu, "Creator · editable", "creator ownership marker");
requireText(menu, "Edit in Creator", "Home creator edit action");
requireText(menu, "setCreatorProjectPublished", "Home creator unpublish action");
requireText(storage, "creatorPublished === true", "unpublished creator puzzle filter");
forbidText(menu, "deleteCreatorProject", "Home deleting the creator project itself");
requireText(folders, "Edit in Creator", "folder creator edit action");
requireText(folders, "setCreatorProjectPublished", "folder creator unpublish action");

console.log("creator playtest / My Puzzles UI integration checks passed");
