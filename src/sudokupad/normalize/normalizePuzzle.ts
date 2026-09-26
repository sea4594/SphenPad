import { recordUnknownSudokuPadField } from "../diagnostics/unknownFields";
import { createSudokuPadCompatibilityReport, type SudokuPadCompatibilityReport } from "../diagnostics/warnings";
import type { PuzzleLogic } from "../types/logic";
import { SPHENPAD_SUDOKUPAD_SCENE_VERSION, SUDOKUPAD_COMPAT_TARGET_VERSION } from "../version";
import type { SudokuPadScene, SudokuPadSceneCell } from "../types/scene";
import { DEFAULT_SUDOKUPAD_RENDER_SETTINGS, type SudokuPadRenderSettings } from "../types/settings";
import type {
  SudokuPadMetadata,
  SudokuPadPoint,
  SudokuPadSourceArrow,
  SudokuPadSourceCage,
  SudokuPadSourceGraphic,
  SudokuPadSourceLine,
  SudokuPadSourcePuzzle,
} from "../types/source";
import { extractSudokuPadMetadata, normalizeSolutionForGrid } from "./metadata";
import { normalizeSudokuPadFogSource } from "../fog/normalizeFog";
import { sudokuPadRulesParser } from "../semantics/rulesParser";

const KNOWN_TOP_LEVEL_FIELDS = new Set([
  "id", "cellSize", "cells", "regions", "cages", "lines", "arrows", "underlays", "overlays",
  "metadata", "metaData", "videos", "foglight", "triggereffect", "global", "windoku", "diagonal+", "diagonal-",
  "title", "author", "rules", "solution",
]);

const BAD_3DB_SOLUTION = "000000000000000000000012356403142560416235045632102563140325461054123606251430561324036241501436250234156063514204615320642513021465305324610153642000000000000000000000041365204632150532641062514301254630614235054132605421360425163023651403165420361452016423502316540256314035246106543210143526000000000000000000000";
const GOOD_3DB_SOLUTION = ".......................123564.314256.416235..456321.256314.325461..541236.625143.561324..362415.143625.234156..635142.461532.642513..214653.532461.153642........................413652.463215.532641..625143.125463.614235..541326.542163.425163..236514.316542.361452..164235.231654.256314..352461.654321.143526.......................";

function cloneJson<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T;
}

function triangularNumber(value: number): number {
  const abs = Math.abs(value);
  return ((abs / 2) * (abs + 1)) * (abs / value) || 0;
}

function normalizeSceneCells(source: SudokuPadSourcePuzzle, rows: number, cols: number): SudokuPadSceneCell[][] {
  const result: SudokuPadSceneCell[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const sourceRow = source.cells[row] ?? [];
    const sceneRow: SudokuPadSceneCell[] = [];
    for (let col = 0; col < cols; col += 1) {
      const sourceCell = sourceRow[col] ?? {};
      const cell: SudokuPadSceneCell = { row, col };
      if (sourceCell.value !== undefined && !Number.isNaN(sourceCell.value)) cell.given = String(sourceCell.value).toLowerCase();
      if ((sourceCell.centremarks ?? []).length) cell.givenCentremarks = sourceCell.centremarks!.map((value) => String(value).toLowerCase());
      if ((sourceCell.pencilMarks ?? []).length) cell.givenCornermarks = sourceCell.pencilMarks!.map((value) => String(value).toLowerCase());
      sceneRow.push(cell);
    }
    result.push(sceneRow);
  }
  return result;
}

function normalizeRegions(source: SudokuPadSourcePuzzle, rows: number): SudokuPadSourceCage[] {
  return (source.regions ?? []).map((cells) => ({
    cells: cloneJson((cells ?? []).filter(Array.isArray)) as SudokuPadPoint[],
    sum: triangularNumber((cells ?? []).length),
    unique: (cells ?? []).length === rows ? false : true,
    style: "box",
    type: "region",
  }));
}

function normalizeCages(source: SudokuPadSourcePuzzle): SudokuPadSourceCage[] {
  return cloneJson(source.cages ?? []).filter((cage) => (cage.cells ?? []).length > 0);
}

function collectUnknownTopLevelFields(
  source: SudokuPadSourcePuzzle,
  report: SudokuPadCompatibilityReport,
): Record<string, unknown> {
  const unknown: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (KNOWN_TOP_LEVEL_FIELDS.has(key)) continue;
    unknown[key] = cloneJson(value);
    recordUnknownSudokuPadField(report, "unknown-top-level-field", key, value);
  }
  return unknown;
}

function metadataBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}

export interface NormalizeSudokuPadOptions {
  renderSettings?: Partial<SudokuPadRenderSettings>;
  compatibility?: SudokuPadCompatibilityReport;
}

export interface NormalizedSudokuPadPuzzle {
  scene: SudokuPadScene;
  logic: PuzzleLogic;
  metadata: SudokuPadMetadata;
  compatibility: SudokuPadCompatibilityReport;
}

export function normalizeSudokuPadSourcePuzzle(
  sourcePuzzle: SudokuPadSourcePuzzle,
  options: NormalizeSudokuPadOptions = {},
): NormalizedSudokuPadPuzzle {
  const source = cloneJson(sourcePuzzle);
  const rows = source.cells?.length ?? 0;
  const cols = Math.max(0, ...(source.cells ?? []).map((row) => row?.length ?? 0));
  if (rows === 0 || cols === 0) throw new Error("SudokuPad puzzle has no renderable cells");

  const compatibility = options.compatibility ?? createSudokuPadCompatibilityReport(SUDOKUPAD_COMPAT_TARGET_VERSION);
  const fog = normalizeSudokuPadFogSource(source, rows, cols);
  const metadata = extractSudokuPadMetadata(source);
  let solution = normalizeSolutionForGrid(metadata.solution, rows, cols);
  if (source.id === "3DBNbtLfdp" && solution === BAD_3DB_SOLUTION) solution = GOOD_3DB_SOLUTION;
  if (solution !== undefined) metadata.solution = solution;

  const scene: SudokuPadScene = {
    version: SPHENPAD_SUDOKUPAD_SCENE_VERSION,
    ...(source.id !== undefined ? { puzzleId: String(source.id) } : {}),
    rows,
    cols,
    cells: normalizeSceneCells(source, rows, cols),
    regions: normalizeRegions(source, rows),
    cages: normalizeCages(source),
    lines: cloneJson(source.lines ?? []) as SudokuPadSourceLine[],
    arrows: cloneJson(source.arrows ?? []) as SudokuPadSourceArrow[],
    underlays: cloneJson(source.underlays ?? []) as SudokuPadSourceGraphic[],
    overlays: cloneJson(source.overlays ?? []) as SudokuPadSourceGraphic[],
    metadata,
    ...(fog ? { fog } : {}),
    ...(Array.isArray(source.global) ? { global: cloneJson(source.global) } : {}),
    renderSettings: { ...DEFAULT_SUDOKUPAD_RENDER_SETTINGS, ...options.renderSettings },
    unknown: collectUnknownTopLevelFields(source, compatibility),
  };

  const logic: PuzzleLogic = {
    ...(solution !== undefined ? { solution } : {}),
    regions: (source.regions ?? []).map((region) => (region ?? [])
      .filter((cell): cell is SudokuPadPoint => Array.isArray(cell) && cell.length >= 2)
      .map(([r, c]) => ({ r, c }))),
    ...(Array.isArray(source.global) ? { global: [...source.global] } : {}),
  };
  const antiKnight = metadataBool(metadata.antiknight);
  const antiKing = metadataBool(metadata.antiking);
  if (antiKnight !== undefined) logic.antiKnight = antiKnight;
  else if (sudokuPadRulesParser.hasAntiKnight(metadata.rules)) logic.antiKnight = true;
  if (antiKing !== undefined) logic.antiKing = antiKing;
  else if (sudokuPadRulesParser.hasAntiKing(metadata.rules)) logic.antiKing = true;

  // SudokuPad's own RulesParser infers a small amount of checker semantics from
  // natural-language rules. Keep these semantic hints separate from rendering.
  const constraints = logic.constraints ?? [];
  if (sudokuPadRulesParser.hasKillerCage(metadata.rules)) constraints.push({ type: "killer-cage-rule" });
  if (sudokuPadRulesParser.hasXV(metadata.rules)) constraints.push({ type: "xv-rule" });
  if (constraints.length) logic.constraints = constraints;

  return { scene, logic, metadata, compatibility };
}
