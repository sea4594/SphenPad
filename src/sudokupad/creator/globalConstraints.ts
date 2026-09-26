import type { CellRC, PuzzleDefinition } from "../../core/model";
import type { PuzzleLogicConstraint } from "../types/logic";
import type { SudokuPadPoint, SudokuPadSourceArrow, SudokuPadSourceGraphic, SudokuPadSourceLine, SudokuPadTriggerEffect } from "../types/source";
import { creatorDigitRange } from "./gridStructure";
import { addCreatorConstraint, creatorConstraints, removeCreatorConstraint } from "./nativeAuthoring";

export const CREATOR_GLOBAL_ELEMENT_IDS = [
  "negative-diagonal", "positive-diagonal", "disjoint-groups", "nonconsecutive", "global-entropy", "global-modulo-3",
  "little-killers", "sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms",
  "row-indexers", "column-indexers", "custom-constraint", "fog-lights", "custom-fog-clearing",
] as const;
export type CreatorGlobalElementId = typeof CREATOR_GLOBAL_ELEMENT_IDS[number];
export type CreatorGlobalConstraintPatch = {
  value?: string | number;
  groups?: number[][];
  cells?: CellRC[];
  triggerCells?: CellRC[];
  effectCells?: CellRC[];
  definitionName?: string;
  code?: string;
  input?: Record<string, unknown>;
  components?: unknown[];
  inputSchema?: unknown[];
};

type Visuals = { lines?: SudokuPadSourceLine[]; arrows?: SudokuPadSourceArrow[]; underlays?: SudokuPadSourceGraphic[]; overlays?: SudokuPadSourceGraphic[] };
const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
const key = (cell: CellRC) => `${cell.r}:${cell.c}`;
const uniqueCells = (cells: CellRC[]) => { const seen = new Set<string>(); return cells.filter((cell) => { const k = key(cell); if (seen.has(k)) return false; seen.add(k); return true; }); };
const center = (cell: CellRC): SudokuPadPoint => [cell.r + 0.5, cell.c + 0.5];
const inBounds = (cell: CellRC, def: PuzzleDefinition) => cell.r >= 0 && cell.c >= 0 && cell.r < def.rows && cell.c < def.cols;
const constraintById = (def: PuzzleDefinition, id: string) => creatorConstraints(def).find((entry) => entry.id === id);

export function isCreatorGlobalElementId(value: string | undefined): value is CreatorGlobalElementId { return CREATOR_GLOBAL_ELEMENT_IDS.includes(value as CreatorGlobalElementId); }
export function isCreatorGlobalConstraint(constraint: PuzzleLogicConstraint | undefined) {
  return Boolean(constraint && ["diagonal", "disjoint-groups", "nonconsecutive", "global-entropy", "outside-clue", "indexer", "custom", "foglight", "fog-trigger"].includes(constraint.type));
}

export function creatorSudokuRulesEnabled(def: PuzzleDefinition) { return def.logic?.sudokuRules !== false; }
export function setCreatorSudokuRules(def: PuzzleDefinition, enabled: boolean): PuzzleDefinition {
  return { ...def, logic: { ...(def.logic ?? {}), sudokuRules: enabled } };
}

export function defaultGlobalGroups(def: PuzzleDefinition, mode: "entropy" | "modulo" = "entropy"): number[][] {
  const { min, max } = creatorDigitRange(def), digits = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  if (mode === "modulo") return [0, 1, 2].map((remainder) => digits.filter((digit) => ((digit % 3) + 3) % 3 === remainder)).filter((group) => group.length);
  const size = Math.ceil(digits.length / 3);
  return [digits.slice(0, size), digits.slice(size, size * 2), digits.slice(size * 2)].filter((group) => group.length);
}

function diagonalCells(def: PuzzleDefinition, positive: boolean) {
  const length = Math.min(def.rows, def.cols);
  return Array.from({ length }, (_, index) => ({ r: index, c: positive ? def.cols - 1 - index : index })).filter((cell) => inBounds(cell, def));
}
function diagonalVisual(def: PuzzleDefinition, positive: boolean): Visuals {
  const cells = diagonalCells(def, positive);
  return { lines: [{ wayPoints: cells.map(center), color: "#34BBE6", thickness: 2, target: "overlay" }] };
}
function orthogonalRay(def: PuzzleDefinition, start: CellRC): CellRC[] | null {
  if (!inBounds(start, def)) return null;
  let dr = 0, dc = 0;
  if (start.r === 0) dr = 1;
  else if (start.r === def.rows - 1) dr = -1;
  else if (start.c === 0) dc = 1;
  else if (start.c === def.cols - 1) dc = -1;
  else return null;
  const cells: CellRC[] = [];
  for (let r = start.r, c = start.c; r >= 0 && c >= 0 && r < def.rows && c < def.cols; r += dr, c += dc) cells.push({ r, c });
  return cells;
}
function rayStep(cells: CellRC[]): [number, number] | null {
  if (cells.length < 2) return null;
  const dr = cells[1].r - cells[0].r, dc = cells[1].c - cells[0].c;
  if (!dr && !dc) return null;
  if (Math.abs(dr) > 1 || Math.abs(dc) > 1) return null;
  return [dr, dc];
}
function outsidePoint(cells: CellRC[]): SudokuPadPoint {
  const step = rayStep(cells) ?? [1, 0];
  return [cells[0].r + 0.5 - step[0] * 0.72, cells[0].c + 0.5 - step[1] * 0.72];
}
function outsideVisual(elementId: CreatorGlobalElementId, cells: CellRC[], value: unknown): Visuals {
  const text = value == null ? "" : String(value), point = outsidePoint(cells), visual: Visuals = {
    overlays: [{ center: point, width: 0.9, height: 0.56, text, fontSize: 22, textColor: "#222222", backgroundColor: "rgba(255,255,255,0.82)", rounded: true }],
  };
  if (elementId === "little-killers") {
    const first = center(cells[0]);
    visual.arrows = [{ wayPoints: [point, first], color: "#333333", thickness: 2.2, headLength: 0.22, headStyle: "stroke" }];
  }
  return visual;
}
function indexerVisual(elementId: CreatorGlobalElementId, cells: CellRC[]): Visuals {
  const color = elementId === "row-indexers" ? "rgba(0,128,249,0.33)" : "rgba(249,0,0,0.33)";
  return { underlays: cells.map((cell) => ({ center: center(cell), width: 0.86, height: 0.86, backgroundColor: color, borderColor: color })) };
}
function fogVisual(kind: "light" | "trigger", cells: CellRC[]): Visuals {
  if (kind === "light") return { overlays: cells.map((cell) => ({ center: center(cell), width: 0.42, height: 0.42, rounded: true, backgroundColor: "rgba(255,222,74,0.45)", borderColor: "#d0a400", borderSize: 1.2 })) };
  return { overlays: cells.map((cell) => ({ center: center(cell), width: 0.58, height: 0.58, rounded: true, backgroundColor: "rgba(255,123,123,0.18)", borderColor: "#c94c4c", borderSize: 1.1 })) };
}

function semanticType(elementId: CreatorGlobalElementId) {
  if (elementId === "negative-diagonal" || elementId === "positive-diagonal") return "diagonal";
  if (["little-killers", "sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms"].includes(elementId)) return "outside-clue";
  if (elementId === "row-indexers" || elementId === "column-indexers") return "indexer";
  if (elementId === "global-entropy" || elementId === "global-modulo-3") return "global-entropy";
  if (elementId === "custom-constraint") return "custom";
  if (elementId === "fog-lights") return "foglight";
  if (elementId === "custom-fog-clearing") return "fog-trigger";
  return elementId;
}

function defaultConstraint(def: PuzzleDefinition, elementId: CreatorGlobalElementId, cellsInput: CellRC[], value?: string): PuzzleLogicConstraint {
  const cells = uniqueCells(cellsInput).filter((cell) => inBounds(cell, def));
  const constraint: PuzzleLogicConstraint = { type: semanticType(elementId), sourceElementId: elementId };
  if (constraint.type === "diagonal") { constraint.positive = elementId === "positive-diagonal"; constraint.cells = diagonalCells(def, constraint.positive === true); }
  else if (constraint.type === "global-entropy") constraint.groups = defaultGlobalGroups(def, elementId === "global-modulo-3" ? "modulo" : "entropy");
  else if (constraint.type === "outside-clue") {
    const ray = cells.length === 1 && elementId !== "little-killers" ? orthogonalRay(def, cells[0]) ?? cells : cells;
    constraint.cells = ray; constraint.path = ray; constraint.value = value?.trim() ?? "";
    constraint.diagonal = elementId === "little-killers";
  } else if (constraint.type === "indexer") constraint.cells = cells;
  else if (constraint.type === "custom") {
    constraint.definition = { name: "New constraint", input: [], backend: { type: "code", code: "" }, components: [] };
    constraint.input = {}; constraint.cells = cells;
  } else if (constraint.type === "foglight") constraint.cells = cells;
  else if (constraint.type === "fog-trigger") { constraint.cells = cells; constraint.triggerCells = cells; constraint.effectCells = cells; constraint.patterns = ["Self"]; constraint.overrides = []; constraint.editor = { defaultDisabling: false }; }
  return constraint;
}
function visualsFor(def: PuzzleDefinition, constraint: PuzzleLogicConstraint): Visuals {
  const elementId = String(constraint.sourceElementId ?? "") as CreatorGlobalElementId;
  const cells = ((constraint.cells ?? []) as CellRC[]).filter((cell) => inBounds(cell, def));
  if (constraint.type === "diagonal") return diagonalVisual(def, constraint.positive === true);
  if (constraint.type === "outside-clue" && cells.length) return outsideVisual(elementId, cells, constraint.value);
  if (constraint.type === "indexer") return indexerVisual(elementId, cells);
  if (constraint.type === "foglight") return fogVisual("light", cells);
  if (constraint.type === "fog-trigger") return fogVisual("trigger", ((constraint.triggerCells ?? cells) as CellRC[]));
  return {};
}
function rcQuery(cells: CellRC[]) { return uniqueCells(cells).map((cell) => `r${cell.r + 1}c${cell.c + 1}`).join(","); }

export function syncCreatorFog(def: PuzzleDefinition, clearWhenEmpty = false): PuzzleDefinition {
  if (!def.scene) return def;
  const authored = creatorConstraints(def).filter((constraint) => constraint.type === "foglight" || constraint.type === "fog-trigger");
  if (!authored.length) return clearWhenEmpty ? { ...def, scene: { ...def.scene, fog: undefined } } : def;
  const enabled = authored.filter((constraint) => constraint.enabled !== false);
  const lights = enabled.filter((constraint) => constraint.type === "foglight").flatMap((constraint) => (constraint.cells ?? []) as CellRC[]);
  const triggers = enabled.filter((constraint) => constraint.type === "fog-trigger");
  const links = triggers.map((constraint) => ({ triggerCells: clone((constraint.triggerCells ?? constraint.cells ?? []) as CellRC[]).map((cell): SudokuPadPoint => [cell.r, cell.c]), effectCells: clone((constraint.effectCells ?? []) as CellRC[]).map((cell): SudokuPadPoint => [cell.r, cell.c]) }));
  const effects: SudokuPadTriggerEffect[] = triggers.map((constraint) => ({ trigger: { cells: rcQuery((constraint.triggerCells ?? constraint.cells ?? []) as CellRC[]) }, effect: { type: "foglight", cells: rcQuery((constraint.effectCells ?? []) as CellRC[]) } }));
  if (!lights.length && !triggers.length) return { ...def, scene: { ...def.scene, fog: undefined } };
  return { ...def, scene: { ...def.scene, fog: { initialLightCells: uniqueCells(lights).map((cell): SudokuPadPoint => [cell.r, cell.c]), triggerEffects: effects, triggerLinks: links } } };
}

export function addCreatorGlobalConstraint(def: PuzzleDefinition, elementId: CreatorGlobalElementId, cells: CellRC[] = [], value?: string): { def: PuzzleDefinition; constraintId: string } {
  const unique = ["negative-diagonal", "positive-diagonal", "disjoint-groups", "nonconsecutive", "global-entropy", "global-modulo-3"].includes(elementId);
  const existing = unique ? creatorConstraints(def).find((constraint) => constraint.sourceElementId === elementId) : undefined;
  if (existing) return { def, constraintId: existing.id };
  const constraint = defaultConstraint(def, elementId, cells, value);
  let next = addCreatorConstraint(def, constraint as Parameters<typeof addCreatorConstraint>[1], visualsFor(def, constraint));
  const created = creatorConstraints(next).at(-1)!;
  if (constraint.type === "foglight" || constraint.type === "fog-trigger") next = syncCreatorFog(next);
  return { def: next, constraintId: created.id };
}

function rebuild(def: PuzzleDefinition, constraint: PuzzleLogicConstraint & { id: string }): PuzzleDefinition {
  const old = constraintById(def, constraint.id);
  if (!old) return def;
  const preserved = { ...clone(constraint), id: old.id, enabled: old.enabled, ignoreInSolver: old.ignoreInSolver } as PuzzleLogicConstraint & { id: string };
  const named = old["data-sphenpad-object-name"];
  if (named !== undefined) preserved["data-sphenpad-object-name"] = named;
  let next = removeCreatorConstraint(def, old.id);
  next = addCreatorConstraint(next, preserved as Parameters<typeof addCreatorConstraint>[1], visualsFor(next, preserved));
  return preserved.type === "foglight" || preserved.type === "fog-trigger" ? syncCreatorFog(next) : next;
}

export function updateCreatorGlobalConstraint(def: PuzzleDefinition, constraintId: string, patch: CreatorGlobalConstraintPatch): PuzzleDefinition {
  const current = constraintById(def, constraintId);
  if (!current || !isCreatorGlobalConstraint(current)) return def;
  const next = clone(current) as PuzzleLogicConstraint & { id: string };
  if (patch.value !== undefined) next.value = patch.value;
  if (patch.groups !== undefined) next.groups = clone(patch.groups);
  if (patch.cells !== undefined) { next.cells = uniqueCells(patch.cells); if (next.type === "outside-clue") next.path = clone(next.cells); }
  if (patch.triggerCells !== undefined) { next.triggerCells = uniqueCells(patch.triggerCells); next.cells = clone(next.triggerCells as CellRC[]); }
  if (patch.effectCells !== undefined) next.effectCells = uniqueCells(patch.effectCells);
  if (next.type === "custom") {
    const definition = clone((next.definition ?? { name: "New constraint", input: [], backend: { type: "code", code: "" }, components: [] }) as Record<string, unknown>);
    const backend = clone((definition.backend ?? { type: "code", code: "" }) as Record<string, unknown>);
    if (patch.definitionName !== undefined) definition.name = patch.definitionName;
    if (patch.code !== undefined) { backend.type = "code"; backend.code = patch.code; definition.backend = backend; }
    if (patch.components !== undefined) definition.components = clone(patch.components);
    if (patch.inputSchema !== undefined) definition.input = clone(patch.inputSchema);
    next.definition = definition;
    if (patch.input !== undefined) next.input = clone(patch.input);
  }
  return rebuild(def, next);
}

export function replaceCreatorGlobalCells(def: PuzzleDefinition, constraintId: string, cells: CellRC[], role: "cells" | "trigger" | "effect" = "cells") {
  return updateCreatorGlobalConstraint(def, constraintId, role === "trigger" ? { triggerCells: cells } : role === "effect" ? { effectCells: cells } : { cells });
}

export function normalizeCreatorGlobalConstraints(def: PuzzleDefinition): PuzzleDefinition {
  let next = def;
  for (const constraint of creatorConstraints(next)) {
    const source = String(constraint.sourceElementId ?? "");
    if (!isCreatorGlobalElementId(source)) continue;
    const desired = semanticType(source);
    if (constraint.type === desired && (desired !== "fog-trigger" || Array.isArray(constraint.effectCells))) continue;
    const replacement = { ...clone(constraint), type: desired } as PuzzleLogicConstraint & { id: string };
    if (desired === "diagonal") { replacement.positive = source === "positive-diagonal"; replacement.cells = diagonalCells(next, replacement.positive === true); }
    if (desired === "global-entropy" && !Array.isArray(replacement.groups)) replacement.groups = defaultGlobalGroups(next, source === "global-modulo-3" ? "modulo" : "entropy");
    if (desired === "fog-trigger") { replacement.triggerCells = clone((replacement.cells ?? []) as CellRC[]); replacement.effectCells = clone((replacement.effectCells ?? replacement.cells ?? []) as CellRC[]); }
    next = rebuild(next, replacement);
  }
  return syncCreatorFog(next);
}

export function validateGlobalConstraintShape(def: PuzzleDefinition, constraint: PuzzleLogicConstraint): string[] {
  const messages: string[] = [], source = String(constraint.sourceElementId ?? constraint.type), cells = (constraint.cells ?? []) as CellRC[];
  if (constraint.type === "outside-clue") {
    if (cells.length < 2) messages.push(`${source} needs a ray of at least two cells.`);
    const step = rayStep(cells);
    if (!step || cells.slice(1).some((cell, index) => cell.r - cells[index].r !== step[0] || cell.c - cells[index].c !== step[1])) messages.push(`${source} cells must form an ordered adjacent ray.`);
    else if (source !== "little-killers" && step[0] !== 0 && step[1] !== 0) messages.push(`${source} must point along a row or column.`);
    else if (source === "little-killers" && Math.abs(step[0]) !== Math.abs(step[1])) messages.push("Little killer must point along a diagonal.");
    const first = cells[0];
    if (first && first.r !== 0 && first.c !== 0 && first.r !== def.rows - 1 && first.c !== def.cols - 1) messages.push(`${source} ray must begin at the board edge.`);
    if (constraint.value === "" || !Number.isFinite(Number(constraint.value))) messages.push(`${source} needs a numeric clue.`);
  }
  if (constraint.type === "indexer" && !cells.length) messages.push(`${source} needs at least one marked cell.`);
  if (constraint.type === "global-entropy") {
    const groups = Array.isArray(constraint.groups) ? (constraint.groups as unknown[]).filter(Array.isArray).map((group) => (group as unknown[]).map(Number)) : [];
    const { min, max } = creatorDigitRange(def), flat = groups.flat();
    if (!groups.length || groups.some((group) => !group.length) || new Set(flat).size !== flat.length || flat.some((digit) => !Number.isInteger(digit) || digit < min || digit > max)) messages.push(`${source} digit groups are invalid or overlap.`);
    const expected = max - min + 1;
    if (new Set(flat).size !== expected) messages.push(`${source} digit groups must cover the full digit range.`);
  }
  if (constraint.type === "foglight" && !cells.length) messages.push("Fog lights need at least one cell.");
  if (constraint.type === "fog-trigger") {
    if (!Array.isArray(constraint.triggerCells) || !(constraint.triggerCells as unknown[]).length) messages.push("Fog trigger needs at least one trigger cell.");
    if (!Array.isArray(constraint.effectCells) || !(constraint.effectCells as unknown[]).length) messages.push("Fog trigger needs at least one cell to reveal.");
  }
  if (constraint.type === "custom") {
    const definition = constraint.definition as Record<string, unknown> | undefined, backend = definition?.backend as Record<string, unknown> | undefined;
    if (!definition || typeof definition.name !== "string" || !definition.name.trim()) messages.push("Custom constraint needs a name.");
    if (!backend || backend.type !== "code" || typeof backend.code !== "string") messages.push("Custom constraint has invalid backend code data.");
  }
  return messages;
}

export function creatorOutsideRayFromSelection(def: PuzzleDefinition, elementId: CreatorGlobalElementId, cells: CellRC[]) {
  const selected = uniqueCells(cells).filter((cell) => inBounds(cell, def));
  if (selected.length === 1 && elementId !== "little-killers") return orthogonalRay(def, selected[0]) ?? selected;
  return selected;
}
