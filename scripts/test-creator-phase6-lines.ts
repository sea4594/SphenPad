import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { validateCreatorDefinition } from "../src/sudokupad/creator/checker";
import { createAuthoredPuzzleDefinition, creatorConstraints } from "../src/sudokupad/creator/nativeAuthoring";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { updateCreatorObjectVisuals } from "../src/sudokupad/creator/objectEditing";
import { insertCreatorLinePathPoint, nudgeCreatorLinePathPoint, removeCreatorLinePathPoint, reorderCreatorLinePathPoint, setCreatorLinePathPoint } from "../src/sudokupad/creator/editingUx";
import { addCreatorLineConstraint, CREATOR_LINE_ELEMENT_IDS, creatorLinePathError, replaceCreatorLinePath, reverseCreatorLinePath, updateCreatorLineConstraint } from "../src/sudokupad/creator/lineConstraints";

function ok(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function eq(value: unknown, expected: unknown, message: string) { if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(value)}`); }
function base(): PuzzleDefinition { return createAuthoredPuzzleDefinition({ id: "phase6", rows: 9, cols: 9, subgrid: { r: 3, c: 3 }, digitRange: { min: 1, max: 9 }, meta: {} }); }
const path: CellRC[] = [{ r: 1, c: 1 }, { r: 1, c: 2 }, { r: 2, c: 2 }, { r: 3, c: 2 }];
const key = (v: { r: number; c: number }) => `${v.r}:${v.c}`;
function cells(def: PuzzleDefinition, id: string) { return (creatorConstraints(def).find((item) => item.id === id)?.path ?? []) as CellRC[]; }
function art(def: PuzzleDefinition, id: string) {
  return { lines: def.scene!.lines.filter((part) => part["data-sphenpad-constraint"] === id), arrows: def.scene!.arrows.filter((part) => part["data-sphenpad-constraint"] === id), underlays: def.scene!.underlays.filter((part) => part["data-sphenpad-constraint"] === id), overlays: def.scene!.overlays.filter((part) => part["data-sphenpad-constraint"] === id) };
}

for (const elementId of CREATOR_LINE_ELEMENT_IDS) {
  const created = addCreatorLineConstraint(base(), elementId, path);
  eq(cells(created.def, created.constraintId), path, `${elementId} initial path`);
  const moved: CellRC[] = path.map((cell) => ({ r: cell.r + 1, c: cell.c + 2 }));
  const updated = replaceCreatorLinePath(created.def, created.constraintId, moved);
  eq(cells(updated, created.constraintId), moved, `${elementId} replacement path`);
  const restored = definitionFromCreatorProject(creatorProjectFromDefinition(updated));
  eq(cells(restored, created.constraintId), moved, `${elementId} save/open path`);
  ok(Object.values(art(restored, created.constraintId)).flat().length >= 1, `${elementId} lost artwork on save/open`);
  const reversed = reverseCreatorLinePath(restored, created.constraintId);
  eq(cells(reversed, created.constraintId), [...moved].reverse(), `${elementId} reverse path`);
  const revised = art(reversed, created.constraintId);
  const firstVisual = (revised.lines[0]?.wayPoints ?? revised.arrows[0]?.wayPoints ?? [])[0];
  // Arrow geometry begins at the bulb's last cell; other paths start at the first cell.
  if (elementId !== "arrows") eq(firstVisual, [moved.at(-1)!.r + 0.5, moved.at(-1)!.c + 0.5], `${elementId} reverse artwork`);
}

const original = base();
eq(creatorLinePathError(original, "between-lines", path.slice(0, 2)) !== null, true, "between line min length");
for (const type of ["between-lines", "lockout-lines", "double-arrows"] as const) {
  let threw = false;
  try { addCreatorLineConstraint(original, type, path.slice(0, 2)); } catch { threw = true; }
  ok(threw, `${type} should reject two cells`);
}
for (const invalid of [
  [{ r: 0, c: 0 }, { r: 0, c: 0 }],
  [{ r: 0, c: 0 }, { r: 9, c: 0 }],
  [{ r: 0, c: 0 }, { r: 0.5, c: 1 }],
]) {
  ok(creatorLinePathError(original, "renban-lines", invalid) !== null, "invalid path should be reported");
  let threw = false;
  try { addCreatorLineConstraint(original, "renban-lines", invalid); } catch { threw = true; }
  ok(threw, "invalid path must not be authored");
}
const created = addCreatorLineConstraint(original, "arrows", path, { bulbCellCount: 2 });
const id = created.constraintId;
eq(art(created.def, id).overlays.length, 2, "two arrow bulb cells");
let changed = setCreatorLinePathPoint(created.def, id, 2, { r: 1, c: 1 });
ok(changed === created.def, "duplicate node edit should not modify puzzle");
changed = insertCreatorLinePathPoint(created.def, id, 1, path[0]);
ok(changed === created.def, "duplicate insert should not modify puzzle");
changed = replaceCreatorLinePath(created.def, id, [path[0]]);
ok(changed === created.def, "short replacement should not modify puzzle");
const malformed = { ...created.def, logic: { ...created.def.logic, constraints: creatorConstraints(created.def).map((entry) => ({ ...entry, path: [path[0], path[0]], cells: [path[0], path[0]] })) } };
ok(validateCreatorDefinition(malformed).some((message) => message.includes("cannot visit the same cell twice")), "creator checker should report imported duplicate paths");
changed = nudgeCreatorLinePathPoint(created.def, id, 1, 0, -1);
ok(changed === created.def, "duplicate nudge should leave puzzle unchanged");
changed = reorderCreatorLinePathPoint(created.def, id, 0, 3);
eq(cells(changed, id).map(key), [key(path[1]), key(path[2]), key(path[3]), key(path[0])], "reorder should preserve each point");
changed = removeCreatorLinePathPoint(created.def, id, 1);
eq(cells(changed, id).length, 3, "delete should shorten valid path");
eq(art(changed, id).overlays.length, 2, "bulb count should survive valid path deletion");
changed = replaceCreatorLinePath(created.def, id, path.slice(0, 2));
eq(art(changed, id).overlays.length, 1, "arrow bulb count should clamp when shortening");

const whisper = addCreatorLineConstraint(base(), "german-whispers", path);
const from = art(whisper.def, whisper.constraintId).lines[0];
let converted = updateCreatorLineConstraint(whisper.def, whisper.constraintId, { sourceElementId: "dutch-whispers", minDifference: 4 });
ok(art(converted, whisper.constraintId).lines[0].color !== from.color, "whisper preset should update untouched default artwork");
const custom = updateCreatorObjectVisuals(whisper.def, whisper.constraintId, ["lines"], { color: "#123456" });
converted = updateCreatorLineConstraint(custom, whisper.constraintId, { sourceElementId: "dutch-whispers", minDifference: 4 });
eq(art(converted, whisper.constraintId).lines[0].color, "#123456", "whisper preset should preserve custom color");

const lockout = addCreatorLineConstraint(base(), "lockout-lines", path, { minDifference: 3 });
eq(creatorConstraints(lockout.def)[0].minDifference, 3, "lockout initial minimum difference");
const tweaked = updateCreatorLineConstraint(lockout.def, lockout.constraintId, { minDifference: 6 });
eq(creatorConstraints(definitionFromCreatorProject(creatorProjectFromDefinition(tweaked)))[0].minDifference, 6, "lockout threshold persisted");

console.log("creator Phase 6 line/path safety and visual round-trip tests passed");
