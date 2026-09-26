export interface FpuzzlesCell {
  value?: string | number;
  given?: boolean;
  region?: number | null;
  centerPencilMarks?: Array<string | number>;
  cornerPencilMarks?: Array<string | number>;
  c?: string | number | null;
  cArray?: Array<string | number>;
  [key: string]: unknown;
}

export interface FpuzzlesPart {
  cell?: string;
  cells?: string[];
  cloneCells?: string[];
  lines?: string[][];
  values?: Array<string | number>;
  value?: string | number;
  direction?: "UR" | "UL" | "DR" | "DL" | string;
  outlineC?: string;
  baseC?: string;
  fontC?: string;
  width?: number;
  height?: number;
  size?: number;
  angle?: number;
  unique?: boolean;
  style?: string | null;
  fromConstraint?: string;
  [key: string]: unknown;
}

export interface FpuzzlesPuzzle {
  size?: number;
  grid?: FpuzzlesCell[][];
  title?: string;
  author?: string;
  ruleset?: string;
  solution?: string | Array<string | number>;
  metadata?: Record<string, unknown>;

  antiknight?: boolean;
  antiking?: boolean;
  nonconsecutive?: boolean;
  disjointgroups?: boolean;
  "diagonal+"?: boolean;
  "diagonal-"?: boolean;

  littlekillersum?: FpuzzlesPart[];
  arrow?: FpuzzlesPart[];
  killercage?: FpuzzlesPart[];
  cage?: FpuzzlesPart[];
  fogofwar?: string[];
  foglight?: string[];
  ratio?: FpuzzlesPart[];
  difference?: FpuzzlesPart[];
  xv?: FpuzzlesPart[];
  thermometer?: FpuzzlesPart[];
  palindrome?: FpuzzlesPart[];
  sandwichsum?: FpuzzlesPart[];
  even?: FpuzzlesPart[];
  odd?: FpuzzlesPart[];
  extraregion?: FpuzzlesPart[];
  clone?: FpuzzlesPart[];
  quadruple?: FpuzzlesPart[];
  betweenline?: FpuzzlesPart[];
  lockout?: FpuzzlesPart[];
  minimum?: FpuzzlesPart[];
  maximum?: FpuzzlesPart[];
  line?: FpuzzlesPart[];
  rectangle?: FpuzzlesPart[];
  circle?: FpuzzlesPart[];
  text?: FpuzzlesPart[];
  negative?: string[];
  triggereffect?: unknown[];

  disabledlogic?: unknown;
  truecandidatesoptions?: unknown;

  [key: string]: unknown;
}
