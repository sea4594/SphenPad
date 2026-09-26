import type { PuzzleProgress } from "../../core/model";
import type { SudokuPadScene } from "../types/scene";
import type { PuzzleLogic } from "../types/logic";
import { computePuzzleConflictCells } from "./conflicts";
import type { SudokuPadSourceGraphic, SudokuPadSourceLine } from "../types/source";

function symbolRank(symbol: string): number {
  const value = symbol.trim().toUpperCase();
  if (/^[1-9]$/.test(value)) return Number(value);
  if (value === "0") return 10;
  if (/^[A-Z]$/.test(value)) return 20 + value.charCodeAt(0) - 65;
  if (value === "*") return 200;
  return 300;
}

function sortSymbols(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => symbolRank(a) - symbolRank(b) || a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function lineKey(a: { r: number; c: number }, b: { r: number; c: number }): string {
  const ak = `${a.r},${a.c}`;
  const bk = `${b.r},${b.c}`;
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

type Segment = { a: { r: number; c: number }; b: { r: number; c: number }; colors: string[] };

function collectProgressSegments(progress: PuzzleProgress, kind: "center" | "edge"): Segment[] {
  const map = new Map<string, Segment>();
  for (const stroke of progress.lines ?? []) {
    const resolvedKind = stroke.kind === "edge" ? "edge" : "center";
    if (resolvedKind !== kind) continue;
    for (const segment of stroke.segments ?? []) {
      const key = lineKey(segment.a, segment.b);
      const current = map.get(key);
      if (current) {
        if (!current.colors.includes(stroke.color)) current.colors.push(stroke.color);
      } else {
        map.set(key, { a: segment.a, b: segment.b, colors: [stroke.color] });
      }
    }
  }
  return [...map.values()];
}

function offsetSegment(segment: Segment, offsetCells: number): [[number, number], [number, number]] {
  const dr = segment.b.r - segment.a.r;
  const dc = segment.b.c - segment.a.c;
  const length = Math.hypot(dr, dc) || 1;
  const rowOffset = (dc / length) * offsetCells;
  const colOffset = (-dr / length) * offsetCells;
  return [
    [segment.a.r + rowOffset, segment.a.c + colOffset],
    [segment.b.r + rowOffset, segment.b.c + colOffset],
  ];
}

function progressLines(progress: PuzzleProgress): SudokuPadSourceLine[] {
  const lines: SudokuPadSourceLine[] = [];
  const appendSegment = (segment: Segment, kind: "center" | "edge") => {
    const base: [[number, number], [number, number]] = kind === "center"
      ? [[segment.a.r + 0.5, segment.a.c + 0.5], [segment.b.r + 0.5, segment.b.c + 0.5]]
      : [[segment.a.r, segment.a.c], [segment.b.r, segment.b.c]];
    const thickness = kind === "center" ? 4.544 : 4.352;
    const colors = segment.colors.slice(0, 2);
    if (colors.length <= 1) {
      lines.push({ target: "cell-pen", wayPoints: base, color: colors[0] ?? "#ff08ff", thickness, className: "sphenpad-user-line" });
      return;
    }
    // Match the legacy double-line tool by drawing two narrowly separated strokes.
    const offset = (thickness / 2) / 64;
    const relative: Segment = {
      a: { r: base[0][0], c: base[0][1] },
      b: { r: base[1][0], c: base[1][1] },
      colors,
    };
    lines.push({ target: "cell-pen", wayPoints: offsetSegment(relative, -offset), color: colors[0], thickness, className: "sphenpad-user-line" });
    lines.push({ target: "cell-pen", wayPoints: offsetSegment(relative, offset), color: colors[1], thickness, className: "sphenpad-user-line" });
  };
  collectProgressSegments(progress, "center").forEach((segment) => appendSegment(segment, "center"));
  collectProgressSegments(progress, "edge").forEach((segment) => appendSegment(segment, "edge"));
  return lines;
}

function xMark(center: [number, number], radius: number, color: string, thickness: number): SudokuPadSourceLine[] {
  const [r, c] = center;
  return [
    { target: "cell-pen", wayPoints: [[r - radius, c - radius], [r + radius, c + radius]], color, thickness, className: "sphenpad-user-mark" },
    { target: "cell-pen", wayPoints: [[r - radius, c + radius], [r + radius, c - radius]], color, thickness, className: "sphenpad-user-mark" },
  ];
}

function progressMarks(progress: PuzzleProgress, rows: number, cols: number): { lines: SudokuPadSourceLine[]; graphics: SudokuPadSourceGraphic[] } {
  const lines: SudokuPadSourceLine[] = [];
  const graphics: SudokuPadSourceGraphic[] = [];
  for (const mark of progress.lineCenterMarks ?? []) {
    const center: [number, number] = [mark.rc.r + 0.5, mark.rc.c + 0.5];
    if (mark.kind === "circle") {
      graphics.push({
        target: "cell-pen",
        center,
        width: 0.36,
        height: 0.36,
        rounded: true,
        backgroundColor: "none",
        borderColor: mark.color,
        borderSize: 3.456,
        className: "sphenpad-user-mark",
      });
    } else {
      lines.push(...xMark(center, 0.18, mark.color, 3.456));
    }
  }
  for (const mark of progress.lineEdgeMarks ?? []) {
    const aInBounds = mark.a.r >= 0 && mark.a.c >= 0 && mark.a.r < rows && mark.a.c < cols;
    const bInBounds = mark.b.r >= 0 && mark.b.c >= 0 && mark.b.r < rows && mark.b.c < cols;
    const center: [number, number] = aInBounds && bInBounds
      ? [(mark.a.r + mark.b.r + 1) / 2, (mark.a.c + mark.b.c + 1) / 2]
      : [(mark.a.r + mark.b.r) / 2, (mark.a.c + mark.b.c) / 2];
    lines.push(...xMark(center, 0.11, mark.color, 2.944));
  }
  return { lines, graphics };
}


function parseSudorkle(value: unknown): Array<{ row: number; col: number; backgroundColor: string; text?: string }> {
  if (typeof value !== "string") return [];
  return value.split(/\s+/).flatMap((ref) => {
    const match = ref.match(/r([0-9+])c([0-9+])(#[a-zA-Z0-9]+)(?::(\S+))?/);
    if (!match) return [];
    return [{
      row: Number.parseFloat(match[1]) - 1,
      col: Number.parseFloat(match[2]) - 1,
      backgroundColor: match[3],
      ...(match[4] !== undefined ? { text: match[4] } : {}),
    }];
  });
}

/**
 * Merge SphenPad's mutable player state into a JSON-safe authored SudokuPad scene.
 * The authored scene is never mutated.
 */
export function sceneWithPuzzleProgress(scene: SudokuPadScene, progress: PuzzleProgress, logic?: PuzzleLogic, conflictChecker = true): SudokuPadScene {
  const conflictCells = computePuzzleConflictCells(progress, logic, scene.rows, scene.cols, conflictChecker);
  const cells = scene.cells.map((row, r) => row.map((sourceCell, c) => {
    const progressCell = progress.cells?.[r]?.[c];
    if (!progressCell) return { ...sourceCell };
    const colours = [...(progressCell.highlights ?? [])];
    if (!colours.length && progressCell.color) colours.push(progressCell.color);
    return {
      ...sourceCell,
      hasError: conflictCells.has(`${r}:${c}`),
      // Preserve the mutable player value even on authored-given cells. Stock
      // deep fog allows a hidden given to accept a normal value; that value is
      // what lights the cell when it matches the hidden given. Outside fog the
      // renderer still applies normal given > value visual precedence.
      value: progressCell.value ?? sourceCell.value,
      ...(progressCell.notes?.center?.size ? { candidates: sortSymbols(progressCell.notes.center) } : {}),
      ...(progressCell.notes?.corner?.size ? { pencilmarks: sortSymbols(progressCell.notes.corner) } : {}),
      colours,
    };
  }));
  const marks = progressMarks(progress, scene.rows, scene.cols);
  const sudorkleCells = progress.status === "complete" ? parseSudorkle(scene.metadata.sudorkle) : [];
  return {
    ...scene,
    cells,
    lines: [...scene.lines, ...progressLines(progress), ...marks.lines],
    overlays: [...scene.overlays, ...marks.graphics],
    ...(sudorkleCells.length ? { sudorkle: { cells: sudorkleCells } } : { sudorkle: undefined }),
  };
}
