import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { createAuthoredPuzzleDefinition, creatorConstraints } from "../src/sudokupad/creator/nativeAuthoring";
import { validateCreatorDefinition } from "../src/sudokupad/creator/checker";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { addCreatorGroupConstraint, creatorCloneGroupsError, creatorGroupCellsError, creatorGroupClueError, CREATOR_GROUP_ELEMENT_IDS, parseCreatorQuadrupleClue, replaceCreatorCloneGroups, replaceCreatorGroupCells, updateCreatorGroupConstraint } from "../src/sudokupad/creator/groupConstraints";

function assert(test: unknown, message: string): asserts test { if (!test) throw new Error(message); }
function base(size = 9): PuzzleDefinition { return createAuthoredPuzzleDefinition({ id: "creator-phase7", rows: size, cols: size, meta: {}, digitRange: { min: 1, max: size } }); }
const a: CellRC = { r: 0, c: 0 }, b: CellRC = { r: 0, c: 1 }, c: CellRC = { r: 1, c: 0 }, d: CellRC = { r: 1, c: 1 };
const edge = [a, b], marker = [a], corner = [a, b, c, d];

// All catalog group tools remain creatable and survive a creator-project round trip.
for (const elementId of CREATOR_GROUP_ELEMENT_IDS) {
  const cells = ["difference-kropki", "ratio-kropki", "xv"].includes(elementId) ? edge : elementId === "quadruples" ? corner : elementId === "extra-region" ? Array.from({ length: 9 }, (_, i) => ({ r: i, c: i })) : elementId === "clones" ? [a, { r: 4, c: 4 }] : marker;
  const clue = elementId === "quadruples" ? "12" : elementId === "look-and-say-cages" ? "11" : elementId === "killer-cages" ? "1" : "";
  const { def, constraintId } = addCreatorGroupConstraint(base(), elementId, cells, clue);
  assert(constraintId && creatorConstraints(def).length === 1, `${elementId}: missing authored constraint`);
  assert(!creatorGroupCellsError(base(), elementId, cells), `${elementId}: valid shape was rejected`);
  const recovered = definitionFromCreatorProject(creatorProjectFromDefinition(def));
  assert(creatorConstraints(recovered)[0].sourceElementId === elementId, `${elementId}: type lost on reopen`);
  assert((creatorConstraints(recovered)[0].cells ?? []).length === cells.length, `${elementId}: cells lost on reopen`);
}

// UI authoring guards should reject bad shapes without changing old imported project contents.
assert(creatorGroupCellsError(base(), "xv", [a, d]) !== null, "diagonal edge accepted");
assert(creatorGroupCellsError(base(), "difference-kropki", [a]) !== null, "one-ended edge accepted");
assert(creatorGroupCellsError(base(), "quadruples", [a, { r: 8, c: 8 }]) !== null, "disjoint quadruple accepted");
assert(creatorGroupCellsError(base(), "extra-region", [a, b]) !== null, "incomplete extra region accepted");
assert(creatorGroupCellsError(base(), "even", [a, a]) !== null, "duplicate marker cells accepted");
assert(creatorGroupCellsError(base(), "odd", [{ r: 12, c: 0 }]) !== null, "off-grid marker accepted");
assert(creatorGroupClueError(base(), "killer-cages", [a, b, c], "25") !== null, "impossible killer sum accepted");
assert(creatorGroupClueError(base(), "killer-cages", [a], "foo") !== null, "nonnumeric killer sum accepted");
assert(creatorGroupClueError(base(), "look-and-say-cages", [a, b, c], "1522") === null, "valid look-and-say clue rejected");
assert(creatorGroupClueError(base(), "look-and-say-cages", [a, b, c], "05") === null, "partial zero-count look-and-say clue rejected");
assert(creatorGroupClueError(base(), "look-and-say-cages", [a, b, c], "2922") !== null, "incorrect look-and-say counts accepted");
assert(creatorGroupClueError(base(), "quadruples", corner, "12345") !== null, "oversized quadruple clue accepted");
assert(creatorGroupClueError(base(), "quadruples", corner, "1, 12") !== null, "out-of-range quadruple clue accepted");
assert(parseCreatorQuadrupleClue("10, 11", base(16))?.join(",") === "10,11", "multi-digit quadruple parsing failed");
assert(parseCreatorQuadrupleClue("1,x", base()) === null, "malformed quadruple digit accepted");
// A corner gesture disambiguates 2-cell quadruples on the puzzle perimeter.
assert(creatorGroupCellsError(base(), "quadruples", edge) !== null, "ambiguous two-cell corner accepted");
assert(creatorGroupCellsError(base(), "quadruples", edge, [0, 1]) === null, "explicit perimeter corner rejected");
const edgeQuad = addCreatorGroupConstraint(base(), "quadruples", edge, "12", [0, 1]);
assert(JSON.stringify(edgeQuad.def.scene?.overlays[0]?.center) === JSON.stringify([0, 1]), "perimeter quadruple drawn at wrong corner");
assert(!validateCreatorDefinition(edgeQuad.def).some((msg) => msg.includes("quadruple must")), "valid perimeter quadruple flagged as malformed");
const repeatCorner = addCreatorGroupConstraint(edgeQuad.def, "quadruples", [a, b], "1", [0, 1]);
assert(repeatCorner.def === edgeQuad.def && repeatCorner.constraintId === edgeQuad.constraintId, "duplicate corner marker was created");
const movedEdgeQuad = replaceCreatorGroupCells(edgeQuad.def, edgeQuad.constraintId, [{ r: 2, c: 2 }, { r: 2, c: 3 }], [2, 3]);
assert(JSON.stringify(movedEdgeQuad.scene?.overlays[0]?.center) === JSON.stringify([2, 3]), "moving a perimeter quadruple lost its explicit corner");

// Counting circles are shared across all separately authored marks.
const circleA = addCreatorGroupConstraint(base(), "counting-circles", [a]);
const circleB = addCreatorGroupConstraint(circleA.def, "counting-circles", [{ r: 4, c: 4 }]);
const bothTwos = { ...circleB.def, givens: [{ rc: a, v: "2" }, { rc: { r: 4, c: 4 }, v: "2" }] };
assert(!validateCreatorDefinition(bothTwos).includes("Counting Circles conflict."), "separate valid circles were counted individually");
const oneAndTwo = { ...circleB.def, givens: [{ rc: a, v: "1" }, { rc: { r: 4, c: 4 }, v: "2" }] };
assert(validateCreatorDefinition(oneAndTwo).includes("Counting Circles conflict."), "separate invalid circles missed");

// Clone groups: actual corresponding positions, not all marked cells forced equal.
const first = [a, c], second = [{ r: 4, c: 4 }, { r: 5, c: 4 }];
assert(!creatorCloneGroupsError(base(), first, second), "valid translated clone rejected");
assert(creatorCloneGroupsError(base(), first, [second[0], { r: 5, c: 5 }]) !== null, "different-shaped clone accepted");
assert(creatorCloneGroupsError(base(), first, [a, b]) !== null, "overlapping clones accepted");
const made = addCreatorGroupConstraint(base(), "clones", [a, second[0]]);
const paired = replaceCreatorCloneGroups(made.def, made.constraintId, first, second);
assert(Array.isArray(creatorConstraints(paired)[0].cloneGroups), "clone pairs were not stored");
const solvedPairs = { ...paired, givens: [{ rc: a, v: "1" }, { rc: c, v: "2" }, { rc: second[0], v: "1" }, { rc: second[1], v: "2" }] };
assert(!validateCreatorDefinition(solvedPairs).includes("Clone conflict."), "valid clone pairs rejected");
const badPairs = { ...paired, givens: [{ rc: a, v: "1" }, { rc: c, v: "2" }, { rc: second[0], v: "2" }, { rc: second[1], v: "1" }] };
assert(validateCreatorDefinition(badPairs).includes("Clone conflict."), "mismatched clone pairs missed");
const restored = definitionFromCreatorProject(creatorProjectFromDefinition(paired));
assert(Array.isArray(creatorConstraints(restored)[0].cloneGroups), "clone pairs lost in project round trip");
const old = { ...made.def, givens: [{ rc: a, v: "1" }, { rc: second[0], v: "2" }] };
assert(validateCreatorDefinition(old).includes("Clone conflict."), "legacy equal-cell clone behavior lost");
const reset = replaceCreatorGroupCells(paired, made.constraintId, [a, second[0]]);
assert(creatorConstraints(reset)[0].cloneGroups === undefined, "selection update retained stale clone correspondence");

// Editing values and geometry preserves matching visuals and tags, without losing constraints.
const dot = addCreatorGroupConstraint(base(), "ratio-kropki", edge, "2");
const changed = updateCreatorGroupConstraint(dot.def, dot.constraintId, { ratio: 3 });
const relocated = replaceCreatorGroupCells(changed, dot.constraintId, [{ r: 2, c: 2 }, { r: 2, c: 3 }]);
assert(creatorConstraints(relocated)[0].ratio === 3, "dot property lost after moving");
assert(relocated.scene?.overlays.some((g) => g["data-sphenpad-constraint"] === dot.constraintId), "dot artwork lost after moving");
const multi = addCreatorGroupConstraint(base(16), "quadruples", corner, "10, 11");
assert(multi.def.scene?.overlays[0]?.text === "10, 11", "multi-digit quadruple visual ambiguous");
console.log("creator Phase 7 group/edge/cage regressions passed");
