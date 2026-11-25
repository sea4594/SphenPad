/** Phase 12 creator-only large-project, persistence, and UI lifecycle regressions. */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createAuthoredPuzzleDefinition, creatorConstraints } from "../src/sudokupad/creator/nativeAuthoring";
import { ensureCreatorObjectIds, listCreatorObjects } from "../src/sudokupad/creator/objectEditing";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { CreatorSaveCoordinator } from "../src/sudokupad/creator/saveCoordinator";
import { creatorSourcePuzzle } from "../src/sudokupad/creator/interchange";

function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function same(actual: unknown, expected: unknown, message: string) {
  check(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}

const def = createAuthoredPuzzleDefinition({ id: "phase12-stress", rows: 9, cols: 9, subgrid: { r: 3, c: 3 }, meta: { title: "Large creator puzzle" } });
check(def.scene && def.logic, "creator scene and logic must exist");
const constraintCount = 320;
const cosmeticCount = 480;
const constraints = Array.from({ length: constraintCount }, (_, i) => ({
  id: `constraint-${i}`, type: "even", sourceElementId: "even", cells: [{ r: i % 9, c: (i * 5) % 9 }],
}));
def.logic.constraints = constraints;
const scene = def.scene;
const tagConstraint = "data-sphenpad-constraint";
const tagObject = "data-sphenpad-object-id";
const tagElement = "data-sphenpad-element";
const tagDisabled = "data-sphenpad-disabled";
const lines = constraints.map((constraint, i) => ({
  wayPoints: [[i % 9 + 0.5, 0.5], [i % 9 + 0.5, 1.5]],
  color: "#404040", thickness: 4,
  [tagConstraint]: constraint.id,
  [tagElement]: "even",
}));
const overlays = [
  ...constraints.filter((_, i) => i % 3 === 0).map((constraint) => ({ center: [1.5, 1.5], width: 0.5, height: 0.5, text: "x", [tagConstraint]: constraint.id })),
  ...Array.from({ length: cosmeticCount }, (_, i) => ({
    center: [i % 9 + 0.5, Math.floor(i / 9) * 0.2 - 2], width: 0.5, height: 0.5, text: `C${i}`,
    [tagObject]: `cosmetic-${i}`, [tagElement]: "cosmetic-text",
    ...(i % 7 === 0 ? { [tagDisabled]: true } : {}),
  })),
];
scene.lines = lines as unknown as typeof scene.lines;
scene.overlays = overlays as unknown as typeof scene.overlays;
scene.underlays = [
  { center: [-0.5, -0.5], width: 1, height: 1, text: "outside", [tagObject]: "cosmetic-0", [tagElement]: "cosmetic-text" },
] as typeof scene.underlays;
scene.metadata = { ...scene.metadata, bgimage: "https://example.org/art.png", creatorBackgroundName: "Backdrop" };

const started = performance.now();
const listed = listCreatorObjects(def);
const inventoryMs = performance.now() - started;
check(listed.length === constraintCount + cosmeticCount + 1, "large creator inventory lost objects");
for (let i = 0; i < constraintCount; i++) {
  const object = listed[i];
  check(object.id === `constraint-${i}` && object.kind === "constraint", `constraint ${i} order or kind changed`);
  const expectedCount = i % 3 === 0 ? 2 : 1;
  check(object.visualCount === expectedCount, `constraint ${i} visual count changed`);
  same(object.collections, expectedCount === 2 ? ["lines", "overlays"] : ["lines"], "constraint layer order changed");
}
const firstCosmetic = listed[constraintCount];
check(firstCosmetic.id === "cosmetic-0" && firstCosmetic.kind === "cosmetic", "cosmetic order changed");
same(firstCosmetic.collections, ["underlays", "overlays"], "cosmetic multi-layer order changed");
check(firstCosmetic.enabled, "multi-layer cosmetic should be enabled if one part is visible");
check(listed[constraintCount + 1].id === "cosmetic-1", "cosmetic order changed after first item");
check(listed.at(-1)?.kind === "background", "metadata background missing from creator inventory");
check(def.scene.underlays[0] && def.scene.overlays.length === overlays.length, "creator enumeration mutated scene");

// Existing documents with untagged artwork must continue to be discoverable.
const missingTag = createAuthoredPuzzleDefinition({ id: "old-artwork", rows: 4, cols: 4, meta: {} });
check(missingTag.scene, "legacy scene missing");
missingTag.scene.overlays = [{ center: [0.5, 0.5], width: 1, height: 1, text: "legacy" }];
const normalized = ensureCreatorObjectIds(missingTag);
check(listCreatorObjects(normalized).some((object) => object.kind === "cosmetic"), "legacy untagged graphic disappeared");

// Large authoring round trips must preserve all artwork and constraint identities.
const project = creatorProjectFromDefinition(def);
const revived = definitionFromCreatorProject(project);
const after = listCreatorObjects(revived);
same(after.map(({ id, kind, visualCount, enabled, collections }) => ({ id, kind, visualCount, enabled, collections })),
  listed.map(({ id, kind, visualCount, enabled, collections }) => ({ id, kind, visualCount, enabled, collections })),
  "large creator save/reopen changed object inventory");
check(creatorConstraints(revived).length === constraintCount, "large project lost authored constraints");
// Visual projection remains faithful for off-grid art and layered objects.
const exportedVisuals = creatorSourcePuzzle(revived);
check(exportedVisuals.lines?.length === constraintCount, "export lost creator-authored lines");
check(exportedVisuals.overlays?.length === overlays.length, "export lost overlay artwork");
check(exportedVisuals.underlays?.length === 1, "export lost outside-grid underlay");
same(exportedVisuals.underlays?.[0]?.center, [-0.5, -0.5], "off-grid artwork was moved into the puzzle grid");
check(String(exportedVisuals.metadata?.bgimage).includes("art.png"), "export lost metadata background image");


// Stress asynchronous save coalescing without timers or IndexedDB dependencies.
let active = 0, maximumActive = 0;
const writes: number[] = [];
const queue = new CreatorSaveCoordinator<number>(async (value) => {
  active += 1; maximumActive = Math.max(maximumActive, active);
  await Promise.resolve();
  writes.push(value);
  active -= 1;
}, 60000);
for (let i = 0; i < 400; i++) queue.enqueue(i);
void (async () => {
const flushes = await Promise.all([queue.flush(), queue.flush(), queue.flush()]);
same(flushes, [400, 400, 400], "simultaneous flushes did not reach latest revision");
same(writes, [399], "rapid creator autosaves did not coalesce");
check(maximumActive === 1 && queue.getUncommitted() === null && !queue.getStatus().error,
  "creator save queue overlapped or retained stale work");

// Creator-only UI performance behavior must not regress to eager previews.
const creatorList = readFileSync("src/ui/PuzzleCreatorPage.tsx", "utf8");
const editor = readFileSync("src/ui/PuzzleEditorPage.tsx", "utf8");
for (const token of ["IntersectionObserver", 'rootMargin: "250px"', "CreatorProjectPreviewCanvas", "refreshRevisionRef", "revision === refreshRevisionRef.current"]) {
  check(creatorList.includes(token), `creator lazy-preview / refresh guard missing: ${token}`);
}
check(editor.includes("useMemo(() => data ? listCreatorObjects(data.def) : [], [data?.def])"),
  "creator inventory no longer memoized for UI-only renders");
check(editor.includes("solverWorkerRef.current?.terminate()"), "creator solver cancellation missing");
check(editor.includes("saveQueue.enqueue({ def, history: creatorHistoryRef.current })"), "creator async saving changed");
console.log(`creator Phase 12 stress passed: ${constraintCount} constraints, ${cosmeticCount} cosmetics, ${listed.length} objects; inventory ${inventoryMs.toFixed(1)}ms`);
})().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
