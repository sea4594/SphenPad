import type { CellRC, PuzzleDefinition } from "../../core/model";
import type { PuzzleLogicConstraint } from "../types/logic";
import type { SudokuPadSourceArrow, SudokuPadSourceGraphic, SudokuPadSourceLine } from "../types/source";
import { creatorDigitCount, creatorDigitRange } from "./gridStructure";
import { addCreatorConstraint, creatorConstraints, creatorPartConstraint } from "./nativeAuthoring";

const TAG_ELEMENT = "data-sphenpad-element";
const TAG_CONSTRAINT = "data-sphenpad-constraint";

export const CREATOR_LINE_ELEMENT_IDS = [
  "thermometers", "slow-thermometers", "renban-lines", "german-whispers", "dutch-whispers", "palindromes",
  "between-lines", "region-sum-lines", "sequence-lines", "entropic-lines", "3-modular-lines", "parity-lines",
  "lockout-lines", "arrows", "double-arrows",
] as const;
export type CreatorLineElementId = typeof CREATOR_LINE_ELEMENT_IDS[number];
export type CreatorLineVisuals = { lines?: SudokuPadSourceLine[]; arrows?: SudokuPadSourceArrow[]; underlays?: SudokuPadSourceGraphic[]; overlays?: SudokuPadSourceGraphic[] };
export type CreatorLineConstraintPatch = {
  slow?: boolean;
  minDifference?: number;
  singleRegionTotals?: boolean;
  groups?: number[][];
  bulbCellCount?: number;
  sourceElementId?: CreatorLineElementId;
};

const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
function id(prefix: string) {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
}
function centers(cells: CellRC[]): [number, number][] { return cells.map((cell) => [cell.r + 0.5, cell.c + 0.5]); }
function tagged<T extends Record<string, unknown>>(part: T, elementId: string, constraintId: string): T { return { ...part, [TAG_ELEMENT]: elementId, [TAG_CONSTRAINT]: constraintId }; }
export function isCreatorLineElementId(value: string | undefined): value is CreatorLineElementId { return CREATOR_LINE_ELEMENT_IDS.includes(value as CreatorLineElementId); }
export function isCreatorLineConstraint(constraint: PuzzleLogicConstraint | undefined): boolean {
  if (!constraint) return false;
  return ["thermometer", "whisper", "renban", "palindrome", "between-line", "region-sum-line", "sequence-line", "entropy-line", "lockout-line", "arrow", "double-arrow"].includes(constraint.type);
}

const LINE_SEMANTIC_TYPES: Record<CreatorLineElementId, string> = {
  "thermometers": "thermometer",
  "slow-thermometers": "thermometer",
  "renban-lines": "renban",
  "german-whispers": "whisper",
  "dutch-whispers": "whisper",
  "palindromes": "palindrome",
  "between-lines": "between-line",
  "region-sum-lines": "region-sum-line",
  "sequence-lines": "sequence-line",
  "entropic-lines": "entropy-line",
  "3-modular-lines": "entropy-line",
  "parity-lines": "entropy-line",
  "lockout-lines": "lockout-line",
  "arrows": "arrow",
  "double-arrows": "double-arrow",
};

/** Normalizes Phase 10D/11D generic line records into the Phase 11E semantic shape. */
export function normalizeCreatorLineConstraints(def: PuzzleDefinition): PuzzleDefinition {
  const constraints = (def.logic?.constraints ?? []).map((constraint) => {
    const legacyId = isCreatorLineElementId(constraint.type) ? constraint.type : undefined;
    const sourceElementId = isCreatorLineElementId(constraint.sourceElementId as string | undefined)
      ? constraint.sourceElementId as CreatorLineElementId
      : legacyId;
    const semanticType = legacyId ? LINE_SEMANTIC_TYPES[legacyId] : constraint.type;
    if (!sourceElementId || !isCreatorLineElementId(sourceElementId)) return constraint;
    const next: PuzzleLogicConstraint = { ...constraint, type: semanticType, sourceElementId };
    if (sourceElementId === "slow-thermometers") next.slow = constraint.slow ?? true;
    if (sourceElementId === "thermometers") next.slow = constraint.slow ?? false;
    if (sourceElementId === "german-whispers") next.minDifference = Number(constraint.minDifference ?? germanWhisperDifference(def));
    if (sourceElementId === "dutch-whispers") next.minDifference = Number(constraint.minDifference ?? dutchWhisperDifference(def));
    if (sourceElementId === "region-sum-lines") next.singleRegionTotals = constraint.singleRegionTotals ?? false;
    if (sourceElementId === "entropic-lines") next.groups = constraint.groups ?? defaultCreatorDigitGroups(def, "entropy");
    if (sourceElementId === "3-modular-lines") next.groups = constraint.groups ?? defaultCreatorDigitGroups(def, "mod3");
    if (sourceElementId === "parity-lines") next.groups = constraint.groups ?? defaultCreatorDigitGroups(def, "parity");
    if (sourceElementId === "lockout-lines") next.minDifference = Number(constraint.minDifference ?? lockoutMinimumDifference(def));
    if (sourceElementId === "arrows") {
      const cells = (constraint.path ?? constraint.cells ?? []) as CellRC[];
      next.bulbCellCount = Math.max(1, Math.min(Math.max(1, cells.length - 1), Math.trunc(Number(constraint.bulbCellCount ?? 1))));
    }
    return next;
  });
  return { ...def, logic: { ...(def.logic ?? {}), constraints } };
}

export function germanWhisperDifference(def: PuzzleDefinition) { return Math.max(1, Math.floor((creatorDigitCount(def) + 1) / 2)); }
export function dutchWhisperDifference(def: PuzzleDefinition) { return Math.max(1, Math.floor((creatorDigitCount(def) - 1) / 2)); }
export function lockoutMinimumDifference(def: PuzzleDefinition) { return Math.max(1, Math.floor(creatorDigitCount(def) / 2)); }

export function defaultCreatorDigitGroups(def: PuzzleDefinition, variant: "entropy" | "mod3" | "parity"): number[][] {
  const { min, max } = creatorDigitRange(def);
  const digits = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  if (variant === "parity") return [digits.filter((digit) => digit % 2 === 1), digits.filter((digit) => digit % 2 === 0)].filter((group) => group.length);
  if (variant === "mod3") return [0, 1, 2].map((remainder) => digits.filter((digit) => ((digit % 3) + 3) % 3 === remainder)).filter((group) => group.length);
  const count = digits.length;
  if (count === 6) return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
  if (count === 7) return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7)];
  if (count === 8) return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6), digits.slice(6, 8)];
  if (count === 9) return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)];
  return defaultCreatorDigitGroups(def, "mod3");
}

export function formatCreatorDigitGroups(groups: unknown): string {
  if (!Array.isArray(groups)) return "";
  return groups.filter(Array.isArray).map((group) => (group as unknown[]).map(Number).filter(Number.isFinite).join(",")).filter(Boolean).join(" | ");
}
export function parseCreatorDigitGroups(text: string, def: PuzzleDefinition): number[][] | null {
  const { min, max } = creatorDigitRange(def);
  const groups = text.split("|").map((part) => part.split(/[\s,]+/).filter(Boolean).map(Number));
  if (groups.length < 2 || groups.some((group) => !group.length || group.some((digit) => !Number.isInteger(digit) || digit < min || digit > max))) return null;
  const flat = groups.flat();
  if (new Set(flat).size !== flat.length) return null;
  return groups;
}

function lineVisuals(elementId: CreatorLineElementId, cells: CellRC[], input?: CreatorLineConstraintPatch): CreatorLineVisuals {
  const points = centers(cells), gray = "#aaaaaa";
  if (elementId === "thermometers" || elementId === "slow-thermometers") return {
    lines: [{ wayPoints: points, color: "#a1a1a1", thickness: 12 }],
    underlays: [{ center: points[0], width: 0.8, height: 0.8, rounded: true, borderColor: "#a1a1a1", backgroundColor: "#a1a1a1" }],
  };
  if (elementId === "renban-lines") return { lines: [{ wayPoints: points, color: "#d27ae8", thickness: 7 }] };
  if (elementId === "german-whispers") return { lines: [{ wayPoints: points, color: "#55b36a", thickness: 7 }] };
  if (elementId === "dutch-whispers") return { lines: [{ wayPoints: points, color: "#63c7b2", thickness: 7 }] };
  if (elementId === "palindromes") return { lines: [{ wayPoints: points, color: "#cfcfcf", thickness: 12 }] };
  if (elementId === "between-lines") return {
    lines: [{ wayPoints: points, color: gray, thickness: 6 }],
    underlays: [points[0], points[points.length - 1]].map((center) => ({ center, width: 0.8, height: 0.8, rounded: true, backgroundColor: "rgba(255,255,255,0.5)", borderColor: gray, borderSize: 1.5 })),
  };
  if (elementId === "region-sum-lines") return { lines: [{ wayPoints: points, color: "#6c83c8", thickness: 7 }] };
  if (elementId === "sequence-lines") return { lines: [{ wayPoints: points, color: "#5c9da5", thickness: 7 }] };
  if (elementId === "entropic-lines") return { lines: [{ wayPoints: points, color: "#e777a6", thickness: 7 }] };
  if (elementId === "3-modular-lines") return { lines: [{ wayPoints: points, color: "#e6a32d", thickness: 7 }] };
  if (elementId === "parity-lines") return { lines: [{ wayPoints: points, color: "#ff6666", thickness: 7 }] };
  if (elementId === "lockout-lines") return {
    lines: [{ wayPoints: points, color: "#aabeeF", thickness: 6 }],
    underlays: [points[0], points[points.length - 1]].map((center) => ({ center, width: 0.8, height: 0.8, rounded: false, angle: 45, backgroundColor: "rgba(231,230,255,0.5)", borderColor: "rgba(0,0,255,0.5)", borderSize: 2 })),
  };
  if (elementId === "arrows") {
    const bulbCount = Math.max(1, Math.min(cells.length - 1, Math.trunc(input?.bulbCellCount ?? 1)));
    const arrowPoints = points.slice(Math.max(0, bulbCount - 1));
    return {
      arrows: [{ wayPoints: arrowPoints, color: gray, headLength: 0.3, thickness: 5 }],
      overlays: points.slice(0, bulbCount).map((center) => ({ center, width: 0.8, height: 0.8, rounded: true, backgroundColor: "#ffffff", borderColor: gray, borderSize: 2 })),
    };
  }
  if (elementId === "double-arrows") return {
    lines: [{ wayPoints: points, color: gray, thickness: 5 }],
    underlays: [points[0], points[points.length - 1]].map((center) => ({ center, width: 0.8, height: 0.8, rounded: true, backgroundColor: "#ffffff", borderColor: gray, borderSize: 1.5 })),
  };
  return { lines: [{ wayPoints: points, color: gray, thickness: 6 }] };
}

function lineLogic(def: PuzzleDefinition, elementId: CreatorLineElementId, cells: CellRC[], patch?: CreatorLineConstraintPatch): PuzzleLogicConstraint {
  const base = { cells: clone(cells), path: clone(cells), sourceElementId: elementId };
  switch (elementId) {
    case "thermometers": return { ...base, type: "thermometer", slow: patch?.slow ?? false };
    case "slow-thermometers": return { ...base, type: "thermometer", slow: patch?.slow ?? true };
    case "german-whispers": return { ...base, type: "whisper", minDifference: patch?.minDifference ?? germanWhisperDifference(def) };
    case "dutch-whispers": return { ...base, type: "whisper", minDifference: patch?.minDifference ?? dutchWhisperDifference(def) };
    case "renban-lines": return { ...base, type: "renban" };
    case "palindromes": return { ...base, type: "palindrome" };
    case "between-lines": return { ...base, type: "between-line" };
    case "region-sum-lines": return { ...base, type: "region-sum-line", singleRegionTotals: patch?.singleRegionTotals ?? false };
    case "sequence-lines": return { ...base, type: "sequence-line" };
    case "entropic-lines": return { ...base, type: "entropy-line", groups: patch?.groups ?? defaultCreatorDigitGroups(def, "entropy") };
    case "3-modular-lines": return { ...base, type: "entropy-line", groups: patch?.groups ?? defaultCreatorDigitGroups(def, "mod3") };
    case "parity-lines": return { ...base, type: "entropy-line", groups: patch?.groups ?? defaultCreatorDigitGroups(def, "parity") };
    case "lockout-lines": return { ...base, type: "lockout-line", minDifference: lockoutMinimumDifference(def) };
    case "arrows": return { ...base, type: "arrow", bulbCellCount: Math.max(1, Math.min(cells.length - 1, Math.trunc(patch?.bulbCellCount ?? 1))) };
    case "double-arrows": return { ...base, type: "double-arrow" };
    default: throw new Error(`Unsupported line element: ${elementId}`);
  }
}

export function addCreatorLineConstraint(def: PuzzleDefinition, elementId: CreatorLineElementId, cells: CellRC[], patch?: CreatorLineConstraintPatch): { def: PuzzleDefinition; constraintId: string } {
  if (cells.length < 2) throw new Error("Line constraints need at least two cells");
  const constraintId = id(elementId.replace(/s$/, ""));
  const logic = lineLogic(def, elementId, cells, patch);
  return { def: addCreatorConstraint(def, { ...logic, id: constraintId }, lineVisuals(elementId, cells, patch)), constraintId };
}

function mapConstraintParts<T extends Record<string, unknown>>(parts: T[], constraintId: string, mapper: (part: T, index: number) => T): T[] {
  let index = 0;
  return parts.map((part) => creatorPartConstraint(part) === constraintId ? mapper(part, index++) : part);
}

function retagElement<T extends Record<string, unknown>>(parts: T[], constraintId: string, elementId: string): T[] {
  return mapConstraintParts(parts, constraintId, (part) => ({ ...part, [TAG_ELEMENT]: elementId }));
}

export function updateCreatorLineConstraint(def: PuzzleDefinition, constraintId: string, patch: CreatorLineConstraintPatch): PuzzleDefinition {
  const current = creatorConstraints(def).find((constraint) => constraint.id === constraintId);
  if (!current || !isCreatorLineConstraint(current)) return def;
  let sourceElementId = patch.sourceElementId ?? (current.sourceElementId as CreatorLineElementId | undefined);
  const nextPatch: Record<string, unknown> = { ...patch };
  if (current.type === "thermometer" && patch.slow !== undefined && patch.sourceElementId === undefined) sourceElementId = patch.slow ? "slow-thermometers" : "thermometers";
  if (current.type === "whisper" && sourceElementId && patch.minDifference === undefined) {
    if (sourceElementId === "german-whispers") nextPatch.minDifference = germanWhisperDifference(def);
    if (sourceElementId === "dutch-whispers") nextPatch.minDifference = dutchWhisperDifference(def);
  }
  const constraints = (def.logic?.constraints ?? []).map((constraint) => constraint.id === constraintId ? { ...constraint, ...nextPatch, ...(sourceElementId ? { sourceElementId } : {}) } : constraint);
  let next: PuzzleDefinition = { ...def, logic: { ...(def.logic ?? {}), constraints } };
  if (next.scene && sourceElementId) next = { ...next, scene: {
    ...next.scene,
    lines: retagElement(next.scene.lines, constraintId, sourceElementId), arrows: retagElement(next.scene.arrows, constraintId, sourceElementId), cages: retagElement(next.scene.cages, constraintId, sourceElementId),
    underlays: retagElement(next.scene.underlays, constraintId, sourceElementId), overlays: retagElement(next.scene.overlays, constraintId, sourceElementId),
  } };
  if (current.type === "arrow" && patch.bulbCellCount !== undefined) return replaceCreatorLinePath(next, constraintId, (current.path ?? current.cells ?? []) as CellRC[]);
  return next;
}

function preserveLineStyle<T extends Record<string, unknown>>(fresh: T, old?: Record<string, unknown>): T {
  if (!old) return fresh;
  const keys = ["color", "thickness", "opacity", "target", "backgroundColor", "borderColor", "borderSize", "width", "height", "rounded", "angle", "fontSize", "textColor"];
  const copy = { ...fresh } as Record<string, unknown>;
  for (const key of keys) if (old[key] !== undefined && copy[key] !== undefined) copy[key] = old[key];
  return copy as T;
}

export function replaceCreatorLinePath(def: PuzzleDefinition, constraintId: string, cells: CellRC[]): PuzzleDefinition {
  if (cells.length < 2 || !def.scene) return def;
  const current = creatorConstraints(def).find((constraint) => constraint.id === constraintId);
  if (!current || !isCreatorLineConstraint(current) || !isCreatorLineElementId(current.sourceElementId)) return def;
  const elementId = current.sourceElementId;
  const visual = lineVisuals(elementId, cells, { bulbCellCount: Number(current.bulbCellCount ?? 1) });
  const old = {
    lines: def.scene.lines.filter((part) => creatorPartConstraint(part as Record<string, unknown>) === constraintId),
    arrows: def.scene.arrows.filter((part) => creatorPartConstraint(part as Record<string, unknown>) === constraintId),
    underlays: def.scene.underlays.filter((part) => creatorPartConstraint(part as Record<string, unknown>) === constraintId),
    overlays: def.scene.overlays.filter((part) => creatorPartConstraint(part as Record<string, unknown>) === constraintId),
  };
  const keep = <T extends Record<string, unknown>>(part: T) => creatorPartConstraint(part) !== constraintId;
  const add = <T extends Record<string, unknown>>(items: T[] | undefined, oldItems: Record<string, unknown>[]) => (items ?? []).map((part, index) => tagged(preserveLineStyle(part, oldItems[Math.min(index, oldItems.length - 1)]), elementId, constraintId));
  return {
    ...def,
    scene: {
      ...def.scene,
      lines: [...def.scene.lines.filter((part) => keep(part as Record<string, unknown>)), ...add(visual.lines, old.lines)],
      arrows: [...def.scene.arrows.filter((part) => keep(part as Record<string, unknown>)), ...add(visual.arrows, old.arrows)],
      underlays: [...def.scene.underlays.filter((part) => keep(part as Record<string, unknown>)), ...add(visual.underlays, old.underlays)],
      overlays: [...def.scene.overlays.filter((part) => keep(part as Record<string, unknown>)), ...add(visual.overlays, old.overlays)],
    },
    logic: { ...(def.logic ?? {}), constraints: (def.logic?.constraints ?? []).map((constraint) => constraint.id === constraintId ? { ...constraint, cells: clone(cells), path: clone(cells), ...(constraint.type === "arrow" ? { bulbCellCount: Math.max(1, Math.min(cells.length - 1, Math.trunc(Number(constraint.bulbCellCount ?? 1)))) } : {}) } : constraint) },
  };
}

export function reverseCreatorLinePath(def: PuzzleDefinition, constraintId: string): PuzzleDefinition {
  const constraint = creatorConstraints(def).find((entry) => entry.id === constraintId);
  const cells = (constraint?.path ?? constraint?.cells ?? []) as CellRC[];
  return replaceCreatorLinePath(def, constraintId, [...cells].reverse());
}
