/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deletePuzzle, getPuzzle, upsertPuzzle } from "../core/storage";
import type { CellRC, PersistedPuzzle, PuzzleProgress, LineStroke, PuzzleDefinition } from "../core/model";
import { fmtHMS } from "../core/time";
import { makeInitialProgress } from "../core/scl";
import { loadFromSudokuPad, SUDOKUPAD_IMPORT_REVISION } from "../core/sudokupad";
import type { Patch } from "../core/undo";
import { applyPatch, invertPatch, patchAt } from "../core/undo";
import { PauseOverlay } from "./PauseOverlay";
import { CompletionOverlay } from "./CompletionOverlay";
import { Keyboard } from "./Keyboard";
import { GridCanvas } from "./GridCanvas";
import {
  IconExit,
  IconPause,
  IconPlay,
  IconCopyLink,
  IconReload,
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
import { deleteCloudPuzzle } from "../firebase/client";
import { SettingsOverlay } from "./SettingsOverlay";

function rcKey(rc: CellRC) {
  return `${rc.r},${rc.c}`;
}

function segKey(a: CellRC, b: CellRC) {
  const ak = rcKey(a);
  const bk = rcKey(b);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function lineKindNamespace(kind: "center" | "edge" | "both"): "center" | "edge" {
  return kind === "edge" ? "edge" : "center";
}

function segKeyWithKind(
  seg: { a: CellRC; b: CellRC; edgeTrack?: "top" | "bottom" | "left" | "right" },
  kind: "center" | "edge" | "both"
) {
  return `${lineKindNamespace(kind)}:${segKey(seg.a, seg.b)}`;
}

function isPatchLike(p: unknown): p is Patch {
  if (!p || typeof p !== "object") return false;
  return Array.isArray((p as Patch).path);
}

function toPatchEntry(entry: unknown): Patch[] {
  if (
    entry &&
    typeof entry === "object" &&
    Array.isArray((entry as { patches?: unknown }).patches) &&
    ((entry as { patches?: unknown }).patches as unknown[]).every(isPatchLike)
  ) {
    return (entry as { patches: Patch[] }).patches;
  }
  if (Array.isArray(entry) && entry.every(isPatchLike)) return entry as Patch[];
  if (isPatchLike(entry)) return [entry as Patch];
  return [];
}

function toHistorySelection(entry: unknown): CellRC[] | null {
  if (!entry || typeof entry !== "object") return null;
  const sel = (entry as { selection?: unknown }).selection;
  if (!Array.isArray(sel)) return null;
  const normalized = sel
    .filter((rc) => rc && typeof rc === "object" && Number.isFinite((rc as CellRC).r) && Number.isFinite((rc as CellRC).c))
    .map((rc) => ({ r: Number((rc as CellRC).r), c: Number((rc as CellRC).c) }));
  return normalized;
}

function isSolved(progress: PuzzleProgress, solution?: string): boolean {
  const rows = progress.cells.length;
  const cols = progress.cells[0]?.length ?? 0;
  if (solution && solution.length >= rows * cols) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if ((progress.cells[r][c].value ?? "") !== solution[idx]) return false;
      }
    }
    return true;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!progress.cells[r][c].value) return false;
    }
  }
  return true;
}

function sharesSelectedCell(a: CellRC, b: CellRC, selected: Set<string>) {
  return selected.has(rcKey(a)) || selected.has(rcKey(b));
}

function selectedCellEdgeKeys(selected: CellRC[]): Set<string> {
  const keys = new Set<string>();
  for (const rc of selected) {
    const topA = { r: rc.r, c: rc.c };
    const topB = { r: rc.r, c: rc.c + 1 };
    const bottomA = { r: rc.r + 1, c: rc.c };
    const bottomB = { r: rc.r + 1, c: rc.c + 1 };
    const leftA = { r: rc.r, c: rc.c };
    const leftB = { r: rc.r + 1, c: rc.c };
    const rightA = { r: rc.r, c: rc.c + 1 };
    const rightB = { r: rc.r + 1, c: rc.c + 1 };

    keys.add(segKey(topA, topB));
    keys.add(segKey(bottomA, bottomB));
    keys.add(segKey(leftA, leftB));
    keys.add(segKey(rightA, rightB));
  }
  return keys;
}

function cellsTouchedByNodeEdge(a: CellRC, b: CellRC, rows: number, cols: number): CellRC[] {
  const dr = b.r - a.r;
  const dc = b.c - a.c;
  if (Math.abs(dr) + Math.abs(dc) !== 1) return [];

  const out: CellRC[] = [];
  if (dc === 0) {
    const r = Math.min(a.r, b.r);
    const c = a.c;
    const left = { r, c: c - 1 };
    const right = { r, c };
    if (left.r >= 0 && left.r < rows && left.c >= 0 && left.c < cols) out.push(left);
    if (right.r >= 0 && right.r < rows && right.c >= 0 && right.c < cols) out.push(right);
    return out;
  }

  const r = a.r;
  const c = Math.min(a.c, b.c);
  const top = { r: r - 1, c };
  const bottom = { r, c };
  if (top.r >= 0 && top.r < rows && top.c >= 0 && top.c < cols) out.push(top);
  if (bottom.r >= 0 && bottom.r < rows && bottom.c >= 0 && bottom.c < cols) out.push(bottom);
  return out;
}

function edgeLikeTouchesSelection(
  a: CellRC,
  b: CellRC,
  selected: Set<string>,
  rows: number,
  cols: number
): boolean {
  const aIsCell = a.r >= 0 && a.r < rows && a.c >= 0 && a.c < cols;
  const bIsCell = b.r >= 0 && b.r < rows && b.c >= 0 && b.c < cols;
  if (aIsCell && bIsCell) return sharesSelectedCell(a, b, selected);

  const touchedCells = cellsTouchedByNodeEdge(a, b, rows, cols);
  return touchedCells.some((rc) => selected.has(rcKey(rc)));
}

function hasIncompleteMeta(p: PersistedPuzzle): boolean {
  const title = (p.def.meta?.title ?? "").trim();
  const author = (p.def.meta?.author ?? "").trim();
  const rules = (p.def.meta?.rules ?? "").trim();
  return !title || !author || !rules || /auto-generated because this puzzle has no rules text/i.test(rules);
}

function inBoundsFor(def: PuzzleDefinition, rc: CellRC): boolean {
  return rc.r >= 0 && rc.c >= 0 && rc.r < def.rows && rc.c < def.cols;
}

function hasMeaningfulProgress(p: PersistedPuzzle): boolean {
  const { progress, def } = p;
  for (let r = 0; r < progress.cells.length; r++) {
    for (let c = 0; c < progress.cells[r].length; c++) {
      const cell = progress.cells[r][c];
      if (!cell) continue;
      const given = def.givens.some((g) => g.rc.r === r && g.rc.c === c);
      if (!given && cell.value) return true;
      if (cell.notes.center.size || cell.notes.corner.size || cell.notes.candidates.size) return true;
      if ((cell.highlights?.length ?? 0) > 0) return true;
    }
  }
  return (
    progress.lines.length > 0 ||
    progress.lineCenterMarks.length > 0 ||
    progress.lineEdgeMarks.length > 0 ||
    p.undo.length > 0 ||
    p.redo.length > 0
  );
}

function migrateProgressToDefinition(oldData: PersistedPuzzle, nextDef: PuzzleDefinition): PuzzleProgress {
  const base = makeInitialProgress(nextDef);
  const old = oldData.progress;
  const rowCap = Math.min(old.cells.length, base.cells.length);
  const colCap = Math.min(old.cells[0]?.length ?? 0, base.cells[0]?.length ?? 0);

  for (let r = 0; r < rowCap; r++) {
    for (let c = 0; c < colCap; c++) {
      const src = old.cells[r][c];
      const dst = base.cells[r][c];
      if (!src || !dst) continue;
      if (!dst.given) dst.value = src.value;
      dst.notes.center = new Set(src.notes.center);
      dst.notes.corner = new Set(src.notes.corner);
      dst.notes.candidates = new Set(src.notes.candidates);
      dst.highlights = [...(src.highlights ?? [])];
    }
  }

  const lineInBounds = (seg: { a: CellRC; b: CellRC }) => {
    return inBoundsFor(nextDef, seg.a) && inBoundsFor(nextDef, seg.b);
  };

  const lines = old.lines
    .map((line) => ({ ...line, segments: line.segments.filter(lineInBounds) }))
    .filter((line) => line.segments.length > 0);

  return {
    ...base,
    totalMillis: old.totalMillis,
    startedAt: old.startedAt,
    status: old.status,
    paused: old.paused,
    selection: old.selection.filter((rc) => inBoundsFor(nextDef, rc)),
    multiSelect: old.multiSelect,
    entryMode: old.entryMode,
    alphabetMode: old.alphabetMode,
    highlightPalettePage: old.highlightPalettePage,
    activeHighlightColor: old.activeHighlightColor,
    linePaletteColor: old.linePaletteColor,
    linePaletteKind: old.linePaletteKind,
    activeTool: old.activeTool,
    storedSelectionWhenLineTool: old.storedSelectionWhenLineTool?.filter((rc) => inBoundsFor(nextDef, rc)),
    lines,
    lineCenterMarks: old.lineCenterMarks.filter((m) => inBoundsFor(nextDef, m.rc)),
    lineEdgeMarks: old.lineEdgeMarks.filter((m) => inBoundsFor(nextDef, m.a) && inBoundsFor(nextDef, m.b)),
  };
}

function normalizePersistedDefinition(p: PersistedPuzzle): PersistedPuzzle {
  const rowsFromProgress = p.progress.cells.length;
  const colsFromProgress = p.progress.cells[0]?.length ?? p.def.size;
  const hasGridShape = p.def.rows === rowsFromProgress && p.def.cols === colsFromProgress;
  const overlays = p.def.cosmetics.overlays ?? [];
  let changed = false;
  const normalizeLayerItem = (item: NonNullable<PuzzleDefinition["cosmetics"]["overlays"]>[number]) => {
    const text = item.text == null ? "" : String(item.text).trim();
    const width = typeof item.width === "number" ? item.width : NaN;
    const height = typeof item.height === "number" ? item.height : NaN;
    const tinyTextAnchor =
      text.length > 0 &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width <= 0.35 &&
      height <= 0.35;
    const zeroSpanTextAnchor =
      text.length > 0 &&
      ((Number.isFinite(width) && width <= 0.001) || (Number.isFinite(height) && height <= 0.001));
    const slenderTextAnchor =
      text.length > 0 &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      Math.min(width, height) <= 0.2 &&
      Math.max(width, height) >= 0.45;
    const currentSize = typeof item.textSize === "number" ? item.textSize : undefined;
    let next = item;

    if (tinyTextAnchor && (currentSize == null || currentSize < 9)) {
      changed = true;
      const minSpan = Math.min(width, height);
      const inferred = Math.max(9, Math.min(14, minSpan * 56 * 2.0));
      next = { ...next, textSize: inferred };
    }

    if (zeroSpanTextAnchor || slenderTextAnchor) {
      const hasShape = next.color != null || next.borderColor != null || next.rounded === true;
      if (hasShape) {
        changed = true;
        next = {
          ...next,
          rounded: false,
          color: undefined,
          borderColor: undefined,
          borderThickness: undefined,
        };
      }
    }

    return next;
  };

  const nextOverlays = overlays.map(normalizeLayerItem);
  const underlays = p.def.cosmetics.underlays ?? [];
  const nextUnderlays = underlays.map(normalizeLayerItem);

  if (!changed && hasGridShape) return p;
  return {
    ...p,
    def: {
      ...p.def,
      rows: rowsFromProgress,
      cols: colsFromProgress,
      cosmetics: {
        ...p.def.cosmetics,
        overlays: nextOverlays,
        underlays: nextUnderlays,
      },
    },
  };
}

const highlightPalettePages = [
  ["#d9d9d9", "#9b9b9b", "#4f4f4f", "#57d38c", "#ff8fc3", "#ffae57", "#ff5f57", "#ffe066", "#63a6ff"],
  ["#000000", "#ffa0a0", "#ffdf61", "#feffaf", "#b0ffb0", "#61d060", "#d0d0ff", "#8180f0", "#ff08ff"],
  ["#a8a8a8", "#ffd0d0", "#ffe9a7", "#fffbd6", "#d6ffd6", "#8bf2a9", "#d9f1ff", "#bdb7ff", "#ffb3ff"],
] as const;

const linePalette = ["#000000", "#ff4d4f", "#ff9f1a", "#ffd60a", "#34c759", "#00b894", "#32ade6", "#4f46e5", "#ff2d96"] as const;

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
  const [reloadingPuzzle, setReloadingPuzzle] = useState(false);
  const [mobileLandscape, setMobileLandscape] = useState(false);
  const tickRef = useRef<number | null>(null);
  const holdDelayRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const activeHoldRef = useRef<"undo" | "redo" | null>(null);
  const activeHoldKeyRef = useRef<"n" | "m" | null>(null);
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const metadataRefreshInFlightRef = useRef(new Set<string>());
  const definitionRefreshInFlightRef = useRef(new Set<string>());

  const userId = firebaseEnabled ? auth?.currentUser?.uid : null;

  useEffect(() => {
    const updateLayoutMode = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setMobileLandscape(w <= 1000 && w > h);
    };
    updateLayoutMode();
    window.addEventListener("resize", updateLayoutMode);
    window.addEventListener("orientationchange", updateLayoutMode);
    return () => {
      window.removeEventListener("resize", updateLayoutMode);
      window.removeEventListener("orientationchange", updateLayoutMode);
    };
  }, []);

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
          const normalizedCloud = normalizePersistedDefinition({ ...cloud, progress: normalizeProgress(cloud.progress) });
          const normalizedLocal = local ? normalizePersistedDefinition({ ...local, progress: normalizeProgress(local.progress) }) : null;

          const localIsNewer = Boolean(normalizedLocal && normalizedLocal.updatedAt >= normalizedCloud.updatedAt);
          const cloudMetaIncomplete = hasIncompleteMeta(normalizedCloud);
          const localMetaComplete = Boolean(normalizedLocal && !hasIncompleteMeta(normalizedLocal));

          const merged = localIsNewer && normalizedLocal
            ? normalizedLocal
            : cloudMetaIncomplete && localMetaComplete && normalizedLocal
              ? {
                  ...normalizedCloud,
                  def: {
                    ...normalizedCloud.def,
                    // Keep cloud progress but use richer local puzzle metadata/definition when available.
                    ...normalizedLocal.def,
                    meta: {
                      ...normalizedCloud.def.meta,
                      ...normalizedLocal.def.meta,
                    },
                  },
                }
              : normalizedCloud;

          setData(merged);
          setPauseMenuOpen(Boolean(merged.progress.paused));
          await upsertPuzzle(key, merged);
          await pushPuzzle(userId, key, merged);
          return;
        }
      }
      if (!local) {
        alert("Puzzle not found.");
        nav("/");
        return;
      }
      const normalized = normalizePersistedDefinition({ ...local, progress: normalizeProgress(local.progress) });
      setData(normalized);
      setPauseMenuOpen(Boolean(normalized.progress.paused));
      await upsertPuzzle(key, normalized);
    })();
  }, [key, nav, userId]);

  useEffect(() => {
    if (!data) return;
    if (!hasIncompleteMeta(data)) return;
    const source = (data.def.sourceId ?? key ?? "").trim();
    if (!source) return;

    const refreshKey = `${key}::${source}`;
    if (metadataRefreshInFlightRef.current.has(refreshKey)) return;
    metadataRefreshInFlightRef.current.add(refreshKey);

    (async () => {
      try {
        const loaded = await loadFromSudokuPad(source);
        const freshMeta = loaded.def.meta;
        const nextTitle = (freshMeta.title ?? data.def.meta.title ?? "").trim();
        const nextAuthor = (freshMeta.author ?? data.def.meta.author ?? "").trim();
        const nextRules = (freshMeta.rules ?? data.def.meta.rules ?? "").trim();
        const changed =
          nextTitle !== (data.def.meta.title ?? "").trim() ||
          nextAuthor !== (data.def.meta.author ?? "").trim() ||
          nextRules !== (data.def.meta.rules ?? "").trim() ||
          (freshMeta.solveCount ?? null) !== (data.def.meta.solveCount ?? null);
        if (!changed) return;

        const nextMeta = {
          ...data.def.meta,
          ...freshMeta,
        };
        const next: PersistedPuzzle = {
          ...data,
          def: {
            ...data.def,
            meta: nextMeta,
          },
          updatedAt: Date.now(),
        };

        setData(next);
        await upsertPuzzle(key, next);
        if (userId) await pushPuzzle(userId, key, next);
      } catch {
        // Keep existing metadata if refresh fails.
      } finally {
        metadataRefreshInFlightRef.current.delete(refreshKey);
      }
    })();
  }, [data, key, userId, pauseMenuOpen]);

  useEffect(() => {
    if (!data) return;
    const currentRevision = data.def.importRevision ?? 0;
    if (currentRevision >= SUDOKUPAD_IMPORT_REVISION) return;

    const source = (data.def.sourceId ?? key ?? "").trim();
    if (!source) return;

    const refreshKey = `${key}::${source}::defv${currentRevision}`;
    if (definitionRefreshInFlightRef.current.has(refreshKey)) return;
    definitionRefreshInFlightRef.current.add(refreshKey);

    (async () => {
      try {
        const loaded = await loadFromSudokuPad(source);
        const nextDef = loaded.def;
        const migratedProgress = migrateProgressToDefinition(data, nextDef);
        const next: PersistedPuzzle = {
          ...data,
          def: nextDef,
          progress: migratedProgress,
          // Undo/redo patches are tied to prior definition layout and become unsafe after migration.
          undo: [],
          redo: [],
          updatedAt: hasMeaningfulProgress(data) ? data.updatedAt : Date.now(),
        };
        setData(next);
        await upsertPuzzle(key, next);
        if (userId) await pushPuzzle(userId, key, next);
      } catch {
        // Keep existing cached definition if refresh fails.
      } finally {
        definitionRefreshInFlightRef.current.delete(refreshKey);
      }
    })();
  }, [data, key, userId]);

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

    const nextUndo = [...data.undo];
    let nextRedo = data.redo;

    if (recordHistory) {
      nextUndo.push({ patches: [...patches], selection: data.progress.selection });
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
    const historySelection = toHistorySelection(data.undo[data.undo.length - 1]);
    if (historySelection) nextProgress = { ...nextProgress, selection: historySelection };
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
    const historySelection = toHistorySelection(data.redo[data.redo.length - 1]);
    if (historySelection) nextProgress = { ...nextProgress, selection: historySelection };
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
  }, [undo, redo]);

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

  async function onReloadPuzzleClick() {
    if (!data || reloadingPuzzle) return;
    const source = (data.def.sourceId ?? key).trim();
    if (!source) {
      alert("Unable to reload this puzzle because its source id is missing.");
      return;
    }

    const proceed = window.confirm("Reload this puzzle from SudokuPad and erase all local progress?");
    if (!proceed) return;

    setReloadingPuzzle(true);
    try {
      const loaded = await loadFromSudokuPad(source);
      const freshKey = loaded.key;
      const freshDef = loaded.def;
      const baseFresh = makeInitialProgress(freshDef);
      const freshProgress: PuzzleProgress = {
        ...baseFresh,
        startedAt: Date.now(),
        status: "in_progress",
        paused: false,
      };
      const freshData: PersistedPuzzle = {
        def: freshDef,
        progress: freshProgress,
        undo: [],
        redo: [],
        updatedAt: Date.now(),
      };

      await deletePuzzle(key);
      if (userId) await deleteCloudPuzzle(userId, key);

      await upsertPuzzle(freshKey, freshData);
      if (userId) await pushPuzzle(userId, freshKey, freshData);

      if (freshKey !== key) {
        nav(`/p/${encodeURIComponent(freshKey)}`);
        return;
      }

      setData(freshData);
      setCompletionOpen(false);
      setRestartPromptOpen(false);
      setPauseMenuOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Failed to reload puzzle: ${msg}`);
    } finally {
      setReloadingPuzzle(false);
    }
  }

  async function onCopySudokuPadLinkClick() {
    if (!data) return;
    const source = (data.def.sourceId ?? key).trim();
    if (!source) return;
    const url = /^https?:\/\//i.test(source) ? source : `https://sudokupad.app/${source}`;
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Intentionally no-op: copy action should not trigger other behavior.
    }
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
      const allHave = editable.every((rc) => data.progress.cells[rc.r][rc.c].value === sym);
      const nextValue = allHave ? undefined : sym;
      for (const rc of editable) {
        const cur = data.progress.cells[rc.r][rc.c].value;
        if (cur === nextValue) continue;
        patches.push(patchAt(data.progress, ["cells", rc.r, rc.c, "value"], nextValue));
      }
    } else {
      const allHave = editable.every((rc) => data.progress.cells[rc.r][rc.c].notes[keyName].has(sym));
      for (const rc of editable) {
        const curSet = data.progress.cells[rc.r][rc.c].notes[keyName];
        const nextSet = new Set(curSet);
        if (allHave) nextSet.delete(sym);
        else nextSet.add(sym);
        patches.push(patchAt(data.progress, ["cells", rc.r, rc.c, "notes", keyName], nextSet));
      }
    }
    applyPatches(patches);
  }

  function applyHighlight(color: string) {
    if (!data) return;
    const selected = data.progress.selection;
    if (!selected.length) return;
    const allHave = selected.every((rc) => (data.progress.cells[rc.r][rc.c].highlights ?? []).includes(color));
    const patches = selected
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
    const selectedEdgeKeys = selectedCellEdgeKeys(selected);
    let changed = false;
    const nextLines: LineStroke[] = [];
    for (const stroke of progress.lines) {
      const nextSegments = stroke.segments.filter((seg) => {
        if (stroke.kind !== "edge") return !sharesSelectedCell(seg.a, seg.b, selectedSet);
        return !selectedEdgeKeys.has(segKey(seg.a, seg.b));
      });
      if (nextSegments.length !== stroke.segments.length) changed = true;
      if (nextSegments.length) nextLines.push({ ...stroke, segments: nextSegments });
    }
    return { lines: nextLines, changed };
  }

  function clearFeatureType(tool: PuzzleProgress["activeTool"], progress: PuzzleProgress): Patch[] {
    const sel = progress.selection;
    if (!sel.length) return [];
    const selectedSet = new Set(sel.map(rcKey));
    const rows = progress.cells.length;
    const cols = progress.cells[0]?.length ?? 0;
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
      for (const rc of sel) {
        const cur = progress.cells[rc.r][rc.c].highlights ?? [];
        if (cur.length) patches.push(patchAt(progress, ["cells", rc.r, rc.c, "highlights"], []));
      }
      return patches;
    }

    const lineClear = clearLinesForSelection(progress, sel);
    if (lineClear.changed) patches.push(patchAt(progress, ["lines"], lineClear.lines));

    const centerMarks = progress.lineCenterMarks.filter((m) => !selectedSet.has(rcKey(m.rc)));
    if (centerMarks.length !== progress.lineCenterMarks.length) patches.push(patchAt(progress, ["lineCenterMarks"], centerMarks));

    const edgeMarks = progress.lineEdgeMarks.filter((m) => !edgeLikeTouchesSelection(m.a, m.b, selectedSet, rows, cols));
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
    resolvedKind: "center" | "edge",
    action: "draw" | "erase"
  ) {
    if (!data || segmentsInput.length < 1) return;
    const segments = segmentsInput.filter((seg) => {
      const dr = Math.abs(seg.a.r - seg.b.r);
      const dc = Math.abs(seg.a.c - seg.b.c);
      if (resolvedKind === "edge" && dr + dc !== 1) return false;
      return dr <= 1 && dc <= 1 && dr + dc > 0;
    });
    if (!segments.length) return;

    const uniqueByKey = new Map<string, { a: CellRC; b: CellRC; edgeTrack?: "top" | "bottom" | "left" | "right" }>();
    for (const seg of segments) uniqueByKey.set(segKeyWithKind(seg, resolvedKind), seg);
    const uniqueSegments = Array.from(uniqueByKey.values());
    const drawKeys = new Set(uniqueSegments.map((seg) => segKeyWithKind(seg, resolvedKind)));

    if (action === "erase") {
      const lines = data.progress.lines
        .map((stroke) => ({
          ...stroke,
          segments: lineKindNamespace(stroke.kind) === resolvedKind
            ? stroke.segments.filter((seg) => !drawKeys.has(segKeyWithKind(seg, stroke.kind)))
            : stroke.segments,
        }))
        .filter((stroke) => stroke.segments.length > 0);
      if (lines.length === data.progress.lines.length && lines.every((stroke, i) => stroke.segments.length === data.progress.lines[i]?.segments.length)) {
        return;
      }
      pushPatch(patchAt(data.progress, ["lines"], lines));
      return;
    }

    const occupied = new Set<string>();
    for (const stroke of data.progress.lines) {
      if (lineKindNamespace(stroke.kind) !== resolvedKind) continue;
      for (const seg of stroke.segments) occupied.add(segKeyWithKind(seg, stroke.kind));
    }

    const drawable = uniqueSegments.filter((seg) => !occupied.has(segKeyWithKind(seg, resolvedKind)));
    if (!drawable.length) return;

    const stroke: LineStroke = {
      kind: resolvedKind,
      color: data.progress.linePaletteColor,
      segments: drawable,
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
  }, [data]);

  useEffect(() => {
    const toolCycle: PuzzleProgress["activeTool"][] = ["value", "corner", "center", "highlight", "line"];
    const keyToTool: Record<string, PuzzleProgress["activeTool"]> = {
      z: "value",
      x: "corner",
      c: "center",
      v: "highlight",
      b: "line",
    };
    const letterHotkeys: Record<string, string> = {
      q: "A",
      w: "B",
      e: "C",
      r: "D",
      t: "E",
      y: "F",
      u: "G",
      i: "H",
      o: "I",
      0: "0",
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
      const rows = data.progress.cells.length;
      const cols = data.progress.cells[0]?.length ?? 0;
      const anchor = data.progress.selection[data.progress.selection.length - 1] ?? { r: 0, c: 0 };
      const next = {
        r: Math.max(0, Math.min(rows - 1, anchor.r + dr)),
        c: Math.max(0, Math.min(cols - 1, anchor.c + dc)),
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
        const rows = data.progress.cells.length;
        const cols = data.progress.cells[0]?.length ?? 0;
        const all = Array.from({ length: rows * cols }, (_, i) => ({ r: Math.floor(i / cols), c: i % cols }));
        setSelection(all);
        return;
      }

      if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && k === "i") {
        if (!data) return;
        e.preventDefault();
        const rows = data.progress.cells.length;
        const cols = data.progress.cells[0]?.length ?? 0;
        const sel = selectionSet();
        const next: CellRC[] = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
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

      if (!e.altKey && !e.ctrlKey && !e.metaKey && k === "escape") {
        e.preventDefault();
        if (!data) return;
        if (!data.progress.paused) pushPatch(patchAt(data.progress, ["paused"], true), { recordHistory: false });
        setPauseMenuOpen(true);
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

        const paletteIndex = digit === "0" ? -1 : Number(digit) - 1;
        if (!e.ctrlKey && !e.shiftKey && data.progress.activeTool === "highlight") {
          if (digit === "0") {
            applyHighlight("#ffffff");
            return;
          }
          const palette = highlightPalettePages[data.progress.highlightPalettePage] ?? highlightPalettePages[0];
          const color = palette[paletteIndex];
          if (color) applyHighlight(color);
          return;
        }

        if (!e.ctrlKey && !e.shiftKey && data.progress.activeTool === "line") {
          if (digit === "0") {
            pushPatch(patchAt(data.progress, ["linePaletteColor"], "#ffffff"), { recordHistory: false });
            return;
          }
          const color = linePalette[paletteIndex];
          if (color) pushPatch(patchAt(data.progress, ["linePaletteColor"], color), { recordHistory: false });
          return;
        }

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
        return;
      }

      if (!e.altKey && !e.ctrlKey && !e.metaKey && letterHotkeys[k]) {
        e.preventDefault();
        if (!data) return;
        const sym = letterHotkeys[k] as string;
        const tool = data.progress.activeTool;
        if (tool === "center") {
          applyDigit(sym, "center");
          return;
        }
        if (tool === "corner") {
          applyDigit(sym, "corner");
          return;
        }
        // Value tool or non-entry tools default to big letters.
        applyDigit(sym, "value");
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
  }, [applyDigit, data, handleBackspace, setActiveTool, setSelection, startHoldRepeat]);

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
      {!mobileLandscape ? (
        <div className="topbar puzzleTopbar">
          <button className="btn" onClick={() => nav("/")}>← Menu</button>
          <div className="puzzleTopbarRight">
            <div className="puzzleTimer">{timeStr}</div>
            <button className="btn" onClick={onPausePlayClick} title="Pause or resume" disabled={data.progress.status === "complete"}>
              {data.progress.status === "complete" ? <IconPause /> : data.progress.paused ? <IconPlay /> : <IconPause />}
            </button>
            <button className="btn" onClick={onReloadPuzzleClick} title="Reload puzzle from SudokuPad" disabled={reloadingPuzzle}>
              <IconReload />
            </button>
            <button className="btn" onClick={onCopySudokuPadLinkClick} title="Copy SudokuPad link">
              <IconCopyLink />
            </button>
            <button className="btn" onClick={() => setSettingsOpen(true)} title="Settings">
              <IconSettings />
            </button>
          </div>
        </div>
      ) : null}

      <div className={"page puzzlePage" + (mobileLandscape ? " mobileLandscape" : "") }>
        <div className={"gridLayout" + (mobileLandscape ? " mobileLandscape" : "") }>
          <div className="boardColumn">
            <div className={mobileLandscape ? "landscapeBoardArea" : ""}>
              {mobileLandscape ? (
                <div className="card landscapeSideRail">
                  <button className="btn" onClick={() => nav("/")} title="Exit to menu" aria-label="Exit to menu">
                    <IconExit />
                  </button>
                  <button className="btn" onClick={onPausePlayClick} title="Pause or resume" disabled={data.progress.status === "complete"}>
                    {data.progress.status === "complete" ? <IconPause /> : data.progress.paused ? <IconPlay /> : <IconPause />}
                  </button>
                  <button className="btn" onClick={onReloadPuzzleClick} title="Reload puzzle from SudokuPad" disabled={reloadingPuzzle}>
                    <IconReload />
                  </button>
                  <button className="btn" onClick={onCopySudokuPadLinkClick} title="Copy SudokuPad link">
                    <IconCopyLink />
                  </button>
                  <button className="btn" onClick={() => setSettingsOpen(true)} title="Settings">
                    <IconSettings />
                  </button>
                </div>
              ) : null}

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
          </div>

          <div className="kbdPanel">
            <div className="card puzzleMetaCard">
              <div className="puzzleTitle">{meta?.title || "(untitled)"}</div>
              <div className="puzzleAuthor">{meta?.author || "Unknown author"}</div>
              <div className="puzzleRules">{meta?.rules || "No puzzle description provided."}</div>
            </div>

            <div className="card controlStack mobileControlPanel">
              <button
                className="btn panelBtn panelUndo"
                onPointerDown={() => startHoldRepeat("undo")}
                onPointerUp={stopHoldRepeat}
                onPointerLeave={stopHoldRepeat}
                onPointerCancel={stopHoldRepeat}
                title="Undo (N)"
              >
                <IconUndo />
              </button>
              <button
                className="btn panelBtn panelRedo"
                onPointerDown={() => startHoldRepeat("redo")}
                onPointerUp={stopHoldRepeat}
                onPointerLeave={stopHoldRepeat}
                onPointerCancel={stopHoldRepeat}
                title="Redo (M)"
              >
                <IconRedo />
              </button>
              <button
                className={"btn panelBtn panelSelectToggle" + (data.progress.multiSelect ? " primary" : "")}
                onClick={toggleSelectionMode}
                title={data.progress.multiSelect ? "Multi-touch selection enabled" : "Single-touch selection enabled"}
              >
                <IconSelectMode multi={data.progress.multiSelect} />
              </button>

              <button title="Big numbers (Z)" className={"btn panelBtn panelTool1" + (data.progress.activeTool === "value" ? " primary" : "")} onClick={() => setActiveTool("value")}><IconToolBig /></button>
              <button title="Edge notes (X)" className={"btn panelBtn panelTool2" + (data.progress.activeTool === "corner" ? " primary" : "")} onClick={() => setActiveTool("corner")}><IconToolCorner /></button>
              <button title="Center notes (C)" className={"btn panelBtn panelTool3" + (data.progress.activeTool === "center" ? " primary" : "")} onClick={() => setActiveTool("center")}><IconToolCenter /></button>
              <button title="Highlight (V)" className={"btn panelBtn panelTool4" + (data.progress.activeTool === "highlight" ? " primary" : "")} onClick={() => setActiveTool("highlight")}><IconToolHighlight /></button>
              <button title="Line (B)" className={"btn panelBtn panelTool5" + (data.progress.activeTool === "line" ? " primary" : "")} onClick={() => setActiveTool("line")}><IconToolLine /></button>

              <div className="panelMainGrid">
                {(data.progress.activeTool === "value" || data.progress.activeTool === "center" || data.progress.activeTool === "corner") ? (
                  <Keyboard
                    compact
                    kind="numbers"
                    progress={data.progress}
                    onDigit={applyDigit}
                    onBackspace={handleBackspace}
                    onToggleAlphabet={() => pushPatch(patchAt(data.progress, ["alphabetMode"], !data.progress.alphabetMode), { recordHistory: false })}
                  />
                ) : null}

                {data.progress.activeTool === "highlight" ? (
                  <Keyboard
                    compact
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
                    compact
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
      </div>

      {pauseMenuOpen && (
        <PauseOverlay
          meta={meta}
          sourceId={data.def.sourceId}
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
