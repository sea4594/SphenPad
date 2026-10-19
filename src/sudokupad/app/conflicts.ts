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

/**
 * Imported puzzles can pad a Sudoku grid with extra writable notes cells.
 * Only infer a smaller checker domain when the authored regions form a complete,
 * disjoint, square Sudoku grid. Partial/special regions are not sufficient proof.
 * Explicit row/column domains (when present) take precedence.
 */
function checkerDomain(logic: PuzzleLogic | undefined, rows: number, cols: number): Set<string> | undefined {
  if (logic?.rowColCells?.length) return new Set(logic.rowColCells.filter((cell) => inBounds(cell, rows, cols)).map(cellKey));
  const square = (cells: Set<string>): Set<string> | undefined => {
    const side = Math.sqrt(cells.size);
    if (!Number.isInteger(side) || side < 2 || cells.size >= rows * cols) return undefined;
    const coords = [...cells].map((key) => key.split(":").map(Number));
    const row0 = Math.min(...coords.map(([r]) => r)), col0 = Math.min(...coords.map(([, c]) => c));
    for (let r = row0; r < row0 + side; r += 1) for (let c = col0; c < col0 + side; c += 1) {
      if (!cells.has(`${r}:${c}`)) return undefined;
    }
    return cells;
  };
  const regions = logic?.regions ?? [];
  const size = regions.length;
  if (size >= 2 && regions.every((region) => region.length === size)) {
    const cells = new Set<string>();
    let disjoint = true;
    for (const region of regions) for (const cell of region) {
      const key = cellKey(cell);
      if (!inBounds(cell, rows, cols) || cells.has(key)) disjoint = false;
      cells.add(key);
    }
    if (disjoint) {
      const domain = square(cells);
      if (domain) return domain;
    }
  }
  // Some otherwise regionless imports include a complete solution whose '.'
  // padding unambiguously separates the inner Sudoku from exterior note rows.
  const solution = logic?.solution;
  if (typeof solution === "string" && solution.length === rows * cols && solution.includes(".")) {
    const cells = new Set<string>();
    for (let index = 0; index < solution.length; index += 1) {
      if (solution[index] !== ".") cells.add(`${Math.floor(index / cols)}:${index % cols}`);
    }
    return square(cells);
  }
  return undefined;
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


function markConflictsAt(
  values: Map<string, string>,
  logic: PuzzleLogic | undefined,
  rows: number,
  cols: number,
  r: number,
  c: number,
  rawValue: string,
): boolean {
  const value = symbol(rawValue);
  if (!value || !inBounds({ r, c }, rows, cols)) return false;
  const domain = checkerDomain(logic, rows, cols);
  const inDomain = (row: number, col: number) => !domain || domain.has(`${row}:${col}`);
  if (!inDomain(r, c)) return false;
  const targetKey = `${r}:${c}`;
  const sameValueAt = (cell: PuzzleLogicCell) => inBounds(cell, rows, cols) && inDomain(cell.r, cell.c) && cellKey(cell) !== targetKey && values.get(cellKey(cell)) === value;
  const customAreas = (logic?.rowColAreas ?? [])
    .map((area) => area.filter((cell) => inBounds(cell, rows, cols) && inDomain(cell.r, cell.c)))
    .filter((area) => area.length > 0);

  if (logic?.sudokuRules !== false) {
    if (customAreas.length) {
      if (customAreas.some((area) => area.some((cell) => cell.r === r && cell.c === c) && area.some(sameValueAt))) return true;
    } else {
      for (let cc = 0; cc < cols; cc += 1) if (cc !== c && inDomain(r, cc) && values.get(`${r}:${cc}`) === value) return true;
      for (let rr = 0; rr < rows; rr += 1) if (rr !== r && inDomain(rr, c) && values.get(`${rr}:${c}`) === value) return true;
    }
  }

  for (const region of logic?.regions ?? []) {
    const bounded = region.filter((cell) => inBounds(cell, rows, cols));
    if (bounded.some((cell) => cell.r === r && cell.c === c) && bounded.some(sameValueAt)) return true;
  }

  if (logic?.antiKing) {
    for (const dr of [-1, 1]) for (const dc of [-1, 1]) if (inDomain(r + dr, c + dc) && values.get(`${r + dr}:${c + dc}`) === value) return true;
  }
  if (logic?.antiKnight) {
    const moves = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]] as const;
    for (const [dr, dc] of moves) if (inDomain(r + dr, c + dc) && values.get(`${r + dr}:${c + dc}`) === value) return true;
  }
  return false;
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
  const domain = checkerDomain(logic, rows, cols);
  const inDomain = (r: number, c: number) => !domain || domain.has(`${r}:${c}`);

  const customAreas = (logic?.rowColAreas ?? [])
    .map((area) => area.filter((cell) => inBounds(cell, rows, cols) && inDomain(cell.r, cell.c)))
    .filter((area) => area.length > 0);

  if (logic?.sudokuRules !== false) {
    if (customAreas.length) {
      customAreas.forEach((area) => addDuplicateGroup(errors, values, area));
    } else {
      for (let r = 0; r < rows; r += 1) {
        addDuplicateGroup(errors, values, Array.from({ length: cols }, (_, c) => ({ r, c })).filter((cell) => inDomain(cell.r, cell.c)));
      }
      for (let c = 0; c < cols; c += 1) {
        addDuplicateGroup(errors, values, Array.from({ length: rows }, (_, r) => ({ r, c })).filter((cell) => inDomain(cell.r, cell.c)));
      }
    }
  }

  for (const region of logic?.regions ?? []) {
    addDuplicateGroup(errors, values, region.filter((cell) => inBounds(cell, rows, cols) && inDomain(cell.r, cell.c)));
  }

  const markEqualPair = (a: PuzzleLogicCell, b: PuzzleLogicCell) => {
    if (!inBounds(a, rows, cols) || !inBounds(b, rows, cols) || !inDomain(a.r, a.c) || !inDomain(b.r, b.c)) return;
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

/** Return conflicting player pencilmark symbols per cell, using the same active Sudoku conflict rules as values. */
export function computePuzzleConflictMarks(
  progress: PuzzleProgress,
  logic: PuzzleLogic | undefined,
  rows: number,
  cols: number,
  enabled = true,
): Map<string, Set<string>> {
  const errors = new Map<string, Set<string>>();
  if (!enabled || logic?.conflictChecker === false) return errors;
  const values = valuesFromProgress(progress);
  for (let r = 0; r < progress.cells.length; r += 1) {
    for (let c = 0; c < (progress.cells[r] ?? []).length; c += 1) {
      const notes = progress.cells[r]?.[c]?.notes;
      const marks = new Set<string>([...(notes?.center ?? []), ...(notes?.corner ?? [])]);
      for (const mark of marks) {
        if (!markConflictsAt(values, logic, rows, cols, r, c, mark)) continue;
        const key = `${r}:${c}`;
        const cellErrors = errors.get(key) ?? new Set<string>();
        cellErrors.add(mark);
        errors.set(key, cellErrors);
      }
    }
  }
  return errors;
}
