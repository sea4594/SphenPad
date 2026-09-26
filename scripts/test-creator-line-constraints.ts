function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { validateCreatorDefinition } from "../src/sudokupad/creator/checker";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { createAuthoredPuzzleDefinition, creatorConstraints } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorLineConstraint, defaultCreatorDigitGroups, dutchWhisperDifference, formatCreatorDigitGroups, germanWhisperDifference, normalizeCreatorLineConstraints, parseCreatorDigitGroups, replaceCreatorLinePath, reverseCreatorLinePath, updateCreatorLineConstraint } from "../src/sudokupad/creator/lineConstraints";

function base(size = 9): PuzzleDefinition { const box = size === 9 ? { r: 3, c: 3 } : size === 4 ? { r: 2, c: 2 } : undefined; return createAuthoredPuzzleDefinition({ id: `line-${size}`, rows: size, cols: size, subgrid: box, digitRange: { min: 1, max: size }, meta: {} }); }
function values(def: PuzzleDefinition, path: CellRC[], nums: number[]): PuzzleDefinition { return { ...def, givens: path.map((rc, i) => ({ rc, v: String(nums[i]) })) }; }
function add(def: PuzzleDefinition, elementId: Parameters<typeof addCreatorLineConstraint>[1], path: CellRC[]) { return addCreatorLineConstraint(def, elementId, path); }

const row3 = [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] as CellRC[];
let created = add(base(), "thermometers", row3); let def = values(created.def, row3, [1, 3, 2]);
ok(validateCreatorDefinition(def).includes("Thermometer conflict."));
def = updateCreatorLineConstraint(def, created.constraintId, { slow: true }); equal(creatorConstraints(def)[0].sourceElementId, "slow-thermometers");
def = values(def, row3, [1, 1, 2]); ok(!validateCreatorDefinition(def).includes("Slow thermometer conflict."));
def = values(def, row3, [2, 1, 2]); ok(validateCreatorDefinition(def).includes("Slow thermometer conflict."));

created = add(base(), "german-whispers", row3); equal(Number(creatorConstraints(created.def)[0].minDifference), 5); equal(germanWhisperDifference(created.def), 5); equal(dutchWhisperDifference(created.def), 4);
def = values(created.def, row3, [1, 5, 9]); ok(validateCreatorDefinition(def).some((m) => m.startsWith("Whisper conflict")));
def = updateCreatorLineConstraint(def, created.constraintId, { sourceElementId: "dutch-whispers", minDifference: 4 }); ok(!validateCreatorDefinition(def).some((m) => m.startsWith("Whisper conflict")));
def = updateCreatorLineConstraint(def, created.constraintId, { minDifference: 6 }); ok(validateCreatorDefinition(def).some((m) => m.includes("minimum difference 6")));

created = add(base(), "renban-lines", row3); def = values(created.def, row3, [1, 3, 4]); ok(validateCreatorDefinition(def).includes("Renban conflict."));
created = add(base(), "palindromes", row3); def = values(created.def, row3, [1, 2, 3]); ok(validateCreatorDefinition(def).includes("Palindrome conflict."));
created = add(base(), "between-lines", row3); def = values(created.def, row3, [1, 9, 5]); ok(validateCreatorDefinition(def).includes("Between line conflict."));

const row4 = [...row3, { r: 0, c: 3 }];
created = add(base(4), "region-sum-lines", row4); def = values(created.def, row4, [1, 2, 3, 1]); ok(validateCreatorDefinition(def).includes("Region sum line conflict."));
def = updateCreatorLineConstraint(def, created.constraintId, { singleRegionTotals: true }); equal(creatorConstraints(def)[0].singleRegionTotals, true);
created = add(base(), "sequence-lines", row3); def = values(created.def, row3, [1, 3, 6]); ok(validateCreatorDefinition(def).includes("Sequence line conflict."));
def = values(created.def, row3, [3, 3, 3]); ok(!validateCreatorDefinition(def).includes("Sequence line conflict."));

created = add(base(), "entropic-lines", row3); const entropy = creatorConstraints(created.def)[0]; equal(formatCreatorDigitGroups(entropy.groups), "1,2,3 | 4,5,6 | 7,8,9");
def = values(created.def, row3, [1, 2, 7]); ok(validateCreatorDefinition(def).includes("Grouped line conflict."));
def = values(created.def, row3, [1, 4, 7]); ok(!validateCreatorDefinition(def).includes("Grouped line conflict."));
equal(formatCreatorDigitGroups(defaultCreatorDigitGroups(base(), "mod3")), "3,6,9 | 1,4,7 | 2,5,8");
ok(parseCreatorDigitGroups("1,2,3 | 4,5,6 | 7,8,9", base())?.length === 3); equal(parseCreatorDigitGroups("1,2 | 2,3", base()), null);
created = add(base(), "parity-lines", [{ r: 1, c: 0 }, { r: 1, c: 1 }]); def = values(created.def, [{ r: 1, c: 0 }, { r: 1, c: 1 }], [1, 3]); ok(validateCreatorDefinition(def).includes("Grouped line conflict."));

created = add(base(), "lockout-lines", row3); def = values(created.def, row3, [1, 3, 5]); ok(validateCreatorDefinition(def).includes("Lockout line conflict."));
def = values(created.def, row3, [1, 9, 5]); ok(!validateCreatorDefinition(def).includes("Lockout line conflict."));
created = add(base(), "arrows", row4); def = values(created.def, row4, [3, 1, 1, 1]); ok(!validateCreatorDefinition(def).includes("Arrow sum conflict."));
def = values(created.def, row4, [4, 1, 1, 1]); ok(validateCreatorDefinition(def).includes("Arrow sum conflict."));
def = updateCreatorLineConstraint(def, created.constraintId, { bulbCellCount: 2 }); equal(Number(creatorConstraints(def)[0].bulbCellCount), 2); equal(def.scene?.overlays.filter((part) => part["data-sphenpad-constraint"] === created.constraintId).length, 2);
created = add(base(), "double-arrows", row4); def = values(created.def, row4, [1, 2, 2, 3]); ok(!validateCreatorDefinition(def).includes("Double arrow sum conflict."));
def = values(created.def, row4, [1, 1, 1, 3]); ok(validateCreatorDefinition(def).includes("Double arrow sum conflict."));

created = add(base(), "german-whispers", row3); def = updateCreatorLineConstraint(created.def, created.constraintId, { minDifference: 6 });
const replacement = [{ r: 2, c: 2 }, { r: 3, c: 2 }, { r: 4, c: 2 }]; def = replaceCreatorLinePath(def, created.constraintId, replacement); equal((creatorConstraints(def)[0].path as CellRC[])[0].r, 2); equal(def.scene?.lines.find((part) => part["data-sphenpad-constraint"] === created.constraintId)?.wayPoints?.[0]?.[0], 2.5);
def = reverseCreatorLinePath(def, created.constraintId); equal((creatorConstraints(def)[0].path as CellRC[])[0].r, 4); equal(Number(creatorConstraints(def)[0].minDifference), 6);
const roundTrip = definitionFromCreatorProject(creatorProjectFromDefinition(def)); equal(Number(creatorConstraints(roundTrip)[0].minDifference), 6); equal((creatorConstraints(roundTrip)[0].path as CellRC[])[0].r, 4);

// Phase 10D/11D generic line records migrate to the 11E semantic model without losing identity/path.
let legacy = add(base(), "slow-thermometers", row3).def;
legacy = { ...legacy, logic: { ...(legacy.logic ?? {}), constraints: creatorConstraints(legacy).map((constraint) => ({ ...constraint, type: "slow-thermometers", slow: undefined, sourceElementId: undefined })) } };
legacy = normalizeCreatorLineConstraints(legacy);
equal(creatorConstraints(legacy)[0].type, "thermometer"); equal(creatorConstraints(legacy)[0].sourceElementId, "slow-thermometers"); equal(creatorConstraints(legacy)[0].slow, true);
legacy = add(base(), "3-modular-lines", row3).def;
legacy = { ...legacy, logic: { ...(legacy.logic ?? {}), constraints: creatorConstraints(legacy).map((constraint) => ({ ...constraint, type: "3-modular-lines", groups: undefined, sourceElementId: undefined })) } };
legacy = normalizeCreatorLineConstraints(legacy);
equal(creatorConstraints(legacy)[0].type, "entropy-line"); equal(formatCreatorDigitGroups(creatorConstraints(legacy)[0].groups), "3,6,9 | 1,4,7 | 2,5,8");

// Imported malformed paths/groups surface structural diagnostics instead of silently failing.
let malformed = add(base(), "entropic-lines", row3).def;
malformed = { ...malformed, logic: { ...(malformed.logic ?? {}), constraints: creatorConstraints(malformed).map((constraint) => ({ ...constraint, groups: [[1,2],[2,3]] })) } };
ok(validateCreatorDefinition(malformed).includes("Grouped line digit groups are invalid or overlap."));
console.log("creator line constraint tests passed");
