import {
  applySyncedLocalStorage,
  markLocalDataChanged,
  readLocalDataUpdatedAt,
  readSyncedLocalStorage,
  type SyncedLocalStorageKey,
} from "./localDataState";
import type { PersistedPuzzle } from "./model";
import { exportStorageSnapshot, importStorageSnapshot, type PuzzleFolder } from "./storage";

export type PuzzleSnapshotRow = {
  key: string;
  data: PersistedPuzzle;
};

export type LocalAppSnapshot = {
  version: 1;
  updatedAt: number;
  localStorage: Partial<Record<SyncedLocalStorageKey, string>>;
  folders: PuzzleFolder[];
  puzzles: PuzzleSnapshotRow[];
};

export async function exportLocalAppSnapshot(): Promise<LocalAppSnapshot> {
  const storageSnapshot = await exportStorageSnapshot();
  const updatedAt = Math.max(
    readLocalDataUpdatedAt(),
    ...storageSnapshot.puzzles.map((row) => row.data.updatedAt || 0),
    ...storageSnapshot.folders.map((folder) => folder.updatedAt || 0),
  );

  return {
    version: 1,
    updatedAt,
    localStorage: readSyncedLocalStorage(),
    folders: storageSnapshot.folders,
    puzzles: storageSnapshot.puzzles,
  };
}

export async function importLocalAppSnapshot(snapshot: LocalAppSnapshot, notify = false) {
  applySyncedLocalStorage(snapshot.localStorage, snapshot.updatedAt, false);
  await importStorageSnapshot({ puzzles: snapshot.puzzles, folders: snapshot.folders }, false, snapshot.updatedAt);
  markLocalDataChanged(snapshot.updatedAt, notify);
}

export function hasLocalAppSnapshotData(snapshot: LocalAppSnapshot): boolean {
  return snapshot.puzzles.length > 0 || snapshot.folders.length > 0 || Object.keys(snapshot.localStorage).length > 0;
}

/**
 * Merges two snapshots without discarding data from either side.
 * - Puzzles: union; when both sides have the same key the one with the newer updatedAt wins.
 * - Folders: union; when both sides have the same id the one with the newer updatedAt wins.
 * - Settings (localStorage): taken from whichever snapshot has the more recent overall updatedAt.
 */
export function mergeSnapshots(local: LocalAppSnapshot, cloud: LocalAppSnapshot): LocalAppSnapshot {
  const puzzleMap = new Map<string, PuzzleSnapshotRow>();
  for (const row of cloud.puzzles) puzzleMap.set(row.key, row);
  for (const row of local.puzzles) {
    const existing = puzzleMap.get(row.key);
    const localTime = row.data.updatedAt ?? 0;
    const cloudTime = existing?.data.updatedAt ?? 0;
    if (!existing || localTime >= cloudTime) puzzleMap.set(row.key, row);
  }

  const folderMap = new Map<string, PuzzleFolder>();
  for (const folder of cloud.folders) folderMap.set(folder.id, folder);
  for (const folder of local.folders) {
    const existing = folderMap.get(folder.id);
    if (!existing || folder.updatedAt >= existing.updatedAt) folderMap.set(folder.id, folder);
  }

  const useLocalSettings = local.updatedAt >= cloud.updatedAt;
  return {
    version: 1,
    updatedAt: Math.max(local.updatedAt, cloud.updatedAt),
    localStorage: useLocalSettings ? local.localStorage : cloud.localStorage,
    folders: Array.from(folderMap.values()),
    puzzles: Array.from(puzzleMap.values()),
  };
}
