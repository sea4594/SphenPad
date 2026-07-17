import { startTransition, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPuzzle, upsertPuzzle } from "../core/storage";
import type { CellRC, PersistedPuzzle, PuzzleCosmetics, PuzzleDefinition, PuzzleProgress } from "../core/model";
import { makeInitialProgress } from "../core/scl";
import { GridCanvas } from "./GridCanvas";
import { Keyboard } from "./Keyboard";
import { IconRedo, IconSelectMode, IconToolBig, IconToolCenter, IconToolCorner, IconToolHighlight, IconToolLine, IconUndo } from "./icons";

type EditorTab = "setup" | "clues" | "constraints" | "details";
type ConstraintKind = "cage" | "thermo" | "arrow" | "whisper" | "renban" | "palindrome" | "dot" | "region" | "fog";

const NOOP = () => {};

function sameCell(a: CellRC, b: CellRC) {
  return a.r === b.r && a.c === b.c;
}

function selectionKey(selection: CellRC[]) {
  return selection.map((cell) => `${cell.r}:${cell.c}`).sort().join(",");
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
  const [tab, setTab] = useState<EditorTab>("clues");
  const [entryMode, setEntryMode] = useState<"given" | "solution">("given");
  const [constraintKind, setConstraintKind] = useState<ConstraintKind>("cage");
  const [constraintValue, setConstraintValue] = useState("");
  const [message, setMessage] = useState("");
  const [testPlay, setTestPlay] = useState(false);
  const [history, setHistory] = useState<PuzzleDefinition[]>([]);
  const [future, setFuture] = useState<PuzzleDefinition[]>([]);
  const [testProgress, setTestProgress] = useState<PuzzleProgress | null>(null);
  const [testHistory, setTestHistory] = useState<PuzzleProgress[]>([]);
  const [testFuture, setTestFuture] = useState<PuzzleProgress[]>([]);
  const [givenText, setGivenText] = useState("");
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
    setGivenText(formatGrid(data.def, "givens"));
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

  function beginTestPlay() {
    if (!data) return;
    const next = makeInitialProgress(data.def);
    next.paused = false;
    setTestProgress(next);
    setTestHistory([]);
    setTestFuture([]);
    setTestPlay(true);
    setMessage("Test play is isolated from your authored puzzle.");
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

  function addConstraint() {
    if (!data || !selection.length) return;
    const cosmetics = data.def.cosmetics;
    const cells = selection.map((cell) => ({ ...cell }));
    const path = cells.length > 1 ? cells : [];
    if ((constraintKind === "thermo" || constraintKind === "arrow" || constraintKind === "whisper" || constraintKind === "renban" || constraintKind === "palindrome") && !path.length) {
      setMessage("Select at least two cells for a path constraint.");
      return;
    }
    if (constraintKind === "cage") updateCosmetics({ ...cosmetics, cages: [...(cosmetics.cages ?? []), { cells, sum: constraintValue.trim() }] });
    if (constraintKind === "thermo") updateCosmetics({ ...cosmetics, thermolines: [...(cosmetics.thermolines ?? []), { path }] });
    if (constraintKind === "arrow") updateCosmetics({ ...cosmetics, arrows: [...(cosmetics.arrows ?? []), { bulb: path[0], path }] });
    if (constraintKind === "whisper") updateCosmetics({ ...cosmetics, whispers: [...(cosmetics.whispers ?? []), { path }] });
    if (constraintKind === "renban") updateCosmetics({ ...cosmetics, renbanlines: [...(cosmetics.renbanlines ?? []), { path }] });
    if (constraintKind === "palindrome") updateCosmetics({ ...cosmetics, palindromes: [...(cosmetics.palindromes ?? []), { path }] });
    if (constraintKind === "dot" && cells.length === 2) updateCosmetics({ ...cosmetics, dots: [...(cosmetics.dots ?? []), { a: cells[0], b: cells[1], kind: constraintValue === "black" ? "black" : "white" }] });
    if (constraintKind === "region") updateCosmetics({ ...cosmetics, irregularRegions: [...(cosmetics.irregularRegions ?? []), { cells }] });
    if (constraintKind === "fog") updateCosmetics({ ...cosmetics, fogEnabled: true, fogLights: [...(cosmetics.fogLights ?? []), ...cells] });
    if (constraintKind === "dot" && cells.length !== 2) setMessage("Select exactly two cells for a dot.");
    else setMessage("Constraint added.");
    setConstraintValue("");
  }

  function removeLastConstraint() {
    if (!data) return;
    const cosmetics = data.def.cosmetics;
    const removal: Record<ConstraintKind, keyof PuzzleCosmetics> = {
      cage: "cages", thermo: "thermolines", arrow: "arrows", whisper: "whispers", renban: "renbanlines", palindrome: "palindromes", dot: "dots", region: "irregularRegions", fog: "fogLights",
    };
    const field = removal[constraintKind];
    const current = cosmetics[field];
    if (!Array.isArray(current) || !current.length) return;
    updateCosmetics({ ...cosmetics, [field]: current.slice(0, -1) });
    setMessage("Last constraint removed.");
  }

  function resize(rows: number, cols: number) {
    if (!data || rows < 1 || cols < 1) return;
    const givens = data.def.givens.filter(({ rc }) => rc.r < rows && rc.c < cols);
    const priorSolution = data.def.cosmetics.solution ?? "";
    const solution = Array.from({ length: rows * cols }, (_, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      return priorSolution[row * data.def.cols + col] ?? ".";
    }).join("");
    save({ ...data.def, rows, cols, size: Math.max(rows, cols), givens, cosmetics: { ...data.def.cosmetics, solution } });
    setSelection([{ r: 0, c: 0 }]);
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

  const constraintCount = Object.values(data.def.cosmetics).filter(Array.isArray).reduce((total, item) => total + item.length, 0);
  const labels: Record<ConstraintKind, string> = { cage: "Killer cage", thermo: "Thermometer", arrow: "Arrow", whisper: "Whisper", renban: "Renban", palindrome: "Palindrome", dot: "Dot", region: "Irregular region", fog: "Fog light" };
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
      <header className="creatorEditorTopbar">
        <button className="btn" onClick={() => startTransition(() => navigate("/creator"))} type="button">Back</button>
        <div className="creatorEditorIdentity"><strong>{data.def.meta.title || "Untitled puzzle"}</strong><span>{data.def.rows} x {data.def.cols} · {constraintCount} constraints</span></div>
        <div className="creatorEditorActions">
          <button className="btn" onClick={testPlay ? undoTest : undoDefinition} disabled={testPlay ? !testHistory.length : !history.length} title={testPlay ? "Undo test entry" : "Undo creator change"} type="button"><IconUndo /></button>
          <button className="btn" onClick={testPlay ? redoTest : redoDefinition} disabled={testPlay ? !testFuture.length : !future.length} title={testPlay ? "Redo test entry" : "Redo creator change"} type="button"><IconRedo /></button>
          <button className="btn" onClick={() => testPlay ? setTestPlay(false) : beginTestPlay()} type="button">{testPlay ? "Edit" : "Test play"}</button>
          {!testPlay ? <button className="btn" onClick={() => setTab("constraints")} type="button">Constraints</button> : null}
          {!testPlay ? <button className="btn" onClick={() => setTab("details")} type="button">Puzzle details</button> : null}
          <button className="btn" onClick={exportPuzzle} type="button">Export</button>
          <label className="btn creatorImportButton">Import<input type="file" accept="application/json,.json" onChange={(event) => void importPuzzle(event.target.files?.[0])} /></label>
        </div>
      </header>
      <main className="creatorWorkspace">
        <section className="creatorBoardArea">
          <div className="creatorModeBar">
            <span>{testPlay ? "Test preview" : `${entryMode === "given" ? "Given" : "Solution"} entry`}</span>
            {!testPlay ? <><button className={entryMode === "given" ? "btn primary" : "btn"} onClick={() => setEntryMode("given")} type="button">Givens</button><button className={entryMode === "solution" ? "btn primary" : "btn"} onClick={() => setEntryMode("solution")} type="button">Solution</button></> : <button className="btn" onClick={beginTestPlay} type="button">Reset test</button>}
          </div>
          <div className="creatorBoard card">
            <GridCanvas def={data.def} progress={controlProgress} onSelection={testPlay ? (next) => setTestProgress((current) => current ? { ...current, selection: next } : current) : setSelection} onLineStroke={NOOP} onLineTapCell={NOOP} onLineTapEdge={NOOP} onDoubleCell={NOOP} />
          </div>
          {testPlay ? <div className="creatorTestNotice">Test play uses a separate solver state and never alters your authored givens or solution.</div> : null}
        </section>
        <div className="creatorSidebar">
          <aside className="creatorInspector card">
          <div className="creatorInspectorHeading">Create puzzle</div>
          <div className="creatorTabs">{(["setup", "clues", "constraints", "details"] as EditorTab[]).map((nextTab) => <button key={nextTab} className={tab === nextTab ? "btn primary" : "btn"} onClick={() => setTab(nextTab)} type="button">{nextTab === "details" ? "Puzzle details" : nextTab}</button>)}</div>
          <div className="creatorInspectorBody">
            {tab === "setup" ? <>
              <label>Rows<input className="url" type="number" min="1" value={data.def.rows} onChange={(event) => resize(Number(event.target.value), data.def.cols)} /></label>
              <label>Columns<input className="url" type="number" min="1" value={data.def.cols} onChange={(event) => resize(data.def.rows, Number(event.target.value))} /></label>
              <label>Box rows<input className="url" type="number" min="1" value={data.def.cosmetics.subgrid?.r ?? ""} onChange={(event) => updateCosmetics({ ...data.def.cosmetics, subgrid: { r: Number(event.target.value) || 1, c: data.def.cosmetics.subgrid?.c ?? 1 } })} /></label>
              <label>Box columns<input className="url" type="number" min="1" value={data.def.cosmetics.subgrid?.c ?? ""} onChange={(event) => updateCosmetics({ ...data.def.cosmetics, subgrid: { r: data.def.cosmetics.subgrid?.r ?? 1, c: Number(event.target.value) || 1 } })} /></label>
              <label className="creatorToggle"><input type="checkbox" checked={Boolean(data.def.cosmetics.antiKnight)} onChange={(event) => updateCosmetics({ ...data.def.cosmetics, antiKnight: event.target.checked })} />Anti-knight</label>
              <label className="creatorToggle"><input type="checkbox" checked={Boolean(data.def.cosmetics.antiKing)} onChange={(event) => updateCosmetics({ ...data.def.cosmetics, antiKing: event.target.checked })} />Anti-king</label>
              <label className="creatorToggle"><input type="checkbox" checked={data.def.cosmetics.conflictChecker !== false} onChange={(event) => updateCosmetics({ ...data.def.cosmetics, conflictChecker: event.target.checked })} />Conflict checker</label>
            </> : null}
            {tab === "clues" ? <>
              <div className="creatorSelection">Selected: {selection.length ? selection.map((cell) => `R${cell.r + 1}C${cell.c + 1}`).join(", ") : "none"}</div>
              <label>Paste givens<textarea className="url creatorGridInput" value={givenText} onChange={(event) => setGivenText(event.target.value)} onBlur={(event) => pasteGrid(event.target.value, "givens")} /></label>
              <label>Paste solution<textarea className="url creatorGridInput" value={solutionText} onChange={(event) => setSolutionText(event.target.value)} onBlur={(event) => pasteGrid(event.target.value, "solution")} /></label>
            </> : null}
            {tab === "constraints" ? <>
              <label>Constraint<select className="url" value={constraintKind} onChange={(event) => setConstraintKind(event.target.value as ConstraintKind)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {constraintKind === "cage" ? <label>Cage sum<input className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)} placeholder="e.g. 15" /></label> : null}
              {constraintKind === "dot" ? <label>Dot type<select className="url" value={constraintValue} onChange={(event) => setConstraintValue(event.target.value)}><option value="white">White: consecutive</option><option value="black">Black: 1:2 ratio</option></select></label> : null}
              <button className="btn primary" onClick={addConstraint} type="button">Add {labels[constraintKind]}</button>
              <button className="btn danger" onClick={removeLastConstraint} type="button">Remove last {labels[constraintKind]}</button>
              <div className="creatorHelp">Select cells on the board first. Path constraints use the selection order.</div>
            </> : null}
            {tab === "details" ? <>
              <label>Title<input className="url" value={data.def.meta.title ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, title: event.target.value } })} /></label>
              <label>Author<input className="url" value={data.def.meta.author ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, author: event.target.value } })} /></label>
              <label>Rules<textarea className="url creatorRulesInput" value={data.def.meta.rules ?? ""} onChange={(event) => save({ ...data.def, meta: { ...data.def.meta, rules: event.target.value } })} /></label>
              <div className={validation.length ? "creatorValidation invalid" : "creatorValidation valid"}>{validation.length ? validation.map((item) => <div key={item}>{item}</div>) : "Puzzle structure looks valid."}</div>
            </> : null}
          </div>
          <div className="creatorStatus">{message || `Saved · ${selectionKey(selection) || "no selection"}`}</div>
          </aside>
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
      </main>
    </div>
  );
}