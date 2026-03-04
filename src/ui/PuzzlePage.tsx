import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPuzzle, upsertPuzzle } from "../core/storage";
import type { PersistedPuzzle, CellRC, LineStroke } from "../core/model";
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

  useEffect(() => {
    (async () => {
      const local = await getPuzzle(key);
      // If logged in, prefer cloud (simple strategy).
      if (userId) {
        const cloud = await pullPuzzle(userId, key);
        if (cloud) {
          setData(cloud);
          await upsertPuzzle(key, cloud);
          return;
        }
      }
      if (!local) {
        alert("Puzzle not found.");
        nav("/");
        return;
      }
      setData(local);
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
    let next = data.progress as any;
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

  function addLineSegment(a: CellRC, b: CellRC) {
    if (!data) return;
    const stroke: LineStroke = {
      kind: data.progress.linePaletteKind,
      color: data.progress.linePaletteColor,
      segments: [{ a, b }],
    };
    pushPatch(patchAt(data.progress, ["lines"], [...data.progress.lines, stroke]));
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

      <div className="page">
        <div className="gridLayout">
          <GridCanvas
            def={data.def}
            progress={data.progress}
            onSelection={setSelection}
            onLineSegment={addLineSegment}
          />

          <div className="kbdPanel">
            <Keyboard
              kind="numbers"
              progress={data.progress}
              onDigit={applyDigit}
              onBackspace={() => applyDigit("0")}
              onToggleAlphabet={() => pushPatch(patchAt(data.progress, ["alphabetMode"], !data.progress.alphabetMode))}
              onMode={(m) => pushPatch(patchAt(data.progress, ["entryMode"], m))}
            />

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

            <Keyboard
              kind="line"
              progress={data.progress}
              onColor={(c) => pushPatch(patchAt(data.progress, ["linePaletteColor"], c))}
              onLineKind={(k) => pushPatch(patchAt(data.progress, ["linePaletteKind"], k))}
            />

            <div className="card">
              <div className="row">
                <button
                  className="btn"
                  onClick={() => pushPatch(patchAt(data.progress, ["multiSelect"], !data.progress.multiSelect))}
                >
                  Selection: {data.progress.multiSelect ? "multi" : "single"}
                </button>
                <div className="muted" style={{ fontSize: 13 }}>
                  Drag to select. Ctrl-like additive behavior is mapped to “multi”.
                </div>
              </div>
            </div>
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