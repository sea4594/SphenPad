import type { PuzzleDefinition } from "../../core/model";
import type { PuzzleLogicConstraint } from "../types/logic";
import type { SudokuPadSourceArrow, SudokuPadSourceCage, SudokuPadSourceGraphic, SudokuPadSourceLine } from "../types/source";
import { creatorConstraints, creatorPartConstraint, creatorPartElement } from "./nativeAuthoring";

export const CREATOR_OBJECT_ID = "data-sphenpad-object-id" as const;
export const CREATOR_OBJECT_NAME = "data-sphenpad-object-name" as const;
export const CREATOR_OBJECT_DISABLED = "data-sphenpad-disabled" as const;
const CREATOR_STORED_OPACITY = "data-sphenpad-stored-opacity";
const CREATOR_STORED_HIDDEN = "data-sphenpad-stored-hidden";
const TAG_ELEMENT = "data-sphenpad-element";
const TAG_CONSTRAINT = "data-sphenpad-constraint";
const UNSET = "__sphenpad-unset__";

type VisualPart = SudokuPadSourceLine | SudokuPadSourceArrow | SudokuPadSourceCage | SudokuPadSourceGraphic;
export type CreatorVisualCollection = "lines" | "arrows" | "cages" | "underlays" | "overlays";
export type CreatorEditableObjectKind = "constraint" | "cosmetic" | "background";
export type CreatorEditableObject = {
  id: string;
  kind: CreatorEditableObjectKind;
  elementId: string;
  name: string;
  enabled: boolean;
  visualCount: number;
  collections: CreatorVisualCollection[];
  constraint?: PuzzleLogicConstraint;
  sample?: Record<string, unknown>;
};
export type CreatorObjectPatch = {
  name?: string;
  url?: string;
  enabled?: boolean;
  ignoreInSolver?: boolean;
  value?: string | number;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  text?: string;
  fontSize?: number;
  thickness?: number;
  opacity?: number;
  width?: number;
  height?: number;
  angle?: number;
  rounded?: boolean;
  target?: string;
};
export type CreatorCosmeticVisuals = Partial<Record<CreatorVisualCollection, VisualPart[]>>;

const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
function id(prefix: string) {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${suffix}`;
}
function objectId(part: Record<string, unknown>) { return typeof part[CREATOR_OBJECT_ID] === "string" ? String(part[CREATOR_OBJECT_ID]) : undefined; }
function objectName(part: Record<string, unknown>) { return typeof part[CREATOR_OBJECT_NAME] === "string" ? String(part[CREATOR_OBJECT_NAME]) : undefined; }
function isDisabled(part: Record<string, unknown>) { return part[CREATOR_OBJECT_DISABLED] === true || part[CREATOR_OBJECT_DISABLED] === "true"; }
function withTags<T extends Record<string, unknown>>(part: T, elementId: string, object: string, name?: string): T {
  return { ...part, [TAG_ELEMENT]: elementId, [CREATOR_OBJECT_ID]: object, ...(name ? { [CREATOR_OBJECT_NAME]: name } : {}) };
}
function sceneCollections(def: PuzzleDefinition): Array<[CreatorVisualCollection, VisualPart[]]> {
  if (!def.scene) return [];
  return [["lines", def.scene.lines], ["arrows", def.scene.arrows], ["cages", def.scene.cages], ["underlays", def.scene.underlays], ["overlays", def.scene.overlays]];
}
function applyPartEnabled(part: Record<string, unknown>, enabled: boolean, collection: CreatorVisualCollection) {
  const next = { ...part };
  if (collection === "cages") {
    if (!enabled && !isDisabled(next)) next[CREATOR_STORED_HIDDEN] = next.hidden === undefined ? UNSET : Boolean(next.hidden);
    if (enabled) {
      const stored = next[CREATOR_STORED_HIDDEN];
      if (stored === UNSET) delete next.hidden;
      else if (typeof stored === "boolean") next.hidden = stored;
      delete next[CREATOR_STORED_HIDDEN];
      delete next[CREATOR_OBJECT_DISABLED];
    } else {
      next.hidden = true;
      next[CREATOR_OBJECT_DISABLED] = true;
    }
    return next;
  }
  if (!enabled && !isDisabled(next)) next[CREATOR_STORED_OPACITY] = next.opacity === undefined ? UNSET : next.opacity;
  if (enabled) {
    const stored = next[CREATOR_STORED_OPACITY];
    if (stored === UNSET) delete next.opacity;
    else if (typeof stored === "number") next.opacity = stored;
    delete next[CREATOR_STORED_OPACITY];
    delete next[CREATOR_OBJECT_DISABLED];
  } else {
    next.opacity = 0.18;
    next[CREATOR_OBJECT_DISABLED] = true;
  }
  return next;
}
function patchPart(part: Record<string, unknown>, patch: CreatorObjectPatch) {
  const next = { ...part };
  const keys: Array<keyof CreatorObjectPatch> = ["color", "backgroundColor", "borderColor", "textColor", "text", "fontSize", "thickness", "opacity", "width", "height", "angle", "rounded", "target"];
  for (const key of keys) if (patch[key] !== undefined) next[key] = patch[key];
  if (patch.url !== undefined && ("imageUrl" in next || String(next[TAG_ELEMENT] ?? "") === "cosmetic-images")) next.imageUrl = patch.url;
  if (patch.borderColor !== undefined && Array.isArray(next.cells)) next.outlineC = patch.borderColor;
  if (patch.textColor !== undefined && Array.isArray(next.cells)) next.fontC = patch.textColor;
  if (patch.thickness !== undefined && "borderSize" in next) next.borderSize = patch.thickness;
  if (patch.value !== undefined && ("value" in next || "cells" in next)) next.value = patch.value;
  if (patch.name !== undefined) {
    if (patch.name) next[CREATOR_OBJECT_NAME] = patch.name;
    else delete next[CREATOR_OBJECT_NAME];
  }
  return next;
}
function sceneWithMappedObject(def: PuzzleDefinition, targetId: string, mapper: (part: Record<string, unknown>, collection: CreatorVisualCollection) => Record<string, unknown>) {
  if (!def.scene) return def;
  const scene = { ...def.scene };
  for (const [collection, parts] of sceneCollections(def)) {
    (scene as unknown as Record<string, unknown>)[collection] = parts.map((part) => {
      const record = part as Record<string, unknown>;
      const belongs = creatorPartConstraint(record) === targetId || objectId(record) === targetId;
      return belongs ? mapper(record, collection) : part;
    });
  }
  return { ...def, scene };
}
function visualPartsFor(def: PuzzleDefinition, targetId: string) {
  const result: Array<{ collection: CreatorVisualCollection; part: Record<string, unknown> }> = [];
  for (const [collection, parts] of sceneCollections(def)) for (const part of parts) {
    const record = part as Record<string, unknown>;
    if (creatorPartConstraint(record) === targetId || objectId(record) === targetId) result.push({ collection, part: record });
  }
  return result;
}

export function ensureCreatorObjectIds(def: PuzzleDefinition): PuzzleDefinition {
  if (!def.scene) return def;
  const scene = { ...def.scene };
  for (const [collection, parts] of sceneCollections(def)) {
    (scene as unknown as Record<string, unknown>)[collection] = parts.map((part) => {
      const record = part as Record<string, unknown>;
      if (creatorPartConstraint(record) || objectId(record)) return part;
      return { ...record, [CREATOR_OBJECT_ID]: id("cosmetic") };
    });
  }
  return { ...def, scene };
}

export function addCreatorCosmetic(def: PuzzleDefinition, elementId: string, visual: CreatorCosmeticVisuals, options?: { objectId?: string; name?: string }): { def: PuzzleDefinition; objectId: string } {
  if (!def.scene) return { def, objectId: options?.objectId ?? id("cosmetic") };
  const nextId = options?.objectId ?? id("cosmetic");
  const scene = { ...def.scene };
  for (const collection of ["lines", "arrows", "cages", "underlays", "overlays"] as CreatorVisualCollection[]) {
    const items = visual[collection] ?? [];
    if (!items.length) continue;
    const current = scene[collection] as VisualPart[];
    (scene as unknown as Record<string, unknown>)[collection] = [...current, ...items.map((part) => withTags(clone(part) as Record<string, unknown>, elementId, nextId, options?.name))];
  }
  return { def: { ...def, scene }, objectId: nextId };
}

export function setCreatorBackground(def: PuzzleDefinition, input: { url?: string; opacity?: number; target?: string; name?: string; elementId?: "cosmetic-images" | "cosmetic-backgrounds" }): PuzzleDefinition {
  if (!def.scene) return def;
  const metadata = { ...def.scene.metadata } as Record<string, unknown>;
  if (!input.url?.trim()) {
    delete metadata.bgimage; delete metadata.bgimageopacity; delete metadata.bgimagetarget; delete metadata.creatorBackgroundName; delete metadata.creatorBackgroundEnabled; delete metadata.creatorBackgroundElementId; delete metadata.creatorBackgroundStoredOpacity;
  } else {
    metadata.bgimage = input.url.trim();
    metadata.bgimageopacity = Math.max(0, Math.min(1, input.opacity ?? Number(metadata.bgimageopacity ?? 1)));
    metadata.bgimagetarget = input.target ?? String(metadata.bgimagetarget ?? "background");
    metadata.creatorBackgroundName = input.name ?? String(metadata.creatorBackgroundName ?? "Background image");
    metadata.creatorBackgroundElementId = input.elementId ?? String(metadata.creatorBackgroundElementId ?? "cosmetic-backgrounds");
    metadata.creatorBackgroundEnabled = true;
    delete metadata.creatorBackgroundStoredOpacity;
  }
  return { ...def, scene: { ...def.scene, metadata } };
}

export function listCreatorObjects(input: PuzzleDefinition): CreatorEditableObject[] {
  const def = ensureCreatorObjectIds(input);
  const out: CreatorEditableObject[] = [];
  for (const constraint of creatorConstraints(def)) {
    const parts = visualPartsFor(def, constraint.id);
    const elementId = constraint.sourceElementId ?? constraint.type;
    const name = typeof constraint[CREATOR_OBJECT_NAME] === "string" ? String(constraint[CREATOR_OBJECT_NAME]) : elementId;
    out.push({ id: constraint.id, kind: "constraint", elementId, name, enabled: constraint.enabled !== false, visualCount: parts.length, collections: [...new Set(parts.map((item) => item.collection))], constraint, sample: parts[0]?.part });
  }
  const groups = new Map<string, { elementId: string; name: string; parts: Array<{ collection: CreatorVisualCollection; part: Record<string, unknown> }> }>();
  for (const [collection, parts] of sceneCollections(def)) for (const part of parts) {
    const record = part as Record<string, unknown>;
    if (creatorPartConstraint(record)) continue;
    const key = objectId(record);
    if (!key) continue;
    const group = groups.get(key) ?? { elementId: creatorPartElement(record) ?? "cosmetic", name: objectName(record) ?? creatorPartElement(record) ?? "Cosmetic", parts: [] };
    group.parts.push({ collection, part: record }); groups.set(key, group);
  }
  for (const [object, group] of groups) out.push({ id: object, kind: "cosmetic", elementId: group.elementId, name: group.name, enabled: !group.parts.every((item) => isDisabled(item.part)), visualCount: group.parts.length, collections: [...new Set(group.parts.map((item) => item.collection))], sample: group.parts[0]?.part });
  const metadata = def.scene?.metadata as Record<string, unknown> | undefined;
  if (typeof metadata?.bgimage === "string" && metadata.bgimage.trim()) out.push({ id: "creator-background", kind: "background", elementId: typeof metadata.creatorBackgroundElementId === "string" ? metadata.creatorBackgroundElementId : "cosmetic-backgrounds", name: typeof metadata.creatorBackgroundName === "string" ? metadata.creatorBackgroundName : "Background image", enabled: metadata.creatorBackgroundEnabled !== false, visualCount: 1, collections: [], sample: { url: metadata.bgimage, opacity: metadata.bgimageopacity, target: metadata.bgimagetarget } });
  return out;
}

export function updateCreatorObject(def: PuzzleDefinition, targetId: string, patch: CreatorObjectPatch): PuzzleDefinition {
  if (targetId === "creator-background") {
    if (!def.scene) return def;
    const metadata = { ...def.scene.metadata } as Record<string, unknown>;
    if (patch.name !== undefined) metadata.creatorBackgroundName = patch.name;
    if (patch.url !== undefined) metadata.bgimage = patch.url.trim();
    if (patch.opacity !== undefined) metadata.bgimageopacity = Math.max(0, Math.min(1, patch.opacity));
    if (patch.target !== undefined) metadata.bgimagetarget = patch.target;
    if (patch.enabled !== undefined) {
      metadata.creatorBackgroundEnabled = patch.enabled;
      if (!patch.enabled) { if (metadata.creatorBackgroundStoredOpacity === undefined) metadata.creatorBackgroundStoredOpacity = metadata.bgimageopacity ?? 1; metadata.bgimageopacity = 0; }
      else if (metadata.creatorBackgroundStoredOpacity !== undefined) { metadata.bgimageopacity = metadata.creatorBackgroundStoredOpacity; delete metadata.creatorBackgroundStoredOpacity; }
    }
    return { ...def, scene: { ...def.scene, metadata } };
  }
  let next = sceneWithMappedObject(def, targetId, (part, collection) => {
    let result = patchPart(part, patch);
    if (patch.enabled !== undefined) result = applyPartEnabled(result, patch.enabled, collection);
    return result;
  });
  if (next.logic) next = {
    ...next,
    logic: {
      ...next.logic,
      constraints: (next.logic.constraints ?? []).map((constraint) => constraint.id !== targetId ? constraint : {
        ...constraint,
        ...(patch.name !== undefined ? { [CREATOR_OBJECT_NAME]: patch.name } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.ignoreInSolver !== undefined ? { ignoreInSolver: patch.ignoreInSolver } : {}),
        ...(patch.value !== undefined ? { value: patch.value } : {}),
      }),
    },
  };
  return next;
}

export function removeCreatorObject(def: PuzzleDefinition, targetId: string): PuzzleDefinition {
  if (targetId === "creator-background") return setCreatorBackground(def, {});
  if (!def.scene) return def;
  const keep = (part: Record<string, unknown>) => creatorPartConstraint(part) !== targetId && objectId(part) !== targetId;
  return {
    ...def,
    scene: {
      ...def.scene,
      lines: def.scene.lines.filter((part) => keep(part as Record<string, unknown>)), arrows: def.scene.arrows.filter((part) => keep(part as Record<string, unknown>)), cages: def.scene.cages.filter((part) => keep(part as Record<string, unknown>)),
      underlays: def.scene.underlays.filter((part) => keep(part as Record<string, unknown>)), overlays: def.scene.overlays.filter((part) => keep(part as Record<string, unknown>)),
    },
    logic: { ...(def.logic ?? {}), constraints: (def.logic?.constraints ?? []).filter((constraint) => constraint.id !== targetId) },
  };
}

export function duplicateCreatorObject(def: PuzzleDefinition, targetId: string): { def: PuzzleDefinition; objectId?: string } {
  if (!def.scene || targetId === "creator-background") return { def };
  const constraint = creatorConstraints(def).find((entry) => entry.id === targetId);
  const nextId = id(constraint ? (constraint.type || "constraint") : "cosmetic");
  const scene = { ...def.scene };
  for (const [collection, parts] of sceneCollections(def)) {
    const copies = parts.filter((part) => {
      const record = part as Record<string, unknown>;
      return creatorPartConstraint(record) === targetId || objectId(record) === targetId;
    }).map((part) => {
      const copy = clone(part) as Record<string, unknown>;
      if (constraint) copy[TAG_CONSTRAINT] = nextId;
      else copy[CREATOR_OBJECT_ID] = nextId;
      if (typeof copy[CREATOR_OBJECT_NAME] === "string") copy[CREATOR_OBJECT_NAME] = `${copy[CREATOR_OBJECT_NAME]} copy`;
      return copy;
    });
    (scene as unknown as Record<string, unknown>)[collection] = [...parts, ...copies];
  }
  const logic = constraint ? { ...(def.logic ?? {}), constraints: [...(def.logic?.constraints ?? []), { ...clone(constraint), id: nextId, ...(typeof constraint[CREATOR_OBJECT_NAME] === "string" ? { [CREATOR_OBJECT_NAME]: `${constraint[CREATOR_OBJECT_NAME]} copy` } : {}) }] } : def.logic;
  return { def: { ...def, scene, logic }, objectId: nextId };
}

function moveParts(parts: VisualPart[], targetId: string, direction: -1 | 1): VisualPart[] {
  const belongs = (part: VisualPart) => creatorPartConstraint(part as Record<string, unknown>) === targetId || objectId(part as Record<string, unknown>) === targetId;
  const indices = parts.map((part, index) => belongs(part) ? index : -1).filter((index) => index >= 0);
  if (!indices.length) return parts;
  const first = indices[0], last = indices[indices.length - 1];
  if ((direction < 0 && first === 0) || (direction > 0 && last === parts.length - 1)) return parts;
  const group = parts.filter(belongs), rest = parts.filter((part) => !belongs(part));
  const neighborOriginal = direction < 0 ? first - 1 : last + 1;
  const neighbor = parts[neighborOriginal];
  const neighborRestIndex = rest.indexOf(neighbor);
  const insertAt = direction < 0 ? neighborRestIndex : neighborRestIndex + 1;
  return [...rest.slice(0, insertAt), ...group, ...rest.slice(insertAt)];
}

export function moveCreatorObject(def: PuzzleDefinition, targetId: string, direction: -1 | 1): PuzzleDefinition {
  if (!def.scene || targetId === "creator-background") return def;
  return { ...def, scene: {
    ...def.scene,
    lines: moveParts(def.scene.lines, targetId, direction) as SudokuPadSourceLine[], arrows: moveParts(def.scene.arrows, targetId, direction) as SudokuPadSourceArrow[], cages: moveParts(def.scene.cages, targetId, direction) as SudokuPadSourceCage[],
    underlays: moveParts(def.scene.underlays, targetId, direction) as SudokuPadSourceGraphic[], overlays: moveParts(def.scene.overlays, targetId, direction) as SudokuPadSourceGraphic[],
  } };
}

export function setCreatorObjectGraphicLayer(def: PuzzleDefinition, targetId: string, layer: "underlay" | "overlay"): PuzzleDefinition {
  if (!def.scene || targetId === "creator-background") return def;
  const matches = (part: SudokuPadSourceGraphic) => creatorPartConstraint(part as Record<string, unknown>) === targetId || objectId(part as Record<string, unknown>) === targetId;
  const under = def.scene.underlays.filter(matches), over = def.scene.overlays.filter(matches);
  const moved = [...under, ...over].map((part) => ({ ...part, target: layer }));
  return { ...def, scene: {
    ...def.scene,
    underlays: layer === "underlay" ? [...def.scene.underlays.filter((part) => !matches(part)), ...moved] : def.scene.underlays.filter((part) => !matches(part)),
    overlays: layer === "overlay" ? [...def.scene.overlays.filter((part) => !matches(part)), ...moved] : def.scene.overlays.filter((part) => !matches(part)),
  } };
}
