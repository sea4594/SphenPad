import type { PuzzleLogic } from "../sudokupad/types/logic";
import type { SudokuPadScene } from "../sudokupad/types/scene";
import type { SudokuPadImportContext } from "../sudokupad/types/import";

export type CellRC = { r: number; c: number };

export type NoteSet = {
  corner: Set<string>;
  center: Set<string>;
  candidates: Set<string>;
};

export type CellState = {
  given?: string;
  value?: string;
  notes: NoteSet;
  highlights: string[];
  // Legacy save compatibility.
  color?: string;
};

export type LineStroke = {
  kind: "edge" | "center" | "both";
  color: string;
  segments: Array<{ a: CellRC; b: CellRC; edgeTrack?: "top" | "bottom" | "left" | "right" }>;
};

export type LineCenterMark = {
  rc: CellRC;
  kind: "circle" | "x";
  color: string;
};

export type LineEdgeMark = {
  a: CellRC;
  b: CellRC;
  color: string;
};

export type PuzzleMeta = {
  creatorPuzzle?: boolean;
  /** Creator projects stay out of My Puzzles until explicitly published. */
  creatorPublished?: boolean;
  // Creator-only catalog selections. These preserve planned elements whose
  // solving or rendering support has not been implemented yet.
  creatorElements?: string[];
  creatorElementNames?: Record<string, string>;
  creatorConstraintChecks?: Record<string, boolean>;
  creatorDigitRange?: { min: number; max: number };
  creatorRegionMode?: "none" | "regular" | "irregular";
  creatorBoxSize?: { rows: number; cols: number };
  creatorSudokuRules?: boolean;
  creatorSolverSettings?: { maxSolutions?: number; maxNodes?: number; logicalStepLimit?: number };
  creatorToolDefaults?: Record<string, { constraintValue?: string; patch?: Record<string, unknown> }>;
  title?: string;
  author?: string;
  collection?: string;
  constraints?: string[];
  rules?: string;
  postSolveMessage?: string;
  /** SphenPad-local solution override; persists even when imported scene/logic are derived. */
  solutionOverride?: string;
  solveCount?: number;
  archiveConstraints?: string[];
  archiveVideoTitle?: string;
  archiveVideoDate?: string;
  archiveVideoLengthSeconds?: number | null;
  archiveVideoHost?: string;
  archiveYouTubeUrl?: string;
  archiveSudokuPadUrl?: string;
};

export type PuzzleDefinition = {
  /** Native scene/logic schema version. */
  schemaVersion?: number;

  id: string;
  sourceId: string;
  sourcePayload?: string;
  /** Persisted alongside sourcePayload because URL settings/pack index are not encoded in the payload itself. */
  sourceContext?: SudokuPadImportContext;
  /** @deprecated Legacy duplicated decoded payload. New imports should not persist this. */
  sourceData?: unknown;
  importRevision?: number;
  size: number;
  rows: number;
  cols: number;
  meta: PuzzleMeta;
  givens: Array<{ rc: CellRC; v: string }>;

  /**
   * Authoritative visual model. Imported scenes are derived from sourcePayload
   * during storage hydration; SphenPad-authored puzzles persist this directly.
   */
  scene?: SudokuPadScene;

  /** Semantic/checker state, deliberately separate from visual rendering. */
  logic?: PuzzleLogic;

};

export type PlayStatus = "not_started" | "in_progress" | "complete";

export type PuzzleProgress = {
  startedAt?: number;
  totalMillis: number;
  status: PlayStatus;

  // Last known YouTube playback position for this puzzle's linked video.
  videoResumeSeconds?: number;

  selection: CellRC[];
  multiSelect: boolean;

  cells: CellState[][];
  lines: LineStroke[];
  lineCenterMarks: LineCenterMark[];
  lineEdgeMarks: LineEdgeMark[];

  entryMode: "value" | "center" | "corner" | "candidates";
  alphabetMode: boolean;
  alphabetPage: 0 | 1 | 2;

  highlightPalettePage: 0 | 1;
  activeHighlightColor: string;

  linePaletteColor: string;
  linePaletteKind: LineStroke["kind"];
  lineDoubleMode: boolean;

  // Exactly one visible tool on the puzzle page.
  activeTool: "value" | "center" | "corner" | "highlight" | "line";
  storedSelectionWhenLineTool?: CellRC[];

  paused: boolean;
};

export type PersistedPuzzle = {
  def: PuzzleDefinition;
  progress: PuzzleProgress;
  undo: unknown[];
  redo: unknown[];
  updatedAt: number;
  createdAt?: number;
};
