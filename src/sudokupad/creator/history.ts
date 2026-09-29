import { applyPatch, invertPatch, type Patch } from "../../core/undo";
import type { CreatorProject } from "./project";

export type CreatorProjectHistoryEntry = { patches: Patch[] };
export type CreatorProjectHistoryState = { undo: CreatorProjectHistoryEntry[]; redo: CreatorProjectHistoryEntry[] };

const HISTORY_KEYS = ["grid", "metadata", "givens", "solution", "solutionEntries", "regions", "constraints", "cosmetics", "settings", "compatibility"] as const;
const HISTORY_KEY_SET = new Set<string>(HISTORY_KEYS);
const clone = <T,>(value: T): T => value === undefined ? value : structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

function collectPatches(prev: unknown, next: unknown, path: Patch["path"], patches: Patch[]) {
  if (Object.is(prev, next)) return;
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) { patches.push({ path, prev: clone(prev), next: clone(next) }); return; }
    for (let index = 0; index < prev.length; index += 1) collectPatches(prev[index], next[index], [...path, index], patches);
    return;
  }
  if (isRecord(prev) && isRecord(next)) {
    const prevKeys = Object.keys(prev).sort(), nextKeys = Object.keys(next).sort();
    if (prevKeys.length !== nextKeys.length || prevKeys.some((key, index) => key !== nextKeys[index])) {
      patches.push({ path, prev: clone(prev), next: clone(next) });
      return;
    }
    for (const key of prevKeys) collectPatches(prev[key], next[key], [...path, key], patches);
    return;
  }
  patches.push({ path, prev: clone(prev), next: clone(next) });
}

export function createCreatorProjectHistoryEntry(previous: CreatorProject, next: CreatorProject): CreatorProjectHistoryEntry | null {
  const patches: Patch[] = [];
  for (const key of HISTORY_KEYS) collectPatches(previous[key], next[key], [key], patches);
  return patches.length ? { patches } : null;
}

export function applyCreatorProjectHistoryEntry(project: CreatorProject, entry: CreatorProjectHistoryEntry, direction: "undo" | "redo"): CreatorProject {
  let next = project;
  const patches = direction === "undo" ? [...entry.patches].reverse().map(invertPatch) : entry.patches;
  for (const patch of patches) next = applyPatch(next, patch);
  return next;
}

function validHistoryPath(path: unknown): path is Patch["path"] {
  if (!Array.isArray(path) || path.length < 1 || path.length > 32 || typeof path[0] !== "string" || !HISTORY_KEY_SET.has(path[0])) return false;
  return path.every((part) => typeof part === "string" || (typeof part === "number" && Number.isInteger(part) && part >= 0));
}

export function normalizeCreatorProjectHistory(input: unknown, limit = 100): CreatorProjectHistoryEntry[] {
  if (!Array.isArray(input)) return [];
  const entries: CreatorProjectHistoryEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as { patches?: unknown }).patches)) continue;
    const patches: Patch[] = [];
    for (const candidate of (raw as { patches: unknown[] }).patches) {
      if (!candidate || typeof candidate !== "object") continue;
      const patch = candidate as Partial<Patch>;
      if (!validHistoryPath(patch.path)) continue;
      patches.push({ path: [...patch.path], prev: clone(patch.prev), next: clone(patch.next) });
    }
    if (patches.length) entries.push({ patches });
  }
  return entries.slice(-Math.max(1, limit));
}
