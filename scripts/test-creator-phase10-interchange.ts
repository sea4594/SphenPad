import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createAuthoredPuzzleDefinition } from "../src/sudokupad/creator/nativeAuthoring";
import { addCreatorLineConstraint } from "../src/sudokupad/creator/lineConstraints";
import { creatorProjectFromDefinition } from "../src/sudokupad/creator/project";
import { creatorExportLossWarning, creatorProjectForNewImport, MAX_CREATOR_IMPORT_CHARACTERS, summarizeCreatorImport } from "../src/sudokupad/creator/interchangePreview";
import { authoredPuzzleJson, creatorProjectJson, exportCreatorInterchange, importCreatorInterchange } from "../src/sudokupad/creator/interchange";

async function testPhase10() {
  const original = createAuthoredPuzzleDefinition({
    id: "phase10-original", rows: 4, cols: 4, subgrid: { r: 2, c: 2 },
    meta: { title: "Export test", author: "Creator", creatorPublished: true },
  });
  original.givens = [{ rc: { r: 0, c: 0 }, v: "1" }];
  const source = addCreatorLineConstraint(original, "thermometers", [{ r: 0, c: 0 }, { r: 0, c: 1 }]).def;

  // Native editable formats preserve creator semantics and metadata.
  const native = await importCreatorInterchange(creatorProjectJson(source), { id: "same", sourceId: "same" });
  assert.equal(native.report.format, "creator-project");
  assert.equal(native.def.logic?.constraints?.length, source.logic?.constraints?.length);
  assert.equal(native.def.givens[0]?.v, "1");
  const authored = await importCreatorInterchange(authoredPuzzleJson(source), { id: "authored", sourceId: "authored" });
  assert.equal(authored.report.format, "sphenpad-authored");
  assert.equal(authored.def.logic?.constraints?.length, source.logic?.constraints?.length);

  const preview = summarizeCreatorImport(native);
  assert.equal(preview.title, "Export test");
  assert.equal(preview.dimensions, "4 × 4");
  assert.equal(preview.givens, 1);
  assert.equal(preview.constraints, 1);
  assert.ok(preview.graphics > 0);
  assert.equal(MAX_CREATOR_IMPORT_CHARACTERS, 10_000_000);

  // Create a separate import without accidentally publishing it or modifying the original.
  const newProject = creatorProjectForNewImport(native, "phase10-new");
  assert.equal(newProject.projectId, "phase10-new");
  assert.equal(newProject.sourceId, "phase10-new");
  assert.equal(newProject.settings.publishedToMyPuzzles, false);
  assert.equal(newProject.givens.length, 1);
  assert.equal(newProject.constraints.length, 1);
  assert.equal(creatorProjectFromDefinition(source).projectId, "phase10-original");

  const exported = exportCreatorInterchange(source);
  assert.ok(exported.sudokuPadUrl.startsWith("https://sudokupad.app/scl"));
  assert.ok(exported.report.issues.some((item) => item.code === "creator-checker-semantics-not-exported"));
  assert.ok(creatorExportLossWarning(exported.report)?.includes("checker rules"));
  const roundTrip = await importCreatorInterchange(exported.scl, { id: "roundtrip", sourceId: "roundtrip" });
  assert.equal(roundTrip.def.rows, 4);
  assert.equal(roundTrip.def.givens[0]?.v, "1");
  assert.ok(roundTrip.report.issues.some((item) => item.code === "semantic-inference"));
  const fromScl = creatorProjectForNewImport(roundTrip, "phase10-scl-copy");
  assert.equal(fromScl.projectId, "phase10-scl-copy");
  assert.equal(fromScl.givens.length, 1);
  assert.equal(fromScl.grid.rows, 4);

  // Real losses require explicit warning before handing out a link.
  const custom = { ...source, logic: { ...source.logic, constraints: [{ id: "custom-1", type: "custom" as const, enabled: true }] } };
  assert.ok(creatorExportLossWarning(exportCreatorInterchange(custom).report)?.includes("reported loss"));
  assert.equal(creatorExportLossWarning({ format: "creator-project", preserved: [], issues: [] }), null);

  // The creator UI stages imports and shares only portable URLs, never local IDs.
  const editor = readFileSync("src/ui/PuzzleEditorPage.tsx", "utf8");
  for (const token of ["setPendingImport({ result, revision: startingRevision })", "finishInterchangeImport(\"new\")", "finishInterchangeImport(\"replace\")", "creatorProjectForNewImport(pendingImport.result, newKey)", "url: result.sudokuPadUrl", "Share portable SudokuPad link"]) {
    assert.ok(editor.includes(token), `Missing creator Phase 10 workflow: ${token}`);
  }
  assert.ok(!editor.includes("new URL(`#/p/${encodeURIComponent(data.def.id)}`"), "Share must not use a local-only ID");
  console.log("creator Phase 10 import/export and portable sharing tests passed");
}

void testPhase10().catch((error) => { console.error(error); process.exitCode = 1; });
