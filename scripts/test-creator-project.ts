function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown) { if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function deepEqual(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function throws(fn: () => unknown, pattern: RegExp) { let error: unknown; try { fn(); } catch (caught) { error = caught; } if (!(error instanceof Error) || !pattern.test(error.message)) throw new Error(`expected error matching ${pattern}`); }
import { addCreatorConstraint, authoredPuzzleFile, createAuthoredPuzzleDefinition, definitionFromAuthoredPuzzleFile, setCreatorSolution, syncDefinitionGivens, type SphenPadAuthoredPuzzleFileV3 } from "../src/sudokupad/creator/nativeAuthoring";
import { creatorProjectFromDefinition, definitionFromCreatorProject, parseCreatorProject, SPHENPAD_CREATOR_PROJECT_VERSION } from "../src/sudokupad/creator/project";
import { SUDOKUMAKER_TOOL_INVENTORY, SUDOKUMAKER_WORKER_API } from "../src/sudokupad/creator/sudokumakerParity";

let def = createAuthoredPuzzleDefinition({ id: "creator-test", rows: 9, cols: 9, subgrid: { r: 3, c: 3 }, meta: { title: "Round trip", author: "Test", rules: "Rules", creatorElements: ["given-digits", "regions", "thermometers"] } });
def = syncDefinitionGivens({ ...def, givens: [{ rc: { r: 0, c: 0 }, v: "1" }] });
def = setCreatorSolution(def, "123456789".repeat(9));
def = addCreatorConstraint(def, { id: "thermo-1", type: "thermometer", sourceElementId: "thermometers", path: [{ r: 0, c: 0 }, { r: 0, c: 1 }] }, { lines: [{ wayPoints: [[0.5,0.5],[0.5,1.5]], color: "#ccc", thickness: 10 }] });
const project = creatorProjectFromDefinition(def);
equal(project.version, SPHENPAD_CREATOR_PROJECT_VERSION); equal(project.grid.rows, 9); equal(project.givens[0].value, "1"); equal(project.regions.length, 9); equal(project.constraints.length, 1); equal(project.constraints[0].visuals.lines.length, 1);
const roundTrip = definitionFromCreatorProject(parseCreatorProject(project));
equal(roundTrip.meta.title, def.meta.title); deepEqual(roundTrip.givens, def.givens); equal(roundTrip.logic?.solution, def.logic?.solution); equal(roundTrip.logic?.constraints?.length, 1); equal(roundTrip.scene?.lines.length, 1); equal(roundTrip.scene?.lines[0]["data-sphenpad-constraint"], "thermo-1");
const v4 = authoredPuzzleFile(def); equal(v4.version, 4); const importedV4 = definitionFromAuthoredPuzzleFile(v4, { id: "new-id", sourceId: "new-id" }); equal(importedV4.id, "new-id"); equal(importedV4.meta.title, "Round trip");
const legacy: SphenPadAuthoredPuzzleFileV3 = { format: "sphenpad", version: 3, rows: def.rows, cols: def.cols, meta: def.meta, givens: def.givens, scene: def.scene!, logic: def.logic! };
const importedV3 = definitionFromAuthoredPuzzleFile(legacy, { id: "legacy-id", sourceId: "legacy-id" }); equal(importedV3.id, "legacy-id"); equal(importedV3.scene?.lines.length, 1);
throws(() => parseCreatorProject({ format: "sphenpad-creator-project", version: 99 }), /Unsupported/);
throws(() => parseCreatorProject({ format: "sphenpad-creator-project", version: 1, projectId: "x", sourceId: "x", grid: { rows: 9, cols: 9, digits: { min: 9, max: 1, custom: true } } }), /digit range/);
equal(SUDOKUMAKER_TOOL_INVENTORY.length, 47); equal(new Set(SUDOKUMAKER_TOOL_INVENTORY.map((item) => item.upstreamCode)).size, 47); ok(SUDOKUMAKER_TOOL_INVENTORY.some((item) => item.upstreamType === "DifferentValues")); ok(SUDOKUMAKER_TOOL_INVENTORY.some((item) => item.upstreamType === "CountingCircles")); deepEqual(SUDOKUMAKER_WORKER_API, ["getCellsSeenByCells", "getComponents", "validateConstraints", "validateGrid"]);
console.log("creator project + SudokuMaker parity tests passed");
