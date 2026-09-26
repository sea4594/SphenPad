import type { PuzzleProgress } from "../../core/model";
import type { PuzzleLogic, PuzzleLogicCell } from "../types/logic";

function cellKey(cell: PuzzleLogicCell): string { return `${cell.r}:${cell.c}`; }
function symbol(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized || undefined;
}

function inBounds(cell: PuzzleLogicCell, rows: number, cols: number): boolean {
  return cell.r >= 0 && cell.c >= 0 && cell.r < rows && cell.c < cols;
}

function valuesFromProgress(progress: PuzzleProgress): Map<string, string> {
  const values = new Map<string, string>();
  for (let r = 0; r < progress.cells.length; r += 1) {
    const row = progress.cells[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      const value = symbol(row[c]?.value ?? row[c]?.given);
      if (value) values.set(`${r}:${c}`, value);
    }
  }
  return values;
}

function addDuplicateGroup(errors: Set<string>, values: Map<string, string>, cells: PuzzleLogicCell[]): void {
  const byValue = new Map<string, string[]>();
  for (const cell of cells) {
    const key = cellKey(cell);
    const value = values.get(key);
    if (!value) continue;
    const list = byValue.get(value) ?? [];
    list.push(key);
    byValue.set(value, list);
  }
  for (const keys of byValue.values()) if (keys.length > 1) keys.forEach((key) => errors.add(key));
}

/**
 * Return cells that Sudoku-style conflict checking should mark as errors.
 * Semantic rule knowledge lives here, never in the SVG renderer.
 */
export function computePuzzleConflictCells(
  progress: PuzzleProgress,
  logic: PuzzleLogic | undefined,
  rows: number,
  cols: number,
  enabled = true,
): Set<string> {
  const errors = new Set<string>();
  if (!enabled || logic?.conflictChecker === false) return errors;
  const values = valuesFromProgress(progress);

  const explicitDomain = new Set((logic?.rowColCells ?? []).filter((cell) => inBounds(cell, rows, cols)).map(cellKey));
  const inRowColDomain = (r: number, c: number) => explicitDomain.size === 0 || explicitDomain.has(`${r}:${c}`);

  const customAreas = (logic?.rowColAreas ?? [])
    .map((area) => area.filter((cell) => inBounds(cell, rows, cols)))
    .filter((area) => area.length > 0);

  if (logic?.sudokuRules !== false) {
    if (customAreas.length) {
      customAreas.forEach((area) => addDuplicateGroup(errors, values, area));
    } else {
      for (let r = 0; r < rows; r += 1) {
        addDuplicateGroup(errors, values, Array.from({ length: cols }, (_, c) => ({ r, c })).filter((cell) => inRowColDomain(cell.r, cell.c)));
      }
      for (let c = 0; c < cols; c += 1) {
        addDuplicateGroup(errors, values, Array.from({ length: rows }, (_, r) => ({ r, c })).filter((cell) => inRowColDomain(cell.r, cell.c)));
      }
    }
  }

  for (const region of logic?.regions ?? []) {
    addDuplicateGroup(errors, values, region.filter((cell) => inBounds(cell, rows, cols)));
  }

  const markEqualPair = (a: PuzzleLogicCell, b: PuzzleLogicCell) => {
    if (!inBounds(a, rows, cols) || !inBounds(b, rows, cols)) return;
    const av = values.get(cellKey(a));
    const bv = values.get(cellKey(b));
    if (av && bv && av === bv) { errors.add(cellKey(a)); errors.add(cellKey(b)); }
  };

  if (logic?.antiKing) {
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
      markEqualPair({ r, c }, { r: r + 1, c: c + 1 });
      markEqualPair({ r, c }, { r: r + 1, c: c - 1 });
    }
  }
  if (logic?.antiKnight) {
    const moves = [[1,2],[2,1]] as const;
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) for (const [dr, dc] of moves) {
      markEqualPair({ r, c }, { r: r + dr, c: c + dc });
      markEqualPair({ r, c }, { r: r + dr, c: c - dc });
    }
  }

  return errors;
}
