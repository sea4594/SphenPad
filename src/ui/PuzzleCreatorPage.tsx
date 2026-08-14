import { startTransition, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deletePuzzle, listPuzzles, upsertPuzzle } from "../core/storage";
import type { PuzzleDefinition } from "../core/model";
import { makeInitialProgress } from "../core/scl";
import { GridCanvas } from "./GridCanvas";
import { IconSettings } from "./icons";
import { PopupMenuButton } from "./PopupMenuButton";
import { SettingsOverlay } from "./SettingsOverlay";
import { onStorageRefreshNeeded } from "../core/syncSignal";

type StoredPuzzle = Awaited<ReturnType<typeof listPuzzles>>[number];
const NOOP = () => {};

function defaultSubgrid(size: number) {
  for (let shortSide = Math.floor(Math.sqrt(size)); shortSide >= 1; shortSide--) {
    if (size % shortSide === 0) return { r: shortSide, c: size / shortSide };
  }
  return { r: 1, c: size };
}

function createPuzzleKey() {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `creator-${id}`;
}

export function PuzzleCreatorPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<StoredPuzzle[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dimensionsOpen, setDimensionsOpen] = useState(false);
  const [height, setHeight] = useState(9);
  const [width, setWidth] = useState(9);
  const [custom, setCustom] = useState(false);
  const [lowestDigit, setLowestDigit] = useState(1);
  const [highestDigit, setHighestDigit] = useState(9);

  const refresh = async () => setRows((await listPuzzles()).filter((row) => row.def.meta.creatorPuzzle));
  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const unsubscribe = onStorageRefreshNeeded(() => void refresh());
    return () => {
      window.clearTimeout(initialRefresh);
      unsubscribe();
    };
  }, []);

  async function createPuzzle() {
    const now = Date.now();
    const key = createPuzzleKey();
    const def: PuzzleDefinition = {
      id: key,
      sourceId: key,
      size: Math.max(height, custom ? width : height),
      rows: height,
      cols: custom ? width : height,
      meta: {
        creatorPuzzle: true,
        creatorElements: custom ? ["given-digits"] : ["given-digits", "regions"],
        creatorDigitRange: custom ? { min: Math.min(lowestDigit, highestDigit), max: Math.max(lowestDigit, highestDigit) } : undefined,
        title: "Untitled puzzle",
        author: "",
        rules: "",
        constraints: [],
      },
      givens: [],
      cosmetics: custom ? {} : { subgrid: defaultSubgrid(height) },
    };
    await upsertPuzzle(key, { def, progress: makeInitialProgress(def), undo: [], redo: [], createdAt: now, updatedAt: now });
    startTransition(() => nav(`/creator/${encodeURIComponent(key)}`));
  }

  async function removePuzzle(row: StoredPuzzle) {
    if (!window.confirm(`Delete puzzle?\n\n${row.def.meta.title || "Untitled puzzle"}`)) return;
    await deletePuzzle(row.key);
    await refresh();
  }

  return (
    <div className="shell">
      <div className="topbar creatorTopbar">
        <button className="btn" onClick={() => startTransition(() => nav("/"))} type="button">&larr; Menu</button>
        <button className="btn topbarSettingsButton" onClick={() => setSettingsOpen(true)} title="Settings" type="button"><IconSettings /></button>
      </div>
      <div className="page">
        <div className="mainMenuWrap">
          <button className="btn primary creatorEntryButton" onClick={() => setDimensionsOpen(true)} type="button">New puzzle</button>
          <div className="card">
            <div className="menuSectionTitle">Your created puzzles</div>
            <div className="menuPuzzleList">
              {rows.map((row) => (
                <div key={row.key} className="card menuPuzzleRow" onClick={() => nav(`/creator/${encodeURIComponent(row.key)}`)}>
                  <div className="menuPuzzleSummary">
                    <div className="menuPuzzleTitle">{row.def.meta.title || "(untitled)"}</div>
                    {row.def.meta.author ? <div className="muted menuPuzzleAuthor">{row.def.meta.author}</div> : null}
                    <div className="muted">{row.def.rows} x {row.def.cols}</div>
                  </div>
                  <div className="menuPuzzleDeleteStack">
                    <div className="menuPuzzlePreview" aria-hidden="true">
                      <GridCanvas def={row.def} progress={{ ...row.progress, selection: [] }} onSelection={NOOP} onLineStroke={NOOP} onLineTapCell={NOOP} onLineTapEdge={NOOP} onDoubleCell={NOOP} interactive={false} previewMode strictScale />
                    </div>
                    <div className="row menuPuzzleActions" onClick={(event) => event.stopPropagation()}>
                      <PopupMenuButton ariaLabel={`Options for ${row.def.meta.title || "puzzle"}`} title="Puzzle options" items={[{ label: "Delete", onSelect: () => void removePuzzle(row), tone: "danger" }]} />
                    </div>
                  </div>
                </div>
              ))}
              {!rows.length ? <div className="muted">No created puzzles yet.</div> : null}
            </div>
          </div>
        </div>
      </div>
      {dimensionsOpen ? <div className="overlayBackdrop" role="dialog" aria-modal="true" aria-label="Puzzle dimensions"><div className="card creatorDimensionsCard"><div className="creatorDimensionsPreview"><GridCanvas def={{ id: "preview", sourceId: "preview", size: Math.max(height, custom ? width : height), rows: height, cols: custom ? width : height, meta: {}, givens: [], cosmetics: custom ? {} : { subgrid: defaultSubgrid(height) } }} progress={makeInitialProgress({ id: "preview", sourceId: "preview", size: Math.max(height, custom ? width : height), rows: height, cols: custom ? width : height, meta: {}, givens: [], cosmetics: custom ? {} : { subgrid: defaultSubgrid(height) } })} onSelection={NOOP} onLineStroke={NOOP} onLineTapCell={NOOP} onLineTapEdge={NOOP} onDoubleCell={NOOP} interactive={false} /></div><div className="creatorDimensionFields"><label>Size <output>{height}</output><input type="range" min="1" max="30" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>{custom ? <><label>Width <output>{width}</output><input type="range" min="1" max="30" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Lowest digit <output>{lowestDigit}</output><input type="range" min="1" max="64" value={lowestDigit} onChange={(event) => setLowestDigit(Number(event.target.value))} /></label><label>Highest digit <output>{highestDigit}</output><input type="range" min="1" max="64" value={highestDigit} onChange={(event) => setHighestDigit(Number(event.target.value))} /></label></> : null}<label className="creatorToggle"><input type="checkbox" checked={custom} onChange={(event) => { setCustom(event.target.checked); if (!event.target.checked) setWidth(height); }} />Custom</label></div><button className="btn primary creatorDimensionConfirm" onClick={() => void createPuzzle()} type="button">OK</button><button className="btn" onClick={() => setDimensionsOpen(false)} type="button">Cancel</button></div></div> : null}
      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}