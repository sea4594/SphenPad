import Dexie from "dexie";
import type { Table } from "dexie";
import { markLocalDataChanged } from "./localDataState";
import type { PersistedPuzzle } from "./model";
import { creatorProjectFromDefinition, definitionFromCreatorProject, parseCreatorProject, type CreatorProject } from "../sudokupad/creator/project";
import { cloneCreatorProjectForDuplicate, compareCreatorProjectStorageRows, normalizeCreatorProjectStorageRow, type CreatorProjectStorageRow } from "../sudokupad/creator/projectStorage";
import { definitionForPersistence } from "../sudokupad/migration/puzzleDefinition";
import { rebaseCreatorSolveState } from "../sudokupad/creator/playtest";
import { rehydrateImportedSudokuPadDefinition } from "../sudokupad/app/coreAdapter";

export type PuzzleFolder = {
  id: string;
  parentId: string | null;
  name: string;
  puzzleKeys: string[];
  createdAt: number;
  updatedAt: number;
  nameUpdatedAt?: number;
  parentUpdatedAt?: number;
  membershipUpdatedAt?: number;
  deletedAt?: number;
};

export type PuzzleSnapshotRow = { key: string; data: PersistedPuzzle };
export type StoredPuzzleRow = { key: string } & PersistedPuzzle;
export type { CreatorProjectStorageRow } from "../sudokupad/creator/projectStorage";

let puzzlesListCache: StoredPuzzleRow[] | null = null;
let foldersListCache: PuzzleFolder[] | null = null;
let creatorProjectsListCache: CreatorProjectStorageRow[] | null = null;

function makeFolderId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `folder-${crypto.randomUUID()}`;
  }
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}


function forPersistence(data: PersistedPuzzle): PersistedPuzzle {
  return { ...data, def: definitionForPersistence(data.def) };
}

async function hydratePersistedPuzzle(data: PersistedPuzzle): Promise<PersistedPuzzle> {
  try {
    const def = await rehydrateImportedSudokuPadDefinition(data.def);
    return def === data.def ? data : { ...data, def };
  } catch (error) {
    console.warn("Failed to rehydrate imported SudokuPad scene; keeping stored definition", error);
    return data;
  }
}

function signalStorageMutation(notify = true, updatedAt = Date.now()) {
  puzzlesListCache = null;
  foldersListCache = null;
  creatorProjectsListCache = null;
  markLocalDataChanged(updatedAt, notify);
}

class SphenDB extends Dexie {
  puzzles!: Table<PuzzleSnapshotRow, string>;
  folders!: Table<PuzzleFolder, string>;
  creatorProjects!: Table<CreatorProjectStorageRow, string>;
  constructor() {
    super("sphenpad");
    this.version(1).stores({
      puzzles: "key",
    });
    this.version(2).stores({
      puzzles: "key",
      folders: "id,parentId,updatedAt,name",
    });
    this.version(3).stores({
      puzzles: "key",
      folders: "id,parentId,updatedAt,name",
      creatorProjects: "key,updatedAt,lastOpenedAt,createdAt",
    });
  }
}
export const db = new SphenDB();

export async function exportStorageSnapshot() {
  await migrateLegacyCreatorProjects();
  const [puzzles, folders, creatorProjects] = await Promise.all([db.puzzles.toArray(), db.folders.toArray(), db.creatorProjects.toArray()]);
  return { puzzles, folders, creatorProjects };
}

export async function readStorageCounts() {
  await migrateLegacyCreatorProjects();
  const [puzzleCount, folders, creatorProjects] = await Promise.all([db.puzzles.count(), db.folders.toArray(), db.creatorProjects.toArray()]);
  const creatorProjectCount = creatorProjects.filter((row) => !row.deletedAt).length;
  const folderCount = folders.filter((folder) => !folder.deletedAt).length;
  return { puzzleCount, folderCount, creatorProjectCount };
}

export async function importStorageSnapshot(
  snapshot: { puzzles: PuzzleSnapshotRow[]; folders: PuzzleFolder[]; creatorProjects?: CreatorProjectStorageRow[] },
  notify = true,
  updatedAt = Date.now(),
) {
  const incomingCreatorProjects = snapshot.creatorProjects ?? [];
  await db.transaction("rw", db.puzzles, db.folders, db.creatorProjects, async () => {
    if (snapshot.puzzles.length) await db.puzzles.bulkPut(snapshot.puzzles.map((row) => ({ ...row, data: forPersistence(row.data) })));
    if (snapshot.folders.length) await db.folders.bulkPut(snapshot.folders);
    if (incomingCreatorProjects.length) await db.creatorProjects.bulkPut(incomingCreatorProjects.map(normalizeCreatorProjectStorageRow));

    const [currentPuzzleKeys, currentFolderIds, currentCreatorProjectKeys] = await Promise.all([
      db.puzzles.toCollection().primaryKeys() as Promise<string[]>,
      db.folders.toCollection().primaryKeys() as Promise<string[]>,
      db.creatorProjects.toCollection().primaryKeys() as Promise<string[]>,
    ]);

    const deletedCreatorProjectKeys = new Set(incomingCreatorProjects.filter((row) => row.deletedAt).map((row) => row.key));
    const nextPuzzleKeys = new Set(snapshot.puzzles.map((row) => row.key).filter((key) => !deletedCreatorProjectKeys.has(key)));
    const nextFolderIds = new Set(snapshot.folders.map((folder) => folder.id));
    const nextCreatorProjectKeys = new Set(incomingCreatorProjects.map((row) => row.key));
    const puzzleKeysToDelete = Array.from(new Set([...currentPuzzleKeys.filter((key) => !nextPuzzleKeys.has(key)), ...deletedCreatorProjectKeys]));
    const folderIdsToDelete = currentFolderIds.filter((id) => !nextFolderIds.has(id));
    const creatorProjectKeysToDelete = currentCreatorProjectKeys.filter((key) => !nextCreatorProjectKeys.has(key));

    if (puzzleKeysToDelete.length) await db.puzzles.bulkDelete(puzzleKeysToDelete);
    if (folderIdsToDelete.length) await db.folders.bulkDelete(folderIdsToDelete);
    if (creatorProjectKeysToDelete.length) await db.creatorProjects.bulkDelete(creatorProjectKeysToDelete);
  });

  signalStorageMutation(notify, updatedAt);
  const deletedCreatorProjectKeys = new Set(incomingCreatorProjects.filter((row) => row.deletedAt).map((row) => row.key));
  puzzlesListCache = (await Promise.all(snapshot.puzzles.filter((row) => !deletedCreatorProjectKeys.has(row.key)).map(async (r) => ({ key: r.key, ...(await hydratePersistedPuzzle(r.data)) }))))
    .filter((row) => !row.def.meta.creatorPuzzle || row.def.meta.creatorPublished === true)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  foldersListCache = snapshot.folders.filter((folder) => !folder.deletedAt);
  creatorProjectsListCache = incomingCreatorProjects.map(normalizeCreatorProjectStorageRow).filter((row) => !row.deletedAt).sort(compareCreatorProjectStorageRows);
}


function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T;
}

function creatorPuzzleData(project: CreatorProject, existing: PersistedPuzzle | null, createdAt: number, updatedAt: number): PersistedPuzzle {
  const def = definitionFromCreatorProject(project, { id: project.projectId, sourceId: project.sourceId });
  const rebased = rebaseCreatorSolveState(existing, def);
  return {
    def,
    progress: rebased.progress,
    undo: rebased.preserveHistory ? existing?.undo ?? [] : [],
    redo: rebased.preserveHistory ? existing?.redo ?? [] : [],
    createdAt: existing?.createdAt ?? createdAt,
    updatedAt,
  };
}

async function migrateLegacyCreatorProjects() {
  const creatorRows = await db.puzzles.filter((row) => Boolean(row.data.def.meta.creatorPuzzle)).toArray();
  if (!creatorRows.length) return;
  const existingKeys = new Set(await db.creatorProjects.toCollection().primaryKeys() as string[]);
  const missing = creatorRows.filter((row) => !existingKeys.has(row.key));
  if (!missing.length) return;
  const migrated: CreatorProjectStorageRow[] = [];
  for (const row of missing) {
    try {
      const project = creatorProjectFromDefinition(row.data.def);
      const createdAt = row.data.createdAt ?? row.data.updatedAt ?? Date.now();
      const updatedAt = row.data.updatedAt ?? createdAt;
      migrated.push({ key: row.key, project, createdAt, updatedAt, savedAt: updatedAt, lastOpenedAt: 0 });
    } catch (error) {
      console.warn(`Failed to migrate creator project ${row.key}`, error);
    }
  }
  if (!migrated.length) return;
  await db.creatorProjects.bulkPut(migrated);
  signalStorageMutation(true, Math.max(...migrated.map((row) => row.updatedAt)));
}

export function createCreatorProjectKey() {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `creator-${suffix}`;
}

export async function createCreatorProject(projectInput: CreatorProject, now = Date.now()) {
  const project = parseCreatorProject(projectInput);
  const key = project.projectId;
  if (!key) throw new Error("Creator project is missing its project ID.");
  if (await db.creatorProjects.get(key)) throw new Error("Creator project already exists.");
  const row: CreatorProjectStorageRow = { key, project, createdAt: now, updatedAt: now, savedAt: now, lastOpenedAt: now };
  const existingPuzzle = (await db.puzzles.get(key))?.data ?? null;
  await db.transaction("rw", db.creatorProjects, db.puzzles, async () => {
    await db.creatorProjects.add(row);
    await db.puzzles.put({ key, data: forPersistence(creatorPuzzleData(project, existingPuzzle, now, now)) });
  });
  signalStorageMutation(true, now);
  return row;
}

export async function saveCreatorProject(key: string, projectInput: CreatorProject, now = Date.now()) {
  const project = parseCreatorProject(projectInput);
  if (project.projectId !== key || project.sourceId !== key) {
    project.projectId = key;
    project.sourceId = key;
  }
  const existing = await db.creatorProjects.get(key);
  const createdAt = existing?.createdAt ?? now;
  const row: CreatorProjectStorageRow = {
    key,
    project,
    createdAt,
    updatedAt: now,
    savedAt: now,
    lastOpenedAt: existing?.lastOpenedAt ?? now,
  };
  const existingPuzzle = (await db.puzzles.get(key))?.data ?? null;
  await db.transaction("rw", db.creatorProjects, db.puzzles, async () => {
    await db.creatorProjects.put(row);
    await db.puzzles.put({ key, data: forPersistence(creatorPuzzleData(project, existingPuzzle, createdAt, now)) });
  });
  signalStorageMutation(true, now);
  return row;
}


export async function setCreatorProjectPublished(key: string, published: boolean, now = Date.now()) {
  const stored = await db.creatorProjects.get(key);
  if (!stored || stored.deletedAt) throw new Error("Creator project could not be found.");
  const project = parseCreatorProject(stored.project);
  project.settings.publishedToMyPuzzles = published;
  const row: CreatorProjectStorageRow = { ...stored, project, updatedAt: now, savedAt: now };
  const existingPuzzle = (await db.puzzles.get(key))?.data ?? null;
  await db.transaction("rw", db.creatorProjects, db.puzzles, db.folders, async () => {
    await db.creatorProjects.put(row);
    await db.puzzles.put({ key, data: forPersistence(creatorPuzzleData(project, existingPuzzle, row.createdAt, now)) });
    if (!published) {
      const folders = await db.folders.toArray();
      for (const folder of folders) {
        if (!folder.puzzleKeys.includes(key)) continue;
        await db.folders.put({ ...folder, puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== key), updatedAt: now, membershipUpdatedAt: now });
      }
    }
  });
  signalStorageMutation(true, now);
  return normalizeCreatorProjectStorageRow(row);
}

export async function getCreatorProject(key: string, touchOpen = true) {
  await migrateLegacyCreatorProjects();
  const stored = await db.creatorProjects.get(key);
  if (!stored) return null;
  const row = normalizeCreatorProjectStorageRow(stored);
  if (row.deletedAt) return null;
  if (!touchOpen) return row;
  const lastOpenedAt = Date.now();
  const next = { ...row, lastOpenedAt };
  await db.creatorProjects.put(next);
  signalStorageMutation(true, lastOpenedAt);
  return next;
}

export async function listCreatorProjects() {
  await migrateLegacyCreatorProjects();
  if (creatorProjectsListCache) return creatorProjectsListCache;
  const rows = (await db.creatorProjects.toArray()).map(normalizeCreatorProjectStorageRow).filter((row) => !row.deletedAt).sort(compareCreatorProjectStorageRows);
  creatorProjectsListCache = rows;
  return rows;
}

export async function renameCreatorProject(key: string, title: string) {
  const row = await getCreatorProject(key, false);
  if (!row) throw new Error("Creator project not found.");
  const project = clone(row.project);
  project.metadata.title = title.trim() || "Untitled puzzle";
  return saveCreatorProject(key, project);
}

export async function duplicateCreatorProject(key: string, newKey = createCreatorProjectKey()) {
  const row = await getCreatorProject(key, false);
  if (!row) throw new Error("Creator project not found.");
  return createCreatorProject(cloneCreatorProjectForDuplicate(row.project, newKey));
}

export async function deleteCreatorProject(key: string) {
  const updatedAt = Date.now();
  await db.transaction("rw", db.creatorProjects, db.puzzles, db.folders, async () => {
    const current = await db.creatorProjects.get(key);
    if (!current || current.deletedAt) throw new Error("Creator project not found.");
    await db.creatorProjects.put({ ...current, updatedAt, deletedAt: updatedAt });
    await db.puzzles.delete(key);
    const folders = await db.folders.toArray();
    for (const folder of folders) {
      if (folder.deletedAt || !folder.puzzleKeys.includes(key)) continue;
      await db.folders.put({ ...folder, puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== key), updatedAt, membershipUpdatedAt: updatedAt });
    }
  });
  signalStorageMutation(true, updatedAt);
}

export async function upsertPuzzle(key: string, data: PersistedPuzzle) {
  await db.puzzles.put({ key, data: forPersistence(data) });
  signalStorageMutation(true, data.updatedAt || Date.now());
}

export async function getPuzzle(key: string) {
  const data = (await db.puzzles.get(key))?.data ?? null;
  return data ? hydratePersistedPuzzle(data) : null;
}

export async function listPuzzles(): Promise<StoredPuzzleRow[]> {
  if (puzzlesListCache) return puzzlesListCache;
  const rows = await db.puzzles.toArray();
  const hydrated = await Promise.all(rows.map(async (r) => ({ key: r.key, ...(await hydratePersistedPuzzle(r.data)) })));
  const list: StoredPuzzleRow[] = hydrated
    .filter((row) => !row.def.meta.creatorPuzzle || row.def.meta.creatorPublished === true)
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
  const list = (await db.folders.toArray()).filter((folder) => !folder.deletedAt);
  foldersListCache = list;
  return list;
}

export async function createFolder(name: string, parentId: string | null = null) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required.");

  if (parentId) {
    const parent = await db.folders.get(parentId);
    if (!parent || parent.deletedAt) throw new Error("Parent folder not found.");
  }

  const now = Date.now();
  const folder: PuzzleFolder = {
    id: makeFolderId(),
    parentId,
    name: trimmed,
    puzzleKeys: [],
    createdAt: now,
    updatedAt: now,
    nameUpdatedAt: now,
    parentUpdatedAt: now,
    membershipUpdatedAt: now,
  };
  await db.folders.add(folder);
  signalStorageMutation(true, folder.updatedAt);
  return folder;
}

export async function addPuzzleToFolder(folderId: string, puzzleKey: string) {
  let updatedAt = Date.now();
  await db.transaction("rw", db.folders, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder || folder.deletedAt) throw new Error("Folder not found.");
    if (folder.puzzleKeys.includes(puzzleKey)) return;
    updatedAt = Date.now();
    await db.folders.put({
      ...folder,
      puzzleKeys: [...folder.puzzleKeys, puzzleKey],
      updatedAt,
      membershipUpdatedAt: updatedAt,
    });
  });
  signalStorageMutation(true, updatedAt);
}

export async function removePuzzleFromFolder(folderId: string, puzzleKey: string) {
  let updatedAt = Date.now();
  await db.transaction("rw", db.folders, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder || folder.deletedAt) throw new Error("Folder not found.");
    if (!folder.puzzleKeys.includes(puzzleKey)) return;
    updatedAt = Date.now();
    await db.folders.put({
      ...folder,
      puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== puzzleKey),
      updatedAt,
      membershipUpdatedAt: updatedAt,
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
    if (!folder || folder.deletedAt) throw new Error("Folder not found.");
    updatedAt = Date.now();
    await db.folders.put({
      ...folder,
      name: trimmed,
      updatedAt,
      nameUpdatedAt: updatedAt,
    });
  });
  signalStorageMutation(true, updatedAt);
}

export async function deleteFolder(folderId: string) {
  const updatedAt = Date.now();
  await db.transaction("rw", db.folders, async () => {
    const folders = await db.folders.toArray();
    if (!folders.some((folder) => folder.id === folderId && !folder.deletedAt)) {
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

    for (const id of toDelete) {
      const folder = folders.find((entry) => entry.id === id);
      if (!folder) continue;
      await db.folders.put({
        ...folder,
        updatedAt,
        deletedAt: Math.max(folder.deletedAt ?? 0, updatedAt),
      });
    }
  });
  signalStorageMutation(true, updatedAt);
}

export async function deletePuzzle(key: string) {
  const updatedAt = Date.now();
  await db.transaction("rw", db.puzzles, db.folders, async () => {
    await db.puzzles.delete(key);

    const folders = await db.folders.toArray();
    for (const folder of folders) {
      if (folder.deletedAt) continue;
      if (!folder.puzzleKeys.includes(key)) continue;
      await db.folders.put({
        ...folder,
        puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== key),
        updatedAt,
        membershipUpdatedAt: updatedAt,
      });
    }
  });
  signalStorageMutation(true, updatedAt);
}
