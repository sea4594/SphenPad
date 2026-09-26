import type { SudokuPadMetadata, SudokuPadSourcePuzzle } from "../types/source";

const RE_META_TAGS = /^(.+?):\s*([\s\S]+)/m;

/** Mirrors App.extractPuzzleMeta + initMetadata's source compatibility rule. */
export function extractSudokuPadMetadata(puzzle: SudokuPadSourcePuzzle): SudokuPadMetadata {
  const metadata: SudokuPadMetadata = {};
  for (const cage of puzzle.cages ?? []) {
    if ((cage.cells ?? []).length !== 0) continue;
    const match = String(cage.value ?? "").match(RE_META_TAGS);
    if (!match?.[1] || !match[2]) continue;
    const name = match[1];
    const value = match[2];
    if (name === "rules") {
      const rules = metadata.rules;
      if (Array.isArray(rules)) rules.push(value);
      else if (rules === undefined) metadata.rules = [value];
      else metadata.rules = [rules, value];
    } else {
      metadata[name] = value;
    }
  }

  Object.assign(metadata, puzzle.metaData, puzzle.metadata);
  if (typeof metadata.solution === "number") metadata.solution = String(metadata.solution);
  if (metadata.source === undefined && /^sxsm_/.test(String(puzzle.id ?? ""))) {
    metadata.source = "Sudoku Maker pre-version";
  }
  return metadata;
}

export function normalizeSolutionForGrid(solution: unknown, rows: number, cols: number): string | undefined {
  if (solution === undefined || solution === null) return undefined;
  let value = String(solution);
  if (value.length > rows * cols && value.trim().length === rows * cols) value = value.trim();
  return value;
}
