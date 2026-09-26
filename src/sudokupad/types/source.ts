/**
 * Native SudokuPad/SCL source-puzzle types for the pinned 0.612.0 compatibility target.
 *
 * These types are intentionally open-ended. Stock SudokuPad preserves and forwards
 * additional fields (including safe SVG attributes), so import code must not discard
 * properties merely because SphenPad does not know them yet.
 */

export type SudokuPadPoint = [row: number, column: number];

export interface SudokuPadSourcePuzzle {
  id?: string;
  cellSize?: number;

  cells: SudokuPadSourceCell[][];
  regions?: SudokuPadPoint[][];
  cages?: SudokuPadSourceCage[];
  lines?: SudokuPadSourceLine[];
  arrows?: SudokuPadSourceArrow[];
  underlays?: SudokuPadSourceGraphic[];
  overlays?: SudokuPadSourceGraphic[];

  metadata?: SudokuPadMetadata;
  metaData?: SudokuPadMetadata;

  videos?: SudokuPadSourceVideo[];

  foglight?: SudokuPadPoint[];
  triggereffect?: SudokuPadTriggerEffect[];
  global?: string[];

  windoku?: boolean;
  "diagonal+"?: boolean;
  "diagonal-"?: boolean;

  [key: string]: unknown;
}

export interface SudokuPadSourceCell {
  value?: string | number;
  pencilMarks?: Array<string | number>;
  centremarks?: Array<string | number>;
  [key: string]: unknown;
}

export type SudokuPadCageStyle =
  | "killer"
  | "box"
  | "windoku"
  | "selectioncage"
  | "extraregion"
  | "fpRowIndexer"
  | "fpColumnIndexer"
  | "fpBoxIndexer"
  | "hidden";

export interface SudokuPadSourceCage {
  cells: SudokuPadPoint[];

  value?: string | number;
  sum?: number;

  style?: SudokuPadCageStyle | string | null;
  type?: string;
  unique?: boolean;
  hidden?: boolean;

  fontC?: string;
  outlineC?: string;
  // Native SudokuPad cage payloads may carry the renderer-facing names
  // directly. Keep them typed because stock loadPuzzle passes cages through.
  textColor?: string;
  borderColor?: string;
  feature?: string;

  [key: string]: unknown;
}

export interface SudokuPadSourceLine {
  target?: string;
  wayPoints?: SudokuPadPoint[];
  d?: string;

  color?: string;
  thickness?: number;
  opacity?: number;

  className?: string;
  feature?: string;

  [key: string]: unknown;
}

export interface SudokuPadSourceArrow {
  target?: string;
  wayPoints: SudokuPadPoint[];

  color?: string;
  opacity?: number;
  thickness?: number;

  headLength?: number;
  headStyle?: "stroke" | "fill" | string;
  headAngle?: number;
  headIndent?: number;

  feature?: string;

  [key: string]: unknown;
}

export interface SudokuPadSourceGraphic {
  target?: string;
  center?: SudokuPadPoint;

  width?: number;
  height?: number;
  angle?: number;

  borderSize?: number;
  thickness?: number;

  backgroundColor?: string;
  borderColor?: string;

  rounded?: boolean;
  roundedRadius?: number;

  opacity?: number;

  text?: string;
  textColor?: string;
  fontSize?: number;
  textStroke?: string;
  textAnchor?: string;
  maxWidth?: number;

  /** SphenPad creator cosmetic image; rendered through the existing asset resolver. */
  imageUrl?: string;
  preserveAspectRatio?: string;

  className?: string;
  feature?: string;

  [key: string]: unknown;
}

export interface SudokuPadMetadata {
  title?: string;
  author?: string;
  rules?: string | string[];
  solution?: string | number;

  source?: string;
  norowcol?: boolean;

  bgimage?: string;
  bgimageopacity?: string | number;
  bgimagetarget?: string;

  grids?: unknown;

  msgcorrect?: string;
  msgincorrect?: string;
  msgvalid?: string;
  msginvalid?: string;
  msgunknown?: string;

  [key: string]: unknown;
}

export interface SudokuPadSourceVideo {
  id?: string;
  title?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface SudokuPadTriggerEffectSide {
  type?: string;
  cell?: string;
  cells?: string | string[];
  [key: string]: unknown;
}

export interface SudokuPadTriggerEffect {
  trigger?: SudokuPadTriggerEffectSide;
  effect?: SudokuPadTriggerEffectSide;
  [key: string]: unknown;
}
