import { startTransition, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPuzzle, upsertPuzzle } from "../core/storage";
import type { CellRC, PersistedPuzzle, PuzzleCosmetics, PuzzleDefinition } from "../core/model";
import { makeInitialProgress } from "../core/scl";
import { GridCanvas } from "./GridCanvas";

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

function validationMessages(def: PuzzleDefinition) {
  const messages: string[] = [];
  const seen = new Set<string>();
  for (const given of def.givens) {
    const key = `${given.rc.r}:${given.rc.c}`;
    if (seen.has(key)) messages.push("A cell has more than one given.");
    seen.add(key);
    if (given.rc.r < 0 || given.rc.c < 0 || given.rc.r >= def.rows || given.rc.c >= def.cols) messages.push("A given sits outside the board.");
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
  const [tab, setTab] = useState<EditorTab>("clues");
  const [entryMode, setEntryMode] = useState<"given" | "solution">("given");
  const [constraintKind, setConstraintKind] = useState<ConstraintKind>("cage");
  const [constraintValue, setConstraintValue] = useState("");
  const [message, setMessage] = useState("");
  const [testPlay, setTestPlay] = useState(false);

  useEffect(() => {
    void (async () => {
      const stored = await getPuzzle(key);
      if (!stored?.def.meta.creatorPuzzle) {
        setMessage("This creator puzzle could not be found.");
        return;
      }
      setData(stored);
      setSelection([{ r: 0, c: 0 }]);
    })();
  }, [key]);

  const progress = useMemo(() => {
    if (!data) return null;
    const next = makeInitialProgress(data.def);
    next.selection = selection;
    return next;
  }, [data, selection]);
  const validation = useMemo(() => data ? validationMessages(data.def) : [], [data]);

  function save(nextDef: PuzzleDefinition) {
    if (!data) return;
    const next: PersistedPuzzle = {
      ...data,
      def: nextDef,
      progress: makeInitialProgress(nextDef),
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

  return (
    <div className="shell creatorEditorShell">
      <header className="creatorEditorTopbar">
        <button className="btn" onClick={() => startTransition(() => navigate("/creator"))} type="button">Back</button>
        <div className="creatorEditorIdentity"><strong>{data.def.meta.title || "Untitled puzzle"}</strong><span>{data.def.rows} x {data.def.cols} · {constraintCount} constraints</span></div>
        <div className="creatorEditorActions">
          <button className="btn" onClick={() => setTestPlay((value) => !value)} type="button">{testPlay ? "Edit" : "Test play"}</button>
          <button className="btn" onClick={exportPuzzle} type="button">Export</button>
          <label className="btn creatorImportButton">Import<input type="file" accept="application/json,.json" onChange={(event) => void importPuzzle(event.target.files?.[0])} /></label>
        </div>
      </header>
      <main className="creatorWorkspace">
        <section className="creatorBoardArea">
          <div className="creatorModeBar">
            <span>{testPlay ? "Test preview" : `${entryMode === "given" ? "Given" : "Solution"} entry`}</span>
            {!testPlay ? <><button className={entryMode === "given" ? "btn primary" : "btn"} onClick={() => setEntryMode("given")} type="button">Givens</button><button className={entryMode === "solution" ? "btn primary" : "btn"} onClick={() => setEntryMode("solution")} type="button">Solution</button></> : null}
          </div>
          <div className="creatorBoard card">
            <GridCanvas def={data.def} progress={progress} onSelection={setSelection} onLineStroke={NOOP} onLineTapCell={NOOP} onLineTapEdge={NOOP} onDoubleCell={NOOP} interactive={!testPlay} />
          </div>
          {!testPlay ? <div className="creatorDigitPad">{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((value) => <button key={value} className="btn" onClick={() => setCellValue(value)} type="button">{value}</button>)}<button className="btn danger" onClick={() => setCellValue("")} type="button">Clear</button></div> : <div className="creatorTestNotice">This preview uses the authored givens and hides all solution values. Return to Edit to continue authoring.</div>}
        </section>
        <aside className="creatorInspector card">
          <div className="creatorTabs">{(["setup", "clues", "constraints", "details"] as EditorTab[]).map((nextTab) => <button key={nextTab} className={tab === nextTab ? "btn primary" : "btn"} onClick={() => setTab(nextTab)} type="button">{nextTab}</button>)}</div>
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
              <label>Paste givens<textarea className="url creatorGridInput" defaultValue={formatGrid(data.def, "givens")} onBlur={(event) => pasteGrid(event.target.value, "givens")} /></label>
              <label>Paste solution<textarea className="url creatorGridInput" defaultValue={formatGrid(data.def, "solution")} onBlur={(event) => pasteGrid(event.target.value, "solution")} /></label>
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
      </main>
    </div>
  );
}