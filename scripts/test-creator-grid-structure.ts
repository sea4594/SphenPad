function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function deepEqual(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
import { validateCreatorDefinition } from "../src/sudokupad/creator/checker";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { addCreatorConstraint, createAuthoredPuzzleDefinition, getCreatorRegions } from "../src/sudokupad/creator/nativeAuthoring";
import { clearCreatorGivens, clearCreatorRegions, clearCreatorSolution, creatorDigitCount, creatorRegionMode, formatCreatorGrid, getCreatorSolutionEntries, parseCreatorGrid, resizeCreatorDefinition, setCreatorDigitRange, setCreatorRegionConfiguration, setCreatorSolutionEntries } from "../src/sudokupad/creator/gridStructure";

const standard = createAuthoredPuzzleDefinition({ id: "standard", rows: 9, cols: 9, subgrid: { r: 3, c: 3 }, meta: {} });
equal(creatorRegionMode(standard), "regular"); equal(creatorDigitCount(standard), 9); equal(getCreatorRegions(standard).length, 9); deepEqual(validateCreatorDefinition(standard), []);

let six = resizeCreatorDefinition(standard, 6, 6); six = setCreatorDigitRange(six, 1, 6); six = setCreatorRegionConfiguration(six, "regular", { rows: 2, cols: 3 });
equal(six.rows, 6); equal(six.cols, 6); equal(getCreatorRegions(six).length, 6); deepEqual(validateCreatorDefinition(six), []);

let multi = createAuthoredPuzzleDefinition({ id: "multi", rows: 4, cols: 4, subgrid: { r: 2, c: 2 }, digitRange: { min: 10, max: 13 }, meta: {} });
const multiValues = ["10","11","12","13","12","13","10","11","11","10","13","12","13","12","11","10"];
multi = setCreatorSolutionEntries(multi, multiValues.map((value, index) => ({ rc: { r: Math.floor(index / 4), c: index % 4 }, value })));
multi = { ...multi, givens: [{ rc: { r: 0, c: 0 }, v: "10" }] };
const project = creatorProjectFromDefinition(multi); equal(project.solutionEntries?.length, 16); equal(project.solution, undefined);
const multiRoundTrip = definitionFromCreatorProject(project); deepEqual(getCreatorSolutionEntries(multiRoundTrip), getCreatorSolutionEntries(multi)); equal(formatCreatorGrid(multiRoundTrip, "solution").split("\n")[0], "10 11 12 13"); deepEqual(validateCreatorDefinition(multiRoundTrip), []);
const parsed = parseCreatorGrid("10 11 12 13\n12 13 10 11\n11 10 13 12\n13 12 11 10", 4, 4); equal(parsed?.length, 16); equal(parsed?.[0], "10"); equal(parsed?.[15], "10");

let irregular = setCreatorRegionConfiguration(six, "irregular");
irregular = { ...irregular, logic: { ...irregular.logic, regions: [[{ r: 0, c: 0 }, { r: 0, c: 1 }], [{ r: 0, c: 1 }, { r: 0, c: 2 }]], creatorRegionLabels: ["1", "2"] } };
if (irregular.scene) irregular = { ...irregular, scene: { ...irregular.scene, regions: [{ cells: [[0,0],[0,1]], style: "box", type: "region", unique: true }, { cells: [[0,1],[0,2]], style: "box", type: "region", unique: true }] } };
const irregularMessages = validateCreatorDefinition(irregular); ok(irregularMessages.some((message) => message.includes("more than one region"))); ok(irregularMessages.some((message) => message.includes("not assigned")));

let resize = createAuthoredPuzzleDefinition({ id: "resize", rows: 4, cols: 4, subgrid: { r: 2, c: 2 }, meta: {} });
resize = { ...resize, givens: [{ rc: { r: 3, c: 3 }, v: "4" }, { rc: { r: 0, c: 0 }, v: "1" }] };
resize = setCreatorSolutionEntries(resize, [{ rc: { r: 3, c: 3 }, value: "4" }, { rc: { r: 0, c: 0 }, value: "1" }]);
resize = addCreatorConstraint(resize, { id: "edge", type: "thermometer", sourceElementId: "thermometers", path: [{ r: 2, c: 2 }, { r: 3, c: 3 }] }, { lines: [{ wayPoints: [[2.5,2.5],[3.5,3.5]], color: "#ccc", thickness: 5 }] });
resize = resizeCreatorDefinition(resize, 3, 3); equal(resize.givens.length, 1); equal(getCreatorSolutionEntries(resize).length, 1); equal(resize.logic?.constraints?.length, 0); equal(resize.scene?.lines.length, 0);

let cleared = clearCreatorGivens(multiRoundTrip); cleared = clearCreatorSolution(cleared); cleared = clearCreatorRegions(cleared); equal(cleared.givens.length, 0); equal(getCreatorSolutionEntries(cleared).length, 0); equal(getCreatorRegions(cleared).length, 0); equal(creatorRegionMode(cleared), "none");
console.log("creator grid structure tests passed");
