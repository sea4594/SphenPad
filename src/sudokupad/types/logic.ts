export interface PuzzleLogicCell {
  r: number;
  c: number;
}

/**
 * Semantic/checker information is deliberately separate from the render scene.
 * The renderer must remain able to display a puzzle even when SphenPad does not
 * understand every rule semantically.
 */
export interface PuzzleLogic {
  solution?: string;

  rowColCells?: PuzzleLogicCell[];
  rowColAreas?: PuzzleLogicCell[][];
  regions?: PuzzleLogicCell[][];

  antiKnight?: boolean;
  antiKing?: boolean;
  antiRook?: boolean;
  /** Whether ordinary row/column Sudoku all-different rules are active. */
  sudokuRules?: boolean;

  global?: string[];
  conflictChecker?: boolean;

  constraints?: PuzzleLogicConstraint[];

  [key: string]: unknown;
}

export interface PuzzleLogicConstraint {
  type: string;
  id?: string;
  sourceElementId?: string;
  cells?: PuzzleLogicCell[];
  path?: PuzzleLogicCell[];
  value?: string | number;
  kind?: string;
  [key: string]: unknown;
}
