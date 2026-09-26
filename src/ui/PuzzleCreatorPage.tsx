import { startTransition, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCreatorProject, createCreatorProjectKey, deleteCreatorProject, duplicateCreatorProject, listCreatorProjects, renameCreatorProject, type CreatorProjectStorageRow } from "../core/storage";
import type { PuzzleDefinition } from "../core/model";
import { createAuthoredPuzzleDefinition } from "../sudokupad/creator/nativeAuthoring";
import { creatorProjectFromDefinition, definitionFromCreatorProject } from "../sudokupad/creator/project";
import { makeInitialProgress } from "../core/scl";
import { GridCanvas } from "./GridCanvas";
import { IconSettings } from "./icons";
import { PopupMenuButton } from "./PopupMenuButton";
import { SettingsOverlay } from "./SettingsOverlay";
import { onStorageRefreshNeeded } from "../core/syncSignal";

type StoredPuzzle = CreatorProjectStorageRow;
const NOOP = () => {};

function defaultSubgrid(size: number) {
  for (let shortSide = Math.floor(Math.sqrt(size)); shortSide >= 1; shortSide--) {
    if (size % shortSide === 0) return { r: shortSide, c: size / shortSide };
  }
  return { r: 1, c: size };
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

  const refresh = async () => setRows(await listCreatorProjects());
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
    const key = createCreatorProjectKey();
    const def = createAuthoredPuzzleDefinition({
      id: key,
      rows: height,
      cols: custom ? width : height,
      subgrid: custom ? undefined : defaultSubgrid(height),
      meta: {
        creatorPuzzle: true,
        creatorElements: custom ? ["given-digits"] : ["given-digits", "regions"],
        creatorDigitRange: custom ? { min: Math.min(lowestDigit, highestDigit), max: Math.max(lowestDigit, highestDigit) } : undefined,
        title: "Untitled puzzle",
        author: "",
        rules: "",
        constraints: [],
      },
    });
    await createCreatorProject(creatorProjectFromDefinition(def), now);
    startTransition(() => nav(`/creator/${encodeURIComponent(key)}`));
  }

  function previewDefinition(): PuzzleDefinition {
    return createAuthoredPuzzleDefinition({
      id: "preview",
      rows: height,
      cols: custom ? width : height,
      subgrid: custom ? undefined : defaultSubgrid(height),
      meta: {},
    });
  }

  async function removePuzzle(row: StoredPuzzle) {
    if (!window.confirm(`Delete creator project?\n\n${row.project.metadata.title || "Untitled puzzle"}`)) return;
    await deleteCreatorProject(row.key);
    await refresh();
  }

  async function duplicatePuzzle(row: StoredPuzzle) {
    const duplicate = await duplicateCreatorProject(row.key);
    await refresh();
    startTransition(() => nav(`/creator/${encodeURIComponent(duplicate.key)}`));
  }

  async function renamePuzzle(row: StoredPuzzle) {
    const next = window.prompt("Puzzle title", row.project.metadata.title || "Untitled puzzle")?.trim();
    if (!next || next === row.project.metadata.title) return;
    await renameCreatorProject(row.key, next);
    await refresh();
  }

  function openPuzzle(row: StoredPuzzle) {
    startTransition(() => nav(`/creator/${encodeURIComponent(row.key)}`));
  }

  function projectDefinition(row: StoredPuzzle) { return definitionFromCreatorProject(row.project); }

  const recentRows = rows.filter((row) => row.lastOpenedAt > 0).slice(0, 5);

  const projectRow = (row: StoredPuzzle) => {
    const def = projectDefinition(row);
    return <div key={row.key} className="card menuPuzzleRow" onClick={() => openPuzzle(row)}>
      <div className="menuPuzzleSummary"><div className="menuPuzzleTitle">{row.project.metadata.title || "(untitled)"}</div>{row.project.metadata.author ? <div className="muted menuPuzzleAuthor">{row.project.metadata.author}</div> : null}<div className="muted">{row.project.grid.rows} x {row.project.grid.cols}</div></div>
      <div className="menuPuzzleDeleteStack"><div className="menuPuzzlePreview" aria-hidden="true"><GridCanvas def={def} progress={{ ...makeInitialProgress(def), selection: [] }} onSelection={NOOP} onLineStroke={NOOP} onLineTapCell={NOOP} onLineTapEdge={NOOP} onDoubleCell={NOOP} interactive={false} previewMode strictScale /></div><div className="row menuPuzzleActions" onClick={(event) => event.stopPropagation()}><PopupMenuButton ariaLabel={`Options for ${row.project.metadata.title || "puzzle"}`} title="Puzzle options" items={[{ label: "Open", onSelect: () => openPuzzle(row) }, { label: "Duplicate", onSelect: () => void duplicatePuzzle(row) }, { label: "Rename", onSelect: () => void renamePuzzle(row) }, { label: "Delete", onSelect: () => void removePuzzle(row), tone: "danger" }]} /></div></div>
    </div>;
  };

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
            {recentRows.length ? <><div className="menuSectionTitle">Recent projects</div><div className="menuPuzzleList">{recentRows.map(projectRow)}</div></> : null}
            <div className="menuSectionTitle">All creator projects</div>
            <div className="menuPuzzleList">{rows.map(projectRow)}{!rows.length ? <div className="muted">No created puzzles yet.</div> : null}</div>
          </div>
        </div>
      </div>
      {dimensionsOpen ? <div className="overlayBackdrop" role="dialog" aria-modal="true" aria-label="Puzzle dimensions"><div className="card creatorDimensionsCard"><div className="creatorDimensionsPreview"><GridCanvas def={previewDefinition()} progress={makeInitialProgress(previewDefinition())} onSelection={NOOP} onLineStroke={NOOP} onLineTapCell={NOOP} onLineTapEdge={NOOP} onDoubleCell={NOOP} interactive={false} previewMode strictScale /></div><div className="creatorDimensionFields"><label>Size <output>{height}</output><input type="range" min="1" max="30" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>{custom ? <><label>Width <output>{width}</output><input type="range" min="1" max="30" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Lowest digit <output>{lowestDigit}</output><input type="range" min="1" max="64" value={lowestDigit} onChange={(event) => setLowestDigit(Number(event.target.value))} /></label><label>Highest digit <output>{highestDigit}</output><input type="range" min="1" max="64" value={highestDigit} onChange={(event) => setHighestDigit(Number(event.target.value))} /></label></> : null}<label className="creatorToggle"><input type="checkbox" checked={custom} onChange={(event) => { setCustom(event.target.checked); if (!event.target.checked) setWidth(height); }} />Custom</label></div><button className="btn primary creatorDimensionConfirm" onClick={() => void createPuzzle()} type="button">OK</button><button className="btn" onClick={() => setDimensionsOpen(false)} type="button">Cancel</button></div></div> : null}
      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}