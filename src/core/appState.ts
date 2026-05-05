import {
  applySyncedLocalStorage,
  markLocalDataChanged,
  readLocalDataUpdatedAt,
  readSyncedLocalStorage,
  type SyncedLocalStorageKey,
} from "./localDataState";
import type { PersistedPuzzle } from "./model";
import { exportStorageSnapshot, importStorageSnapshot, readStorageCounts, type PuzzleFolder } from "./storage";

const APP_SNAPSHOT_IMPORTED_EVENT = "sphenpad:app-snapshot-imported";

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

export type LocalAppSnapshotMetadata = {
  updatedAt: number;
  puzzleCount: number;
  folderCount: number;
  localStorageCount: number;
  hasData: boolean;
};

function folderNameTimestamp(folder: PuzzleFolder): number {
  return folder.nameUpdatedAt ?? folder.updatedAt ?? 0;
}

function folderParentTimestamp(folder: PuzzleFolder): number {
  return folder.parentUpdatedAt ?? folder.updatedAt ?? 0;
}

function folderMembershipTimestamp(folder: PuzzleFolder): number {
  return folder.membershipUpdatedAt ?? folder.updatedAt ?? 0;
}

function folderDeletedTimestamp(folder: PuzzleFolder): number {
  return folder.deletedAt ?? 0;
}

export async function exportLocalAppSnapshotMetadata(): Promise<LocalAppSnapshotMetadata> {
  const [counts, localStorage] = await Promise.all([readStorageCounts(), Promise.resolve(readSyncedLocalStorage())]);
  const localStorageCount = Object.keys(localStorage).length;
  const updatedAt = readLocalDataUpdatedAt();
  const hasData = updatedAt > 0 || counts.puzzleCount > 0 || counts.folderCount > 0 || localStorageCount > 0;

  return {
    updatedAt,
    puzzleCount: counts.puzzleCount,
    folderCount: counts.folderCount,
    localStorageCount,
    hasData,
  };
}

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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(APP_SNAPSHOT_IMPORTED_EVENT));
  }
}

export function onLocalAppSnapshotImported(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(APP_SNAPSHOT_IMPORTED_EVENT, listener);
  return () => window.removeEventListener(APP_SNAPSHOT_IMPORTED_EVENT, listener);
}

export function hasLocalAppSnapshotData(snapshot: LocalAppSnapshot): boolean {
  return snapshot.puzzles.length > 0 || snapshot.folders.length > 0 || Object.keys(snapshot.localStorage).length > 0;
}

/**
 * Merges two snapshots without discarding data from either side.
 * - Puzzles: union; when both sides have the same key the one with the newer updatedAt wins.
 * - Folders: per-field merge with tombstones; deletes dominate older edits.
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
    if (!existing) {
      folderMap.set(folder.id, folder);
      continue;
    }

    const localDeleteAt = folderDeletedTimestamp(folder);
    const cloudDeleteAt = folderDeletedTimestamp(existing);
    const deletedAt = Math.max(localDeleteAt, cloudDeleteAt) || undefined;

    const localNameAt = folderNameTimestamp(folder);
    const cloudNameAt = folderNameTimestamp(existing);
    const localParentAt = folderParentTimestamp(folder);
    const cloudParentAt = folderParentTimestamp(existing);
    const localMembershipAt = folderMembershipTimestamp(folder);
    const cloudMembershipAt = folderMembershipTimestamp(existing);

    const name = localNameAt >= cloudNameAt ? folder.name : existing.name;
    const parentId = localParentAt >= cloudParentAt ? folder.parentId : existing.parentId;

    let puzzleKeys: string[];
    if (localMembershipAt > cloudMembershipAt) puzzleKeys = [...folder.puzzleKeys];
    else if (cloudMembershipAt > localMembershipAt) puzzleKeys = [...existing.puzzleKeys];
    else {
      const mergedPuzzleKeys = [...existing.puzzleKeys];
      const mergedPuzzleKeySet = new Set(mergedPuzzleKeys);
      for (const key of folder.puzzleKeys) {
        if (mergedPuzzleKeySet.has(key)) continue;
        mergedPuzzleKeySet.add(key);
        mergedPuzzleKeys.push(key);
      }
      puzzleKeys = mergedPuzzleKeys;
    }

    if (deletedAt) {
      const newestMutation = Math.max(localNameAt, cloudNameAt, localParentAt, cloudParentAt, localMembershipAt, cloudMembershipAt);
      if (deletedAt >= newestMutation) {
        puzzleKeys = [];
      }
    }

    folderMap.set(folder.id, {
      ...(folder.updatedAt >= existing.updatedAt ? folder : existing),
      name,
      parentId,
      puzzleKeys,
      nameUpdatedAt: Math.max(localNameAt, cloudNameAt),
      parentUpdatedAt: Math.max(localParentAt, cloudParentAt),
      membershipUpdatedAt: Math.max(localMembershipAt, cloudMembershipAt),
      deletedAt,
      createdAt: Math.min(folder.createdAt ?? existing.createdAt, existing.createdAt ?? folder.createdAt),
      updatedAt: Math.max(folder.updatedAt ?? 0, existing.updatedAt ?? 0),
    });
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
