import type { CellRC, PuzzleDefinition } from "../../core/model";
import { getCreatorRegions, removeCreatorConstraint, setCreatorRegions, setCreatorSolution, syncDefinitionGivens } from "./nativeAuthoring";

export type CreatorRegionMode = "none" | "regular" | "irregular";
export type CreatorSolutionEntry = { rc: CellRC; value: string };

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
  const trimmed = text.trim();
  if (!trimmed) return Array(rows * cols).fill("");
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === rows) {
    const tokenRows = lines.map((line) => line.split(/[\s,]+/).filter(Boolean));
    if (tokenRows.every((tokens) => tokens.length === cols)) return tokenRows.flat().map((value) => (value === "." || value === "0") ? "" : value);
    if (lines.every((line) => Array.from(line.replace(/\s/g, "")).length === cols)) return lines.flatMap((line) => Array.from(line.replace(/\s/g, "")).map((value) => (value === "." || value === "0") ? "" : value));
  }
  const compact = trimmed.replace(/\s/g, "");
  if (Array.from(compact).length === rows * cols) return Array.from(compact).map((value) => (value === "." || value === "0") ? "" : value);
  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === rows * cols) return tokens.map((value) => (value === "." || value === "0") ? "" : value);
  return null;
}

export function formatCreatorGrid(def: PuzzleDefinition, source: "givens" | "solution") {
  const entries = source === "givens" ? def.givens.map((given) => ({ rc: given.rc, value: given.v })) : getCreatorSolutionEntries(def);
  const byCell = new Map(entries.map((entry) => [key(entry.rc), entry.value]));
  const values = Array.from({ length: def.rows }, (_, r) => Array.from({ length: def.cols }, (_, c) => byCell.get(`${r}:${c}`) ?? "."));
  const spaced = values.some((row) => row.some((value) => Array.from(value).length > 1));
  return values.map((row) => row.join(spaced ? " " : "")).join("\n");
}
