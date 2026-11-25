import { readFileSync } from "node:fs";
import { createAuthoredPuzzleDefinition } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorCosmetic, creatorObjectVisualParts, listCreatorObjects, setCreatorBackground, setCreatorObjectGraphicLayer, updateCreatorObject, updateCreatorObjectVisuals } from "../src/sudokupad/creator/objectEditing";
import { alignCreatorCosmetics, creatorObjectClipboardJson, nudgeCreatorCosmetics, pasteCreatorObjectClipboard, snapCreatorObjects } from "../src/sudokupad/creator/editingUx";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
}
const base = createAuthoredPuzzleDefinition({ id: "phase9", rows: 4, cols: 4, subgrid: { r: 2, c: 2 }, meta: {} });

// Image assets retain their authored dimensions/fit and outside-grid placement.
const image = addCreatorCosmetic(base, "cosmetic-images", { overlays: [{
  center: [-1.5, 5.25], width: 3, height: 2, imageUrl: "https://example.com/art.png",
  preserveAspectRatio: "xMidYMid meet", opacity: 0.75,
}] });
let def = image.def;
const pic = image.objectId;
const imagePart = () => creatorObjectVisualParts(def, pic)[0]?.part;
equal(imagePart()?.center, [-1.5, 5.25], "outside-grid image position");
def = updateCreatorObject(def, pic, { preserveAspectRatio: "xMidYMid slice" });
equal(imagePart()?.preserveAspectRatio, "xMidYMid slice", "image crop mode");
def = setCreatorObjectGraphicLayer(def, pic, "underlay");
assert(creatorObjectVisualParts(def, pic)[0]?.collection === "underlays", "image moved to underlay");
def = updateCreatorObjectVisuals(def, pic, ["underlays"], { width: 4, height: 3, textColor: "#ff0000" });
equal(imagePart()?.width, 4, "image inspector updates current layer");
def = nudgeCreatorCosmetics(def, [pic], -0.25, 0.25);
equal(imagePart()?.center, [-1.75, 5.5], "nudge preserves fractional outside coordinates");
def = snapCreatorObjects(def, [pic], "cell-center");
equal(imagePart()?.center, [-1.5, 5.5], "snap outside-grid images");

// Alignment uses rendered shape bounds rather than centers. A rotated rectangle
// must account for its rotated envelope, not merely the source width.
const a = addCreatorCosmetic(def, "cosmetic-shapes", { overlays: [{ center: [1, 1], width: 2, height: 1 }] });
def = a.def;
const b = addCreatorCosmetic(def, "cosmetic-shapes", { overlays: [{ center: [3, 3], width: 1, height: 2, angle: 90 }] });
def = b.def;
def = alignCreatorCosmetics(def, [a.objectId, b.objectId], "left");
const partA = creatorObjectVisualParts(def, a.objectId)[0]?.part;
const partB = creatorObjectVisualParts(def, b.objectId)[0]?.part;
const leftA = Number((partA?.center as number[])[1]) - Number(partA?.width) / 2;
const leftB = Number((partB?.center as number[])[1]) - Number(partB?.height) / 2;
assert(Math.abs(leftA - leftB) < 1e-9, "left alignment must use rotated visible bounds");

// Cell-anchored cosmetic cages must not be dragged to fractional grid positions.
const cage = addCreatorCosmetic(def, "cosmetic-cages", { cages: [{ cells: [[0, 0], [0, 1]], value: "" }] });
def = cage.def;
const beforeCage = JSON.stringify(creatorObjectVisualParts(def, cage.objectId));
def = nudgeCreatorCosmetics(def, [cage.objectId], 0.25, 0.25);
equal(JSON.stringify(creatorObjectVisualParts(def, cage.objectId)), beforeCage, "cell-based cage must not be nudged fractionally");

// Hidden graphics remain dim, but opacity edits should be restored when enabled.
def = updateCreatorObject(def, pic, { enabled: false });
def = updateCreatorObject(def, pic, { opacity: 0.6 });
equal(imagePart()?.opacity, 0.18, "disabled graphic must remain dim");
def = updateCreatorObject(def, pic, { enabled: true });
equal(imagePart()?.opacity, 0.6, "edited graphic opacity restored");

// Background opacity adjustments must never reveal a disabled background.
def = setCreatorBackground(def, { url: "https://example.com/background.png", opacity: 0.75 });
def = updateCreatorObject(def, "creator-background", { enabled: false });
def = updateCreatorObject(def, "creator-background", { opacity: 0.4 });
equal(def.scene?.metadata.bgimageopacity, 0, "disabled background stays hidden");
equal(listCreatorObjects(def).find((entry) => entry.kind === "background")?.sample?.opacity, 0.4, "background inspector shows stored opacity");
def = updateCreatorObject(def, "creator-background", { enabled: true });
equal(def.scene?.metadata.bgimageopacity, 0.4, "edited background opacity restored");

// Copy/paste, save/reopen, and export keep imagery and its placement intact.
const pasted = pasteCreatorObjectClipboard(def, creatorObjectClipboardJson(def, [pic]));
assert(pasted.objectIds.length === 1 && pasted.objectIds[0] !== pic, "copied graphic needs a fresh object id");
const reopened = definitionFromCreatorProject(creatorProjectFromDefinition(pasted.def));
const reopenedImage = creatorObjectVisualParts(reopened, pasted.objectIds[0])[0]?.part;
equal(reopenedImage?.preserveAspectRatio, "xMidYMid slice", "image fit retained after reopening");
equal(reopenedImage?.center, [-1.5, 5.5], "outside image position retained after reopening");

const editor = readFileSync(new URL("../src/ui/PuzzleEditorPage.tsx", import.meta.url), "utf8");
for (const token of [
  'preserveAspectRatio: "xMidYMid meet"',
  'renderCreatorCosmeticPosition(selectedObject)',
  'value={String(graphic.preserveAspectRatio ?? "none")}',
  'const actual = selectedObject.kind === "cosmetic"',
  'nudgeCreatorCosmetics(data.def, [object.id], dr, dc)',
]) assert(editor.includes(token), `missing creator artwork control: ${token}`);

console.log("creator Phase 9 artwork regression tests passed");
