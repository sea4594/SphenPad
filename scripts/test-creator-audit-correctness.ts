/** Cross-layer regression checks for Phase 7 semantic parity and portable export honesty. */
import { strict as assert } from "node:assert";
import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { createAuthoredPuzzleDefinition, creatorConstraints } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorGroupConstraint, replaceCreatorCloneGroups } from "../src/sudokupad/creator/groupConstraints";
import { setCreatorSudokuRules } from "../src/sudokupad/creator/globalConstraints";
import { validateCreatorDefinition } from "../src/sudokupad/creator/checker";
import { getCellsSeenByCells, validateGrid } from "../src/sudokupad/creator/worker";
import { findCreatorSolutions } from "../src/sudokupad/creator/solver";
import { exportCreatorInterchange, importCreatorInterchange, creatorProjectJson } from "../src/sudokupad/creator/interchange";
import { creatorExportLossWarning } from "../src/sudokupad/creator/interchangePreview";

const rc = (r: number, c: number): CellRC => ({ r, c });
const create = (): PuzzleDefinition => createAuthoredPuzzleDefinition({ id: "audit", rows: 4, cols: 4, digitRange: { min: 1, max: 4 }, meta: {} });
const withGivens = (def: PuzzleDefinition, entries: Array<[CellRC, number]>): PuzzleDefinition => ({
  ...def, givens: entries.map(([cell, value]) => ({ rc: cell, v: String(value) })),
});
const seen = (def: PuzzleDefinition, target: CellRC, other: CellRC): boolean =>
  getCellsSeenByCells(def, [target]).some((cell) => cell.r === other.r && cell.c === other.c);

async function main() {
  // Paired clone: first shape and translated second shape, corresponding entries
  // equal, but different positions in the SAME shape may hold different digits.
  let def = setCreatorSudokuRules(create(), false);
  const first = [rc(0, 0), rc(0, 1)], second = [rc(2, 2), rc(2, 3)];
  const added = addCreatorGroupConstraint(def, "clones", [first[0], second[0]]);
  def = replaceCreatorCloneGroups(added.def, added.constraintId, first, second);
  const valid = withGivens(def, [[first[0], 1], [first[1], 2], [second[0], 1], [second[1], 2]]);
  assert.equal(validateCreatorDefinition(valid).includes("Clone conflict."), false, "checker rejected valid paired clone");
  assert.equal(validateGrid(valid).diagnostics.some((item) => item.code === "clone"), false, "worker rejected valid paired clone");
  const withRulesAdded = addCreatorGroupConstraint(create(), "clones", [first[0], second[0]]);
  const withRules = replaceCreatorCloneGroups(withRulesAdded.def, withRulesAdded.constraintId, first, second);
  assert.equal(seen(withRules, first[0], rc(2, 1)), true, "paired clone did not inherit partner's row constraints");
  assert.equal(seen(withRules, first[0], rc(1, 3)), false, "paired clone inherited unrelated partner's constraints");
  const mismatch = withGivens(def, [[first[0], 1], [second[0], 2]]);
  assert.ok(validateGrid(mismatch).diagnostics.some((item) => item.code === "clone"), "worker missed incorrect clone pair");

  // Solver must agree with worker, not reject valid full paired-clone puzzles.
  const solverDef = withGivens(def, [[first[0], 1], [first[1], 2], [second[0], 1], [second[1], 2],
    [rc(0, 2), 3], [rc(0, 3), 4], [rc(1, 0), 1], [rc(1, 1), 2], [rc(1, 2), 3], [rc(1, 3), 4],
    [rc(2, 0), 3], [rc(2, 1), 4], [rc(3, 0), 1], [rc(3, 1), 2], [rc(3, 2), 3], [rc(3, 3), 4]]);
  const solved = findCreatorSolutions(solverDef, { searchMode: "unique", maxNodes: 1000 });
  assert.equal(solved.status, "solved", `solver disagreed with valid paired-clone project: ${solved.message}`);
  assert.equal(solved.exact, true);
  const native = await importCreatorInterchange(creatorProjectJson(valid), { id: "native-clone", sourceId: "native-clone" });
  assert.equal(JSON.stringify(creatorConstraints(native.def)[0].cloneGroups), JSON.stringify([first, second]), "native round trip lost clone groups");
  const older = withGivens(added.def, [[first[0], 1], [second[0], 2]]);
  assert.ok(validateGrid(older).diagnostics.some((item) => item.code === "clone"), "legacy all-equal clone no longer enforced");

  // Counting circles apply across separate objects, not just per-object.
  let circles = setCreatorSudokuRules(create(), false);
  circles = addCreatorGroupConstraint(circles, "counting-circles", [rc(0, 0)]).def;
  circles = addCreatorGroupConstraint(circles, "counting-circles", [rc(2, 2)]).def;
  const bothTwos = withGivens(circles, [[rc(0, 0), 2], [rc(2, 2), 2]]);
  assert.equal(validateCreatorDefinition(bothTwos).includes("Counting Circles conflict."), false);
  assert.equal(validateGrid(bothTwos).diagnostics.some((item) => item.code === "counting-circles"), false, "worker counted circles independently");
  const inconsistent = withGivens(circles, [[rc(0, 0), 1], [rc(2, 2), 2]]);
  assert.ok(validateGrid(inconsistent).diagnostics.some((item) => item.code === "counting-circles"));
  const partial = withGivens(circles, [[rc(0, 0), 2]]);
  assert.equal(validateGrid(partial).diagnostics.some((item) => item.code === "counting-circles"), false, "incomplete circle set was rejected");
  const ids = creatorConstraints(circles).map((item) => String(item.sourceElementId));
  assert.equal(ids.length, 2);
  const disabled = { ...inconsistent, logic: { ...inconsistent.logic, constraints: (inconsistent.logic?.constraints ?? []).map((item, i) => i === 1 ? { ...item, enabled: false } : item) } };
  assert.equal(validateGrid(disabled).diagnostics.some((item) => item.code === "counting-circles"), false, "disabled circle still influenced solver");

  // Import must reconstruct two groups; malformed pairs are reported as losses,
  // never silently interpreted as legacy all-equal clones.
  const grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({})));
  const fpuzzle = { size: 4, grid, clone: [{ cells: ["R1C1", "R1C2"], cloneCells: ["R3C3", "R3C4"] }] };
  const imported = await importCreatorInterchange(JSON.stringify(fpuzzle), { id: "fp-clone", sourceId: "fp-clone" });
  const importedClone = creatorConstraints(imported.def).find((item) => item.type === "clone");
  assert.equal(JSON.stringify(importedClone?.cloneGroups), JSON.stringify([first, second]), "F-Puzzles clone correspondence flattened");
  const badFp = { ...fpuzzle, clone: [{ cells: ["R1C1", "R1C2"], cloneCells: ["R3C3"] }] };
  const invalidImport = await importCreatorInterchange(JSON.stringify(badFp), { id: "bad", sourceId: "bad" });
  assert.ok(invalidImport.report.issues.some((item) => item.code === "fpuzzles-clone-correspondence" && item.severity === "loss"));
  assert.equal(creatorConstraints(invalidImport.def).filter((item) => item.type === "clone").length, 0);

  const exported = exportCreatorInterchange(def);
  assert.ok(exported.report.issues.some((item) => item.code === "creator-checker-semantics-not-exported" && item.severity === "loss"));
  assert.ok(creatorExportLossWarning(exported.report)?.includes("checker rules"));
  console.log("creator post-audit clone, circles, import and export parity tests passed");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
