import { readFileSync } from "node:fs";
import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { createAuthoredPuzzleDefinition } from "../src/sudokupad/creator/nativeAuthoring";
import { findCreatorSolutions, solveCreatorLogically } from "../src/sudokupad/creator/solver";

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const rc = (r: number, c: number): CellRC => ({ r, c });
const base = (): PuzzleDefinition => createAuthoredPuzzleDefinition({ id: "phase5", rows: 4, cols: 4, subgrid: { r: 2, c: 2 }, digitRange: { min: 1, max: 4 }, meta: {} });
const grid = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]];
const nearlyComplete: PuzzleDefinition = { ...base(), givens: grid.flatMap((row, r) => row.flatMap((digit, c) => r === 3 && c === 2 ? [] : [{ rc: rc(r, c), v: String(digit) }])) };

let result = solveCreatorLogically(nearlyComplete);
check(result.status === "solved" && result.steps.length === 1, "a one-blank puzzle should solve with one step");
check(result.steps[0].kind === "place" && result.steps[0].reason === "naked single", "the single must be explained as a placement");
check(result.frames?.length === 2 && result.frames[0].values.length === 15 && result.frames[1].values.length === 16, "frames must replay the beginning and end");
check(result.difficulty?.level === "basic" && result.difficulty.techniques["naked single"] === 1, "difficulty must report only observed techniques");

const pair: PuzzleDefinition = { ...base(), givens: [{ rc: rc(1, 0), v: "3" }, { rc: rc(1, 1), v: "4" }] };
result = solveCreatorLogically(pair);
check(result.status === "stuck", "a multi-solution puzzle must not be described as logically complete");
const pairStep = result.steps.find((step) => step.reason === "naked pair");
check(pairStep?.kind === "eliminate" && Boolean(pairStep.eliminations?.length), "naked pair must eliminate candidates");
check(result.difficulty?.level === "unrated", "stuck puzzles must not be assigned a finished difficulty");
check(result.frames?.length === result.steps.length + 1, "each step needs a reversible analysis frame");
// Every displayed elimination must be mathematically sound: forcing a removed
// candidate, alongside the grid values at that point, cannot yield a solution.
for (let i = 0; i < result.steps.length; i += 1) {
  const step = result.steps[i];
  if (step.kind !== "eliminate") continue;
  const before = result.frames?.[i];
  check(before, "step must have a starting analysis frame");
  for (const elimination of step.eliminations ?? []) {
    const forced: PuzzleDefinition = { ...base(), givens: [
      ...before!.values.map(({ rc, value }) => ({ rc, v: String(value) })),
      { rc: elimination.rc, v: String(elimination.value) },
    ] };
    const proof = findCreatorSolutions(forced, { searchMode: "first", maxNodes: 50_000 });
    check(proof.status === "none" || proof.status === "invalid", `unsound elimination ${elimination.value} at r${elimination.rc.r + 1}c${elimination.rc.c + 1}`);
  }
}

const original = JSON.stringify(pair);
const capped = solveCreatorLogically(pair, { logicalStepLimit: 1 });
check(capped.steps.length === 1 && capped.frames?.length === 2, "step limits must bound analysis snapshots");
check(JSON.stringify(pair) === original, "logical analysis must not change the authored puzzle");
const unsupported = solveCreatorLogically({ ...base(), givens: [{ rc: rc(0, 0), v: "1" }, { rc: rc(0, 1), v: "1" }] });
check(unsupported.status === "invalid" && unsupported.steps.length === 0, "conflicting givens must stop analysis before any deduction");
console.log("creator Phase 5 logical techniques, replay and soundness tests passed");

// The editor must expose the creator-only, read-only walkthrough and must
// continue to execute logical solving in the existing cancellable worker.
const editorSource = readFileSync("src/ui/PuzzleEditorPage.tsx", "utf8");
const walkthroughSource = readFileSync("src/ui/CreatorLogicalWalkthrough.tsx", "utf8");
for (const token of ["<CreatorLogicalWalkthrough", 'runCreatorSolverTask("logical")', "solverWorkerRef.current?.terminate()", "setLogicalResult(null)"])
  check(editorSource.includes(token), `creator editor lost Phase 5 wiring: ${token}`);
for (const token of ["Next step", "Previous", "Show remaining candidates", "step.eliminations", "Technique-based difficulty:", "Analysis only:"])
  check(walkthroughSource.includes(token), `logical walkthrough missing control: ${token}`);
console.log("creator Phase 5 editor walkthrough integration checks passed");
