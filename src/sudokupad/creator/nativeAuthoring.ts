import type { CellRC, PuzzleDefinition, PuzzleMeta } from "../../core/model";
import type { PuzzleLogic, PuzzleLogicConstraint } from "../types/logic";
import type { SudokuPadScene } from "../types/scene";
import { DEFAULT_SUDOKUPAD_RENDER_SETTINGS } from "../types/settings";
import type { SudokuPadPoint, SudokuPadSourceArrow, SudokuPadSourceCage, SudokuPadSourceGraphic, SudokuPadSourceLine } from "../types/source";
import { SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION, SPHENPAD_SUDOKUPAD_SCENE_VERSION } from "../version";
import { creatorProjectFromDefinition, definitionFromCreatorProject, parseCreatorProject, type CreatorProject } from "./project";

export const SPHENPAD_AUTHORED_FILE_FORMAT = "sphenpad" as const;
export const SPHENPAD_AUTHORED_FILE_VERSION = 4 as const;

export interface SphenPadAuthoredPuzzleFileV3 {
  format: typeof SPHENPAD_AUTHORED_FILE_FORMAT;
  version: 3;
  rows: number;
  cols: number;
  meta: PuzzleMeta;
  givens: PuzzleDefinition["givens"];
  scene: SudokuPadScene;
  logic: PuzzleLogic;
}
export interface SphenPadAuthoredPuzzleFileV4 {
  format: typeof SPHENPAD_AUTHORED_FILE_FORMAT;
  version: typeof SPHENPAD_AUTHORED_FILE_VERSION;
  project: CreatorProject;
}
export type SphenPadAuthoredPuzzleFile = SphenPadAuthoredPuzzleFileV3 | SphenPadAuthoredPuzzleFileV4;

export interface CreatorConstraint extends PuzzleLogicConstraint {
  id: string;
  sourceElementId?: string;
  cells?: CellRC[];
  path?: CellRC[];
  kind?: string;
}

const TAG_ELEMENT = "data-sphenpad-element";
const TAG_CONSTRAINT = "data-sphenpad-constraint";

function point(cell: CellRC): SudokuPadPoint { return [cell.r, cell.c]; }
function clone<T>(value: T): T { return value == null ? value : JSON.parse(JSON.stringify(value)) as T; }
function id(prefix = "constraint"): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
}

function regularRegionCells(rows: number, cols: number, subgrid?: { r: number; c: number }): CellRC[][] {
  if (!subgrid || subgrid.r < 1 || subgrid.c < 1) return [];
  const regions: CellRC[][] = [];
  for (let r = 0; r < rows; r += subgrid.r) {
    for (let c = 0; c < cols; c += subgrid.c) {
      const cells: CellRC[] = [];
      for (let dr = 0; dr < subgrid.r; dr += 1) for (let dc = 0; dc < subgrid.c; dc += 1) {
        if (r + dr < rows && c + dc < cols) cells.push({ r: r + dr, c: c + dc });
      }
      if (cells.length) regions.push(cells);
    }
  }
  return regions;
}

function sceneRegions(regions: CellRC[][]): SudokuPadSourceCage[] {
  return regions.map((cells) => ({ cells: cells.map(point), style: "box", type: "region", unique: true }));
}

export function createAuthoredScene(rows: number, cols: number, regions: CellRC[][] = []): SudokuPadScene {
  return {
    version: SPHENPAD_SUDOKUPAD_SCENE_VERSION,
    rows,
    cols,
    cells: Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => ({ row, col }))),
    regions: sceneRegions(regions),
    cages: [],
    lines: [],
    arrows: [],
    underlays: [],
    overlays: [],
    metadata: {},
    renderSettings: { ...DEFAULT_SUDOKUPAD_RENDER_SETTINGS },
    unknown: {},
  };
}

export function createAuthoredPuzzleDefinition(options: {
  id: string;
  rows: number;
  cols: number;
  meta: PuzzleMeta;
  subgrid?: { r: number; c: number };
  digitRange?: { min: number; max: number };
}): PuzzleDefinition {
  const regions = regularRegionCells(options.rows, options.cols, options.subgrid);
  const scene = createAuthoredScene(options.rows, options.cols, regions);
  const logic: PuzzleLogic = { regions: clone(regions), constraints: [] };
  return {
    schemaVersion: SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION,
    id: options.id,
    sourceId: options.id,
    size: Math.max(options.rows, options.cols),
    rows: options.rows,
    cols: options.cols,
    meta: {
      ...options.meta,
      creatorPuzzle: true,
      ...(options.digitRange ? { creatorDigitRange: { min: options.digitRange.min, max: options.digitRange.max } } : {}),
      creatorRegionMode: options.subgrid ? "regular" : (options.meta.creatorRegionMode ?? "none"),
      ...(options.subgrid ? { creatorBoxSize: { rows: options.subgrid.r, cols: options.subgrid.c } } : {}),
    },
    givens: [],
    scene,
    logic,
  };
}

export function syncDefinitionGivens(def: PuzzleDefinition): PuzzleDefinition {
  if (!def.scene) return def;
  const byCell = new Map(def.givens.map((given) => [`${given.rc.r}:${given.rc.c}`, String(given.v)]));
  const cells = def.scene.cells.map((row, r) => row.map((cell, c) => {
    const given = byCell.get(`${r}:${c}`);
    const next = { ...cell };
    if (given === undefined) delete next.given;
    else next.given = given;
    return next;
  }));
  return { ...def, scene: { ...def.scene, cells } };
}

function tagged<T extends Record<string, unknown>>(part: T, elementId: string, constraintId?: string): T {
  return {
    ...part,
    [TAG_ELEMENT]: elementId,
    ...(constraintId ? { [TAG_CONSTRAINT]: constraintId } : {}),
  };
}

export function creatorPartElement(part: Record<string, unknown>): string | undefined {
  const value = part[TAG_ELEMENT];
  return typeof value === "string" ? value : undefined;
}

export function creatorPartConstraint(part: Record<string, unknown>): string | undefined {
  const value = part[TAG_CONSTRAINT];
  return typeof value === "string" ? value : undefined;
}

export function creatorConstraints(def: PuzzleDefinition): CreatorConstraint[] {
  return (def.logic?.constraints ?? []).filter((entry): entry is CreatorConstraint => typeof entry.id === "string");
}

export function addCreatorConstraint(
  def: PuzzleDefinition,
  input: { type: string; id?: string; sourceElementId?: string; cells?: CellRC[]; path?: CellRC[]; kind?: string; value?: string | number; [key: string]: unknown },
  visual?: { lines?: SudokuPadSourceLine[]; arrows?: SudokuPadSourceArrow[]; cages?: SudokuPadSourceCage[]; underlays?: SudokuPadSourceGraphic[]; overlays?: SudokuPadSourceGraphic[] },
): PuzzleDefinition {
  if (!def.scene) return def;
  const constraintId = input.id ?? id(input.type || "constraint");
  const constraint: CreatorConstraint = { ...clone(input), id: constraintId } as CreatorConstraint;
  const elementId = input.sourceElementId ?? input.type;
  const scene = {
    ...def.scene,
    lines: [...def.scene.lines, ...(visual?.lines ?? []).map((item) => tagged(item, elementId, constraintId))],
    arrows: [...def.scene.arrows, ...(visual?.arrows ?? []).map((item) => tagged(item, elementId, constraintId))],
    cages: [...def.scene.cages, ...(visual?.cages ?? []).map((item) => tagged(item, elementId, constraintId))],
    underlays: [...def.scene.underlays, ...(visual?.underlays ?? []).map((item) => tagged(item, elementId, constraintId))],
    overlays: [...def.scene.overlays, ...(visual?.overlays ?? []).map((item) => tagged(item, elementId, constraintId))],
  };
  const logic: PuzzleLogic = { ...(def.logic ?? {}), constraints: [...(def.logic?.constraints ?? []), constraint] };
  return { ...def, scene, logic };
}

export function removeCreatorConstraint(def: PuzzleDefinition, constraintId: string): PuzzleDefinition {
  if (!def.scene) return def;
  const keep = (part: Record<string, unknown>) => creatorPartConstraint(part) !== constraintId;
  return {
    ...def,
    scene: {
      ...def.scene,
      lines: def.scene.lines.filter(keep),
      arrows: def.scene.arrows.filter(keep),
      cages: def.scene.cages.filter(keep),
      underlays: def.scene.underlays.filter(keep),
      overlays: def.scene.overlays.filter(keep),
    },
    logic: { ...(def.logic ?? {}), constraints: (def.logic?.constraints ?? []).filter((entry) => entry.id !== constraintId) },
  };
}

export function removeCreatorElementVisuals(def: PuzzleDefinition, elementId: string): PuzzleDefinition {
  if (!def.scene) return def;
  const keep = (part: Record<string, unknown>) => creatorPartElement(part) !== elementId;
  return {
    ...def,
    scene: {
      ...def.scene,
      lines: def.scene.lines.filter(keep),
      arrows: def.scene.arrows.filter(keep),
      cages: def.scene.cages.filter(keep),
      underlays: def.scene.underlays.filter(keep),
      overlays: def.scene.overlays.filter(keep),
    },
    logic: {
      ...(def.logic ?? {}),
      constraints: (def.logic?.constraints ?? []).filter((entry) => entry.sourceElementId !== elementId),
    },
  };
}

export function setCreatorRegions(def: PuzzleDefinition, regions: Array<{ cells: CellRC[]; label?: string }>): PuzzleDefinition {
  if (!def.scene) return def;
  return {
    ...def,
    scene: { ...def.scene, regions: sceneRegions(regions.map((region) => region.cells)) },
    logic: {
      ...(def.logic ?? {}),
      regions: regions.map((region) => clone(region.cells)),
      creatorRegionLabels: regions.map((region, index) => region.label ?? String(index + 1)),
    },
  };
}

export function getCreatorRegions(def: PuzzleDefinition): Array<{ cells: CellRC[]; label?: string }> {
  const regions = def.logic?.regions ?? def.scene?.regions.map((region) => region.cells.map(([r, c]) => ({ r, c }))) ?? [];
  const labels = Array.isArray(def.logic?.creatorRegionLabels) ? def.logic.creatorRegionLabels as string[] : [];
  return regions.map((cells, index) => ({ cells: clone(cells), label: labels[index] ?? String(index + 1) }));
}


export function syncCreatorMetadata(def: PuzzleDefinition): PuzzleDefinition {
  if (!def.scene) return def;
  const metadata = {
    ...def.scene.metadata,
    title: def.meta.title,
    author: def.meta.author,
    rules: def.meta.rules,
    msgcorrect: def.meta.postSolveMessage,
    ...(def.logic?.solution ? { solution: def.logic.solution } : {}),
  };
  return { ...def, scene: { ...def.scene, metadata } };
}
export function setCreatorSolution(def: PuzzleDefinition, solution?: string): PuzzleDefinition {
  const metadata = def.scene ? { ...def.scene.metadata } : undefined;
  if (metadata) {
    if (solution) metadata.solution = solution;
    else delete metadata.solution;
  }
  return {
    ...def,
    ...(def.scene ? { scene: { ...def.scene, metadata: metadata! } } : {}),
    logic: { ...(def.logic ?? {}), solution: solution || undefined },
  };
}

export function setCreatorGlobalRule(def: PuzzleDefinition, rule: "antiKnight" | "antiKing" | "antiRook", enabled: boolean): PuzzleDefinition {
  return { ...def, logic: { ...(def.logic ?? {}), [rule]: enabled } };
}

export function authoredPuzzleFile(def: PuzzleDefinition): SphenPadAuthoredPuzzleFileV4 {
  return { format: SPHENPAD_AUTHORED_FILE_FORMAT, version: SPHENPAD_AUTHORED_FILE_VERSION, project: creatorProjectFromDefinition(def) };
}

export function definitionFromAuthoredPuzzleFile(file: SphenPadAuthoredPuzzleFile, identity: { id: string; sourceId: string }): PuzzleDefinition {
  if (!file || file.format !== SPHENPAD_AUTHORED_FILE_FORMAT) throw new Error("Unsupported SphenPad authored puzzle format");
  if (file.version === SPHENPAD_AUTHORED_FILE_VERSION) return definitionFromCreatorProject(parseCreatorProject(file.project), identity);
  if (file.version !== 3) throw new Error("Unsupported SphenPad authored puzzle format");
  const legacy = syncDefinitionGivens({
    schemaVersion: SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION, id: identity.id, sourceId: identity.sourceId, size: Math.max(file.rows, file.cols), rows: file.rows, cols: file.cols,
    meta: { ...clone(file.meta), creatorPuzzle: true }, givens: clone(file.givens), scene: clone(file.scene), logic: clone(file.logic),
  });
  return definitionFromCreatorProject(creatorProjectFromDefinition(legacy), identity);
}
