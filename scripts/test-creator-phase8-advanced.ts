import { readFileSync } from "node:fs";
import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { validateCreatorDefinition } from "../src/sudokupad/creator/checker";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { createAuthoredPuzzleDefinition, creatorConstraints } from "../src/sudokupad/creator/nativeAuthoring";
import {
  addCreatorGlobalConstraint, creatorOutsideClueError, creatorGlobalCellsError,
  creatorOutsideDirections, creatorOutsideRayInDirection, replaceCreatorGlobalCells,
  updateCreatorGlobalConstraint, syncCreatorFog,
} from "../src/sudokupad/creator/globalConstraints";

function ok(test: unknown, message: string): asserts test { if (!test) throw new Error(message); }
function eq(actual: unknown, expected: unknown, message: string) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); }
const c = (r: number, col: number): CellRC => ({ r, c: col });
function blank(rows = 9, cols = 9): PuzzleDefinition {
  return createAuthoredPuzzleDefinition({ id: "phase8", rows, cols, meta: {}, digitRange: { min: 1, max: Math.max(rows, cols) } });
}

// Direction options are geometry-derived, support rectangular grids, and never
// generate an outside clue starting in the interior or pointing outward.
const def = blank(6, 9);
eq(creatorOutsideDirections(def, "x-sums", c(0, 0)).map((v) => v.label), ["Down", "Right"], "corner choices");
eq(creatorOutsideDirections(def, "little-killers", c(0, 4)).map((v) => v.label), ["Down-right", "Down-left"], "top diagonal choices");
eq(creatorOutsideDirections(def, "x-sums", c(2, 3)), [], "interior excluded");
eq(creatorOutsideRayInDirection(def, "x-sums", c(0, 1), 1, 0).length, 6, "rectangular vertical ray");
eq(creatorOutsideRayInDirection(def, "x-sums", c(0, 1), -1, 0), [], "outward direction blocked");
eq(creatorOutsideRayInDirection(def, "little-killers", c(0, 4), 1, 1).map((cell) => cell.c), [4, 5, 6, 7, 8], "diagonal ends at edge");
eq(creatorOutsideRayInDirection(def, "little-killers", c(0, 4), 0, 1), [], "non-diagonal little killer blocked");

for (const id of ["little-killers", "sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms"] as const) {
  const path = creatorOutsideRayInDirection(def, id, c(0, 1), 1, id === "little-killers" ? 1 : 0);
  ok(path.length >= 2, `${id}: path generated`);
  eq(creatorGlobalCellsError(def, id, path), null, `${id}: path valid`);
  ok(creatorGlobalCellsError(def, id, [path[0], ...path.slice(1).reverse()]) !== null, `${id}: scrambled ray disallowed`);
  ok(creatorGlobalCellsError(def, id, [c(1, 1), c(2, 1)]) !== null, `${id}: interior start disallowed`);
  ok(creatorGlobalCellsError(def, id, [c(0, 1), c(2, 1)]) !== null, `${id}: nonadjacent ray disallowed`);
  ok(creatorGlobalCellsError(def, id, [c(0, 1), c(0, 1)]) !== null, `${id}: duplicate disallowed`);
  ok(creatorGlobalCellsError(def, id, [c(0, 1), c(-1, 1)]) !== null, `${id}: out-of-bounds disallowed`);
  eq(creatorOutsideClueError(id, "12"), null, `${id}: integer accepted`);
  ok(creatorOutsideClueError(id, "") !== null, `${id}: missing clue rejected`);
  ok(creatorOutsideClueError(id, "2.5") !== null, `${id}: fractional clue rejected`);
  ok(creatorOutsideClueError(id, "-3") !== null, `${id}: negative clue rejected`);
  ok(creatorOutsideClueError(id, "999999999999999999999") !== null, `${id}: unsafe integer rejected`);
  if (id === "x-sums" || id === "skyscrapers" || id === "numbered-rooms") ok(creatorOutsideClueError(id, "0") !== null, `${id}: zero clue rejected`);
  const made = addCreatorGlobalConstraint(def, id, path, "12");
  const reopened = definitionFromCreatorProject(creatorProjectFromDefinition(made.def));
  eq((creatorConstraints(reopened)[0].cells as CellRC[]).length, path.length, `${id}: ray preserved on save/reopen`);
  eq(creatorConstraints(reopened)[0].value, "12", `${id}: clue preserved on save/reopen`);
  ok(reopened.scene?.overlays.some((part) => part["data-sphenpad-constraint"] === made.constraintId), `${id}: visible outside clue preserved`);
}

// Validate malformed imported projects, but don't silently delete or reinterpret their data.
let made = addCreatorGlobalConstraint(blank(), "x-sums", [c(0, 1), c(1, 1)], "5");
let invalid = updateCreatorGlobalConstraint(made.def, made.constraintId, { value: "0" });
invalid = { ...invalid, logic: { ...invalid.logic, constraints: creatorConstraints(invalid).map((item) => ({ ...item, cells: [c(0, 1), c(0, 1)] })) } };
ok(validateCreatorDefinition(invalid).some((message) => message.includes("duplicate")), "malformed outside clue flagged");
ok(validateCreatorDefinition(invalid).some((message) => message.includes("positive clue")), "bad clue flagged");

// Fog trigger and effect are independently editable and only enabled authoring
// marks contribute to the exported scene. Round trips preserve both sets.
made = addCreatorGlobalConstraint(blank(4, 4), "fog-lights", [c(0, 0)]);
const trigger = addCreatorGlobalConstraint(made.def, "custom-fog-clearing", [c(1, 1)]);
let fog = replaceCreatorGlobalCells(trigger.def, trigger.constraintId, [c(2, 2), c(2, 3)], "effect");
fog = replaceCreatorGlobalCells(fog, trigger.constraintId, [c(1, 1), c(1, 2)], "trigger");
eq(fog.scene?.fog?.triggerLinks?.[0]?.triggerCells, [[1, 1], [1, 2]], "fog triggers exported");
eq(fog.scene?.fog?.triggerLinks?.[0]?.effectCells, [[2, 2], [2, 3]], "fog effects exported");
fog = definitionFromCreatorProject(creatorProjectFromDefinition(fog));
eq(fog.scene?.fog?.triggerLinks?.[0]?.effectCells, [[2, 2], [2, 3]], "fog round trip");
const invalidFog = replaceCreatorGlobalCells(fog, trigger.constraintId, [c(-1, 0)], "effect");
ok(validateCreatorDefinition(invalidFog).some((message) => message.includes("outside the grid")), "invalid fog reveal detected");
ok(creatorGlobalCellsError(fog, "custom-fog-clearing", [c(-1, 0)], "effect") !== null, "invalid fog edit rejected in UI");
const disabled = { ...fog, logic: { ...fog.logic, constraints: creatorConstraints(fog).map((constraint) => constraint.id === trigger.constraintId ? { ...constraint, enabled: false } : constraint) } };
eq(syncCreatorFog(disabled).scene?.fog?.triggerEffects.length, 0, "disabled fog trigger excluded");

// All advanced authoring flags/definitions remain representable without executing arbitrary code.
for (const id of ["negative-diagonal", "positive-diagonal", "disjoint-groups", "nonconsecutive", "global-entropy", "global-modulo-3"] as const) {
  const once = addCreatorGlobalConstraint(blank(), id);
  const twice = addCreatorGlobalConstraint(once.def, id);
  eq(creatorConstraints(twice.def).length, 1, `${id}: singleton`);
}
const custom = addCreatorGlobalConstraint(blank(), "custom-constraint", [c(0, 0)]);
const customCode = updateCreatorGlobalConstraint(custom.def, custom.constraintId, { definitionName: "Rule", code: "return false;", input: { threshold: 3 } });
eq((creatorConstraints(definitionFromCreatorProject(creatorProjectFromDefinition(customCode)))[0].definition as { backend: { code: string } }).backend.code, "return false;", "custom code preserved as data");

// UI integration: direct edits, fallback selection and direction buttons must
// all go through the same creator-only checks.
const editor = readFileSync(new URL("../src/ui/PuzzleEditorPage.tsx", import.meta.url), "utf8");
for (const token of ["creatorGlobalCellsError(data.def, elementId, cells, role)", "creatorOutsideClueError(elementId,", "creatorOutsideRayInDirection", "chooseOutsideDirection(", "creatorOutsideDirections(data.def,"]) {
  ok(editor.includes(token), `missing Phase 8 UI guard: ${token}`);
}
console.log("creator Phase 8 global, outside-ray, fog and advanced tests passed");
