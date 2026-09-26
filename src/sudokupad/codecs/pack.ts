export interface SudokuPadPuzzlePackEntry {
  puzzle: string;
  title?: string;
  author?: string;
  [key: string]: unknown;
}

export interface SudokuPadPuzzlePack {
  title?: string;
  puzzles: SudokuPadPuzzlePackEntry[];
  segments?: unknown[];
  [key: string]: unknown;
}

export function parseSudokuPadPuzzlePack(value: unknown): SudokuPadPuzzlePack {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid SudokuPad puzzle pack");
  const pack = value as SudokuPadPuzzlePack;
  if (!Array.isArray(pack.puzzles)) throw new Error("SudokuPad puzzle pack has no puzzles array");
  return pack;
}
