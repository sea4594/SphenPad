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
  color?: string;
};

export type LineStroke = {
  kind: "edge" | "center" | "both";
  color: string;
  segments: Array<{ a: CellRC; b: CellRC }>;
};

export type PuzzleMeta = {
  title?: string;
  author?: string;
  rules?: string;
};

export type PuzzleCosmetics = {
  backgroundImageUrl?: string;
  cages?: Array<{ cells: CellRC[]; sum?: string; color?: string }>;
  arrows?: Array<{ bulb: CellRC; path: CellRC[] }>;
  dots?: Array<{ a: CellRC; b: CellRC; kind: "black" | "white" }>;
};

export type PuzzleDefinition = {
  id: string;
  sourceId: string;
  size: number;
  meta: PuzzleMeta;
  givens: Array<{ rc: CellRC; v: string }>;
  cosmetics: PuzzleCosmetics;
};

export type PlayStatus = "not_started" | "in_progress" | "complete";

export type PuzzleProgress = {
  startedAt?: number;
  totalMillis: number;
  status: PlayStatus;

  selection: CellRC[];
  multiSelect: boolean;

  cells: CellState[][];
  lines: LineStroke[];

  entryMode: "value" | "center" | "corner" | "candidates";
  alphabetMode: boolean;

  highlightPalettePage: 0 | 1 | 2;
  activeHighlightColor: string;

  linePaletteColor: string;
  linePaletteKind: LineStroke["kind"];

  paused: boolean;
};

export type PersistedPuzzle = {
  def: PuzzleDefinition;
  progress: PuzzleProgress;
  undo: unknown[];
  redo: unknown[];
  updatedAt: number;
};
