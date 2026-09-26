import type { CellRC, PuzzleDefinition, PuzzleMeta } from "../../core/model";
import type { PuzzleLogicConstraint } from "../types/logic";
import type { SudokuPadSceneCell } from "../types/scene";
import { DEFAULT_SUDOKUPAD_RENDER_SETTINGS } from "../types/settings";
import type { SudokuPadRenderSettings } from "../types/settings";
import type { SudokuPadMetadata, SudokuPadSourceArrow, SudokuPadSourceCage, SudokuPadSourceGraphic, SudokuPadSourceLine } from "../types/source";
import { SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION, SPHENPAD_SUDOKUPAD_SCENE_VERSION } from "../version";

export const SPHENPAD_CREATOR_PROJECT_FORMAT = "sphenpad-creator-project" as const;
export const SPHENPAD_CREATOR_PROJECT_VERSION = 1 as const;
const TAG_ELEMENT = "data-sphenpad-element";
const TAG_CONSTRAINT = "data-sphenpad-constraint";

export type CreatorProjectVisual<T> = { order: number; value: T };
export type CreatorProjectVisuals = {
  lines: CreatorProjectVisual<SudokuPadSourceLine>[];
  arrows: CreatorProjectVisual<SudokuPadSourceArrow>[];
  cages: CreatorProjectVisual<SudokuPadSourceCage>[];
  underlays: CreatorProjectVisual<SudokuPadSourceGraphic>[];
  overlays: CreatorProjectVisual<SudokuPadSourceGraphic>[];
};
export type CreatorProjectConstraint = {
  id: string;
  type: string;
  sourceElementId?: string;
  logic: PuzzleLogicConstraint;
  visuals: CreatorProjectVisuals;
};
export type CreatorProjectRegion = { id: string; label?: string; cells: CellRC[] };
export type CreatorProjectCellExtra = { rc: CellRC; data: Omit<SudokuPadSceneCell, "row" | "col" | "given"> };
export type CreatorProject = {
  format: typeof SPHENPAD_CREATOR_PROJECT_FORMAT;
  version: typeof SPHENPAD_CREATOR_PROJECT_VERSION;
  projectId: string;
  sourceId: string;
  grid: { rows: number; cols: number; digits: { min: number; max: number; custom: boolean }; regions?: { mode: "none" | "regular" | "irregular"; boxRows?: number; boxCols?: number } };
  metadata: { title: string; author: string; rules: string; postSolveMessage: string; collection?: string; extra: Record<string, unknown> };
  givens: Array<{ rc: CellRC; value: string }>;
  solution?: string;
  solutionEntries?: Array<{ rc: CellRC; value: string }>;
  regions: CreatorProjectRegion[];
  constraints: CreatorProjectConstraint[];
  cosmetics: CreatorProjectVisuals;
  settings: {
    activeElementIds: string[];
    elementNames: Record<string, string>;
    constraintChecks: Record<string, boolean>;
    renderSettings: SudokuPadRenderSettings;
    solver?: { maxSolutions?: number; maxNodes?: number; logicalStepLimit?: number };
    publishedToMyPuzzles?: boolean;
    semantic: { antiKnight?: boolean; antiKing?: boolean; antiRook?: boolean; sudokuRules?: boolean; global?: string[]; conflictChecker?: boolean };
  };
  compatibility: {
    cellExtras: CreatorProjectCellExtra[];
    scenePuzzleId?: string;
    sceneFog?: NonNullable<PuzzleDefinition["scene"]>["fog"];
    sceneGlobal?: string[];
    sceneUnknown: Record<string, unknown>;
    sceneMetadataExtra: SudokuPadMetadata;
    logicExtra: Record<string, unknown>;
  };
};

const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
const partConstraint = (part: Record<string, unknown>) => typeof part[TAG_CONSTRAINT] === "string" ? part[TAG_CONSTRAINT] as string : undefined;
const tagged = <T extends Record<string, unknown>>(part: T, elementId: string, constraintId: string): T => ({ ...part, [TAG_ELEMENT]: elementId, [TAG_CONSTRAINT]: constraintId });

function splitVisuals<T extends Record<string, unknown>>(items: T[], constraintIds: Set<string>) {
  const byConstraint = new Map<string, CreatorProjectVisual<T>[]>();
  const cosmetics: CreatorProjectVisual<T>[] = [];
  items.forEach((item, order) => {
    const id = partConstraint(item);
    if (id && constraintIds.has(id)) {
      const current = byConstraint.get(id) ?? [];
      current.push({ order, value: clone(item) });
      byConstraint.set(id, current);
    } else cosmetics.push({ order, value: clone(item) });
  });
  return { byConstraint, cosmetics };
}

function mergeVisuals<T>(cosmetics: CreatorProjectVisual<T>[], constraints: CreatorProjectConstraint[], key: keyof CreatorProjectVisuals): T[] {
  const all: CreatorProjectVisual<T>[] = [...cosmetics];
  for (const constraint of constraints) all.push(...constraint.visuals[key] as CreatorProjectVisual<T>[]);
  return all.sort((a, b) => a.order - b.order).map((entry) => clone(entry.value));
}

function omitKeys(input: Record<string, unknown>, keys: string[]) {
  const output = { ...input };
  keys.forEach((key) => delete output[key]);
  return output;
}

function detectRegularBox(rows: number, cols: number, regions: CreatorProjectRegion[]) {
  if (!regions.length || !regions[0].cells.length) return undefined;
  const first = regions[0].cells, rs = first.map((cell) => cell.r), cs = first.map((cell) => cell.c);
  const boxRows = Math.max(...rs) - Math.min(...rs) + 1, boxCols = Math.max(...cs) - Math.min(...cs) + 1;
  if (boxRows * boxCols !== first.length || rows % boxRows || cols % boxCols) return undefined;
  const norm = (cells: CellRC[]) => cells.map((cell) => `${cell.r}:${cell.c}`).sort().join("|");
  const actual = new Set(regions.map((region) => norm(region.cells)));
  const expected: string[] = [];
  for (let r = 0; r < rows; r += boxRows) for (let c = 0; c < cols; c += boxCols) {
    const cells: CellRC[] = [];
    for (let dr = 0; dr < boxRows; dr += 1) for (let dc = 0; dc < boxCols; dc += 1) cells.push({ r: r + dr, c: c + dc });
    expected.push(norm(cells));
  }
  return expected.length === regions.length && expected.every((entry) => actual.has(entry)) ? { boxRows, boxCols } : undefined;
}

function assertProject(project: CreatorProject) {
  if (project.format !== SPHENPAD_CREATOR_PROJECT_FORMAT || project.version !== SPHENPAD_CREATOR_PROJECT_VERSION) throw new Error("Unsupported SphenPad creator project format");
  if (!Number.isInteger(project.grid?.rows) || project.grid.rows < 1 || !Number.isInteger(project.grid?.cols) || project.grid.cols < 1) throw new Error("Creator project has invalid grid dimensions");
  if (!Number.isInteger(project.grid?.digits?.min) || !Number.isInteger(project.grid?.digits?.max) || project.grid.digits.min > project.grid.digits.max) throw new Error("Creator project has invalid digit range");
  if (!project.projectId || !project.sourceId) throw new Error("Creator project is missing identity");
  if (!project.metadata || !Array.isArray(project.givens) || !Array.isArray(project.regions) || !Array.isArray(project.constraints)) throw new Error("Creator project is missing required authoring data");
  if (project.solutionEntries !== undefined && !Array.isArray(project.solutionEntries)) throw new Error("Creator project has invalid solution entries");
  if (project.grid.regions && !["none", "regular", "irregular"].includes(project.grid.regions.mode)) throw new Error("Creator project has invalid region mode");
  if (!project.cosmetics || !project.settings || !project.compatibility || !Array.isArray(project.compatibility.cellExtras)) throw new Error("Creator project is missing required settings or compatibility data");
  for (const key of ["lines", "arrows", "cages", "underlays", "overlays"] as const) if (!Array.isArray(project.cosmetics[key])) throw new Error("Creator project has invalid cosmetics data");
  for (const constraint of project.constraints) if (!constraint.id || !constraint.type || !constraint.logic || !constraint.visuals) throw new Error("Creator project has an invalid constraint");
}

export function creatorProjectFromDefinition(def: PuzzleDefinition): CreatorProject {
  if (!def.scene || !def.logic || !def.meta.creatorPuzzle) throw new Error("Creator puzzle is missing its native authoring model");
  const logicConstraints = (def.logic.constraints ?? []).filter((constraint): constraint is PuzzleLogicConstraint & { id: string } => typeof constraint.id === "string");
  const ids = new Set(logicConstraints.map((constraint) => constraint.id));
  const lines = splitVisuals(def.scene.lines, ids), arrows = splitVisuals(def.scene.arrows, ids), cages = splitVisuals(def.scene.cages, ids), underlays = splitVisuals(def.scene.underlays, ids), overlays = splitVisuals(def.scene.overlays, ids);
  const labels = Array.isArray(def.logic.creatorRegionLabels) ? def.logic.creatorRegionLabels as string[] : [];
  const regions = (def.logic.regions ?? def.scene.regions.map((region) => region.cells.map(([r, c]) => ({ r, c })))).map((cells, index) => ({ id: `region-${index + 1}`, label: labels[index] ?? String(index + 1), cells: clone(cells) }));
  const constraints = logicConstraints.map((logic) => ({
    id: logic.id,
    type: logic.type,
    sourceElementId: typeof logic.sourceElementId === "string" ? logic.sourceElementId : undefined,
    logic: clone(logic),
    visuals: {
      lines: lines.byConstraint.get(logic.id) ?? [], arrows: arrows.byConstraint.get(logic.id) ?? [], cages: cages.byConstraint.get(logic.id) ?? [],
      underlays: underlays.byConstraint.get(logic.id) ?? [], overlays: overlays.byConstraint.get(logic.id) ?? [],
    },
  }));
  const meta = def.meta as PuzzleMeta & Record<string, unknown>;
  const sceneMetadata = def.scene.metadata as SudokuPadMetadata;
  const metadataExtra = omitKeys(meta, ["creatorPuzzle", "creatorPublished", "creatorElements", "creatorElementNames", "creatorConstraintChecks", "creatorDigitRange", "creatorRegionMode", "creatorBoxSize", "creatorSudokuRules", "creatorSolverSettings", "title", "author", "rules", "postSolveMessage", "collection"]);
  const sceneMetadataExtra = omitKeys(sceneMetadata as Record<string, unknown>, ["title", "author", "rules", "msgcorrect", "solution"]) as SudokuPadMetadata;
  const logicExtra = omitKeys(def.logic as Record<string, unknown>, ["solution", "regions", "constraints", "antiKnight", "antiKing", "antiRook", "sudokuRules", "global", "conflictChecker", "creatorRegionLabels", "creatorSolutionEntries"]);
  const cellExtras: CreatorProjectCellExtra[] = [];
  def.scene.cells.forEach((row, r) => row.forEach((cell, c) => {
    const data = omitKeys(cell as Record<string, unknown>, ["row", "col", "given"]);
    if (Object.keys(data).length) cellExtras.push({ rc: { r, c }, data: clone(data) as CreatorProjectCellExtra["data"] });
  }));
  const range = def.meta.creatorDigitRange;
  const detectedBox = def.meta.creatorBoxSize ? { boxRows: def.meta.creatorBoxSize.rows, boxCols: def.meta.creatorBoxSize.cols } : detectRegularBox(def.rows, def.cols, regions);
  const regionMode = def.meta.creatorRegionMode ?? (regions.length ? (detectedBox ? "regular" : "irregular") : "none");
  return {
    format: SPHENPAD_CREATOR_PROJECT_FORMAT, version: SPHENPAD_CREATOR_PROJECT_VERSION, projectId: def.id, sourceId: def.sourceId,
    grid: { rows: def.rows, cols: def.cols, digits: { min: range?.min ?? 1, max: range?.max ?? Math.max(def.rows, def.cols), custom: Boolean(range) }, regions: { mode: regionMode, ...(detectedBox ?? {}) } },
    metadata: { title: def.meta.title ?? "", author: def.meta.author ?? "", rules: def.meta.rules ?? "", postSolveMessage: def.meta.postSolveMessage ?? "", collection: def.meta.collection, extra: clone(metadataExtra) },
    givens: def.givens.map((given) => ({ rc: clone(given.rc), value: String(given.v) })), solution: typeof def.logic.solution === "string" ? def.logic.solution : undefined,
    solutionEntries: Array.isArray(def.logic.creatorSolutionEntries) ? clone(def.logic.creatorSolutionEntries as Array<{ rc: CellRC; value: string }>) : undefined,
    regions, constraints,
    cosmetics: { lines: lines.cosmetics, arrows: arrows.cosmetics, cages: cages.cosmetics, underlays: underlays.cosmetics, overlays: overlays.cosmetics },
    settings: {
      activeElementIds: clone(def.meta.creatorElements ?? []), elementNames: clone(def.meta.creatorElementNames ?? {}), constraintChecks: clone(def.meta.creatorConstraintChecks ?? {}), renderSettings: clone(def.scene.renderSettings), solver: clone(def.meta.creatorSolverSettings ?? {}), publishedToMyPuzzles: def.meta.creatorPublished === true,
      semantic: { antiKnight: def.logic.antiKnight, antiKing: def.logic.antiKing, antiRook: def.logic.antiRook, sudokuRules: def.logic.sudokuRules ?? def.meta.creatorSudokuRules, global: clone(def.logic.global), conflictChecker: def.logic.conflictChecker },
    },
    compatibility: { cellExtras, scenePuzzleId: def.scene.puzzleId, sceneFog: clone(def.scene.fog), sceneGlobal: clone(def.scene.global), sceneUnknown: clone(def.scene.unknown), sceneMetadataExtra: clone(sceneMetadataExtra), logicExtra: clone(logicExtra) },
  };
}

export function definitionFromCreatorProject(input: CreatorProject, identity?: { id: string; sourceId: string }): PuzzleDefinition {
  const project = clone(input); assertProject(project);
  const rows = project.grid.rows, cols = project.grid.cols;
  const givens = project.givens.map((given) => ({ rc: clone(given.rc), v: String(given.value) }));
  const givenMap = new Map(givens.map((given) => [`${given.rc.r}:${given.rc.c}`, given.v]));
  const extraMap = new Map(project.compatibility.cellExtras.map((entry) => [`${entry.rc.r}:${entry.rc.c}`, entry.data]));
  const cells = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => ({ row, col, ...(clone(extraMap.get(`${row}:${col}`)) ?? {}), ...(givenMap.has(`${row}:${col}`) ? { given: givenMap.get(`${row}:${col}`) } : {}) })));
  const regionCells = project.regions.map((region) => clone(region.cells));
  const constraints = project.constraints.map((constraint) => clone(constraint.logic));
  const meta: PuzzleMeta = {
    ...(clone(project.metadata.extra) as PuzzleMeta), creatorPuzzle: true, creatorPublished: project.settings.publishedToMyPuzzles === true, creatorElements: clone(project.settings.activeElementIds), creatorElementNames: clone(project.settings.elementNames), creatorConstraintChecks: clone(project.settings.constraintChecks), creatorSudokuRules: project.settings.semantic.sudokuRules ?? true,
    ...(project.grid.digits.custom ? { creatorDigitRange: { min: project.grid.digits.min, max: project.grid.digits.max } } : {}),
    ...(project.grid.regions?.mode ? { creatorRegionMode: project.grid.regions.mode } : {}),
    ...(project.grid.regions?.boxRows && project.grid.regions?.boxCols ? { creatorBoxSize: { rows: project.grid.regions.boxRows, cols: project.grid.regions.boxCols } } : {}),
    ...(project.settings.solver && Object.keys(project.settings.solver).length ? { creatorSolverSettings: clone(project.settings.solver) } : {}),
    title: project.metadata.title, author: project.metadata.author, rules: project.metadata.rules, postSolveMessage: project.metadata.postSolveMessage, collection: project.metadata.collection,
  };
  const id = identity?.id ?? project.projectId, sourceId = identity?.sourceId ?? project.sourceId;
  const sceneMetadata: SudokuPadMetadata = { ...clone(project.compatibility.sceneMetadataExtra), title: project.metadata.title, author: project.metadata.author, rules: project.metadata.rules, msgcorrect: project.metadata.postSolveMessage, ...(project.solution ? { solution: project.solution } : {}) };
  const retag = <T extends Record<string, unknown>>(entries: CreatorProjectVisual<T>[], constraint: CreatorProjectConstraint) => entries.map((entry) => ({ ...entry, value: tagged(entry.value, constraint.sourceElementId ?? constraint.type, constraint.id) }));
  const normalizedConstraints = project.constraints.map((constraint) => ({ ...constraint, visuals: {
    lines: retag(constraint.visuals.lines, constraint), arrows: retag(constraint.visuals.arrows, constraint), cages: retag(constraint.visuals.cages, constraint), underlays: retag(constraint.visuals.underlays, constraint), overlays: retag(constraint.visuals.overlays, constraint),
  } }));
  return {
    schemaVersion: SPHENPAD_PUZZLE_DEFINITION_SCHEMA_VERSION, id, sourceId, size: Math.max(rows, cols), rows, cols, meta, givens,
    scene: {
      version: SPHENPAD_SUDOKUPAD_SCENE_VERSION, puzzleId: project.compatibility.scenePuzzleId, rows, cols, cells,
      regions: project.regions.map((region) => ({ cells: region.cells.map((cell) => [cell.r, cell.c]), style: "box", type: "region", unique: true })),
      cages: mergeVisuals(project.cosmetics.cages, normalizedConstraints, "cages"), lines: mergeVisuals(project.cosmetics.lines, normalizedConstraints, "lines"), arrows: mergeVisuals(project.cosmetics.arrows, normalizedConstraints, "arrows"),
      underlays: mergeVisuals(project.cosmetics.underlays, normalizedConstraints, "underlays"), overlays: mergeVisuals(project.cosmetics.overlays, normalizedConstraints, "overlays"), metadata: sceneMetadata,
      fog: clone(project.compatibility.sceneFog), global: clone(project.compatibility.sceneGlobal), renderSettings: clone(project.settings.renderSettings ?? DEFAULT_SUDOKUPAD_RENDER_SETTINGS), unknown: clone(project.compatibility.sceneUnknown),
    },
    logic: {
      ...clone(project.compatibility.logicExtra), solution: project.solution, ...(project.solutionEntries ? { creatorSolutionEntries: clone(project.solutionEntries) } : {}), regions: regionCells, constraints, creatorRegionLabels: project.regions.map((region, index) => region.label ?? String(index + 1)),
      antiKnight: project.settings.semantic.antiKnight, antiKing: project.settings.semantic.antiKing, antiRook: project.settings.semantic.antiRook, sudokuRules: project.settings.semantic.sudokuRules ?? true, global: clone(project.settings.semantic.global), conflictChecker: project.settings.semantic.conflictChecker,
    },
  };
}

export function parseCreatorProject(input: unknown): CreatorProject {
  if (!input || typeof input !== "object") throw new Error("Invalid SphenPad creator project");
  const project = clone(input) as CreatorProject; assertProject(project); return project;
}
