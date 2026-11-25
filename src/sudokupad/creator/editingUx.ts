import type { CellRC, PuzzleDefinition } from "../../core/model";
import type { PuzzleLogicConstraint } from "../types/logic";
import type { SudokuPadSourceArrow, SudokuPadSourceCage, SudokuPadSourceGraphic, SudokuPadSourceLine } from "../types/source";
import { replaceCreatorLinePath } from "./lineConstraints";
import { creatorConstraints, creatorPartConstraint, creatorPartElement } from "./nativeAuthoring";
import { CREATOR_OBJECT_ID, listCreatorObjects, removeCreatorObject, updateCreatorObject, type CreatorObjectPatch, type CreatorVisualCollection } from "./objectEditing";

const TAG_ELEMENT = "data-sphenpad-element";
const TAG_CONSTRAINT = "data-sphenpad-constraint";
const TAG_NAME = "data-sphenpad-object-name";
const CLIPBOARD_FORMAT = "sphenpad-creator-objects" as const;
const CLIPBOARD_VERSION = 1 as const;
type VisualPart = SudokuPadSourceLine | SudokuPadSourceArrow | SudokuPadSourceCage | SudokuPadSourceGraphic;

type ClipboardVisual = { collection: CreatorVisualCollection; value: VisualPart };
export type CreatorObjectClipboardItem = {
  kind: "constraint" | "cosmetic";
  sourceId: string;
  elementId: string;
  name: string;
  constraint?: PuzzleLogicConstraint;
  visuals: ClipboardVisual[];
};
export type CreatorObjectClipboard = { format: typeof CLIPBOARD_FORMAT; version: typeof CLIPBOARD_VERSION; items: CreatorObjectClipboardItem[] };
export type CreatorAlignMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
export type CreatorSnapMode = "cell-center" | "cell-edge";

const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
function freshId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
}
function sceneCollections(def: PuzzleDefinition): Array<[CreatorVisualCollection, VisualPart[]]> {
  if (!def.scene) return [];
  return [["lines", def.scene.lines], ["arrows", def.scene.arrows], ["cages", def.scene.cages], ["underlays", def.scene.underlays], ["overlays", def.scene.overlays]];
}
function belongs(part: Record<string, unknown>, id: string) { return creatorPartConstraint(part) === id || part[CREATOR_OBJECT_ID] === id; }
function visualEntries(def: PuzzleDefinition, id: string): ClipboardVisual[] {
  const out: ClipboardVisual[] = [];
  for (const [collection, parts] of sceneCollections(def)) for (const part of parts) if (belongs(part as Record<string, unknown>, id)) out.push({ collection, value: clone(part) });
  return out;
}

export function makeCreatorObjectClipboard(def: PuzzleDefinition, ids: string[]): CreatorObjectClipboard {
  const objects = new Map(listCreatorObjects(def).map((object) => [object.id, object]));
  const items: CreatorObjectClipboardItem[] = [];
  for (const sourceId of [...new Set(ids)]) {
    const object = objects.get(sourceId);
    if (!object || object.kind === "background") continue;
    const constraint = object.kind === "constraint" ? creatorConstraints(def).find((entry) => entry.id === sourceId) : undefined;
    items.push({ kind: object.kind, sourceId, elementId: object.elementId, name: object.name, constraint: constraint ? clone(constraint) : undefined, visuals: visualEntries(def, sourceId) });
  }
  return { format: CLIPBOARD_FORMAT, version: CLIPBOARD_VERSION, items };
}

export function creatorObjectClipboardJson(def: PuzzleDefinition, ids: string[]) { return JSON.stringify(makeCreatorObjectClipboard(def, ids)); }
export function parseCreatorObjectClipboard(input: string | unknown): CreatorObjectClipboard {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  if (!value || typeof value !== "object") throw new Error("Invalid creator object clipboard");
  const payload = value as CreatorObjectClipboard;
  if (payload.format !== CLIPBOARD_FORMAT || payload.version !== CLIPBOARD_VERSION || !Array.isArray(payload.items)) throw new Error("Unsupported creator object clipboard");
  return clone(payload);
}

export function pasteCreatorObjectClipboard(def: PuzzleDefinition, input: CreatorObjectClipboard | string): { def: PuzzleDefinition; objectIds: string[] } {
  const payload = typeof input === "string" ? parseCreatorObjectClipboard(input) : clone(input);
  if (!def.scene) return { def, objectIds: [] };
  let next = clone(def);
  const created: string[] = [];
  for (const item of payload.items) {
    const nextId = freshId(item.kind === "constraint" ? (item.constraint?.type || "constraint") : "cosmetic");
    const scene = { ...next.scene! };
    for (const collection of ["lines", "arrows", "cages", "underlays", "overlays"] as CreatorVisualCollection[]) {
      const current = scene[collection] as VisualPart[];
      const additions = item.visuals.filter((entry) => entry.collection === collection).map((entry) => {
        const part = clone(entry.value) as Record<string, unknown>;
        if (item.kind === "constraint") { part[TAG_CONSTRAINT] = nextId; delete part[CREATOR_OBJECT_ID]; }
        else { part[CREATOR_OBJECT_ID] = nextId; delete part[TAG_CONSTRAINT]; }
        part[TAG_ELEMENT] = item.elementId;
        if (item.name) part[TAG_NAME] = item.name.endsWith(" copy") ? item.name : `${item.name} copy`;
        return part as VisualPart;
      });
      (scene as unknown as Record<string, unknown>)[collection] = [...current, ...additions];
    }
    let logic = next.logic;
    if (item.kind === "constraint" && item.constraint) {
      const copied = clone(item.constraint);
      copied.id = nextId;
      copied.sourceElementId = item.elementId;
      if (typeof copied[TAG_NAME] === "string") copied[TAG_NAME] = `${copied[TAG_NAME]} copy`;
      logic = { ...(next.logic ?? {}), constraints: [...(next.logic?.constraints ?? []), copied] };
    }
    const creatorElements = new Set(next.meta.creatorElements ?? []);
    creatorElements.add(item.elementId);
    next = { ...next, scene, logic, meta: { ...next.meta, creatorElements: [...creatorElements] } };
    created.push(nextId);
  }
  return { def: next, objectIds: created };
}

export function updateCreatorObjects(def: PuzzleDefinition, ids: string[], patch: CreatorObjectPatch): PuzzleDefinition {
  return [...new Set(ids)].reduce((next, id) => updateCreatorObject(next, id, patch), def);
}
export function removeCreatorObjects(def: PuzzleDefinition, ids: string[]): PuzzleDefinition {
  return [...new Set(ids)].reduce((next, id) => removeCreatorObject(next, id), def);
}

function movePartsToEdge(parts: VisualPart[], ids: Set<string>, edge: "back" | "front") {
  const selected = parts.filter((part) => ids.has(String(creatorPartConstraint(part as Record<string, unknown>) ?? (part as Record<string, unknown>)[CREATOR_OBJECT_ID] ?? "")));
  const rest = parts.filter((part) => !selected.includes(part));
  return edge === "back" ? [...selected, ...rest] : [...rest, ...selected];
}
export function moveCreatorObjectsToEdge(def: PuzzleDefinition, ids: string[], edge: "back" | "front"): PuzzleDefinition {
  if (!def.scene) return def;
  const set = new Set(ids);
  return { ...def, scene: {
    ...def.scene,
    lines: movePartsToEdge(def.scene.lines, set, edge) as SudokuPadSourceLine[], arrows: movePartsToEdge(def.scene.arrows, set, edge) as SudokuPadSourceArrow[], cages: movePartsToEdge(def.scene.cages, set, edge) as SudokuPadSourceCage[],
    underlays: movePartsToEdge(def.scene.underlays, set, edge) as SudokuPadSourceGraphic[], overlays: movePartsToEdge(def.scene.overlays, set, edge) as SudokuPadSourceGraphic[],
  } };
}

function mapSelectedVisuals(def: PuzzleDefinition, ids: Set<string>, mapper: (part: Record<string, unknown>) => Record<string, unknown>) {
  if (!def.scene) return def;
  const scene = { ...def.scene };
  for (const [collection, parts] of sceneCollections(def)) (scene as unknown as Record<string, unknown>)[collection] = parts.map((part) => {
    const record = part as Record<string, unknown>;
    const object = String(creatorPartConstraint(record) ?? record[CREATOR_OBJECT_ID] ?? "");
    return ids.has(object) ? mapper(record) : part;
  });
  return { ...def, scene };
}
type CosmeticBounds = { top: number; bottom: number; left: number; right: number; centerR: number; centerC: number };
function partBounds(part: Record<string, unknown>): CosmeticBounds | undefined {
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  const add = (r: number, c: number) => {
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  };
  if (Array.isArray(part.center) && part.center.length >= 2) {
    const r = Number(part.center[0]), c = Number(part.center[1]);
    const width = Number(part.width ?? 0), height = Number(part.height ?? 0);
    const angle = Number(part.angle ?? 0);
    if (Number.isFinite(width) && Number.isFinite(height) && width >= 0 && height >= 0 && Number.isFinite(angle)) {
      const radians = angle * Math.PI / 180;
      const halfWidth = (Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))) / 2;
      const halfHeight = (Math.abs(height * Math.cos(radians)) + Math.abs(width * Math.sin(radians))) / 2;
      add(r - halfHeight, c - halfWidth); add(r + halfHeight, c + halfWidth);
    } else add(r, c);
  }
  if (Array.isArray(part.wayPoints)) for (const point of part.wayPoints) {
    if (Array.isArray(point) && point.length >= 2) add(Number(point[0]), Number(point[1]));
  }
  if (Array.isArray(part.cells)) for (const cell of part.cells) {
    if (Array.isArray(cell) && cell.length >= 2) {
      const r = Number(cell[0]), c = Number(cell[1]);
      add(r, c); add(r + 1, c + 1);
    }
  }
  if (!Number.isFinite(minR)) return undefined;
  return { top: minR, bottom: maxR, left: minC, right: maxC, centerR: (minR + maxR) / 2, centerC: (minC + maxC) / 2 };
}
function objectAnchor(def: PuzzleDefinition, id: string): CosmeticBounds | undefined {
  const bounds = visualEntries(def, id).map((entry) => partBounds(entry.value as Record<string, unknown>)).filter((entry): entry is CosmeticBounds => Boolean(entry));
  if (!bounds.length) return undefined;
  const top = Math.min(...bounds.map((b) => b.top)), bottom = Math.max(...bounds.map((b) => b.bottom));
  const left = Math.min(...bounds.map((b) => b.left)), right = Math.max(...bounds.map((b) => b.right));
  return { top, bottom, left, right, centerR: (top + bottom) / 2, centerC: (left + right) / 2 };
}
function translatePart(part: Record<string, unknown>, dr: number, dc: number) {
  const next = clone(part);
  if (Array.isArray(next.center) && next.center.length >= 2) next.center = [Number(next.center[0]) + dr, Number(next.center[1]) + dc];
  if (Array.isArray(next.wayPoints)) next.wayPoints = next.wayPoints.map((point) => Array.isArray(point) && point.length >= 2 ? [Number(point[0]) + dr, Number(point[1]) + dc] : point);
  if (Array.isArray(next.cells)) next.cells = next.cells.map((cell) => Array.isArray(cell) && cell.length >= 2 ? [Math.round(Number(cell[0]) + dr), Math.round(Number(cell[1]) + dc)] : cell);
  return next;
}
export function alignCreatorCosmetics(def: PuzzleDefinition, ids: string[], mode: CreatorAlignMode): PuzzleDefinition {
  const cosmetics = listCreatorObjects(def).filter((object) => ids.includes(object.id) && object.kind === "cosmetic" && object.elementId !== "cosmetic-cages");
  if (cosmetics.length < 2) return def;
  const anchors = cosmetics.map((object) => ({ id: object.id, anchor: objectAnchor(def, object.id) })).filter((entry): entry is { id: string; anchor: NonNullable<ReturnType<typeof objectAnchor>> } => Boolean(entry.anchor));
  if (anchors.length < 2) return def;
  const target = mode === "left" ? Math.min(...anchors.map((x) => x.anchor.left)) : mode === "right" ? Math.max(...anchors.map((x) => x.anchor.right)) : mode === "center-x" ? anchors.reduce((sum, x) => sum + x.anchor.centerC, 0) / anchors.length : mode === "top" ? Math.min(...anchors.map((x) => x.anchor.top)) : mode === "bottom" ? Math.max(...anchors.map((x) => x.anchor.bottom)) : anchors.reduce((sum, x) => sum + x.anchor.centerR, 0) / anchors.length;
  let next = def;
  for (const { id, anchor } of anchors) {
    const dc = mode === "left" ? target - anchor.left : mode === "right" ? target - anchor.right : mode === "center-x" ? target - anchor.centerC : 0;
    const dr = mode === "top" ? target - anchor.top : mode === "bottom" ? target - anchor.bottom : mode === "center-y" ? target - anchor.centerR : 0;
    next = mapSelectedVisuals(next, new Set([id]), (part) => translatePart(part, dr, dc));
  }
  return next;
}

/** Translate free artwork without quantizing the coordinates or clipping at grid edges. */
export function nudgeCreatorCosmetics(def: PuzzleDefinition, ids: string[], dr: number, dc: number): PuzzleDefinition {
  if (!Number.isFinite(dr) || !Number.isFinite(dc) || Math.abs(dr) > 100 || Math.abs(dc) > 100) return def;
  const movable = new Set(listCreatorObjects(def)
    .filter((object) => object.kind === "cosmetic" && object.elementId !== "cosmetic-cages" && ids.includes(object.id))
    .map((object) => object.id));
  return mapSelectedVisuals(def, movable, (part) => translatePart(part, dr, dc));
}

function snapNumber(value: number, mode: CreatorSnapMode) { return mode === "cell-center" ? Math.round(value - 0.5) + 0.5 : Math.round(value); }
export function snapCreatorObjects(def: PuzzleDefinition, ids: string[], mode: CreatorSnapMode): PuzzleDefinition {
  const set = new Set(ids);
  return mapSelectedVisuals(def, set, (part) => {
    const next = clone(part);
    if (Array.isArray(next.center) && next.center.length >= 2) next.center = [snapNumber(Number(next.center[0]), mode), snapNumber(Number(next.center[1]), mode)];
    if (Array.isArray(next.wayPoints)) next.wayPoints = next.wayPoints.map((point) => Array.isArray(point) && point.length >= 2 ? [snapNumber(Number(point[0]), mode), snapNumber(Number(point[1]), mode)] : point);
    return next;
  });
}

function clampCell(def: PuzzleDefinition, cell: CellRC): CellRC { return { r: Math.max(0, Math.min(def.rows - 1, Math.round(cell.r))), c: Math.max(0, Math.min(def.cols - 1, Math.round(cell.c))) }; }
export function setCreatorLinePathPoint(def: PuzzleDefinition, id: string, index: number, cell: CellRC): PuzzleDefinition {
  const constraint = creatorConstraints(def).find((entry) => entry.id === id);
  const path = clone((constraint?.path ?? constraint?.cells ?? []) as CellRC[]);
  if (index < 0 || index >= path.length) return def;
  path[index] = clampCell(def, cell);
  return replaceCreatorLinePath(def, id, path);
}
export function nudgeCreatorLinePathPoint(def: PuzzleDefinition, id: string, index: number, dr: number, dc: number): PuzzleDefinition {
  const constraint = creatorConstraints(def).find((entry) => entry.id === id);
  const path = clone((constraint?.path ?? constraint?.cells ?? []) as CellRC[]);
  if (index < 0 || index >= path.length) return def;
  return setCreatorLinePathPoint(def, id, index, { r: path[index].r + dr, c: path[index].c + dc });
}
export function reorderCreatorLinePathPoint(def: PuzzleDefinition, id: string, from: number, to: number): PuzzleDefinition {
  const constraint = creatorConstraints(def).find((entry) => entry.id === id);
  const path = clone((constraint?.path ?? constraint?.cells ?? []) as CellRC[]);
  if (from < 0 || from >= path.length || to < 0 || to >= path.length || from === to) return def;
  const [cell] = path.splice(from, 1); path.splice(to, 0, cell);
  return replaceCreatorLinePath(def, id, path);
}
export function removeCreatorLinePathPoint(def: PuzzleDefinition, id: string, index: number): PuzzleDefinition {
  const constraint = creatorConstraints(def).find((entry) => entry.id === id);
  const path = clone((constraint?.path ?? constraint?.cells ?? []) as CellRC[]);
  if (path.length <= 2 || index < 0 || index >= path.length) return def;
  path.splice(index, 1); return replaceCreatorLinePath(def, id, path);
}
export function insertCreatorLinePathPoint(def: PuzzleDefinition, id: string, afterIndex: number, cell: CellRC): PuzzleDefinition {
  const constraint = creatorConstraints(def).find((entry) => entry.id === id);
  const path = clone((constraint?.path ?? constraint?.cells ?? []) as CellRC[]);
  if (!path.length) return def;
  path.splice(Math.max(0, Math.min(path.length, afterIndex + 1)), 0, clampCell(def, cell));
  return replaceCreatorLinePath(def, id, path);
}

export function creatorObjectElementIds(def: PuzzleDefinition, ids: string[]) { return [...new Set(listCreatorObjects(def).filter((object) => ids.includes(object.id)).map((object) => object.elementId))]; }
export function objectElementIdFromPart(part: Record<string, unknown>) { return creatorPartElement(part); }
