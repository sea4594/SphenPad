import type { PuzzleProgress } from "../../core/model";
import type { SudokuPadScene } from "../types/scene";
import type { PuzzleLogic } from "../types/logic";
import { computePuzzleConflictCells, computePuzzleConflictMarks } from "./conflicts";
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

function cellKey(cell: { r: number; c: number }): string { return `${cell.r},${cell.c}`; }
function compareCells(a: { r: number; c: number }, b: { r: number; c: number }): number { return a.r - b.r || a.c - b.c; }
function lineKey(a: { r: number; c: number }, b: { r: number; c: number }): string {
  return compareCells(a, b) <= 0 ? `${cellKey(a)}|${cellKey(b)}` : `${cellKey(b)}|${cellKey(a)}`;
}

type Point = [number, number];
type Segment = { key: string; a: { r: number; c: number }; b: { r: number; c: number }; colors: string[] };
type RenderedSegment = { key: string; nodeA: string; nodeB: string; color: string; a: Point; b: Point; rawA: Point; rawB: Point };
type LaneConstraint = { a: string; b: string; parity: 0 | 1; weight: number; order: string };

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
        map.set(key, { key, a: segment.a, b: segment.b, colors: [stroke.color] });
      }
    }
  }
  return [...map.values()];
}

function basePoint(cell: { r: number; c: number }, kind: "center" | "edge"): Point {
  return kind === "center" ? [cell.r + 0.5, cell.c + 0.5] : [cell.r, cell.c];
}

function canonicalSegment(segment: Segment, kind: "center" | "edge") {
  const reversed = compareCells(segment.a, segment.b) > 0;
  const aCell = reversed ? segment.b : segment.a;
  const bCell = reversed ? segment.a : segment.b;
  const a = basePoint(aCell, kind), b = basePoint(bCell, kind);
  const dr = b[0] - a[0], dc = b[1] - a[1], length = Math.hypot(dr, dc) || 1;
  return { reversed, aCell, bCell, a, b, normal: [dc / length, -dr / length] as Point };
}

function normalizedDirection(from: Point, to: Point): Point {
  const dr = to[0] - from[0], dc = to[1] - from[1], length = Math.hypot(dr, dc) || 1;
  return [dr / length, dc / length];
}
function dot(a: Point, b: Point): number { return a[0] * b[0] + a[1] * b[1]; }
function cross(a: Point, b: Point): number { return a[0] * b[1] - a[1] * b[0]; }
function leftNormal(direction: Point): Point { return [direction[1], -direction[0]]; }
function distance(a: Point, b: Point): number { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

class ParityGroups {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();
  private xorToParent = new Map<string, 0 | 1>();
  add(key: string) { if (!this.parent.has(key)) { this.parent.set(key, key); this.rank.set(key, 0); this.xorToParent.set(key, 0); } }
  find(key: string): { root: string; parity: 0 | 1 } {
    this.add(key);
    const parent = this.parent.get(key)!;
    if (parent === key) return { root: key, parity: 0 };
    const found = this.find(parent);
    const parity = (this.xorToParent.get(key)! ^ found.parity) as 0 | 1;
    this.parent.set(key, found.root); this.xorToParent.set(key, parity);
    return { root: found.root, parity };
  }
  union(a: string, b: string, parity: 0 | 1): boolean {
    const fa = this.find(a), fb = this.find(b);
    if (fa.root === fb.root) return (fa.parity ^ fb.parity) === parity;
    let ra = fa.root, rb = fb.root, pa = fa.parity, pb = fb.parity;
    if ((this.rank.get(ra) ?? 0) > (this.rank.get(rb) ?? 0)) { [ra, rb] = [rb, ra]; [pa, pb] = [pb, pa]; }
    this.parent.set(ra, rb);
    this.xorToParent.set(ra, (pa ^ pb ^ parity) as 0 | 1);
    if ((this.rank.get(ra) ?? 0) === (this.rank.get(rb) ?? 0)) this.rank.set(rb, (this.rank.get(rb) ?? 0) + 1);
    return true;
  }
  relation(a: string, b: string): 0 | 1 | null {
    const fa = this.find(a), fb = this.find(b);
    return fa.root === fb.root ? (fa.parity ^ fb.parity) as 0 | 1 : null;
  }
}

function laneAssignments(segments: Segment[], kind: "center" | "edge"): Map<string, 0 | 1> {
  const doubles = segments.filter((segment) => segment.colors.length >= 2);
  const singles = segments.filter((segment) => segment.colors.length === 1);
  const constraints: LaneConstraint[] = [];
  const incidentDoubles = new Map<string, Segment[]>(), incidentSingles = new Map<string, Segment[]>();
  const addIncident = (map: Map<string, Segment[]>, node: string, segment: Segment) => map.set(node, [...(map.get(node) ?? []), segment]);
  for (const segment of doubles) { addIncident(incidentDoubles, cellKey(segment.a), segment); addIncident(incidentDoubles, cellKey(segment.b), segment); }
  for (const segment of singles) { addIncident(incidentSingles, cellKey(segment.a), segment); addIncident(incidentSingles, cellKey(segment.b), segment); }

  for (const [node, list] of incidentDoubles) {
    const nodeCell = (() => { const [r, c] = node.split(",").map(Number); return { r, c }; })();
    const nodePoint = basePoint(nodeCell, kind);
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
      const first = list[i], second = list[j];
      const shared = first.colors.slice(0, 2).filter((color) => second.colors.slice(0, 2).includes(color));
      if (!shared.length) continue;
      const firstInfo = canonicalSegment(first, kind), secondInfo = canonicalSegment(second, kind);
      const firstOther = cellKey(first.a) === node ? basePoint(first.b, kind) : basePoint(first.a, kind);
      const secondOther = cellKey(second.a) === node ? basePoint(second.b, kind) : basePoint(second.a, kind);
      const firstOut = normalizedDirection(nodePoint, firstOther), secondOut = normalizedDirection(nodePoint, secondOther);
      const firstPathLeftPositive = dot(firstInfo.normal, leftNormal([-firstOut[0], -firstOut[1]])) > 0;
      const secondPathLeftPositive = dot(secondInfo.normal, leftNormal(secondOut)) > 0;
      const color = shared[0], firstIndex = first.colors.indexOf(color), secondIndex = second.colors.indexOf(color);
      const parity = ((firstIndex ^ secondIndex ^ Number(firstPathLeftPositive) ^ Number(secondPathLeftPositive)) & 1) as 0 | 1;
      const continuity = (1 - dot(firstOut, secondOut)) / 2;
      constraints.push({ a: first.key, b: second.key, parity, weight: 10 + continuity * 10 + shared.length, order: `pair:${node}:${first.key}:${second.key}` });
    }

    for (const doubled of list) for (const single of incidentSingles.get(node) ?? []) {
      const color = single.colors[0];
      const colorIndex = doubled.colors.slice(0, 2).indexOf(color);
      if (colorIndex < 0) continue;
      const info = canonicalSegment(doubled, kind);
      const singleOther = cellKey(single.a) === node ? basePoint(single.b, kind) : basePoint(single.a, kind);
      const branch = normalizedDirection(nodePoint, singleOther);
      const toward = dot(info.normal, branch);
      if (Math.abs(toward) < 0.15) continue;
      const preferredPositive = toward > 0 ? 1 : 0;
      const value = ((colorIndex ^ preferredPositive) & 1) as 0 | 1;
      constraints.push({ a: doubled.key, b: "@fixed", parity: value, weight: 8 + Math.abs(toward) * 6, order: `branch:${node}:${doubled.key}:${single.key}:${color}` });
    }
  }

  for (const segment of doubles) {
    const defaultValue = canonicalSegment(segment, kind).reversed ? 1 : 0;
    constraints.push({ a: segment.key, b: "@fixed", parity: defaultValue, weight: 0.01, order: `default:${segment.key}` });
  }

  const groups = new ParityGroups(); groups.add("@fixed");
  for (const segment of doubles) groups.add(segment.key);
  constraints.sort((a, b) => b.weight - a.weight || a.order.localeCompare(b.order));
  for (const constraint of constraints) groups.union(constraint.a, constraint.b, constraint.parity);
  const result = new Map<string, 0 | 1>();
  for (const segment of doubles) result.set(segment.key, groups.relation(segment.key, "@fixed") ?? 0);
  return result;
}

function tidyProgressLineJunctions(rendered: RenderedSegment[], segmentsByKey: Map<string, Segment>, kind: "center" | "edge", offset: number) {
  type EndpointRef = { segment: RenderedSegment; endpoint: "a" | "b"; node: string };
  const byNodeColor = new Map<string, EndpointRef[]>();
  for (const segment of rendered) for (const endpoint of ["a", "b"] as const) {
    const node = endpoint === "a" ? segment.nodeA : segment.nodeB;
    const key = `${node}|${segment.color}`;
    byNodeColor.set(key, [...(byNodeColor.get(key) ?? []), { segment, endpoint, node }]);
  }
  for (const refs of byNodeColor.values()) {
    if (refs.length !== 2) continue;
    const [first, second] = refs;
    if (first.segment.key === second.segment.key) continue;
    const [r, c] = first.node.split(",").map(Number), nodePoint = basePoint({ r, c }, kind);
    const pointOf = (ref: EndpointRef) => ref.endpoint === "a" ? ref.segment.rawA : ref.segment.rawB;
    const otherOf = (ref: EndpointRef) => ref.endpoint === "a" ? ref.segment.rawB : ref.segment.rawA;
    const p1 = pointOf(first), p2 = pointOf(second), u1 = normalizedDirection(p1, otherOf(first)), u2 = normalizedDirection(p2, otherOf(second));
    const det = cross(u1, u2);
    let join: Point | null = null;
    if (Math.abs(det) > 0.12) {
      const delta: Point = [p2[0] - p1[0], p2[1] - p1[1]];
      const t = cross(delta, u2) / det;
      const candidate: Point = [p1[0] + t * u1[0], p1[1] + t * u1[1]];
      if (distance(candidate, nodePoint) <= offset * 2.75 + 1e-6) join = candidate;
    } else if (distance(p1, p2) <= offset * 0.3 + 1e-6) {
      join = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    } else {
      const firstSource = segmentsByKey.get(first.segment.key), secondSource = segmentsByKey.get(second.segment.key);
      const firstDouble = (firstSource?.colors.length ?? 0) >= 2, secondDouble = (secondSource?.colors.length ?? 0) >= 2;
      if (firstDouble !== secondDouble && dot(u1, u2) < -0.9) join = firstDouble ? p1 : p2;
    }
    if (!join) continue;
    if (first.endpoint === "a") first.segment.a = join; else first.segment.b = join;
    if (second.endpoint === "a") second.segment.a = join; else second.segment.b = join;
  }
}

function progressLines(progress: PuzzleProgress): SudokuPadSourceLine[] {
  const lines: SudokuPadSourceLine[] = [];
  const appendKind = (kind: "center" | "edge") => {
    const segments = collectProgressSegments(progress, kind);
    const assignments = laneAssignments(segments, kind);
    const thickness = kind === "center" ? 4.544 : 4.352;
    const offset = (thickness / 2) / 64;
    const rendered: RenderedSegment[] = [];
    for (const segment of segments) {
      const colors = segment.colors.slice(0, 2), info = canonicalSegment(segment, kind);
      if (colors.length <= 1) {
        rendered.push({ key: segment.key, nodeA: cellKey(info.aCell), nodeB: cellKey(info.bCell), color: colors[0] ?? "#ff08ff", a: [...info.a], b: [...info.b], rawA: [...info.a], rawB: [...info.b] });
        continue;
      }
      const assignment = assignments.get(segment.key) ?? 0;
      colors.forEach((color, index) => {
        const positive = Boolean(index ^ assignment), amount = positive ? offset : -offset;
        const a: Point = [info.a[0] + info.normal[0] * amount, info.a[1] + info.normal[1] * amount], b: Point = [info.b[0] + info.normal[0] * amount, info.b[1] + info.normal[1] * amount];
        rendered.push({ key: segment.key, nodeA: cellKey(info.aCell), nodeB: cellKey(info.bCell), color, a: [...a], b: [...b], rawA: a, rawB: b });
      });
    }
    tidyProgressLineJunctions(rendered, new Map(segments.map((segment) => [segment.key, segment])), kind, offset);
    for (const segment of rendered) lines.push({ target: "cell-pen", wayPoints: [segment.a, segment.b], color: segment.color, thickness, className: "sphenpad-user-line" });
  };
  appendKind("center"); appendKind("edge");
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
  const conflictMarks = computePuzzleConflictMarks(progress, logic, scene.rows, scene.cols, conflictChecker);
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
      ...(conflictMarks.get(`${r}:${c}`)?.size ? {
        candidateErrors: sortSymbols([...(progressCell.notes?.center ?? [])].filter((mark) => conflictMarks.get(`${r}:${c}`)?.has(mark))),
        pencilmarkErrors: sortSymbols([...(progressCell.notes?.corner ?? [])].filter((mark) => conflictMarks.get(`${r}:${c}`)?.has(mark))),
      } : {}),
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
