function ok(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function equal(actual: unknown, expected: unknown, message?: string) { if (actual !== expected) throw new Error(message ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

import type { CellRC, PuzzleDefinition } from "../src/core/model";
import { createAuthoredPuzzleDefinition, creatorConstraints, setCreatorGlobalRule, syncDefinitionGivens } from "../src/sudokupad/creator/nativeAuthoring";
import { setCreatorRegionConfiguration } from "../src/sudokupad/creator/gridStructure";
import { addCreatorLineConstraint, CREATOR_LINE_ELEMENT_IDS, type CreatorLineElementId } from "../src/sudokupad/creator/lineConstraints";
import { addCreatorGroupConstraint, CREATOR_GROUP_ELEMENT_IDS, type CreatorGroupElementId } from "../src/sudokupad/creator/groupConstraints";
import { addCreatorGlobalConstraint, CREATOR_GLOBAL_ELEMENT_IDS, setCreatorSudokuRules, type CreatorGlobalElementId } from "../src/sudokupad/creator/globalConstraints";
import { addCreatorCosmetic, listCreatorObjects } from "../src/sudokupad/creator/objectEditing";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../src/sudokupad/creator/project";
import { creatorSourcePuzzle, encodeCreatorScl } from "../src/sudokupad/creator/interchange";
import { validateConstraints, validateGrid } from "../src/sudokupad/creator/worker";
import { SUDOKUMAKER_TOOL_INVENTORY } from "../src/sudokupad/creator/sudokumakerParity";

const c = (r: number, col: number): CellRC => ({ r, c: col });
function base(id: string): PuzzleDefinition {
  return createAuthoredPuzzleDefinition({ id, rows: 9, cols: 9, subgrid: { r: 3, c: 3 }, digitRange: { min: 1, max: 9 }, meta: { title: `Release audit ${id}`, author: "Phase 11L" } });
}
function bridge(def: PuzzleDefinition): PuzzleDefinition {
  const project = creatorProjectFromDefinition(def);
  const roundTrip = definitionFromCreatorProject(project, { id: def.id, sourceId: def.sourceId });
  equal(roundTrip.rows, def.rows, "CreatorProject rows changed");
  equal(roundTrip.cols, def.cols, "CreatorProject cols changed");
  ok(roundTrip.scene && roundTrip.logic, "CreatorProject bridge lost native scene/logic");
  const source = creatorSourcePuzzle(roundTrip);
  equal(source.cells.length, def.rows, "SudokuPad projection lost rows");
  ok(encodeCreatorScl(roundTrip).startsWith("scl"), "SCL export did not produce an scl payload");
  validateGrid(roundTrip);
  return roundTrip;
}

const createdIds = new Set<string>();
const auditedUpstream = new Set<string>();

// Core grid/base tools.
{
  let def = base("givens");
  def = syncDefinitionGivens({ ...def, givens: [{ rc: c(0, 0), v: "1" }] });
  def = bridge(def); equal(def.givens[0]?.v, "1"); createdIds.add("given-digits"); auditedUpstream.add("Givens");
}
{
  let def = setCreatorRegionConfiguration(base("regions"), "regular", { rows: 3, cols: 3 });
  def = bridge(def); equal(def.logic?.regions?.length, 9); createdIds.add("regions"); auditedUpstream.add("Regions");
}
{
  const def = bridge(setCreatorSudokuRules(base("rules"), false)); equal(def.logic?.sudokuRules, false); auditedUpstream.add("SudokuRules");
}

// Global flags represented directly in PuzzleLogic.
{
  const def = bridge(setCreatorGlobalRule(base("antiking"), "antiKing", true)); equal(def.logic?.antiKing, true); createdIds.add("antiking"); auditedUpstream.add("Antiking");
}
{
  const def = bridge(setCreatorGlobalRule(base("antiknight"), "antiKnight", true)); equal(def.logic?.antiKnight, true); createdIds.add("antiknight"); auditedUpstream.add("Antiknight");
}

const lineIds = new Set<string>(CREATOR_LINE_ELEMENT_IDS);
const groupIds = new Set<string>(CREATOR_GROUP_ELEMENT_IDS);
const globalIds = new Set<string>(CREATOR_GLOBAL_ELEMENT_IDS);
const lineCells = [c(0,0), c(0,1), c(0,2)];
const edgeCells = [c(0,0), c(0,1)];
const quadCells = [c(0,0), c(0,1), c(1,0), c(1,1)];
function groupCells(id: string) {
  if (["difference-kropki", "ratio-kropki", "xv"].includes(id)) return edgeCells;
  if (id === "quadruples") return quadCells;
  if (["killer-cages", "clones", "look-and-say-cages", "different-values", "counting-circles"].includes(id)) return [c(0,0), c(0,1)];
  return [c(0,0)];
}
function groupValue(id: string) {
  if (id === "difference-kropki") return "1";
  if (id === "ratio-kropki") return "2";
  if (id === "xv") return "X";
  if (id === "killer-cages") return "3";
  if (id === "quadruples") return "1234";
  if (id === "look-and-say-cages") return "1112";
  return undefined;
}
function globalCells(id: string): CellRC[] {
  if (id === "little-killers") return [c(0,0), c(1,1), c(2,2)];
  if (["sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms"].includes(id)) return [c(0,0)];
  if (["row-indexers", "column-indexers", "custom-constraint", "fog-lights", "custom-fog-clearing"].includes(id)) return [c(0,0)];
  return [];
}
function globalValue(id: string) { return ["little-killers", "sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms"].includes(id) ? "10" : undefined; }

for (const item of SUDOKUMAKER_TOOL_INVENTORY) {
  if (auditedUpstream.has(item.upstreamType)) continue;
  ok(item.sphenpadIds.length > 0, `${item.upstreamType} has no SphenPad mapping`);
  for (const elementId of item.sphenpadIds) {
    if (lineIds.has(elementId)) {
      const made = addCreatorLineConstraint(base(`line-${elementId}`), elementId as CreatorLineElementId, lineCells);
      const def = bridge(made.def); ok(creatorConstraints(def).some((constraint) => constraint.id === made.constraintId && constraint.sourceElementId === elementId), `${elementId} line was lost`);
      equal(validateConstraints(def).get(made.constraintId) ?? "", "", `${elementId} has a release-shape validation error`);
      createdIds.add(elementId); continue;
    }
    if (groupIds.has(elementId)) {
      const made = addCreatorGroupConstraint(base(`group-${elementId}`), elementId as CreatorGroupElementId, groupCells(elementId), groupValue(elementId));
      const def = bridge(made.def); ok(creatorConstraints(def).some((constraint) => constraint.id === made.constraintId && constraint.sourceElementId === elementId), `${elementId} group was lost`);
      equal(validateConstraints(def).get(made.constraintId) ?? "", "", `${elementId} has a release-shape validation error`);
      createdIds.add(elementId); continue;
    }
    if (globalIds.has(elementId)) {
      const made = addCreatorGlobalConstraint(base(`global-${elementId}`), elementId as CreatorGlobalElementId, globalCells(elementId), globalValue(elementId));
      const def = bridge(made.def); ok(creatorConstraints(def).some((constraint) => constraint.id === made.constraintId && constraint.sourceElementId === elementId), `${elementId} global was lost`);
      equal(validateConstraints(def).get(made.constraintId) ?? "", "", `${elementId} has a release-shape validation error`);
      if (elementId === "custom-constraint") ok(validateGrid(def).thrownErrors.some((message) => message.includes("not executed")), "custom runtime limitation must be explicit");
      createdIds.add(elementId); continue;
    }
    if (elementId === "cosmetic-lines") {
      const made = addCreatorCosmetic(base(elementId), elementId, { lines: [{ wayPoints: [[0.5,0.5],[0.5,1.5]], color: "#000000", thickness: 4 }] });
      const def = bridge(made.def); ok(listCreatorObjects(def).some((obj) => obj.id === made.objectId && obj.elementId === elementId)); createdIds.add(elementId); continue;
    }
    if (elementId === "cosmetic-cages") {
      const made = addCreatorCosmetic(base(elementId), elementId, { cages: [{ cells: [[0,0],[0,1]], style: "killer", outlineC: "#000000" }] });
      const def = bridge(made.def); ok(listCreatorObjects(def).some((obj) => obj.id === made.objectId && obj.elementId === elementId)); createdIds.add(elementId); continue;
    }
    if (elementId === "cosmetic-symbols") {
      const made = addCreatorCosmetic(base(elementId), elementId, { overlays: [{ center: [0.5,0.5], width: 0.5, height: 0.5, text: "★", fontSize: 18 }] });
      const def = bridge(made.def); ok(listCreatorObjects(def).some((obj) => obj.id === made.objectId && obj.elementId === elementId)); createdIds.add(elementId); continue;
    }
    throw new Error(`No Phase 11L release fixture for ${item.upstreamType} / ${elementId}`);
  }
  auditedUpstream.add(item.upstreamType);
}

for (const item of SUDOKUMAKER_TOOL_INVENTORY) {
  ok(auditedUpstream.has(item.upstreamType), `${item.upstreamType} was not audited`);
  for (const elementId of item.sphenpadIds) ok(createdIds.has(elementId), `${item.upstreamType} mapping ${elementId} was not exercised`);
}
equal(SUDOKUMAKER_TOOL_INVENTORY.length, 47);
equal(auditedUpstream.size, 47);
console.log(`Phase 11 release parity audit passed: ${auditedUpstream.size}/47 upstream tools exercised (${createdIds.size} SphenPad mappings).`);
