import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CellRC, PuzzleDefinition, PuzzleProgress } from "../core/model";
import { useTheme } from "../app/theme";
import { sceneWithPuzzleProgress } from "../sudokupad/app/progressScene";
import { sphenPadSudokuPadAssetResolver } from "../sudokupad/app/network";
import { SudokuPadBoard } from "./SudokuPadBoard";
import { BoardInteractionLayer, type BoardLineKind, type BoardLineSegment } from "./BoardInteractionLayer";

const EMPTY_CONFLICT_CELLS: CellRC[] = [];

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
}

/**
 * Public board component for both imported and SphenPad-authored puzzles.
 * Every puzzle renders through the native SudokuPad-compatible SVG scene.
 */
export function GridCanvas(props: GridCanvasProps) {
  const { def, progress, interactive = true, previewMode = false, strictScale = false, requestedHeight, scalePuzzleStrokes = false, conflictCheckerEnabled, additionalConflictCells = EMPTY_CONFLICT_CELLS, hideAuthoredEntries = false } = props;
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

  const activeFitSize = previewMode || !svg ? null : fitSize;

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
      /> : null}
    </div>
  );
}
