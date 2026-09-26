export interface SudokuPadRenderSettings {
  darkMode: boolean;
  largeDigits: boolean;
  alternateMarks: boolean;

  hideColours: boolean;
  dashedGrid: boolean;
  noGrid: boolean;

  outlineDigits: boolean;
  outlineLines: boolean;

  arrowsAboveLines: boolean;

  hideBackgroundImage: boolean;
  disableEmoji: boolean;

  puzzleFont?: string;

  /** Optional stock visual features that affect the SVG itself. */
  labelRowsCols: boolean;
  compactMarks: boolean;
  /** Stock /barbie/... route recolors the grid and givens pink. */
  barbieMode: boolean;

  /** Reproduce stock ID-specific demo assets gated behind #experimental. */
  experimentalMode: boolean;
}

/**
 * Canonical settings profile used for compatibility snapshots and deterministic
 * rendering. Application preferences can override this explicitly later.
 */
export const DEFAULT_SUDOKUPAD_RENDER_SETTINGS: Readonly<SudokuPadRenderSettings> = {
  darkMode: false,
  largeDigits: false,
  alternateMarks: false,

  hideColours: false,
  dashedGrid: false,
  noGrid: false,

  outlineDigits: false,
  outlineLines: false,

  arrowsAboveLines: false,

  hideBackgroundImage: false,
  disableEmoji: false,

  labelRowsCols: false,
  compactMarks: false,
  barbieMode: false,

  experimentalMode: false,
};
