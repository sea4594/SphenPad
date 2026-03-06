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

export function invertPatch(p: Patch): Patch {
  return { path: p.path, prev: p.next, next: p.prev };
}

export function patchAt<T extends object>(obj: T, path: Patch["path"], next: unknown): Patch {
  let cur: any = obj;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i] as any];
  const key = path[path.length - 1] as any;
  return { path, prev: cur[key], next };
}