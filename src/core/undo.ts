/* eslint-disable @typescript-eslint/no-explicit-any */

export type Patch = { path: (string | number)[]; prev: unknown; next: unknown };

// Minimal structural patcher for our state tree (fast enough for MVP).
export function applyPatch<T extends object>(obj: T, p: Patch): T {
  const clone: any = structuredClone(obj);
  let cur: any = clone;
  for (let i = 0; i < p.path.length - 1; i++) cur = cur[p.path[i] as any];
  cur[p.path[p.path.length - 1] as any] = p.next;
  return clone;
}

/** Copy only the patched path. Unchanged progress cells keep their identity,
 * avoiding full SVG redraws when changing tool, selection or timer state. */
export function applyPatchShared<T extends object>(obj: T, patch: Patch): T {
  if (!patch.path.length) return obj;
  const clone = (value: unknown): any => Array.isArray(value) ? [...value] : { ...(value as object) };
  const root = clone(obj);
  let source: any = obj, target: any = root;
  for (let i = 0; i < patch.path.length - 1; i++) {
    const key = patch.path[i];
    const child = source[key];
    target[key] = clone(child);
    source = child; target = target[key];
  }
  target[patch.path[patch.path.length - 1]] = patch.next;
  return root as T;
}

export function invertPatch(p: Patch): Patch {
  return { path: p.path, prev: p.next, next: p.prev };
}

export function patchAt<T extends object>(obj: T, path: Patch["path"], next: unknown): Patch {
  let cur: any = obj;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i] as any];
  const key = path[path.length - 1] as any;
  return { path, prev: cur[key], next };
}