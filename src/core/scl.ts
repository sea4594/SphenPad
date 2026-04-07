import type { PuzzleDefinition, PuzzleProgress, CellState } from "./model";

function emptyCell(): CellState {
  return {
    notes: { corner: new Set(), center: new Set(), candidates: new Set() },
    highlights: [],
    color: undefined,
    value: undefined,
    given: undefined,
  };
}

export function makeInitialProgress(def: PuzzleDefinition): PuzzleProgress {
  const rows = Math.max(1, Number(def.rows ?? def.size));
  const cols = Math.max(1, Number(def.cols ?? def.size));
  const cells: CellState[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => emptyCell()));

  for (const g of def.givens) {
    if (g.rc.r < 0 || g.rc.c < 0 || g.rc.r >= rows || g.rc.c >= cols) continue;
    cells[g.rc.r][g.rc.c].given = g.v;
    cells[g.rc.r][g.rc.c].value = g.v;
  }

  return {
    totalMillis: 0,
    status: "not_started",
    selection: [{ r: 0, c: 0 }],
    multiSelect: false,
    cells,
    lines: [],
    lineCenterMarks: [],
    lineEdgeMarks: [],
    entryMode: "value",
    alphabetMode: false,
    alphabetPage: 0,
    highlightPalettePage: 0,
    activeHighlightColor: "#ffd0d0",
    linePaletteColor: "#ff08ff",
    linePaletteKind: "both",
    lineDoubleMode: false,
    activeTool: "value",
    paused: true,
  };
}