import { readFile } from "node:fs/promises";
import { definitionFromSudokuPadImport } from "../src/sudokupad/app/coreAdapter";
import { loadResolvedSudokuPadPayload } from "../src/sudokupad/loader/importPuzzle";
import { emptySudokuPadUrlSettings } from "../src/sudokupad/loader/urlSettings";
import { sceneWithPuzzleProgress } from "../src/sudokupad/app/progressScene";
import { makeInitialProgress } from "../src/core/scl";
import { getSudokuPadLitCells } from "../src/sudokupad/fog/fogState";
import { createAuthoredPuzzleDefinition } from "../src/sudokupad/creator/nativeAuthoring";

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


// User-drawn double lines share the same progress renderer in solving and creator mode.
// Stored segment direction is intentionally inconsistent here: rendering must keep each
// colour in a stable lane and join same-colour corners/splits without mutating progress.
const lineDef = createAuthoredPuzzleDefinition({ id: "double-line-rendering", rows: 4, cols: 4, meta: {}, subgrid: { r: 2, c: 2 }, digitRange: { min: 1, max: 4 } });
expect(lineDef.scene, "double-line-rendering: authored scene missing");
const userLines = (progress: ReturnType<typeof makeInitialProgress>) => sceneWithPuzzleProgress(lineDef.scene!, progress, lineDef.logic, true).lines.filter((line) => line.className === "sphenpad-user-line");
const pointDistance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
{
  const progress = makeInitialProgress(lineDef);
  const segments = [{ a: { r: 0, c: 0 }, b: { r: 0, c: 1 } }, { a: { r: 0, c: 2 }, b: { r: 0, c: 1 } }];
  progress.lines = [{ kind: "center", color: "#57d38c", segments }, { kind: "center", color: "#ff8fc3", segments }];
  const lines = userLines(progress), green = lines.filter((line) => line.color === "#57d38c");
  expect(green.length === 2, "double-line-rendering: expected two green straight segments");
  expect(pointDistance(green[0].wayPoints![1] as [number, number], green[1].wayPoints![0] as [number, number]) < 1e-9, "double-line-rendering: reversed stored segment direction swapped the green lane");
}
{
  const progress = makeInitialProgress(lineDef);
  const segments = [{ a: { r: 0, c: 0 }, b: { r: 0, c: 1 } }, { a: { r: 0, c: 1 }, b: { r: 1, c: 1 } }];
  progress.lines = [{ kind: "center", color: "#57d38c", segments }, { kind: "center", color: "#ff8fc3", segments }];
  const lines = userLines(progress), green = lines.filter((line) => line.color === "#57d38c"), pink = lines.filter((line) => line.color === "#ff8fc3");
  expect(pointDistance(green[0].wayPoints![1] as [number, number], green[1].wayPoints![0] as [number, number]) < 1e-9, "double-line-rendering: green corner did not join cleanly");
  expect(pointDistance(pink[0].wayPoints![1] as [number, number], pink[1].wayPoints![0] as [number, number]) < 1e-9, "double-line-rendering: pink corner did not join cleanly");
  expect(pointDistance(green[0].wayPoints![1] as [number, number], pink[0].wayPoints![1] as [number, number]) > 0.04, "double-line-rendering: parallel corner lanes collapsed together");
}
{
  const progress = makeInitialProgress(lineDef);
  const incoming = { a: { r: 1, c: 0 }, b: { r: 1, c: 1 } };
  progress.lines = [
    { kind: "center", color: "#ff8fc3", segments: [incoming, { a: { r: 1, c: 1 }, b: { r: 2, c: 1 } }] },
    { kind: "center", color: "#57d38c", segments: [incoming, { a: { r: 1, c: 1 }, b: { r: 0, c: 1 } }] },
  ];
  const lines = userLines(progress);
  const incomingGreen = lines.find((line) => line.color === "#57d38c" && Math.min(...line.wayPoints!.map((point) => point[1])) < 1);
  const incomingPink = lines.find((line) => line.color === "#ff8fc3" && Math.min(...line.wayPoints!.map((point) => point[1])) < 1);
  expect(incomingGreen && incomingPink, "double-line-rendering: split incoming lanes missing");
  const greenJoin = incomingGreen.wayPoints![1] as [number, number], pinkJoin = incomingPink.wayPoints![1] as [number, number];
  expect(greenJoin[0] < pinkJoin[0], "double-line-rendering: split heuristic did not keep green toward its upper branch and pink toward its lower branch");
}


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
