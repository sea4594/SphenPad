import type { CellRC, PersistedPuzzle, PuzzleDefinition, PuzzleProgress } from "../../core/model";
import { makeInitialProgress } from "../../core/scl";

export type CreatorEditorSessionState = {
  selection: CellRC[];
  multiSelect: boolean;
  creatorTab: "file" | "elements" | "tools";
  activeCatalogElement: string | null;
  selectedObjectId: string | null;
  selectedObjectIds?: string[];
  elementKind: "given" | "cage" | "thermo" | "arrow" | "whisper" | "renban" | "palindrome" | "dot" | "region" | "fog";
  authoringOpen: boolean;
  addingElement: boolean;
  editorTool: PuzzleProgress["activeTool"];
  editorAlphabetMode: boolean;
  editorAlphabetPage: 0 | 1 | 2;
  editorHighlightPage: 0 | 1;
  editorLineColor: string;
  editorLineDouble: boolean;
  canvasZoom?: number;
  canvasPan?: { x: number; y: number };
};

export type CreatorPlaytestRouteState = {
  creatorPlaytest?: {
    projectKey: string;
    editorState: CreatorEditorSessionState;
  };
};

function inBounds(def: PuzzleDefinition, rc: CellRC) {
  return rc.r >= 0 && rc.c >= 0 && rc.r < def.rows && rc.c < def.cols;
}

function gameplaySignature(def: PuzzleDefinition) {
  return JSON.stringify({
    rows: def.rows,
    cols: def.cols,
    givens: def.givens,
    solution: def.meta.solutionOverride ?? "",
    sudokuRules: def.meta.creatorSudokuRules ?? true,
    logic: def.logic ?? null,
  });
}

function hasSolveProgress(progress: PuzzleProgress, fresh: PuzzleProgress) {
  for (let r = 0; r < progress.cells.length; r++) {
    for (let c = 0; c < (progress.cells[r]?.length ?? 0); c++) {
      const oldCell = progress.cells[r]?.[c];
      const baseCell = fresh.cells[r]?.[c];
      if (!oldCell || !baseCell || oldCell.given) continue;
      if (oldCell.value || oldCell.notes.center.size || oldCell.notes.corner.size || oldCell.notes.candidates.size || oldCell.highlights.length) return true;
    }
  }
  return Boolean(progress.lines.length || progress.lineCenterMarks.length || progress.lineEdgeMarks.length);
}

export function rebaseCreatorSolveState(existing: PersistedPuzzle | null, def: PuzzleDefinition) {
  const fresh = makeInitialProgress(def);
  if (!existing) return { progress: fresh, preserveHistory: false };

  const sameGameplay = gameplaySignature(existing.def) === gameplaySignature(def);
  const old = existing.progress;
  const cells = fresh.cells.map((row, r) => row.map((baseCell, c) => {
    const oldCell = old.cells[r]?.[c];
    if (!oldCell || oldCell.given || baseCell.given) return baseCell;
    return {
      ...baseCell,
      value: oldCell.value,
      notes: {
        center: new Set(oldCell.notes.center),
        corner: new Set(oldCell.notes.corner),
        candidates: new Set(oldCell.notes.candidates),
      },
      highlights: [...(oldCell.highlights ?? [])],
    };
  }));

  const selection = (old.selection ?? []).filter((rc) => inBounds(def, rc));
  const lines = (old.lines ?? []).map((line) => ({
    ...line,
    segments: line.segments.filter((segment) => inBounds(def, segment.a) && inBounds(def, segment.b)),
  })).filter((line) => line.segments.length);
  const lineCenterMarks = (old.lineCenterMarks ?? []).filter((mark) => inBounds(def, mark.rc));
  const lineEdgeMarks = (old.lineEdgeMarks ?? []).filter((mark) => inBounds(def, mark.a) && inBounds(def, mark.b));

  const progress: PuzzleProgress = {
    ...fresh,
    ...old,
    cells,
    selection,
    lines,
    lineCenterMarks,
    lineEdgeMarks,
  };

  if (!sameGameplay) {
    progress.status = hasSolveProgress(progress, fresh) ? "in_progress" : "not_started";
    progress.paused = false;
  }

  return { progress, preserveHistory: sameGameplay };
}

export function freshCreatorPlaytestData(source: PersistedPuzzle): PersistedPuzzle {
  return {
    ...source,
    progress: makeInitialProgress(source.def),
    undo: [],
    redo: [],
    updatedAt: Date.now(),
  };
}

export function makeCreatorPlaytestRouteState(projectKey: string, editorState: CreatorEditorSessionState): CreatorPlaytestRouteState {
  return { creatorPlaytest: { projectKey, editorState } };
}

export function readCreatorPlaytestRouteState(value: unknown): CreatorPlaytestRouteState["creatorPlaytest"] | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as CreatorPlaytestRouteState).creatorPlaytest;
  if (!candidate || typeof candidate !== "object" || typeof candidate.projectKey !== "string") return null;
  if (!candidate.editorState || typeof candidate.editorState !== "object") return null;
  return candidate;
}
