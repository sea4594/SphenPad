/**
 * Compatibility facade for the replaced SudokuPad importer.
 *
 * The previous heuristic importer lived in this file. Production imports now go
 * through src/sudokupad/*, which ports the pinned stock SudokuPad pipeline.
 */
export { SUDOKUPAD_IMPORT_REVISION, loadSudokuPadForApp as loadFromSudokuPad } from "../sudokupad/app/coreAdapter";
