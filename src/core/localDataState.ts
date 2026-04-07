import { notifyCloudSyncNeeded } from "./syncSignal";

export const SYNCED_LOCAL_STORAGE_KEYS = [
  "sphenpad-theme-v1",
  "sphenpad-main-menu-filters-v1",
  "sphenpad-folder-menu-filters-v1",
  "sphenpad-archive-filters-v1",
] as const;

const LOCAL_SYNC_META_KEY = "sphenpad-sync-meta-v1";

export type SyncedLocalStorageKey = (typeof SYNCED_LOCAL_STORAGE_KEYS)[number];

function writeSyncMeta(updatedAt: number) {
  localStorage.setItem(LOCAL_SYNC_META_KEY, JSON.stringify({ updatedAt }));
}

export function readLocalDataUpdatedAt(): number {
  try {
    const raw = localStorage.getItem(LOCAL_SYNC_META_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    return typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0;
  } catch {
    return 0;
  }
}

export function markLocalDataChanged(updatedAt = Date.now(), notify = true) {
  writeSyncMeta(updatedAt);
  if (notify) notifyCloudSyncNeeded();
  return updatedAt;
}

export function readSyncedLocalStorage(): Partial<Record<SyncedLocalStorageKey, string>> {
  const snapshot: Partial<Record<SyncedLocalStorageKey, string>> = {};
  for (const key of SYNCED_LOCAL_STORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (typeof value === "string") snapshot[key] = value;
  }
  return snapshot;
}

export function setSyncedLocalStorageItem(key: SyncedLocalStorageKey, value: string, notify = true) {
  localStorage.setItem(key, value);
  markLocalDataChanged(Date.now(), notify);
}

export function removeSyncedLocalStorageItem(key: SyncedLocalStorageKey, notify = true) {
  localStorage.removeItem(key);
  markLocalDataChanged(Date.now(), notify);
}

export function applySyncedLocalStorage(
  snapshot: Partial<Record<SyncedLocalStorageKey, string>>,
  updatedAt: number,
  notify = false,
) {
  for (const key of SYNCED_LOCAL_STORAGE_KEYS) {
    const nextValue = snapshot[key];
    if (typeof nextValue === "string") localStorage.setItem(key, nextValue);
    else localStorage.removeItem(key);
  }
  markLocalDataChanged(updatedAt, notify);
}
