import type { PuzzleProgress } from "./model";

function normalizeSymbol(symbol: string | undefined): string {
  const trimmed = symbol?.trim() ?? "";
  return trimmed.length ? trimmed.toUpperCase() : "";
}

export function fillProgressWithSolutionDigits(progress: PuzzleProgress, solution?: string): PuzzleProgress {
  const rows = progress.cells.length;
  const cols = progress.cells[0]?.length ?? 0;
  if (!solution || solution.length < rows * cols) return progress;

  let nextCells: PuzzleProgress["cells"] | null = null;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = progress.cells[r][c];
      if (!cell || cell.given) continue;

      const expected = normalizeSymbol(solution[r * cols + c]);
      if (!expected || expected === ".") continue;

      const actual = normalizeSymbol(cell.value);
      if (actual === expected) continue;

      if (!nextCells) nextCells = progress.cells.map((row) => [...row]);
      nextCells[r][c] = { ...cell, value: expected };
    }
  }

  if (!nextCells) return progress;
  return {
    ...progress,
    cells: nextCells,
  };
}
