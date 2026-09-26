import type { PuzzleLogic } from "./logic";
import type { SudokuPadScene } from "./scene";
import type { ResolvedSudokuPadInput, SudokuPadCanonicalFormat, SudokuPadUrlSettings } from "./formats";
import type { SudokuPadSourcePuzzle } from "./source";
import type { SudokuPadCompatibilityReport } from "../diagnostics/warnings";


export interface SudokuPadImportContext {
  sourceId: string;
  format?: SudokuPadCanonicalFormat;
  urlSettings: SudokuPadUrlSettings;
}

/**
 * Output of the new importer pipeline before it is adapted into core PuzzleDefinition.
 * Keeping this boundary explicit prevents format decoders from depending on UI/storage.
 */
export interface SudokuPadImportResult {
  input: ResolvedSudokuPadInput;
  sourcePayload: string;
  sourcePuzzle: SudokuPadSourcePuzzle;
  scene: SudokuPadScene;
  logic: PuzzleLogic;
  compatibility: SudokuPadCompatibilityReport;
  context: SudokuPadImportContext;
}
