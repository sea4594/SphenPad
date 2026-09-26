import type { SudokuPadScene } from "../types/scene";
import { getSudokuPadPuzzleFont } from "../assets/fontRegistry";

/**
 * Exact class projection used by the production SudokuPadBoard wrapper.
 * Kept DOM-free so browser conformance can validate the production setting
 * wiring without depending on React itself.
 */
export function sudokuPadBoardClassNames(scene: SudokuPadScene): string[] {
  const settings = scene.renderSettings;
  return [
    "sphenpad-sudokupad-renderer",
    settings.darkMode ? "setting-darkmode" : "",
    settings.largeDigits ? "setting-largedigits" : "",
    settings.alternateMarks ? "setting-altmarks" : "",
    settings.hideColours ? "setting-hidecolours" : "",
    settings.dashedGrid ? "setting-dashedgrid" : "",
    settings.noGrid ? "setting-nogrid" : "",
    settings.outlineDigits ? "setting-outlinesondigits" : "",
    settings.outlineLines ? "setting-outlinesonlines" : "",
    settings.labelRowsCols ? "setting-labelrowscols" : "",
    settings.compactMarks ? "setting-compactmarks" : "",
    settings.barbieMode ? "setting-barbie" : "",
    getSudokuPadPuzzleFont(settings.puzzleFont) ? `puzzlefont-${settings.puzzleFont}` : "",
  ].filter(Boolean);
}
