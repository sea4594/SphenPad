/** Soundness and replay regression cases for newly supported variant logic. */
import { strict as assert } from "node:assert";
import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { createAuthoredPuzzleDefinition } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorGroupConstraint } from "../src/sudokupad/creator/groupConstraints";
import { addCreatorLineConstraint } from "../src/sudokupad/creator/lineConstraints";
import { setCreatorSudokuRules } from "../src/sudokupad/creator/globalConstraints";
import { findCreatorSolutions, solveCreatorLogically, type CreatorLogicalResult } from "../src/sudokupad/creator/solver";

const rc = (r: number, c: number): CellRC => ({ r, c });
const create = (): PuzzleDefinition => setCreatorSudokuRules(createAuthoredPuzzleDefinition({ id: "variant-logic", rows: 1, cols: 4, digitRange: { min: 1, max: 4 }, meta: {} }), false);
function assertSound(def: PuzzleDefinition, analysis: CreatorLogicalResult, reason: string) {
  const index = analysis.steps.findIndex((step) => step.reason === reason);
  assert.ok(index >= 0, `missing ${reason} deduction: ${analysis.status} ${analysis.message}`);
  const frame = analysis.frames?.[index];
  assert.ok(frame, `missing analysis frame for ${reason}`);
  const step = analysis.steps[index];
  const removed = step.kind === "eliminate" ? step.eliminations ?? [] : [];
  for (const elimination of removed) {
    const forced = { ...def, givens: [...frame!.values.map(({ rc, value }) => ({ rc, v: String(value) })), { rc: elimination.rc, v: String(elimination.value) }] };
    const answer = findCreatorSolutions(forced, { searchMode: "first", maxNodes: 20_000 });
    assert.ok(answer.status === "none" || answer.status === "invalid", `${reason} eliminated a viable ${elimination.value} at ${JSON.stringify(elimination.rc)} (${answer.status})`);
  }
  assert.equal(analysis.frames?.length, analysis.steps.length + 1, `${reason}: every logical step must have a replay frame`);
  return step;
}

let base = create();
let constraint = addCreatorLineConstraint(base, "thermometers", [rc(0, 0), rc(0, 1), rc(0, 2)]);
let result = solveCreatorLogically(constraint.def, { logicalStepLimit: 12 });
assertSound(constraint.def, result, "thermometer bound");
assert.ok(result.difficulty?.level === "unrated" || result.status === "solved");

base = create();
constraint = addCreatorLineConstraint(base, "german-whispers", [rc(0, 0), rc(0, 1)]);
const whisper = { ...constraint.def, logic: { ...constraint.def.logic, constraints: (constraint.def.logic?.constraints ?? []).map((item) => item.id === constraint.constraintId ? { ...item, minDifference: 3 } : item) } };
result = solveCreatorLogically(whisper, { logicalStepLimit: 12 });
assertSound(whisper, result, "whisper support");

base = create();
const cage = addCreatorGroupConstraint(base, "killer-cages", [rc(0, 0), rc(0, 1)], "3");
let withSum: PuzzleDefinition = { ...cage.def, givens: [{ rc: rc(0, 0), v: "1" }] };
result = solveCreatorLogically(withSum, { logicalStepLimit: 12 });
const cageStep = assertSound(withSum, result, "cage sum");
assert.equal(cageStep.kind, "place"); assert.equal(cageStep.value, 2);

constraint = addCreatorLineConstraint(create(), "arrows", [rc(0, 0), rc(0, 1), rc(0, 2)]);
withSum = { ...constraint.def, givens: [{ rc: rc(0, 0), v: "3" }, { rc: rc(0, 1), v: "1" }] };
result = solveCreatorLogically(withSum, { logicalStepLimit: 12 });
const arrowStep = assertSound(withSum, result, "arrow sum");
assert.equal(arrowStep.kind, "place"); assert.equal(arrowStep.value, 2);

// Analysis never mutates authored projects or their givens.
const original = JSON.stringify(whisper);
solveCreatorLogically(whisper, { logicalStepLimit: 4 });
assert.equal(JSON.stringify(whisper), original);
console.log("creator post-audit variant deductions and soundness tests passed");
