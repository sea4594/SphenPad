import Dexie from "dexie";
import type { Table } from "dexie";
import { markLocalDataChanged } from "./localDataState";
import type { PersistedPuzzle } from "./model";

export type PuzzleFolder = {
  id: string;
  parentId: string | null;
  name: string;
  puzzleKeys: string[];
  createdAt: number;
  updatedAt: number;
};

export type PuzzleSnapshotRow = { key: string; data: PersistedPuzzle };
export type StoredPuzzleRow = { key: string } & PersistedPuzzle;

let puzzlesListCache: StoredPuzzleRow[] | null = null;
let foldersListCache: PuzzleFolder[] | null = null;

function makeFolderId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `folder-${crypto.randomUUID()}`;
  }
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function signalStorageMutation(notify = true, updatedAt = Date.now()) {
  puzzlesListCache = null;
  foldersListCache = null;
  markLocalDataChanged(updatedAt, notify);
}

class SphenDB extends Dexie {
  puzzles!: Table<PuzzleSnapshotRow, string>;
  folders!: Table<PuzzleFolder, string>;
  constructor() {
    super("sphenpad");
    this.version(1).stores({
      puzzles: "key",
    });
    this.version(2).stores({
      puzzles: "key",
      folders: "id,parentId,updatedAt,name",
    });
  }
}
export const db = new SphenDB();

export async function exportStorageSnapshot() {
  const [puzzles, folders] = await Promise.all([db.puzzles.toArray(), db.folders.toArray()]);
  return { puzzles, folders };
}

export async function readStorageCounts() {
  const [puzzleCount, folderCount] = await Promise.all([db.puzzles.count(), db.folders.count()]);
  return { puzzleCount, folderCount };
}

export async function importStorageSnapshot(
  snapshot: { puzzles: PuzzleSnapshotRow[]; folders: PuzzleFolder[] },
  notify = true,
  updatedAt = Date.now(),
) {
  await db.transaction("rw", db.puzzles, db.folders, async () => {
    if (snapshot.puzzles.length) await db.puzzles.bulkPut(snapshot.puzzles);
    if (snapshot.folders.length) await db.folders.bulkPut(snapshot.folders);

    const [currentPuzzleKeys, currentFolderIds] = await Promise.all([
      db.puzzles.toCollection().primaryKeys() as Promise<string[]>,
      db.folders.toCollection().primaryKeys() as Promise<string[]>,
    ]);

    const nextPuzzleKeys = new Set(snapshot.puzzles.map((row) => row.key));
    const nextFolderIds = new Set(snapshot.folders.map((folder) => folder.id));
    const puzzleKeysToDelete = currentPuzzleKeys.filter((key) => !nextPuzzleKeys.has(key));
    const folderIdsToDelete = currentFolderIds.filter((id) => !nextFolderIds.has(id));

    if (puzzleKeysToDelete.length) await db.puzzles.bulkDelete(puzzleKeysToDelete);
    if (folderIdsToDelete.length) await db.folders.bulkDelete(folderIdsToDelete);
  });

  signalStorageMutation(notify, updatedAt);
  puzzlesListCache = snapshot.puzzles
    .map((r) => ({ key: r.key, ...r.data }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  foldersListCache = [...snapshot.folders];
}

export async function upsertPuzzle(key: string, data: PersistedPuzzle) {
  await db.puzzles.put({ key, data });
  signalStorageMutation(true, data.updatedAt || Date.now());
}

export async function getPuzzle(key: string) {
  return (await db.puzzles.get(key))?.data ?? null;
}

export async function listPuzzles(): Promise<StoredPuzzleRow[]> {
  if (puzzlesListCache) return puzzlesListCache;
  const rows = await db.puzzles.toArray();
  const list: StoredPuzzleRow[] = rows
    .map((r) => ({ key: r.key, ...r.data }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  puzzlesListCache = list;
  return list;
}

export async function listCompletedPuzzleKeys() {
  const keys: string[] = [];
  await db.puzzles.each((row) => {
    if (row.data.progress?.status === "complete") keys.push(row.key);
  });
  return keys;
}

export async function listFolders() {
  if (foldersListCache) return foldersListCache;
  const list = await db.folders.toArray();
  foldersListCache = list;
  return list;
}

export async function createFolder(name: string, parentId: string | null = null) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required.");

  if (parentId) {
    const parent = await db.folders.get(parentId);
    if (!parent) throw new Error("Parent folder not found.");
  }

  const now = Date.now();
  const folder: PuzzleFolder = {
    id: makeFolderId(),
    parentId,
    name: trimmed,
    puzzleKeys: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.folders.add(folder);
  signalStorageMutation(true, folder.updatedAt);
  return folder;
}

export async function addPuzzleToFolder(folderId: string, puzzleKey: string) {
  let updatedAt = Date.now();
  await db.transaction("rw", db.folders, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder) throw new Error("Folder not found.");
    if (folder.puzzleKeys.includes(puzzleKey)) return;
    updatedAt = Date.now();
    await db.folders.put({
      ...folder,
      puzzleKeys: [...folder.puzzleKeys, puzzleKey],
      updatedAt,
    });
  });
  signalStorageMutation(true, updatedAt);
}

export async function removePuzzleFromFolder(folderId: string, puzzleKey: string) {
  let updatedAt = Date.now();
  await db.transaction("rw", db.folders, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder) throw new Error("Folder not found.");
    if (!folder.puzzleKeys.includes(puzzleKey)) return;
    updatedAt = Date.now();
    await db.folders.put({
      ...folder,
      puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== puzzleKey),
      updatedAt,
    });
  });
  signalStorageMutation(true, updatedAt);
}

export async function renameFolder(folderId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required.");

  let updatedAt = Date.now();
  await db.transaction("rw", db.folders, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder) throw new Error("Folder not found.");
    updatedAt = Date.now();
    await db.folders.put({
      ...folder,
      name: trimmed,
      updatedAt,
    });
  });
  signalStorageMutation(true, updatedAt);
}

export async function deleteFolder(folderId: string) {
  const updatedAt = Date.now();
  await db.transaction("rw", db.folders, async () => {
    const folders = await db.folders.toArray();
    if (!folders.some((folder) => folder.id === folderId)) {
      throw new Error("Folder not found.");
    }

    const byParent = new Map<string | null, PuzzleFolder[]>();
    for (const folder of folders) {
      const parentKey = folder.parentId ?? null;
      const current = byParent.get(parentKey) ?? [];
      current.push(folder);
      byParent.set(parentKey, current);
    }

    const toDelete = new Set<string>();
    const stack = [folderId];
    while (stack.length) {
      const currentId = stack.pop();
      if (!currentId || toDelete.has(currentId)) continue;
      toDelete.add(currentId);
      const children = byParent.get(currentId) ?? [];
      for (const child of children) stack.push(child.id);
    }

    await db.folders.bulkDelete(Array.from(toDelete));
  });
  signalStorageMutation(true, updatedAt);
}

export async function deletePuzzle(key: string) {
  const updatedAt = Date.now();
  await db.transaction("rw", db.puzzles, db.folders, async () => {
    await db.puzzles.delete(key);

    const folders = await db.folders.toArray();
    for (const folder of folders) {
      if (!folder.puzzleKeys.includes(key)) continue;
      await db.folders.put({
        ...folder,
        puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== key),
        updatedAt,
      });
    }
  });
  signalStorageMutation(true, updatedAt);
}
