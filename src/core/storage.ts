import Dexie from "dexie";
import type { Table } from "dexie";
import type { PersistedPuzzle } from "./model";

export type PuzzleFolder = {
  id: string;
  parentId: string | null;
  name: string;
  puzzleKeys: string[];
  createdAt: number;
  updatedAt: number;
};

function makeFolderId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `folder-${crypto.randomUUID()}`;
  }
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

class SphenDB extends Dexie {
  puzzles!: Table<{ key: string; data: PersistedPuzzle }, string>;
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

export async function upsertPuzzle(key: string, data: PersistedPuzzle) {
  await db.puzzles.put({ key, data });
}

export async function getPuzzle(key: string) {
  return (await db.puzzles.get(key))?.data ?? null;
}

export async function listPuzzles() {
  const rows = await db.puzzles.toArray();
  return rows
    .map((r) => ({ key: r.key, ...r.data }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listCompletedPuzzleKeys() {
  const keys: string[] = [];
  await db.puzzles.each((row) => {
    if (row.data.progress?.status === "complete") keys.push(row.key);
  });
  return keys;
}

export async function listFolders() {
  return db.folders.toArray();
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
  return folder;
}

export async function addPuzzleToFolder(folderId: string, puzzleKey: string) {
  await db.transaction("rw", db.folders, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder) throw new Error("Folder not found.");
    if (folder.puzzleKeys.includes(puzzleKey)) return;
    await db.folders.put({
      ...folder,
      puzzleKeys: [...folder.puzzleKeys, puzzleKey],
      updatedAt: Date.now(),
    });
  });
}

export async function removePuzzleFromFolder(folderId: string, puzzleKey: string) {
  await db.transaction("rw", db.folders, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder) throw new Error("Folder not found.");
    if (!folder.puzzleKeys.includes(puzzleKey)) return;
    await db.folders.put({
      ...folder,
      puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== puzzleKey),
      updatedAt: Date.now(),
    });
  });
}

export async function renameFolder(folderId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required.");

  await db.transaction("rw", db.folders, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder) throw new Error("Folder not found.");
    await db.folders.put({
      ...folder,
      name: trimmed,
      updatedAt: Date.now(),
    });
  });
}

export async function deleteFolder(folderId: string) {
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
}

export async function deletePuzzle(key: string) {
  await db.transaction("rw", db.puzzles, db.folders, async () => {
    await db.puzzles.delete(key);

    const folders = await db.folders.toArray();
    const now = Date.now();
    for (const folder of folders) {
      if (!folder.puzzleKeys.includes(key)) continue;
      await db.folders.put({
        ...folder,
        puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== key),
        updatedAt: now,
      });
    }
  });
}
