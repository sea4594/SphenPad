function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
import { validateCreatorDefinition } from "../src/sudokupad/creator/checker";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { addCreatorConstraint, createAuthoredPuzzleDefinition, creatorPartConstraint } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorCosmetic, duplicateCreatorObject, ensureCreatorObjectIds, listCreatorObjects, moveCreatorObject, removeCreatorObject, setCreatorBackground, setCreatorObjectGraphicLayer, updateCreatorObject, CREATOR_OBJECT_ID } from "../src/sudokupad/creator/objectEditing";

let def = createAuthoredPuzzleDefinition({ id: "objects", rows: 4, cols: 4, subgrid: { r: 2, c: 2 }, digitRange: { min: 1, max: 4 }, meta: {} });
def = { ...def, givens: [{ rc: { r: 0, c: 0 }, v: "2" }, { rc: { r: 0, c: 1 }, v: "1" }] };
def = addCreatorConstraint(def, { id: "thermo-a", type: "thermometer", sourceElementId: "thermometers", path: [{ r: 0, c: 0 }, { r: 0, c: 1 }] }, { lines: [{ wayPoints: [[0.5,0.5],[0.5,1.5]], color: "#cccccc", thickness: 8 }] });
ok(validateCreatorDefinition(def).includes("Thermometer conflict."));
equal(listCreatorObjects(def).find((object) => object.id === "thermo-a")?.kind, "constraint");
def = updateCreatorObject(def, "thermo-a", { enabled: false, name: "Disabled thermo", color: "#123456", thickness: 5 });
equal(def.logic?.constraints?.find((item) => item.id === "thermo-a")?.enabled, false);
ok(!validateCreatorDefinition(def).includes("Thermometer conflict."));
equal(def.scene?.lines[0].opacity, 0.18);
def = updateCreatorObject(def, "thermo-a", { enabled: true });
equal(def.scene?.lines[0].opacity, undefined);
def = updateCreatorObject(def, "thermo-a", { ignoreInSolver: true });
ok(!validateCreatorDefinition(def).includes("Thermometer conflict."));
def = updateCreatorObject(def, "thermo-a", { ignoreInSolver: false });
ok(validateCreatorDefinition(def).includes("Thermometer conflict."));

const cosmeticA = addCreatorCosmetic(def, "cosmetic-lines", { lines: [{ wayPoints: [[1.5,0.5],[1.5,1.5]], color: "#111111", thickness: 3 }] }, { name: "Guide line" });
def = cosmeticA.def;
const cosmeticB = addCreatorCosmetic(def, "cosmetic-text", { overlays: [{ center: [2.5,2.5], text: "Hello", fontSize: 20, textColor: "#222222", width: 1, height: 1 }] }, { name: "Label" });
def = cosmeticB.def;
const cosmeticImage = addCreatorCosmetic(def, "cosmetic-images", { overlays: [{ center: [1.5,2.5], width: 2, height: 1, imageUrl: "https://example.com/picture.png", opacity: 0.8 }] }, { name: "Picture" });
def = cosmeticImage.def;
equal(listCreatorObjects(def).filter((object) => object.kind === "cosmetic").length, 3);
equal(def.logic?.constraints?.filter((item) => String(item.type).startsWith("cosmetic-")).length, 0, "new cosmetics must not become semantic constraints");
const project = creatorProjectFromDefinition(def);
ok(project.cosmetics.lines.length === 1 && project.cosmetics.overlays.length === 2, "cosmetics should serialize through CreatorProject.cosmetics");
const roundTrip = definitionFromCreatorProject(project);
equal(listCreatorObjects(roundTrip).filter((object) => object.kind === "cosmetic").length, 3);
equal(roundTrip.scene?.overlays.find((item) => item[CREATOR_OBJECT_ID] === cosmeticImage.objectId)?.imageUrl, "https://example.com/picture.png");

let changed = updateCreatorObject(roundTrip, cosmeticB.objectId, { text: "Changed", fontSize: 28, backgroundColor: "#eeeeee", rounded: true });
equal(changed.scene?.overlays.find((item) => item[CREATOR_OBJECT_ID] === cosmeticB.objectId)?.text, "Changed");
changed = setCreatorObjectGraphicLayer(changed, cosmeticB.objectId, "underlay");
ok(changed.scene?.underlays.some((item) => item[CREATOR_OBJECT_ID] === cosmeticB.objectId));
ok(!changed.scene?.overlays.some((item) => item[CREATOR_OBJECT_ID] === cosmeticB.objectId));
const duplicated = duplicateCreatorObject(changed, cosmeticA.objectId);
ok(duplicated.objectId && duplicated.objectId !== cosmeticA.objectId);
equal(listCreatorObjects(duplicated.def).filter((object) => object.elementId === "cosmetic-lines").length, 2);

let reordered = addCreatorCosmetic(duplicated.def, "cosmetic-lines", { lines: [{ wayPoints: [[3.5,0.5],[3.5,1.5]], color: "#999999", thickness: 2 }] }, { name: "Third" }).def;
const lineObjects = listCreatorObjects(reordered).filter((object) => object.elementId === "cosmetic-lines");
const lastId = lineObjects[lineObjects.length - 1].id;
const before = reordered.scene?.lines.map((item) => item[CREATOR_OBJECT_ID] ?? creatorPartConstraint(item)).filter(Boolean).join("|");
reordered = moveCreatorObject(reordered, lastId, -1);
const after = reordered.scene?.lines.map((item) => item[CREATOR_OBJECT_ID] ?? creatorPartConstraint(item)).filter(Boolean).join("|");
ok(before !== after, "reordering should change source order");

let background = setCreatorBackground(reordered, { url: "https://example.com/bg.png", opacity: 0.7, target: "background", name: "Paper", elementId: "cosmetic-backgrounds" });
equal(listCreatorObjects(background).find((object) => object.kind === "background")?.name, "Paper");
background = updateCreatorObject(background, "creator-background", { enabled: false });
equal(background.scene?.metadata.bgimageopacity, 0);
background = updateCreatorObject(background, "creator-background", { enabled: true, target: "overlay", url: "https://example.com/new.png" });
equal(background.scene?.metadata.bgimagetarget, "overlay");
equal(background.scene?.metadata.bgimage, "https://example.com/new.png");
background = removeCreatorObject(background, "creator-background");
equal(background.scene?.metadata.bgimage, undefined);

let legacy = createAuthoredPuzzleDefinition({ id: "legacy", rows: 4, cols: 4, subgrid: { r: 2, c: 2 }, meta: {} });
if (legacy.scene) legacy = { ...legacy, scene: { ...legacy.scene, overlays: [{ center: [0.5,0.5], text: "legacy" }] } };
legacy = ensureCreatorObjectIds(legacy);
ok(typeof legacy.scene?.overlays[0][CREATOR_OBJECT_ID] === "string");
legacy = removeCreatorObject(legacy, String(legacy.scene?.overlays[0][CREATOR_OBJECT_ID]));
equal(legacy.scene?.overlays.length, 0);
console.log("creator object editing tests passed");
