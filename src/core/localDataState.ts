import { notifyCloudSyncNeeded } from "./syncSignal";

export const SYNCED_LOCAL_STORAGE_KEYS = [
  "sphenpad-theme-v1",
  "sphenpad-main-menu-filters-v1",
  "sphenpad-folder-menu-filters-v1",
  "sphenpad-folders-page-menu-filters-v1",
  "sphenpad-archive-filters-v1",
] as const;

const LOCAL_SYNC_META_KEY = "sphenpad-sync-meta-v1";
const LOCAL_DATA_APPLIED_EVENT = "sphenpad:local-data-applied";

export type SyncedLocalStorageKey = (typeof SYNCED_LOCAL_STORAGE_KEYS)[number];

type SyncMeta = { updatedAt: number; ownerId?: string };

function readRawSyncMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(LOCAL_SYNC_META_KEY);
    if (!raw) return { updatedAt: 0 };
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    return {
      updatedAt: typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
      ownerId: typeof parsed.ownerId === "string" ? parsed.ownerId : undefined,
    };
  } catch {
    return { updatedAt: 0 };
  }
}

function writeSyncMeta(update: Partial<SyncMeta>) {
  const current = readRawSyncMeta();
  localStorage.setItem(LOCAL_SYNC_META_KEY, JSON.stringify({ ...current, ...update }));
}

export function readLocalDataUpdatedAt(): number {
  return readRawSyncMeta().updatedAt;
}

/** Returns the uid of the Google account that last synced to/from this device's local data, or null if the data has never been linked to an account. */
export function getLocalDataOwnerId(): string | null {
  return readRawSyncMeta().ownerId ?? null;
}

/** Records that the local data now belongs to the given account (or clears ownership when null). */
export function setLocalDataOwnerId(uid: string | null) {
  writeSyncMeta({ ownerId: uid === null ? undefined : uid });
}

export function markLocalDataChanged(updatedAt = Date.now(), notify = true) {
  writeSyncMeta({ updatedAt });
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
  const previous = localStorage.getItem(key);
  if (previous === value) return;
  localStorage.setItem(key, value);
  markLocalDataChanged(Date.now(), notify);
}

export function removeSyncedLocalStorageItem(key: SyncedLocalStorageKey, notify = true) {
  if (localStorage.getItem(key) === null) return;
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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LOCAL_DATA_APPLIED_EVENT));
  }
}

export function onSyncedLocalDataApplied(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(LOCAL_DATA_APPLIED_EVENT, listener);
  return () => window.removeEventListener(LOCAL_DATA_APPLIED_EVENT, listener);
}
