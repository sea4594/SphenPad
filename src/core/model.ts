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
  title?: string;
  author?: string;
  rules?: string;
  postSolveMessage?: string;
};

export type PuzzleCosmetics = {
  backgroundImageUrl?: string;
  cages?: Array<{ cells: CellRC[]; sum?: string; color?: string }>;
  arrows?: Array<{ bulb: CellRC; path: CellRC[] }>;
  dots?: Array<{ a: CellRC; b: CellRC; kind: "black" | "white" }>;
  lines?: Array<{ wayPoints: Array<{ x: number; y: number }>; color?: string; thickness?: number }>;
  underlays?: Array<{
    center: { x: number; y: number };
    width?: number;
    height?: number;
    rounded?: boolean;
    color?: string;
    borderColor?: string;
    borderThickness?: number;
    text?: string;
    textColor?: string;
    textSize?: number;
    angle?: number;
  }>;
  overlays?: Array<{
    center: { x: number; y: number };
    width?: number;
    height?: number;
    rounded?: boolean;
    color?: string;
    borderColor?: string;
    borderThickness?: number;
    text?: string;
    textColor?: string;
    textSize?: number;
    angle?: number;
  }>;
  
  // Line constraints
  thermolines?: Array<{ path: CellRC[]; color?: string }>;
  whispers?: Array<{ path: CellRC[]; color?: string }>;
  palindromes?: Array<{ path: CellRC[]; color?: string }>;
  renbanlines?: Array<{ path: CellRC[]; color?: string }>;
  entropics?: Array<{ path: CellRC[]; color?: string }>;
  germanwhispers?: Array<{ path: CellRC[]; color?: string }>;
  modularlines?: Array<{ path: CellRC[]; color?: string }>;
  
  // Clues around grid
  skyscraper?: { top?: string[]; bottom?: string[]; left?: string[]; right?: string[] };
  sandwich?: { top?: string[]; bottom?: string[]; left?: string[]; right?: string[] };
  xsum?: { top?: string[]; bottom?: string[]; left?: string[]; right?: string[] };
  littlekillers?: Array<{ rc: CellRC; direction: "tl" | "tr" | "bl" | "br"; value: string; color?: string }>;
  
  // Regions
  irregularRegions?: Array<{ cells: CellRC[]; color?: string }>;
  disjointGroups?: Array<{ cells: CellRC[]; color?: string }>;
  
  // Anti-constraints
  antiKnight?: boolean;
  antiKing?: boolean;
  antiRook?: boolean;

  // Fog of war
  fogLights?: CellRC[];
  fogTriggerEffects?: Array<{ triggerCells: CellRC[]; revealCells: CellRC[]; triggerMode?: string }>;
  solution?: string;
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
  lineCenterMarks: LineCenterMark[];
  lineEdgeMarks: LineEdgeMark[];

  entryMode: "value" | "center" | "corner" | "candidates";
  alphabetMode: boolean;

  highlightPalettePage: 0 | 1 | 2;
  activeHighlightColor: string;

  linePaletteColor: string;
  linePaletteKind: LineStroke["kind"];

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
};
