import { useCreatorBoardNavigation } from "./useCreatorBoardNavigation";
import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getCreatorProject, saveCreatorProject, setCreatorProjectPublished } from "../core/storage";
import type { CellRC, LineStroke, PersistedPuzzle, PuzzleDefinition, PuzzleProgress } from "../core/model";
import { makeInitialProgress } from "../core/scl";
import { GridCanvas } from "./GridCanvas";
import type { BoardLineKind, BoardLineSegment, CreatorBoardPoint, CreatorDirectMode, CreatorSnapMode as CreatorDrawingSnapMode } from "./BoardInteractionLayer";
import { getViewportLayoutKind, type ViewportLayoutKind } from "../app/viewportLayout";
import { Keyboard } from "./Keyboard";
import { highlightPalettePages, linePalette } from "./toolPalettes";
import { IconRedo, IconSelectMode, IconSettings, IconToolBig, IconToolCenter, IconToolCorner, IconToolHighlight, IconToolLine, IconUndo, IconFitView } from "./icons";
import { PopupMenuButton } from "./PopupMenuButton";
import { SettingsOverlay } from "./SettingsOverlay";
import { useTheme } from "../app/theme";
import { validateCreatorDefinition } from "../sudokupad/creator/checker";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../sudokupad/creator/project";
import { applyCreatorProjectHistoryEntry, createCreatorProjectHistoryEntry, normalizeCreatorProjectHistory, type CreatorProjectHistoryEntry, type CreatorProjectHistoryState } from "../sudokupad/creator/history";
import {
  clearCreatorGivens,
  clearCreatorRegions,
  clearCreatorSolution,
  creatorDigitCount,
  creatorDigitRange,
  creatorRegionMode,
  formatCreatorGrid,
  getCreatorSolutionEntries,
  inferCreatorBoxSize,
  parseCreatorGrid,
  resizeCreatorDefinition,
  setCreatorDigitRange,
  setCreatorRegionConfiguration,
  setCreatorSolutionEntries,
  type CreatorRegionMode,
} from "../sudokupad/creator/gridStructure";
import {
  addCreatorConstraint,
  creatorConstraints,
  getCreatorRegions,
  removeCreatorElementVisuals,
  setCreatorGlobalRule,
  setCreatorRegions,
  syncCreatorMetadata,
  syncDefinitionGivens,
} from "../sudokupad/creator/nativeAuthoring";
import type { SudokuPadSourceCage, SudokuPadSourceGraphic, SudokuPadSourceLine } from "../sudokupad/types/source";
import { addCreatorCosmetic, creatorObjectVisualParts, duplicateCreatorObject, ensureCreatorObjectIds, listCreatorObjects, moveCreatorObject, removeCreatorObject, setCreatorBackground, setCreatorObjectGraphicLayer, updateCreatorObject, updateCreatorObjectVisuals, type CreatorEditableObject, type CreatorObjectPatch, type CreatorVisualCollection } from "../sudokupad/creator/objectEditing";
import { addCreatorLineConstraint, CREATOR_LINE_ELEMENT_IDS, dutchWhisperDifference, formatCreatorDigitGroups, germanWhisperDifference, isCreatorLineConstraint, isCreatorLineElementId, normalizeCreatorLineConstraints, parseCreatorDigitGroups, replaceCreatorLinePath, reverseCreatorLinePath, updateCreatorLineConstraint } from "../sudokupad/creator/lineConstraints";
import { addCreatorGroupConstraint, CREATOR_GROUP_ELEMENT_IDS, formatDigitList, formatIntegerList, isCreatorGroupConstraint, isCreatorGroupElementId, normalizeCreatorGroupConstraints, parseDigitList, parseIntegerList, replaceCreatorGroupCells, updateCreatorGroupConstraint } from "../sudokupad/creator/groupConstraints";
import { addCreatorGlobalConstraint, CREATOR_GLOBAL_ELEMENT_IDS, creatorOutsideRayFromSelection, creatorSudokuRulesEnabled, isCreatorGlobalConstraint, isCreatorGlobalElementId, normalizeCreatorGlobalConstraints, replaceCreatorGlobalCells, setCreatorSudokuRules, syncCreatorFog, updateCreatorGlobalConstraint } from "../sudokupad/creator/globalConstraints";
import { getCellsSeenByCells, getComponents, validateConstraints, validateGrid, workerValuesFromDefinition, type CreatorGridValidation } from "../sudokupad/creator/worker";
import { findCreatorSolutions, solveCreatorLogically, type CreatorLogicalResult, type CreatorSolutionSearchResult } from "../sudokupad/creator/solver";
import { authoredPuzzleJson, creatorProjectJson, exportCreatorInterchange, importCreatorInterchange, type CreatorInterchangeReport } from "../sudokupad/creator/interchange";
import { makeCreatorPlaytestRouteState, readCreatorPlaytestRouteState } from "../sudokupad/creator/playtest";
import { alignCreatorCosmetics, creatorObjectClipboardJson, insertCreatorLinePathPoint, moveCreatorObjectsToEdge, nudgeCreatorLinePathPoint, parseCreatorObjectClipboard, pasteCreatorObjectClipboard, removeCreatorLinePathPoint, removeCreatorObjects, reorderCreatorLinePathPoint, setCreatorLinePathPoint, snapCreatorObjects, updateCreatorObjects, type CreatorAlignMode, type CreatorSnapMode } from "../sudokupad/creator/editingUx";

type ElementKind = "given" | "cage" | "thermo" | "arrow" | "whisper" | "renban" | "palindrome" | "dot" | "region" | "fog";
type CreatorTab = "file" | "elements" | "tools";

type CatalogElement = {
  id: string;
  icon: string;
  name: string;
  description: string;
  elementKind?: ElementKind;
  core?: boolean;
};

const NOOP = () => {};
const VIEWPORT_REFRESH_DELAYS = [120, 320, 620, 1000, 1600] as const;
const CREATOR_PANE_SPLIT_KEY = "sphenpad.creatorPaneSplit.v1";
type CreatorPaneSplit = { portrait: number; landscape: number };
type CreatorLineMode = "draw" | "nodes";
function clampPaneSplit(value: number, landscape: boolean) { return Math.max(landscape ? 0.28 : 0.28, Math.min(landscape ? 0.58 : 0.64, value)); }
function readCreatorPaneSplit(): CreatorPaneSplit {
  const fallback = { portrait: 0.38, landscape: 0.36 };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CREATOR_PANE_SPLIT_KEY) ?? "null") as Partial<CreatorPaneSplit> | null;
    return {
      portrait: clampPaneSplit(Number(parsed?.portrait) || fallback.portrait, false),
      landscape: clampPaneSplit(Number(parsed?.landscape) || fallback.landscape, true),
    };
  } catch { return fallback; }
}
const CREATOR_SOLVER_CONTROL_ELEMENT_IDS = new Set(["given-digits", "regions"]);
const CHECKABLE_ELEMENT_IDS = new Set(["antiking", "antiknight", ...CREATOR_GROUP_ELEMENT_IDS, ...CREATOR_LINE_ELEMENT_IDS, ...CREATOR_GLOBAL_ELEMENT_IDS]);
const VISUAL_EDITOR_IDS = new Set([...CREATOR_GLOBAL_ELEMENT_IDS, ...CREATOR_GROUP_ELEMENT_IDS, ...CREATOR_LINE_ELEMENT_IDS, "cosmetic-lines", "cosmetic-cages", "cosmetic-symbols", "cosmetic-text", "cosmetic-shapes", "cosmetic-images", "cosmetic-backgrounds"]);
const SINGLETON_GLOBAL_IDS = new Set(["negative-diagonal", "positive-diagonal", "disjoint-groups", "nonconsecutive", "global-entropy", "global-modulo-3"]);
const DIRECT_CELL_IDS = new Set(["even", "odd", "minimum", "maximum", "counting-circles"]);
const DIRECT_EDGE_IDS = new Set(["difference-kropki", "ratio-kropki", "xv"]);
const DIRECT_CORNER_IDS = new Set(["quadruples"]);
const DIRECT_PAINT_IDS = new Set(["killer-cages", "look-and-say-cages", "different-values", "extra-region", "clones", "cosmetic-cages", "row-indexers", "column-indexers", "fog-lights", "custom-fog-clearing"]);
const DIRECT_OUTSIDE_IDS = new Set(["little-killers", "sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms"]);
const DIRECT_POINT_IDS = new Set(["cosmetic-symbols", "cosmetic-text", "cosmetic-shapes", "cosmetic-images"]);
const DRAWING_GRID_IDS = new Set(["cosmetic-lines", ...DIRECT_POINT_IDS]);
function creatorDirectModeForElement(elementId: string | null): CreatorDirectMode | undefined {
  if (!elementId) return undefined;
  if (DIRECT_CELL_IDS.has(elementId)) return "cell";
  if (DIRECT_EDGE_IDS.has(elementId)) return "edge";
  if (DIRECT_CORNER_IDS.has(elementId)) return "corner";
  if (DIRECT_PAINT_IDS.has(elementId)) return "paint";
  if (DIRECT_OUTSIDE_IDS.has(elementId)) return "outside";
  if (DIRECT_POINT_IDS.has(elementId)) return "point";
  if (elementId === "cosmetic-lines") return "free-line";
  return undefined;
}
// Keep the user's intermediate text (including an empty numeric field) until it is
// committed. Saving/normalizing on every keystroke previously made Backspace fail.
function CreatorDraftInput(props: { value: string | number; onCommit: (value: string) => void; placeholder?: string; inputMode?: "decimal" | "numeric" | "text" | "url"; className?: string; ariaLabel?: string }) {
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const cancel = useRef(false);
  const draft = editingDraft ?? String(props.value);
  return <input className={props.className ?? "url"} type="text" inputMode={props.inputMode} aria-label={props.ariaLabel} placeholder={props.placeholder} value={draft}
    onFocus={() => { cancel.current = false; setEditingDraft(String(props.value)); }}
    onChange={(event) => setEditingDraft(event.target.value)}
    onBlur={() => {
      setEditingDraft(null);
      if (cancel.current) { cancel.current = false; return; }
      if (draft !== String(props.value)) props.onCommit(draft);
    }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { cancel.current = true; event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
      if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); }
    }} />;
}
function CreatorColorField(props: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  const normalized = /^#[0-9a-f]{6}$/i.test(props.value) ? props.value : "#555555";
  return <label>{props.label}<span className="creatorColorControl"><input aria-label={`${props.label} picker`} type="color" value={normalized} onChange={(event) => props.onChange(event.target.value)} /><CreatorDraftInput value={props.value} onCommit={props.onChange} placeholder={props.placeholder ?? "#555555"} ariaLabel={`${props.label} value`} /></span></label>;
}

const CORE_CATALOG: CatalogElement[] = [
  { id: "given-digits", icon: "1", name: "Given digits", description: "Prefill cells with puzzle givens.", elementKind: "given", core: true },
  { id: "regions", icon: "R", name: "Regions", description: "Assign cells to standard or irregular Sudoku regions.", elementKind: "region", core: true },
];

const CATALOG: CatalogElement[] = [
  ...CORE_CATALOG,

  ["negative-diagonal", "\\", "Negative diagonal", "Digits cannot repeat along the negative diagonal."],
  ["positive-diagonal", "/", "Positive diagonal", "Digits cannot repeat along the positive diagonal."],
  ["extra-region", "R", "Extra region/different values", "Digits cannot repeat in the marked cells.", "region"],
  ["antiking", "K", "Antiking", "Cells separated by a king's move cannot have the same digit."],
  ["antiknight", "N", "Antiknight", "Cells separated by a knight's move cannot have the same digit."],
  ["disjoint-groups", "D", "Disjoint groups", "Matching box positions contain all digits."],
  ["nonconsecutive", "-", "Nonconsecutive", "Orthogonally adjacent cells cannot contain consecutive digits."],
  ["even", "E", "Even", "Marked squares must contain even digits."],
  ["odd", "O", "Odd", "Marked circles must contain odd digits."],
  ["maximum", "M", "Maximum", "Marked cells are greater than adjacent unmarked cells."],
  ["minimum", "m", "Minimum", "Marked cells are smaller than adjacent unmarked cells."],
  ["difference-kropki", "W", "Difference Kropki dots", "White dots specify a digit difference.", "dot"],
  ["ratio-kropki", "B", "Ratio Kropki dots", "Black dots specify a digit ratio.", "dot"],
  ["xv", "XV", "XV", "X and V marks sum to 10 and 5."],
  ["thermometers", "T", "Thermometers", "Digits strictly increase away from the bulb.", "thermo"],
  ["slow-thermometers", "t", "Slow thermometers", "Digits increase or stay the same away from the bulb."],
  ["killer-cages", "C", "Killer cages", "Cage digits sum to the clue and cannot repeat.", "cage"],
  ["clones", "=", "Clones", "Two marked groups share the same digit arrangement."],
  ["quadruples", "Q", "Quadruples", "Circle digits occur in its surrounding cells."],
  ["look-and-say-cages", "L", "Look-and-say cages", "A clue describes the digits in its cage."],
  ["different-values", "≠", "Different values", "Marked cells must all contain different values."],
  ["counting-circles", "○", "Counting circles", "Circled cells participate in SudokuMaker counting-circle logic."],
  ["renban-lines", "R", "Renban lines", "A line contains consecutive, non-repeating digits.", "renban"],
  ["german-whispers", "G", "German whisper lines", "Connected cells use the German minimum-difference preset; the value is configurable."],
  ["dutch-whispers", "D", "Dutch whisper lines", "Connected cells use the Dutch minimum-difference preset; the value is configurable.", "whisper"],
  ["palindromes", "P", "Palindromes", "Line digits read the same in either direction.", "palindrome"],
  ["between-lines", "B", "Between lines", "Line digits are between the circled end digits."],
  ["region-sum-lines", "S", "Region sum lines", "Each box segment of a line has the same sum."],
  ["sequence-lines", "S", "Sequence lines", "Line digits have a constant difference."],
  ["entropic-lines", "E", "Entropic lines", "Every three cells contain low, middle, and high digits."],
  ["3-modular-lines", "3", "3-modular lines", "Every three cells cover all modulo-3 residuals."],
  ["parity-lines", "P", "Parity (odd/even) lines", "Each adjacent pair has one even and one odd digit."],
  ["global-entropy", "E", "Global entropy", "Every 2x2 contains low, middle, and high digits."],
  ["global-modulo-3", "3", "Global modulo-3", "Every 2x2 covers all modulo-3 residuals."],
  ["lockout-lines", "L", "Lockout lines", "Line digits lie outside the circled end digits."],
  ["arrows", "A", "Arrows", "Arrow digits sum to the circled cells.", "arrow"],
  ["double-arrows", "A", "Double arrows", "Line sum equals the sum of both circled ends."],
  ["little-killers", "K", "Little killers", "Marked diagonal digits sum to the outside clue."],
  ["sandwich-sums", "S", "Sandwich sums", "Digits between 1 and 9 sum to the clue."],
  ["x-sums", "X", "X-sums", "An edge clue sums the first X digits."],
  ["skyscrapers", "H", "Skyscrapers", "Edge clues count visible building heights."],
  ["numbered-rooms", "N", "Numbered rooms", "An edge clue identifies the Nth digit."],
  ["row-indexers", "R", "Row indexers", "A mark identifies a row position for its digit."],
  ["column-indexers", "C", "Column indexers", "A mark identifies a column position for its digit."],
  ["custom-constraint", "JS", "Custom constraint", "Custom JavaScript constraint logic."],
  ["cosmetic-lines", "-", "Cosmetic lines", "Lines without programmed logic."],
  ["cosmetic-cages", "C", "Cosmetic cages", "Cages without programmed logic."],
  ["cosmetic-symbols", "*", "Cosmetic symbols", "Symbols without programmed logic."],
  ["cosmetic-text", "Aa", "Cosmetic text", "Free text labels placed on the puzzle."],
  ["cosmetic-shapes", "□", "Cosmetic shapes", "Rectangles and circles with editable appearance."],
  ["cosmetic-images", "▧", "Cosmetic image", "Place an image asset on a puzzle SVG layer."],
  ["cosmetic-backgrounds", "▣", "Background image", "Set the puzzle background image, opacity, and layer."],
  ["fog-lights", "F", "Fog lights", "Lights that clear fog at the start.", "fog"],
  ["custom-fog-clearing", "F", "Custom fog clearing", "Customize conditions that clear fog."],
].map((entry) => Array.isArray(entry) ? ({ id: entry[0] as string, icon: entry[1] as string, name: entry[2] as string, description: entry[3] as string, elementKind: entry[4] as ElementKind | undefined }) : entry as CatalogElement);

function sameCell(a: CellRC, b: CellRC) {
  return a.r === b.r && a.c === b.c;
}

function rcKey(cell: CellRC) { return `${cell.r}:${cell.c}`; }
function lineSegKey(a: CellRC, b: CellRC) { const ak = rcKey(a), bk = rcKey(b); return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`; }

function selectionKey(selection: CellRC[]) {
  return selection.map((cell) => `${cell.r}:${cell.c}`).sort().join(",");
}

function cellLabel(cell: CellRC) {
  return `R${cell.r + 1}C${cell.c + 1}`;
}

function isInBounds(cell: CellRC, rows: number, cols: number) {
  return cell.r >= 0 && cell.c >= 0 && cell.r < rows && cell.c < cols;
}

function regionNumberAt(def: PuzzleDefinition, cell: CellRC) {
  const regions = getCreatorRegions(def);
  const index = regions.findIndex((region) => region.cells.some((item) => sameCell(item, cell)));
  if (index < 0) return "";
  const label = String(regions[index].label ?? "").trim();
  return label || String(index + 1);
}

function sanitizeDefinition(input: PuzzleDefinition): PuzzleDefinition {
  let def = normalizeCreatorGlobalConstraints(normalizeCreatorGroupConstraints(normalizeCreatorLineConstraints(input)));
  if (!def.scene || !def.logic) throw new Error("Creator puzzle is missing its native scene");
  const rows = Math.max(1, def.rows);
  const cols = Math.max(1, def.cols);
  const valid = (cell: CellRC) => isInBounds(cell, rows, cols);
  const validCells = (cells: CellRC[] | undefined) => (cells ?? []).filter(valid);
  const regions = getCreatorRegions(def).map((region) => ({ ...region, cells: validCells(region.cells) })).filter((region) => region.cells.length);
  def = setCreatorRegions({ ...def, rows, cols, size: Math.max(rows, cols), givens: def.givens.filter((given) => valid(given.rc)) }, regions);
  if (def.scene) {
    def = {
      ...def,
      scene: {
        ...def.scene,
        rows,
        cols,
        cells: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => def.scene?.cells[r]?.[c] ?? { row: r, col: c })),
        cages: def.scene.cages.map((cage) => ({ ...cage, cells: cage.cells.filter(([r,c]) => valid({r,c})) })).filter((cage) => cage.cells.length),
      },
      logic: {
        ...(def.logic ?? {}),
        constraints: (def.logic?.constraints ?? []).map((constraint) => ({
          ...constraint,
          ...(Array.isArray(constraint.cells) ? { cells: validCells(constraint.cells) } : {}),
          ...(Array.isArray(constraint.path) ? { path: validCells(constraint.path as CellRC[]) } : {}),
        })),
      },
    };
  }
  return ensureCreatorObjectIds(syncDefinitionGivens(def));
}

function validationMessages(def: PuzzleDefinition) { return validateCreatorDefinition(def); }
async function persistCreatorDefinition(key: string, def: PuzzleDefinition, history?: CreatorProjectHistoryState) { return saveCreatorProject(key, creatorProjectFromDefinition(def), Date.now(), history); }

export function PuzzleEditorPage() {
  const { puzzleId } = useParams();
  const key = decodeURIComponent(puzzleId ?? "");
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const [data, setData] = useState<PersistedPuzzle | null>(null);
  const [selection, setSelection] = useState<CellRC[]>([{ r: 0, c: 0 }]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [creatorTab, setCreatorTab] = useState<CreatorTab>("elements");
  const [elementKind, setElementKind] = useState<ElementKind>("given");
  const [constraintValue, setConstraintValue] = useState("");
  const [addingElement, setAddingElement] = useState(false);
  const [creatorDeleteMode, setCreatorDeleteMode] = useState(false);
  const [creatorSnapMode, setCreatorSnapMode] = useState<CreatorDrawingSnapMode>("centers");
  const [creatorLineMode, setCreatorLineMode] = useState<CreatorLineMode>("draw");
  const [fallbackSelectionOpen, setFallbackSelectionOpen] = useState(false);
  const [creatorGridResolution, setCreatorGridResolution] = useState(1);
  const [creatorShowGrid, setCreatorShowGrid] = useState(false);
  const [fogPaintRole, setFogPaintRole] = useState<"trigger" | "effect">("trigger");
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeCatalogElement, setActiveCatalogElement] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [selectedPathPointIndex, setSelectedPathPointIndex] = useState<number | null>(null);
  const [pathDragIndex, setPathDragIndex] = useState<number | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const regionDigitEntryRef = useRef<{ selectionKey: string; value: string; at: number } | null>(null);
  const beforePinchRef = useRef<{ selection: CellRC[]; selectedId: string | null; selectedIds: string[] } | null>(null);
  const creatorNavigation = useCreatorBoardNavigation(canvasZoom, canvasPan, setCanvasZoom, setCanvasPan,
    () => { beforePinchRef.current = { selection: selection.map((cell) => ({ ...cell })), selectedId: selectedObjectId, selectedIds: [...selectedObjectIds] }; },
    () => {
      if (!beforePinchRef.current) return;
      setSelection(beforePinchRef.current.selection);
      setSelectedObjectId(beforePinchRef.current.selectedId);
      setSelectedObjectIds(beforePinchRef.current.selectedIds);
    },
  );
  const [objectContextMenu, setObjectContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [message, setMessage] = useState("");
  const testPlay = false;
  const [history, setHistory] = useState<CreatorProjectHistoryEntry[]>([]);
  const [future, setFuture] = useState<CreatorProjectHistoryEntry[]>([]);
  const [testProgress, setTestProgress] = useState<PuzzleProgress | null>(null);
  const [testHistory, setTestHistory] = useState<PuzzleProgress[]>([]);
  const [testFuture, setTestFuture] = useState<PuzzleProgress[]>([]);
  const [givensText, setGivensText] = useState("");
  const [solutionText, setSolutionText] = useState("");
  const [draftRows, setDraftRows] = useState(9);
  const [draftCols, setDraftCols] = useState(9);
  const [draftDigitMin, setDraftDigitMin] = useState(1);
  const [draftDigitMax, setDraftDigitMax] = useState(9);
  const [draftRegionMode, setDraftRegionMode] = useState<CreatorRegionMode>("regular");
  const [draftBoxRows, setDraftBoxRows] = useState(3);
  const [draftBoxCols, setDraftBoxCols] = useState(3);
  const [editorTool, setEditorTool] = useState<PuzzleProgress["activeTool"]>("value");
  const [editorAlphabetMode, setEditorAlphabetMode] = useState(false);
  const [editorAlphabetPage, setEditorAlphabetPage] = useState<0 | 1 | 2>(0);
  const [editorHighlightPage, setEditorHighlightPage] = useState<0 | 1>(0);
  const [editorLineColor, setEditorLineColor] = useState("#ff08ff");
  const [editorLineDouble, setEditorLineDouble] = useState(false);
  const [creatorScratchProgress, setCreatorScratchProgress] = useState<PuzzleProgress | null>(null);
  const [creatorControlView, setCreatorControlView] = useState<"element" | "solver">("solver");
  const [viewportLayoutKind, setViewportLayoutKind] = useState<ViewportLayoutKind>(() => typeof window === "undefined" ? "desktop" : getViewportLayoutKind());
  const [creatorPaneSplit, setCreatorPaneSplit] = useState<CreatorPaneSplit>(() => readCreatorPaneSplit());
  const [dirty, setDirty] = useState(false);
  const [workerValidation, setWorkerValidation] = useState<CreatorGridValidation | null>(null);
  const [workerConstraintErrors, setWorkerConstraintErrors] = useState<Array<{ id: string; message: string }>>([]);
  const [logicalResult, setLogicalResult] = useState<CreatorLogicalResult | null>(null);
  const [solutionSearch, setSolutionSearch] = useState<CreatorSolutionSearchResult | null>(null);
  const [interchangeReport, setInterchangeReport] = useState<CreatorInterchangeReport | null>(null);
  const editRevisionRef = useRef(0);
  const creatorHistoryRef = useRef<CreatorProjectHistoryState>({ undo: [], redo: [] });
  const creatorGridLayoutRef = useRef<HTMLDivElement | null>(null);
  const creatorPaneResizeRef = useRef<{ pointerId: number; landscape: boolean } | null>(null);
  const creatorUndoActionRef = useRef<() => void>(() => {});
  const creatorRedoActionRef = useRef<() => void>(() => {});
  const creatorHoldDelayRef = useRef<number | null>(null);
  const creatorHoldIntervalRef = useRef<number | null>(null);
  const creatorHoldKindRef = useRef<"undo" | "redo" | null>(null);
  const objectClipboardRef = useRef("");
  const selectModeHoldTimerRef = useRef<number | null>(null);
  const selectModeHoldTriggeredRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const stored = await getCreatorProject(key);
      if (!stored) {
        setMessage("This creator puzzle could not be found.");
        return;
      }
      const def = ensureCreatorObjectIds(normalizeCreatorLineConstraints(definitionFromCreatorProject(stored.project, { id: key, sourceId: key })));
      setData({ def, progress: makeInitialProgress(def), undo: [], redo: [], createdAt: stored.createdAt, updatedAt: stored.updatedAt });
      setCreatorScratchProgress(makeInitialProgress(def));
      editRevisionRef.current = 0;
      setDirty(false);
      const returned = readCreatorPlaytestRouteState(location.state);
      const restored = returned?.projectKey === key ? returned.editorState : null;
      setSelection(restored?.selection?.filter((cell) => isInBounds(cell, def.rows, def.cols)) ?? [{ r: 0, c: 0 }]);
      setMultiSelect(restored?.multiSelect ?? false);
      setCreatorTab(restored?.creatorTab ?? "elements");
      const restoredElement = restored?.activeCatalogElement === "solution-digits" ? null : restored?.activeCatalogElement ?? null;
      setActiveCatalogElement(restoredElement);
      setCreatorControlView(restoredElement ? "element" : "solver");
      setSelectedObjectId(restored?.selectedObjectId ?? null);
      setSelectedObjectIds(restored?.selectedObjectIds ?? (restored?.selectedObjectId ? [restored.selectedObjectId] : []));
      setSelectedPathPointIndex(null);
      setElementKind(restored?.elementKind ?? "given");
      setAuthoringOpen(restored?.authoringOpen ?? false);
      setAddingElement(restored?.addingElement ?? false);
      setEditorTool(restored?.editorTool ?? "value");
      setEditorAlphabetMode(restored?.editorAlphabetMode ?? false);
      setEditorAlphabetPage(restored?.editorAlphabetPage ?? 0);
      setEditorHighlightPage(restored?.editorHighlightPage ?? 0);
      setEditorLineColor(restored?.editorLineColor ?? "#ff08ff");
      setEditorLineDouble(restored?.editorLineDouble ?? false);
      setCanvasZoom(Math.max(0.5, Math.min(4, restored?.canvasZoom ?? 1)));
      setCanvasPan(restored?.canvasPan ?? { x: 0, y: 0 });
      const restoredUndo = normalizeCreatorProjectHistory(stored.undo);
      const restoredRedo = normalizeCreatorProjectHistory(stored.redo);
      creatorHistoryRef.current = { undo: restoredUndo, redo: restoredRedo };
      setHistory(restoredUndo);
      setFuture(restoredRedo);
      setTestProgress(null);
      setTestHistory([]);
      setTestFuture([]);
      setWorkerValidation(null);
      setWorkerConstraintErrors([]);
      setLogicalResult(null);
      setSolutionSearch(null);
      setInterchangeReport(null);
    })();
  }, [key, location.state]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const orientation = window.screen.orientation;
    let rafId: number | null = null;
    const timeoutIds: number[] = [];
    const refresh = () => {
      const next = getViewportLayoutKind();
      setViewportLayoutKind((current) => current === next ? current : next);
    };
    const clearScheduled = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = null;
      for (const id of timeoutIds.splice(0)) window.clearTimeout(id);
    };
    const schedule = () => {
      clearScheduled();
      refresh();
      rafId = window.requestAnimationFrame(refresh);
      for (const delay of VIEWPORT_REFRESH_DELAYS) timeoutIds.push(window.setTimeout(refresh, delay));
    };
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    orientation?.addEventListener("change", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      clearScheduled();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      orientation?.removeEventListener("change", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(CREATOR_PANE_SPLIT_KEY, JSON.stringify(creatorPaneSplit)); } catch { /* layout preference is best-effort */ }
  }, [creatorPaneSplit]);

  const progress = useMemo(() => {
    if (!data) return null;
    const next = makeInitialProgress(data.def);
    next.selection = selection;
    next.multiSelect = multiSelect;
    return next;
  }, [data, multiSelect, selection]);
  const validation = useMemo(() => data ? validationMessages(data.def) : [], [data]);
  const liveCreatorConflictCells = useMemo(() => {
    if (!data || !theme.conflictChecker || activeCatalogElement === "regions") return [] as CellRC[];
    const values = new Map<string, { rc: CellRC; value: string | number }>();
    for (const given of data.def.givens) values.set(`${given.rc.r}:${given.rc.c}`, { rc: given.rc, value: given.v });
    if (activeCatalogElement === null) {
      for (const entry of getCreatorSolutionEntries(data.def)) values.set(`${entry.rc.r}:${entry.rc.c}`, { rc: entry.rc, value: entry.value });
    }
    if (!values.size) return [] as CellRC[];
    return validateGrid(data.def, [...values.values()]).invalidCells;
  }, [data, activeCatalogElement, theme.conflictChecker]);

  useEffect(() => {
    if (!data) return;
    const range = creatorDigitRange(data.def), box = inferCreatorBoxSize(data.def);
    setGivensText(formatCreatorGrid(data.def, "givens"));
    setSolutionText(formatCreatorGrid(data.def, "solution"));
    setDraftRows(data.def.rows); setDraftCols(data.def.cols);
    setDraftDigitMin(range.min); setDraftDigitMax(range.max);
    setDraftRegionMode(creatorRegionMode(data.def));
    setDraftBoxRows(box?.rows ?? Math.max(1, Math.floor(Math.sqrt(creatorDigitCount(data.def)))));
    setDraftBoxCols(box?.cols ?? Math.max(1, Math.ceil(creatorDigitCount(data.def) / Math.max(1, Math.floor(Math.sqrt(creatorDigitCount(data.def)))))));
  }, [data]);

  useEffect(() => {
    if (!dirty || !data) return;
    const revision = editRevisionRef.current;
    const snapshot = data.def;
    const historySnapshot = creatorHistoryRef.current;
    const timer = window.setTimeout(() => {
      void persistCreatorDefinition(key, snapshot, historySnapshot).then(() => {
        if (editRevisionRef.current === revision) {
          setDirty(false);
          setMessage((current) => current.startsWith("Autosave failed") ? "" : current);
        }
      }).catch(() => setMessage("Autosave failed. Your current edits are still open and will retry on the next edit."));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [data, dirty, key]);

  useEffect(() => {
    const stop = () => {
      if (creatorHoldDelayRef.current !== null) window.clearTimeout(creatorHoldDelayRef.current);
      if (creatorHoldIntervalRef.current !== null) window.clearInterval(creatorHoldIntervalRef.current);
      creatorHoldDelayRef.current = creatorHoldIntervalRef.current = null;
      creatorHoldKindRef.current = null;
    };
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => { stop(); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", hidden); };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setCreatorHistoryState(undo: CreatorProjectHistoryEntry[], redo: CreatorProjectHistoryEntry[]) {
    const nextUndo = undo.slice(-100), nextRedo = redo.slice(-100);
    creatorHistoryRef.current = { undo: nextUndo, redo: nextRedo };
    setHistory(nextUndo);
    setFuture(nextRedo);
  }

  function save(nextDef: PuzzleDefinition, opts?: { recordHistory?: boolean }) {
    if (!data) return null;
    const def = syncCreatorMetadata(sanitizeDefinition(nextDef));
    if (opts?.recordHistory !== false) {
      const entry = createCreatorProjectHistoryEntry(creatorProjectFromDefinition(data.def), creatorProjectFromDefinition(def));
      if (entry) setCreatorHistoryState([...creatorHistoryRef.current.undo, entry], []);
    }
    const next: PersistedPuzzle = {
      ...data,
      def,
      progress: makeInitialProgress(def),
      undo: [],
      redo: [],
      updatedAt: Date.now(),
    };
    editRevisionRef.current += 1;
    const revision = editRevisionRef.current;
    setDirty(true);
    setMessage("");
    setWorkerValidation(null);
    setWorkerConstraintErrors([]);
    setLogicalResult(null);
    setSolutionSearch(null);
    setData(next);
    return { def, revision };
  }

  function persistCreatorHistoryNavigation(saved: { def: PuzzleDefinition; revision: number } | null, historyState: CreatorProjectHistoryState) {
    if (!saved) return;
    void persistCreatorDefinition(key, saved.def, historyState).then(() => {
      if (editRevisionRef.current === saved.revision) setDirty(false);
    }).catch(() => setMessage("Save failed. Your undo/redo change remains open and will retry on the next edit."));
  }

  function runWorkerValidation(source: "givens" | "solution" = "givens") {
    if (!data) return;
    const values = workerValuesFromDefinition(data.def, source);
    if (source === "solution" && !values.length) { setMessage("No authored solution is available to validate."); return; }
    const report = validateGrid(data.def, values);
    const constraintErrors = [...validateConstraints(data.def)].filter(([, error]) => error.trim()).map(([id, error]) => ({ id, message: error }));
    setWorkerValidation(report);
    setWorkerConstraintErrors(constraintErrors);
    setLogicalResult(null);
    setSolutionSearch(null);
    const firstConstraintIssue = report.diagnostics.find((item) => item.constraintId) ?? (constraintErrors[0] ? { constraintId: constraintErrors[0].id, sourceElementId: undefined } : undefined);
    if (firstConstraintIssue?.constraintId) { setSelectedObjectId(firstConstraintIssue.constraintId); if (firstConstraintIssue.sourceElementId) setActiveCatalogElement(firstConstraintIssue.sourceElementId); }
    setMessage(constraintErrors.length ? `${constraintErrors.length} invalid constraint configuration${constraintErrors.length === 1 ? "" : "s"} found.` : report.diagnostics.length ? `${report.invalidCells.length} invalid cell${report.invalidCells.length === 1 ? "" : "s"} found.` : report.thrownErrors.length ? report.thrownErrors[0] : `${source === "solution" ? "Solution" : "Givens"} passes worker validation.`);
  }

  function runLogicalSolver() {
    if (!data) return;
    const result = solveCreatorLogically(data.def, data.def.meta.creatorSolverSettings);
    setLogicalResult(result); setSolutionSearch(null); setWorkerValidation(null); setWorkerConstraintErrors([]);
    if (result.steps.length) setSelection([result.steps[result.steps.length - 1].rc]);
    setMessage(result.status === "solved" ? `Logical solver completed the grid in ${result.steps.length} step${result.steps.length === 1 ? "" : "s"}.` : result.message ?? `Logical solver: ${result.status}.`);
  }

  function runSolutionSearch() {
    if (!data) return;
    const result = findCreatorSolutions(data.def, data.def.meta.creatorSolverSettings);
    setSolutionSearch(result); setLogicalResult(null); setWorkerValidation(null); setWorkerConstraintErrors([]);
    setMessage(result.status === "solved" ? `Unique solution found (${result.nodes.toLocaleString()} search nodes).` : result.status === "multiple" ? `Multiple solutions found (${result.nodes.toLocaleString()} search nodes).` : result.message ?? `Solution search: ${result.status}.`);
  }

  function updateSolverSetting(key: "maxSolutions" | "maxNodes" | "logicalStepLimit", raw: number) {
    if (!data || !Number.isFinite(raw)) return;
    const bounds = key === "maxSolutions" ? [1, 20] : key === "maxNodes" ? [100, 5_000_000] : [1, 100_000];
    const value = Math.max(bounds[0], Math.min(bounds[1], Math.round(raw)));
    save({ ...data.def, meta: { ...data.def.meta, creatorSolverSettings: { ...(data.def.meta.creatorSolverSettings ?? {}), [key]: value } } }, { recordHistory: false });
  }

  function useFoundSolution() {
    if (!data || !solutionSearch?.solutions[0]) return;
    save(setCreatorSolutionEntries(data.def, solutionSearch.solutions[0].map((entry) => ({ rc: entry.rc, value: String(entry.value) }))));
    setMessage("Found solution copied into the authored solution grid.");
  }

  function selectCellsSeen() {
    if (!data || !selection.length) return;
    const seen = getCellsSeenByCells(data.def, selection);
    setSelection(seen); setMessage(`${seen.length} cell${seen.length === 1 ? "" : "s"} seen by every selected cell.`);
  }

  function startCreatorPaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (viewportLayoutKind === "desktop" || !creatorGridLayoutRef.current) return;
    const landscape = viewportLayoutKind === "phone-landscape" || viewportLayoutKind === "tablet-landscape";
    creatorPaneResizeRef.current = { pointerId: event.pointerId, landscape };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function resizeCreatorPane(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = creatorPaneResizeRef.current, grid = creatorGridLayoutRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !grid) return;
    const rect = grid.getBoundingClientRect();
    const fraction = drag.landscape
      ? (rect.right - event.clientX) / Math.max(1, rect.width)
      : (rect.bottom - event.clientY) / Math.max(1, rect.height);
    const value = clampPaneSplit(fraction, drag.landscape);
    setCreatorPaneSplit((current) => drag.landscape ? { ...current, landscape: value } : { ...current, portrait: value });
    event.preventDefault();
    event.stopPropagation();
  }

  function stopCreatorPaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (creatorPaneResizeRef.current?.pointerId !== event.pointerId) return;
    creatorPaneResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    event.preventDefault();
    event.stopPropagation();
  }

  function keyCreatorPaneResize(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (viewportLayoutKind === "desktop") return;
    const landscape = viewportLayoutKind === "phone-landscape" || viewportLayoutKind === "tablet-landscape";
    const increase = landscape ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const decrease = landscape ? event.key === "ArrowRight" : event.key === "ArrowDown";
    if (!increase && !decrease && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const minimum = 0.28, maximum = landscape ? 0.58 : 0.64;
    setCreatorPaneSplit((current) => {
      const currentValue = landscape ? current.landscape : current.portrait;
      const value = event.key === "Home" ? minimum : event.key === "End" ? maximum : clampPaneSplit(currentValue + (increase ? 0.03 : -0.03), landscape);
      return landscape ? { ...current, landscape: value } : { ...current, portrait: value };
    });
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  async function persistNow() {
    if (!data) return false;
    const revision = editRevisionRef.current;
    try {
      await persistCreatorDefinition(key, data.def, creatorHistoryRef.current);
      if (editRevisionRef.current === revision) setDirty(false);
      return true;
    } catch {
      setMessage("Save failed. Your edits remain open in the creator.");
      return false;
    }
  }

  async function exitCreator() {
    if (dirty && !(await persistNow())) return;
    startTransition(() => navigate("/creator"));
  }

  function undoDefinition() {
    if (!data) return;
    const undo = creatorHistoryRef.current.undo;
    const entry = undo[undo.length - 1];
    if (!entry) return;
    const project = applyCreatorProjectHistoryEntry(creatorProjectFromDefinition(data.def), entry, "undo");
    const nextUndo = undo.slice(0, -1);
    const nextRedo = [...creatorHistoryRef.current.redo, entry];
    const nextHistory = { undo: nextUndo, redo: nextRedo };
    setCreatorHistoryState(nextUndo, nextRedo);
    const saved = save(definitionFromCreatorProject(project, { id: key, sourceId: key }), { recordHistory: false });
    persistCreatorHistoryNavigation(saved, nextHistory);
  }

  function redoDefinition() {
    if (!data) return;
    const redo = creatorHistoryRef.current.redo;
    const entry = redo[redo.length - 1];
    if (!entry) return;
    const project = applyCreatorProjectHistoryEntry(creatorProjectFromDefinition(data.def), entry, "redo");
    const nextRedo = redo.slice(0, -1);
    const nextUndo = [...creatorHistoryRef.current.undo, entry];
    const nextHistory = { undo: nextUndo, redo: nextRedo };
    setCreatorHistoryState(nextUndo, nextRedo);
    const saved = save(definitionFromCreatorProject(project, { id: key, sourceId: key }), { recordHistory: false });
    persistCreatorHistoryNavigation(saved, nextHistory);
  }

  creatorUndoActionRef.current = undoDefinition;
  creatorRedoActionRef.current = redoDefinition;
  function stopCreatorHistoryHold() {
    if (creatorHoldDelayRef.current !== null) window.clearTimeout(creatorHoldDelayRef.current);
    if (creatorHoldIntervalRef.current !== null) window.clearInterval(creatorHoldIntervalRef.current);
    creatorHoldDelayRef.current = null;
    creatorHoldIntervalRef.current = null;
    creatorHoldKindRef.current = null;
  }
  function runCreatorHistoryHold(kind: "undo" | "redo") {
    if ((kind === "undo" ? creatorHistoryRef.current.undo : creatorHistoryRef.current.redo).length === 0) {
      stopCreatorHistoryHold(); return;
    }
    (kind === "undo" ? creatorUndoActionRef : creatorRedoActionRef).current();
  }
  function startCreatorHistoryHold(kind: "undo" | "redo", event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    stopCreatorHistoryHold();
    creatorHoldKindRef.current = kind;
    runCreatorHistoryHold(kind);
    if (creatorHoldKindRef.current !== kind) return;
    creatorHoldDelayRef.current = window.setTimeout(() => {
      creatorHoldDelayRef.current = null;
      creatorHoldIntervalRef.current = window.setInterval(() => runCreatorHistoryHold(kind), 70);
    }, 260);
  }
  // Keyboard activation still fires click; pointer activation is handled at press.
  function clickCreatorHistory(kind: "undo" | "redo", detail: number) {
    if (detail === 0) runCreatorHistoryHold(kind);
  }
  function selectCreatorObject(objectId: string, additive = false) {
    setCreatorDeleteMode(false);
    setSelectedObjectId(objectId);
    setSelectedPathPointIndex(null);
    setSelectedObjectIds((current) => {
      if (!additive) return [objectId];
      if (current.includes(objectId)) {
        const next = current.filter((id) => id !== objectId);
        setSelectedObjectId(next[next.length - 1] ?? null);
        return next;
      }
      return [...current, objectId];
    });
  }

  function setCreatorInteractionMode(mode: "add" | "edit" | "delete") {
    setCreatorDeleteMode(mode === "delete");
    setAddingElement(mode === "add");
    setObjectContextMenu(null);
    if (mode === "add") { if (activeCatalogElement && (isCreatorLineElementId(activeCatalogElement) || activeCatalogElement === "cosmetic-lines")) setCreatorLineMode("draw"); setSelectedObjectId(null); setSelectedObjectIds([]); setSelectedPathPointIndex(null); }
    if (mode === "edit" && activeCatalogElement && (isCreatorLineElementId(activeCatalogElement) || activeCatalogElement === "cosmetic-lines")) setCreatorLineMode("nodes");
  }

  function selectCreatorObjectFromBoard(objectId: string, modifiers: { additive: boolean }) {
    if (!data || testPlay || creatorTab !== "elements") return false;
    const object = listCreatorObjects(data.def).find((entry) => entry.id === objectId);
    if (!object) return false;
    if (creatorDeleteMode) {
      if (activeCatalogElement && object.elementId === activeCatalogElement) deleteObject(objectId);
      return true;
    }
    const directEditingCurrent = !addingElement && !modifiers.additive && selectedObjectIds.includes(objectId) && object.elementId === activeCatalogElement && Boolean(creatorDirectModeForElement(activeCatalogElement));
    if (directEditingCurrent) return false;
    const element = CATALOG.find((entry) => entry.id === object.elementId);
    if (element) {
      setActiveCatalogElement(element.id);
      if (element.elementKind) setElementKind(element.elementKind);
      if (element.id !== activeCatalogElement) loadCreatorDrawingSettings(element.id);
      setAuthoringOpen(true);
      setCreatorControlView("element");
    }
    setAddingElement(false);
    setCreatorDeleteMode(false);
    selectCreatorObject(objectId, modifiers.additive);
    setMessage(`${object.name} selected.`);
    return true;
  }

  function addCreatorPathFromBoard(path: CellRC[]) {
    if (!data || !activeCatalogElement || path.length < 2 || !isCreatorLineElementId(activeCatalogElement)) return;
    if (!addingElement && selectedObject?.id && selectedObject.elementId === activeCatalogElement && selectedLineConstraint) {
      save(replaceCreatorLinePath(data.def, selectedObject.id, path));
      setSelectedPathPointIndex(null);
      setMessage(`${selectedObject.name} path updated.`);
      return;
    }
    const created = addCreatorLineConstraint(data.def, activeCatalogElement, path);
    save(applyToolDefaults(created.def, created.constraintId, activeCatalogElement));
    setSelectedObjectId(created.constraintId); setSelectedObjectIds([created.constraintId]);
    setCreatorDeleteMode(false);
    setMessage(`${CATALOG.find((entry) => entry.id === activeCatalogElement)?.name ?? "Line"} drawn.`);
  }

  function finishDirectObject(objectId: string, text: string) {
    setSelectedObjectId(objectId); setSelectedObjectIds([objectId]); setSelectedPathPointIndex(null); setCreatorDeleteMode(false); setMessage(text);
  }

  function createOrEditGroupFromBoard(cells: CellRC[]) {
    if (!data || !activeCatalogElement || !cells.length) return;
    const elementId = activeCatalogElement;
    if (isCreatorGroupElementId(elementId)) {
      if (!addingElement && selectedObject?.id && selectedObject.elementId === elementId && selectedGroupConstraint) {
        save(replaceCreatorGroupCells(data.def, selectedObject.id, cells));
        finishDirectObject(selectedObject.id, `${selectedObject.name} cells updated.`);
        return;
      }
      const created = addCreatorGroupConstraint(data.def, elementId, cells, constraintValue);
      if (created.def === data.def) { setAddingElement(false); finishDirectObject(created.constraintId, "A mark already occupies this location; selected the existing mark."); return; }
      save(applyToolDefaults(created.def, created.constraintId, elementId));
      finishDirectObject(created.constraintId, `${CATALOG.find((entry) => entry.id === elementId)?.name ?? "Element"} added.`);
      return;
    }
    if (isCreatorGlobalElementId(elementId) && DIRECT_PAINT_IDS.has(elementId)) {
      if (!addingElement && selectedObject?.id && selectedObject.elementId === elementId && selectedGlobalConstraint) {
        const role = elementId === "custom-fog-clearing" ? fogPaintRole : "cells";
        save(replaceCreatorGlobalCells(data.def, selectedObject.id, cells, role));
        finishDirectObject(selectedObject.id, elementId === "custom-fog-clearing" ? `${fogPaintRole === "trigger" ? "Trigger" : "Reveal"} cells updated.` : `${selectedObject.name} cells updated.`);
        return;
      }
      const created = addCreatorGlobalConstraint(data.def, elementId, cells, constraintValue);
      save(applyToolDefaults(created.def, created.constraintId, elementId));
      finishDirectObject(created.constraintId, `${CATALOG.find((entry) => entry.id === elementId)?.name ?? "Element"} added.`);
      if (elementId === "custom-fog-clearing") { setAddingElement(false); setFogPaintRole("effect"); setMessage("Fog trigger cells painted. Paint the reveal cells next."); }
      return;
    }
    if (elementId === "cosmetic-cages") {
      if (!addingElement && selectedObject?.kind === "cosmetic" && selectedObject.elementId === elementId) {
        save(updateCreatorObjectVisuals(data.def, selectedObject.id, ["cages"], { cells: cells.map((cell) => [cell.r, cell.c]) }));
        finishDirectObject(selectedObject.id, "Cosmetic cage cells updated.");
        return;
      }
      const created = addCreatorCosmetic(data.def, elementId, { cages: [{ cells: cells.map((cell): [number, number] => [cell.r, cell.c]), value: constraintValue.trim(), style: "killer", outlineC: "#555555" }] }, { name: "Cosmetic cages" });
      save(applyToolDefaults(created.def, created.objectId, elementId));
      finishDirectObject(created.objectId, "Cosmetic cage added.");
    }
  }

  function handleCreatorDirectCells(cells: CellRC[]) { createOrEditGroupFromBoard(cells); }
  function handleCreatorDirectEdge(a: CellRC, b: CellRC) { createOrEditGroupFromBoard([a, b]); }
  function handleCreatorDirectCorner(corner: CreatorBoardPoint) {
    if (!data) return;
    const cells = [
      { r: corner.r - 1, c: corner.c - 1 }, { r: corner.r - 1, c: corner.c },
      { r: corner.r, c: corner.c - 1 }, { r: corner.r, c: corner.c },
    ].filter((cell) => isInBounds(cell, data.def.rows, data.def.cols));
    if (cells.length === 4) createOrEditGroupFromBoard(cells);
  }

  function handleCreatorOutsideRay(cells: CellRC[]) {
    if (!data || !activeCatalogElement || !DIRECT_OUTSIDE_IDS.has(activeCatalogElement) || cells.length < 2) return;
    if (!Number.isFinite(Number(constraintValue.trim())) && addingElement) { setMessage("Enter a numeric outside clue first."); return; }
    const elementId = activeCatalogElement;
    if (!isCreatorGlobalElementId(elementId)) return;
    if (!addingElement && selectedObject?.id && selectedObject.elementId === elementId && selectedGlobalConstraint?.type === "outside-clue") {
      save(replaceCreatorGlobalCells(data.def, selectedObject.id, cells));
      finishDirectObject(selectedObject.id, `${selectedObject.name} ray updated.`);
      return;
    }
    const created = addCreatorGlobalConstraint(data.def, elementId, cells, constraintValue);
    save(applyToolDefaults(created.def, created.constraintId, elementId));
    finishDirectObject(created.constraintId, `${CATALOG.find((entry) => entry.id === elementId)?.name ?? "Outside clue"} added.`);
  }

  function handleCreatorEditPathPoint(index: number, cell: CellRC) {
    if (selectedObject?.kind === "cosmetic" && selectedObject.elementId === "cosmetic-lines" && data) {
      const part = creatorObjectVisualParts(data.def, selectedObject.id).find((item) => item.collection === "lines")?.part;
      if (!Array.isArray(part?.wayPoints)) return;
      const points = (part.wayPoints as [number, number][]).map((point) => [...point] as [number, number]);
      if (index < 0 || index >= points.length) return;
      points[index] = [cell.r, cell.c];
      save(updateCreatorObjectVisuals(data.def, selectedObject.id, ["lines"], { wayPoints: points }));
      return;
    }

    if (!data || !selectedObject?.id || !selectedLineConstraint || selectedObject.elementId !== activeCatalogElement) return;
    save(setCreatorLinePathPoint(data.def, selectedObject.id, index, cell));
    setSelectedPathPointIndex(index);
    setMessage(`${selectedObject.name} point ${index + 1} moved.`);
  }

  function handleCreatorPoint(point: CreatorBoardPoint) {
    if (!data || !activeCatalogElement || !DIRECT_POINT_IDS.has(activeCatalogElement)) return;
    const elementId = activeCatalogElement;
    const center: [number, number] = [point.r, point.c];
    if (!addingElement && selectedObject?.kind === "cosmetic" && selectedObject.elementId === elementId) {
      save(updateCreatorObjectVisuals(data.def, selectedObject.id, ["underlays", "overlays"], { center }));
      finishDirectObject(selectedObject.id, `${selectedObject.name} moved.`);
      return;
    }
    const visual: { underlays?: SudokuPadSourceGraphic[]; overlays?: SudokuPadSourceGraphic[] } = {};
    if (elementId === "cosmetic-symbols") visual.overlays = [{ center, width: 0.4, height: 0.4, text: constraintValue.trim() || "★", fontSize: 24, textColor: "#555555" }];
    else if (elementId === "cosmetic-text") visual.overlays = [{ center, width: 1.5, height: 0.6, text: constraintValue.trim() || "Text", fontSize: 22, textColor: "#444444", textAnchor: "middle" }];
    else if (elementId === "cosmetic-shapes") visual.underlays = [{ center, width: 0.8, height: 0.8, rounded: false, backgroundColor: "rgba(120,120,120,0.12)", borderColor: "#777777", borderSize: 1.5 }];
    else if (elementId === "cosmetic-images") {
      const url = constraintValue.trim(); if (!url) { setMessage("Enter an image URL or data URL first."); return; }
      visual.overlays = [{ center, width: 1, height: 1, imageUrl: url, opacity: 1, preserveAspectRatio: "none" }];
    }
    const created = addCreatorCosmetic(data.def, elementId, visual, { name: CATALOG.find((entry) => entry.id === elementId)?.name ?? "Cosmetic" });
    save(applyToolDefaults(created.def, created.objectId, elementId));
    finishDirectObject(created.objectId, `${CATALOG.find((entry) => entry.id === elementId)?.name ?? "Cosmetic"} added.`);
  }

  function handleCreatorFreePath(points: CreatorBoardPoint[]) {
    if (!data || activeCatalogElement !== "cosmetic-lines" || points.length < 2) return;
    const wayPoints = points.map((point): [number, number] => [point.r, point.c]);
    if (!addingElement && selectedObject?.kind === "cosmetic" && selectedObject.elementId === "cosmetic-lines") {
      save(updateCreatorObjectVisuals(data.def, selectedObject.id, ["lines"], { wayPoints }));
      finishDirectObject(selectedObject.id, "Cosmetic line path updated.");
      return;
    }
    const created = addCreatorCosmetic(data.def, "cosmetic-lines", { lines: [{ wayPoints, color: "#555555", thickness: 4 }] }, { name: "Cosmetic lines" });
    save(applyToolDefaults(created.def, created.objectId, "cosmetic-lines"));
    finishDirectObject(created.objectId, "Cosmetic line drawn.");
  }

  function selectAllCatalogObjects() {
    if (!data || !activeCatalogElement) return;
    const ids = listCreatorObjects(data.def).filter((object) => object.elementId === activeCatalogElement).map((object) => object.id);
    setSelectedObjectIds(ids);
    setSelectedObjectId(ids[ids.length - 1] ?? null);
    setMessage(ids.length ? `${ids.length} objects selected.` : "No objects to select.");
  }

  async function copySelectedObjects() {
    if (!data || !selectedObjectIds.length) return;
    const text = creatorObjectClipboardJson(data.def, selectedObjectIds);
    objectClipboardRef.current = text;
    try { await navigator.clipboard.writeText(text); setMessage(`${selectedObjectIds.length} object${selectedObjectIds.length === 1 ? "" : "s"} copied.`); }
    catch { setMessage(`${selectedObjectIds.length} object${selectedObjectIds.length === 1 ? "" : "s"} copied inside SphenPad.`); }
  }

  async function copyObjectById(objectId: string) {
    if (!data) return;
    const text = creatorObjectClipboardJson(data.def, [objectId]);
    objectClipboardRef.current = text;
    try { await navigator.clipboard.writeText(text); setMessage("Object copied."); }
    catch { setMessage("Object copied inside SphenPad."); }
  }

  async function pasteSelectedObjects() {
    if (!data) return;
    let text = objectClipboardRef.current;
    try { const external = await navigator.clipboard.readText(); if (external.trim()) parseCreatorObjectClipboard(external); text = external; } catch { /* use internal clipboard */ }
    if (!text) { setMessage("No creator objects are available to paste."); return; }
    try {
      const result = pasteCreatorObjectClipboard(data.def, text);
      if (!result.objectIds.length) { setMessage("The clipboard contains no pasteable creator objects."); return; }
      save(syncCreatorFog(result.def));
      setSelectedObjectIds(result.objectIds);
      setSelectedObjectId(result.objectIds[result.objectIds.length - 1] ?? null);
      setMessage(`${result.objectIds.length} object${result.objectIds.length === 1 ? "" : "s"} pasted.`);
    } catch { setMessage("Clipboard data is not a SphenPad creator-object selection."); }
  }

  function deleteSelectedObjects() {
    if (!data || !selectedObjectIds.length) return;
    const fog = creatorConstraints(data.def).some((constraint) => selectedObjectIds.includes(constraint.id) && (constraint.type === "foglight" || constraint.type === "fog-trigger"));
    save(syncCreatorFog(removeCreatorObjects(data.def, selectedObjectIds), fog));
    setSelectedObjectIds([]); setSelectedObjectId(null); setSelectedPathPointIndex(null);
    setMessage("Selected objects deleted.");
  }

  function duplicateSelectedObjects() {
    if (!data || !selectedObjectIds.length) return;
    const result = pasteCreatorObjectClipboard(data.def, creatorObjectClipboardJson(data.def, selectedObjectIds));
    save(syncCreatorFog(result.def));
    setSelectedObjectIds(result.objectIds); setSelectedObjectId(result.objectIds[result.objectIds.length - 1] ?? null);
    setMessage(`${result.objectIds.length} object${result.objectIds.length === 1 ? "" : "s"} duplicated.`);
  }

  function bulkEditSelected(patch: Parameters<typeof updateCreatorObjects>[2]) {
    if (!data || !selectedObjectIds.length) return;
    save(syncCreatorFog(updateCreatorObjects(data.def, selectedObjectIds, patch)));
  }

  function alignSelected(mode: CreatorAlignMode) {
    if (!data || selectedObjectIds.length < 2) return;
    save(alignCreatorCosmetics(data.def, selectedObjectIds, mode));
    setMessage("Selected cosmetic objects aligned.");
  }

  function snapSelected(mode: CreatorSnapMode) {
    if (!data || !selectedObjectIds.length) return;
    save(snapCreatorObjects(data.def, selectedObjectIds, mode));
    setMessage(mode === "cell-center" ? "Selected objects snapped to cell centers." : "Selected objects snapped to grid intersections.");
  }

  function moveSelectedToEdge(edge: "back" | "front") {
    if (!data || !selectedObjectIds.length) return;
    save(moveCreatorObjectsToEdge(data.def, selectedObjectIds, edge));
    setMessage(edge === "back" ? "Selected objects sent to back." : "Selected objects brought to front.");
  }

  function setLinePoint(index: number, cell: CellRC) {
    if (!data || !selectedLineConstraint || !selectedObjectId) return;
    save(setCreatorLinePathPoint(data.def, selectedObjectId, index, cell));
    setSelectedPathPointIndex(index);
  }

  function nudgeLinePoint(index: number, dr: number, dc: number) {
    if (!data || !selectedLineConstraint || !selectedObjectId) return;
    save(nudgeCreatorLinePathPoint(data.def, selectedObjectId, index, dr, dc));
    setSelectedPathPointIndex(index);
  }

  function reorderLinePoint(from: number, to: number) {
    if (!data || !selectedLineConstraint || !selectedObjectId) return;
    save(reorderCreatorLinePathPoint(data.def, selectedObjectId, from, to));
    setSelectedPathPointIndex(to);
  }

  function deleteLinePoint(index: number) {
    if (!data || !selectedLineConstraint || !selectedObjectId) return;
    save(removeCreatorLinePathPoint(data.def, selectedObjectId, index));
    setSelectedPathPointIndex((current) => current == null ? null : Math.max(0, Math.min(current, selectedLinePath.length - 2)));
  }

  function insertLinePoint(index: number) {
    if (!data || !selectedLineConstraint || !selectedObjectId || selection.length !== 1) { setMessage("Select exactly one board cell to insert as a path point."); return; }
    save(insertCreatorLinePathPoint(data.def, selectedObjectId, index, selection[0]));
    setSelectedPathPointIndex(index + 1);
  }

  function saveToolDefaultsForSelected() {
    if (!data || !selectedObject) return;
    const sample = selectedObject.sample ?? {};
    const patch: Record<string, unknown> = {};
    const appearanceKeys = ["color", "backgroundColor", "borderColor", "textColor", "fontSize", "thickness", "opacity", "width", "height", "angle", "rounded", "target", "headLength"] as const;
    for (const key of appearanceKeys) if (sample[key] !== undefined) patch[key] = sample[key];
    const parts: Record<string, Record<string, unknown>> = {};
    for (const { collection, part } of creatorObjectVisualParts(data.def, selectedObject.id)) {
      if (parts[collection]) continue;
      const partPatch: Record<string, unknown> = {};
      for (const key of appearanceKeys) if (part[key] !== undefined) partPatch[key] = part[key];
      if (Object.keys(partPatch).length) parts[collection] = partPatch;
    }
    const current = data.def.meta.creatorToolDefaults?.[selectedObject.elementId] ?? {};
    const defaults = { ...(data.def.meta.creatorToolDefaults ?? {}), [selectedObject.elementId]: { ...current, constraintValue: selectedObject.constraint?.value == null ? constraintValue : String(selectedObject.constraint.value), patch, parts } };
    save({ ...data.def, meta: { ...data.def.meta, creatorToolDefaults: defaults } }, { recordHistory: false });
    setMessage(`Defaults updated for ${selectedObject.name}.`);
  }

  function applyToolDefaults(next: PuzzleDefinition, objectId: string | undefined, elementId: string) {
    if (!objectId) return next;
    const defaults = next.meta.creatorToolDefaults?.[elementId];
    let result = defaults?.patch ? updateCreatorObject(next, objectId, defaults.patch as CreatorObjectPatch) : next;
    for (const [collection, patch] of Object.entries(defaults?.parts ?? {})) result = updateCreatorObjectVisuals(result, objectId, [collection as CreatorVisualCollection], patch as CreatorObjectPatch);
    return result;
  }

  function updateToolAppearanceDefault(patch: CreatorObjectPatch, collection?: CreatorVisualCollection) {
    if (!data || !activeCatalogElement) return;
    const defaults = { ...(data.def.meta.creatorToolDefaults ?? {}) };
    const current = { ...(defaults[activeCatalogElement] ?? {}) };
    if (collection) current.parts = { ...(current.parts ?? {}), [collection]: { ...(current.parts?.[collection] ?? {}), ...patch } };
    else current.patch = { ...(current.patch ?? {}), ...patch };
    defaults[activeCatalogElement] = current;
    save({ ...data.def, meta: { ...data.def.meta, creatorToolDefaults: defaults } }, { recordHistory: false });
  }

  function loadCreatorDrawingSettings(elementId: string) {
    const drawing = data?.def.meta.creatorToolDefaults?.[elementId]?.drawing;
    setCreatorSnapMode(drawing?.snap ?? (elementId === "cosmetic-lines" ? "corners" : "centers"));
    setCreatorLineMode("draw");
    setFallbackSelectionOpen(false);
    setCreatorGridResolution(Math.max(1, Math.min(10, Math.round(drawing?.resolution ?? 1))));
    setCreatorShowGrid(Boolean(drawing?.displayGrid));
  }

  function updateCreatorDrawingSettings(patch: { snap?: CreatorDrawingSnapMode; resolution?: number; displayGrid?: boolean }) {
    if (!data || !activeCatalogElement) return;
    const defaults = { ...(data.def.meta.creatorToolDefaults ?? {}) };
    const current = { ...(defaults[activeCatalogElement] ?? {}) };
    const drawing = { ...(current.drawing ?? {}), ...patch };
    current.drawing = drawing; defaults[activeCatalogElement] = current;
    if (patch.snap) setCreatorSnapMode(patch.snap);
    if (patch.resolution !== undefined) setCreatorGridResolution(Math.max(1, Math.min(10, Math.round(patch.resolution))));
    if (patch.displayGrid !== undefined) setCreatorShowGrid(patch.displayGrid);
    save({ ...data.def, meta: { ...data.def.meta, creatorToolDefaults: defaults } }, { recordHistory: false });
  }

  function applyTestDigit(value: string) {
    if (!testProgress) return;
    const cells = testProgress.cells.map((row) => row.map((cell) => ({ ...cell, notes: { ...cell.notes } })));
    for (const cell of testProgress.selection) {
      if (cells[cell.r]?.[cell.c]?.given) continue;
      const current = cells[cell.r][cell.c];
      if (testProgress.activeTool === "value") {
        cells[cell.r][cell.c] = { ...current, value: value || undefined };
        continue;
      }
      if (testProgress.activeTool === "center" || testProgress.activeTool === "corner") {
        const noteKind = testProgress.activeTool;
        const notes = new Set(current.notes[noteKind]);
        if (value) {
          if (notes.has(value)) notes.delete(value);
          else notes.add(value);
        } else notes.clear();
        cells[cell.r][cell.c] = { ...current, notes: { ...current.notes, [noteKind]: notes } };
      }
    }
    setTestHistory((entries) => [...entries.slice(-99), testProgress]);
    setTestFuture([]);
    setTestProgress({ ...testProgress, cells });
  }

  function undoTest() {
    if (!testProgress || !testHistory.length) return;
    const previous = testHistory[testHistory.length - 1];
    setTestHistory((entries) => entries.slice(0, -1));
    setTestFuture((entries) => [testProgress, ...entries].slice(0, 100));
    setTestProgress(previous);
  }

  function redoTest() {
    if (!testProgress || !testFuture.length) return;
    const next = testFuture[0];
    setTestFuture((entries) => entries.slice(1));
    setTestHistory((entries) => [...entries, testProgress].slice(-100));
    setTestProgress(next);
  }

  function applyTestHighlight(color: string) {
    if (!testProgress || !testProgress.selection.length) return;
    const cells = testProgress.cells.map((row) => row.map((cell) => ({ ...cell, notes: { ...cell.notes } })));
    for (const cell of testProgress.selection) {
      const current = cells[cell.r][cell.c];
      const highlights = new Set(current.highlights ?? []);
      if (highlights.has(color)) highlights.delete(color);
      else highlights.add(color);
      cells[cell.r][cell.c] = { ...current, highlights: Array.from(highlights) };
    }
    setTestHistory((entries) => [...entries.slice(-99), testProgress]);
    setTestFuture([]);
    setTestProgress({ ...testProgress, cells });
  }

  function updateCreatorScratch(mutator: (progress: PuzzleProgress) => PuzzleProgress) {
    if (!data) return;
    setCreatorScratchProgress((current) => mutator(current ?? makeInitialProgress(data.def)));
  }

  function applyCreatorDigit(value: string, forcedTool?: "value" | "center" | "corner") {
    if (!data || !selection.length) return;
    const tool = forcedTool ?? editorTool;
    if (activeCatalogElement !== null || tool === "value") {
      setCellValue(value);
      return;
    }
    if (tool !== "center" && tool !== "corner") return;
    const noteKind = tool;
    updateCreatorScratch((current) => {
      const cells = current.cells.map((row) => row.map((cell) => ({ ...cell, notes: { corner: new Set(cell.notes.corner), center: new Set(cell.notes.center), candidates: new Set(cell.notes.candidates) } })));
      const allHave = Boolean(value) && selection.every((rc) => cells[rc.r]?.[rc.c]?.notes[noteKind].has(value));
      for (const rc of selection) {
        const cell = cells[rc.r]?.[rc.c];
        if (!cell) continue;
        const next = new Set(cell.notes[noteKind]);
        if (!value) next.clear();
        else if (allHave) next.delete(value);
        else next.add(value);
        cell.notes[noteKind] = next;
      }
      return { ...current, cells };
    });
  }

  function applyCreatorHighlight(color: string) {
    if (!data || activeCatalogElement !== null || !selection.length) return;
    updateCreatorScratch((current) => {
      const cells = current.cells.map((row) => row.map((cell) => ({ ...cell, notes: { ...cell.notes }, highlights: [...(cell.highlights ?? [])] })));
      const allHave = selection.every((rc) => cells[rc.r]?.[rc.c]?.highlights.includes(color));
      for (const rc of selection) {
        const cell = cells[rc.r]?.[rc.c];
        if (!cell) continue;
        const next = new Set(cell.highlights ?? []);
        if (allHave) next.delete(color); else next.add(color);
        cell.highlights = Array.from(next);
      }
      return { ...current, cells };
    });
  }

  function handleCreatorBackspace() {
    if (!data || !selection.length) return;
    if (activeCatalogElement === "given-digits" || activeCatalogElement === "regions") {
      setCellValue("");
      return;
    }
    if (activeCatalogElement !== null) return;
    if (editorTool === "value") { setCellValue(""); return; }
    const selected = new Set(selection.map(rcKey));
    updateCreatorScratch((current) => {
      if (editorTool === "center" || editorTool === "corner") {
        const noteKind = editorTool;
        const cells = current.cells.map((row) => row.map((cell) => ({ ...cell, notes: { corner: new Set(cell.notes.corner), center: new Set(cell.notes.center), candidates: new Set(cell.notes.candidates) } })));
        for (const rc of selection) if (cells[rc.r]?.[rc.c]) cells[rc.r][rc.c].notes[noteKind] = new Set<string>();
        return { ...current, cells };
      }
      if (editorTool === "highlight") {
        const cells = current.cells.map((row) => row.map((cell) => ({ ...cell, highlights: [...(cell.highlights ?? [])] })));
        for (const rc of selection) if (cells[rc.r]?.[rc.c]) cells[rc.r][rc.c].highlights = [];
        return { ...current, cells };
      }
      const lines = current.lines.map((stroke) => ({ ...stroke, segments: stroke.segments.filter((segment) => !selected.has(rcKey(segment.a)) && !selected.has(rcKey(segment.b))) })).filter((stroke) => stroke.segments.length);
      const lineCenterMarks = current.lineCenterMarks.filter((mark) => !selected.has(rcKey(mark.rc)));
      const lineEdgeMarks = current.lineEdgeMarks.filter((mark) => !selected.has(rcKey(mark.a)) && !selected.has(rcKey(mark.b)));
      return { ...current, lines, lineCenterMarks, lineEdgeMarks };
    });
  }

  function onCreatorLineStroke(segmentsInput: BoardLineSegment[], kind: BoardLineKind, action: "draw" | "erase") {
    if (activeCatalogElement !== null || !segmentsInput.length) return;
    updateCreatorScratch((current) => {
      const keys = new Set(segmentsInput.map((segment) => lineSegKey(segment.a, segment.b)));
      if (action === "erase") {
        const lines = current.lines.map((stroke) => ({ ...stroke, segments: (stroke.kind === kind ? stroke.segments.filter((segment) => !keys.has(lineSegKey(segment.a, segment.b))) : stroke.segments) })).filter((stroke) => stroke.segments.length);
        return { ...current, lines };
      }
      const existing = new Set(current.lines.filter((stroke) => stroke.kind === kind && stroke.color === editorLineColor).flatMap((stroke) => stroke.segments.map((segment) => lineSegKey(segment.a, segment.b))));
      const segments = segmentsInput.filter((segment) => !existing.has(lineSegKey(segment.a, segment.b)));
      if (!segments.length) return current;
      const stroke: LineStroke = { kind, color: editorLineColor, segments };
      return { ...current, lines: [...current.lines, stroke] };
    });
  }

  function onCreatorLineTapCell(rc: CellRC) {
    if (activeCatalogElement !== null) return;
    updateCreatorScratch((current) => {
      const index = current.lineCenterMarks.findIndex((mark) => sameCell(mark.rc, rc));
      if (index < 0) return { ...current, lineCenterMarks: [...current.lineCenterMarks, { rc, kind: "circle", color: editorLineColor }] };
      const mark = current.lineCenterMarks[index];
      if (mark.kind === "circle") {
        const lineCenterMarks = [...current.lineCenterMarks];
        lineCenterMarks[index] = { ...mark, kind: "x" };
        return { ...current, lineCenterMarks };
      }
      return { ...current, lineCenterMarks: current.lineCenterMarks.filter((_, i) => i !== index) };
    });
  }

  function onCreatorLineTapEdge(a: CellRC, b: CellRC) {
    if (activeCatalogElement !== null) return;
    updateCreatorScratch((current) => {
      const key = lineSegKey(a, b);
      const index = current.lineEdgeMarks.findIndex((mark) => lineSegKey(mark.a, mark.b) === key);
      if (index >= 0) return { ...current, lineEdgeMarks: current.lineEdgeMarks.filter((_, i) => i !== index) };
      return { ...current, lineEdgeMarks: [...current.lineEdgeMarks, { a, b, color: editorLineColor }] };
    });
  }

  function setActiveTool(tool: PuzzleProgress["activeTool"]) {
    if (testPlay) {
      setTestProgress((current) => {
        if (!current) return current;
        const entryMode = tool === "center" ? "center" : tool === "corner" ? "corner" : "value";
        return { ...current, activeTool: tool, entryMode };
      });
      return;
    }
    setEditorTool(tool);
  }

  function toggleSelectionMode() {
    if (testPlay) {
      setTestProgress((current) => current ? { ...current, multiSelect: !current.multiSelect } : current);
      return;
    }
    setMultiSelect((value) => !value);
  }

  function selectAllGridCells() {
    if (!data) return;
    const all = Array.from({ length: data.def.rows * data.def.cols }, (_, index) => ({ r: Math.floor(index / data.def.cols), c: index % data.def.cols }));
    if (testPlay) setTestProgress((current) => current ? { ...current, selection: all } : current);
    else setSelection(all);
  }

  function startSelectModeHold() {
    if (selectModeHoldTimerRef.current !== null) window.clearTimeout(selectModeHoldTimerRef.current);
    selectModeHoldTriggeredRef.current = false;
    selectModeHoldTimerRef.current = window.setTimeout(() => {
      selectModeHoldTimerRef.current = null;
      selectModeHoldTriggeredRef.current = true;
      selectAllGridCells();
    }, 500);
  }

  function stopSelectModeHold() {
    if (selectModeHoldTimerRef.current !== null) { window.clearTimeout(selectModeHoldTimerRef.current); selectModeHoldTimerRef.current = null; }
    if (selectModeHoldTriggeredRef.current) window.setTimeout(() => { selectModeHoldTriggeredRef.current = false; }, 250);
  }

  function clickSelectMode() {
    if (selectModeHoldTriggeredRef.current) { selectModeHoldTriggeredRef.current = false; return; }
    toggleSelectionMode();
  }

  function selectCatalogElement(element: CatalogElement) {
    if (!data) return;
    const active = new Set(data.def.meta.creatorElements ?? []);
    active.add(element.id);
    let next = data.def;
    let selectedConstraintId: string | null = null;
    if (element.id === "antiking") next = setCreatorGlobalRule(next, "antiKing", true);
    if (element.id === "antiknight") next = setCreatorGlobalRule(next, "antiKnight", true);
    if (isCreatorGlobalElementId(element.id) && SINGLETON_GLOBAL_IDS.has(element.id)) {
      const created = addCreatorGlobalConstraint(next, element.id, []);
      next = created.def;
      selectedConstraintId = created.constraintId;
    }
    save({ ...next, meta: { ...next.meta, creatorElements: Array.from(active) } });
    setCatalogOpen(false);
    setActiveCatalogElement(element.id);
    loadCreatorDrawingSettings(element.id);
    setSelectedObjectId(selectedConstraintId);
    const storedDefault = data.def.meta.creatorToolDefaults?.[element.id]?.constraintValue;
    if (storedDefault !== undefined) setConstraintValue(storedDefault);
    else if (element.id === "difference-kropki") setConstraintValue("1");
    else if (element.id === "ratio-kropki") setConstraintValue("2");
    else if (element.id === "xv") setConstraintValue("X");
    else setConstraintValue("");
    const editable = Boolean(element.elementKind || VISUAL_EDITOR_IDS.has(element.id));
    setAuthoringOpen(true);
    setCreatorControlView("element");
    setCreatorDeleteMode(false);
    setAddingElement(editable && !selectedConstraintId);
    if (element.elementKind) setElementKind(element.elementKind);
  }

  function activateCatalogElement(element: CatalogElement) {
    if (!data) return;
    if (activeCatalogElement === element.id) { startSolutionEditing(); return; }
    if (element.core) {
      startCoreEditing(element.id as "given-digits" | "regions");
      return;
    }
    setActiveCatalogElement(element.id);
    loadCreatorDrawingSettings(element.id);
    setSelectedObjectId(null);
    setSelectedObjectIds([]);
    setAddingElement(false);
    setCreatorDeleteMode(false);
    setAuthoringOpen(true);
    setCreatorControlView("element");
    const stored = data.def.meta.creatorToolDefaults?.[element.id]?.constraintValue;
    if (stored !== undefined) setConstraintValue(stored);
    else if (element.id === "difference-kropki") setConstraintValue("1");
    else if (element.id === "ratio-kropki") setConstraintValue("2");
    else if (element.id === "xv") setConstraintValue("X");
    else setConstraintValue("");
    if (element.elementKind) setElementKind(element.elementKind);
  }

  function removeCatalogElement(element: CatalogElement) {
    if (!data) return;
    const creatorElements = (data.def.meta.creatorElements ?? []).filter((id) => id !== element.id);
    const creatorElementNames = { ...data.def.meta.creatorElementNames };
    delete creatorElementNames[element.id];
    let next = removeCreatorElementVisuals(data.def, element.id);
    if (element.id === "fog-lights" || element.id === "custom-fog-clearing") next = syncCreatorFog(next, true);
    if (element.id === "cosmetic-backgrounds") next = setCreatorBackground(next, {});
    if (element.id === "regions") next = setCreatorRegions(next, []);
    if (element.id === "antiking") next = setCreatorGlobalRule(next, "antiKing", false);
    if (element.id === "antiknight") next = setCreatorGlobalRule(next, "antiKnight", false);
    save({ ...next, meta: { ...next.meta, creatorElements, creatorElementNames } });
    setActiveCatalogElement(null);
    setSelectedObjectId(null);
    setCreatorDeleteMode(false);
    setMessage(`${element.name} removed.`);
  }

  function renameCatalogElement(element: CatalogElement) {
    if (!data) return;
    const currentName = data.def.meta.creatorElementNames?.[element.id] ?? element.name;
    const nextName = window.prompt("Element name", currentName)?.trim();
    if (!nextName || nextName === currentName) return;
    save({ ...data.def, meta: { ...data.def.meta, creatorElementNames: { ...data.def.meta.creatorElementNames, [element.id]: nextName } } });
    setMessage("Element renamed.");
  }

  function setConstraintChecking(element: CatalogElement, enabled: boolean) {
    if (!data) return;
    save({ ...data.def, meta: { ...data.def.meta, creatorConstraintChecks: { ...data.def.meta.creatorConstraintChecks, [element.id]: enabled } } });
  }

  async function sharePuzzle() {
    if (!data) return;
    if (dirty && !(await persistNow())) return;
    const url = new URL(`#/p/${encodeURIComponent(data.def.id)}`, window.location.href).href;
    try {
      if (navigator.share) await navigator.share({ title: data.def.meta.title || "SphenPad puzzle", text: data.def.meta.rules || "", url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage("Puzzle link copied to clipboard.");
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setMessage("Unable to share this puzzle.");
    }
  }


  async function saveToMyPuzzles() {
    if (!data) return;
    if (dirty && !(await persistNow())) return;
    try {
      const row = await setCreatorProjectPublished(key, true);
      const def = definitionFromCreatorProject(row.project, { id: key, sourceId: key });
      setData((current) => current ? { ...current, def, updatedAt: row.updatedAt } : current);
      setMessage("Added to My Puzzles.");
    } catch {
      setMessage("Could not save this project to My Puzzles.");
    }
  }

  async function openMyPuzzles() {
    if (!data) return;
    if (dirty && !(await persistNow())) return;
    startTransition(() => navigate("/"));
  }

  async function openPlaytest() {
    if (!data) return;
    if (dirty && !(await persistNow())) return;
    const routeState = makeCreatorPlaytestRouteState(key, {
      selection,
      multiSelect,
      creatorTab,
      activeCatalogElement,
      selectedObjectId,
      selectedObjectIds,
      elementKind,
      authoringOpen,
      addingElement,
      editorTool,
      editorAlphabetMode,
      editorAlphabetPage,
      editorHighlightPage,
      editorLineColor,
      editorLineDouble,
      canvasZoom,
      canvasPan,
    });
    navigate(`/p/${encodeURIComponent(data.def.id)}?creatorPlaytest=1`, { state: routeState });
  }

  function applyGridStructure() {
    if (!data) return;
    const rows = Math.max(1, Math.min(30, Math.trunc(draftRows)));
    const cols = Math.max(1, Math.min(30, Math.trunc(draftCols)));
    const min = Math.max(1, Math.min(64, Math.trunc(draftDigitMin)));
    const max = Math.max(min, Math.min(64, Math.trunc(draftDigitMax)));
    let next = resizeCreatorDefinition(data.def, rows, cols);
    next = setCreatorDigitRange(next, min, max);
    if (draftRegionMode === "regular") {
      const boxRows = Math.max(1, Math.trunc(draftBoxRows)), boxCols = Math.max(1, Math.trunc(draftBoxCols));
      if (rows % boxRows || cols % boxCols) { setMessage("Regular box dimensions must divide the grid exactly."); return; }
      if (boxRows * boxCols !== max - min + 1) { setMessage(`Regular boxes must contain ${max - min + 1} cells for this digit range.`); return; }
      next = setCreatorRegionConfiguration(next, "regular", { rows: boxRows, cols: boxCols });
    } else next = setCreatorRegionConfiguration(next, draftRegionMode);
    save(next);
    setCreatorScratchProgress(makeInitialProgress(next));
    setSelection((current) => current.filter((cell) => isInBounds(cell, rows, cols)).slice(0, 1));
    setMessage("Grid structure applied.");
  }

  function startCoreEditing(elementId: "given-digits" | "regions") {
    if (!data) return;
    if (elementId === "regions" && creatorRegionMode(data.def) !== "irregular") {
      save(setCreatorRegionConfiguration(data.def, "irregular"));
      setDraftRegionMode("irregular");
      setMessage("Regions switched to irregular editing mode.");
    }
    setCreatorTab("elements");
    setActiveCatalogElement(elementId);
    setAuthoringOpen(false);
    setAddingElement(false);
    setCreatorDeleteMode(false);
    setCreatorControlView("solver");
    setEditorTool("value");
  }

  function startSolutionEditing() {
    setCreatorTab("elements");
    setActiveCatalogElement(null);
    setSelectedObjectId(null);
    setSelectedObjectIds([]);
    setAuthoringOpen(false);
    setAddingElement(false);
    setCreatorDeleteMode(false);
    setCreatorControlView("solver");
    setEditorTool("value");
  }

  function clearEntries(kind: "givens" | "solution" | "both" | "regions") {
    if (!data) return;
    let next = data.def;
    if (kind === "givens" || kind === "both") next = clearCreatorGivens(next);
    if (kind === "solution" || kind === "both") next = clearCreatorSolution(next);
    if (kind === "regions") next = clearCreatorRegions(next);
    save(next);
    setMessage(kind === "regions" ? "Regions cleared." : kind === "both" ? "Givens and solution cleared." : `${kind === "givens" ? "Givens" : "Solution"} cleared.`);
  }

  function isAllowedDigitEntry(value: string, min: number, max: number) {
    if (!/^\d{1,2}$/.test(value)) return false;
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= min && numeric <= max) return true;
    return Array.from({ length: max - min + 1 }, (_, index) => String(min + index)).some((candidate) => candidate.startsWith(value));
  }

  function setCellValue(value: string) {
    if (!data || !selection.length) return;
    if (activeCatalogElement === null) {
      const range = creatorDigitRange(data.def);
      const entries = getCreatorSolutionEntries(data.def);
      const currentValue = selection.length === 1 ? entries.find((entry) => sameCell(entry.rc, selection[0]))?.value ?? "" : "";
      const nextValue = value ? (range.max > 9 ? `${currentValue}${value}`.slice(-2) : value) : "";
      if (nextValue && !isAllowedDigitEntry(nextValue, range.min, range.max)) {
        setMessage(`Allowed digits are ${range.min}-${range.max}.`); return;
      }
      const withoutSelection = entries.filter((entry) => !selection.some((cell) => sameCell(cell, entry.rc)));
      save(setCreatorSolutionEntries(data.def, nextValue ? [...withoutSelection, ...selection.map((rc) => ({ rc, value: nextValue }))] : withoutSelection));
      return;
    }
    if (activeCatalogElement === "regions") {
      const selectionKey = selection.map(rcKey).sort().join("|");
      const now = Date.now();
      const previous = regionDigitEntryRef.current;
      let nextLabel = "";
      if (value) {
        const canAppend = Boolean(previous && previous.selectionKey === selectionKey && now - previous.at <= 900);
        const appended = canAppend ? `${previous!.value}${value}` : value;
        nextLabel = /^\d{1,2}$/.test(appended) && Number(appended) >= 1 && Number(appended) <= 64 ? appended : value;
        if (!/^\d{1,2}$/.test(nextLabel) || Number(nextLabel) < 1 || Number(nextLabel) > 64) {
          setMessage("Region numbers must be from 1 to 64.");
          return;
        }
        regionDigitEntryRef.current = { selectionKey, value: nextLabel, at: now };
      } else {
        regionDigitEntryRef.current = null;
      }
      const regions = getCreatorRegions(data.def)
        .map((region) => ({ ...region, cells: region.cells.filter((cell) => !selection.some((selected) => sameCell(selected, cell))) }))
        .filter((region) => region.cells.length);
      if (nextLabel) {
        const matching = regions.find((region) => region.label === nextLabel);
        if (matching) matching.cells.push(...selection.map((cell) => ({ ...cell })));
        else regions.push({ cells: selection.map((cell) => ({ ...cell })), label: nextLabel });
      }
      regions.sort((a, b) => Number(a.label ?? 0) - Number(b.label ?? 0));
      save(setCreatorRegions(data.def, regions));
      return;
    }
    if (activeCatalogElement === "given-digits") {
      const digitRange = creatorDigitRange(data.def);
      const selectedGiven = selection.length === 1 ? data.def.givens.find((given) => sameCell(given.rc, selection[0]))?.v ?? "" : "";
      const nextValue = value ? (digitRange.max > 9 ? `${selectedGiven}${value}`.slice(-2) : value) : "";
      if (nextValue && !isAllowedDigitEntry(nextValue, digitRange.min, digitRange.max)) {
        setMessage(`Allowed digits are ${digitRange.min}-${digitRange.max}.`);
        return;
      }
      const withoutSelection = data.def.givens.filter((given) => !selection.some((cell) => sameCell(cell, given.rc)));
      const givens = nextValue ? [...withoutSelection, ...selection.map((rc) => ({ rc, v: nextValue }))] : withoutSelection;
      save(syncDefinitionGivens({ ...data.def, givens }));
      return;
    }
    setMessage("Select Given digits/Regions, or deselect the active element to edit the solution.");
  }

  function pasteGrid(text: string, source: "givens" | "solution") {
    if (!data) return;
    const symbols = parseCreatorGrid(text, data.def.rows, data.def.cols);
    if (!symbols) {
      setMessage(`Expected exactly ${data.def.rows * data.def.cols} symbols.`);
      return;
    }
    if (source === "givens") {
      const givens = symbols.flatMap((symbol, index) => symbol ? [{ rc: { r: Math.floor(index / data.def.cols), c: index % data.def.cols }, v: symbol }] : []);
      save(syncDefinitionGivens({ ...data.def, givens }));
    } else {
      const entries = symbols.flatMap((symbol, index) => symbol ? [{ rc: { r: Math.floor(index / data.def.cols), c: index % data.def.cols }, value: symbol }] : []);
      save(setCreatorSolutionEntries(data.def, entries));
    }
    setMessage(`${source === "givens" ? "Givens" : "Solution"} applied.`);
  }

  function addGlobalElement(elementId: string) {
    if (!data || !isCreatorGlobalElementId(elementId)) return false;
    const cells = selection.map((cell) => ({ ...cell }));
    const outside = ["little-killers", "sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms"].includes(elementId);
    if (outside && !Number.isFinite(Number(constraintValue.trim()))) { setMessage("Enter a numeric outside clue."); return true; }
    if (elementId === "little-killers" && cells.length < 2) { setMessage("Select an ordered diagonal ray of at least two cells."); return true; }
    if (["sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms", "row-indexers", "column-indexers", "fog-lights", "custom-fog-clearing"].includes(elementId) && !cells.length) { setMessage("Select at least one cell first."); return true; }
    const ray = outside ? creatorOutsideRayFromSelection(data.def, elementId, cells) : cells;
    const created = addCreatorGlobalConstraint(data.def, elementId, ray, constraintValue);
    save(applyToolDefaults(created.def, created.constraintId, elementId));
    setSelectedObjectId(created.constraintId);
    setAddingElement(false);
    setConstraintValue("");
    return true;
  }

  function addElement() {
    if (!data) return;
    if (activeCatalogElement && addGlobalElement(activeCatalogElement)) return;
    if (!selection.length) return;
    const cells = selection.map((cell) => ({ ...cell }));
    const path = cells.length > 1 ? cells : [];
    if (elementKind === "given") {
      const value = constraintValue.trim();
      if (!value) { setMessage("Enter a given digit or symbol."); return; }
      const withoutSelection = data.def.givens.filter((given) => !selection.some((cell) => sameCell(cell, given.rc)));
      save(syncDefinitionGivens({ ...data.def, givens: [...withoutSelection, ...cells.map((rc) => ({ rc, v: value }))] }));
      setConstraintValue(""); setAddingElement(false); return;
    }
    const activeElementId = activeCatalogElement ?? undefined;
    if (isCreatorLineElementId(activeElementId)) {
      if (cells.length < 2) { setMessage("Select at least two cells for a path constraint."); return; }
      const created = addCreatorLineConstraint(data.def, activeElementId, cells);
      save(applyToolDefaults(created.def, created.constraintId, activeElementId)); setSelectedObjectId(created.constraintId); setAddingElement(false); setConstraintValue(""); return;
    }
    if (isCreatorGroupElementId(activeElementId)) {
      const created = addCreatorGroupConstraint(data.def, activeElementId, cells, constraintValue);
      save(applyToolDefaults(created.def, created.constraintId, activeElementId)); setSelectedObjectId(created.constraintId); setAddingElement(false); setConstraintValue(""); return;
    }
    if ((elementKind === "thermo" || elementKind === "arrow" || elementKind === "whisper" || elementKind === "renban" || elementKind === "palindrome") && !path.length) {
      setMessage("Select at least two cells for a path constraint."); return;
    }
    let next = data.def;
    const centers = path.map((cell): [number, number] => [cell.r + 0.5, cell.c + 0.5]);
    if (elementKind === "cage") {
      next = addCreatorConstraint(next, { type: "killer-cage", sourceElementId: "killer-cages", cells, value: constraintValue.trim() }, { cages: [{ cells: cells.map((c) => [c.r, c.c]), value: constraintValue.trim(), style: "killer", unique: true }] });
    } else if (elementKind === "thermo") {
      next = addCreatorConstraint(next, { type: "thermometer", sourceElementId: "thermometers", cells: path, path }, { lines: [{ wayPoints: centers, color: "#CFCFCF", thickness: 21 }], underlays: [{ center: centers[0], width: 0.85, height: 0.85, rounded: true, borderColor: "#CFCFCF", backgroundColor: "#CFCFCF" }] });
    } else if (elementKind === "arrow") {
      const arrow = { wayPoints: centers, color: "#a1a1a1", headLength: 0.3, thickness: 5 };
      const bulb: SudokuPadSourceGraphic = { center: centers[0], width: 0.83, height: 0.83, rounded: true, borderColor: "#a1a1a1", backgroundColor: "#ffffff", borderSize: 5, text: "", fontSize: 16 };
      next = addCreatorConstraint(next, { type: "arrow", sourceElementId: "arrows", cells: path, path }, { arrows: [arrow], overlays: [bulb] });
    } else if (elementKind === "whisper") {
      next = addCreatorConstraint(next, { type: "whisper", sourceElementId: "dutch-whispers", cells: path, path }, { lines: [{ wayPoints: centers, color: "#63c7b2", thickness: 7 }] });
    } else if (elementKind === "renban") {
      next = addCreatorConstraint(next, { type: "renban", sourceElementId: "renban-lines", cells: path, path }, { lines: [{ wayPoints: centers, color: "#d27ae8", thickness: 7 }] });
    } else if (elementKind === "palindrome") {
      next = addCreatorConstraint(next, { type: "palindrome", sourceElementId: "palindromes", cells: path, path }, { lines: [{ wayPoints: centers, color: "#CFCFCF", thickness: 12 }] });
    } else if (elementKind === "dot") {
      if (cells.length !== 2) { setMessage("Select exactly two cells for a dot."); return; }
      const black = activeCatalogElement === "ratio-kropki" || constraintValue === "black";
      const graphic: SudokuPadSourceGraphic = { center: [(cells[0].r + cells[1].r + 1) / 2, (cells[0].c + cells[1].c + 1) / 2], width: 0.3, height: 0.3, rounded: true, borderColor: "#000000", backgroundColor: black ? "#000000" : "#FFFFFF" };
      next = addCreatorConstraint(next, { type: black ? "ratio-kropki" : "difference-kropki", sourceElementId: black ? "ratio-kropki" : "difference-kropki", cells }, { overlays: [graphic] });
    } else if (elementKind === "region") {
      if (activeCatalogElement === "regions") next = setCreatorRegions(next, [...getCreatorRegions(next), { cells }]);
      else next = addCreatorConstraint(next, { type: "extra-region", sourceElementId: activeCatalogElement ?? "extra-region", cells }, { cages: [{ cells: cells.map((c) => [c.r, c.c]), style: "extraregion", unique: true }] });
    } else if (elementKind === "fog") {
      if (next.scene) next = { ...next, scene: { ...next.scene, fog: { ...(next.scene.fog ?? { triggerEffects: [] }), initialLightCells: [...(next.scene.fog?.initialLightCells ?? []), ...cells.map((c): [number, number] => [c.r, c.c])] } } };
      next = addCreatorConstraint(next, { type: "foglight", sourceElementId: "fog-lights", cells });
    }
    save(next);
    setAddingElement(false);
    setConstraintValue("");
  }

  function addVisualElement(element: CatalogElement) {
    if (!data) return;
    if (isCreatorGlobalElementId(element.id) && addGlobalElement(element.id)) return;
    const cells = selection.map((cell) => ({ ...cell }));
    const isBackground = element.id === "cosmetic-backgrounds";
    if (!cells.length && !isBackground) { setMessage("Select at least one cell first."); return; }
    if (isCreatorLineElementId(element.id)) {
      if (cells.length < 2) { setMessage("Select at least two cells for this line."); return; }
      const created = addCreatorLineConstraint(data.def, element.id, cells);
      save(applyToolDefaults(created.def, created.constraintId, element.id)); setSelectedObjectId(created.constraintId); setAddingElement(false); setConstraintValue(""); return;
    }
    if (isCreatorGroupElementId(element.id)) {
      const created = addCreatorGroupConstraint(data.def, element.id, cells, constraintValue);
      save(applyToolDefaults(created.def, created.constraintId, element.id)); setSelectedObjectId(created.constraintId); setAddingElement(false); setConstraintValue(""); return;
    }
    if (["cosmetic-lines"].includes(element.id) && cells.length < 2) { setMessage("Select at least two cells for this line."); return; }
    if (isBackground) {
      const url = constraintValue.trim();
      if (!url) { setMessage("Enter an image URL or data URL."); return; }
      const next = setCreatorBackground(data.def, { url, opacity: 1, target: "background", name: "Background image", elementId: "cosmetic-backgrounds" });
      save(next); setSelectedObjectId("creator-background"); setConstraintValue(""); setAddingElement(false); setMessage("Background image added."); return;
    }
    const centers = cells.map((cell): [number, number] => [cell.r + 0.5, cell.c + 0.5]);
    const visual: { lines?: SudokuPadSourceLine[]; cages?: SudokuPadSourceCage[]; underlays?: SudokuPadSourceGraphic[]; overlays?: SudokuPadSourceGraphic[] } = {};
    if (element.id === "even" || element.id === "odd") {
      visual.underlays = cells.map((cell) => ({ center: [cell.r + 0.5, cell.c + 0.5], width: 0.7, height: 0.7, rounded: element.id === "odd", borderColor: "#CFCFCF", backgroundColor: "#CFCFCF" }));
    } else if (element.id === "minimum" || element.id === "maximum") {
      visual.overlays = cells.map((cell) => ({ center: [cell.r + 0.5, cell.c + 0.5], width: 0.25, height: 0.25, text: element.id === "minimum" ? "<" : ">", fontSize: 26, textColor: "#555555" }));
    } else if (element.id === "nonconsecutive") {
      if (cells.length !== 2) { setMessage("Select exactly two adjacent cells."); return; }
      visual.overlays = [{ center: [(cells[0].r + cells[1].r + 1) / 2, (cells[0].c + cells[1].c + 1) / 2], width: 0.14, height: 0.42, rounded: true, backgroundColor: "#666666", angle: cells[0].r === cells[1].r ? 90 : 0 }];
    } else if (element.id === "xv") {
      if (cells.length !== 2) { setMessage("Select exactly two adjacent cells."); return; }
      visual.overlays = [{ center: [(cells[0].r + cells[1].r + 1) / 2, (cells[0].c + cells[1].c + 1) / 2], width: 0.25, height: 0.25, rounded: false, backgroundColor: "#FFFFFF", text: "X", fontSize: 21, textColor: "#333333" }];
    } else if (element.id === "quadruples") {
      visual.overlays = [{ center: centers[0], width: 0.7, height: 0.7, rounded: true, backgroundColor: "rgba(255,255,255,0.82)", borderColor: "#444444", borderSize: 1.3, text: "" }];
    } else if (element.id === "cosmetic-symbols") {
      visual.overlays = cells.map((cell) => ({ center: [cell.r + 0.5, cell.c + 0.5], width: 0.25, height: 0.25, text: constraintValue.trim() || "*", fontSize: 24, textColor: "#555555" }));
    } else if (element.id === "cosmetic-text") {
      visual.overlays = [{ center: centers[0], width: 1.5, height: 0.6, text: constraintValue.trim() || "Text", fontSize: 22, textColor: "#444444", textAnchor: "middle" }];
    } else if (element.id === "cosmetic-images") {
      const url = constraintValue.trim();
      if (!url) { setMessage("Enter an image URL or data URL."); return; }
      const rs = cells.map((cell) => cell.r), cs = cells.map((cell) => cell.c);
      const minR = Math.min(...rs), maxR = Math.max(...rs), minC = Math.min(...cs), maxC = Math.max(...cs);
      visual.overlays = [{ center: [(minR + maxR + 1) / 2, (minC + maxC + 1) / 2], width: maxC - minC + 1, height: maxR - minR + 1, imageUrl: url, opacity: 1, preserveAspectRatio: "none" }];
    } else if (element.id === "cosmetic-shapes") {
      const rs = cells.map((cell) => cell.r), cs = cells.map((cell) => cell.c);
      const minR = Math.min(...rs), maxR = Math.max(...rs), minC = Math.min(...cs), maxC = Math.max(...cs);
      visual.underlays = [{ center: [(minR + maxR + 1) / 2, (minC + maxC + 1) / 2], width: maxC - minC + 0.9, height: maxR - minR + 0.9, rounded: false, backgroundColor: "rgba(120,120,120,0.12)", borderColor: "#777777", borderSize: 1.5 }];
    } else if (element.id === "clones") {
      visual.underlays = cells.map((cell) => ({ center: [cell.r + 0.5, cell.c + 0.5], width: 0.84, height: 0.84, rounded: false, backgroundColor: "rgba(91, 141, 205, 0.17)", borderColor: "#5b8dcd", borderSize: 1.1 }));
    } else if (element.id === "cosmetic-cages" || element.id === "look-and-say-cages") {
      const clue = constraintValue.trim();
      visual.cages = [{ cells: cells.map((cell): [number, number] => [cell.r, cell.c]), value: clue, style: "killer", outlineC: "#555555" }];
    } else {
      const styles: Record<string, [string, number, number[]?]> = {
        "german-whispers": ["#55b36a", 7], "entropic-lines": ["#e777a6", 7], "3-modular-lines": ["#e6a32d", 7], "between-lines": ["#999999", 6], "region-sum-lines": ["#6c83c8", 5], "sequence-lines": ["#5c9da5", 5, [6, 4]], "lockout-lines": ["#525252", 6], "cosmetic-lines": ["#555555", 4], "slow-thermometers": ["#d39b4a", 8], "double-arrows": ["#4f739f", 5], "parity-lines": ["#806cb1", 5, [5, 3]],
      };
      const style = styles[element.id];
      if (style) {
        visual.lines = [{ wayPoints: centers, color: style[0], thickness: style[1], ...(style[2] ? { "stroke-dasharray": style[2].join(" ") } : {}) }];
        if (element.id === "double-arrows") visual.underlays = [cells[0], cells[cells.length - 1]].map((cell) => ({ center: [cell.r + 0.5, cell.c + 0.5], width: 0.5, height: 0.5, rounded: true, backgroundColor: "#ffffff", borderColor: style[0], borderSize: 1.5 }));
        if (element.id === "slow-thermometers") visual.underlays = [{ center: centers[0], width: 0.48, height: 0.48, rounded: true, backgroundColor: style[0] }];
      }
    }
    if (["cosmetic-lines", "cosmetic-cages", "cosmetic-symbols", "cosmetic-text", "cosmetic-shapes", "cosmetic-images"].includes(element.id)) {
      const created = addCreatorCosmetic(data.def, element.id, visual, { name: element.name });
      save(applyToolDefaults(created.def, created.objectId, element.id)); setSelectedObjectId(created.objectId);
    } else save(addCreatorConstraint(data.def, { type: element.id, sourceElementId: element.id, cells, path: cells }, visual));
    setAddingElement(false); setConstraintValue("");
  }

  function editObject(objectId: string, patch: Parameters<typeof updateCreatorObject>[2]) {
    if (!data) return;
    save(syncCreatorFog(updateCreatorObject(data.def, objectId, patch)));
    setSelectedObjectId(objectId);
  }

  function editLineConstraint(objectId: string, patch: Parameters<typeof updateCreatorLineConstraint>[2]) {
    if (!data) return;
    save(updateCreatorLineConstraint(data.def, objectId, patch));
    setSelectedObjectId(objectId);
  }

  function editGroupConstraint(objectId: string, patch: Parameters<typeof updateCreatorGroupConstraint>[2]) {
    if (!data) return;
    save(updateCreatorGroupConstraint(data.def, objectId, patch));
    setSelectedObjectId(objectId);
  }

  function editGlobalConstraint(objectId: string, patch: Parameters<typeof updateCreatorGlobalConstraint>[2]) {
    if (!data) return;
    save(updateCreatorGlobalConstraint(data.def, objectId, patch));
    setSelectedObjectId(objectId);
  }

  function applySelectionForGlobal(objectId: string, role: "cells" | "trigger" | "effect" = "cells") {
    if (!data || !selection.length) { setMessage("Select at least one cell first."); return; }
    const current = creatorConstraints(data.def).find((constraint) => constraint.id === objectId);
    const source = String(current?.sourceElementId ?? "");
    const cells = role === "cells" && isCreatorGlobalElementId(source) ? creatorOutsideRayFromSelection(data.def, source, selection) : selection;
    save(replaceCreatorGlobalCells(data.def, objectId, cells, role));
    setSelectedObjectId(objectId);
    setMessage(role === "trigger" ? "Fog trigger cells updated." : role === "effect" ? "Fog reveal cells updated." : "Constraint cells updated from the current selection.");
  }

  function editGroupGlobalSettings(type: string, patch: Parameters<typeof updateCreatorGroupConstraint>[2]) {
    if (!data) return;
    let next = data.def;
    for (const constraint of creatorConstraints(next)) if (constraint.type === type && constraint.id) next = updateCreatorGroupConstraint(next, constraint.id, patch);
    save(next);
    if (selectedObjectId) setSelectedObjectId(selectedObjectId);
  }

  function applySelectionForGroup(objectId: string) {
    if (!data || !selection.length) { setMessage("Select at least one cell to replace this constraint's cells."); return; }
    save(replaceCreatorGroupCells(data.def, objectId, selection));
    setSelectedObjectId(objectId);
    setMessage("Constraint cells updated from the current selection.");
  }

  function applySelectionForLine(objectId: string) {
    if (!data || selection.length < 2) { setMessage("Select at least two cells to replace the path."); return; }
    save(replaceCreatorLinePath(data.def, objectId, selection));
    setSelectedObjectId(objectId);
    setMessage("Line path updated from the current selection.");
  }

  function reverseLine(objectId: string) {
    if (!data) return;
    save(reverseCreatorLinePath(data.def, objectId));
    setSelectedObjectId(objectId);
    setMessage("Line direction reversed.");
  }

  function deleteObject(objectId: string) {
    if (!data) return;
    const removed = creatorConstraints(data.def).find((constraint) => constraint.id === objectId);
    const wasFog = removed?.type === "foglight" || removed?.type === "fog-trigger";
    save(syncCreatorFog(removeCreatorObject(data.def, objectId), wasFog));
    setSelectedObjectId(null);
    setMessage("Object deleted.");
  }

  function duplicateObject(objectId: string) {
    if (!data) return;
    const result = duplicateCreatorObject(data.def, objectId);
    if (!result.objectId) { setMessage("This object cannot be duplicated."); return; }
    save(syncCreatorFog(result.def));
    setSelectedObjectId(result.objectId);
    setMessage("Object duplicated.");
  }

  function reorderObject(objectId: string, direction: -1 | 1) {
    if (!data) return;
    save(moveCreatorObject(data.def, objectId, direction));
    setSelectedObjectId(objectId);
  }

  function changeObjectLayer(objectId: string, layer: "underlay" | "overlay") {
    if (!data) return;
    save(setCreatorObjectGraphicLayer(data.def, objectId, layer));
    setSelectedObjectId(objectId);
  }

  function objectDetail(object: CreatorEditableObject) {
    if (object.kind === "background") return String(object.sample?.url ?? "Image asset");
    const constraint = object.constraint;
    const cells = constraint ? (constraint.path ?? constraint.cells ?? []) : [];
    if (cells.length) return cells.map(cellLabel).join(" → ");
    if (typeof object.sample?.text === "string" && object.sample.text) return object.sample.text;
    if (object.visualCount) return `${object.visualCount} visual part${object.visualCount === 1 ? "" : "s"}`;
    return object.kind === "constraint" ? "Semantic constraint" : "Cosmetic object";
  }

  function exportBaseName() { return (data?.def.meta.title || "sphenpad-puzzle").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "sphenpad-puzzle"; }
  function downloadText(filename: string, text: string, type = "text/plain") {
    const blob = new Blob([text], { type });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = href; link.download = filename; link.click(); URL.revokeObjectURL(href);
  }
  function exportCreatorProjectFile() { if (!data) return; downloadText(`${exportBaseName()}.sphenpad.json`, creatorProjectJson(data.def), "application/json"); setInterchangeReport({ format: "creator-project", issues: [], preserved: ["complete editable CreatorProject"] }); setMessage("CreatorProject exported."); }
  function exportAuthoredFile() { if (!data) return; downloadText(`${exportBaseName()}.json`, authoredPuzzleJson(data.def), "application/json"); setInterchangeReport({ format: "sphenpad-authored", issues: [], preserved: ["complete SphenPad authored project"] }); setMessage("SphenPad authored JSON exported."); }
  function exportSclFile() { if (!data) return; const result = exportCreatorInterchange(data.def); downloadText(`${exportBaseName()}.scl`, result.scl); setInterchangeReport(result.report); setMessage("SudokuPad SCL exported."); }
  function exportSudokuPadJsonFile() { if (!data) return; const result = exportCreatorInterchange(data.def); downloadText(`${exportBaseName()}-sudokupad.json`, JSON.stringify(result.sourcePuzzle, null, 2)); setInterchangeReport(result.report); setMessage("SudokuPad JSON exported."); }
  async function copyScl() { if (!data) return; const result = exportCreatorInterchange(data.def); try { await navigator.clipboard.writeText(result.scl); setInterchangeReport(result.report); setMessage("SudokuPad SCL copied to clipboard."); } catch { setMessage("Unable to copy SCL to the clipboard."); } }
  async function copySudokuPadLink() { if (!data) return; const result = exportCreatorInterchange(data.def); try { await navigator.clipboard.writeText(result.sudokuPadUrl); setInterchangeReport(result.report); setMessage("SudokuPad link copied to clipboard."); } catch { setMessage("Unable to copy the SudokuPad link."); } }
  async function applyInterchangeImport(text: string) {
    if (!data) return;
    try {
      const result = await importCreatorInterchange(text, { id: data.def.id, sourceId: data.def.sourceId });
      save({ ...result.def, meta: { ...result.def.meta, creatorPublished: data.def.meta.creatorPublished === true } }); setCreatorScratchProgress(makeInitialProgress(result.def)); setInterchangeReport(result.report); setSelection([{ r: 0, c: 0 }]); setSelectedObjectId(null); setMessage(`Imported ${result.report.format}.`);
    } catch (error) { setMessage(error instanceof Error ? `Import failed: ${error.message}` : "Import failed."); }
  }
  async function importPuzzle(file: File | undefined) { if (file) await applyInterchangeImport(await file.text()); }
  async function importClipboard() { try { await applyInterchangeImport(await navigator.clipboard.readText()); } catch { setMessage("Unable to read puzzle data from the clipboard."); } }

  useEffect(() => {
    if (!selectedObjectId) { if (selectedObjectIds.length) setSelectedObjectIds([]); return; }
    if (!selectedObjectIds.includes(selectedObjectId)) setSelectedObjectIds([selectedObjectId]);
  }, [selectedObjectId]);

  useEffect(() => {
    const toolCycle: PuzzleProgress["activeTool"][] = ["value", "corner", "center", "highlight", "line"];
    const keyToTool: Record<string, PuzzleProgress["activeTool"]> = { z: "value", x: "corner", c: "center", v: "highlight", b: "line" };
    const letterHotkeys: Record<string, string> = { q: "A", w: "B", e: "C", r: "D", t: "E", y: "F", u: "G", i: "H", o: "I", 0: "0" };
    const alphabetPages: ReadonlyArray<ReadonlyArray<string>> = [["A", "B", "C", "D", "E", "F", "G", "H", "I"], ["J", "K", "L", "M", "N", "O", "P", "Q", "R"], ["S", "T", "U", "V", "W", "X", "Y", "Z", "*"]];
    const normalizeDigit = (key: string): string | null => {
      if (/^[1-9]$/.test(key)) return key;
      if (key === "0") return "0";
      if (key.startsWith("numpad") && /^numpad[0-9]$/.test(key)) return key.slice(-1);
      return null;
    };
    const solverControlsActive = testPlay || creatorTab !== "elements" || activeCatalogElement === null || creatorControlView === "solver";
    const elementControlsActive = creatorTab === "elements" && activeCatalogElement !== null && !testPlay && creatorControlView === "element";
    const selectionSet = () => new Set(selection.map(rcKey));
    const moveSelection = (dr: number, dc: number, extend: boolean) => {
      if (!data) return;
      const anchor = selection[selection.length - 1] ?? { r: 0, c: 0 };
      const next = { r: Math.max(0, Math.min(data.def.rows - 1, anchor.r + dr)), c: Math.max(0, Math.min(data.def.cols - 1, anchor.c + dc)) };
      if (!extend) { setSelection([next]); return; }
      const selected = selectionSet();
      selected.add(rcKey(next));
      setSelection(Array.from(selected).map((key) => { const [r, c] = key.split(":").map(Number); return { r, c }; }));
    };
    const cycleTool = (direction: 1 | -1) => {
      const index = toolCycle.indexOf(editorTool);
      setActiveTool(toolCycle[(index + direction + toolCycle.length) % toolCycle.length]);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable));
      if (typing) return;
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;

      if (!event.altKey && !event.ctrlKey && !event.metaKey && (key === "n" || key === "m")) { event.preventDefault(); if (key === "n") undoDefinition(); else redoDefinition(); return; }
      if (mod && !event.altKey && key === "z") { event.preventDefault(); if (event.shiftKey) redoDefinition(); else undoDefinition(); return; }
      if (mod && !event.altKey && key === "y") { event.preventDefault(); redoDefinition(); return; }
      if (elementControlsActive && mod && key === "c" && selectedObjectIds.length) { event.preventDefault(); void copySelectedObjects(); return; }
      if (elementControlsActive && mod && key === "v") { event.preventDefault(); void pasteSelectedObjects(); return; }
      if (elementControlsActive && mod && key === "a") { event.preventDefault(); selectAllCatalogObjects(); return; }
      if (elementControlsActive && (key === "delete" || key === "backspace") && selectedObjectIds.length) { event.preventDefault(); deleteSelectedObjects(); return; }

      if (solverControlsActive && event.ctrlKey && !event.altKey && !event.metaKey && key === "a") {
        event.preventDefault();
        if (event.shiftKey) { setSelection([]); return; }
        selectAllGridCells();
        return;
      }
      if (solverControlsActive && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && key === "i") {
        if (!data) return;
        event.preventDefault();
        const selected = selectionSet();
        const next: CellRC[] = [];
        for (let r = 0; r < data.def.rows; r++) for (let c = 0; c < data.def.cols; c++) if (!selected.has(`${r}:${c}`)) next.push({ r, c });
        setSelection(next);
        return;
      }
      if (solverControlsActive && !event.altKey && !event.ctrlKey && !event.metaKey && keyToTool[key]) { event.preventDefault(); setActiveTool(keyToTool[key]); return; }
      if (key === "escape") { setObjectContextMenu(null); setAddingElement(false); setCreatorDeleteMode(false); setSelectedObjectIds([]); setSelectedObjectId(null); return; }
      if (solverControlsActive && !event.altKey && !event.metaKey && (key === " " || key === "pagedown")) { event.preventDefault(); cycleTool(1); return; }
      if (solverControlsActive && !event.altKey && !event.metaKey && ((event.ctrlKey && key === " ") || key === "pageup")) { event.preventDefault(); cycleTool(-1); return; }
      if (solverControlsActive && !event.altKey && !event.metaKey && ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        event.preventDefault();
        const extend = event.ctrlKey || event.shiftKey;
        if (key === "arrowup") moveSelection(-1, 0, extend);
        if (key === "arrowdown") moveSelection(1, 0, extend);
        if (key === "arrowleft") moveSelection(0, -1, extend);
        if (key === "arrowright") moveSelection(0, 1, extend);
        return;
      }
      if (solverControlsActive && !event.altKey && !event.ctrlKey && !event.metaKey && (key === "backspace" || key === "delete")) { event.preventDefault(); handleCreatorBackspace(); return; }

      const digit = normalizeDigit(key);
      if (solverControlsActive && digit && !event.altKey && !event.metaKey) {
        event.preventDefault();
        const paletteIndex = digit === "0" ? -1 : Number(digit) - 1;
        if (!event.ctrlKey && !event.shiftKey && activeCatalogElement === null && editorTool === "highlight") {
          if (digit === "0") { applyCreatorHighlight("rgba(0,0,0,0)"); return; }
          const palette = highlightPalettePages[editorHighlightPage] ?? highlightPalettePages[0];
          const color = palette[paletteIndex];
          if (color) applyCreatorHighlight(color);
          return;
        }
        if (!event.ctrlKey && !event.shiftKey && activeCatalogElement === null && editorTool === "line") {
          if (digit === "0") { setEditorLineColor("#ffffff"); return; }
          const color = linePalette[paletteIndex];
          if (color) setEditorLineColor(color);
          return;
        }
        if (event.ctrlKey && event.shiftKey) { setActiveTool("highlight"); return; }
        if (digit === "0" && !event.ctrlKey && !event.shiftKey && editorAlphabetMode && (editorTool === "value" || editorTool === "center" || editorTool === "corner")) { setEditorAlphabetPage((editorAlphabetPage + 1) % 3 as 0 | 1 | 2); return; }
        if (editorAlphabetMode && !event.ctrlKey && !event.shiftKey && (editorTool === "value" || editorTool === "center" || editorTool === "corner")) {
          const symbol = alphabetPages[editorAlphabetPage]?.[paletteIndex];
          if (symbol) applyCreatorDigit(symbol);
          return;
        }
        if (event.ctrlKey) { applyCreatorDigit(digit, "center"); return; }
        if (event.shiftKey) { applyCreatorDigit(digit, "corner"); return; }
        applyCreatorDigit(digit);
        return;
      }
      if (solverControlsActive && !event.altKey && !event.ctrlKey && !event.metaKey && letterHotkeys[key]) {
        event.preventDefault();
        const symbol = letterHotkeys[key];
        if (editorTool === "center") applyCreatorDigit(symbol, "center");
        else if (editorTool === "corner") applyCreatorDigit(symbol, "corner");
        else applyCreatorDigit(symbol, "value");
        return;
      }
      if (key === "+" || key === "=") { event.preventDefault(); setCanvasZoom((value) => Math.min(4, Math.round((value + 0.1) * 10) / 10)); return; }
      if (key === "-") { event.preventDefault(); setCanvasZoom((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10)); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!data || !progress) return <div className="shell creatorEditorShell"><div className="creatorLoading">{message || "Opening puzzle creator..."}</div></div>;

  const workerComponents = getComponents(data.def);
  const solverSettings = { maxSolutions: data.def.meta.creatorSolverSettings?.maxSolutions ?? 2, maxNodes: data.def.meta.creatorSolverSettings?.maxNodes ?? 250000, logicalStepLimit: data.def.meta.creatorSolverSettings?.logicalStepLimit ?? data.def.rows * data.def.cols * 2 };
  const activeCatalogIds = new Set([
    "given-digits", "regions",
    ...(data.def.meta.creatorElements ?? []),
    ...(data.def.logic?.antiKing ? ["antiking"] : []),
    ...(data.def.logic?.antiKnight ? ["antiknight"] : []),
  ]);
  const activeCatalog = CATALOG.filter((element) => activeCatalogIds.has(element.id));
  const selectedCatalog = CATALOG.find((element) => element.id === activeCatalogElement) ?? null;
  const editableObjects = listCreatorObjects(data.def);
  const catalogObjects = activeCatalogElement ? editableObjects.filter((object) => object.elementId === activeCatalogElement) : [];
  const selectedObject = selectedObjectId ? editableObjects.find((object) => object.id === selectedObjectId) ?? null : null;
  const selectedObjects = editableObjects.filter((object) => selectedObjectIds.includes(object.id));
  const selectedCosmetics = selectedObjects.filter((object) => object.kind === "cosmetic");
  const selectedLineConstraint = selectedObject?.kind === "constraint" && isCreatorLineConstraint(selectedObject.constraint) ? selectedObject.constraint ?? null : null;
  const selectedGroupConstraint = selectedObject?.kind === "constraint" && isCreatorGroupConstraint(selectedObject.constraint) ? selectedObject.constraint ?? null : null;
  const selectedGlobalConstraint = selectedObject?.kind === "constraint" && isCreatorGlobalConstraint(selectedObject.constraint) ? selectedObject.constraint ?? null : null;
  const selectedLinePath = selectedLineConstraint ? (selectedLineConstraint.path ?? selectedLineConstraint.cells ?? []) : [];
  const selectedGroupCells = selectedGroupConstraint ? (selectedGroupConstraint.cells ?? []) : [];
  const selectedGlobalCells = selectedGlobalConstraint ? ((selectedGlobalConstraint.cells ?? []) as CellRC[]) : [];
  const selectedPaintBaseCells: CellRC[] | undefined = !addingElement && !creatorDeleteMode && selectedObject?.elementId === activeCatalogElement && creatorDirectModeForElement(activeCatalogElement) === "paint"
    ? selectedGroupConstraint ? ((selectedGroupConstraint.cells ?? []) as CellRC[])
      : selectedGlobalConstraint ? (selectedGlobalConstraint.type === "fog-trigger" ? ((fogPaintRole === "trigger" ? selectedGlobalConstraint.triggerCells ?? selectedGlobalConstraint.cells : selectedGlobalConstraint.effectCells) ?? []) as CellRC[] : ((selectedGlobalConstraint.cells ?? []) as CellRC[]))
      : selectedObject?.kind === "cosmetic" && selectedObject.elementId === "cosmetic-cages" ? ((creatorObjectVisualParts(data.def, selectedObject.id).find((entry) => entry.collection === "cages")?.part.cells as unknown[] | undefined) ?? []).flatMap((cell) => Array.isArray(cell) && cell.length >= 2 ? [{ r: Number(cell[0]), c: Number(cell[1]) }] : [])
      : []
    : undefined;
  const selectedCosmeticLine = selectedObject?.kind === "cosmetic" && selectedObject.elementId === "cosmetic-lines" && activeCatalogElement === "cosmetic-lines"
    ? creatorObjectVisualParts(data.def, selectedObject.id).find((part) => part.collection === "lines")?.part : undefined;
  const cosmeticLineNodes = Array.isArray(selectedCosmeticLine?.wayPoints)
    ? (selectedCosmeticLine.wayPoints as [number, number][]).filter((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)).map(([r, c]) => ({ r, c })) : [];
  const creatorEditPath = creatorLineMode === "nodes" && !addingElement && !creatorDeleteMode && selectedObject?.elementId === activeCatalogElement
    ? selectedLineConstraint ? (selectedLinePath as CellRC[]) : cosmeticLineNodes.length ? cosmeticLineNodes : undefined : undefined;
  const creatorEditPathSnapped = Boolean(creatorEditPath && selectedObject?.elementId === "cosmetic-lines");
  const selectedGlobalSource = selectedGlobalConstraint ? String(selectedGlobalConstraint.sourceElementId ?? selectedGlobalConstraint.type) : "";
  const selectedCustomDefinition = selectedGlobalConstraint?.type === "custom" ? (selectedGlobalConstraint.definition as Record<string, unknown> | undefined) : undefined;
  const selectedCustomBackend = selectedCustomDefinition?.backend as Record<string, unknown> | undefined;
  const selectedGroupNegativeValues = new Set(Array.isArray(selectedGroupConstraint?.negativeValues) ? (selectedGroupConstraint.negativeValues as unknown[]).map(Number).filter(Number.isFinite) : []);
  const selectedWhisperDifference = selectedLineConstraint?.type === "whisper" ? Number(selectedLineConstraint.minDifference ?? germanWhisperDifference(data.def)) : 0;
  const selectedWhisperPreset = selectedLineConstraint?.type === "whisper" ? (selectedWhisperDifference === germanWhisperDifference(data.def) ? "german" : selectedWhisperDifference === dutchWhisperDifference(data.def) ? "dutch" : "custom") : "custom";
  const objectSample = selectedObject?.sample ?? selectedObject?.constraint ?? {};
  const displayElementName = (element: CatalogElement) => data.def.meta.creatorElementNames?.[element.id] ?? element.name;
  const solutionByCell = new Map(getCreatorSolutionEntries(data.def).map((entry) => [`${entry.rc.r}:${entry.rc.c}`, entry.value]));
  const scratchProgress = creatorScratchProgress ?? makeInitialProgress(data.def);
  const neutralProgress: PuzzleProgress = {
    ...progress,
    cells: progress.cells.map((row, rowIndex) => row.map((cell, colIndex) => ({
      ...cell,
      given: undefined,
      value: solutionByCell.get(`${rowIndex}:${colIndex}`) || undefined,
      notes: scratchProgress.cells[rowIndex]?.[colIndex]?.notes ?? cell.notes,
      highlights: scratchProgress.cells[rowIndex]?.[colIndex]?.highlights ?? cell.highlights,
    }))),
    lines: scratchProgress.lines,
    lineCenterMarks: scratchProgress.lineCenterMarks,
    lineEdgeMarks: scratchProgress.lineEdgeMarks,
  };
  const displayedProgress = testPlay ? testProgress ?? makeInitialProgress(data.def) : activeCatalogElement === "regions"
    ? {
      ...progress,
      cells: progress.cells.map((row, rowIndex) => row.map((cell, colIndex) => ({
        ...cell,
        given: undefined,
        value: regionNumberAt(data.def, { r: rowIndex, c: colIndex }) || undefined,
        notes: { corner: new Set<string>(), center: new Set<string>(), candidates: new Set<string>() },
        highlights: [],
        color: undefined,
      }))),
      lines: [],
      lineCenterMarks: [],
      lineEdgeMarks: [],
    }
    : activeCatalogElement === null
      ? neutralProgress
      : progress;
  const creatorCellsRelevant = creatorTab !== "elements" || creatorControlView === "solver" || activeCatalogElement === null ||
    CREATOR_SOLVER_CONTROL_ELEMENT_IDS.has(activeCatalogElement) || fallbackSelectionOpen;
  let controlProgress: PuzzleProgress = testPlay
    ? displayedProgress
    : {
      ...displayedProgress,
      activeTool: editorTool,
      entryMode: (editorTool === "center" ? "center" : editorTool === "corner" ? "corner" : "value") as PuzzleProgress["entryMode"],
      alphabetMode: editorAlphabetMode,
      alphabetPage: editorAlphabetPage,
      highlightPalettePage: editorHighlightPage,
      linePaletteColor: editorLineColor,
      lineDoubleMode: editorLineDouble,
    };
  if (!testPlay && !creatorCellsRelevant) controlProgress = { ...controlProgress, selection: [] };
  if (activeCatalogElement !== "regions" && workerValidation?.invalidCells.length) {
    const invalid = new Set(workerValidation.invalidCells.map((cell) => `${cell.r}:${cell.c}`));
    controlProgress = { ...controlProgress, cells: controlProgress.cells.map((row, r) => row.map((cell, c) => invalid.has(`${r}:${c}`) ? { ...cell, highlights: [...new Set([...(cell.highlights ?? []), "rgba(255, 70, 70, 0.36)"])] } : cell)) };
  }
  const creatorLayoutClass = viewportLayoutKind === "tablet-portrait" ? " layoutTabletPortrait" : viewportLayoutKind === "tablet-landscape" ? " layoutTabletLandscape" : "";
  const creatorResizableLayout = viewportLayoutKind !== "desktop";
  const creatorLandscapeLayout = viewportLayoutKind === "phone-landscape" || viewportLayoutKind === "tablet-landscape";
  const creatorControlSplit = creatorLandscapeLayout ? creatorPaneSplit.landscape : creatorPaneSplit.portrait;
  const creatorGridStyle = creatorResizableLayout ? ({ "--creator-controls-size": `${(creatorControlSplit * 100).toFixed(2)}%` } as CSSProperties) : undefined;
  const selectedElementUsesSolverControls = activeCatalogElement === null || CREATOR_SOLVER_CONTROL_ELEMENT_IDS.has(activeCatalogElement);
  const showElementControls = creatorTab === "elements" && activeCatalogElement !== null && !testPlay && creatorControlView === "element";
  const showSolverControls = testPlay || creatorTab !== "elements" || activeCatalogElement === null || creatorControlView === "solver";
  const creatorHistoryButton = (kind: "undo" | "redo") => {
    const enabled = kind === "undo" ? history.length > 0 : future.length > 0;
    return <button className={`btn panelBtn panel${kind === "undo" ? "Undo" : "Redo"}`} disabled={!enabled}
      title={kind === "undo" ? "Undo (N); hold to repeat" : "Redo (M); hold to repeat"}
      onPointerDown={(event) => startCreatorHistoryHold(kind, event)}
      onPointerUp={stopCreatorHistoryHold} onPointerLeave={stopCreatorHistoryHold} onPointerCancel={stopCreatorHistoryHold}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => clickCreatorHistory(kind, event.detail)} type="button">
      {kind === "undo" ? <IconUndo /> : <IconRedo />}
    </button>;
  };

  function appearancePartSample(elementId: string, collection: CreatorVisualCollection): Record<string, unknown> {
    if (!data) return {};
    const editing = !addingElement && selectedObject?.elementId === elementId ? selectedObject : null;
    if (editing) return creatorObjectVisualParts(data.def, editing.id).find((entry) => entry.collection === collection)?.part ?? {};
    const defaults = data.def.meta.creatorToolDefaults?.[elementId];
    const latest = catalogObjects.at(-1);
    const latestPart = latest ? creatorObjectVisualParts(data.def, latest.id).find((entry) => entry.collection === collection)?.part ?? {} : {};
    return { ...latestPart, ...(defaults?.patch ?? {}), ...(defaults?.parts?.[collection] ?? {}) };
  }

  function changeAppearance(elementId: string, collection: CreatorVisualCollection, patch: CreatorObjectPatch) {
    if (!data) return;
    if (!addingElement && selectedObject?.elementId === elementId) {
      save(updateCreatorObjectVisuals(data.def, selectedObject.id, [collection], patch));
      return;
    }
    updateToolAppearanceDefault(patch, collection);
  }

  function renderDrawingSettings(elementId: string) {
    if (!DRAWING_GRID_IDS.has(elementId)) return null;
    return <div className="creatorAppearanceSection creatorDrawingSettings"><div className="creatorInspectorSubheading">Drawing grid</div><div className="creatorPropertyGrid">{elementId === "cosmetic-lines" ? null : <label>Snap to<select className="url" value={creatorSnapMode} onChange={(event) => updateCreatorDrawingSettings({ snap: event.target.value as CreatorDrawingSnapMode })}><option value="centers">Centers</option><option value="edges">Edges</option><option value="corners">Corners</option></select></label>}<label>Grid resolution<CreatorDraftInput key={`${elementId}-resolution`} value={creatorGridResolution} inputMode="numeric" onCommit={(text) => { if (text.trim() !== "" && Number.isFinite(Number(text))) updateCreatorDrawingSettings({ resolution: Number(text) }); }} /></label></div><label className="creatorToggle"><input type="checkbox" checked={creatorShowGrid} onChange={(event) => updateCreatorDrawingSettings({ displayGrid: event.target.checked })} />Display drawing grid</label><div className="creatorHelp">Resolution subdivides each Sudoku cell for cosmetic placement without changing the puzzle grid.</div></div>;
  }

  function renderAppearanceSettings(elementId: string) {
    const supported = isCreatorLineElementId(elementId) || isCreatorGroupElementId(elementId) || ["cosmetic-lines", "cosmetic-cages", "cosmetic-symbols", "cosmetic-text", "cosmetic-shapes", "cosmetic-images"].includes(elementId);
    if (!supported || elementId === "cosmetic-backgrounds") return null;
    const lineLike = isCreatorLineElementId(elementId) || elementId === "cosmetic-lines";
    const lineCollection: CreatorVisualCollection = elementId === "arrows" ? "arrows" : "lines";
    const endpointCollection: CreatorVisualCollection | null = elementId === "arrows" ? "overlays" : ["thermometers", "slow-thermometers", "between-lines", "lockout-lines", "double-arrows"].includes(elementId) ? "underlays" : null;
    if (lineLike) {
      const line = appearancePartSample(elementId, lineCollection), endpoints = endpointCollection ? appearancePartSample(elementId, endpointCollection) : {};
      return <div className="creatorAppearanceSection"><div className="creatorInspectorSubheading">Line interaction</div><div className="creatorInteractionModes" role="group" aria-label="Line mode"><button type="button" className={creatorLineMode === "draw" ? "btn primary" : "btn"} onClick={() => { setCreatorLineMode("draw"); setAddingElement(true); }}>Draw</button><button type="button" className={creatorLineMode === "nodes" ? "btn primary" : "btn"} onClick={() => { setCreatorLineMode("nodes"); setAddingElement(false); setCreatorDeleteMode(false); }}>Select nodes</button></div><div className="creatorHelp">Draw follows the {elementId === "cosmetic-lines" ? "subdivided drawing grid" : "cell centers"}. Select nodes to choose a line and drag its vertices without creating another line.</div><div className="creatorInspectorSubheading">Appearance</div><div className="creatorPropertyGrid"><CreatorColorField label="Line color" value={String(line.color ?? "#555555")} onChange={(value) => changeAppearance(elementId, lineCollection, { color: value })} /><label>Line weight<CreatorDraftInput value={Number(line.thickness ?? 6)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) changeAppearance(elementId, lineCollection, { thickness: Math.max(0.5, Number(text)) }); }} /></label><label>Opacity<CreatorDraftInput value={Number(line.opacity ?? 1)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) changeAppearance(elementId, lineCollection, { opacity: Math.max(0, Math.min(1, Number(text))) }); }} /></label>{elementId === "arrows" ? <label>Arrowhead size<CreatorDraftInput value={Number(line.headLength ?? 0.3)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) changeAppearance(elementId, lineCollection, { headLength: Math.max(0.05, Math.min(1.5, Number(text))) }); }} /></label> : null}</div>{endpointCollection ? <><div className="creatorInspectorSubheading">{elementId === "arrows" ? "Bulb" : elementId.includes("thermometer") ? "Bulb" : "Endpoints"}</div><div className="creatorPropertyGrid"><CreatorColorField label="Fill color" value={String(endpoints.backgroundColor ?? "#ffffff")} onChange={(value) => changeAppearance(elementId, endpointCollection, { backgroundColor: value })} /><CreatorColorField label="Outline color" value={String(endpoints.borderColor ?? "#555555")} onChange={(value) => changeAppearance(elementId, endpointCollection, { borderColor: value })} /><label>Outline weight<CreatorDraftInput value={Number(endpoints.borderSize ?? 1.5)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) changeAppearance(elementId, endpointCollection, { thickness: Math.max(0, Number(text)) }); }} /></label><label>Size<CreatorDraftInput value={Number(endpoints.width ?? 0.8)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) { const size = Math.max(0.1, Math.min(2, Number(text))); changeAppearance(elementId, endpointCollection, { width: size, height: size }); } }} /></label></div></> : null}{renderDrawingSettings(elementId)}</div>;
    }
    const cageLike = ["killer-cages", "look-and-say-cages", "different-values", "extra-region", "cosmetic-cages"].includes(elementId);
    if (cageLike) {
      const cage = appearancePartSample(elementId, "cages");
      return <div className="creatorAppearanceSection"><div className="creatorInspectorSubheading">Appearance</div><div className="creatorPropertyGrid"><CreatorColorField label="Outline color" value={String(cage.outlineC ?? cage.borderColor ?? "#555555")} onChange={(value) => changeAppearance(elementId, "cages", { borderColor: value })} /><CreatorColorField label="Clue color" value={String(cage.fontC ?? cage.textColor ?? "#555555")} onChange={(value) => changeAppearance(elementId, "cages", { textColor: value })} /></div></div>;
    }
    const underlay = ["even", "odd", "counting-circles", "clones", "cosmetic-shapes"].includes(elementId);
    const collection: CreatorVisualCollection = underlay ? "underlays" : "overlays";
    const graphic = appearancePartSample(elementId, collection);
    const textOnly = ["minimum", "maximum", "cosmetic-symbols", "cosmetic-text"].includes(elementId);
    const image = elementId === "cosmetic-images";
    const hasText = textOnly || ["difference-kropki", "ratio-kropki", "xv", "quadruples"].includes(elementId);
    return <div className="creatorAppearanceSection"><div className="creatorInspectorSubheading">Appearance</div><div className="creatorPropertyGrid">{!textOnly && !image ? <><CreatorColorField label="Fill color" value={String(graphic.backgroundColor ?? "transparent")} placeholder="transparent" onChange={(value) => changeAppearance(elementId, collection, { backgroundColor: value })} /><CreatorColorField label="Outline color" value={String(graphic.borderColor ?? "#555555")} onChange={(value) => changeAppearance(elementId, collection, { borderColor: value })} /><label>Outline weight<CreatorDraftInput value={Number(graphic.borderSize ?? 0)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) changeAppearance(elementId, collection, { thickness: Math.max(0, Number(text)) }); }} /></label></> : null}{hasText ? <><CreatorColorField label="Text color" value={String(graphic.textColor ?? "#555555")} onChange={(value) => changeAppearance(elementId, collection, { textColor: value })} /><label>Font size<CreatorDraftInput value={Number(graphic.fontSize ?? 16)} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) changeAppearance(elementId, collection, { fontSize: Math.max(1, Number(text)) }); }} /></label></> : null}<label>Width<CreatorDraftInput value={Number(graphic.width ?? 1)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) changeAppearance(elementId, collection, { width: Math.max(0.05, Number(text)) }); }} /></label><label>Height<CreatorDraftInput value={Number(graphic.height ?? 1)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) changeAppearance(elementId, collection, { height: Math.max(0.05, Number(text)) }); }} /></label>{(DIRECT_POINT_IDS.has(elementId) || image) ? <label>Angle<CreatorDraftInput value={Number(graphic.angle ?? 0)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) changeAppearance(elementId, collection, { angle: Number(text) }); }} /></label> : null}{image ? <label>Opacity<CreatorDraftInput value={Number(graphic.opacity ?? 1)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) changeAppearance(elementId, collection, { opacity: Math.max(0, Math.min(1, Number(text))) }); }} /></label> : null}</div>{elementId === "cosmetic-shapes" ? <label className="creatorToggle"><input type="checkbox" checked={Boolean(graphic.rounded)} onChange={(event) => changeAppearance(elementId, collection, { rounded: event.target.checked })} />Rounded shape</label> : null}{renderDrawingSettings(elementId)}</div>;
  }

  return (
    <div className={`shell puzzleShell creatorEditorShell${creatorLayoutClass}`} data-layout-mode={viewportLayoutKind}
      onKeyDownCapture={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type !== "checkbox" && target.type !== "radio" && target.type !== "button" && target.type !== "file") {
          event.preventDefault(); target.blur(); // Dismiss the virtual keyboard without submitting the editor.
        }
      }}>
      <header className="topbar puzzleTopbar creatorEditorTopbar">
        <button className="btn creatorExitButton" onClick={() => void exitCreator()} type="button">Exit</button>
        <nav className="creatorTopTabs" aria-label="Puzzle creator">
          <button className={creatorTab === "file" ? "btn primary" : "btn"} onClick={() => { setCreatorTab("file"); setAuthoringOpen(false); }} type="button">File</button>
          <button className={creatorTab === "elements" ? "btn primary" : "btn"} onClick={() => { setCreatorTab("elements"); setAuthoringOpen(false); }} type="button">Elements</button>
          <button className={creatorTab === "tools" ? "btn primary" : "btn"} onClick={() => { setCreatorTab("tools"); setAuthoringOpen(false); }} type="button">Tools</button>
        </nav>
        <div className="creatorTopbarActions">
          {creatorTab !== "file" ? <button type="button" className="btn creatorCanvasViewButton creatorTopbarIconButton" aria-label="Fit puzzle to available space" title="Fit puzzle to available space" onClick={() => { creatorNavigation.setNavigate(false); setCanvasZoom(1); setCanvasPan({ x: 0, y: 0 }); }}><IconFitView /></button> : null}
          <button className="btn topbarSettingsButton" onClick={() => setSettingsOpen(true)} title="Settings" type="button"><IconSettings /></button>
        </div>
      </header>
      {creatorTab === "file" ? <main className="page creatorFilePage">
        <div className="creatorFileContent">
          <div className="creatorFilePreview card"><GridCanvas def={data.def} progress={controlProgress} onSelection={NOOP} onLineStroke={NOOP} onLineTapCell={NOOP} onLineTapEdge={NOOP} onDoubleCell={NOOP} interactive={false} previewMode strictScale /></div>
          <div className="card creatorFileFields">
            <div className="creatorFileSection"><h3>Puzzle details</h3><label>Title<input className="url" value={data.def.meta.title ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, title: event.target.value } })} /></label><label>Author<input className="url" value={data.def.meta.author ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, author: event.target.value } })} /></label><label>Rules<textarea className="url creatorRulesInput" value={data.def.meta.rules ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, rules: event.target.value } })} /></label><label>Completion message<textarea className="url creatorRulesInput" value={data.def.meta.postSolveMessage ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, postSolveMessage: event.target.value } })} /></label></div>
            <div className="creatorFileSection"><h3>Grid structure</h3><div className="creatorStructureGrid"><label>Rows<CreatorDraftInput value={draftRows} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) setDraftRows(Math.max(1, Math.trunc(Number(text)))); }} /></label><label>Columns<CreatorDraftInput value={draftCols} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) setDraftCols(Math.max(1, Math.trunc(Number(text)))); }} /></label><label>Lowest digit<CreatorDraftInput value={draftDigitMin} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) setDraftDigitMin(Math.max(1, Math.trunc(Number(text)))); }} /></label><label>Highest digit<CreatorDraftInput value={draftDigitMax} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) setDraftDigitMax(Math.max(1, Math.trunc(Number(text)))); }} /></label><label>Digit count<CreatorDraftInput value={Math.max(1, draftDigitMax - draftDigitMin + 1)} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) setDraftDigitMax(Math.min(64, draftDigitMin + Math.max(1, Math.trunc(Number(text))) - 1)); }} /></label><label>Region layout<select className="url" value={draftRegionMode} onChange={(event) => setDraftRegionMode(event.target.value as CreatorRegionMode)}><option value="regular">Regular boxes</option><option value="irregular">Irregular regions</option><option value="none">No regions</option></select></label>{draftRegionMode === "regular" ? <><label>Box rows<CreatorDraftInput value={draftBoxRows} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) setDraftBoxRows(Math.max(1, Math.trunc(Number(text)))); }} /></label><label>Box columns<CreatorDraftInput value={draftBoxCols} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) setDraftBoxCols(Math.max(1, Math.trunc(Number(text)))); }} /></label></> : null}</div><label className="creatorToggle"><input type="checkbox" checked={creatorSudokuRulesEnabled(data.def)} onChange={(event) => save(setCreatorSudokuRules(data.def, event.target.checked))} />Standard row/column Sudoku rules</label><div className="creatorFileActions"><button className="btn primary" onClick={applyGridStructure} type="button">Apply structure</button>{draftRegionMode === "irregular" ? <button className="btn" onClick={() => startCoreEditing("regions")} type="button">Edit regions on board</button> : null}<button className="btn" onClick={() => clearEntries("regions")} type="button">Clear regions</button></div><div className="creatorHelp">Resizing keeps in-bounds givens, solution cells, and regions. Constraints that reference removed cells are discarded.</div></div>
            <div className="creatorFileSection"><h3>Givens</h3><label>Grid<textarea className="url creatorGridInput" value={givensText} onChange={(event) => setGivensText(event.target.value)} /></label><div className="creatorFileActions"><button className="btn primary" onClick={() => pasteGrid(givensText, "givens")} type="button">Apply givens</button><button className="btn" onClick={() => startCoreEditing("given-digits")} type="button">Edit on board</button><button className="btn" onClick={() => clearEntries("givens")} type="button">Clear givens</button></div></div>
            <div className="creatorFileSection"><h3>Solution</h3><label>Grid<textarea className="url creatorGridInput" value={solutionText} onChange={(event) => setSolutionText(event.target.value)} /></label><div className="creatorFileActions"><button className="btn primary" onClick={() => pasteGrid(solutionText, "solution")} type="button">Apply solution</button><button className="btn" onClick={startSolutionEditing} type="button">Edit on board</button><button className="btn" onClick={() => clearEntries("solution")} type="button">Clear solution</button><button className="btn danger" onClick={() => clearEntries("both")} type="button">Clear both</button></div><div className="creatorHelp">For values above 9, separate cells with spaces or commas. A compact one-character grid remains supported for ordinary Sudoku.</div></div>
            <div className="creatorFileSection"><h3>Structure validation</h3><div className={validation.length ? "creatorValidation invalid" : "creatorValidation valid"}>{validation.length ? validation.map((item) => <div key={item}>{item}</div>) : "Puzzle structure looks valid."}</div></div>
            <div className="creatorFileSection"><h3>Worker validation &amp; solver</h3><div className="creatorFileActions"><button className="btn" onClick={() => runWorkerValidation("givens")} type="button">Validate givens</button><button className="btn" onClick={() => runWorkerValidation("solution")} type="button">Validate solution</button><button className="btn" onClick={runLogicalSolver} type="button">Logical solve</button><button className="btn" onClick={runSolutionSearch} type="button">Find solutions</button>{solutionSearch?.solutions[0] ? <button className="btn primary" onClick={useFoundSolution} type="button">Use found solution</button> : null}</div><div className="creatorPropertyGrid"><label>Max solutions<CreatorDraftInput value={solverSettings.maxSolutions} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) updateSolverSetting("maxSolutions", Math.max(1, Math.min(20, Math.trunc(Number(text))))); }} /></label><label>Max search nodes<CreatorDraftInput value={solverSettings.maxNodes} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) updateSolverSetting("maxNodes", Math.max(100, Math.min(5000000, Math.trunc(Number(text))))); }} /></label><label>Logical step limit<CreatorDraftInput value={solverSettings.logicalStepLimit} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) updateSolverSetting("logicalStepLimit", Math.max(1, Math.min(100000, Math.trunc(Number(text))))); }} /></label></div>{workerConstraintErrors.length ? <div className="creatorValidation invalid">{workerConstraintErrors.map((item) => <div key={item.id}>{item.id}: {item.message}</div>)}</div> : null}{workerValidation ? <div className={workerValidation.diagnostics.length ? "creatorValidation invalid" : "creatorValidation valid"}>{workerValidation.diagnostics.length ? workerValidation.diagnostics.slice(0, 12).map((item, index) => <div key={`${item.code}-${index}`}>{item.message} {item.cells.length ? `(${item.cells.map(cellLabel).join(", ")})` : ""}</div>) : "Grid values satisfy the enabled worker constraints."}{workerValidation.thrownErrors.map((item, index) => <div key={`worker-error-${index}`}>{item}</div>)}</div> : null}{logicalResult ? <div className="creatorHelp">Logical solver: {logicalResult.status}; {logicalResult.steps.length} step{logicalResult.steps.length === 1 ? "" : "s"}.{logicalResult.message ? ` ${logicalResult.message}` : ""}</div> : null}{solutionSearch ? <div className="creatorHelp">Solution search: {solutionSearch.status}; {solutionSearch.solutions.length} solution{solutionSearch.solutions.length === 1 ? "" : "s"} returned after {solutionSearch.nodes.toLocaleString()} nodes.{solutionSearch.message ? ` ${solutionSearch.message}` : ""}</div> : null}<details className="creatorHelp"><summary>Worker components ({workerComponents.length})</summary>{workerComponents.slice(0, 100).map((component) => <div key={`${component.type}:${component.constraintId ?? component.name}:${component.cells.map(cellLabel).join("|")}`}>{component.name} — {component.type} — {component.cells.map(cellLabel).join(", ") || "no cells"}</div>)}{workerComponents.length > 100 ? <div>…and {workerComponents.length - 100} more.</div> : null}</details><div className="creatorHelp">Custom JavaScript is preserved but not executed locally.</div></div>
            <div className="creatorFileSection"><h3>Import &amp; export</h3><div className="creatorFileActions"><button className="btn" onClick={exportCreatorProjectFile} type="button">CreatorProject JSON</button><button className="btn" onClick={exportAuthoredFile} type="button">SphenPad JSON</button><button className="btn" onClick={exportSclFile} type="button">SCL file</button><button className="btn" onClick={exportSudokuPadJsonFile} type="button">SudokuPad JSON</button><button className="btn" onClick={() => void copyScl()} type="button">Copy SCL</button><button className="btn primary" onClick={() => void copySudokuPadLink()} type="button">Copy SudokuPad link</button></div><div className="creatorFileActions"><label className="btn creatorImportButton">Import file<input type="file" accept="application/json,.json,.txt,.scl,text/plain" onChange={(event) => void importPuzzle(event.target.files?.[0])} /></label><button className="btn" onClick={() => void importClipboard()} type="button">Import clipboard</button></div><div className="creatorHelp">Imports accept CreatorProject/SphenPad JSON, native SudokuPad JSON, SCL/CTC payloads or SudokuPad links, and F-Puzzles JSON/fpuz payloads. The current project identity is retained.</div>{interchangeReport ? <div className={interchangeReport.issues.some((item) => item.severity === "loss") ? "creatorValidation invalid" : "creatorValidation valid"}><div><strong>{interchangeReport.format}</strong> · {interchangeReport.preserved.length ? `Preserved: ${interchangeReport.preserved.join(", ")}.` : "No preservation summary."}</div>{interchangeReport.issues.map((item, index) => <div key={`${item.code}-${index}`}>{item.severity.toUpperCase()}: {item.message}{item.path ? ` (${item.path})` : ""}</div>)}</div> : null}</div>
            <div className="creatorFileActions"><button className="btn primary" onClick={() => void openPlaytest()} type="button">Playtest</button>{data.def.meta.creatorPublished ? <button className="btn" onClick={() => void openMyPuzzles()} type="button">Open My Puzzles</button> : <button className="btn" onClick={() => void saveToMyPuzzles()} type="button">Save to My Puzzles</button>}<button className="btn" onClick={() => void sharePuzzle()} type="button">Share SphenPad</button></div>
            <div className="creatorHelp">Creator projects stay in the Puzzle Creator until you explicitly save them to My Puzzles. Playtest uses an isolated fresh session, and normal solve progress remains separate from the authored project.</div>
          </div>
        </div>
      </main> : <>
      <main className={"page puzzlePage creatorPuzzlePage" + (creatorTab === "elements" ? " creatorElementsPage" : "")}>
        <div className="creatorElementsPageLayout">
          {creatorTab === "elements" ? <div className="creatorActiveElements">
            <div className="creatorActiveElementStrip">{activeCatalog.map((element) => <div className={activeCatalogElement === element.id ? "creatorActiveElementEntry active" : "creatorActiveElementEntry"} key={element.id}><button className="creatorActiveElement" onClick={() => activateCatalogElement(element)} type="button" aria-pressed={activeCatalogElement === element.id} title={displayElementName(element)}><span className="creatorActiveElementIcon">{element.icon}</span><span className="creatorActiveElementName">{displayElementName(element)}</span></button>{!element.core && activeCatalogElement === element.id ? <PopupMenuButton className="btn creatorElementMoreButton" ariaLabel={`More actions for ${displayElementName(element)}`} title={`More actions for ${displayElementName(element)}`} items={[{ label: "Rename", onSelect: () => renameCatalogElement(element) }, { label: "Delete", onSelect: () => removeCatalogElement(element), tone: "danger" }]} /> : null}</div>)}</div>
            <button className="btn primary creatorAddElement" onClick={() => setCatalogOpen(true)} type="button" title="Add element">+</button>
          </div> : null}
          {creatorTab === "tools" ? <div className="creatorToolStrip"><button className="btn" onClick={() => runWorkerValidation("givens")} type="button">Check validity</button><button className="btn" onClick={runLogicalSolver} type="button">Logical solve</button><button className="btn" onClick={runSolutionSearch} type="button">Find solutions</button><button className="btn" onClick={selectCellsSeen} disabled={!selection.length} type="button">Select cells seen</button><button className="btn" onClick={() => { setCreatorTab("file"); setMessage(`${workerComponents.length} registered worker components; expand Worker components to inspect them.`); }} type="button">Inspect components</button>{solutionSearch?.solutions[0] ? <button className="btn primary" onClick={useFoundSolution} type="button">Use solution</button> : null}</div> : null}

        <div ref={creatorGridLayoutRef} className="gridLayout creatorGridLayout" style={creatorGridStyle}>
          <section className="boardColumn creatorBoardColumn">
            <div ref={creatorNavigation.viewportRef} className={"card boardCard creatorCanvasViewport" + (creatorNavigation.navigate ? " navigating" : "")} {...creatorNavigation.handlers}>
              <div className="creatorCanvasTransform" style={{ transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})` }}><GridCanvas
                def={data.def}
                progress={controlProgress}
                conflictCheckerEnabled={activeCatalogElement === "regions" ? false : theme.conflictChecker}
                additionalConflictCells={activeCatalogElement === "regions" ? [] : liveCreatorConflictCells}
                hideAuthoredEntries={activeCatalogElement === "regions"}
                onSelection={testPlay ? (next) => setTestProgress((current) => current ? { ...current, selection: next } : current) : setSelection}
                onLineStroke={testPlay ? NOOP : onCreatorLineStroke}
                onLineTapCell={testPlay ? NOOP : onCreatorLineTapCell}
                onLineTapEdge={testPlay ? NOOP : onCreatorLineTapEdge}
                onLineGridTouch={() => { if (!testPlay && activeCatalogElement === null && editorTool === "line") setSelection([]); }}
                onDoubleCell={NOOP}
                creatorPathDrawing={creatorLineMode === "draw" && !testPlay && creatorTab === "elements" && creatorControlView === "element" && Boolean(activeCatalogElement && isCreatorLineElementId(activeCatalogElement)) && (addingElement || (!creatorDeleteMode && selectedObject?.elementId === activeCatalogElement))}
                onCreatorPath={addCreatorPathFromBoard}
                interactive={!creatorNavigation.navigate}
                creatorDirectMode={(activeCatalogElement !== "cosmetic-lines" || creatorLineMode === "draw") && !testPlay && creatorTab === "elements" && creatorControlView === "element" && activeCatalogElement && creatorDirectModeForElement(activeCatalogElement) && (addingElement || (!creatorDeleteMode && selectedObject?.elementId === activeCatalogElement)) ? creatorDirectModeForElement(activeCatalogElement) : undefined}
                creatorSnapMode={activeCatalogElement === "cosmetic-lines" ? "centers" : creatorSnapMode}
                creatorGridResolution={creatorGridResolution}
                creatorShowGrid={creatorShowGrid}
                creatorPaintBaseCells={selectedPaintBaseCells}
                creatorOutsideDiagonal={activeCatalogElement === "little-killers"}
                creatorEditPath={creatorEditPath}
                creatorEditPathSnapped={creatorEditPathSnapped}
                onCreatorEditPathPoint={handleCreatorEditPathPoint}
                onCreatorCells={handleCreatorDirectCells}
                onCreatorEdge={handleCreatorDirectEdge}
                onCreatorCorner={handleCreatorDirectCorner}
                onCreatorPoint={handleCreatorPoint}
                onCreatorFreePath={handleCreatorFreePath}
                onCreatorOutsideRay={handleCreatorOutsideRay}
                selectedCreatorObjectIds={!testPlay ? selectedObjectIds : []}
                onCreatorObjectPointerDown={!testPlay && creatorTab === "elements" && !addingElement ? selectCreatorObjectFromBoard : undefined}
                creatorObjectOnly={creatorDeleteMode}
              /></div>
            </div>
          </section>
          {creatorResizableLayout ? <div className={`creatorPaneResizeHandle${creatorLandscapeLayout ? " landscape" : " portrait"}`} role="separator" tabIndex={0} aria-label="Resize puzzle and creator controls" aria-orientation={creatorLandscapeLayout ? "vertical" : "horizontal"} aria-valuemin={28} aria-valuemax={creatorLandscapeLayout ? 58 : 64} aria-valuenow={Math.round(creatorControlSplit * 100)} onKeyDown={keyCreatorPaneResize} onPointerDown={startCreatorPaneResize} onPointerMove={resizeCreatorPane} onPointerUp={stopCreatorPaneResize} onPointerCancel={stopCreatorPaneResize}><span /></div> : null}
          <div className="kbdPanel">
          {showElementControls ? <section className="creatorInlineAuthoringPanel" aria-label="Puzzle element settings">
        <aside className="creatorInspector card">
          {selectedElementUsesSolverControls ? <div className="creatorOverlayHeader creatorElementSettingsHeader"><div className="creatorOverlayActions"><button className="btn" onClick={() => setCreatorControlView("solver")} type="button">Solver controls</button></div></div> : null}
          <div className="creatorInspectorQuickControls" aria-label="Creator editing controls">
            {creatorHistoryButton("undo")}
            {creatorHistoryButton("redo")}
            <button className={"btn panelBtn" + (controlProgress.multiSelect ? " primary" : "")} onPointerDown={startSelectModeHold} onPointerUp={stopSelectModeHold} onPointerLeave={stopSelectModeHold} onPointerCancel={stopSelectModeHold} onContextMenu={(event) => event.preventDefault()} onClick={clickSelectMode} title={`${controlProgress.multiSelect ? "Multi-touch selection enabled" : "Single-touch selection enabled"}; hold to select all cells`} type="button"><IconSelectMode multi={controlProgress.multiSelect} /></button>
          </div>
          <div className="creatorInspectorBody">
            {selectedCatalog ? <div className="creatorSelectedElement"><div><span>{selectedCatalog.description}</span></div>{CHECKABLE_ELEMENT_IDS.has(selectedCatalog.id) ? <label className="creatorToggle"><input type="checkbox" checked={data.def.meta.creatorConstraintChecks?.[selectedCatalog.id] !== false} onChange={(event) => setConstraintChecking(selectedCatalog, event.target.checked)} />Constraint checking</label> : null}</div> : <div className="muted">Select an active element above the puzzle to edit it.</div>}
            {selectedCatalog && (selectedCatalog.elementKind || VISUAL_EDITOR_IDS.has(selectedCatalog.id)) ? <div className="creatorObjectToolbar"><div className="creatorObjectToolbarButtons creatorInteractionModes">{!SINGLETON_GLOBAL_IDS.has(selectedCatalog.id) ? <button className={addingElement ? "btn primary" : "btn"} onClick={() => setCreatorInteractionMode("add")} type="button">Add</button> : null}<button className={!addingElement && !creatorDeleteMode ? "btn primary" : "btn"} onClick={() => setCreatorInteractionMode("edit")} type="button">Edit</button><button className={creatorDeleteMode ? "btn primary danger" : "btn danger"} disabled={!catalogObjects.length} onClick={() => setCreatorInteractionMode("delete")} type="button">Delete</button><button className="btn" disabled={!catalogObjects.length} onClick={selectAllCatalogObjects} type="button">Select all</button><button className="btn" disabled={!selectedObjectIds.length} onClick={() => void copySelectedObjects()} type="button">Copy</button><button className="btn" onClick={() => void pasteSelectedObjects()} type="button">Paste</button></div><span>{catalogObjects.length} authored object{catalogObjects.length === 1 ? "" : "s"}</span></div> : null}
            {selectedCatalog?.id === "custom-fog-clearing" && !creatorDeleteMode ? <div className="creatorFogRole"><div className="creatorInspectorSubheading">Fog paint</div><div className="creatorInteractionModes"><button className={fogPaintRole === "trigger" ? "btn primary" : "btn"} onClick={() => setFogPaintRole("trigger")} type="button">Trigger cells</button><button className={fogPaintRole === "effect" ? "btn primary" : "btn"} onClick={() => setFogPaintRole("effect")} type="button">Reveal cells</button></div><div className="creatorHelp">Paint trigger cells first, then reveal cells. Editing paints or erases the active set directly on the board.</div></div> : null}
            {addingElement && selectedCatalog && (selectedCatalog.elementKind || VISUAL_EDITOR_IDS.has(selectedCatalog.id)) ? <div className="creatorAddElementForm">
              {(selectedCatalog.id === "cosmetic-text" || selectedCatalog.id === "cosmetic-symbols") ? <label>{selectedCatalog.id === "cosmetic-text" ? "Text" : "Symbol"}<input className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)} placeholder={selectedCatalog.id === "cosmetic-text" ? "Label text" : "★"} /></label> : null}
              {(selectedCatalog.id === "cosmetic-images" || selectedCatalog.id === "cosmetic-backgrounds") ? <label>Image URL or data URL<input className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)} placeholder="https://…" /></label> : null}
              {(elementKind === "given") ? <label>Digit or symbol<input className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)} placeholder="e.g. 5" /></label> : null}
              {(selectedCatalog.id === "killer-cages" || selectedCatalog.id === "cosmetic-cages") ? <label>Clue / label<input className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)} placeholder="optional" /></label> : null}
              {selectedCatalog.id === "look-and-say-cages" ? <label>Count/digit pairs<input className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value.replace(/\s+/g, ""))} placeholder="e.g. 1522" /></label> : null}
              {selectedCatalog.id === "quadruples" ? <label>Clue digits<input className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)} placeholder="e.g. 1255" /></label> : null}
              {selectedCatalog.id === "difference-kropki" ? <label>Difference<input className="url" type="number" min="1" value={constraintValue} placeholder="1" onChange={(event) => setConstraintValue(event.target.value)} /></label> : null}
              {selectedCatalog.id === "ratio-kropki" ? <label>Ratio<input className="url" type="number" min="2" value={constraintValue} placeholder="2" onChange={(event) => setConstraintValue(event.target.value)} /></label> : null}
              {selectedCatalog.id === "xv" ? <label>Mark<select className="url" value={constraintValue || "X"} onChange={(event) => setConstraintValue(event.target.value)}><option value="X">X — sum 10</option><option value="V">V — sum 5</option></select></label> : null}
              {["little-killers", "sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms"].includes(selectedCatalog.id) ? <label>Outside clue<input className="url" type="number" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)} placeholder="e.g. 23" /></label> : null}
              {selectedCatalog.id === "little-killers" ? <div className="creatorHelp">Enter the clue, then press near a board edge and drag diagonally inward. A tap chooses the inward diagonal toward the board center.</div> : null}
              {["sandwich-sums", "x-sums", "skyscrapers", "numbered-rooms"].includes(selectedCatalog.id) ? <div className="creatorHelp">Enter the clue, then click or tap near the relevant outer board edge to place the full inward row/column ray.</div> : null}
              {selectedCatalog.id === "custom-constraint" ? <div className="creatorHelp">The definition and backend code can be edited after the object is created. Creator mode stores code but does not execute it.</div> : null}
              {selectedCatalog.id === "custom-fog-clearing" ? <div className="creatorHelp">Paint trigger cells on the board. After the first stroke SphenPad switches to Reveal cells so you can paint the cells that clear.</div> : null}
              {renderAppearanceSettings(selectedCatalog.id)}
              {creatorCellsRelevant && selectedCatalog.id !== "cosmetic-backgrounds" ? <div className="creatorSelection">Selected: {selection.length ? selection.map(cellLabel).join(", ") : "none"}</div> : null}
              {(isCreatorLineElementId(selectedCatalog.id) || Boolean(creatorDirectModeForElement(selectedCatalog.id))) ? <details className="creatorFallbackAuthoring" open={fallbackSelectionOpen} onToggle={(event) => setFallbackSelectionOpen(event.currentTarget.open)}><summary>Selection fallback</summary><div className="creatorHelp">Direct drawing/placement is the primary workflow. Use this only when you want to build the object from the current cell selection.</div><button className="btn" onClick={selectedCatalog.elementKind ? addElement : () => addVisualElement(selectedCatalog)} type="button">Add from current selection</button></details> : <button className="btn primary" onClick={selectedCatalog.elementKind ? addElement : () => addVisualElement(selectedCatalog)} type="button">Add object</button>}
              {isCreatorLineElementId(selectedCatalog.id) ? <div className="creatorHelp">Draw directly by pressing and dragging through cells. Add mode stays active so you can draw several lines with the same settings.</div> : DIRECT_EDGE_IDS.has(selectedCatalog.id) ? <div className="creatorHelp">Click or tap the cell edge where the mark belongs.</div> : DIRECT_CORNER_IDS.has(selectedCatalog.id) ? <div className="creatorHelp">Click or tap the grid intersection where the clue belongs.</div> : DIRECT_CELL_IDS.has(selectedCatalog.id) ? <div className="creatorHelp">Click or tap a cell to place the mark.</div> : DIRECT_OUTSIDE_IDS.has(selectedCatalog.id) ? <div className="creatorHelp">Place this clue directly from the relevant outer edge of the puzzle.</div> : DIRECT_PAINT_IDS.has(selectedCatalog.id) ? <div className="creatorHelp">Press and drag across cells to paint the group.</div> : selectedCatalog.id === "cosmetic-lines" ? <div className="creatorHelp">Draw directly on the cosmetic drawing grid. Snap mode and resolution control where points land.</div> : DIRECT_POINT_IDS.has(selectedCatalog.id) ? <div className="creatorHelp">Click or tap the snapped drawing-grid point where the object belongs.</div> : <div className="creatorHelp">Select or change cells on the board, then choose Add object. Direct placement is added where the element has an unambiguous grid gesture.</div>}
            </div> : null}
            {catalogObjects.length ? <div className="creatorObjectList"><div className="creatorInspectorSubheading">Objects</div>{catalogObjects.map((object) => <div className={selectedObjectIds.includes(object.id) ? "creatorObjectRow active" : "creatorObjectRow"} key={object.id} onContextMenu={(event) => { event.preventDefault(); selectCreatorObject(object.id, selectedObjectIds.length > 1); setObjectContextMenu({ id: object.id, x: event.clientX, y: event.clientY }); }}><input aria-label={`Select ${object.name}`} type="checkbox" checked={selectedObjectIds.includes(object.id)} onChange={() => { selectCreatorObject(object.id, true); setAddingElement(false); }} /><button className="creatorObjectRowMain" onClick={(event) => { selectCreatorObject(object.id, event.metaKey || event.ctrlKey || event.shiftKey || multiSelect); setAddingElement(false); }} type="button"><div><strong>{object.name}</strong><span>{objectDetail(object)}</span></div><small>{object.enabled ? object.kind : `${object.kind} · disabled`}</small></button><PopupMenuButton className="btn creatorObjectMore" ariaLabel={`Object actions for ${object.name}`} title="Object actions" items={[{ label: "Copy", onSelect: () => { selectCreatorObject(object.id); void copyObjectById(object.id); } }, { label: "Duplicate", onSelect: () => duplicateObject(object.id), disabled: object.kind === "background" || SINGLETON_GLOBAL_IDS.has(object.elementId) }, { label: object.enabled ? "Disable" : "Enable", onSelect: () => editObject(object.id, { enabled: !object.enabled }) }, { label: "Delete", onSelect: () => deleteObject(object.id), tone: "danger" }]} /></div>)}</div> : selectedCatalog && !addingElement ? <div className="muted">No authored objects of this type yet.</div> : null}
            {selectedObjectIds.length > 1 ? <div className="creatorBulkInspector"><div className="creatorInspectorSubheading">Bulk edit · {selectedObjectIds.length} objects</div><div className="creatorFileActions"><button className="btn" onClick={() => bulkEditSelected({ enabled: true })} type="button">Enable</button><button className="btn" onClick={() => bulkEditSelected({ enabled: false })} type="button">Disable</button><button className="btn" onClick={duplicateSelectedObjects} type="button">Duplicate</button><button className="btn" onClick={() => moveSelectedToEdge("back")} type="button">Send to back</button><button className="btn" onClick={() => moveSelectedToEdge("front")} type="button">Bring to front</button><button className="btn danger" onClick={deleteSelectedObjects} type="button">Delete</button></div><div className="creatorPropertyGrid"><label>Color<input className="url" placeholder="#555555" onChange={(event) => { if (event.target.value) bulkEditSelected({ color: event.target.value }); }} /></label><label>Opacity<input className="url" type="number" min="0" max="1" step="0.05" defaultValue="1" onBlur={(event) => bulkEditSelected({ opacity: Number(event.target.value) })} /></label></div>{selectedCosmetics.length >= 2 ? <><div className="creatorFileActions creatorAlignActions"><button className="btn" onClick={() => alignSelected("left")} type="button">Align left</button><button className="btn" onClick={() => alignSelected("center-x")} type="button">Center X</button><button className="btn" onClick={() => alignSelected("right")} type="button">Align right</button><button className="btn" onClick={() => alignSelected("top")} type="button">Align top</button><button className="btn" onClick={() => alignSelected("center-y")} type="button">Center Y</button><button className="btn" onClick={() => alignSelected("bottom")} type="button">Align bottom</button></div><div className="creatorFileActions"><button className="btn" onClick={() => snapSelected("cell-center")} type="button">Snap to cell centers</button><button className="btn" onClick={() => snapSelected("cell-edge")} type="button">Snap to grid</button></div></> : null}</div> : null}
            {selectedObject ? <div className="creatorPropertyInspector">
              <div className="creatorInspectorSubheading">Properties</div>
              <label>Name<CreatorDraftInput key={`${selectedObject.id}-name`} value={selectedObject.name} onCommit={(name) => editObject(selectedObject.id, { name })} /></label>
              <label className="creatorToggle"><input type="checkbox" checked={selectedObject.enabled} onChange={(event) => editObject(selectedObject.id, { enabled: event.target.checked })} />Enabled</label>
              {selectedObject.kind === "background" ? <label>Image URL<CreatorDraftInput key={`${selectedObject.id}-url`} value={String(objectSample.url ?? "")} inputMode="url" onCommit={(url) => editObject(selectedObject.id, { url })} /></label> : null}
              {selectedObject.kind === "constraint" ? <><label className="creatorToggle"><input type="checkbox" checked={selectedObject.constraint?.ignoreInSolver === true} onChange={(event) => editObject(selectedObject.id, { ignoreInSolver: event.target.checked })} />Ignore in solver/checker</label>{!selectedLineConstraint && !selectedGroupConstraint && !selectedGlobalConstraint ? <label>Clue / value<input className="url" value={String(selectedObject.constraint?.value ?? "")} onChange={(event) => editObject(selectedObject.id, { value: event.target.value })} /></label> : null}</> : null}
              {selectedLineConstraint ? <div className="creatorLineProperties">
                <div className="creatorInspectorSubheading">Line/path</div>
                <div className="creatorSelection">Path: {selectedLinePath.length ? selectedLinePath.map(cellLabel).join(" → ") : "none"}</div>
                <div className="creatorFileActions"><button className="btn" onClick={() => applySelectionForLine(selectedObject.id)} type="button">Use current selection</button><button className="btn" onClick={() => reverseLine(selectedObject.id)} type="button">Reverse path</button></div>
                <div className="creatorPathPoints"><div className="creatorInspectorSubheading">Path points</div>{selectedLinePath.map((cell, index) => <div className={selectedPathPointIndex === index ? "creatorPathPoint active" : "creatorPathPoint"} key={`${cell.r}:${cell.c}:${index}`} draggable onDragStart={() => setPathDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (pathDragIndex != null) reorderLinePoint(pathDragIndex, index); setPathDragIndex(null); }}><button className="btn creatorPathPointLabel" onClick={() => { setSelectedPathPointIndex(index); setSelection([cell]); }} type="button">{index + 1}. {cellLabel(cell)}</button><button className="btn" onClick={() => { if (selection.length === 1) setLinePoint(index, selection[0]); else setMessage("Select one board cell first."); }} type="button">Use cell</button><button className="btn" onClick={() => nudgeLinePoint(index, -1, 0)} type="button">↑</button><button className="btn" onClick={() => nudgeLinePoint(index, 1, 0)} type="button">↓</button><button className="btn" onClick={() => nudgeLinePoint(index, 0, -1)} type="button">←</button><button className="btn" onClick={() => nudgeLinePoint(index, 0, 1)} type="button">→</button><button className="btn" onClick={() => insertLinePoint(index)} type="button">+</button><button className="btn danger" disabled={selectedLinePath.length <= 2} onClick={() => deleteLinePoint(index)} type="button">×</button></div>)}</div><div className="creatorHelp">Drag the visible handles on the puzzle to move individual path points. The controls below remain available for precise reorder/insert/delete edits.</div>
                {selectedLineConstraint.type === "thermometer" ? <label className="creatorToggle"><input type="checkbox" checked={selectedLineConstraint.slow === true} onChange={(event) => editLineConstraint(selectedObject.id, { slow: event.target.checked })} />Slow thermometer (digits may stay equal)</label> : null}
                {selectedLineConstraint.type === "whisper" ? <><label>Preset<select className="url" value={selectedWhisperPreset} onChange={(event) => { const preset = event.target.value; if (preset === "german") editLineConstraint(selectedObject.id, { sourceElementId: "german-whispers", minDifference: germanWhisperDifference(data.def) }); else if (preset === "dutch") editLineConstraint(selectedObject.id, { sourceElementId: "dutch-whispers", minDifference: dutchWhisperDifference(data.def) }); }}><option value="german">German</option><option value="dutch">Dutch</option><option value="custom">Custom</option></select></label><label>Minimum difference<CreatorDraftInput key={`${selectedObject.id}-whisperDifference`} value={selectedWhisperDifference} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) editLineConstraint(selectedObject.id, { minDifference: Math.max(1, Math.min(creatorDigitCount(data.def), Number(text))) }); }} /></label><div className="creatorHelp">German defaults to {germanWhisperDifference(data.def)} and Dutch to {dutchWhisperDifference(data.def)} for this {creatorDigitCount(data.def)}-digit grid.</div></> : null}
                {selectedLineConstraint.type === "region-sum-line" ? <label className="creatorToggle"><input type="checkbox" checked={selectedLineConstraint.singleRegionTotals === true} onChange={(event) => editLineConstraint(selectedObject.id, { singleRegionTotals: event.target.checked })} />Repeated visits to the same region count toward one region total</label> : null}
                {selectedLineConstraint.type === "entropy-line" ? <label>Digit groups<textarea className="url creatorLineGroupsInput" key={`${selectedObject.id}-${formatCreatorDigitGroups(selectedLineConstraint.groups)}`} defaultValue={formatCreatorDigitGroups(selectedLineConstraint.groups)} onBlur={(event) => { const groups = parseCreatorDigitGroups(event.target.value, data.def); if (!groups) { setMessage("Digit groups must be disjoint in-range groups separated by |, for example 1,2,3 | 4,5,6 | 7,8,9."); return; } editLineConstraint(selectedObject.id, { groups }); }} /></label> : null}
                {selectedLineConstraint.type === "arrow" ? <label>Bulb cells<CreatorDraftInput key={`${selectedObject.id}-bulbCount`} value={Math.max(1, Number(selectedLineConstraint.bulbCellCount ?? 1))} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) editLineConstraint(selectedObject.id, { bulbCellCount: Math.max(1, Math.min(selectedLinePath.length - 1, Math.trunc(Number(text)))) }); }} /></label> : null}
                {selectedLineConstraint.type === "sequence-line" ? <div className="creatorHelp">Sequence digits must appear in path order with one constant difference; zero difference is allowed.</div> : null}
                {selectedLineConstraint.type === "between-line" ? <div className="creatorHelp">Every interior digit must lie strictly between the two circled endpoint digits.</div> : null}
                {selectedLineConstraint.type === "lockout-line" ? <div className="creatorHelp">Endpoint digits must differ by at least {Math.floor(creatorDigitCount(data.def) / 2)}; interior digits cannot lie between them.</div> : null}
                {selectedLineConstraint.type === "double-arrow" ? <div className="creatorHelp">The interior line sum must equal the sum of the two circled endpoint digits.</div> : null}
              </div> : null}
              {selectedGroupConstraint ? <div className="creatorLineProperties">
                <div className="creatorInspectorSubheading">Cell/group/edge</div>
                <div className="creatorSelection">Cells: {selectedGroupCells.length ? selectedGroupCells.map(cellLabel).join(", ") : "none"}</div>
                <div className="creatorFileActions"><button className="btn" onClick={() => applySelectionForGroup(selectedObject.id)} type="button">Use current selection</button></div>
                {selectedGroupConstraint.type === "difference" ? <><label>Difference<CreatorDraftInput key={`${selectedObject.id}-difference`} value={Number(selectedGroupConstraint.difference ?? selectedGroupConstraint.value ?? 1)} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) editGroupConstraint(selectedObject.id, { difference: Math.max(1, Math.trunc(Number(text))) }); }} /></label><label>Negative differences<input className="url" defaultValue={formatIntegerList(selectedGroupConstraint.negativeValues)} onBlur={(event) => { const values = parseIntegerList(event.target.value); if (!values) { setMessage("Negative differences must be positive integers separated by commas."); return; } editGroupGlobalSettings("difference", { negativeValues: values }); }} placeholder="e.g. 1" /></label><label className="creatorToggle"><input type="checkbox" checked={selectedGroupConstraint.overrideNegativeRatios === true} onChange={(event) => editGroupGlobalSettings("difference", { overrideNegativeRatios: event.target.checked })} />Marked difference dots override negative ratio restrictions</label><div className="creatorHelp">Negative differences apply to unmarked orthogonal edges puzzle-wide.</div></> : null}
                {selectedGroupConstraint.type === "ratio" ? <><label>Ratio<CreatorDraftInput key={`${selectedObject.id}-ratio`} value={Number(selectedGroupConstraint.ratio ?? selectedGroupConstraint.value ?? 2)} inputMode="numeric" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) editGroupConstraint(selectedObject.id, { ratio: Math.max(2, Math.trunc(Number(text))) }); }} /></label><label>Negative ratios<input className="url" defaultValue={formatIntegerList(selectedGroupConstraint.negativeValues)} onBlur={(event) => { const values = parseIntegerList(event.target.value, 2); if (!values) { setMessage("Negative ratios must be integers of 2 or greater separated by commas."); return; } editGroupGlobalSettings("ratio", { negativeValues: values }); }} placeholder="e.g. 2" /></label><label className="creatorToggle"><input type="checkbox" checked={selectedGroupConstraint.overrideNegativeDifferences === true} onChange={(event) => editGroupGlobalSettings("ratio", { overrideNegativeDifferences: event.target.checked })} />Marked ratio dots override negative difference restrictions</label><div className="creatorHelp">Negative ratios apply to unmarked orthogonal edges puzzle-wide.</div></> : null}
                {selectedGroupConstraint.type === "xv" ? <><label>Mark<select className="url" value={Number(selectedGroupConstraint.sum ?? selectedGroupConstraint.value ?? 10) === 5 ? "V" : "X"} onChange={(event) => editGroupConstraint(selectedObject.id, { sum: event.target.value === "V" ? 5 : 10 })}><option value="X">X — sum 10</option><option value="V">V — sum 5</option></select></label><label className="creatorToggle"><input type="checkbox" checked={selectedGroupNegativeValues.has(10)} onChange={(event) => { const values = new Set(selectedGroupNegativeValues); if (event.target.checked) values.add(10); else values.delete(10); editGroupGlobalSettings("xv", { negativeValues: [...values] }); }} />Negative X: unmarked edges cannot sum to 10</label><label className="creatorToggle"><input type="checkbox" checked={selectedGroupNegativeValues.has(5)} onChange={(event) => { const values = new Set(selectedGroupNegativeValues); if (event.target.checked) values.add(5); else values.delete(5); editGroupGlobalSettings("xv", { negativeValues: [...values] }); }} />Negative V: unmarked edges cannot sum to 5</label></> : null}
                {selectedGroupConstraint.type === "killer-cage" ? <><label>Sum / clue<CreatorDraftInput key={`${selectedObject.id}-cageValue`} value={String(selectedGroupConstraint.value ?? "")} onCommit={(value) => editGroupConstraint(selectedObject.id, { value })} placeholder="blank = all-different only" /></label><div className="creatorHelp">Digits in the cage cannot repeat. A positive clue additionally fixes the cage sum.</div></> : null}
                {selectedGroupConstraint.type === "clone" ? <div className="creatorHelp">Every cell in this clone group must contain the same digit. Create another clone object for another corresponding group.</div> : null}
                {selectedGroupConstraint.type === "quadruple" ? <><label>Clue digits<CreatorDraftInput key={`${selectedObject.id}-digits`} value={formatDigitList(selectedGroupConstraint.digits)} onCommit={(text) => editGroupConstraint(selectedObject.id, { digits: parseDigitList(text, data.def) })} placeholder="e.g. 1255" /></label><div className="creatorHelp">The listed digits, including repeats, must occur among the 2–4 cells touching the marked corner.</div></> : null}
                {selectedGroupConstraint.type === "look-and-say-cage" ? <><label>Count/digit pairs<CreatorDraftInput key={`${selectedObject.id}-looksay`} value={String(selectedGroupConstraint.value ?? "")} onCommit={(value) => editGroupConstraint(selectedObject.id, { value: value.replace(/\s+/g, "") })} placeholder="e.g. 1522" /></label><div className="creatorHelp">Pairs are count then digit: 1522 means one 5 and two 2s; 05 means no 5s.</div></> : null}
                {selectedGroupConstraint.type === "different-values" ? <div className="creatorHelp">All selected cells must contain different values. Selecting one full digit-set-sized group is equivalent to an extra region.</div> : null}
                {selectedGroupConstraint.type === "counting-circles" ? <div className="creatorHelp">A digit written in a circle equals the total number of circles containing that digit.</div> : null}
                {selectedGroupConstraint.type === "minimum" ? <div className="creatorHelp">Each marked cell is lower than every orthogonally adjacent cell outside this marked set.</div> : null}
                {selectedGroupConstraint.type === "maximum" ? <div className="creatorHelp">Each marked cell is higher than every orthogonally adjacent cell outside this marked set.</div> : null}
                {selectedGroupConstraint.type === "even" ? <div className="creatorHelp">Every marked square contains an even digit.</div> : null}
                {selectedGroupConstraint.type === "odd" ? <div className="creatorHelp">Every marked circle contains an odd digit.</div> : null}
              </div> : null}
              {selectedGlobalConstraint ? <div className="creatorLineProperties">
                <div className="creatorInspectorSubheading">Global / outside / advanced</div>
                {selectedGlobalConstraint.type === "diagonal" ? <div className="creatorHelp">All cells on the {selectedGlobalSource === "positive-diagonal" ? "positive" : "negative"} main diagonal must be different.</div> : null}
                {selectedGlobalConstraint.type === "disjoint-groups" ? <div className="creatorHelp">Cells in the same relative position of every active region form an all-different group.</div> : null}
                {selectedGlobalConstraint.type === "nonconsecutive" ? <div className="creatorHelp">Every orthogonally adjacent pair on the board is forbidden from differing by exactly 1.</div> : null}
                {selectedGlobalConstraint.type === "global-entropy" ? <><label>Digit groups<textarea className="url creatorLineGroupsInput" key={`${selectedObject.id}-${formatCreatorDigitGroups(selectedGlobalConstraint.groups)}`} defaultValue={formatCreatorDigitGroups(selectedGlobalConstraint.groups)} onBlur={(event) => { const groups = parseCreatorDigitGroups(event.target.value, data.def); if (!groups) { setMessage("Digit groups must be disjoint in-range groups separated by |."); return; } editGlobalConstraint(selectedObject.id, { groups }); }} /></label><div className="creatorHelp">Every 2×2 box must contain at least one digit from every group. The groups must cover the full digit range.</div></> : null}
                {selectedGlobalConstraint.type === "outside-clue" ? <><div className="creatorSelection">Ray: {selectedGlobalCells.length ? selectedGlobalCells.map(cellLabel).join(" → ") : "none"}</div><div className="creatorFileActions"><button className="btn" onClick={() => applySelectionForGlobal(selectedObject.id)} type="button">Use current selection</button></div><label>Clue<CreatorDraftInput key={`${selectedObject.id}-outside`} value={String(selectedGlobalConstraint.value ?? "")} inputMode="decimal" onCommit={(value) => editGlobalConstraint(selectedObject.id, { value })} /></label>{selectedGlobalSource === "little-killers" ? <div className="creatorHelp">The ordered diagonal ray sums to the clue.</div> : selectedGlobalSource === "sandwich-sums" ? <div className="creatorHelp">Digits strictly between the minimum and maximum digits in the ray sum to the clue.</div> : selectedGlobalSource === "x-sums" ? <div className="creatorHelp">The first digit gives X; the first X digits sum to the clue.</div> : selectedGlobalSource === "skyscrapers" ? <div className="creatorHelp">The clue is the number of successively taller digits visible from this side.</div> : <div className="creatorHelp">The first digit gives N; the Nth digit in the ray equals the clue.</div>}</> : null}
                {selectedGlobalConstraint.type === "indexer" ? <><div className="creatorSelection">Markers: {selectedGlobalCells.length ? selectedGlobalCells.map(cellLabel).join(", ") : "none"}</div><div className="creatorFileActions"><button className="btn" onClick={() => applySelectionForGlobal(selectedObject.id)} type="button">Use current selection</button></div><div className="creatorHelp">{selectedGlobalSource === "row-indexers" ? "A marker digit points to that row in its column, where the marker's own row number must appear." : "A marker digit points to that column in its row, where the marker's own column number must appear."}</div></> : null}
                {selectedGlobalConstraint.type === "custom" ? <><label>Definition name<CreatorDraftInput key={`${selectedObject.id}-customName`} value={String(selectedCustomDefinition?.name ?? "")} onCommit={(definitionName) => editGlobalConstraint(selectedObject.id, { definitionName })} /></label><label>Backend code<textarea className="url creatorRulesInput" key={`${selectedObject.id}-backend`} defaultValue={String(selectedCustomBackend?.code ?? "")} onBlur={(event) => { const code = event.target.value; if (code !== String(selectedCustomBackend?.code ?? "")) editGlobalConstraint(selectedObject.id, { code }); }} /></label><label>Input values (JSON)<textarea className="url creatorRulesInput" key={`${selectedObject.id}-custom-input`} defaultValue={JSON.stringify(selectedGlobalConstraint.input ?? {}, null, 2)} onBlur={(event) => { try { const parsed = JSON.parse(event.target.value); if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(); editGlobalConstraint(selectedObject.id, { input: parsed as Record<string, unknown> }); } catch { setMessage("Custom constraint input must be a JSON object."); } }} /></label><label>Input schema (JSON array)<textarea className="url creatorRulesInput" key={`${selectedObject.id}-custom-schema`} defaultValue={JSON.stringify(selectedCustomDefinition?.input ?? [], null, 2)} onBlur={(event) => { try { const parsed = JSON.parse(event.target.value); if (!Array.isArray(parsed)) throw new Error(); editGlobalConstraint(selectedObject.id, { inputSchema: parsed }); } catch { setMessage("Custom constraint input schema must be a JSON array."); } }} /></label><label>Components (JSON array)<textarea className="url creatorRulesInput" key={`${selectedObject.id}-custom-components`} defaultValue={JSON.stringify(selectedCustomDefinition?.components ?? [], null, 2)} onBlur={(event) => { try { const parsed = JSON.parse(event.target.value); if (!Array.isArray(parsed)) throw new Error(); editGlobalConstraint(selectedObject.id, { components: parsed }); } catch { setMessage("Custom constraint components must be a JSON array."); } }} /></label><div className="creatorHelp">SphenPad preserves SudokuMaker-style custom definitions and backend code. Arbitrary author code is preserved but intentionally not executed by creator validation or the local solver; mark it Ignore in solver/checker when solving without it.</div></> : null}
                {selectedGlobalConstraint.type === "foglight" ? <><div className="creatorSelection">Initial light cells: {selectedGlobalCells.length ? selectedGlobalCells.map(cellLabel).join(", ") : "none"}</div><div className="creatorFileActions"><button className="btn" onClick={() => applySelectionForGlobal(selectedObject.id)} type="button">Use current selection</button></div></> : null}
                {selectedGlobalConstraint.type === "fog-trigger" ? <><div className="creatorSelection">Trigger cells: {((selectedGlobalConstraint.triggerCells ?? selectedGlobalCells) as CellRC[]).map(cellLabel).join(", ") || "none"}</div><div className="creatorSelection">Reveal cells: {((selectedGlobalConstraint.effectCells ?? []) as CellRC[]).map(cellLabel).join(", ") || "none"}</div><div className="creatorFileActions"><button className="btn" onClick={() => applySelectionForGlobal(selectedObject.id, "trigger")} type="button">Set trigger cells</button><button className="btn" onClick={() => applySelectionForGlobal(selectedObject.id, "effect")} type="button">Set reveal cells</button></div><div className="creatorHelp">Choose Trigger cells or Reveal cells above, then paint directly on the board. Starting on an already-painted cell erases from that set.</div></> : null}
              </div> : null}
              {selectedObject.kind === "cosmetic" && selectedObject.elementId === "cosmetic-images" ? <label>Image URL<CreatorDraftInput key={`${selectedObject.id}-imageUrl`} value={String(objectSample.imageUrl ?? "")} inputMode="url" onCommit={(url) => editObject(selectedObject.id, { url })} /></label> : null}
              {selectedObject.kind === "cosmetic" && (selectedObject.elementId === "cosmetic-text" || selectedObject.elementId === "cosmetic-symbols") ? <label>{selectedObject.elementId === "cosmetic-text" ? "Text" : "Symbol"}<CreatorDraftInput key={`${selectedObject.id}-text`} value={String(objectSample.text ?? "")} onCommit={(text) => save(updateCreatorObjectVisuals(data.def, selectedObject.id, ["underlays", "overlays"], { text }))} /></label> : null}
              {selectedObject.kind === "cosmetic" && selectedObject.elementId === "cosmetic-cages" ? <label>Clue / label<CreatorDraftInput key={`${selectedObject.id}-value`} value={String(objectSample.value ?? "")} onCommit={(value) => editObject(selectedObject.id, { value })} /></label> : null}
              {selectedObject.kind !== "background" ? <>{renderAppearanceSettings(selectedObject.elementId)}{selectedObject.kind === "cosmetic" && (selectedObject.collections.includes("underlays") || selectedObject.collections.includes("overlays")) ? <label>Graphic layer<select className="url" value={selectedObject.collections.includes("overlays") ? "overlay" : "underlay"} onChange={(event) => changeObjectLayer(selectedObject.id, event.target.value as "underlay" | "overlay")}><option value="underlay">Under grid content</option><option value="overlay">Over grid content</option></select></label> : null}</> : <><label>Opacity<CreatorDraftInput key={`${selectedObject.id}-opacity`} value={Number(objectSample.opacity ?? 1)} inputMode="decimal" onCommit={(text) => { if (text.trim() && Number.isFinite(Number(text))) editObject(selectedObject.id, { opacity: Math.max(0, Math.min(1, Number(text))) }); }} /></label><label>Image layer<select className="url" value={String(objectSample.target ?? "background")} onChange={(event) => editObject(selectedObject.id, { target: event.target.value })}><option value="background">Background</option><option value="underlay">Underlay</option><option value="overlay">Overlay</option></select></label></>}
              <div className="creatorObjectActions"><button className="btn" onClick={() => reorderObject(selectedObject.id, -1)} type="button">Backward</button><button className="btn" onClick={() => reorderObject(selectedObject.id, 1)} type="button">Forward</button><button className="btn" onClick={() => { if (data) save(moveCreatorObjectsToEdge(data.def, [selectedObject.id], "back")); }} type="button">To back</button><button className="btn" onClick={() => { if (data) save(moveCreatorObjectsToEdge(data.def, [selectedObject.id], "front")); }} type="button">To front</button><button className="btn" disabled={selectedObject.kind === "background" || SINGLETON_GLOBAL_IDS.has(selectedObject.elementId)} onClick={() => duplicateObject(selectedObject.id)} type="button">Duplicate</button><button className="btn" disabled={selectedObject.kind === "background"} onClick={() => void copyObjectById(selectedObject.id)} type="button">Copy</button><button className="btn" disabled={selectedObject.kind === "background"} onClick={saveToolDefaultsForSelected} type="button">Use as defaults</button><button className="btn danger" onClick={() => deleteObject(selectedObject.id)} type="button">Delete</button></div>
            </div> : null}
          </div>
          <div className="creatorStatus">{message || (selectionKey(selection) || "no selection")}</div>
        </aside>
      </section> : null}
          {showSolverControls ? <div className="card controlStack mobileControlPanel creatorControls">
            {testPlay ? <button className="btn panelBtn panelUndo" onClick={undoTest} disabled={!testHistory.length} type="button"><IconUndo /></button> : creatorHistoryButton("undo")}
            {testPlay ? <button className="btn panelBtn panelRedo" onClick={redoTest} disabled={!testFuture.length} type="button"><IconRedo /></button> : creatorHistoryButton("redo")}
            <button className={"btn panelBtn panelSelectToggle" + (controlProgress.multiSelect ? " primary" : "")} onPointerDown={startSelectModeHold} onPointerUp={stopSelectModeHold} onPointerLeave={stopSelectModeHold} onPointerCancel={stopSelectModeHold} onContextMenu={(event) => event.preventDefault()} onClick={clickSelectMode} title={`${controlProgress.multiSelect ? "Multi-touch selection enabled" : "Single-touch selection enabled"}; hold to select all cells`} type="button"><IconSelectMode multi={controlProgress.multiSelect} /></button>
            <button title="Big numbers (Z)" className={"btn panelBtn panelTool1" + (controlProgress.activeTool === "value" ? " primary" : "")} onClick={() => setActiveTool("value")} type="button"><IconToolBig /></button>
            <button title="Edge notes (X)" className={"btn panelBtn panelTool2" + (controlProgress.activeTool === "corner" ? " primary" : "")} onClick={() => setActiveTool("corner")} type="button"><IconToolCorner /></button>
            <button title="Center notes (C)" className={"btn panelBtn panelTool3" + (controlProgress.activeTool === "center" ? " primary" : "")} onClick={() => setActiveTool("center")} type="button"><IconToolCenter /></button>
            <button title="Highlight (V)" className={"btn panelBtn panelTool4" + (controlProgress.activeTool === "highlight" ? " primary" : "")} onClick={() => setActiveTool("highlight")} type="button"><IconToolHighlight /></button>
            <button title="Line (B)" className={"btn panelBtn panelTool5" + (controlProgress.activeTool === "line" ? " primary" : "")} onClick={() => setActiveTool("line")} type="button"><IconToolLine /></button>
            <div className="panelMainGrid">
              {(controlProgress.activeTool === "value" || controlProgress.activeTool === "center" || controlProgress.activeTool === "corner") ? <Keyboard compact kind="numbers" progress={controlProgress} onDigit={testPlay ? applyTestDigit : applyCreatorDigit} onBackspace={() => testPlay ? applyTestDigit("") : handleCreatorBackspace()} onToggleAlphabet={() => testPlay ? setTestProgress((current) => current ? { ...current, alphabetMode: !current.alphabetMode } : current) : setEditorAlphabetMode((value) => !value)} onCycleAlphabetPage={() => testPlay ? setTestProgress((current) => current ? { ...current, alphabetPage: ((current.alphabetPage + 1) % 3) as 0 | 1 | 2 } : current) : setEditorAlphabetPage((value) => ((value + 1) % 3) as 0 | 1 | 2)} /> : null}
              {controlProgress.activeTool === "highlight" ? <Keyboard compact kind="highlight" progress={controlProgress} onColor={testPlay ? applyTestHighlight : applyCreatorHighlight} onWhite={() => testPlay ? applyTestHighlight("rgba(0,0,0,0)") : handleCreatorBackspace()} onBackspace={() => testPlay ? applyTestHighlight("rgba(0,0,0,0)") : handleCreatorBackspace()} onFlipPalette={() => testPlay ? setTestProgress((current) => current ? { ...current, highlightPalettePage: (current.highlightPalettePage === 0 ? 1 : 0) as 0 | 1 } : current) : setEditorHighlightPage((value) => value === 0 ? 1 : 0)} /> : null}
              {controlProgress.activeTool === "line" ? <Keyboard compact kind="line" progress={controlProgress} onBackspace={() => testPlay ? undefined : handleCreatorBackspace()} onColor={(color) => testPlay ? setTestProgress((current) => current ? { ...current, linePaletteColor: color } : current) : setEditorLineColor(color)} onToggleDoubleLine={() => testPlay ? setTestProgress((current) => current ? { ...current, lineDoubleMode: !current.lineDoubleMode } : current) : setEditorLineDouble((value) => !value)} /> : null}
            </div>
          </div> : null}
          </div>
        </div>
        </div>
      </main>
      </>}
      {testPlay ? <div className="creatorTestNotice creatorFloatingNotice">Test play is isolated from your authored puzzle.</div> : null}
      {objectContextMenu ? <div className="card creatorObjectContextMenu" style={{ left: objectContextMenu.x, top: objectContextMenu.y }} onMouseLeave={() => setObjectContextMenu(null)}><button className="btn" onClick={() => { void copyObjectById(objectContextMenu.id); setObjectContextMenu(null); }} type="button">Copy</button><button className="btn" onClick={() => { duplicateObject(objectContextMenu.id); setObjectContextMenu(null); }} type="button">Duplicate</button><button className="btn" onClick={() => { if (data) save(moveCreatorObjectsToEdge(data.def, [objectContextMenu.id], "back")); setObjectContextMenu(null); }} type="button">Send to back</button><button className="btn" onClick={() => { if (data) save(moveCreatorObjectsToEdge(data.def, [objectContextMenu.id], "front")); setObjectContextMenu(null); }} type="button">Bring to front</button><button className="btn danger" onClick={() => { deleteObject(objectContextMenu.id); setObjectContextMenu(null); }} type="button">Delete</button></div> : null}
      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} /> : null}
      {catalogOpen ? <div className="overlayBackdrop creatorCatalogBackdrop" role="dialog" aria-modal="true" aria-label="Add puzzle element"><div className="card creatorCatalog"><div className="creatorOverlayHeader"><div className="creatorInspectorHeading">Add element</div><div className="creatorOverlayActions"><button className="btn" onClick={() => setCatalogOpen(false)} type="button">Close</button></div></div><div className="creatorCatalogList">{CATALOG.filter((element) => !element.core).map((element) => <button className="creatorCatalogOption" key={element.id} onClick={() => selectCatalogElement(element)} type="button"><span>{element.icon}</span><div><strong>{element.name}</strong><small>{element.description}</small></div></button>)}</div></div></div> : null}
    </div>
  );
}
