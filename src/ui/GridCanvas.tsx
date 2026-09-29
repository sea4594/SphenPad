import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CellRC, PuzzleDefinition, PuzzleProgress } from "../core/model";
import { useTheme } from "../app/theme";
import { sceneWithPuzzleProgress } from "../sudokupad/app/progressScene";
import { sphenPadSudokuPadAssetResolver } from "../sudokupad/app/network";
import { SudokuPadBoard } from "./SudokuPadBoard";
import { BoardInteractionLayer, type BoardLineKind, type BoardLineSegment, type CreatorBoardPoint, type CreatorDirectMode, type CreatorSnapMode } from "./BoardInteractionLayer";

const EMPTY_CONFLICT_CELLS: CellRC[] = [];
const EMPTY_CREATOR_OBJECT_IDS: string[] = [];

function sceneProgressOnly(
  cells: PuzzleProgress["cells"],
  lines: PuzzleProgress["lines"],
  lineCenterMarks: PuzzleProgress["lineCenterMarks"],
  lineEdgeMarks: PuzzleProgress["lineEdgeMarks"],
  status: PuzzleProgress["status"],
): PuzzleProgress {
  return {
    totalMillis: 0,
    status,
    selection: [],
    multiSelect: false,
    cells,
    lines,
    lineCenterMarks,
    lineEdgeMarks,
    entryMode: "value",
    alphabetMode: false,
    alphabetPage: 0,
    highlightPalettePage: 0,
    activeHighlightColor: "",
    linePaletteColor: "",
    linePaletteKind: "center",
    lineDoubleMode: false,
    activeTool: "value",
    paused: false,
  };
}

export interface GridCanvasProps {
  def: PuzzleDefinition;
  progress: PuzzleProgress;
  onSelection: (sel: CellRC[]) => void;
  onLineStroke: (segments: BoardLineSegment[], kind: BoardLineKind, action: "draw" | "erase") => void;
  onLineTapCell: (rc: CellRC) => void;
  onLineTapEdge: (a: CellRC, b: CellRC) => void;
  onLineGridTouch?: () => void;
  onNonCellPointerDown?: () => void;
  onDoubleCell: (rc: CellRC, selectionCycleIndex?: number) => void;
  interactive?: boolean;
  previewMode?: boolean;
  strictScale?: boolean;
  requestedHeight?: number;
  scalePuzzleStrokes?: boolean;
  conflictCheckerEnabled?: boolean;
  additionalConflictCells?: CellRC[];
  hideAuthoredEntries?: boolean;
  creatorPathDrawing?: boolean;
  onCreatorPath?: (path: CellRC[]) => void;
  selectedCreatorObjectIds?: string[];
  onCreatorObjectPointerDown?: (objectId: string, modifiers: { additive: boolean }) => boolean | void;
  creatorObjectOnly?: boolean;
  creatorDirectMode?: CreatorDirectMode;
  creatorSnapMode?: CreatorSnapMode;
  creatorGridResolution?: number;
  creatorShowGrid?: boolean;
  onCreatorCells?: (cells: CellRC[]) => void;
  onCreatorEdge?: (a: CellRC, b: CellRC) => void;
  onCreatorCorner?: (corner: CreatorBoardPoint) => void;
  onCreatorPoint?: (point: CreatorBoardPoint) => void;
  onCreatorFreePath?: (points: CreatorBoardPoint[]) => void;
}

/**
 * Public board component for both imported and SphenPad-authored puzzles.
 * Every puzzle renders through the native SudokuPad-compatible SVG scene.
 */
export function GridCanvas(props: GridCanvasProps) {
  const { def, progress, interactive = true, previewMode = false, strictScale = false, requestedHeight, scalePuzzleStrokes = false, conflictCheckerEnabled, additionalConflictCells = EMPTY_CONFLICT_CELLS, hideAuthoredEntries = false, selectedCreatorObjectIds = EMPTY_CREATOR_OBJECT_IDS } = props;
  const interactionProgress = useMemo(() => previewMode ? { ...progress, selection: [], multiSelect: false } : progress, [previewMode, progress]);
  const { cells: sceneCells, lines: sceneLines, lineCenterMarks: sceneCenterMarks, lineEdgeMarks: sceneEdgeMarks, status: sceneStatus } = progress;
  // Scene rendering ignores timer/selection/tool/pause state. Keeping this
  // object stable prevents expensive SVG reconstruction for ordinary UI actions.
  const sceneProgress = useMemo(
    () => sceneProgressOnly(sceneCells, sceneLines, sceneCenterMarks, sceneEdgeMarks, sceneStatus),
    [sceneCells, sceneLines, sceneCenterMarks, sceneEdgeMarks, sceneStatus],
  );
  const theme = useTheme();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [fitSize, setFitSize] = useState<{ width: number; height: number } | null>(null);
  const [previewFitSize, setPreviewFitSize] = useState<{ width: number; height: number } | null>(null);

  const explicitRender = def.sourceContext?.urlSettings.render ?? {};
  const scene = useMemo(() => {
    if (!def.scene) return null;
    const authoredScene = hideAuthoredEntries
      ? {
        ...def.scene,
        cells: def.scene.cells.map((row) => row.map((cell) => ({
          ...cell,
          given: undefined,
          value: undefined,
          givenCentremarks: undefined,
          givenCornermarks: undefined,
        }))),
      }
      : def.scene;
    const checkerEnabled = conflictCheckerEnabled ?? theme.conflictChecker;
    const withProgress = sceneWithPuzzleProgress(authoredScene, sceneProgress, def.logic, checkerEnabled);
    const extraConflicts = checkerEnabled ? new Set(additionalConflictCells.map((cell) => `${cell.r}:${cell.c}`)) : new Set<string>();
    const cells = extraConflicts.size
      ? withProgress.cells.map((row, r) => row.map((cell, c) => extraConflicts.has(`${r}:${c}`) ? { ...cell, hasError: true } : cell))
      : withProgress.cells;
    return {
      ...withProgress,
      cells,
      renderSettings: {
        ...withProgress.renderSettings,
        // Puzzle rendering must not change with the surrounding SphenPad UI theme.
        // Preserve only puzzle/source-level render settings here.
        darkMode: false,
        outlineDigits: explicitRender.outlineDigits ?? theme.outlineDigits,
        compactMarks: explicitRender.compactMarks ?? theme.compactMarks,
        labelRowsCols: explicitRender.labelRowsCols ?? theme.labelRowsCols,
      },
    };
  }, [def.scene, def.logic, sceneProgress, hideAuthoredEntries, conflictCheckerEnabled, additionalConflictCells, explicitRender.outlineDigits, explicitRender.compactMarks, explicitRender.labelRowsCols, theme.outlineDigits, theme.compactMarks, theme.labelRowsCols, theme.conflictChecker]);

  useEffect(() => {
    if (!svg || previewMode) return;
    const apply = () => {
      svg.querySelectorAll(".sphenpad-creator-selected").forEach((element) => element.classList.remove("sphenpad-creator-selected"));
      for (const id of selectedCreatorObjectIds) {
        const escaped = CSS.escape(id);
        svg.querySelectorAll(`[data-sphenpad-object-id="${escaped}"], [data-sphenpad-constraint="${escaped}"]`).forEach((element) => element.classList.add("sphenpad-creator-selected"));
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(svg, { childList: true, subtree: true });
    return () => { observer.disconnect(); svg.querySelectorAll(".sphenpad-creator-selected").forEach((element) => element.classList.remove("sphenpad-creator-selected")); };
  }, [svg, previewMode, selectedCreatorObjectIds, scene]);

  const activeFitSize = !svg ? null : (previewMode ? previewFitSize : fitSize);

  useEffect(() => {
    if (!previewMode || !svg) return;
    let rafId: number | null = null;
    const timeoutIds: number[] = [];

    const expandPreviewViewBox = () => {
      const vb = svg.viewBox.baseVal;
      if (!(vb.width > 0 && vb.height > 0)) return;
      const rootScreen = svg.getScreenCTM();
      if (!rootScreen) return;
      let rootInverse: DOMMatrix;
      try { rootInverse = rootScreen.inverse(); } catch { return; }

      let contentLeft = Number.POSITIVE_INFINITY;
      let contentTop = Number.POSITIVE_INFINITY;
      let contentRight = Number.NEGATIVE_INFINITY;
      let contentBottom = Number.NEGATIVE_INFINITY;
      const addBox = (box: DOMRect | SVGRect) => {
        contentLeft = Math.min(contentLeft, box.x);
        contentTop = Math.min(contentTop, box.y);
        contentRight = Math.max(contentRight, box.x + box.width);
        contentBottom = Math.max(contentBottom, box.y + box.height);
      };
      // Root getBBox() is the most direct full-content bound and works for
      // rectangular puzzles. Some browsers do not support getBBox(options), so
      // always fall back to the standard no-argument form.
      try {
        addBox(svg.getBBox());
      } catch { /* layer fallback below */ }
      const layers = Array.from(svg.querySelectorAll(":scope > g:not(.defs)")) as SVGGElement[];
      for (const layer of layers) {
        const layerScreen = layer.getScreenCTM();
        if (!layerScreen || typeof layer.getBBox !== "function") continue;
        try {
          let box: DOMRect | SVGRect;
          try {
            box = (layer.getBBox as unknown as (options?: { fill?: boolean; stroke?: boolean; markers?: boolean }) => DOMRect).call(
              layer,
              { fill: true, stroke: true, markers: true },
            );
          } catch {
            box = layer.getBBox();
          }
          const corners = [
            new DOMPoint(box.x, box.y),
            new DOMPoint(box.x + box.width, box.y),
            new DOMPoint(box.x, box.y + box.height),
            new DOMPoint(box.x + box.width, box.y + box.height),
          ];
          for (const point of corners) {
            const rootPoint = point.matrixTransform(layerScreen).matrixTransform(rootInverse);
            contentLeft = Math.min(contentLeft, rootPoint.x);
            contentTop = Math.min(contentTop, rootPoint.y);
            contentRight = Math.max(contentRight, rootPoint.x);
            contentBottom = Math.max(contentBottom, rootPoint.y);
          }
        } catch { /* ignore non-renderable layers */ }
      }
      if (!Number.isFinite(contentLeft)) return;

      // Never crop the authored viewBox; previews may only zoom farther out.
      // This is intentionally preview-only so live puzzle framing is untouched.
      const pad = Math.max(2, Math.min(vb.width, vb.height) * 0.015);
      const left = Math.min(vb.x, contentLeft - pad);
      const top = Math.min(vb.y, contentTop - pad);
      const right = Math.max(vb.x + vb.width, contentRight + pad);
      const bottom = Math.max(vb.y + vb.height, contentBottom + pad);
      const width = right - left;
      const height = bottom - top;
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      const surface = surfaceRef.current;
      if (surface && surface.clientWidth > 0 && surface.clientHeight > 0) {
        const scale = Math.min(surface.clientWidth / width, surface.clientHeight / height);
        setPreviewFitSize({ width: Math.max(1, width * scale), height: Math.max(1, height * scale) });
      }
      if (Math.abs(left - vb.x) < 0.5 && Math.abs(top - vb.y) < 0.5 && Math.abs(width - vb.width) < 0.5 && Math.abs(height - vb.height) < 0.5) return;
      svg.setAttribute("viewBox", `${left} ${top} ${width} ${height}`);
      svg.querySelectorAll<SVGElement>(".viewboxsize").forEach((elem) => {
        elem.setAttribute("x", String(left));
        elem.setAttribute("y", String(top));
        elem.setAttribute("width", String(width));
        elem.setAttribute("height", String(height));
      });
    };

    const schedule = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      for (const id of timeoutIds.splice(0)) window.clearTimeout(id);
      rafId = window.requestAnimationFrame(expandPreviewViewBox);
      for (const delay of [80, 240, 500]) timeoutIds.push(window.setTimeout(expandPreviewViewBox, delay));
    };
    schedule();
    const resizeObserver = typeof ResizeObserver !== "undefined" && surfaceRef.current
      ? new ResizeObserver(schedule)
      : null;
    if (resizeObserver && surfaceRef.current) resizeObserver.observe(surfaceRef.current);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      for (const id of timeoutIds) window.clearTimeout(id);
      resizeObserver?.disconnect();
    };
  }, [previewMode, svg, scene]);

  useEffect(() => {
    if (previewMode || !svg) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const viewport = window.visualViewport;
    const orientation = window.screen.orientation;
    let rafId: number | null = null;
    const timeoutIds: number[] = [];

    const update = () => {
      const vb = svg.viewBox.baseVal;
      if (!(vb.width > 0 && vb.height > 0)) return;
      const boardCard = surface.closest<HTMLElement>(".boardCard");
      const boardColumn = surface.closest<HTMLElement>(".boardColumn");
      const gridLayout = surface.closest<HTMLElement>(".gridLayout");
      const kbdPanel = gridLayout?.querySelector<HTMLElement>(".kbdPanel") ?? null;
      const pane = boardCard ?? boardColumn ?? surface;
      // Use the untransformed layout box for fitting. The creator can zoom/pan
      // the board with a CSS transform; measuring the transformed surface here
      // creates a feedback loop where one zoom-out step repeatedly shrinks the fit.
      const layoutRect = (boardCard ?? boardColumn ?? surface).getBoundingClientRect();
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeightRaw = viewport?.height ?? window.innerHeight;
      const topbar = document.querySelector<HTMLElement>(".topbar");
      const viewportHeight = Math.max(180, viewportHeightRaw - (topbar?.offsetHeight ?? 0) - 16);
      const width = Math.max(1, surface.clientWidth || pane.clientWidth || Math.floor(layoutRect.width) || viewportWidth);
      const measuredHeight = Math.max(
        boardCard?.clientHeight ?? 0,
        boardColumn?.clientHeight ?? 0,
        gridLayout?.clientHeight ?? 0,
        pane.clientHeight || 0,
      );
      const controlsRect = kbdPanel?.getBoundingClientRect() ?? null;
      const overlapsControlsHorizontally = Boolean(controlsRect && controlsRect.left < layoutRect.right && controlsRect.right > layoutRect.left);
      const spaceAboveControls = controlsRect && overlapsControlsHorizontally
        ? Math.max(0, Math.floor(controlsRect.top - layoutRect.top))
        : 0;
      const height = typeof requestedHeight === "number"
        ? requestedHeight
        : spaceAboveControls > 0
          ? spaceAboveControls
          : measuredHeight > 1
            ? measuredHeight
            : viewportHeight;
      const coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
      const margin = coarse ? 0 : 8;
      const availableWidth = Math.max(1, width - margin * 2);
      const availableHeight = Math.max(1, height - margin * 2);
      const scale = Math.min(availableWidth / vb.width, availableHeight / vb.height);
      const next = { width: vb.width * scale, height: vb.height * scale };
      setFitSize((current) => current && Math.abs(current.width - next.width) < 0.5 && Math.abs(current.height - next.height) < 0.5 ? current : next);
    };

    const clearScheduled = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = null;
      for (const id of timeoutIds.splice(0)) window.clearTimeout(id);
    };
    const schedule = () => {
      clearScheduled();
      update();
      rafId = window.requestAnimationFrame(update);
      for (const delay of [60, 160, 320]) timeoutIds.push(window.setTimeout(update, delay));
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(surface);
    if (surface.parentElement) ro.observe(surface.parentElement);
    const boardColumn = surface.closest<HTMLElement>(".boardColumn");
    const gridLayout = surface.closest<HTMLElement>(".gridLayout");
    if (boardColumn) ro.observe(boardColumn);
    if (gridLayout) ro.observe(gridLayout);
    const mo = new MutationObserver(schedule);
    mo.observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    orientation?.addEventListener("change", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    schedule();
    return () => {
      clearScheduled();
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      orientation?.removeEventListener("change", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, [svg, previewMode, requestedHeight]);

  if (!scene) return <div className="card muted">Puzzle scene unavailable.</div>;

  return (
    <div
      ref={surfaceRef}
      className={`boardSurface sphenpad-native-board${previewMode ? " preview" : ""}${strictScale ? " strictScale" : ""}${scalePuzzleStrokes ? " scalePuzzleStrokes" : ""}${activeFitSize ? " fitted" : ""}`}
      style={{
        display: "inline-grid",
        placeItems: "center",
        position: "relative",
        maxWidth: "100%",
        maxHeight: "100%",
        ...(requestedHeight ? { height: requestedHeight } : {}),
        ...(activeFitSize ? {
          "--sphenpad-board-fit-width": `${activeFitSize.width}px`,
          "--sphenpad-board-fit-height": `${activeFitSize.height}px`,
        } : {}),
      } as CSSProperties}
    >
      <SudokuPadBoard ref={setSvg} scene={scene} assetResolver={sphenPadSudokuPadAssetResolver} />
      {!previewMode ? <BoardInteractionLayer
        svg={svg}
        rows={scene.rows}
        cols={scene.cols}
        progress={interactionProgress}
        selectionColor={theme.selectionColor}
        selectionOutlineThickness={theme.selectionOutlineThickness}
        interactive={interactive}
        onSelection={props.onSelection}
        onLineStroke={props.onLineStroke}
        onLineTapCell={props.onLineTapCell}
        onLineTapEdge={props.onLineTapEdge}
        onLineGridTouch={props.onLineGridTouch}
        onNonCellPointerDown={props.onNonCellPointerDown}
        onDoubleCell={props.onDoubleCell}
        creatorPathDrawing={props.creatorPathDrawing}
        onCreatorPath={props.onCreatorPath}
        onCreatorObjectPointerDown={props.onCreatorObjectPointerDown}
        creatorObjectOnly={props.creatorObjectOnly}
        creatorDirectMode={props.creatorDirectMode}
        creatorSnapMode={props.creatorSnapMode}
        creatorGridResolution={props.creatorGridResolution}
        creatorShowGrid={props.creatorShowGrid}
        onCreatorCells={props.onCreatorCells}
        onCreatorEdge={props.onCreatorEdge}
        onCreatorCorner={props.onCreatorCorner}
        onCreatorPoint={props.onCreatorPoint}
        onCreatorFreePath={props.onCreatorFreePath}
      /> : null}
    </div>
  );
}
