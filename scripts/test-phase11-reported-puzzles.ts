import { readFile } from "node:fs/promises";
import { definitionFromSudokuPadImport } from "../src/sudokupad/app/coreAdapter";
import { loadResolvedSudokuPadPayload } from "../src/sudokupad/loader/importPuzzle";
import { emptySudokuPadUrlSettings } from "../src/sudokupad/loader/urlSettings";
import { sceneWithPuzzleProgress } from "../src/sudokupad/app/progressScene";
import { makeInitialProgress } from "../src/core/scl";
import { getSudokuPadLitCells } from "../src/sudokupad/fog/fogState";

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function archivedPayload(fileName: string): Promise<string> {
  const raw = JSON.parse(await readFile(new URL(`../public/archive/puzzles/${fileName}`, import.meta.url), "utf8")) as { payload?: unknown };
  expect(typeof raw.payload === "string" && raw.payload.length > 0, `${fileName}: archive payload missing`);
  return raw.payload;
}

const arrowPayload = await archivedPayload("nz9u2li1vk.json");
const arrowResult = await loadResolvedSudokuPadPayload(arrowPayload, { context: { sourceId: "nz9u2li1vk", urlSettings: emptySudokuPadUrlSettings() } });
const arrowImported = definitionFromSudokuPadImport(arrowResult);
expect(arrowImported.def.scene, "nz9u2li1vk: normalized scene missing");
expect(arrowImported.def.scene.arrows.length > 0, "nz9u2li1vk: arrows were lost during import");
const arrowLive = sceneWithPuzzleProgress(arrowImported.def.scene, makeInitialProgress(arrowImported.def), arrowImported.def.logic, true);
expect(arrowLive.arrows.length === arrowImported.def.scene.arrows.length, "nz9u2li1vk: arrows changed between preview and live progress scene");

const fogPayload = await archivedPayload("sandra-and-nala_search-and-surprise.json");
const fogResult = await loadResolvedSudokuPadPayload(fogPayload, { context: { sourceId: "sandra-and-nala/search-and-surprise", urlSettings: emptySudokuPadUrlSettings() } });
const fogImported = definitionFromSudokuPadImport(fogResult);
expect(fogImported.def.scene?.fog, "search-and-surprise: fog state was lost during import");
const fogLive = sceneWithPuzzleProgress(fogImported.def.scene, makeInitialProgress(fogImported.def), fogImported.def.logic, true);
expect(fogLive.fog, "search-and-surprise: fog state was lost in live progress rendering");
expect(getSudokuPadLitCells(fogLive).length > 0, "search-and-surprise: initial fog state has no lit cells");


// Schrodinger's Carry On contains internally scaled authored cage paths with
// non-scaling strokes and direct stock fog-mask references. Thumbnail CSS must
// not turn those strokes into giant black blocks, and fog IDs must be scoped per SVG.
const schrodingerPayload = await archivedPayload("james-sinclair_schrodingers-carry-on.json");
const schrodingerResult = await loadResolvedSudokuPadPayload(schrodingerPayload, { context: { sourceId: "james-sinclair/schrodingers-carry-on", urlSettings: emptySudokuPadUrlSettings() } });
const schrodingerImported = definitionFromSudokuPadImport(schrodingerResult);
expect(schrodingerImported.def.scene, "schrodingers-carry-on: normalized scene missing");
const schrodingerSource = JSON.stringify(schrodingerResult.sourcePuzzle);
expect(schrodingerSource.includes("non-scaling-stroke"), "schrodingers-carry-on: expected non-scaling authored path missing");
expect(schrodingerSource.includes("scale(56 56)"), "schrodingers-carry-on: expected internally scaled authored path missing");
expect(schrodingerSource.includes("fog-mask-fog"), "schrodingers-carry-on: expected authored fog-mask reference missing");
const stylesSource = await readFile(new URL("../src/app/styles.css", import.meta.url), "utf8");
expect(stylesSource.includes(':not([transform*="scale("])'), "preview CSS must preserve non-scaling-stroke on internally scaled authored paths");
const fogMaskSource = await readFile(new URL("../src/sudokupad/fog/fogMasks.ts", import.meta.url), "utf8");
expect(fogMaskSource.includes('[mask="url(#fog-mask-fog)"]'), "authored fog-mask references must be scoped per board");

console.log("Reported arrow/fog/preview puzzle import-to-play regressions passed");
