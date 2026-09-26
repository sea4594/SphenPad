import type {
  SudokuPadMetadata,
  SudokuPadPoint,
  SudokuPadSourceArrow,
  SudokuPadSourceCage,
  SudokuPadSourceGraphic,
  SudokuPadSourceLine,
  SudokuPadTriggerEffect,
} from "./source";
import type { SudokuPadRenderSettings } from "./settings";

export const SUDOKUPAD_CELL_SIZE = 64;

export const SUDOKUPAD_SVG_LAYER_ORDER = [
  "background",
  "underlay",
  "cell-colors",
  "arrows",
  "cages",
  "cell-highlights",
  "cell-grids",
  "cell-errors",
  "overlay",
  "cell-givens",
  "cell-pen",
  "cell-pencilmarks",
  "cell-candidates",
  "cell-values",
] as const;

export type SudokuPadSvgLayer = (typeof SUDOKUPAD_SVG_LAYER_ORDER)[number];

export interface SudokuPadSceneCell {
  row: number;
  col: number;

  given?: string;
  value?: string;

  givenCentremarks?: string[];
  givenCornermarks?: string[];

  /** Mutable display state is supplied by the board/progress adapter in Phase 6. */
  candidates?: string[];
  pencilmarks?: string[];
  colours?: string[];
  pen?: string[];
  highlighted?: boolean;
  hasError?: boolean;

  hideClue?: boolean;

  [key: string]: unknown;
}

export interface SudokuPadFogTriggerLink {
  triggerCells: SudokuPadPoint[];
  effectCells: SudokuPadPoint[];
}


export interface SudokuPadSudorkleCell {
  row: number;
  col: number;
  backgroundColor: string;
  text?: string;
}

export interface SudokuPadSudorkleState {
  cells: SudokuPadSudorkleCell[];
}

export interface SudokuPadFogDefinition {
  initialLightCells: SudokuPadPoint[];
  triggerEffects: SudokuPadTriggerEffect[];
  triggerLinks?: SudokuPadFogTriggerLink[];
  [key: string]: unknown;
}

/**
 * JSON-safe, DOM-free renderer input.
 *
 * For imported SudokuPad puzzles this scene is DERIVED from sourcePayload and
 * should not become a second persisted copy of the same puzzle. Creator puzzles
 * can persist a native scene because it is their primary authored representation.
 */
export interface SudokuPadScene {
  version: number;
  /** Needed for a handful of stock SudokuPad historical visual exceptions. */
  puzzleId?: string;
  rows: number;
  cols: number;

  cells: SudokuPadSceneCell[][];

  regions: SudokuPadSourceCage[];
  cages: SudokuPadSourceCage[];

  lines: SudokuPadSourceLine[];
  arrows: SudokuPadSourceArrow[];

  underlays: SudokuPadSourceGraphic[];
  overlays: SudokuPadSourceGraphic[];

  metadata: SudokuPadMetadata;
  fog?: SudokuPadFogDefinition;
  global?: string[];

  renderSettings: SudokuPadRenderSettings;

  /** Transient completion overlay used by stock metadata.sudorkle. */
  sudorkle?: SudokuPadSudorkleState;

  /** Original unknown top-level native fields retained for compatibility/auditing. */
  unknown: Record<string, unknown>;
}
