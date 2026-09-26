import React, { useEffect, useMemo, useRef, useState } from "react";
import { mapForcedPortraitPoint, readForcedPortraitDirection } from "../app/forcedPortrait";
import type { CellRC, PuzzleProgress } from "../core/model";
import { SUDOKUPAD_CELL_SIZE } from "../sudokupad/types/scene";
import { getCellOutline } from "../sudokupad/render/cellOutline";
import type { SelectionColor } from "../app/theme";

export type BoardLineKind = "center" | "edge";
export type BoardLineSegment = { a: CellRC; b: CellRC; edgeTrack?: "top" | "bottom" | "left" | "right" };

type DragState = {
  last: CellRC;
  path: CellRC[];
  segments: BoardLineSegment[];
  moved: boolean;
  lineKind?: BoardLineKind;
  lineAction?: "draw" | "erase";
  edgeTapCandidate?: { a: CellRC; b: CellRC };
  selectionSet?: Set<string>;
  selectionMode?: "replace" | "add" | "remove";
  startedSelected?: boolean;
  startedSelectionSize?: number;
  startedCellKey?: string;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  longPressTriggered?: boolean;
  longPressCycleIndex?: number;
  visited?: Set<string>;
  selectionDragActive?: boolean;
};

type TapState = { cellKey: string; timestamp: number; pointerType: string };
type GridPoint = { row: number; col: number; fr: number; fc: number };
type ViewBox = { x: number; y: number; width: number; height: number };

const DOUBLE_TAP_WINDOW_MS = 400;
const LONG_PRESS_DELAY_MS = 750;
const LINE_NODE_RADIUS = 0.5;
const SELECTION_STROKE_WIDTH = 3.3 * 1.15; // pre-Phase-1 outline, 15% thicker
const GRID_STROKE_WIDTH_PX = 1;

function keyOf(rc: CellRC): string { return `${rc.r},${rc.c}`; }
function rcFromKey(key: string): CellRC { const [r, c] = key.split(",").map(Number); return { r, c }; }
function segKey(a: CellRC, b: CellRC): string { const ak = keyOf(a), bk = keyOf(b); return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`; }

function selectionStroke(color: SelectionColor): string {
  // Match SudokuPad's translucent selection-cage treatment while keeping
  // SphenPad's user-selectable hue.
  if (color === "green") return "rgba(16,163,77,.7)";
  if (color === "yellow") return "rgba(214,166,0,.7)";
  if (color === "orange") return "rgba(230,121,0,.7)";
  if (color === "red") return "rgba(220,45,55,.7)";
  if (color === "purple") return "rgba(123,69,217,.7)";
  if (color === "pink") return "rgba(212,59,130,.7)";
  return "rgba(46,120,255,.7)";
}

function parseViewBox(svg: SVGSVGElement | null): ViewBox {
  const vb = svg?.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
  return { x: 0, y: 0, width: 64, height: 64 };
}

function existingSegmentColors(progress: PuzzleProgress, kind: BoardLineKind, segment: BoardLineSegment): string[] {
  const key = segKey(segment.a, segment.b);
  const colors: string[] = [];
  for (const stroke of progress.lines ?? []) {
    const strokeKind: BoardLineKind = stroke.kind === "edge" ? "edge" : "center";
    if (strokeKind !== kind) continue;
    if (!(stroke.segments ?? []).some((candidate) => segKey(candidate.a, candidate.b) === key)) continue;
    if (!colors.includes(stroke.color)) colors.push(stroke.color);
  }
  return colors;
}

export interface BoardInteractionLayerProps {
  svg: SVGSVGElement | null;
  rows: number;
  cols: number;
  progress: PuzzleProgress;
  selectionColor: SelectionColor;
  interactive?: boolean;
  onSelection: (selection: CellRC[]) => void;
  onLineStroke: (segments: BoardLineSegment[], kind: BoardLineKind, action: "draw" | "erase") => void;
  onLineTapCell: (rc: CellRC) => void;
  onLineTapEdge: (a: CellRC, b: CellRC) => void;
  onLineGridTouch?: () => void;
  onNonCellPointerDown?: () => void;
  onDoubleCell: (rc: CellRC, selectionCycleIndex?: number) => void;
}

export function BoardInteractionLayer(props: BoardInteractionLayerProps) {
  const { svg, rows, cols, progress, interactive = true } = props;
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const tapRef = useRef<TapState | null>(null);
  const longPressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [viewBox, setViewBox] = useState<ViewBox>(() => parseViewBox(svg));
  const [preview, setPreview] = useState<{ segments: BoardLineSegment[]; kind: BoardLineKind; action: "draw" | "erase" } | null>(null);
  const [selectionOutlineOffset, setSelectionOutlineOffset] = useState((GRID_STROKE_WIDTH_PX / 2 + SELECTION_STROKE_WIDTH / 2) / SUDOKUPAD_CELL_SIZE);

  useEffect(() => {
    if (!svg) return;
    const update = () => setViewBox(parseViewBox(svg));
    update();
    const observer = new MutationObserver(update);
    observer.observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
    return () => observer.disconnect();
  }, [svg]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const update = () => {
      const ctm = overlay.getScreenCTM();
      const scale = ctm ? Math.max(0.0001, Math.hypot(ctm.a, ctm.b)) : 1;
      // Grid strokes are 1 CSS px and centered on the geometric cell edge.
      // Put the selection's OUTER edge on the grid stroke's inner edge, so the
      // selection is entirely inside the cell and never paints over the border.
      const insetSvg = (GRID_STROKE_WIDTH_PX / 2 + SELECTION_STROKE_WIDTH / 2) / scale;
      setSelectionOutlineOffset(insetSvg / SUDOKUPAD_CELL_SIZE);
    };
    const ro = new ResizeObserver(update);
    ro.observe(overlay);
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [viewBox.width, viewBox.height]);

  useEffect(() => () => { if (longPressRef.current) clearInterval(longPressRef.current); }, []);

  const inCellBounds = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols;
  const inCornerBounds = (r: number, c: number) => r >= 0 && c >= 0 && r <= rows && c <= cols;

  function clearLongPress() {
    if (!longPressRef.current) return;
    clearInterval(longPressRef.current);
    longPressRef.current = null;
  }

  function startLongPress(drag: DragState, rc: CellRC) {
    clearLongPress();
    longPressRef.current = setInterval(() => {
      if (dragRef.current !== drag || drag.moved) { clearLongPress(); return; }
      drag.longPressTriggered = true;
      tapRef.current = null;
      props.onDoubleCell(rc, drag.longPressCycleIndex ?? 0);
      drag.longPressCycleIndex = (drag.longPressCycleIndex ?? 0) + 1;
    }, LONG_PRESS_DELAY_MS);
  }

  function clientToSvg(clientX: number, clientY: number): { x: number; y: number } | null {
    const overlay = overlayRef.current;
    if (!overlay) return null;

    // Let the browser invert the SVG's real screen transform. This correctly
    // accounts for preserveAspectRatio letterboxing, creator zoom/pan, CSS
    // transforms, and any viewBox padding around outside clues.
    const ctm = overlay.getScreenCTM();
    if (ctm) {
      try {
        const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
        return { x: point.x, y: point.y };
      } catch { /* fall through to the legacy mapping */ }
    }

    const rect = overlay.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const local = mapForcedPortraitPoint(
      readForcedPortraitDirection(),
      rect.width,
      rect.height,
      clientX - rect.left,
      clientY - rect.top,
    );
    return {
      x: viewBox.x + (local.x / rect.width) * viewBox.width,
      y: viewBox.y + (local.y / rect.height) * viewBox.height,
    };
  }

  function gridPoint(clientX: number, clientY: number): GridPoint | null {
    const point = clientToSvg(clientX, clientY);
    if (!point) return null;
    const colFloat = point.x / SUDOKUPAD_CELL_SIZE;
    const rowFloat = point.y / SUDOKUPAD_CELL_SIZE;
    const col = Math.floor(colFloat);
    const row = Math.floor(rowFloat);
    return { row, col, fr: rowFloat - row, fc: colFloat - col };
  }

  function cellAt(clientX: number, clientY: number): CellRC | null {
    const p = gridPoint(clientX, clientY);
    return p && inCellBounds(p.row, p.col) ? { r: p.row, c: p.col } : null;
  }

  function nearestCenter(clientX: number, clientY: number): CellRC | null {
    const p = clientToSvg(clientX, clientY);
    if (!p) return null;
    const c = Math.round(p.x / SUDOKUPAD_CELL_SIZE - 0.5);
    const r = Math.round(p.y / SUDOKUPAD_CELL_SIZE - 0.5);
    return inCellBounds(r, c) ? { r, c } : null;
  }



  function pickEdge(clientX: number, clientY: number, threshold = 0.47): { a: CellRC; b: CellRC } | null {
    const p = gridPoint(clientX, clientY);
    if (!p) return null;
    let best: { a: CellRC; b: CellRC } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const gx = p.col + p.fc;
    const gy = p.row + p.fr;
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols - 1; c += 1) {
      const distance = Math.hypot(gx - (c + 1), gy - (r + 0.5));
      if (distance < bestDistance) { bestDistance = distance; best = { a: { r, c }, b: { r, c: c + 1 } }; }
    }
    for (let r = 0; r < rows - 1; r += 1) for (let c = 0; c < cols; c += 1) {
      const distance = Math.hypot(gx - (c + 0.5), gy - (r + 1));
      if (distance < bestDistance) { bestDistance = distance; best = { a: { r, c }, b: { r: r + 1, c } }; }
    }
    return bestDistance <= threshold ? best : null;
  }

  function resolveLineKind(p: GridPoint): BoardLineKind {
    if (progress.linePaletteKind === "edge") return "edge";
    if (progress.linePaletteKind === "center") return "center";
    const dCenter = Math.hypot(p.fc - 0.5, p.fr - 0.5);
    const dEdge = Math.min(
      Math.hypot(p.fc - 0.5, p.fr), Math.hypot(p.fc - 0.5, 1 - p.fr),
      Math.hypot(p.fc, p.fr - 0.5), Math.hypot(1 - p.fc, p.fr - 0.5),
    );
    const dCorner = Math.min(
      Math.hypot(p.fc, p.fr), Math.hypot(1 - p.fc, p.fr),
      Math.hypot(p.fc, 1 - p.fr), Math.hypot(1 - p.fc, 1 - p.fr),
    );
    if (dCenter <= 0.27) return "center";
    if (dEdge <= 0.19 || dCorner <= 0.14) return "edge";
    return dCenter <= dEdge ? "center" : "edge";
  }

  function segmentAction(segment: BoardLineSegment, kind: BoardLineKind): "draw" | "erase" {
    const colors = existingSegmentColors(progress, kind, segment);
    if (colors.includes(progress.linePaletteColor)) return "erase";
    return colors.length < (progress.lineDoubleMode ? 2 : 1) ? "draw" : "erase";
  }

  function pointerGridPoint(clientX: number, clientY: number): { gx: number; gy: number } | null {
    const point = clientToSvg(clientX, clientY);
    if (!point) return null;
    return { gx: point.x / SUDOKUPAD_CELL_SIZE, gy: point.y / SUDOKUPAD_CELL_SIZE };
  }

  function centerLineHopsFromPointer(
    last: CellRC,
    fromClientX: number,
    fromClientY: number,
    toClientX: number,
    toClientY: number,
    opts?: { hotZoneRadius?: number; samplesPerCell?: number; maxHops?: number },
  ): CellRC[] {
    const start = pointerGridPoint(fromClientX, fromClientY) ?? pointerGridPoint(toClientX, toClientY);
    const end = pointerGridPoint(toClientX, toClientY);
    if (!start || !end) return [];
    const hotZoneRadius = Math.max(0.2, Math.min(LINE_NODE_RADIUS, opts?.hotZoneRadius ?? LINE_NODE_RADIUS));
    const samplesPerCell = Math.max(8, Math.min(40, opts?.samplesPerCell ?? 24));
    const maxHops = Math.max(1, Math.min(20, opts?.maxHops ?? 12));
    const dx = end.gx - start.gx;
    const dy = end.gy - start.gy;
    const samples = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * samplesPerCell));
    const hops: CellRC[] = [];
    let cur = { ...last };
    for (let i = 1; i <= samples && hops.length < maxHops; i += 1) {
      const t = i / samples;
      const px = start.gx + dx * t;
      const py = start.gy + dy * t;
      let best: CellRC | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dr && !dc) continue;
          const nr = cur.r + dr;
          const nc = cur.c + dc;
          if (!inCellBounds(nr, nc)) continue;
          const dist = Math.hypot(px - (nc + 0.5), py - (nr + 0.5));
          if (dist <= hotZoneRadius && dist < bestDist) { bestDist = dist; best = { r: nr, c: nc }; }
        }
      }
      if (!best || (best.r === cur.r && best.c === cur.c)) continue;
      hops.push(best);
      cur = best;
    }
    return hops;
  }

  function edgeLineHopsFromPointer(
    last: CellRC,
    fromClientX: number,
    fromClientY: number,
    toClientX: number,
    toClientY: number,
    opts?: { samplesPerCell?: number; maxHops?: number },
  ): CellRC[] {
    const start = pointerGridPoint(fromClientX, fromClientY) ?? pointerGridPoint(toClientX, toClientY);
    const end = pointerGridPoint(toClientX, toClientY);
    if (!start || !end) return [];
    const samplesPerCell = Math.max(8, Math.min(40, opts?.samplesPerCell ?? 24));
    const maxHops = Math.max(1, Math.min(20, opts?.maxHops ?? 12));
    const dx = end.gx - start.gx;
    const dy = end.gy - start.gy;
    const samples = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * samplesPerCell));
    const hops: CellRC[] = [];
    let cur = { ...last };
    for (let i = 1; i <= samples && hops.length < maxHops; i += 1) {
      const t = i / samples;
      const px = start.gx + dx * t;
      const py = start.gy + dy * t;
      let best: CellRC | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      const candidates = [
        { r: cur.r - 1, c: cur.c }, { r: cur.r + 1, c: cur.c },
        { r: cur.r, c: cur.c - 1 }, { r: cur.r, c: cur.c + 1 },
        { r: cur.r - 1, c: cur.c - 1 }, { r: cur.r - 1, c: cur.c + 1 },
        { r: cur.r + 1, c: cur.c - 1 }, { r: cur.r + 1, c: cur.c + 1 },
      ];
      for (const candidate of candidates) {
        if (!inCornerBounds(candidate.r, candidate.c)) continue;
        const dist = Math.hypot(px - candidate.c, py - candidate.r);
        if (dist <= LINE_NODE_RADIUS && dist < bestDist) { bestDist = dist; best = candidate; }
      }
      if (!best || (best.r === cur.r && best.c === cur.c)) continue;
      hops.push(best);
      cur = best;
    }
    return hops;
  }

  function nearestCornerNodeCircle(clientX: number, clientY: number): CellRC | null {
    const point = pointerGridPoint(clientX, clientY);
    if (!point) return null;
    const c = Math.round(point.gx);
    const r = Math.round(point.gy);
    if (!inCornerBounds(r, c) || Math.hypot(point.gx - c, point.gy - r) > LINE_NODE_RADIUS) return null;
    return { r, c };
  }

  function nearestCornerNodeLoose(clientX: number, clientY: number): CellRC | null {
    const point = pointerGridPoint(clientX, clientY);
    if (!point) return null;
    return { r: Math.max(0, Math.min(rows, Math.round(point.gy))), c: Math.max(0, Math.min(cols, Math.round(point.gx))) };
  }

  function renderedCellPx(): number {
    const ctm = overlayRef.current?.getScreenCTM();
    return ctm ? SUDOKUPAD_CELL_SIZE * Math.max(0.0001, Math.hypot(ctm.a, ctm.b)) : 64;
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!interactive) return;
    clearLongPress();
    const cell = cellAt(event.clientX, event.clientY);
    if (!cell) { props.onNonCellPointerDown?.(); return; }
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = gridPoint(event.clientX, event.clientY)!;
    if (progress.activeTool === "line") {
      props.onLineGridTouch?.();
      const kind = resolveLineKind(p);
      const start = kind === "edge"
        ? nearestCornerNodeCircle(event.clientX, event.clientY) ?? nearestCornerNodeLoose(event.clientX, event.clientY)
        : nearestCenter(event.clientX, event.clientY);
      if (!start) return;
      dragRef.current = {
        last: start, path: [start], segments: [], moved: false, lineKind: kind,
        edgeTapCandidate: kind === "edge" ? pickEdge(event.clientX, event.clientY) ?? undefined : undefined,
        startClientX: event.clientX, startClientY: event.clientY,
        lastClientX: event.clientX, lastClientY: event.clientY,
        visited: new Set([keyOf(start)]),
      };
      setPreview({ segments: [], kind, action: "draw" });
      return;
    }

    const current = new Set(progress.selection.map(keyOf));
    const key = keyOf(cell);
    const selected = current.has(key);
    const next = progress.multiSelect ? new Set(current) : new Set<string>();
    const mode: DragState["selectionMode"] = progress.multiSelect ? (selected ? "remove" : "add") : "replace";
    if (mode === "remove") next.delete(key); else next.add(key);
    const drag: DragState = {
      last: cell, path: [cell], segments: [], moved: false,
      selectionSet: next, selectionMode: mode,
      startedSelected: selected, startedSelectionSize: current.size, startedCellKey: key,
      startClientX: event.clientX, startClientY: event.clientY,
      lastClientX: event.clientX, lastClientY: event.clientY,
      visited: new Set([key]), selectionDragActive: false,
    };
    dragRef.current = drag;
    props.onSelection([...next].map(rcFromKey));
    startLongPress(drag, cell);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!interactive || !drag) return;
    if (progress.activeTool === "line") {
      const kind = drag.lineKind ?? "center";
      const previousCell = drag.path.at(-2) ?? null;
      const hops = kind === "edge"
        ? edgeLineHopsFromPointer(drag.last, drag.lastClientX, drag.lastClientY, event.clientX, event.clientY, { samplesPerCell: 24, maxHops: 12 })
        : centerLineHopsFromPointer(drag.last, drag.lastClientX, drag.lastClientY, event.clientX, event.clientY, { hotZoneRadius: LINE_NODE_RADIUS, samplesPerCell: 24, maxHops: 12 });
      drag.lastClientX = event.clientX;
      drag.lastClientY = event.clientY;
      if (!hops.length) return;
      for (const hop of hops) {
        const dr = hop.r - drag.last.r;
        const dc = hop.c - drag.last.c;
        if (Math.abs(dr) > 1 || Math.abs(dc) > 1) continue;
        const previous = drag.path.at(-2) ?? previousCell;
        const stepKey = segKey(drag.last, hop);
        if (previous && keyOf(previous) === keyOf(hop)) {
          const lastSegment = drag.segments.at(-1);
          if (lastSegment && segKey(lastSegment.a, lastSegment.b) === stepKey) drag.segments.pop();
          drag.path.pop();
          drag.last = hop;
          drag.moved = true;
          continue;
        }
        const action = segmentAction({ a: drag.last, b: hop }, kind);
        if (!drag.lineAction) drag.lineAction = action;
        if (drag.lineAction === action) drag.segments.push({ a: drag.last, b: hop });
        drag.path.push(hop);
        drag.last = hop;
        drag.moved = true;
      }
      setPreview({ segments: [...drag.segments], kind, action: drag.lineAction ?? "draw" });
      return;
    }

    if (!drag.selectionDragActive) {
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      const activationPx = Math.max(6, Math.round(renderedCellPx() * 0.14));
      if (Math.hypot(dx, dy) < activationPx) return;
      drag.selectionDragActive = true;
      clearLongPress();
    }
    if (drag.longPressTriggered) return;
    const hops = centerLineHopsFromPointer(
      drag.last, drag.lastClientX, drag.lastClientY, event.clientX, event.clientY,
      { hotZoneRadius: LINE_NODE_RADIUS, samplesPerCell: 24, maxHops: 12 },
    );
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    if (!hops.length) return;
    const next = new Set(drag.selectionSet ?? []);
    const visited = drag.visited ?? new Set<string>();
    for (const hop of hops) {
      drag.last = hop;
      drag.moved = true;
      const key = keyOf(hop);
      if (visited.has(key)) continue;
      visited.add(key);
      drag.path.push(hop);
      if (drag.selectionMode === "remove") next.delete(key); else next.add(key);
    }
    drag.visited = visited;
    drag.selectionSet = next;
    props.onSelection([...next].map(rcFromKey));
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!interactive || !drag) return;
    clearLongPress();
    if (progress.activeTool === "line") {
      const kind = drag.lineKind ?? "center";
      if (drag.moved && drag.segments.length && drag.lineAction) props.onLineStroke(drag.segments, kind, drag.lineAction);
      else if (kind === "edge") {
        const edge = drag.edgeTapCandidate ?? pickEdge(event.clientX, event.clientY, 0.54);
        if (edge) props.onLineTapEdge(edge.a, edge.b);
      } else {
        const cell = cellAt(event.clientX, event.clientY);
        if (cell) props.onLineTapCell(cell);
      }
      setPreview(null);
    } else if (!drag.longPressTriggered && !progress.multiSelect && !drag.moved && drag.startedSelected && drag.startedSelectionSize === 1) {
      const cell = cellAt(event.clientX, event.clientY);
      if (cell && drag.startedCellKey === keyOf(cell)) props.onSelection([]);
    }
    const cell = cellAt(event.clientX, event.clientY);
    if (drag.longPressTriggered) tapRef.current = null;
    else if (progress.activeTool !== "line" && !drag.moved && cell) {
      const now = Date.now();
      const last = tapRef.current;
      if (last && last.pointerType === event.pointerType && last.cellKey === keyOf(cell) && now - last.timestamp <= DOUBLE_TAP_WINDOW_MS) {
        tapRef.current = null;
        props.onDoubleCell(cell);
      } else tapRef.current = { cellKey: keyOf(cell), timestamp: now, pointerType: event.pointerType };
    } else if (drag.moved) tapRef.current = null;
    dragRef.current = null;
  }

  function cancel() { clearLongPress(); dragRef.current = null; setPreview(null); }

  const selectionPath = useMemo(() => {
    if (!progress.selection.length) return "";
    return getCellOutline(progress.selection.map(({ r, c }) => ({ row: r, col: c })), selectionOutlineOffset)
      .map(([command, row, col]) => command === "Z" ? "Z" : `${command}${col * SUDOKUPAD_CELL_SIZE} ${row * SUDOKUPAD_CELL_SIZE}`)
      .join(" ");
  }, [progress.selection, selectionOutlineOffset]);
  const stroke = selectionStroke(props.selectionColor);

  return (
    <svg
      ref={overlayRef}
      className="sphenpad-board-interaction"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ gridArea: "1 / 1", display: "block", width: `var(--sphenpad-board-fit-width, ${viewBox.width}px)`, height: `var(--sphenpad-board-fit-height, ${viewBox.height}px)`, maxWidth: "100%", maxHeight: "100%", margin: 0, touchAction: interactive ? "none" : "auto", pointerEvents: interactive ? "auto" : "none", overflow: "visible" }}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
      onPointerCancel={interactive ? cancel : undefined}
      onPointerLeave={interactive ? cancel : undefined}
      aria-hidden="true"
    >
      {selectionPath ? <path d={selectionPath} fill="none" stroke={stroke} strokeWidth={SELECTION_STROKE_WIDTH} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="butt" /> : null}
      {preview?.segments.map((segment, index) => {
        const center = preview.kind === "center";
        const x1 = (segment.a.c + (center ? 0.5 : 0)) * 64;
        const y1 = (segment.a.r + (center ? 0.5 : 0)) * 64;
        const x2 = (segment.b.c + (center ? 0.5 : 0)) * 64;
        const y2 = (segment.b.r + (center ? 0.5 : 0)) * 64;
        return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={progress.linePaletteColor} strokeWidth={center ? 4.544 : 4.352} opacity={preview.action === "erase" ? 0.35 : 0.9} strokeLinecap="round" />;
      })}
    </svg>
  );
}
