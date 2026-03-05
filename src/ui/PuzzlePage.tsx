import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPuzzle, upsertPuzzle } from "../core/storage";
import type { CellRC, PersistedPuzzle, PuzzleProgress, LineStroke } from "../core/model";
import { fmtHMS } from "../core/time";
import { makeInitialProgress } from "../core/scl";
import type { Patch } from "../core/undo";
import { applyPatch, invertPatch, patchAt } from "../core/undo";
import { PauseOverlay } from "./PauseOverlay";
import { CompletionOverlay } from "./CompletionOverlay";
import { Keyboard } from "./Keyboard";
import { GridCanvas } from "./GridCanvas";
import {
  IconPause,
  IconPlay,
  IconRedo,
  IconSelectMode,
  IconSettings,
  IconToolBig,
  IconToolCenter,
  IconToolCorner,
  IconToolHighlight,
  IconToolLine,
  IconUndo,
} from "./icons";
import { auth, firebaseEnabled, pullPuzzle, pushPuzzle } from "../firebase/client";
import { SettingsOverlay } from "./SettingsOverlay";

function rcKey(rc: CellRC) {
  return `${rc.r},${rc.c}`;
}

function segKey(a: CellRC, b: CellRC) {
  const ak = rcKey(a);
  const bk = rcKey(b);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function segKeyWithTrack(seg: { a: CellRC; b: CellRC; edgeTrack?: "top" | "bottom" | "left" | "right" }) {
  return segKey(seg.a, seg.b);
}

function isPatchLike(p: unknown): p is Patch {
  if (!p || typeof p !== "object") return false;
  return Array.isArray((p as Patch).path);
}

function toPatchEntry(entry: unknown): Patch[] {
  if (Array.isArray(entry) && entry.every(isPatchLike)) return entry as Patch[];
  if (isPatchLike(entry)) return [entry as Patch];
  return [];
}

function isSolved(progress: PuzzleProgress, solution?: string): boolean {
  const n = progress.cells.length;
  if (solution && solution.length >= n * n) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const idx = r * n + c;
        if ((progress.cells[r][c].value ?? "") !== solution[idx]) return false;
      }
    }
    return true;
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!progress.cells[r][c].value) return false;
    }
  }
  return true;
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
  const [completionOpen, setCompletionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [restartPromptOpen, setRestartPromptOpen] = useState(false);
  const [restartFromPause, setRestartFromPause] = useState(false);
  const tickRef = useRef<number | null>(null);
  const holdDelayRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const activeHoldRef = useRef<"undo" | "redo" | null>(null);
  const activeHoldKeyRef = useRef<"n" | "m" | null>(null);
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});

  const userId = firebaseEnabled ? auth?.currentUser?.uid : null;

  function normalizeProgress(progress: PuzzleProgress): PuzzleProgress {
    const cells = progress.cells.map((row) =>
      row.map((cell) => {
        const existing = Array.isArray((cell as { highlights?: string[] }).highlights)
          ? (cell as { highlights?: string[] }).highlights ?? []
          : [];
        const legacy = typeof cell.color === "string" && cell.color ? [cell.color] : [];
        const merged = Array.from(new Set([...existing, ...legacy])).slice(0, 18);
        return {
          ...cell,
          highlights: merged,
          color: undefined,
        };
      })
    );

    return {
      ...progress,
      cells,
      multiSelect: progress.multiSelect ?? false,
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

  function applyPatches(patches: Patch[], opts?: { recordHistory?: boolean }) {
    if (!data || !patches.length) return;
    const recordHistory = opts?.recordHistory ?? true;
    let nextProgress: PuzzleProgress = data.progress;
    for (const p of patches) nextProgress = applyPatch(nextProgress, p);

    // Editing after completion reopens the completion flow on re-solve, keeping timer paused until restart.
    const solvedNow = isSolved(nextProgress, data.def.cosmetics.solution);
    if (recordHistory && data.progress.status === "complete" && !solvedNow) {
      nextProgress = {
        ...nextProgress,
        status: "in_progress",
        paused: true,
      };
      setCompletionOpen(false);
    }

    const nextUndo = data.undo.map(toPatchEntry).filter((entry) => entry.length > 0);
    let nextRedo = data.redo;

    if (recordHistory) {
      nextUndo.push([...patches]);
      nextRedo = [];
    }

    persist({
      ...data,
      progress: nextProgress,
      undo: nextUndo,
      redo: nextRedo,
      updatedAt: Date.now(),
    });
  }

  function pushPatch(p: Patch, opts?: { recordHistory?: boolean }) {
    applyPatches([p], opts);
  }

  function undo() {
    if (!data || data.undo.length === 0) return;
    const entry = toPatchEntry(data.undo[data.undo.length - 1]);
    if (!entry.length) return;
    let nextProgress = data.progress;
    for (let i = entry.length - 1; i >= 0; i--) nextProgress = applyPatch(nextProgress, invertPatch(entry[i] as Patch));
    persist({
      ...data,
      progress: nextProgress,
      undo: data.undo.slice(0, -1),
      redo: [...data.redo, entry],
      updatedAt: Date.now(),
    });
  }

  function redo() {
    if (!data || data.redo.length === 0) return;
    const entry = toPatchEntry(data.redo[data.redo.length - 1]);
    if (!entry.length) return;
    let nextProgress = data.progress;
    for (const p of entry) nextProgress = applyPatch(nextProgress, p);
    persist({
      ...data,
      progress: nextProgress,
      undo: [...data.undo, entry],
      redo: data.redo.slice(0, -1),
      updatedAt: Date.now(),
    });
  }

  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  }, [data]);

  function stopHoldRepeat() {
    if (holdDelayRef.current != null) {
      window.clearTimeout(holdDelayRef.current);
      holdDelayRef.current = null;
    }
    if (holdIntervalRef.current != null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    activeHoldRef.current = null;
    activeHoldKeyRef.current = null;
  }

  function runHoldAction(kind: "undo" | "redo") {
    if (kind === "undo") undoRef.current();
    else redoRef.current();
  }

  function startHoldRepeat(kind: "undo" | "redo", key?: "n" | "m") {
    if (activeHoldRef.current === kind && activeHoldKeyRef.current === (key ?? null)) return;
    stopHoldRepeat();
    activeHoldRef.current = kind;
    activeHoldKeyRef.current = key ?? null;

    runHoldAction(kind);
    holdDelayRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => runHoldAction(kind), 70);
    }, 260);
  }

  function setSelection(sel: CellRC[]) {
    if (!data || data.progress.activeTool === "line") return;
    pushPatch(patchAt(data.progress, ["selection"], sel), { recordHistory: false });
  }

  function setSelectionMode(multiSelect: boolean) {
    if (!data || data.progress.multiSelect === multiSelect) return;
    pushPatch(patchAt(data.progress, ["multiSelect"], multiSelect), { recordHistory: false });
  }

  function toggleSelectionMode() {
    if (!data) return;
    setSelectionMode(!data.progress.multiSelect);
  }

  function restartPuzzle(resetTimer: boolean) {
    if (!data) return;
    const fresh = normalizeProgress(makeInitialProgress(data.def));
    const keptMillis = resetTimer ? 0 : data.progress.totalMillis;
    const nextProgress: PuzzleProgress = {
      ...fresh,
      totalMillis: keptMillis,
      startedAt: Date.now(),
      status: "in_progress",
      paused: false,
      multiSelect: data.progress.multiSelect,
      alphabetMode: data.progress.alphabetMode,
      activeTool: data.progress.activeTool,
      entryMode: data.progress.entryMode,
      highlightPalettePage: data.progress.highlightPalettePage,
      linePaletteColor: data.progress.linePaletteColor,
      linePaletteKind: data.progress.linePaletteKind,
    };
    persist({
      ...data,
      progress: nextProgress,
      undo: [],
      redo: [],
      updatedAt: Date.now(),
    });
    setRestartPromptOpen(false);
    setRestartFromPause(false);
    setCompletionOpen(false);
    setPauseMenuOpen(false);
  }

  function openRestartPrompt(fromPause: boolean) {
    setRestartFromPause(fromPause);
    setRestartPromptOpen(true);
    if (fromPause) setPauseMenuOpen(false);
  }

  function closeRestartPrompt() {
    setRestartPromptOpen(false);
    if (restartFromPause) setPauseMenuOpen(true);
    setRestartFromPause(false);
  }

  function onDoubleSelectCell(rc: CellRC) {
    if (!data || data.progress.activeTool === "line") return;
    const cell = data.progress.cells[rc.r][rc.c];
    if (!cell) return;

    const matches: CellRC[] = [];
    const tool = data.progress.activeTool;
    const targetValue = cell.value ?? null;
    const targetCenter = new Set(cell.notes.center);
    const targetCorner = new Set(cell.notes.corner);
    const targetHighlights = new Set(cell.highlights ?? []);

    const sameSet = (a: Set<string>, b: Set<string>) => {
      if (a.size !== b.size) return false;
      for (const v of a) if (!b.has(v)) return false;
      return true;
    };

    const hasAll = (superset: string[], subset: Set<string>) => {
      for (const v of subset) if (!superset.includes(v)) return false;
      return true;
    };

    for (let r = 0; r < data.progress.cells.length; r++) {
      for (let c = 0; c < data.progress.cells.length; c++) {
        const cur = data.progress.cells[r][c];
        let match = false;
        if (tool === "value") match = Boolean(targetValue) && cur.value === targetValue;
        if (tool === "center") match = targetCenter.size > 0 && sameSet(new Set(cur.notes.center), targetCenter);
        if (tool === "corner") match = targetCorner.size > 0 && sameSet(new Set(cur.notes.corner), targetCorner);
        if (tool === "highlight") match = targetHighlights.size > 0 && hasAll(cur.highlights ?? [], targetHighlights);
        if (match) matches.push({ r, c });
      }
    }

    if (!matches.length) return;
    if (!data.progress.multiSelect) {
      setSelection(matches);
      return;
    }

    const merged = new Set(data.progress.selection.map(rcKey));
    for (const m of matches) merged.add(rcKey(m));
    setSelection(Array.from(merged).map((k) => {
      const [r, c] = k.split(",").map(Number);
      return { r, c };
    }));
  }

  function startOrResume() {
    if (!data) return;
    const patches: Patch[] = [];
    if (!data.progress.startedAt) patches.push(patchAt(data.progress, ["startedAt"], Date.now()));
    if (data.progress.status === "not_started") patches.push(patchAt(data.progress, ["status"], "in_progress"));
    patches.push(patchAt(data.progress, ["paused"], false));
    applyPatches(patches, { recordHistory: false });
    setPauseMenuOpen(false);
  }

  function onPausePlayClick() {
    if (!data) return;
    if (data.progress.status === "complete") return;
    if (data.progress.paused) {
      pushPatch(patchAt(data.progress, ["paused"], false), { recordHistory: false });
      setPauseMenuOpen(false);
      return;
    }
    pushPatch(patchAt(data.progress, ["paused"], true), { recordHistory: false });
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

    applyPatches(patches, { recordHistory: false });
  }

  function applyDigit(sym: string, forcedMode?: PuzzleProgress["entryMode"]) {
    if (!data) return;
    const sel = data.progress.selection;
    if (!sel.length) return;
    const mode = forcedMode ?? data.progress.entryMode;
    const keyName = mode === "center" ? "center" : mode === "corner" ? "corner" : "candidates";

    const editable = sel.filter((rc) => !data.progress.cells[rc.r][rc.c].given);
    if (!editable.length) return;

    const patches: Patch[] = [];
    if (mode === "value") {
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
    const allHave = editable.every((rc) => (data.progress.cells[rc.r][rc.c].highlights ?? []).includes(color));
    const patches = editable
      .map((rc) => {
        const cur = data.progress.cells[rc.r][rc.c].highlights ?? [];
        const nextSet = new Set(cur);
        if (allHave) nextSet.delete(color);
        else if (nextSet.size < 18 || nextSet.has(color)) nextSet.add(color);
        const next = Array.from(nextSet).slice(0, 18);
        const unchanged = next.length === cur.length && next.every((v, i) => v === cur[i]);
        if (unchanged) return null;
        return patchAt(data.progress, ["cells", rc.r, rc.c, "highlights"], next);
      })
      .filter(Boolean) as Patch[];
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
        const cur = progress.cells[rc.r][rc.c].highlights ?? [];
        if (cur.length) patches.push(patchAt(progress, ["cells", rc.r, rc.c, "highlights"], []));
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

  function onLineStroke(
    segmentsInput: Array<{ a: CellRC; b: CellRC; edgeTrack?: "top" | "bottom" | "left" | "right" }>,
    resolvedKind: "center" | "edge"
  ) {
    if (!data || segmentsInput.length < 1) return;
    const segments = segmentsInput.filter((seg) => {
      const dr = Math.abs(seg.a.r - seg.b.r);
      const dc = Math.abs(seg.a.c - seg.b.c);
      if (resolvedKind === "edge" && dr + dc !== 1) return false;
      return dr <= 1 && dc <= 1 && dr + dc > 0;
    });
    if (!segments.length) return;

    const drawKeys = new Set(segments.map(segKeyWithTrack));
    const overlaps = data.progress.lines.some((s) => s.segments.some((seg) => drawKeys.has(segKeyWithTrack(seg))));

    if (overlaps) {
      const lines = data.progress.lines
        .map((stroke) => ({
          ...stroke,
          segments: stroke.segments.filter((seg) => !drawKeys.has(segKeyWithTrack(seg))),
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

  useEffect(() => {
    if (!data) return;
    const solved = isSolved(data.progress, data.def.cosmetics.solution);
    if (!solved || data.progress.status === "complete") return;
    queueMicrotask(() => {
      applyPatches([
        patchAt(data.progress, ["status"], "complete"),
        patchAt(data.progress, ["paused"], true),
      ], { recordHistory: false });
      setCompletionOpen(true);
    });
  }, [applyPatches, data]);

  useEffect(() => {
    const toolCycle: PuzzleProgress["activeTool"][] = ["value", "corner", "center", "highlight", "line"];
    const keyToTool: Record<string, PuzzleProgress["activeTool"]> = {
      z: "value",
      x: "corner",
      c: "center",
      v: "highlight",
    };

    const normalizeDigit = (k: string): string | null => {
      if (/^[1-9]$/.test(k)) return k;
      if (k === "0") return "0";
      if (k.startsWith("numpad") && /^numpad[0-9]$/.test(k)) return k.slice(-1);
      return null;
    };

    const selectionSet = () => new Set((data?.progress.selection ?? []).map(rcKey));
    const inTextInput = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || node.isContentEditable;
    };

    const moveSelection = (dr: number, dc: number, extend: boolean) => {
      if (!data) return;
      const n = data.progress.cells.length;
      const anchor = data.progress.selection[data.progress.selection.length - 1] ?? { r: 0, c: 0 };
      const next = {
        r: Math.max(0, Math.min(n - 1, anchor.r + dr)),
        c: Math.max(0, Math.min(n - 1, anchor.c + dc)),
      };
      if (extend) {
        const set = selectionSet();
        set.add(rcKey(next));
        setSelection(Array.from(set).map((k) => {
          const [r, c] = k.split(",").map(Number);
          return { r, c };
        }));
        return;
      }
      setSelection([next]);
    };

    const cycleTool = (direction: 1 | -1) => {
      if (!data) return;
      const idx = toolCycle.indexOf(data.progress.activeTool);
      const next = toolCycle[(idx + direction + toolCycle.length) % toolCycle.length];
      setActiveTool(next);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (inTextInput(e.target)) return;
      const k = e.key.toLowerCase();

      if (!e.altKey && !e.ctrlKey && !e.metaKey && (k === "n" || k === "m")) {
        e.preventDefault();
        startHoldRepeat(k === "n" ? "undo" : "redo", k as "n" | "m");
        return;
      }

      if (e.ctrlKey && !e.altKey && !e.metaKey && (k === "z" || k === "y")) {
        e.preventDefault();
        if (k === "z") undoRef.current();
        else redoRef.current();
        return;
      }

      if (e.ctrlKey && !e.altKey && !e.metaKey && k === "a") {
        if (!data) return;
        e.preventDefault();
        if (e.shiftKey) {
          setSelection([]);
          return;
        }
        const n = data.progress.cells.length;
        const all = Array.from({ length: n * n }, (_, i) => ({ r: Math.floor(i / n), c: i % n }));
        setSelection(all);
        return;
      }

      if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && k === "i") {
        if (!data) return;
        e.preventDefault();
        const n = data.progress.cells.length;
        const sel = selectionSet();
        const next: CellRC[] = [];
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            if (!sel.has(`${r},${c}`)) next.push({ r, c });
          }
        }
        setSelection(next);
        return;
      }

      if (!e.altKey && !e.ctrlKey && !e.metaKey && keyToTool[k]) {
        e.preventDefault();
        setActiveTool(keyToTool[k]);
        return;
      }

      if (!e.altKey && !e.metaKey && (k === " " || k === "pagedown")) {
        e.preventDefault();
        cycleTool(1);
        return;
      }

      if (!e.altKey && !e.metaKey && ((e.ctrlKey && k === " ") || k === "pageup")) {
        e.preventDefault();
        cycleTool(-1);
        return;
      }

      if (!e.altKey && !e.metaKey && ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
        const extend = e.ctrlKey || e.shiftKey;
        if (k === "arrowup") moveSelection(-1, 0, extend);
        if (k === "arrowdown") moveSelection(1, 0, extend);
        if (k === "arrowleft") moveSelection(0, -1, extend);
        if (k === "arrowright") moveSelection(0, 1, extend);
        return;
      }

      if (!e.altKey && !e.ctrlKey && !e.metaKey && (k === "backspace" || k === "delete")) {
        e.preventDefault();
        handleBackspace();
        return;
      }

      const digit = normalizeDigit(k);
      if (digit && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (!data) return;
        if (e.ctrlKey && e.shiftKey) {
          setActiveTool("highlight");
          return;
        }
        if (e.ctrlKey) {
          applyDigit(digit, "center");
          return;
        }
        if (e.shiftKey) {
          applyDigit(digit, "corner");
          return;
        }
        applyDigit(digit);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((k === "n" || k === "m") && activeHoldKeyRef.current === k) {
        stopHoldRepeat();
      }
    };

    const onBlur = () => stopHoldRepeat();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [applyDigit, data, setActiveTool, setSelection, startHoldRepeat]);

  useEffect(() => () => stopHoldRepeat(), []);

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
        </div>

        <div className="row">
          <div style={{ fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>
          <button className="btn" onClick={onPausePlayClick} title="Pause or resume" disabled={data.progress.status === "complete"}>
            {data.progress.status === "complete" ? <IconPause /> : data.progress.paused ? <IconPlay /> : <IconPause />}
          </button>
          <button className="btn" onClick={() => setSettingsOpen(true)} title="Settings">
            <IconSettings />
          </button>
        </div>
      </div>

      <div className="page puzzlePage">
        <div className="gridLayout">
          <div className="boardColumn">
            <div className="card boardCard">
              <GridCanvas
                def={data.def}
                progress={data.progress}
                onSelection={setSelection}
                onLineStroke={onLineStroke}
                onLineTapCell={onLineTapCell}
                onLineTapEdge={onLineTapEdge}
                onDoubleCell={onDoubleSelectCell}
              />
            </div>
          </div>

          <div className="kbdPanel">
            <div className="card puzzleMetaCard">
              <div className="puzzleTitle">{meta?.title || "(untitled)"}</div>
              <div className="puzzleAuthor">{meta?.author || "Unknown author"}</div>
              <div className="puzzleRules">{meta?.rules || "No puzzle description provided."}</div>
            </div>

            <div className="controlStack">
              <div className="card sideActions">
                <button
                  className="btn"
                  onPointerDown={() => startHoldRepeat("undo")}
                  onPointerUp={stopHoldRepeat}
                  onPointerLeave={stopHoldRepeat}
                  onPointerCancel={stopHoldRepeat}
                  title="Undo (N)"
                >
                  <IconUndo />
                </button>
                <button
                  className="btn"
                  onPointerDown={() => startHoldRepeat("redo")}
                  onPointerUp={stopHoldRepeat}
                  onPointerLeave={stopHoldRepeat}
                  onPointerCancel={stopHoldRepeat}
                  title="Redo (M)"
                >
                  <IconRedo />
                </button>
                <button className={"btn" + (data.progress.multiSelect ? " primary" : "")} onClick={toggleSelectionMode} title={data.progress.multiSelect ? "Multi-touch selection enabled" : "Single-touch selection enabled"}>
                  <IconSelectMode multi={data.progress.multiSelect} />
                </button>
              </div>

              <div className="card toolSwitcher">
                <button title="Big numbers (Z)" className={"btn toolIconBtn" + (data.progress.activeTool === "value" ? " primary" : "")} onClick={() => setActiveTool("value")}><IconToolBig /></button>
                <button title="Edge notes (X)" className={"btn toolIconBtn" + (data.progress.activeTool === "corner" ? " primary" : "")} onClick={() => setActiveTool("corner")}><IconToolCorner /></button>
                <button title="Center notes (C)" className={"btn toolIconBtn" + (data.progress.activeTool === "center" ? " primary" : "")} onClick={() => setActiveTool("center")}><IconToolCenter /></button>
                <button title="Highlight (V)" className={"btn toolIconBtn" + (data.progress.activeTool === "highlight" ? " primary" : "")} onClick={() => setActiveTool("highlight")}><IconToolHighlight /></button>
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
                  onToggleAlphabet={() => pushPatch(patchAt(data.progress, ["alphabetMode"], !data.progress.alphabetMode), { recordHistory: false })}
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
                    pushPatch(patchAt(data.progress, ["highlightPalettePage"], next), { recordHistory: false });
                  }}
                />
              ) : null}

              {data.progress.activeTool === "line" ? (
                <Keyboard
                  kind="line"
                  progress={data.progress}
                  onBackspace={handleBackspace}
                  onColor={(c) => pushPatch(patchAt(data.progress, ["linePaletteColor"], c), { recordHistory: false })}
                  onLineKind={(k) => pushPatch(patchAt(data.progress, ["linePaletteKind"], k), { recordHistory: false })}
                />
              ) : null}
            </div>
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
          onRestart={() => openRestartPrompt(true)}
        />
      )}

      {completionOpen && (
        <CompletionOverlay
          meta={meta}
          elapsed={timeStr}
          onClose={() => setCompletionOpen(false)}
        />
      )}

      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} onRestartRequest={() => openRestartPrompt(false)} /> : null}

      {restartPromptOpen ? (
        <div className="overlayBackdrop" onClick={closeRestartPrompt}>
          <div className="card settingsCard" onClick={(e) => e.stopPropagation()}>
            <div className="settingsHeader">
              <div style={{ fontWeight: 700, fontSize: 21 }}>Restart Puzzle</div>
              <button className="btn" onClick={closeRestartPrompt}>Close</button>
            </div>
            <div className="settingsSection">
              <div className="muted">Choose how to restart:</div>
              <button className="btn primary" onClick={() => restartPuzzle(true)}>Restart and reset timer</button>
              <button className="btn" onClick={() => restartPuzzle(false)}>Restart and keep time</button>
              <button className="btn" onClick={closeRestartPrompt}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
