import type { CellRC, PuzzleDefinition } from "../../core/model";
import type { PuzzleLogicConstraint } from "../types/logic";
import type { SudokuPadSourceCage, SudokuPadSourceGraphic } from "../types/source";
import { creatorDigitCount, creatorDigitRange } from "./gridStructure";
import { addCreatorConstraint, creatorConstraints, creatorPartConstraint, removeCreatorConstraint } from "./nativeAuthoring";

export const CREATOR_GROUP_ELEMENT_IDS = [
  "even", "odd", "minimum", "maximum", "difference-kropki", "ratio-kropki", "xv", "killer-cages", "clones",
  "quadruples", "look-and-say-cages", "different-values", "extra-region", "counting-circles",
] as const;
export type CreatorGroupElementId = typeof CREATOR_GROUP_ELEMENT_IDS[number];
export type CreatorGroupConstraintPatch = {
  value?: string | number;
  difference?: number;
  ratio?: number;
  sum?: number;
  digits?: number[];
  negativeValues?: number[];
  overrideNegativeRatios?: boolean;
  overrideNegativeDifferences?: boolean;
  sourceElementId?: CreatorGroupElementId;
};

type Visuals = { cages?: SudokuPadSourceCage[]; underlays?: SudokuPadSourceGraphic[]; overlays?: SudokuPadSourceGraphic[] };
const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
function center(cell: CellRC): [number, number] { return [cell.r + 0.5, cell.c + 0.5]; }
function edgeCenter(a: CellRC, b: CellRC): [number, number] { return [(a.r + b.r + 1) / 2, (a.c + b.c + 1) / 2]; }
function adjacent(a: CellRC, b: CellRC) { return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1; }
function uniqueCells(cells: CellRC[]) { const seen = new Set<string>(); return cells.filter((cell) => { const key = `${cell.r}:${cell.c}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function numeric(value: unknown, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
export function isCreatorGroupElementId(value: string | undefined): value is CreatorGroupElementId { return CREATOR_GROUP_ELEMENT_IDS.includes(value as CreatorGroupElementId); }
export function isCreatorGroupConstraint(constraint: PuzzleLogicConstraint | undefined) {
  return Boolean(constraint && ["even", "odd", "minimum", "maximum", "difference", "ratio", "xv", "killer-cage", "clone", "quadruple", "look-and-say-cage", "different-values", "counting-circles"].includes(constraint.type));
}

function semanticType(elementId: CreatorGroupElementId) {
  if (elementId === "difference-kropki") return "difference";
  if (elementId === "ratio-kropki") return "ratio";
  if (elementId === "killer-cages") return "killer-cage";
  if (elementId === "clones") return "clone";
  if (elementId === "quadruples") return "quadruple";
  if (elementId === "look-and-say-cages") return "look-and-say-cage";
  if (elementId === "extra-region" || elementId === "different-values") return "different-values";
  return elementId;
}

function defaultConstraint(def: PuzzleDefinition, elementId: CreatorGroupElementId, cells: CellRC[], value?: string): PuzzleLogicConstraint {
  const constraint: PuzzleLogicConstraint = { type: semanticType(elementId), sourceElementId: elementId, cells: uniqueCells(cells) };
  if (elementId === "difference-kropki") { const difference = Math.max(1, numeric(value, 1)); constraint.difference = difference; constraint.value = difference; constraint.negativeValues = []; }
  if (elementId === "ratio-kropki") { const ratio = Math.max(2, numeric(value, 2)); constraint.ratio = ratio; constraint.value = ratio; constraint.negativeValues = []; }
  if (elementId === "xv") { const parsed = value?.trim().toUpperCase() === "V" ? 5 : value?.trim().toUpperCase() === "X" ? 10 : numeric(value, 10); const sum = parsed === 5 ? 5 : 10; constraint.sum = sum; constraint.value = sum; constraint.negativeValues = []; }
  if (elementId === "killer-cages") constraint.value = value?.trim() ?? "";
  if (elementId === "quadruples") { constraint.digits = parseDigitList(value ?? "", def); constraint.value = formatDigitList(constraint.digits); }
  if (elementId === "look-and-say-cages") constraint.value = (value ?? "").replace(/\s+/g, "");
  return constraint;
}

function sharedCorner(cells: CellRC[]): [number, number] | undefined {
  if (!cells.length) return undefined;
  const vertices = (cell: CellRC) => [[cell.r, cell.c], [cell.r, cell.c + 1], [cell.r + 1, cell.c], [cell.r + 1, cell.c + 1]] as [number, number][];
  let candidates = vertices(cells[0]);
  for (const cell of cells.slice(1)) candidates = candidates.filter(([r, c]) => vertices(cell).some(([rr, cc]) => rr === r && cc === c));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function visualsFor(constraint: PuzzleLogicConstraint): Visuals {
  const cells = (constraint.cells ?? []) as CellRC[], elementId = String(constraint.sourceElementId ?? constraint.type);
  if (constraint.type === "even" || constraint.type === "odd") return { underlays: cells.map((cell) => ({ center: center(cell), width: 0.7, height: 0.7, rounded: constraint.type === "odd", borderColor: "#c7c7c7", backgroundColor: "#c7c7c7" })) };
  if (constraint.type === "minimum" || constraint.type === "maximum") return { overlays: cells.map((cell) => ({ center: center(cell), width: 0.5, height: 0.5, text: constraint.type === "minimum" ? "⌄" : "⌃", fontSize: 24, textColor: "#555555" })) };
  if (constraint.type === "difference" || constraint.type === "ratio") {
    const a = cells[0], b = cells[1]; if (!a || !b) return {};
    const isRatio = constraint.type === "ratio", value = Math.trunc(numeric(isRatio ? constraint.ratio ?? constraint.value : constraint.difference ?? constraint.value, isRatio ? 2 : 1));
    return { overlays: [{ center: edgeCenter(a, b), width: 0.32, height: 0.32, rounded: true, borderColor: "#000000", borderSize: 1, backgroundColor: isRatio ? "#000000" : "#ffffff", text: value === (isRatio ? 2 : 1) ? "" : String(value), textColor: isRatio ? "#ffffff" : "#000000", fontSize: 11 }] };
  }
  if (constraint.type === "xv") {
    const a = cells[0], b = cells[1]; if (!a || !b) return {};
    const sum = numeric(constraint.sum ?? constraint.value, 10);
    return { overlays: [{ center: edgeCenter(a, b), width: 0.34, height: 0.34, rounded: false, backgroundColor: "#ffffff", text: sum === 5 ? "V" : "X", fontSize: 21, textColor: "#333333" }] };
  }
  if (constraint.type === "killer-cage" || constraint.type === "look-and-say-cage") return { cages: [{ cells: cells.map((cell): [number, number] => [cell.r, cell.c]), value: String(constraint.value ?? ""), style: "killer", unique: constraint.type === "killer-cage", outlineC: "#555555" }] };
  if (constraint.type === "clone") return { underlays: cells.map((cell) => ({ center: center(cell), width: 0.84, height: 0.84, rounded: false, backgroundColor: "rgba(91,141,205,0.20)", borderColor: "#5b8dcd", borderSize: 1.1 })) };
  if (constraint.type === "quadruple") {
    const corner = sharedCorner(cells); if (!corner) return {};
    const digits = Array.isArray(constraint.digits) ? (constraint.digits as unknown[]).map(Number).filter(Number.isFinite) : [];
    return { overlays: [{ center: corner, width: 0.72, height: 0.72, rounded: true, backgroundColor: "rgba(255,255,255,0.90)", borderColor: "#444444", borderSize: 1.3, text: digits.join(""), fontSize: 13, textColor: "#222222" }] };
  }
  if (constraint.type === "different-values") return { cages: [{ cells: cells.map((cell): [number, number] => [cell.r, cell.c]), style: "extraregion", unique: true, outlineC: "#b6b6b6" }] };
  if (constraint.type === "counting-circles") return { underlays: cells.map((cell) => ({ center: center(cell), width: 0.75, height: 0.75, rounded: true, backgroundColor: "#ffffff", borderColor: "#000000", borderSize: 1.2 })) };
  void elementId;
  return {};
}

export function addCreatorGroupConstraint(def: PuzzleDefinition, elementId: CreatorGroupElementId, cells: CellRC[], value?: string): { def: PuzzleDefinition; constraintId: string } {
  const input = defaultConstraint(def, elementId, cells, value);
  const before = new Set(creatorConstraints(def).map((constraint) => constraint.id));
  const next = addCreatorConstraint(def, input as PuzzleLogicConstraint & { type: string }, visualsFor(input));
  const added = creatorConstraints(next).find((constraint) => !before.has(constraint.id));
  return { def: next, constraintId: added?.id ?? "" };
}

function updateVisualValue(def: PuzzleDefinition, id: string, constraint: PuzzleLogicConstraint): PuzzleDefinition {
  if (!def.scene) return def;
  const mapGraphic = (part: SudokuPadSourceGraphic) => {
    if (creatorPartConstraint(part as Record<string, unknown>) !== id) return part;
    if (constraint.type === "difference" || constraint.type === "ratio") {
      const ratio = constraint.type === "ratio", value = Math.trunc(numeric(ratio ? constraint.ratio ?? constraint.value : constraint.difference ?? constraint.value, ratio ? 2 : 1));
      return { ...part, text: value === (ratio ? 2 : 1) ? "" : String(value), textColor: ratio ? "#ffffff" : "#000000", backgroundColor: ratio ? "#000000" : "#ffffff" };
    }
    if (constraint.type === "xv") return { ...part, text: numeric(constraint.sum ?? constraint.value, 10) === 5 ? "V" : "X" };
    if (constraint.type === "quadruple") return { ...part, text: formatDigitList(constraint.digits) };
    return part;
  };
  const mapCage = (part: SudokuPadSourceCage) => creatorPartConstraint(part as Record<string, unknown>) === id && (constraint.type === "killer-cage" || constraint.type === "look-and-say-cage") ? { ...part, value: String(constraint.value ?? "") } : part;
  return { ...def, scene: { ...def.scene, cages: def.scene.cages.map(mapCage), underlays: def.scene.underlays.map(mapGraphic), overlays: def.scene.overlays.map(mapGraphic) } };
}

export function updateCreatorGroupConstraint(def: PuzzleDefinition, constraintId: string, patch: CreatorGroupConstraintPatch): PuzzleDefinition {
  let updated: PuzzleLogicConstraint | undefined;
  const constraints = (def.logic?.constraints ?? []).map((constraint) => {
    if (constraint.id !== constraintId) return constraint;
    const next: PuzzleLogicConstraint = { ...constraint, ...clone(patch) };
    if (patch.difference !== undefined) { const difference = Math.max(1, Math.trunc(patch.difference)); next.difference = difference; next.value = difference; }
    if (patch.ratio !== undefined) { const ratio = Math.max(2, Math.trunc(patch.ratio)); next.ratio = ratio; next.value = ratio; }
    if (patch.sum !== undefined) { const sum = patch.sum === 5 ? 5 : 10; next.sum = sum; next.value = sum; }
    if (patch.digits !== undefined) { next.digits = patch.digits.map(Number).filter(Number.isFinite); next.value = formatDigitList(next.digits); }
    updated = next; return next;
  });
  const next = { ...def, logic: { ...(def.logic ?? {}), constraints } };
  return updated ? updateVisualValue(next, constraintId, updated) : next;
}

export function replaceCreatorGroupCells(def: PuzzleDefinition, constraintId: string, cells: CellRC[]): PuzzleDefinition {
  const existing = creatorConstraints(def).find((constraint) => constraint.id === constraintId);
  if (!existing) return def;
  const nextConstraint = { ...clone(existing), cells: uniqueCells(cells) };
  let next = removeCreatorConstraint(def, constraintId);
  next = addCreatorConstraint(next, { ...nextConstraint, id: constraintId, type: nextConstraint.type }, visualsFor(nextConstraint));
  return next;
}

export function normalizeCreatorGroupConstraints(def: PuzzleDefinition): PuzzleDefinition {
  const constraints = (def.logic?.constraints ?? []).map((constraint) => {
    const rawSource = String(constraint.sourceElementId ?? constraint.type);
    const legacy = isCreatorGroupElementId(rawSource) ? rawSource : constraint.type === "killer-cage" ? "killer-cages" : undefined;
    if (!legacy || !isCreatorGroupElementId(legacy)) return constraint;
    const next: PuzzleLogicConstraint = { ...constraint, sourceElementId: legacy, type: semanticType(legacy), cells: uniqueCells((constraint.cells ?? constraint.path ?? []) as CellRC[]) };
    delete next.path;
    if (next.type === "difference") { const difference = Math.max(1, Math.trunc(numeric(constraint.difference ?? constraint.value, 1))); next.difference = difference; next.value = difference; next.negativeValues = Array.isArray(constraint.negativeValues) ? constraint.negativeValues : []; }
    if (next.type === "ratio") { const ratio = Math.max(2, Math.trunc(numeric(constraint.ratio ?? constraint.value, 2))); next.ratio = ratio; next.value = ratio; next.negativeValues = Array.isArray(constraint.negativeValues) ? constraint.negativeValues : []; }
    if (next.type === "xv") { const sum = numeric(constraint.sum ?? constraint.value, 10) === 5 ? 5 : 10; next.sum = sum; next.value = sum; next.negativeValues = Array.isArray(constraint.negativeValues) ? constraint.negativeValues : []; }
    if (next.type === "quadruple") { next.digits = Array.isArray(constraint.digits) ? constraint.digits : parseDigitList(String(constraint.value ?? ""), def); next.value = formatDigitList(next.digits); }
    if (next.type === "look-and-say-cage") next.value = String(constraint.value ?? "").replace(/\s+/g, "");
    return next;
  });
  return { ...def, logic: { ...(def.logic ?? {}), constraints } };
}

export function parseDigitList(text: string, def: PuzzleDefinition): number[] {
  const { min, max } = creatorDigitRange(def);
  const raw = text.trim(); if (!raw) return [];
  const tokens = /[\s,]+/.test(raw) ? raw.split(/[\s,]+/).filter(Boolean) : raw.split("");
  return tokens.map(Number).filter((value) => Number.isInteger(value) && value >= min && value <= max).slice(0, 4);
}
export function formatDigitList(value: unknown): string { if (!Array.isArray(value)) return ""; const digits = (value as unknown[]).map(Number).filter(Number.isFinite); return digits.some((digit) => Math.abs(digit) >= 10) ? digits.join(", ") : digits.join(""); }
export function parseIntegerList(text: string, min = 1): number[] | null {
  const trimmed = text.trim(); if (!trimmed) return [];
  const values = trimmed.split(/[\s,]+/).filter(Boolean).map(Number);
  return values.every((value) => Number.isInteger(value) && value >= min) ? [...new Set(values)] : null;
}
export function formatIntegerList(value: unknown): string { return Array.isArray(value) ? (value as unknown[]).map(Number).filter(Number.isFinite).join(", ") : ""; }
export function validateGroupConstraintShape(def: PuzzleDefinition, constraint: PuzzleLogicConstraint): string[] {
  const messages: string[] = [], cells = (constraint.cells ?? []) as CellRC[], count = creatorDigitCount(def);
  if (["difference", "ratio", "xv"].includes(constraint.type) && (cells.length !== 2 || !adjacent(cells[0], cells[1]))) messages.push(`${constraint.sourceElementId ?? constraint.type} requires exactly two orthogonally adjacent cells.`);
  if (constraint.type === "clone" && cells.length < 2) messages.push("Each clone link needs at least two corresponding cells.");
  if (constraint.type === "killer-cage" && cells.length > count) messages.push(`Killer cages cannot contain more than ${count} cells when digits may not repeat.`);
  if (constraint.type === "quadruple") { if (cells.length < 2 || cells.length > 4 || !sharedCorner(cells)) messages.push("A quadruple must use 2-4 cells sharing one corner."); const digits = Array.isArray(constraint.digits) ? constraint.digits as unknown[] : []; if (!digits.length || digits.length > 4) messages.push("A quadruple needs 1-4 clue digits."); }
  if (constraint.type === "different-values" && cells.length > count) messages.push(`Different Values cannot contain more than ${count} cells.`);
  if (constraint.type === "look-and-say-cage") { const clue = String(constraint.value ?? ""); const pairs = clue.match(/\d\d/g) ?? []; if (!clue || clue.length % 2 || pairs.join("") !== clue || new Set(pairs.map((pair) => pair[1])).size !== pairs.length) messages.push("Look-and-say cage clues must be unique count/digit pairs such as 1522."); }
  return messages;
}
