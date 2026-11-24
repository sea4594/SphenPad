import type { CellRC, PuzzleDefinition } from "../../core/model";
import { getCreatorRegions, removeCreatorConstraint, setCreatorRegions, setCreatorSolution, syncDefinitionGivens } from "./nativeAuthoring";

export type CreatorRegionMode = "none" | "regular" | "irregular";
export type CreatorSolutionEntry = { rc: CellRC; value: string };

export type CreatorStructureDraft = {
  rows: number; cols: number; min: number; max: number;
  regionMode: CreatorRegionMode; boxRows: number; boxCols: number;
  sudokuRules: boolean;
};

/** Reject invalid authoring settings instead of silently clamping them to another puzzle. */
export function validateCreatorStructureDraft(draft: CreatorStructureDraft): string[] {
  const problems: string[] = [];
  const dimension = (value: number) => Number.isInteger(value) && value >= 1 && value <= 30;
  if (!dimension(draft.rows) || !dimension(draft.cols)) problems.push("Rows and columns must be whole numbers between 1 and 30.");
  if (!Number.isInteger(draft.min) || !Number.isInteger(draft.max) || draft.min < 1 || draft.max > 64 || draft.max < draft.min) {
    problems.push("Digit range must use whole numbers from 1 to 64, with the highest digit at least the lowest.");
  }
  const count = draft.max - draft.min + 1;
  if (problems.length) return problems;
  if (draft.sudokuRules && Math.max(draft.rows, draft.cols) > count) {
    problems.push(`With standard Sudoku row/column rules, a ${draft.rows}×${draft.cols} grid needs at least ${Math.max(draft.rows, draft.cols)} allowed digits.`);
  }
  if (draft.regionMode === "regular") {
    if (!Number.isInteger(draft.boxRows) || !Number.isInteger(draft.boxCols) || draft.boxRows < 1 || draft.boxCols < 1 ||
        draft.rows % draft.boxRows !== 0 || draft.cols % draft.boxCols !== 0) {
      problems.push("Regular box dimensions must be positive whole numbers that divide the grid exactly.");
    } else if (draft.boxRows * draft.boxCols !== count) {
      problems.push(`Each regular box must contain ${count} cells for this digit range.`);
    }
  }
  return problems;
}

/** Return cells not currently assigned to any base region (useful while painting irregular regions). */
export function getCreatorUnassignedRegionCells(def: PuzzleDefinition): CellRC[] {
  const covered = new Set(getCreatorRegions(def).flatMap((region) => region.cells.map(key)));
  return Array.from({ length: def.rows * def.cols }, (_, index) => ({ r: Math.floor(index / def.cols), c: index % def.cols }))
    .filter((cell) => !covered.has(key(cell)));
}

/** Assign selected cells to a base region atomically, without allowing duplicate membership. */
export function assignCreatorRegionCells(def: PuzzleDefinition, selected: CellRC[], label: string): PuzzleDefinition {
  const valid = new Map(selected.filter((cell) => inBounds(cell, def.rows, def.cols)).map((cell) => [key(cell), cell]));
  if (!valid.size) return def;
  const regions = getCreatorRegions(def)
    .map((region) => ({ ...region, cells: region.cells.filter((cell) => !valid.has(key(cell))) }))
    .filter((region) => region.cells.length);
  if (label) {
    const matching = regions.find((region) => region.label === label);
    if (matching) matching.cells.push(...valid.values());
    else regions.push({ label, cells: [...valid.values()] });
  }
  regions.sort((a, b) => Number(a.label ?? 0) - Number(b.label ?? 0));
  return setCreatorRegions(def, regions);
}

/** Numeric values are canonical strings; zero and dot are blank only in grid text. */
export function creatorGridValueError(raw: string, min: number, max: number): string | undefined {
  if (!/^\d+$/.test(raw) || String(Number(raw)) !== raw || !Number.isInteger(Number(raw))) return `Invalid cell value “${raw}”. Use whole numbers without leading zeroes.`;
  if (Number(raw) < min || Number(raw) > max) return `Cell value ${raw} is outside the allowed range ${min}–${max}.`;
  return undefined;
}

export type CreatorGridParseResult = { values: string[]; error?: never } | { values?: never; error: string };
/** Parse a compact single-character grid or a whitespace/comma separated numeric grid. */
export function parseCreatorGridDetailed(text: string, rows: number, cols: number, range?: { min: number; max: number }): CreatorGridParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { values: Array(rows * cols).fill("") };
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let values: string[] | undefined;
  if (lines.length === rows) {
    const tokens = lines.map((line) => line.split(/[\s,]+/).filter(Boolean));
    if (tokens.every((parts) => parts.length === cols)) values = tokens.flat();
    else if (lines.every((line) => Array.from(line.replace(/\s/g, "")).length === cols && !line.includes(","))) {
      values = lines.flatMap((line) => Array.from(line.replace(/\s/g, "")));
    } else return { error: `Expected ${cols} values in each of the ${rows} rows. For two-digit values, separate cells with spaces or commas.` };
  }
  if (!values) {
    const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
    if (tokens.length === rows * cols) values = tokens;
    else {
      const compact = trimmed.replace(/\s/g, "");
      if (!trimmed.includes(",") && Array.from(compact).length === rows * cols) values = Array.from(compact);
    }
  }
  if (!values) return { error: `Expected exactly ${rows * cols} cells (${rows} rows × ${cols} columns). Separate two-digit values with spaces or commas.` };
  const normalized = values.map((value) => value === "." || value === "0" ? "" : value);
  if (range) for (let index = 0; index < normalized.length; index += 1) {
    const value = normalized[index];
    if (!value) continue;
    const error = creatorGridValueError(value, range.min, range.max);
    if (error) return { error: `${error} At R${Math.floor(index / cols) + 1}C${index % cols + 1}.` };
  }
  return { values: normalized };
}

const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
const key = (cell: CellRC) => `${cell.r}:${cell.c}`;
const inBounds = (cell: CellRC, rows: number, cols: number) => cell.r >= 0 && cell.c >= 0 && cell.r < rows && cell.c < cols;

export function creatorDigitRange(def: PuzzleDefinition) {
  const range = def.meta.creatorDigitRange;
  return range ? { min: range.min, max: range.max } : { min: 1, max: Math.max(def.rows, def.cols) };
}

export function creatorDigitCount(def: PuzzleDefinition) {
  const range = creatorDigitRange(def);
  return range.max - range.min + 1;
}

export function creatorRegionMode(def: PuzzleDefinition): CreatorRegionMode {
  if (def.meta.creatorRegionMode) return def.meta.creatorRegionMode;
  if (!getCreatorRegions(def).length) return "none";
  return inferCreatorBoxSize(def) ? "regular" : "irregular";
}

export function regularCreatorRegions(rows: number, cols: number, boxRows: number, boxCols: number) {
  if (!Number.isInteger(boxRows) || !Number.isInteger(boxCols) || boxRows < 1 || boxCols < 1 || rows % boxRows || cols % boxCols) return [];
  const regions: Array<{ cells: CellRC[]; label: string }> = [];
  let label = 1;
  for (let r = 0; r < rows; r += boxRows) for (let c = 0; c < cols; c += boxCols) {
    const cells: CellRC[] = [];
    for (let dr = 0; dr < boxRows; dr += 1) for (let dc = 0; dc < boxCols; dc += 1) cells.push({ r: r + dr, c: c + dc });
    regions.push({ cells, label: String(label++) });
  }
  return regions;
}

export function inferCreatorBoxSize(def: PuzzleDefinition): { rows: number; cols: number } | undefined {
  if (def.meta.creatorBoxSize) return clone(def.meta.creatorBoxSize);
  const regions = getCreatorRegions(def);
  if (!regions.length) return undefined;
  const first = regions[0].cells;
  if (!first.length) return undefined;
  const rs = first.map((cell) => cell.r), cs = first.map((cell) => cell.c);
  const boxRows = Math.max(...rs) - Math.min(...rs) + 1, boxCols = Math.max(...cs) - Math.min(...cs) + 1;
  if (boxRows * boxCols !== first.length || def.rows % boxRows || def.cols % boxCols) return undefined;
  const expected = regularCreatorRegions(def.rows, def.cols, boxRows, boxCols);
  const normalized = (cells: CellRC[]) => cells.map(key).sort().join("|");
  const actualSet = new Set(regions.map((region) => normalized(region.cells)));
  if (expected.length !== regions.length || expected.some((region) => !actualSet.has(normalized(region.cells)))) return undefined;
  return { rows: boxRows, cols: boxCols };
}

export function getCreatorSolutionEntries(def: PuzzleDefinition): CreatorSolutionEntry[] {
  const stored = def.logic?.creatorSolutionEntries;
  if (Array.isArray(stored)) return stored.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as { rc?: CellRC; value?: unknown };
    if (!item.rc || typeof item.rc.r !== "number" || typeof item.rc.c !== "number" || typeof item.value !== "string") return [];
    return [{ rc: { r: item.rc.r, c: item.rc.c }, value: item.value }];
  });
  const solution = typeof def.logic?.solution === "string" ? def.logic.solution : "";
  if (!solution) return [];
  return Array.from(solution).flatMap((value, index) => value && value !== "." ? [{ rc: { r: Math.floor(index / def.cols), c: index % def.cols }, value }] : []);
}

function compatibilitySolution(entries: CreatorSolutionEntry[], rows: number, cols: number) {
  const byCell = new Map(entries.map((entry) => [key(entry.rc), entry.value]));
  const values = Array.from({ length: rows * cols }, (_, index) => byCell.get(`${Math.floor(index / cols)}:${index % cols}`) ?? ".");
  return values.every((value) => value === "." || Array.from(value).length === 1) ? values.join("") : undefined;
}

export function setCreatorSolutionEntries(def: PuzzleDefinition, entriesInput: CreatorSolutionEntry[]): PuzzleDefinition {
  const entries = entriesInput.filter((entry) => inBounds(entry.rc, def.rows, def.cols) && entry.value !== "").map((entry) => ({ rc: { ...entry.rc }, value: String(entry.value) }));
  let next = setCreatorSolution(def, compatibilitySolution(entries, def.rows, def.cols));
  next = { ...next, logic: { ...(next.logic ?? {}), creatorSolutionEntries: clone(entries) } };
  return next;
}

export function setCreatorDigitRange(def: PuzzleDefinition, minInput: number, maxInput: number): PuzzleDefinition {
  const min = Math.max(1, Math.min(64, Math.trunc(minInput)));
  const max = Math.max(min, Math.min(64, Math.trunc(maxInput)));
  return { ...def, meta: { ...def.meta, creatorDigitRange: { min, max } } };
}

export function setCreatorRegionConfiguration(def: PuzzleDefinition, mode: CreatorRegionMode, box?: { rows: number; cols: number }): PuzzleDefinition {
  const next = { ...def, meta: { ...def.meta, creatorRegionMode: mode, ...(box ? { creatorBoxSize: { rows: box.rows, cols: box.cols } } : {}) } };
  if (mode === "none") {
    const meta = { ...next.meta }; delete meta.creatorBoxSize;
    return setCreatorRegions({ ...next, meta }, []);
  }
  if (mode === "regular") {
    if (!box) return next;
    return setCreatorRegions(next, regularCreatorRegions(def.rows, def.cols, box.rows, box.cols));
  }
  const meta = { ...next.meta }; delete meta.creatorBoxSize;
  return { ...next, meta };
}

export function resizeCreatorDefinition(def: PuzzleDefinition, rowsInput: number, colsInput: number): PuzzleDefinition {
  const rows = Math.max(1, Math.min(30, Math.trunc(rowsInput))), cols = Math.max(1, Math.min(30, Math.trunc(colsInput)));
  if (rows === def.rows && cols === def.cols) return def;
  const valid = (cell: CellRC) => inBounds(cell, rows, cols);
  const givens = def.givens.filter((given) => valid(given.rc));
  const solutionEntries = getCreatorSolutionEntries(def).filter((entry) => valid(entry.rc));
  let next: PuzzleDefinition = { ...def, rows, cols, size: Math.max(rows, cols), givens };
  const invalidConstraintIds = (def.logic?.constraints ?? []).flatMap((constraint) => {
    const cells = (Array.isArray(constraint.cells) ? constraint.cells : Array.isArray(constraint.path) ? constraint.path : []) as CellRC[];
    return cells.length && cells.some((cell) => !valid(cell)) && typeof constraint.id === "string" ? [constraint.id] : [];
  });
  for (const constraintId of invalidConstraintIds) next = removeCreatorConstraint(next, constraintId);
  if (next.scene) {
    const oldCells = next.scene.cells;
    next = {
      ...next,
      scene: {
        ...next.scene,
        rows,
        cols,
        cells: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => ({ ...(oldCells[r]?.[c] ?? { row: r, col: c }), row: r, col: c }))),
      },
    };
  }
  next = setCreatorRegions(next, getCreatorRegions(def).map((region) => ({ ...region, cells: region.cells.filter(valid) })).filter((region) => region.cells.length));
  const mode = creatorRegionMode(def), box = inferCreatorBoxSize(def);
  if (mode === "regular" && box && rows % box.rows === 0 && cols % box.cols === 0) next = setCreatorRegionConfiguration(next, "regular", box);
  else if (mode === "regular") next = setCreatorRegionConfiguration(next, "irregular");
  next = setCreatorSolutionEntries(next, solutionEntries);
  return syncDefinitionGivens(next);
}

export function clearCreatorGivens(def: PuzzleDefinition) { return syncDefinitionGivens({ ...def, givens: [] }); }
export function clearCreatorSolution(def: PuzzleDefinition) { return setCreatorSolutionEntries(def, []); }
export function clearCreatorRegions(def: PuzzleDefinition) { return setCreatorRegionConfiguration(def, "none"); }

export function parseCreatorGrid(text: string, rows: number, cols: number): string[] | null {
  return parseCreatorGridDetailed(text, rows, cols).values ?? null;
}

export function formatCreatorGrid(def: PuzzleDefinition, source: "givens" | "solution") {
  const entries = source === "givens" ? def.givens.map((given) => ({ rc: given.rc, value: given.v })) : getCreatorSolutionEntries(def);
  const byCell = new Map(entries.map((entry) => [key(entry.rc), entry.value]));
  const values = Array.from({ length: def.rows }, (_, r) => Array.from({ length: def.cols }, (_, c) => byCell.get(`${r}:${c}`) ?? "."));
  const spaced = values.some((row) => row.some((value) => Array.from(value).length > 1));
  return values.map((row) => row.join(spaced ? " " : "")).join("\n");
}
