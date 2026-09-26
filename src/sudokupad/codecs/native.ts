import type { PuzzleLogic } from "../types/logic";
import type { SudokuPadScene } from "../types/scene";
import type { SudokuPadSourcePuzzle } from "../types/source";
import type { SudokuPadCompatibilityReport } from "../diagnostics/warnings";
import { parseSclPayload } from "./scl";
import { normalizeSudokuPadSourcePuzzle, type NormalizeSudokuPadOptions } from "../normalize/normalizePuzzle";

export interface ParsedNativeSudokuPadPuzzle {
  sourcePuzzle: SudokuPadSourcePuzzle;
  scene: SudokuPadScene;
  logic: PuzzleLogic;
  compatibility: SudokuPadCompatibilityReport;
}

/** Phase-3 native SCL/CTC entry point. Remote IDs and other formats are Phase 4. */
export function parseNativeSudokuPadPayload(
  payload: string,
  options: NormalizeSudokuPadOptions = {},
): ParsedNativeSudokuPadPuzzle {
  const sourcePuzzle = parseSclPayload(payload);
  const normalized = normalizeSudokuPadSourcePuzzle(sourcePuzzle, options);
  return {
    sourcePuzzle,
    scene: normalized.scene,
    logic: normalized.logic,
    compatibility: normalized.compatibility,
  };
}
