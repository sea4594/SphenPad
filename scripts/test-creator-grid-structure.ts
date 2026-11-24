function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function deepEqual(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
import { creatorDigitTransition } from "../src/sudokupad/creator/digitEntry";
import { validateCreatorDefinition } from "../src/sudokupad/creator/checker";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { addCreatorConstraint, createAuthoredPuzzleDefinition, getCreatorRegions } from "../src/sudokupad/creator/nativeAuthoring";
import { assignCreatorRegionCells, creatorGridValueError, getCreatorUnassignedRegionCells, parseCreatorGridDetailed, validateCreatorStructureDraft, clearCreatorGivens, clearCreatorRegions, clearCreatorSolution, creatorDigitCount, creatorRegionMode, formatCreatorGrid, getCreatorSolutionEntries, parseCreatorGrid, resizeCreatorDefinition, setCreatorDigitRange, setCreatorRegionConfiguration, setCreatorSolutionEntries } from "../src/sudokupad/creator/gridStructure";

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

// Phase 2: numeric entry, structural settings, irregular regions and exact round trips.
const structure = { rows: 4, cols: 4, min: 1, max: 4, regionMode: "regular" as const, boxRows: 2, boxCols: 2, sudokuRules: true };
deepEqual(validateCreatorStructureDraft(structure), []);
ok(validateCreatorStructureDraft({ ...structure, rows: 31 }).length > 0, "31 rows should be rejected, not clamped");
ok(validateCreatorStructureDraft({ ...structure, rows: 4.5 }).length > 0, "fractional dimensions should be rejected");
ok(validateCreatorStructureDraft({ ...structure, max: 3 }).some((error) => error.includes("at least")));
ok(validateCreatorStructureDraft({ ...structure, max: 5 }).some((error) => error.includes("regular box")));
ok(validateCreatorStructureDraft({ ...structure, regionMode: "none", boxRows: 0, boxCols: 0 }).length === 0);
ok(validateCreatorStructureDraft({ ...structure, rows: 6, cols: 6, min: 10, max: 15, boxRows: 2, boxCols: 3 }).length === 0);
ok(validateCreatorStructureDraft({ ...structure, rows: 6, cols: 6, min: 10, max: 15, boxRows: 2, boxCols: 3, sudokuRules: false }).length === 0);
ok(creatorGridValueError("01", 1, 9)?.includes("leading zeroes"));
ok(creatorGridValueError("4", 10, 13)?.includes("outside"));
equal(creatorGridValueError("12", 10, 13), undefined);

const commaGrid = "10,11,12,13\n12,13,10,11\n11,10,13,12\n13,12,11,10";
deepEqual(parseCreatorGridDetailed(commaGrid, 4, 4, { min: 10, max: 13 }).values, multiValues);
equal(parseCreatorGridDetailed("0 . . .\n. . . .\n. . . .\n. . . .", 4, 4, { min: 10, max: 13 }).values?.length, 16);
ok(parseCreatorGridDetailed("10 11 12 14\n12 13 10 11\n11 10 13 12\n13 12 11 10", 4, 4, { min: 10, max: 13 }).error?.includes("R1C4"));
ok(parseCreatorGridDetailed("10 11 12 03\n12 13 10 11\n11 10 13 12\n13 12 11 10", 4, 4, { min: 10, max: 13 }).error?.includes("R1C4"));
ok(parseCreatorGridDetailed("11 12\n10 13", 4, 4, { min: 10, max: 13 }).error);
equal(parseCreatorGridDetailed("1234\n3412\n2143\n4321", 4, 4, { min: 1, max: 4 }).values?.[3], "4");
const compactNine = "123456789".repeat(9);
equal(parseCreatorGridDetailed(compactNine, 9, 9, { min: 1, max: 9 }).values?.length, 81);

const context = "givens:0:0";
const firstDigit = creatorDigitTransition("1", context, { min: 10, max: 13 }, null, 100);
equal(firstDigit.value, undefined); ok(firstDigit.pending);
const secondDigit = creatorDigitTransition("2", context, { min: 10, max: 13 }, firstDigit.pending ?? null, 250);
equal(secondDigit.value, "12"); equal(secondDigit.pending, undefined);
const replaceDigit = creatorDigitTransition("1", context, { min: 10, max: 13 }, null, 300);
equal(replaceDigit.value, undefined); // Existing 12 must never be used as an entry prefix.
equal(creatorDigitTransition("0", context, { min: 10, max: 13 }, replaceDigit.pending ?? null, 330).value, "10");
equal(creatorDigitTransition("1", "solution:0:1", { min: 1, max: 16 }, null, 100).value, "1");
equal(creatorDigitTransition("6", "solution:0:1", { min: 1, max: 16 }, { context: "solution:0:1", prefix: "1", at: 100 }, 250).value, "16");
equal(creatorDigitTransition("0", context, { min: 10, max: 13 }, null, 100).value, "");
ok(creatorDigitTransition("A", context, { min: 1, max: 16 }, null, 100).error);
ok(creatorDigitTransition("9", context, { min: 10, max: 13 }, null, 100).error);
equal(creatorDigitTransition("1", "solution:0:1", { min: 10, max: 13 }, firstDigit.pending ?? null, 250).value, undefined);

let painting = setCreatorRegionConfiguration(createAuthoredPuzzleDefinition({ id: "region-paint", rows: 4, cols: 4, subgrid: { r: 2, c: 2 }, meta: {} }), "irregular");
equal(getCreatorUnassignedRegionCells(painting).length, 0);
painting = assignCreatorRegionCells(painting, [{ r: 0, c: 0 }, { r: 0, c: 0 }, { r: 8, c: 8 }], "2");
equal(getCreatorUnassignedRegionCells(painting).length, 0);
equal(getCreatorRegions(painting).filter((region) => region.cells.some((cell) => cell.r === 0 && cell.c === 0)).length, 1);
painting = assignCreatorRegionCells(painting, [{ r: 0, c: 0 }, { r: 0, c: 1 }], "");
equal(getCreatorUnassignedRegionCells(painting).length, 2);
painting = assignCreatorRegionCells(painting, [{ r: 0, c: 0 }, { r: 0, c: 1 }], "5");
equal(getCreatorUnassignedRegionCells(painting).length, 0);
const paintedProject = creatorProjectFromDefinition(painting);
deepEqual(getCreatorRegions(definitionFromCreatorProject(paintedProject)), getCreatorRegions(painting));

let numeric = createAuthoredPuzzleDefinition({ id: "numeric16", rows: 4, cols: 4, subgrid: { r: 2, c: 2 }, digitRange: { min: 10, max: 13 }, meta: {} });
numeric = { ...numeric, givens: [{ rc: { r: 0, c: 0 }, v: "10" }] };
numeric = setCreatorSolutionEntries(numeric, multiValues.map((value, index) => ({ rc: { r: Math.floor(index / 4), c: index % 4 }, value })));
const numericRestored = definitionFromCreatorProject(creatorProjectFromDefinition(numeric));
deepEqual(numericRestored.givens, numeric.givens);
deepEqual(getCreatorSolutionEntries(numericRestored), getCreatorSolutionEntries(numeric));
deepEqual(validateCreatorDefinition(numericRestored), []);
const badGiven = { ...numericRestored, givens: [{ rc: { r: 0, c: 0 }, v: "11" }] };
ok(validateCreatorDefinition(badGiven).some((message) => message.includes("R1C1 conflicts")));
const impossibleRows = setCreatorRegionConfiguration(resizeCreatorDefinition(standard, 5, 9), "none");
const limitedDigits = setCreatorDigitRange(impossibleRows, 1, 4);
ok(validateCreatorDefinition(limitedDigits).some((message) => message.includes("require at least")));

console.log("creator grid structure tests passed");
