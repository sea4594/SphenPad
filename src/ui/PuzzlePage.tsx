import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPuzzle, upsertPuzzle } from "../core/storage";
import type { PersistedPuzzle, CellRC, LineStroke, PuzzleProgress } from "../core/model";
import { fmtHMS } from "../core/time";
import type { Patch } from "../core/undo";
import { applyPatch, invertPatch, patchAt } from "../core/undo";
import { PauseOverlay } from "./PauseOverlay";
import { Keyboard } from "./Keyboard";
import { GridCanvas } from "./GridCanvas";
import { IconPause, IconPlay, IconRedo, IconUndo } from "./icons";
import { auth, firebaseEnabled, pullPuzzle, pushPuzzle } from "../firebase/client";

export function PuzzlePage() {
  const { puzzleId } = useParams();
  const key = decodeURIComponent(puzzleId ?? "");
  const nav = useNavigate();

  const [data, setData] = useState<PersistedPuzzle | null>(null);
  const tickRef = useRef<number | null>(null);

  const userId = firebaseEnabled ? auth?.currentUser?.uid : null;

  function normalizeProgress(progress: PuzzleProgress): PuzzleProgress {
    if (progress.activeTool) return progress;
    return {
      ...progress,
      activeTool: progress.entryMode === "center" ? "center" : progress.entryMode === "corner" ? "corner" : "value",
    };
  }

  useEffect(() => {
    (async () => {
      const local = await getPuzzle(key);
      // If logged in, prefer cloud (simple strategy).
      if (userId) {
        const cloud = await pullPuzzle(userId, key);
        if (cloud) {
          const normalized = { ...cloud, progress: normalizeProgress(cloud.progress) };
          setData(normalized);
          await upsertPuzzle(key, normalized);
          return;
        }
      }
      if (!local) {
        alert("Puzzle not found.");
        nav("/");
        return;
      }
      const normalized = { ...local, progress: normalizeProgress(local.progress) };
      setData(normalized);
    })();
  }, [key, nav, userId]);

  async function persist(next: PersistedPuzzle) {
    setData(next);
    await upsertPuzzle(key, next);
    if (userId) await pushPuzzle(userId, key, next);
  }

  // timer
  useEffect(() => {
    if (!data) return;
    if (tickRef.current) window.clearInterval(tickRef.current);

    tickRef.current = window.setInterval(() => {
      setData((prev) => {
        if (!prev) return prev;
        if (prev.progress.paused) return prev;
        const next = structuredClone(prev);
        next.progress.totalMillis += 250;
        next.updatedAt = Date.now();
        return next;
      });
    }, 250);

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [data]);

  const meta = data?.def.meta;
  const timeStr = useMemo(() => fmtHMS(data?.progress.totalMillis ?? 0), [data?.progress.totalMillis]);

  function pushPatch(p: Patch) {
    if (!data) return;
    const nextProgress = applyPatch(data.progress, p);
    const next: PersistedPuzzle = {
      ...data,
      progress: nextProgress,
      undo: [...data.undo, p],
      redo: [],
      updatedAt: Date.now(),
    };
    persist(next);
  }

  function undo() {
    if (!data || data.undo.length === 0) return;
    const p = data.undo[data.undo.length - 1] as Patch;
    const inv = invertPatch(p);
    const nextProgress = applyPatch(data.progress, inv);
    persist({
      ...data,
      progress: nextProgress,
      undo: data.undo.slice(0, -1),
      redo: [...data.redo, p],
      updatedAt: Date.now(),
    });
  }

  function redo() {
    if (!data || data.redo.length === 0) return;
    const p = data.redo[data.redo.length - 1] as Patch;
    const nextProgress = applyPatch(data.progress, p);
    persist({
      ...data,
      progress: nextProgress,
      undo: [...data.undo, p],
      redo: data.redo.slice(0, -1),
      updatedAt: Date.now(),
    });
  }

  function setSelection(sel: CellRC[]) {
    if (!data) return;
    const p = patchAt(data.progress, ["selection"], sel);
    pushPatch(p);
  }

  function togglePause(force?: boolean) {
    if (!data) return;
    const nextPaused = force ?? !data.progress.paused;
    const p = patchAt(data.progress, ["paused"], nextPaused);
    pushPatch(p);
  }

  function startOrResume() {
    if (!data) return;
    const patches: Patch[] = [];
    if (!data.progress.startedAt) patches.push(patchAt(data.progress, ["startedAt"], Date.now()));
    if (data.progress.status === "not_started") patches.push(patchAt(data.progress, ["status"], "in_progress"));
    patches.push(patchAt(data.progress, ["paused"], false));

    // apply as a bundle
    let next: PuzzleProgress = data.progress;
    for (const p of patches) next = applyPatch(next, p);

    persist({
      ...data,
      progress: next,
      undo: [...data.undo, ...patches],
      redo: [],
      updatedAt: Date.now(),
    });
  }

  function applyDigit(sym: string) {
    if (!data) return;
    const sel = data.progress.selection;
    const { entryMode } = data.progress;

    for (const rc of sel) {
      const cell = data.progress.cells[rc.r][rc.c];
      if (cell.given) continue;

      if (entryMode === "value") {
        pushPatch(patchAt(data.progress, ["cells", rc.r, rc.c, "value"], sym === "0" ? undefined : sym));
      } else {
        // notes
        const key = entryMode === "corner" ? "corner" : entryMode === "center" ? "center" : "candidates";
        const nextSet = new Set(cell.notes[key]);
        if (sym === "0") nextSet.clear();
        else if (nextSet.has(sym)) nextSet.delete(sym);
        else nextSet.add(sym);
        pushPatch(patchAt(data.progress, ["cells", rc.r, rc.c, "notes", key], nextSet));
      }
    }
  }

  function applyHighlight(color: string) {
    if (!data) return;
    for (const rc of data.progress.selection) {
      const cell = data.progress.cells[rc.r][rc.c];
      if (cell.given) continue;
      pushPatch(patchAt(data.progress, ["cells", rc.r, rc.c, "color"], color));
    }
  }

  function clearHighlight() {
    if (!data) return;
    for (const rc of data.progress.selection) {
      pushPatch(patchAt(data.progress, ["cells", rc.r, rc.c, "color"], undefined));
    }
  }

  function addLineStroke(path: CellRC[]) {
    if (!data) return;
    if (path.length < 2) return;
    const segments: Array<{ a: CellRC; b: CellRC }> = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const dr = Math.abs(a.r - b.r);
      const dc = Math.abs(a.c - b.c);
      if (dr > 1 || dc > 1 || (dr + dc === 0)) continue;
      segments.push({ a, b });
    }
    if (!segments.length) return;

    const stroke: LineStroke = {
      kind: data.progress.linePaletteKind,
      color: data.progress.linePaletteColor,
      segments,
    };
    pushPatch(patchAt(data.progress, ["lines"], [...data.progress.lines, stroke]));
  }

  function setActiveTool(tool: PuzzleProgress["activeTool"]) {
    if (!data) return;
    const patches: Patch[] = [patchAt(data.progress, ["activeTool"], tool)];
    if (tool === "value") patches.push(patchAt(data.progress, ["entryMode"], "value"));
    if (tool === "center") patches.push(patchAt(data.progress, ["entryMode"], "center"));
    if (tool === "corner") patches.push(patchAt(data.progress, ["entryMode"], "corner"));

    let nextProgress: PuzzleProgress = data.progress;
    for (const p of patches) nextProgress = applyPatch(nextProgress, p);
    persist({
      ...data,
      progress: nextProgress,
      undo: [...data.undo, ...patches],
      redo: [],
      updatedAt: Date.now(),
    });
  }

  if (!data) {
    return (
      <div className="shell">
        <div className="topbar"><div className="brand">SphenPad</div></div>
        <div className="page"><div className="muted">Loading…</div></div>
      </div>
    );
  }

  const showPauseOverlay = data.progress.paused;

  return (
    <div className="shell">
      <div className="topbar">
        <div className="row">
          <button className="btn" onClick={() => nav("/")}>← Menu</button>
          <div>
            <div style={{ fontWeight: 700 }}>{meta?.title || "(untitled)"}</div>
            <div className="muted" style={{ fontSize: 13 }}>{meta?.author || ""}</div>
          </div>
        </div>

        <div className="row">
          <div style={{ fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>

          <button className="btn" onClick={() => togglePause()}>
            {data.progress.paused ? <IconPlay /> : <IconPause />}
          </button>

          <button className="btn" onClick={undo} title="Undo"><IconUndo /></button>
          <button className="btn" onClick={redo} title="Redo"><IconRedo /></button>
        </div>
      </div>

      <div className="page puzzlePage">
        <div className="gridLayout">
          <GridCanvas
            def={data.def}
            progress={data.progress}
            onSelection={setSelection}
            onLineStroke={addLineStroke}
          />

          <div className="kbdPanel">
            <div className="card toolSwitcher">
              <button className={"btn" + (data.progress.activeTool === "value" ? " primary" : "")} onClick={() => setActiveTool("value")}>Big</button>
              <button className={"btn" + (data.progress.activeTool === "center" ? " primary" : "")} onClick={() => setActiveTool("center")}>Center</button>
              <button className={"btn" + (data.progress.activeTool === "corner" ? " primary" : "")} onClick={() => setActiveTool("corner")}>Edge</button>
              <button className={"btn" + (data.progress.activeTool === "highlight" ? " primary" : "")} onClick={() => setActiveTool("highlight")}>Highlight</button>
              <button className={"btn" + (data.progress.activeTool === "line" ? " primary" : "")} onClick={() => setActiveTool("line")}>Line</button>
            </div>

            {data.progress.activeTool === "value" ? (
              <Keyboard
                kind="numbers"
                title="Big Numbers"
                hideEntryModeButtons
                progress={data.progress}
                onDigit={applyDigit}
                onBackspace={() => applyDigit("0")}
                onToggleAlphabet={() => pushPatch(patchAt(data.progress, ["alphabetMode"], !data.progress.alphabetMode))}
              />
            ) : null}

            {data.progress.activeTool === "center" ? (
              <Keyboard
                kind="numbers"
                title="Small Centered"
                hideEntryModeButtons
                progress={data.progress}
                onDigit={applyDigit}
                onBackspace={() => applyDigit("0")}
                onToggleAlphabet={() => pushPatch(patchAt(data.progress, ["alphabetMode"], !data.progress.alphabetMode))}
              />
            ) : null}

            {data.progress.activeTool === "corner" ? (
              <Keyboard
                kind="numbers"
                title="Small Edge Notes"
                hideEntryModeButtons
                progress={data.progress}
                onDigit={applyDigit}
                onBackspace={() => applyDigit("0")}
                onToggleAlphabet={() => pushPatch(patchAt(data.progress, ["alphabetMode"], !data.progress.alphabetMode))}
              />
            ) : null}

            {data.progress.activeTool === "highlight" ? (
              <Keyboard
                kind="highlight"
                progress={data.progress}
                onColor={applyHighlight}
                onWhite={() => applyHighlight("#ffffff")}
                onBackspace={clearHighlight}
                onFlipPalette={() => {
                  const next = ((data.progress.highlightPalettePage + 1) % 3) as 0 | 1 | 2;
                  pushPatch(patchAt(data.progress, ["highlightPalettePage"], next));
                }}
              />
            ) : null}

            {data.progress.activeTool === "line" ? (
              <Keyboard
                kind="line"
                progress={data.progress}
                onColor={(c) => pushPatch(patchAt(data.progress, ["linePaletteColor"], c))}
                onLineKind={(k) => pushPatch(patchAt(data.progress, ["linePaletteKind"], k))}
              />
            ) : null}
          </div>
        </div>
      </div>

      {showPauseOverlay && (
        <PauseOverlay
          meta={meta}
          started={Boolean(data.progress.startedAt)}
          onStart={startOrResume}
          onResume={startOrResume}
          onStayPaused={() => togglePause(true)}
        />
      )}
    </div>
  );
}