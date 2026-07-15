import { useEffect, useRef, useState } from "react";
import type { PersistedPuzzle, PuzzleDefinition } from "../core/model";
import { makeInitialProgress } from "../core/scl";

type Props = {
  data: PersistedPuzzle;
  onClose: () => void;
  onSave: (next: PersistedPuzzle) => void;
};

function hasCellContent(cell: PersistedPuzzle["progress"]["cells"][number][number]) {
  return Boolean(cell.value || cell.given || cell.notes.center.size || cell.notes.corner.size || cell.notes.candidates.size || cell.highlights?.length);
}

function resizePuzzle(data: PersistedPuzzle, rows: number, cols: number): PersistedPuzzle {
  const def: PuzzleDefinition = {
    ...data.def,
    rows,
    cols,
    size: Math.max(rows, cols),
    givens: [],
  };
  const fresh = makeInitialProgress(def);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const oldCell = data.progress.cells[row]?.[col];
      if (oldCell) fresh.cells[row][col] = oldCell;
    }
  }
  def.givens = fresh.cells.flatMap((row, rowIndex) => row.flatMap((cell, colIndex) =>
    cell.value ? [{ rc: { r: rowIndex, c: colIndex }, v: cell.value }] : [],
  ));
  return { ...data, def, progress: { ...fresh, selection: [{ r: 0, c: 0 }] }, undo: [], redo: [], updatedAt: Date.now() };
}

export function PuzzleMetadataOverlay({ data, onClose, onSave }: Props) {
  const { meta } = data.def;
  const [title, setTitle] = useState(meta.title ?? "");
  const [author, setAuthor] = useState(meta.author ?? "");
  const [collection, setCollection] = useState(meta.collection ?? "");
  const [constraints, setConstraints] = useState((meta.constraints ?? meta.archiveConstraints ?? []).join("\n"));
  const [rules, setRules] = useState(meta.rules ?? "");
  const [solution, setSolution] = useState(data.def.cosmetics.solution ?? "");
  const [postSolveMessage, setPostSolveMessage] = useState(meta.postSolveMessage ?? "");
  const [rows, setRows] = useState(String(data.def.rows));
  const [cols, setCols] = useState(String(data.def.cols));
  const rulesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = rulesRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [rules]);

  function save() {
    const nextRows = Math.max(1, Math.floor(Number(rows)) || data.def.rows);
    const nextCols = Math.max(1, Math.floor(Number(cols)) || data.def.cols);
    const shrinking = nextRows < data.def.rows || nextCols < data.def.cols;
    const losingContent = data.progress.cells.some((row, rowIndex) => row.some((cell, colIndex) =>
      (rowIndex >= nextRows || colIndex >= nextCols) && hasCellContent(cell),
    ));
    if (shrinking && losingContent && !window.confirm("Reducing the grid will delete content in removed rows or columns. Continue?")) return;

    const resized = nextRows === data.def.rows && nextCols === data.def.cols
      ? data
      : resizePuzzle(data, nextRows, nextCols);
    const constraintList = constraints.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    onSave({
      ...resized,
      def: {
        ...resized.def,
        meta: { ...resized.def.meta, title: title.trim(), author: author.trim(), collection: collection.trim(), constraints: constraintList, rules, postSolveMessage },
        cosmetics: { ...resized.def.cosmetics, solution: solution.trim() || undefined },
      },
      updatedAt: Date.now(),
    });
    onClose();
  }

  return (
    <div className="overlayBackdrop" onClick={onClose}>
      <div className="card puzzleMetadataCard" role="dialog" aria-modal="true" aria-label="Puzzle metadata" onClick={(event) => event.stopPropagation()}>
        <div className="settingsHeader">
          <div style={{ fontWeight: 700, fontSize: 21 }}>Puzzle metadata</div>
          <button className="btn" onClick={onClose} type="button">Close</button>
        </div>
        <div className="puzzleMetadataFields">
          <label>Title<input className="url" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Author<input className="url" value={author} onChange={(event) => setAuthor(event.target.value)} /></label>
          <label>Collection<input className="url" value={collection} onChange={(event) => setCollection(event.target.value)} /></label>
          <div className="puzzleDimensionFields">
            <label>Rows<input className="url" inputMode="numeric" value={rows} onChange={(event) => setRows(event.target.value)} /></label>
            <label>Columns<input className="url" inputMode="numeric" value={cols} onChange={(event) => setCols(event.target.value)} /></label>
          </div>
          <label>Constraints<textarea ref={rulesRef} className="url puzzleMetadataTextarea" value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="One constraint per line" /></label>
          <label>Instructions<textarea ref={rulesRef} className="url puzzleMetadataTextarea" value={rules} onChange={(event) => setRules(event.target.value)} /></label>
          <label>Solution<input className="url" value={solution} onChange={(event) => setSolution(event.target.value)} /></label>
          <label>Post-solve message<textarea className="url puzzleMetadataTextarea" value={postSolveMessage} onChange={(event) => setPostSolveMessage(event.target.value)} /></label>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" onClick={save} type="button">Save</button></div>
      </div>
    </div>
  );
}