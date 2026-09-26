function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown) { if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

import type { PersistedPuzzle } from "../src/core/model";
import { makeInitialProgress } from "../src/core/scl";
import { createAuthoredPuzzleDefinition, syncDefinitionGivens } from "../src/sudokupad/creator/nativeAuthoring";
import { freshCreatorPlaytestData, makeCreatorPlaytestRouteState, readCreatorPlaytestRouteState, rebaseCreatorSolveState, type CreatorEditorSessionState } from "../src/sudokupad/creator/playtest";

let def = createAuthoredPuzzleDefinition({ id: "creator-j", rows: 9, cols: 9, subgrid: { r: 3, c: 3 }, meta: { title: "Creator J", author: "Test", rules: "Normal rules" } });
def = syncDefinitionGivens({ ...def, givens: [{ rc: { r: 0, c: 0 }, v: "1" }] });
const progress = makeInitialProgress(def);
progress.cells[0][1].value = "5";
progress.cells[0][2].value = "4";
progress.cells[0][2].notes.corner.add("2");
progress.cells[1][1].highlights = ["#abcdef"];
progress.selection = [{ r: 0, c: 2 }];
progress.totalMillis = 12345;
progress.status = "complete";
progress.paused = true;
const existing: PersistedPuzzle = { def, progress, undo: [{ prior: true }], redo: [{ future: true }], createdAt: 10, updatedAt: 20 };

const renamed = { ...def, meta: { ...def.meta, title: "Renamed" } };
const metadataRebase = rebaseCreatorSolveState(existing, renamed);
equal(metadataRebase.preserveHistory, true);
equal(metadataRebase.progress.cells[0][1].value, "5");
equal(metadataRebase.progress.cells[0][2].notes.corner.has("2"), true);
equal(metadataRebase.progress.totalMillis, 12345);
equal(metadataRebase.progress.status, "complete");

const gameplayChanged = syncDefinitionGivens({ ...renamed, givens: [...renamed.givens, { rc: { r: 0, c: 1 }, v: "7" }] });
const gameplayRebase = rebaseCreatorSolveState(existing, gameplayChanged);
equal(gameplayRebase.preserveHistory, false);
equal(gameplayRebase.progress.cells[0][1].given, "7");
equal(gameplayRebase.progress.cells[0][1].value, "7");
equal(gameplayRebase.progress.cells[0][2].value, "4");
equal(gameplayRebase.progress.status, "in_progress");
equal(gameplayRebase.progress.paused, false);

const playtest = freshCreatorPlaytestData(existing);
equal(playtest.progress.status, "not_started");
equal(playtest.progress.totalMillis, 0);
equal(playtest.progress.cells[0][1].value, undefined);
equal(playtest.undo.length, 0);
equal(playtest.redo.length, 0);
equal(existing.progress.cells[0][1].value, "5");

const editorState: CreatorEditorSessionState = {
  selection: [{ r: 2, c: 3 }], multiSelect: true, creatorTab: "elements", activeCatalogElement: "thermometers", selectedObjectId: "constraint-1", selectedObjectIds: ["constraint-1", "constraint-2"],
  elementKind: "thermo", authoringOpen: true, addingElement: false, editorTool: "center", editorAlphabetMode: true, editorAlphabetPage: 2,
  editorHighlightPage: 1, editorLineColor: "#123456", editorLineDouble: true, canvasZoom: 1.4, canvasPan: { x: 12, y: -8 },
};
const route = makeCreatorPlaytestRouteState("creator-j", editorState);
const parsed = readCreatorPlaytestRouteState(route);
ok(parsed);
equal(parsed.projectKey, "creator-j");
equal(parsed.editorState.selection[0].r, 2);
equal(parsed.editorState.selectedObjectId, "constraint-1");
equal(parsed.editorState.selectedObjectIds?.length, 2);
equal(parsed.editorState.canvasZoom, 1.4);
equal(parsed.editorState.canvasPan?.x, 12);
equal(readCreatorPlaytestRouteState({ creatorPlaytest: { projectKey: 2 } }), null);

console.log("creator playtest / My Puzzles bridge tests passed");
