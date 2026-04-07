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
