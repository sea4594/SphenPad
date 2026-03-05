import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPuzzle, upsertPuzzle } from "../core/storage";
import type { CellRC, PersistedPuzzle, PuzzleProgress, LineStroke } from "../core/model";
import { fmtHMS } from "../core/time";
import type { Patch } from "../core/undo";
import { applyPatch, invertPatch, patchAt } from "../core/undo";
import { PauseOverlay } from "./PauseOverlay";
import { Keyboard } from "./Keyboard";
import { GridCanvas } from "./GridCanvas";
import {
  IconPause,
  IconPlay,
  IconRedo,
  IconToolBig,
  IconToolCenter,
  IconToolCorner,
  IconToolHighlight,
  IconToolLine,
  IconUndo,
} from "./icons";
import { auth, firebaseEnabled, pullPuzzle, pushPuzzle } from "../firebase/client";

function rcKey(rc: CellRC) {
  return `${rc.r},${rc.c}`;
}

function segKey(a: CellRC, b: CellRC) {
  const ak = rcKey(a);
  const bk = rcKey(b);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function sharesSelectedCell(a: CellRC, b: CellRC, selected: Set<string>) {
  return selected.has(rcKey(a)) || selected.has(rcKey(b));
}

export function PuzzlePage() {
  const { puzzleId } = useParams();
  const key = decodeURIComponent(puzzleId ?? "");
  const nav = useNavigate();

  const [data, setData] = useState<PersistedPuzzle | null>(null);
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);
  const tickRef = useRef<number | null>(null);

  const userId = firebaseEnabled ? auth?.currentUser?.uid : null;

  function normalizeProgress(progress: PuzzleProgress): PuzzleProgress {
    return {
      ...progress,
      lineCenterMarks: progress.lineCenterMarks ?? [],
      lineEdgeMarks: progress.lineEdgeMarks ?? [],
      activeTool:
        progress.activeTool ??
        (progress.entryMode === "center" ? "center" : progress.entryMode === "corner" ? "corner" : "value"),
    };
  }

  useEffect(() => {
    (async () => {
      const local = await getPuzzle(key);
      if (userId) {
        const cloud = await pullPuzzle(userId, key);
        if (cloud) {
          const normalized = { ...cloud, progress: normalizeProgress(cloud.progress) };
          setData(normalized);
          setPauseMenuOpen(Boolean(normalized.progress.paused));
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
      setPauseMenuOpen(Boolean(normalized.progress.paused));
    })();
  }, [key, nav, userId]);

  async function persist(next: PersistedPuzzle) {
    setData(next);
    await upsertPuzzle(key, next);
    if (userId) await pushPuzzle(userId, key, next);
  }

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

  function applyPatches(patches: Patch[]) {
    if (!data || !patches.length) return;
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

  function pushPatch(p: Patch) {
    applyPatches([p]);
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
    if (!data || data.progress.activeTool === "line") return;
    pushPatch(patchAt(data.progress, ["selection"], sel));
  }

  function startOrResume() {
    if (!data) return;
    const patches: Patch[] = [];
    if (!data.progress.startedAt) patches.push(patchAt(data.progress, ["startedAt"], Date.now()));
    if (data.progress.status === "not_started") patches.push(patchAt(data.progress, ["status"], "in_progress"));
    patches.push(patchAt(data.progress, ["paused"], false));
    applyPatches(patches);
    setPauseMenuOpen(false);
  }

  function onPausePlayClick() {
    if (!data) return;
    if (data.progress.paused) {
      pushPatch(patchAt(data.progress, ["paused"], false));
      setPauseMenuOpen(false);
      return;
    }
    pushPatch(patchAt(data.progress, ["paused"], true));
    setPauseMenuOpen(true);
  }

  function setActiveTool(tool: PuzzleProgress["activeTool"]) {
    if (!data || data.progress.activeTool === tool) return;
    const patches: Patch[] = [patchAt(data.progress, ["activeTool"], tool)];
    if (tool === "value") patches.push(patchAt(data.progress, ["entryMode"], "value"));
    if (tool === "center") patches.push(patchAt(data.progress, ["entryMode"], "center"));
    if (tool === "corner") patches.push(patchAt(data.progress, ["entryMode"], "corner"));

    if (tool === "line") {
      patches.push(patchAt(data.progress, ["storedSelectionWhenLineTool"], data.progress.selection));
      patches.push(patchAt(data.progress, ["selection"], []));
    } else if (data.progress.activeTool === "line") {
      const restore = data.progress.storedSelectionWhenLineTool ?? [];
      patches.push(patchAt(data.progress, ["selection"], restore));
      patches.push(patchAt(data.progress, ["storedSelectionWhenLineTool"], undefined));
    }

    applyPatches(patches);
  }

  function applyDigit(sym: string) {
    if (!data) return;
    const sel = data.progress.selection;
    if (!sel.length) return;
    const keyName = data.progress.entryMode === "center" ? "center" : data.progress.entryMode === "corner" ? "corner" : "candidates";

    const editable = sel.filter((rc) => !data.progress.cells[rc.r][rc.c].given);
    if (!editable.length) return;

    const patches: Patch[] = [];
    if (data.progress.entryMode === "value") {
      const allHave = sym !== "0" && editable.every((rc) => data.progress.cells[rc.r][rc.c].value === sym);
      const nextValue = sym === "0" || allHave ? undefined : sym;
      for (const rc of editable) {
        const cur = data.progress.cells[rc.r][rc.c].value;
        if (cur === nextValue) continue;
        patches.push(patchAt(data.progress, ["cells", rc.r, rc.c, "value"], nextValue));
      }
    } else {
      const allHave = sym !== "0" && editable.every((rc) => data.progress.cells[rc.r][rc.c].notes[keyName].has(sym));
      for (const rc of editable) {
        const curSet = data.progress.cells[rc.r][rc.c].notes[keyName];
        const nextSet = new Set(curSet);
        if (sym === "0") nextSet.clear();
        else if (allHave) nextSet.delete(sym);
        else nextSet.add(sym);
        patches.push(patchAt(data.progress, ["cells", rc.r, rc.c, "notes", keyName], nextSet));
      }
    }
    applyPatches(patches);
  }

  function applyHighlight(color: string) {
    if (!data) return;
    const editable = data.progress.selection.filter((rc) => !data.progress.cells[rc.r][rc.c].given);
    if (!editable.length) return;
    const allHave = editable.every((rc) => data.progress.cells[rc.r][rc.c].color === color);
    const next = allHave ? undefined : color;
    const patches = editable
      .filter((rc) => data.progress.cells[rc.r][rc.c].color !== next)
      .map((rc) => patchAt(data.progress, ["cells", rc.r, rc.c, "color"], next));
    applyPatches(patches);
  }

  function clearLinesForSelection(progress: PuzzleProgress, selected: CellRC[]): { lines: LineStroke[]; changed: boolean } {
    const selectedSet = new Set(selected.map(rcKey));
    let changed = false;
    const nextLines: LineStroke[] = [];
    for (const stroke of progress.lines) {
      const nextSegments = stroke.segments.filter((seg) => !sharesSelectedCell(seg.a, seg.b, selectedSet));
      if (nextSegments.length !== stroke.segments.length) changed = true;
      if (nextSegments.length) nextLines.push({ ...stroke, segments: nextSegments });
    }
    return { lines: nextLines, changed };
  }

  function clearFeatureType(tool: PuzzleProgress["activeTool"], progress: PuzzleProgress): Patch[] {
    const sel = progress.selection;
    if (!sel.length) return [];
    const selectedSet = new Set(sel.map(rcKey));
    const editable = sel.filter((rc) => !progress.cells[rc.r][rc.c].given);
    const patches: Patch[] = [];

    if (tool === "value") {
      for (const rc of editable) {
        if (progress.cells[rc.r][rc.c].value != null) patches.push(patchAt(progress, ["cells", rc.r, rc.c, "value"], undefined));
      }
      return patches;
    }

    if (tool === "center" || tool === "corner") {
      const noteKey = tool === "center" ? "center" : "corner";
      for (const rc of editable) {
        if (progress.cells[rc.r][rc.c].notes[noteKey].size) {
          patches.push(patchAt(progress, ["cells", rc.r, rc.c, "notes", noteKey], new Set<string>()));
        }
      }
      return patches;
    }

    if (tool === "highlight") {
      for (const rc of editable) {
        if (progress.cells[rc.r][rc.c].color != null) patches.push(patchAt(progress, ["cells", rc.r, rc.c, "color"], undefined));
      }
      return patches;
    }

    const lineClear = clearLinesForSelection(progress, sel);
    if (lineClear.changed) patches.push(patchAt(progress, ["lines"], lineClear.lines));

    const centerMarks = progress.lineCenterMarks.filter((m) => !selectedSet.has(rcKey(m.rc)));
    if (centerMarks.length !== progress.lineCenterMarks.length) patches.push(patchAt(progress, ["lineCenterMarks"], centerMarks));

    const edgeMarks = progress.lineEdgeMarks.filter((m) => !sharesSelectedCell(m.a, m.b, selectedSet));
    if (edgeMarks.length !== progress.lineEdgeMarks.length) patches.push(patchAt(progress, ["lineEdgeMarks"], edgeMarks));

    return patches;
  }

  function handleBackspace() {
    if (!data || !data.progress.selection.length) return;
    const order: PuzzleProgress["activeTool"][] = ["value", "center", "corner", "highlight", "line"];
    const primary = clearFeatureType(data.progress.activeTool, data.progress);
    if (primary.length) {
      applyPatches(primary);
      return;
    }

    for (const tool of order) {
      const next = clearFeatureType(tool, data.progress);
      if (next.length) {
        applyPatches(next);
        return;
      }
    }
  }

  function onLineTapCell(rc: CellRC) {
    if (!data) return;
    const idx = data.progress.lineCenterMarks.findIndex((m) => m.rc.r === rc.r && m.rc.c === rc.c);
    if (idx < 0) {
      const next = [...data.progress.lineCenterMarks, { rc, kind: "circle" as const, color: data.progress.linePaletteColor }];
      pushPatch(patchAt(data.progress, ["lineCenterMarks"], next));
      return;
    }
    const mark = data.progress.lineCenterMarks[idx];
    if (mark.kind === "circle") {
      const next = [...data.progress.lineCenterMarks];
      next[idx] = { ...mark, kind: "x" };
      pushPatch(patchAt(data.progress, ["lineCenterMarks"], next));
      return;
    }
    const next = data.progress.lineCenterMarks.filter((_, i) => i !== idx);
    pushPatch(patchAt(data.progress, ["lineCenterMarks"], next));
  }

  function onLineTapEdge(a: CellRC, b: CellRC) {
    if (!data) return;
    const key = segKey(a, b);
    const idx = data.progress.lineEdgeMarks.findIndex((m) => segKey(m.a, m.b) === key);
    if (idx >= 0) {
      const next = data.progress.lineEdgeMarks.filter((_, i) => i !== idx);
      pushPatch(patchAt(data.progress, ["lineEdgeMarks"], next));
      return;
    }
    const next = [...data.progress.lineEdgeMarks, { a, b, color: data.progress.linePaletteColor }];
    pushPatch(patchAt(data.progress, ["lineEdgeMarks"], next));
  }

  function onLineStroke(path: CellRC[], resolvedKind: "center" | "edge") {
    if (!data || path.length < 2) return;
    const segments: Array<{ a: CellRC; b: CellRC }> = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const dr = Math.abs(a.r - b.r);
      const dc = Math.abs(a.c - b.c);
      if (resolvedKind === "edge" && dr + dc !== 1) continue;
      if (dr > 1 || dc > 1 || (dr + dc === 0)) continue;
      segments.push({ a, b });
    }
    if (!segments.length) return;

    const drawKeys = new Set(segments.map((seg) => segKey(seg.a, seg.b)));
    const overlaps = data.progress.lines.some((s) => s.segments.some((seg) => drawKeys.has(segKey(seg.a, seg.b))));

    if (overlaps) {
      const lines = data.progress.lines
        .map((stroke) => ({
          ...stroke,
          segments: stroke.segments.filter((seg) => !drawKeys.has(segKey(seg.a, seg.b))),
        }))
        .filter((stroke) => stroke.segments.length > 0);
      pushPatch(patchAt(data.progress, ["lines"], lines));
      return;
    }

    const stroke: LineStroke = {
      kind: resolvedKind,
      color: data.progress.linePaletteColor,
      segments,
    };
    pushPatch(patchAt(data.progress, ["lines"], [...data.progress.lines, stroke]));
  }

  if (!data) {
    return (
      <div className="shell">
        <div className="topbar"><div className="brand">SphenPad</div></div>
        <div className="page"><div className="muted">Loading...</div></div>
      </div>
    );
  }

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
          <button className="btn" onClick={onPausePlayClick}>{data.progress.paused ? <IconPlay /> : <IconPause />}</button>
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
            onLineStroke={onLineStroke}
            onLineTapCell={onLineTapCell}
            onLineTapEdge={onLineTapEdge}
          />

          <div className="kbdPanel">
            <div className="card toolSwitcher">
              <button title="Big numbers" className={"btn toolIconBtn" + (data.progress.activeTool === "value" ? " primary" : "")} onClick={() => setActiveTool("value")}><IconToolBig /></button>
              <button title="Center notes" className={"btn toolIconBtn" + (data.progress.activeTool === "center" ? " primary" : "")} onClick={() => setActiveTool("center")}><IconToolCenter /></button>
              <button title="Edge notes" className={"btn toolIconBtn" + (data.progress.activeTool === "corner" ? " primary" : "")} onClick={() => setActiveTool("corner")}><IconToolCorner /></button>
              <button title="Highlight" className={"btn toolIconBtn" + (data.progress.activeTool === "highlight" ? " primary" : "")} onClick={() => setActiveTool("highlight")}><IconToolHighlight /></button>
              <button title="Line" className={"btn toolIconBtn" + (data.progress.activeTool === "line" ? " primary" : "")} onClick={() => setActiveTool("line")}><IconToolLine /></button>
            </div>

            {(data.progress.activeTool === "value" || data.progress.activeTool === "center" || data.progress.activeTool === "corner") ? (
              <Keyboard
                kind="numbers"
                title={data.progress.activeTool === "value" ? "Big Numbers" : data.progress.activeTool === "center" ? "Small Centered" : "Small Edge Notes"}
                hideEntryModeButtons
                progress={data.progress}
                onDigit={applyDigit}
                onBackspace={handleBackspace}
                onToggleAlphabet={() => pushPatch(patchAt(data.progress, ["alphabetMode"], !data.progress.alphabetMode))}
              />
            ) : null}

            {data.progress.activeTool === "highlight" ? (
              <Keyboard
                kind="highlight"
                progress={data.progress}
                onColor={applyHighlight}
                onWhite={() => applyHighlight("#ffffff")}
                onBackspace={handleBackspace}
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
                onBackspace={handleBackspace}
                onColor={(c) => pushPatch(patchAt(data.progress, ["linePaletteColor"], c))}
                onLineKind={(k) => pushPatch(patchAt(data.progress, ["linePaletteKind"], k))}
              />
            ) : null}
          </div>
        </div>
      </div>

      {pauseMenuOpen && (
        <PauseOverlay
          meta={meta}
          started={Boolean(data.progress.startedAt)}
          onStart={startOrResume}
          onResume={startOrResume}
          onStayPaused={() => setPauseMenuOpen(false)}
        />
      )}
    </div>
  );
}
