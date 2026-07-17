import { startTransition, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPuzzle, upsertPuzzle } from "../core/storage";
import type { CellRC, PersistedPuzzle, PuzzleCosmetics, PuzzleDefinition, PuzzleProgress } from "../core/model";
import { makeInitialProgress } from "../core/scl";
import { GridCanvas } from "./GridCanvas";
import { Keyboard } from "./Keyboard";
import { IconRedo, IconSelectMode, IconToolBig, IconToolCenter, IconToolCorner, IconToolHighlight, IconToolLine, IconUndo } from "./icons";

type ElementKind = "given" | "cage" | "thermo" | "arrow" | "whisper" | "renban" | "palindrome" | "dot" | "region" | "fog";
type ConstraintKind = Exclude<ElementKind, "given">;
type CreatorTab = "file" | "elements" | "tools";

type CatalogElement = {
  id: string;
  icon: string;
  name: string;
  description: string;
  elementKind?: ElementKind;
};

const NOOP = () => {};

const CATALOG: CatalogElement[] = [
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
  ["renban-lines", "R", "Renban lines", "A line contains consecutive, non-repeating digits.", "renban"],
  ["german-whispers", "G", "German whisper lines", "Connected cells differ by at least 5."],
  ["dutch-whispers", "D", "Dutch whisper lines", "Connected cells differ by at least 4.", "whisper"],
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
  ["cosmetic-symbols", "*", "Cosmetic symbols", "Squares, circles, text, and arrows without logic."],
  ["fog-lights", "F", "Fog lights", "Lights that clear fog at the start.", "fog"],
  ["custom-fog-clearing", "F", "Custom fog clearing", "Customize conditions that clear fog."],
].map(([id, icon, name, description, elementKind]) => ({ id, icon, name, description, elementKind: elementKind as ElementKind | undefined }));

function sameCell(a: CellRC, b: CellRC) {
  return a.r === b.r && a.c === b.c;
}

function selectionKey(selection: CellRC[]) {
  return selection.map((cell) => `${cell.r}:${cell.c}`).sort().join(",");
}

function cellLabel(cell: CellRC) {
  return `R${cell.r + 1}C${cell.c + 1}`;
}

function parseGrid(text: string, rows: number, cols: number): string[] | null {
  const symbols = text.replace(/\s/g, "").split("");
  if (symbols.length !== rows * cols) return null;
  return symbols.map((symbol) => (symbol === "." || symbol === "0" ? "" : symbol));
}

function formatGrid(def: PuzzleDefinition, source: "givens" | "solution") {
  const byCell = new Map<string, string>();
  if (source === "givens") {
    for (const given of def.givens) byCell.set(`${given.rc.r}:${given.rc.c}`, given.v);
  } else {
    const solution = def.cosmetics.solution ?? "";
    for (let index = 0; index < solution.length; index++) byCell.set(`${Math.floor(index / def.cols)}:${index % def.cols}`, solution[index] === "." ? "" : solution[index]);
  }
  return Array.from({ length: def.rows }, (_, row) => Array.from({ length: def.cols }, (_, col) => byCell.get(`${row}:${col}`) || ".").join("")).join("\n");
}

function isInBounds(cell: CellRC, rows: number, cols: number) {
  return cell.r >= 0 && cell.c >= 0 && cell.r < rows && cell.c < cols;
}

function sanitizeDefinition(def: PuzzleDefinition): PuzzleDefinition {
  const rows = Math.max(1, def.rows);
  const cols = Math.max(1, def.cols);
  const validCells = (cells: CellRC[]) => cells.filter((cell) => isInBounds(cell, rows, cols));
  const cosmetics = def.cosmetics;
  return {
    ...def,
    rows,
    cols,
    size: Math.max(rows, cols),
    givens: def.givens.filter((given) => isInBounds(given.rc, rows, cols)),
    cosmetics: {
      ...cosmetics,
      cages: cosmetics.cages?.map((cage) => ({ ...cage, cells: validCells(cage.cells) })).filter((cage) => cage.cells.length),
      arrows: cosmetics.arrows?.map((arrow) => ({ ...arrow, bulb: arrow.bulb && isInBounds(arrow.bulb, rows, cols) ? arrow.bulb : undefined, path: arrow.path ? validCells(arrow.path) : undefined })).filter((arrow) => (arrow.path?.length ?? 0) > 1),
      dots: cosmetics.dots?.filter((dot) => isInBounds(dot.a, rows, cols) && isInBounds(dot.b, rows, cols)),
      thermolines: cosmetics.thermolines?.map((line) => ({ ...line, path: validCells(line.path) })).filter((line) => line.path.length > 1),
      whispers: cosmetics.whispers?.map((line) => ({ ...line, path: validCells(line.path) })).filter((line) => line.path.length > 1),
      palindromes: cosmetics.palindromes?.map((line) => ({ ...line, path: validCells(line.path) })).filter((line) => line.path.length > 1),
      renbanlines: cosmetics.renbanlines?.map((line) => ({ ...line, path: validCells(line.path) })).filter((line) => line.path.length > 1),
      irregularRegions: cosmetics.irregularRegions?.map((region) => ({ ...region, cells: validCells(region.cells) })).filter((region) => region.cells.length),
      fogLights: cosmetics.fogLights ? validCells(cosmetics.fogLights) : undefined,
    },
  };
}

function validationMessages(def: PuzzleDefinition) {
  const messages: string[] = [];
  const seen = new Set<string>();
  const values = new Map<string, string>();
  for (const given of def.givens) {
    const key = `${given.rc.r}:${given.rc.c}`;
    if (seen.has(key)) messages.push("A cell has more than one given.");
    seen.add(key);
    values.set(key, given.v);
    if (given.rc.r < 0 || given.rc.c < 0 || given.rc.r >= def.rows || given.rc.c >= def.cols) messages.push("A given sits outside the board.");
  }
  const reportDuplicates = (cells: CellRC[], label: string) => {
    const symbols = new Set<string>();
    for (const cell of cells) {
      const symbol = values.get(`${cell.r}:${cell.c}`)?.trim().toUpperCase();
      if (!symbol) continue;
      if (symbols.has(symbol)) {
        messages.push(`Duplicate given in ${label}.`);
        return;
      }
      symbols.add(symbol);
    }
  };
  for (let row = 0; row < def.rows; row++) reportDuplicates(Array.from({ length: def.cols }, (_, col) => ({ r: row, c: col })), `row ${row + 1}`);
  for (let col = 0; col < def.cols; col++) reportDuplicates(Array.from({ length: def.rows }, (_, row) => ({ r: row, c: col })), `column ${col + 1}`);
  const boxRows = def.cosmetics.subgrid?.r ?? 0;
  const boxCols = def.cosmetics.subgrid?.c ?? 0;
  if (boxRows > 0 && boxCols > 0) {
    for (let row = 0; row < def.rows; row += boxRows) {
      for (let col = 0; col < def.cols; col += boxCols) {
        const cells = Array.from({ length: boxRows * boxCols }, (_, index) => ({ r: row + Math.floor(index / boxCols), c: col + (index % boxCols) }))
          .filter((cell) => isInBounds(cell, def.rows, def.cols));
        reportDuplicates(cells, `box at R${row + 1}C${col + 1}`);
      }
    }
  }
  const solution = def.cosmetics.solution ?? "";
  if (solution && solution.length !== def.rows * def.cols) messages.push("Solution length does not match the board dimensions.");
  for (const given of def.givens) {
    const solutionValue = solution[given.rc.r * def.cols + given.rc.c];
    if (solutionValue && solutionValue !== "." && solutionValue !== given.v) messages.push("A given conflicts with the solution.");
  }
  for (const cage of def.cosmetics.cages ?? []) {
    if (!cage.cells.length || !cage.sum?.trim()) messages.push("Every killer cage needs cells and a sum.");
  }
  if (def.cosmetics.irregularRegions?.some((region) => !region.cells.length)) messages.push("An irregular region has no cells.");
  return Array.from(new Set(messages));
}

export function PuzzleEditorPage() {
  const { puzzleId } = useParams();
  const key = decodeURIComponent(puzzleId ?? "");
  const navigate = useNavigate();
  const [data, setData] = useState<PersistedPuzzle | null>(null);
  const [selection, setSelection] = useState<CellRC[]>([{ r: 0, c: 0 }]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [creatorTab, setCreatorTab] = useState<CreatorTab>("elements");
  const [entryMode] = useState<"given" | "solution">("solution");
  const [elementKind, setElementKind] = useState<ElementKind>("given");
  const [constraintValue, setConstraintValue] = useState("");
  const [addingElement, setAddingElement] = useState(false);
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [activeCatalogElement, setActiveCatalogElement] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const testPlay = false;
  const [history, setHistory] = useState<PuzzleDefinition[]>([]);
  const [future, setFuture] = useState<PuzzleDefinition[]>([]);
  const [testProgress, setTestProgress] = useState<PuzzleProgress | null>(null);
  const [testHistory, setTestHistory] = useState<PuzzleProgress[]>([]);
  const [testFuture, setTestFuture] = useState<PuzzleProgress[]>([]);
  const [solutionText, setSolutionText] = useState("");
  const [editorTool, setEditorTool] = useState<PuzzleProgress["activeTool"]>("value");
  const [editorAlphabetMode, setEditorAlphabetMode] = useState(false);
  const [editorAlphabetPage, setEditorAlphabetPage] = useState<0 | 1 | 2>(0);
  const [editorHighlightPage, setEditorHighlightPage] = useState<0 | 1>(0);
  const [editorLineColor, setEditorLineColor] = useState("#ff08ff");
  const [editorLineDouble, setEditorLineDouble] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = await getPuzzle(key);
      if (!stored?.def.meta.creatorPuzzle) {
        setMessage("This creator puzzle could not be found.");
        return;
      }
      setData(stored);
      setSelection([{ r: 0, c: 0 }]);
      setHistory([]);
      setFuture([]);
      setTestProgress(null);
      setTestHistory([]);
      setTestFuture([]);
    })();
  }, [key]);

  const progress = useMemo(() => {
    if (!data) return null;
    const next = makeInitialProgress(data.def);
    next.selection = selection;
    next.multiSelect = multiSelect;
    return next;
  }, [data, multiSelect, selection]);
  const validation = useMemo(() => data ? validationMessages(data.def) : [], [data]);

  useEffect(() => {
    if (!data) return;
    setSolutionText(formatGrid(data.def, "solution"));
  }, [data]);

  function save(nextDef: PuzzleDefinition, opts?: { recordHistory?: boolean }) {
    if (!data) return;
    const def = sanitizeDefinition(nextDef);
    if (opts?.recordHistory !== false) {
      setHistory((entries) => [...entries.slice(-99), data.def]);
      setFuture([]);
    }
    const next: PersistedPuzzle = {
      ...data,
      def,
      progress: makeInitialProgress(def),
      undo: [],
      redo: [],
      updatedAt: Date.now(),
    };
    setData(next);
    void upsertPuzzle(key, next);
  }

  function updateCosmetics(cosmetics: PuzzleCosmetics) {
    if (!data) return;
    save({ ...data.def, cosmetics });
  }

  function undoDefinition() {
    if (!data || !history.length) return;
    const previous = history[history.length - 1];
    setHistory((entries) => entries.slice(0, -1));
    setFuture((entries) => [data.def, ...entries].slice(0, 100));
    save(previous, { recordHistory: false });
  }

  function redoDefinition() {
    if (!data || !future.length) return;
    const next = future[0];
    setFuture((entries) => entries.slice(1));
    setHistory((entries) => [...entries, data.def].slice(-100));
    save(next, { recordHistory: false });
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

  function selectCatalogElement(element: CatalogElement) {
    if (!data) return;
    const active = new Set(data.def.meta.creatorElements ?? []);
    active.add(element.id);
    const cosmetics = element.id === "antiking" ? { ...data.def.cosmetics, antiKing: true }
      : element.id === "antiknight" ? { ...data.def.cosmetics, antiKnight: true }
      : data.def.cosmetics;
    save({ ...data.def, cosmetics, meta: { ...data.def.meta, creatorElements: Array.from(active) } });
    setCatalogOpen(false);
    setActiveCatalogElement(element.id);
    if (element.elementKind) {
      setElementKind(element.elementKind);
      setAddingElement(true);
    }
    setMessage(`${element.name} added.`);
  }

  function removeCatalogElement(element: CatalogElement) {
    if (!data) return;
    const creatorElements = (data.def.meta.creatorElements ?? []).filter((id) => id !== element.id);
    const cosmetics = element.id === "antiking" ? { ...data.def.cosmetics, antiKing: false }
      : element.id === "antiknight" ? { ...data.def.cosmetics, antiKnight: false }
      : data.def.cosmetics;
    save({ ...data.def, cosmetics, meta: { ...data.def.meta, creatorElements } });
    setActiveCatalogElement(null);
    setMessage(`${element.name} removed.`);
  }

  async function sharePuzzle() {
    if (!data) return;
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

  function openPlaytest() {
    if (!data) return;
    window.open(`#/p/${encodeURIComponent(data.def.id)}`, "_blank", "noopener,noreferrer");
  }

  function setCellValue(value: string) {
    if (!data || !selection.length) return;
    if (entryMode === "given") {
      const withoutSelection = data.def.givens.filter((given) => !selection.some((cell) => sameCell(cell, given.rc)));
      const givens = value ? [...withoutSelection, ...selection.map((rc) => ({ rc, v: value }))] : withoutSelection;
      save({ ...data.def, givens });
      return;
    }
    const symbols = Array.from(data.def.cosmetics.solution ?? "".padEnd(data.def.rows * data.def.cols, "."));
    for (const cell of selection) symbols[cell.r * data.def.cols + cell.c] = value || ".";
    updateCosmetics({ ...data.def.cosmetics, solution: symbols.join("") });
  }

  function pasteGrid(text: string, source: "givens" | "solution") {
    if (!data) return;
    const symbols = parseGrid(text, data.def.rows, data.def.cols);
    if (!symbols) {
      setMessage(`Expected exactly ${data.def.rows * data.def.cols} symbols.`);
      return;
    }
    if (source === "givens") {
      const givens = symbols.flatMap((symbol, index) => symbol ? [{ rc: { r: Math.floor(index / data.def.cols), c: index % data.def.cols }, v: symbol }] : []);
      save({ ...data.def, givens });
    } else {
      updateCosmetics({ ...data.def.cosmetics, solution: symbols.map((symbol) => symbol || ".").join("") });
    }
    setMessage(`${source === "givens" ? "Givens" : "Solution"} applied.`);
  }

  function addElement() {
    if (!data || !selection.length) return;
    const cosmetics = data.def.cosmetics;
    const cells = selection.map((cell) => ({ ...cell }));
    const path = cells.length > 1 ? cells : [];
    if (elementKind === "given") {
      const value = constraintValue.trim();
      if (!value) {
        setMessage("Enter a given digit or symbol.");
        return;
      }
      const withoutSelection = data.def.givens.filter((given) => !selection.some((cell) => sameCell(cell, given.rc)));
      save({ ...data.def, givens: [...withoutSelection, ...cells.map((rc) => ({ rc, v: value }))] });
      setConstraintValue("");
      setAddingElement(false);
      setMessage("Given added.");
      return;
    }
    if ((elementKind === "thermo" || elementKind === "arrow" || elementKind === "whisper" || elementKind === "renban" || elementKind === "palindrome") && !path.length) {
      setMessage("Select at least two cells for a path constraint.");
      return;
    }
    if (elementKind === "cage") updateCosmetics({ ...cosmetics, cages: [...(cosmetics.cages ?? []), { cells, sum: constraintValue.trim() }] });
    if (elementKind === "thermo") updateCosmetics({ ...cosmetics, thermolines: [...(cosmetics.thermolines ?? []), { path }] });
    if (elementKind === "arrow") updateCosmetics({ ...cosmetics, arrows: [...(cosmetics.arrows ?? []), { bulb: path[0], path }] });
    if (elementKind === "whisper") updateCosmetics({ ...cosmetics, whispers: [...(cosmetics.whispers ?? []), { path }] });
    if (elementKind === "renban") updateCosmetics({ ...cosmetics, renbanlines: [...(cosmetics.renbanlines ?? []), { path }] });
    if (elementKind === "palindrome") updateCosmetics({ ...cosmetics, palindromes: [...(cosmetics.palindromes ?? []), { path }] });
    if (elementKind === "dot" && cells.length === 2) updateCosmetics({ ...cosmetics, dots: [...(cosmetics.dots ?? []), { a: cells[0], b: cells[1], kind: constraintValue === "black" ? "black" : "white" }] });
    if (elementKind === "region") updateCosmetics({ ...cosmetics, irregularRegions: [...(cosmetics.irregularRegions ?? []), { cells }] });
    if (elementKind === "fog") updateCosmetics({ ...cosmetics, fogEnabled: true, fogLights: [...(cosmetics.fogLights ?? []), ...cells] });
    if (elementKind === "dot" && cells.length !== 2) {
      setMessage("Select exactly two cells for a dot.");
      return;
    }
    setAddingElement(false);
    setMessage("Element added.");
    setConstraintValue("");
  }

  function removeElement(kind: ConstraintKind, index: number) {
    if (!data) return;
    const cosmetics = data.def.cosmetics;
    const removal: Record<ConstraintKind, keyof PuzzleCosmetics> = {
      cage: "cages", thermo: "thermolines", arrow: "arrows", whisper: "whispers", renban: "renbanlines", palindrome: "palindromes", dot: "dots", region: "irregularRegions", fog: "fogLights",
    };
    const field = removal[kind];
    const current = cosmetics[field];
    if (!Array.isArray(current) || !current[index]) return;
    const remaining = current.filter((_, itemIndex) => itemIndex !== index);
    updateCosmetics({ ...cosmetics, [field]: remaining, ...(kind === "fog" && !remaining.length ? { fogEnabled: false } : {}) });
    setMessage("Element removed.");
  }

  function removeGiven(index: number) {
    if (!data) return;
    save({ ...data.def, givens: data.def.givens.filter((_, givenIndex) => givenIndex !== index) });
    setMessage("Given removed.");
  }

  function exportPuzzle() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data.def, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${(data.def.meta.title || "sphenpad-puzzle").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function importPuzzle(file: File | undefined) {
    if (!file || !data) return;
    try {
      const parsed = JSON.parse(await file.text()) as PuzzleDefinition;
      if (!parsed || !Array.isArray(parsed.givens) || !parsed.cosmetics || !Number.isFinite(parsed.rows) || !Number.isFinite(parsed.cols)) throw new Error();
      save({ ...parsed, id: data.def.id, sourceId: data.def.sourceId, meta: { ...parsed.meta, creatorPuzzle: true } });
      setMessage("Puzzle imported.");
    } catch {
      setMessage("That file is not a compatible SphenPad puzzle JSON export.");
    }
  }

  if (!data || !progress) return <div className="shell creatorEditorShell"><div className="creatorLoading">{message || "Opening puzzle creator..."}</div></div>;

  const activeCatalogIds = new Set([
    ...(data.def.meta.creatorElements ?? []),
    ...(data.def.cosmetics.antiKing ? ["antiking"] : []),
    ...(data.def.cosmetics.antiKnight ? ["antiknight"] : []),
  ]);
  const activeCatalog = CATALOG.filter((element) => activeCatalogIds.has(element.id));
  const selectedCatalog = CATALOG.find((element) => element.id === activeCatalogElement) ?? null;
  const labels: Record<ElementKind, string> = { given: "Given digit", cage: "Killer cage", thermo: "Thermometer", arrow: "Arrow", whisper: "Whisper", renban: "Renban", palindrome: "Palindrome", dot: "Dot", region: "Irregular region", fog: "Fog light" };
  const elements = [
    ...data.def.givens.map((given, index) => ({ key: `given-${index}`, label: labels.given, detail: `${given.v} at ${cellLabel(given.rc)}`, remove: () => removeGiven(index) })),
    ...(data.def.cosmetics.cages ?? []).map((cage, index) => ({ key: `cage-${index}`, label: labels.cage, detail: `${cage.sum || "No sum"} · ${cage.cells.map(cellLabel).join(", ")}`, remove: () => removeElement("cage", index) })),
    ...(data.def.cosmetics.thermolines ?? []).map((line, index) => ({ key: `thermo-${index}`, label: labels.thermo, detail: line.path.map(cellLabel).join(" → "), remove: () => removeElement("thermo", index) })),
    ...(data.def.cosmetics.arrows ?? []).map((arrow, index) => ({ key: `arrow-${index}`, label: labels.arrow, detail: (arrow.path ?? []).map(cellLabel).join(" → "), remove: () => removeElement("arrow", index) })),
    ...(data.def.cosmetics.whispers ?? []).map((line, index) => ({ key: `whisper-${index}`, label: labels.whisper, detail: line.path.map(cellLabel).join(" → "), remove: () => removeElement("whisper", index) })),
    ...(data.def.cosmetics.renbanlines ?? []).map((line, index) => ({ key: `renban-${index}`, label: labels.renban, detail: line.path.map(cellLabel).join(" → "), remove: () => removeElement("renban", index) })),
    ...(data.def.cosmetics.palindromes ?? []).map((line, index) => ({ key: `palindrome-${index}`, label: labels.palindrome, detail: line.path.map(cellLabel).join(" → "), remove: () => removeElement("palindrome", index) })),
    ...(data.def.cosmetics.dots ?? []).map((dot, index) => ({ key: `dot-${index}`, label: `${dot.kind === "black" ? "Black" : "White"} ${labels.dot}`, detail: `${cellLabel(dot.a)} · ${cellLabel(dot.b)}`, remove: () => removeElement("dot", index) })),
    ...(data.def.cosmetics.irregularRegions ?? []).map((region, index) => ({ key: `region-${index}`, label: labels.region, detail: region.cells.map(cellLabel).join(", "), remove: () => removeElement("region", index) })),
    ...(data.def.cosmetics.fogLights ?? []).map((cell, index) => ({ key: `fog-${index}`, label: labels.fog, detail: cellLabel(cell), remove: () => removeElement("fog", index) })),
  ];
  const displayedProgress = testPlay ? testProgress ?? makeInitialProgress(data.def) : progress;
  const controlProgress: PuzzleProgress = testPlay
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

  return (
    <div className="shell creatorEditorShell">
      <header className="topbar puzzleTopbar creatorEditorTopbar">
        <button className="btn creatorExitButton" onClick={() => startTransition(() => navigate("/creator"))} type="button">Exit</button>
        <nav className="creatorTopTabs" aria-label="Puzzle creator">
          <button className={creatorTab === "file" ? "btn primary" : "btn"} onClick={() => { setCreatorTab("file"); setAuthoringOpen(false); }} type="button">File</button>
          <button className={creatorTab === "elements" ? "btn primary" : "btn"} onClick={() => { setCreatorTab("elements"); setAuthoringOpen(true); }} type="button">Elements</button>
          <button className={creatorTab === "tools" ? "btn primary" : "btn"} onClick={() => { setCreatorTab("tools"); setAuthoringOpen(true); }} type="button">Tools</button>
        </nav>
      </header>
      {creatorTab === "file" ? <main className="page creatorFilePage">
        <div className="creatorFileContent">
          <div className="creatorFilePreview card"><GridCanvas def={data.def} progress={progress} onSelection={NOOP} onLineStroke={NOOP} onLineTapCell={NOOP} onLineTapEdge={NOOP} onDoubleCell={NOOP} interactive={false} /></div>
          <div className="card creatorFileFields">
            <label>Title<input className="url" value={data.def.meta.title ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, title: event.target.value } })} /></label>
            <label>Author<input className="url" value={data.def.meta.author ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, author: event.target.value } })} /></label>
            <label>Rules<textarea className="url creatorRulesInput" value={data.def.meta.rules ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, rules: event.target.value } })} /></label>
            <label>Completion message<textarea className="url creatorRulesInput" value={data.def.meta.postSolveMessage ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, postSolveMessage: event.target.value } })} /></label>
            <label>Paste solution<textarea className="url creatorGridInput" value={solutionText} onChange={(event) => setSolutionText(event.target.value)} onBlur={(event) => pasteGrid(event.target.value, "solution")} /></label>
            <div className="creatorFileActions"><button className="btn primary" onClick={openPlaytest} type="button">Playtest</button><button className="btn" onClick={() => void sharePuzzle()} type="button">Share</button><button className="btn" onClick={exportPuzzle} type="button">Download</button><label className="btn creatorImportButton">Import<input type="file" accept="application/json,.json" onChange={(event) => void importPuzzle(event.target.files?.[0])} /></label></div>
            <div className={validation.length ? "creatorValidation invalid" : "creatorValidation valid"}>{validation.length ? validation.map((item) => <div key={item}>{item}</div>) : "Puzzle structure looks valid."}</div>
          </div>
        </div>
      </main> : <>
      <main className="page puzzlePage creatorPuzzlePage">
        <div className="gridLayout creatorGridLayout">
          <section className="boardColumn">
            <div className="card boardCard">
            <GridCanvas def={data.def} progress={controlProgress} onSelection={testPlay ? (next) => setTestProgress((current) => current ? { ...current, selection: next } : current) : setSelection} onLineStroke={NOOP} onLineTapCell={NOOP} onLineTapEdge={NOOP} onDoubleCell={NOOP} />
            </div>
          </section>
          <div className="kbdPanel">
          <div className="card controlStack mobileControlPanel creatorControls">
            <button className="btn panelBtn panelUndo" onClick={testPlay ? undoTest : undoDefinition} disabled={testPlay ? !testHistory.length : !history.length} title="Undo (N)" type="button"><IconUndo /></button>
            <button className="btn panelBtn panelRedo" onClick={testPlay ? redoTest : redoDefinition} disabled={testPlay ? !testFuture.length : !future.length} title="Redo (M)" type="button"><IconRedo /></button>
            <button className={"btn panelBtn panelSelectToggle" + (controlProgress.multiSelect ? " primary" : "")} onClick={toggleSelectionMode} title={controlProgress.multiSelect ? "Multi-touch selection enabled" : "Single-touch selection enabled"} type="button"><IconSelectMode multi={controlProgress.multiSelect} /></button>
            <button title="Big numbers (Z)" className={"btn panelBtn panelTool1" + (controlProgress.activeTool === "value" ? " primary" : "")} onClick={() => setActiveTool("value")} type="button"><IconToolBig /></button>
            <button title="Edge notes (X)" className={"btn panelBtn panelTool2" + (controlProgress.activeTool === "corner" ? " primary" : "")} onClick={() => setActiveTool("corner")} type="button"><IconToolCorner /></button>
            <button title="Center notes (C)" className={"btn panelBtn panelTool3" + (controlProgress.activeTool === "center" ? " primary" : "")} onClick={() => setActiveTool("center")} type="button"><IconToolCenter /></button>
            <button title="Highlight (V)" className={"btn panelBtn panelTool4" + (controlProgress.activeTool === "highlight" ? " primary" : "")} onClick={() => setActiveTool("highlight")} type="button"><IconToolHighlight /></button>
            <button title="Line (B)" className={"btn panelBtn panelTool5" + (controlProgress.activeTool === "line" ? " primary" : "")} onClick={() => setActiveTool("line")} type="button"><IconToolLine /></button>
            <div className="panelMainGrid">
              {(controlProgress.activeTool === "value" || controlProgress.activeTool === "center" || controlProgress.activeTool === "corner") ? <Keyboard compact kind="numbers" progress={controlProgress} onDigit={testPlay ? applyTestDigit : setCellValue} onBackspace={() => testPlay ? applyTestDigit("") : setCellValue("")} onToggleAlphabet={() => testPlay ? setTestProgress((current) => current ? { ...current, alphabetMode: !current.alphabetMode } : current) : setEditorAlphabetMode((value) => !value)} onCycleAlphabetPage={() => testPlay ? setTestProgress((current) => current ? { ...current, alphabetPage: ((current.alphabetPage + 1) % 3) as 0 | 1 | 2 } : current) : setEditorAlphabetPage((value) => ((value + 1) % 3) as 0 | 1 | 2)} /> : null}
              {controlProgress.activeTool === "highlight" ? <Keyboard compact kind="highlight" progress={controlProgress} onColor={testPlay ? applyTestHighlight : NOOP} onWhite={() => testPlay ? applyTestHighlight("rgba(0,0,0,0)") : NOOP()} onBackspace={() => testPlay ? applyTestHighlight("rgba(0,0,0,0)") : setCellValue("")} onFlipPalette={() => testPlay ? setTestProgress((current) => current ? { ...current, highlightPalettePage: (current.highlightPalettePage === 0 ? 1 : 0) as 0 | 1 } : current) : setEditorHighlightPage((value) => value === 0 ? 1 : 0)} /> : null}
              {controlProgress.activeTool === "line" ? <Keyboard compact kind="line" progress={controlProgress} onBackspace={() => testPlay ? undefined : setCellValue("")} onColor={(color) => testPlay ? setTestProgress((current) => current ? { ...current, linePaletteColor: color } : current) : setEditorLineColor(color)} onToggleDoubleLine={() => testPlay ? setTestProgress((current) => current ? { ...current, lineDoubleMode: !current.lineDoubleMode } : current) : setEditorLineDouble((value) => !value)} /> : null}
            </div>
          </div>
          </div>
        </div>
      </main>
      </>}
      {testPlay ? <div className="creatorTestNotice creatorFloatingNotice">Test play is isolated from your authored puzzle.</div> : null}
      {creatorTab === "elements" && authoringOpen && !testPlay ? <div className="overlayBackdrop creatorOverlayBackdrop" role="dialog" aria-modal="true" aria-label="Puzzle elements">
        <aside className="creatorInspector card">
          <div className="creatorOverlayHeader">
          <div className="creatorInspectorHeading">Elements</div>
          <div className="creatorOverlayActions">
            <button className="btn" onClick={() => setAuthoringOpen(false)} type="button">Close</button>
          </div>
          </div>
          <div className="creatorActiveElements">
            <div className="creatorActiveElementStrip">{activeCatalog.map((element) => <button key={element.id} className={activeCatalogElement === element.id ? "creatorActiveElement active" : "creatorActiveElement"} onClick={() => { setActiveCatalogElement(element.id); if (element.elementKind) { setElementKind(element.elementKind); setAddingElement(true); } }} type="button" title={element.name}><span>{element.icon}</span>{element.name}</button>)}</div>
            <button className="btn primary creatorAddElement" onClick={() => setCatalogOpen(true)} type="button" title="Add element">+</button>
          </div>
          <div className="creatorInspectorBody">
            {selectedCatalog ? <div className="creatorSelectedElement"><div><strong>{selectedCatalog.icon} {selectedCatalog.name}</strong><span>{selectedCatalog.description}</span></div><button className="btn danger" onClick={() => removeCatalogElement(selectedCatalog)} type="button">Remove</button></div> : <div className="muted">Add an element, then tap it here to edit it.</div>}
            {addingElement && selectedCatalog?.elementKind ? <>
              {addingElement ? <div className="creatorAddElementForm">
                <div className="creatorSelection">Editing {selectedCatalog.name}</div>
                {elementKind === "given" ? <label>Digit or symbol<input className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)} placeholder="e.g. 5" /></label> : null}
                {elementKind === "cage" ? <label>Cage sum<input className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)} placeholder="e.g. 15" /></label> : null}
                {elementKind === "dot" ? <label>Dot type<select className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)}><option value="white">White: consecutive</option><option value="black">Black: 1:2 ratio</option></select></label> : null}
                <div className="creatorSelection">Selected: {selection.length ? selection.map(cellLabel).join(", ") : "none"}</div>
                <button className="btn primary" onClick={addElement} type="button">Add {labels[elementKind]}</button>
                <div className="creatorHelp">Select cells on the board first. Path elements use the selection order.</div>
              </div> : null}
            </> : null}
              <div className="creatorElementList">{elements.map((element) => <div className="creatorElementRow" key={element.key}><div><strong>{element.label}</strong><span>{element.detail}</span></div><button className="btn danger" onClick={element.remove} type="button">Remove</button></div>)}</div>
          </div>
          <div className="creatorStatus">{message || `Saved · ${selectionKey(selection) || "no selection"}`}</div>
        </aside>
      </div> : null}
      {catalogOpen ? <div className="overlayBackdrop creatorCatalogBackdrop" role="dialog" aria-modal="true" aria-label="Add puzzle element"><div className="card creatorCatalog"><div className="creatorOverlayHeader"><div className="creatorInspectorHeading">Add element</div><div className="creatorOverlayActions"><button className="btn" onClick={() => setCatalogOpen(false)} type="button">Close</button></div></div><div className="creatorCatalogList">{CATALOG.map((element) => <button className="creatorCatalogOption" key={element.id} onClick={() => selectCatalogElement(element)} type="button"><span>{element.icon}</span><div><strong>{element.name}</strong><small>{element.description}</small></div></button>)}</div></div></div> : null}
      {creatorTab === "tools" && authoringOpen ? <div className="overlayBackdrop creatorOverlayBackdrop" role="dialog" aria-modal="true" aria-label="Puzzle tools"><aside className="creatorInspector card"><div className="creatorOverlayHeader"><div className="creatorInspectorHeading">Tools</div><div className="creatorOverlayActions"><button className="btn" onClick={() => setAuthoringOpen(false)} type="button">Close</button></div></div><div className="creatorInspectorBody creatorTools"><button className="btn">Clear all non-given digits and markings</button><button className="btn">Do a single logical step</button><button className="btn">Solve step-by-step</button><button className="btn">Find all solutions and valid candidates</button><button className="btn">Check validity and uniqueness</button><div className="creatorHelp">Automatic solving tools are being prepared for the creator.</div></div></aside></div> : null}
    </div>
  );
}