function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

import { createAuthoredPuzzleDefinition } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorLineConstraint } from "../src/sudokupad/creator/lineConstraints";
import { addCreatorCosmetic, listCreatorObjects } from "../src/sudokupad/creator/objectEditing";
import { alignCreatorCosmetics, creatorObjectClipboardJson, insertCreatorLinePathPoint, moveCreatorObjectsToEdge, nudgeCreatorLinePathPoint, parseCreatorObjectClipboard, pasteCreatorObjectClipboard, removeCreatorLinePathPoint, removeCreatorObjects, reorderCreatorLinePathPoint, setCreatorLinePathPoint, snapCreatorObjects, updateCreatorObjects } from "../src/sudokupad/creator/editingUx";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";

let def = createAuthoredPuzzleDefinition({ id: "ux", rows: 4, cols: 4, subgrid: { r: 2, c: 2 }, digitRange: { min: 1, max: 4 }, meta: {} });
const line = addCreatorLineConstraint(def, "renban-lines", [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }]);
def = line.def;
const textA = addCreatorCosmetic(def, "cosmetic-text", { overlays: [{ center: [1.2, 1.2], width: 1, height: 0.5, text: "A", opacity: 1 }] }, { name: "A" });
def = textA.def;
const textB = addCreatorCosmetic(def, "cosmetic-text", { overlays: [{ center: [2.7, 2.8], width: 1, height: 0.5, text: "B", opacity: 1 }] }, { name: "B" });
def = textB.def;

const clipText = creatorObjectClipboardJson(def, [line.constraintId, textA.objectId]);
const clip = parseCreatorObjectClipboard(clipText);
equal(clip.items.length, 2);
const pasted = pasteCreatorObjectClipboard(def, clip);
equal(pasted.objectIds.length, 2);
ok(pasted.objectIds.every((id) => ![line.constraintId, textA.objectId].includes(id)), "pasted IDs must be fresh");
equal(listCreatorObjects(pasted.def).length, listCreatorObjects(def).length + 2);
ok(pasted.def.meta.creatorElements?.includes("renban-lines") && pasted.def.meta.creatorElements?.includes("cosmetic-text"), "pasted objects must activate their catalog elements");
const pastedConstraint = pasted.def.logic?.constraints?.find((item) => item.id === pasted.objectIds[0]);
ok(pastedConstraint, "constraint clipboard should paste semantic constraint");
equal(pastedConstraint.sourceElementId, "renban-lines");

let bulk = updateCreatorObjects(pasted.def, [textA.objectId, textB.objectId], { opacity: 0.4, color: "#123456" });
const bulkObjects = listCreatorObjects(bulk).filter((object) => [textA.objectId, textB.objectId].includes(object.id));
equal(bulkObjects.every((object) => Number(object.sample?.opacity) === 0.4), true);

bulk = alignCreatorCosmetics(bulk, [textA.objectId, textB.objectId], "left");
const centersAfterAlign = bulk.scene?.overlays.filter((part) => [textA.objectId, textB.objectId].includes(String(part["data-sphenpad-object-id"]))).map((part) => part.center?.[1]);
equal(centersAfterAlign?.[0], centersAfterAlign?.[1], "left alignment should translate both object anchors to the same x");
bulk = snapCreatorObjects(bulk, [textA.objectId, textB.objectId], "cell-center");
for (const part of bulk.scene?.overlays ?? []) if ([textA.objectId, textB.objectId].includes(String(part["data-sphenpad-object-id"]))) {
  ok(part.center && Math.abs((part.center[0] - 0.5) - Math.round(part.center[0] - 0.5)) < 1e-9, "row should snap to cell center");
  ok(part.center && Math.abs((part.center[1] - 0.5) - Math.round(part.center[1] - 0.5)) < 1e-9, "column should snap to cell center");
}

const beforeOrder = bulk.scene?.overlays.map((part) => String(part["data-sphenpad-object-id"] ?? ""));
bulk = moveCreatorObjectsToEdge(bulk, [textA.objectId], "front");
const afterOrder = bulk.scene?.overlays.map((part) => String(part["data-sphenpad-object-id"] ?? ""));
ok(beforeOrder?.join("|") !== afterOrder?.join("|"), "front/back layer operation should reorder parts");
equal(afterOrder?.[afterOrder.length - 1], textA.objectId);

let pathDef = setCreatorLinePathPoint(bulk, line.constraintId, 1, { r: 1, c: 1 });
let path = pathDef.logic?.constraints?.find((item) => item.id === line.constraintId)?.path ?? [];
equal(path[1]?.r, 1); equal(path[1]?.c, 1);
pathDef = nudgeCreatorLinePathPoint(pathDef, line.constraintId, 1, 1, 0);
path = pathDef.logic?.constraints?.find((item) => item.id === line.constraintId)?.path ?? [];
equal(path[1]?.r, 2);
pathDef = insertCreatorLinePathPoint(pathDef, line.constraintId, 1, { r: 2, c: 2 });
path = pathDef.logic?.constraints?.find((item) => item.id === line.constraintId)?.path ?? [];
equal(path.length, 4);
pathDef = reorderCreatorLinePathPoint(pathDef, line.constraintId, 2, 0);
path = pathDef.logic?.constraints?.find((item) => item.id === line.constraintId)?.path ?? [];
equal(path[0]?.r, 2); equal(path[0]?.c, 2);
pathDef = removeCreatorLinePathPoint(pathDef, line.constraintId, 0);
path = pathDef.logic?.constraints?.find((item) => item.id === line.constraintId)?.path ?? [];
equal(path.length, 3);

const reduced = removeCreatorObjects(pathDef, pasted.objectIds);
equal(listCreatorObjects(reduced).some((object) => pasted.objectIds.includes(object.id)), false);

const withDefaults = { ...reduced, meta: { ...reduced.meta, creatorToolDefaults: { "cosmetic-text": { constraintValue: "Label", patch: { opacity: 0.75, textColor: "#333333" } } } } };
const project = creatorProjectFromDefinition(withDefaults);
const roundTrip = definitionFromCreatorProject(project);
equal(roundTrip.meta.creatorToolDefaults?.["cosmetic-text"]?.constraintValue, "Label");
equal(roundTrip.meta.creatorToolDefaults?.["cosmetic-text"]?.patch?.opacity, 0.75);

console.log("creator 11K editing UX tests passed");
