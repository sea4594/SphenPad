import Dexie from "dexie";
import type { Table } from "dexie";
import { markLocalDataChanged } from "./localDataState";
import { clearSyncJournal, readSyncDirtyRecords, type SyncDirtyRecord } from "./syncJournal";
import { puzzleFromCloudPayload, type CloudPuzzlePayload } from "./puzzleSync";
import type { PersistedPuzzle, PuzzleDefinition } from "./model";
import { creatorProjectFromDefinition, definitionFromCreatorProject, parseCreatorProject, type CreatorProject } from "../sudokupad/creator/project";
import { cloneCreatorProjectForDuplicate, compareCreatorProjectStorageRows, normalizeCreatorProjectStorageRow, type CreatorProjectStorageRow } from "../sudokupad/creator/projectStorage";
import { normalizeCreatorProjectHistory, type CreatorProjectHistoryState } from "../sudokupad/creator/history";
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
  membershipState?: Record<string, { present: boolean; updatedAt: number }>;
  deletedAt?: number;
};

export type PuzzleSnapshotRow = { key: string; data: PersistedPuzzle };
export type StoredPuzzleRow = { key: string } & PersistedPuzzle;
export type { CreatorProjectStorageRow } from "../sudokupad/creator/projectStorage";

let puzzlesListCache: StoredPuzzleRow[] | null = null;
let foldersListCache: PuzzleFolder[] | null = null;
let creatorProjectsListCache: CreatorProjectStorageRow[] | null = null;
// Imported SudokuPad scenes are expensive derived data. Keep the hydrated
// definition in memory so opening a puzzle already shown in a menu does not
// decode/compile its source payload a second time.
const hydratedDefinitionCache = new Map<string, { sourcePayload?: string; importRevision?: number; def: PuzzleDefinition }>();
const pendingPuzzleWrites = new Map<string, PersistedPuzzle>();
const puzzleWriteTails = new Map<string, Promise<void>>();

function makeFolderId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `folder-${crypto.randomUUID()}`;
  }
  return `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}


function forPersistence(data: PersistedPuzzle): PersistedPuzzle {
  return { ...data, def: definitionForPersistence(data.def) };
}

function cacheHydratedDefinition(def: PuzzleDefinition) {
  if (!def.scene || !def.logic) return;
  const key = def.id || def.sourceId;
  if (!key) return;
  hydratedDefinitionCache.set(key, { sourcePayload: def.sourcePayload, importRevision: def.importRevision, def });
}

async function hydratePersistedPuzzle(data: PersistedPuzzle): Promise<PersistedPuzzle> {
  const key = data.def.id || data.def.sourceId;
  const cached = key ? hydratedDefinitionCache.get(key) : undefined;
  if (cached && cached.sourcePayload === data.def.sourcePayload && cached.importRevision === data.def.importRevision) {
    return { ...data, def: cached.def };
  }
  try {
    const def = await rehydrateImportedSudokuPadDefinition(data.def);
    cacheHydratedDefinition(def);
    return def === data.def ? data : { ...data, def };
  } catch (error) {
    console.warn("Failed to rehydrate imported SudokuPad scene; keeping stored definition", error);
    return data;
  }
}

function signalStorageMutation(notify = true, updatedAt = Date.now(), invalidate: { puzzles?: boolean; folders?: boolean; creatorProjects?: boolean } = {}) {
  if (invalidate.puzzles !== false) puzzlesListCache = null;
  if (invalidate.folders !== false) foldersListCache = null;
  if (invalidate.creatorProjects !== false) creatorProjectsListCache = null;
  // Device-only session saves (selection, tool, timer checkpoints) must not
  // advance the cloud mutation revision: no outbox record was written for them.
  // Otherwise crash-recovery treats them as a lost outbox and reuploads the
  // entire library on the next reconciliation.
  if (notify) markLocalDataChanged(updatedAt, true);
}

function updatePuzzleListCache(key: string, data: PersistedPuzzle) {
  if (!puzzlesListCache) return;
  const visible = !data.def.meta.creatorPuzzle || data.def.meta.creatorPublished === true;
  const next = puzzlesListCache.filter((row) => row.key !== key);
  if (visible) next.push({ key, ...data });
  next.sort((a, b) => b.updatedAt - a.updatedAt);
  puzzlesListCache = next;
}

export type DurableSyncDirtyRecord = SyncDirtyRecord & { id: string; token: string };
function syncOutboxId(kind: SyncDirtyRecord["kind"], key: string) { return `${kind}:${key}`; }
function newSyncToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
async function markDirtyIntent(kind: SyncDirtyRecord["kind"], key: string, deletedAt?: number): Promise<DurableSyncDirtyRecord> {
  const row: DurableSyncDirtyRecord = { id: syncOutboxId(kind, key), kind, key, mutationId: Date.now(), token: newSyncToken(), ...(deletedAt ? { deletedAt } : {}) };
  await db.syncOutbox.put(row);
  return row;
}

class SphenDB extends Dexie {
  puzzles!: Table<PuzzleSnapshotRow, string>;
  folders!: Table<PuzzleFolder, string>;
  creatorProjects!: Table<CreatorProjectStorageRow, string>;
  syncOutbox!: Table<DurableSyncDirtyRecord, string>;
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
    this.version(4).stores({
      puzzles: "key",
      folders: "id,parentId,updatedAt,name",
      creatorProjects: "key,updatedAt,lastOpenedAt,createdAt",
      syncOutbox: "id,kind,key",
    });
  }
}
export const db = new SphenDB();

export async function readDurableSyncDirtyRecords(): Promise<DurableSyncDirtyRecord[]> {
  const durable = await db.syncOutbox.toArray();
  const byId = new Map(durable.map((row) => [row.id, row]));
  const legacyRecords = readSyncDirtyRecords();
  if (legacyRecords.length) {
    const migrated: DurableSyncDirtyRecord[] = [];
    for (const legacy of legacyRecords) {
      const id = syncOutboxId(legacy.kind, legacy.key);
      if (byId.has(id)) continue;
      const row: DurableSyncDirtyRecord = { id, ...legacy, token: `legacy-${newSyncToken()}` };
      migrated.push(row);
      byId.set(id, row);
    }
    if (migrated.length) await db.syncOutbox.bulkPut(migrated);
    clearSyncJournal();
  }
  return [...byId.values()].sort((a, b) => a.mutationId - b.mutationId);
}

export async function hasDurableSyncDirtyRecords() {
  return (await readDurableSyncDirtyRecords()).length > 0;
}

export async function acknowledgeDurableSyncDirty(records: DurableSyncDirtyRecord[]) {
  if (!records.length) return;
  await db.transaction("rw", db.syncOutbox, async () => {
    for (const record of records) {
      const current = await db.syncOutbox.get(record.id);
      if (current?.token === record.token) await db.syncOutbox.delete(record.id);
    }
  });
}

export async function clearDurableSyncJournal() {
  await db.syncOutbox.clear();
  clearSyncJournal();
}

export async function markAllDurableSyncDirty(input: { puzzleKeys: string[]; folderIds: string[]; creatorProjectKeys: string[] }) {
  const existing = new Set((await db.syncOutbox.toArray()).map((row) => row.id));
  const rows: DurableSyncDirtyRecord[] = [];
  const add = (kind: SyncDirtyRecord["kind"], key: string) => {
    const id = syncOutboxId(kind, key);
    if (existing.has(id)) return;
    existing.add(id);
    rows.push({ id, kind, key, mutationId: Date.now(), token: newSyncToken() });
  };
  for (const key of input.puzzleKeys) add("puzzle", key);
  for (const key of input.folderIds) add("folder", key);
  for (const key of input.creatorProjectKeys) add("creatorProject", key);
  if (rows.length) await db.syncOutbox.bulkPut(rows);
}

export async function exportStorageSnapshot() {
  await migrateLegacyCreatorProjects();
  return db.transaction("r", db.puzzles, db.folders, db.creatorProjects, async () => {
    const [puzzles, folders, creatorProjects] = await Promise.all([db.puzzles.toArray(), db.folders.toArray(), db.creatorProjects.toArray()]);
    return { puzzles, folders, creatorProjects };
  });
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
      migrated.push({ key: row.key, project, createdAt, updatedAt, savedAt: updatedAt, lastOpenedAt: 0, undo: [], redo: [] });
    } catch (error) {
      console.warn(`Failed to migrate creator project ${row.key}`, error);
    }
  }
  if (!migrated.length) return;
  await db.transaction("rw", db.creatorProjects, db.syncOutbox, async () => {
    for (const row of migrated) await markDirtyIntent("creatorProject", row.key);
    await db.creatorProjects.bulkPut(migrated);
  });
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
  const row: CreatorProjectStorageRow = { key, project, createdAt: now, updatedAt: now, savedAt: now, lastOpenedAt: now, undo: [], redo: [] };
  const existingPuzzle = (await db.puzzles.get(key))?.data ?? null;
  await db.transaction("rw", db.creatorProjects, db.puzzles, db.syncOutbox, async () => {
    await markDirtyIntent("creatorProject", key);
    await markDirtyIntent("puzzle", key);
    await db.creatorProjects.add(row);
    await db.puzzles.put({ key, data: forPersistence(creatorPuzzleData(project, existingPuzzle, now, now)) });
  });
  signalStorageMutation(true, now);
  return row;
}

export async function saveCreatorProject(key: string, projectInput: CreatorProject, now = Date.now(), history?: CreatorProjectHistoryState) {
  const project = parseCreatorProject(projectInput);
  if (project.projectId !== key || project.sourceId !== key) {
    project.projectId = key;
    project.sourceId = key;
  }
  const existing = await db.creatorProjects.get(key);
  if (existing?.deletedAt) throw new Error("Creator project was deleted. Restore it explicitly before saving.");
  const createdAt = existing?.createdAt ?? now;
  const normalizedExisting = existing ? normalizeCreatorProjectStorageRow(existing) : null;
  const row: CreatorProjectStorageRow = {
    key,
    project,
    createdAt,
    updatedAt: now,
    savedAt: now,
    lastOpenedAt: existing?.lastOpenedAt ?? now,
    undo: normalizeCreatorProjectHistory(history?.undo ?? normalizedExisting?.undo),
    redo: normalizeCreatorProjectHistory(history?.redo ?? normalizedExisting?.redo),
  };
  const existingPuzzle = (await db.puzzles.get(key))?.data ?? null;
  await db.transaction("rw", db.creatorProjects, db.puzzles, db.syncOutbox, async () => {
    await markDirtyIntent("creatorProject", key);
    await markDirtyIntent("puzzle", key);
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
  await db.transaction("rw", db.creatorProjects, db.puzzles, db.folders, db.syncOutbox, async () => {
    const folders = published ? [] : await db.folders.toArray();
    await markDirtyIntent("creatorProject", key);
    await markDirtyIntent("puzzle", key);
    for (const folder of folders) {
      if (!folder.deletedAt && folder.puzzleKeys.includes(key)) await markDirtyIntent("folder", folder.id);
    }
    await db.creatorProjects.put(row);
    await db.puzzles.put({ key, data: forPersistence(creatorPuzzleData(project, existingPuzzle, row.createdAt, now)) });
    for (const folder of folders) {
      if (folder.deletedAt || !folder.puzzleKeys.includes(key)) continue;
      await db.folders.put({ ...folder, puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== key), updatedAt: now, membershipUpdatedAt: now, membershipState: { ...folder.membershipState, [key]: { present: false, updatedAt: now } } });
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
  creatorProjectsListCache = null;
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
  await db.transaction("rw", db.creatorProjects, db.puzzles, db.folders, db.syncOutbox, async () => {
    const current = await db.creatorProjects.get(key);
    if (!current || current.deletedAt) throw new Error("Creator project not found.");
    const folders = await db.folders.toArray();
    await markDirtyIntent("creatorProject", key, updatedAt);
    await markDirtyIntent("puzzle", key, updatedAt);
    for (const folder of folders) {
      if (!folder.deletedAt && folder.puzzleKeys.includes(key)) await markDirtyIntent("folder", folder.id);
    }
    await db.creatorProjects.put({ ...current, updatedAt, deletedAt: updatedAt });
    await db.puzzles.delete(key);
    for (const folder of folders) {
      if (folder.deletedAt || !folder.puzzleKeys.includes(key)) continue;
      await db.folders.put({ ...folder, puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== key), updatedAt, membershipUpdatedAt: updatedAt, membershipState: { ...folder.membershipState, [key]: { present: false, updatedAt } } });
    }
  });
  signalStorageMutation(true, updatedAt);
}

export async function upsertPuzzle(key: string, data: PersistedPuzzle, options: { sync?: boolean } = {}) {
  const sync = options.sync !== false;
  cacheHydratedDefinition(data.def);
  pendingPuzzleWrites.set(key, data);
  updatePuzzleListCache(key, data);

  const previous = puzzleWriteTails.get(key) ?? Promise.resolve();
  const write = previous.catch(() => {}).then(async () => {
    if (sync) {
      await db.transaction("rw", db.puzzles, db.syncOutbox, async () => {
        await markDirtyIntent("puzzle", key);
        await db.puzzles.put({ key, data: forPersistence(data) });
      });
    } else {
      await db.puzzles.put({ key, data: forPersistence(data) });
    }
    signalStorageMutation(sync, data.updatedAt || Date.now(), { puzzles: false, folders: false, creatorProjects: false });
  });
  puzzleWriteTails.set(key, write);

  try {
    await write;
  } catch (error) {
    puzzlesListCache = null;
    throw error;
  } finally {
    if (pendingPuzzleWrites.get(key) === data) pendingPuzzleWrites.delete(key);
    if (puzzleWriteTails.get(key) === write) puzzleWriteTails.delete(key);
  }
}

export async function getPuzzle(key: string) {
  // A just-made local/session change must win immediately even if its IndexedDB
  // write is still queued. This guarantees the final selection survives a
  // quick close/re-open without waiting for background persistence to finish.
  const pending = pendingPuzzleWrites.get(key);
  if (pending) return pending;
  // Menus already hydrate visible puzzle definitions for their previews. Reuse
  // that exact definition instead of recompiling a potentially very large
  // SudokuPad payload again on navigation into the puzzle.
  const hot = puzzlesListCache?.find((row) => row.key === key);
  if (hot) return hot;
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
    membershipState: {},
  };
  await db.transaction("rw", db.folders, db.syncOutbox, async () => {
    await markDirtyIntent("folder", folder.id);
    await db.folders.add(folder);
  });
  signalStorageMutation(true, folder.updatedAt);
  return folder;
}

export async function addPuzzleToFolder(folderId: string, puzzleKey: string) {
  let updatedAt = Date.now();
  await db.transaction("rw", db.folders, db.syncOutbox, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder || folder.deletedAt) throw new Error("Folder not found.");
    if (folder.puzzleKeys.includes(puzzleKey)) return;
    updatedAt = Date.now();
    await markDirtyIntent("folder", folderId);
    await db.folders.put({
      ...folder,
      puzzleKeys: [...folder.puzzleKeys, puzzleKey],
      updatedAt,
      membershipUpdatedAt: updatedAt,
      membershipState: { ...folder.membershipState, [puzzleKey]: { present: true, updatedAt } },
    });
  });
  signalStorageMutation(true, updatedAt);
}

export async function removePuzzleFromFolder(folderId: string, puzzleKey: string) {
  let updatedAt = Date.now();
  await db.transaction("rw", db.folders, db.syncOutbox, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder || folder.deletedAt) throw new Error("Folder not found.");
    if (!folder.puzzleKeys.includes(puzzleKey)) return;
    updatedAt = Date.now();
    await markDirtyIntent("folder", folderId);
    await db.folders.put({
      ...folder,
      puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== puzzleKey),
      updatedAt,
      membershipUpdatedAt: updatedAt,
      membershipState: { ...folder.membershipState, [puzzleKey]: { present: false, updatedAt } },
    });
  });
  signalStorageMutation(true, updatedAt);
}

export async function renameFolder(folderId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name is required.");

  let updatedAt = Date.now();
  await db.transaction("rw", db.folders, db.syncOutbox, async () => {
    const folder = await db.folders.get(folderId);
    if (!folder || folder.deletedAt) throw new Error("Folder not found.");
    updatedAt = Date.now();
    await markDirtyIntent("folder", folderId);
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
  await db.transaction("rw", db.folders, db.syncOutbox, async () => {
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

    for (const id of toDelete) await markDirtyIntent("folder", id, updatedAt);

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
  await db.transaction("rw", db.puzzles, db.folders, db.syncOutbox, async () => {
    const folders = await db.folders.toArray();
    await markDirtyIntent("puzzle", key, updatedAt);
    for (const folder of folders) {
      if (!folder.deletedAt && folder.puzzleKeys.includes(key)) await markDirtyIntent("folder", folder.id);
    }
    await db.puzzles.delete(key);
    for (const folder of folders) {
      if (folder.deletedAt) continue;
      if (!folder.puzzleKeys.includes(key)) continue;
      await db.folders.put({
        ...folder,
        puzzleKeys: folder.puzzleKeys.filter((entry) => entry !== key),
        updatedAt,
        membershipUpdatedAt: updatedAt,
        membershipState: { ...folder.membershipState, [key]: { present: false, updatedAt } },
      });
    }
  });
  signalStorageMutation(true, updatedAt);
}

export type RemotePuzzleChange = { key: string; updatedAt: number; data: CloudPuzzlePayload | null; deleteIntent?: "manual" };
export type RemoteFolderChange = { key: string; updatedAt: number; data: PuzzleFolder | null; deleteIntent?: "manual" };
export type RemoteCreatorProjectChange = { key: string; updatedAt: number; data: CreatorProjectStorageRow | null; deleteIntent?: "manual" };

export async function readPuzzleRowForSync(key: string) {
  const pending = puzzleWriteTails.get(key);
  if (pending) await pending;
  return (await db.puzzles.get(key)) ?? null;
}
export async function readFolderForSync(key: string) { return (await db.folders.get(key)) ?? null; }
export async function readCreatorProjectForSync(key: string) {
  const row = await db.creatorProjects.get(key);
  if (!row) return null;
  const normalized = normalizeCreatorProjectStorageRow(row);
  return { ...normalized, lastOpenedAt: 0 };
}
export async function readAllSyncKeys() {
  await migrateLegacyCreatorProjects();
  const [puzzleKeys, folderIds, creatorProjectKeys] = await Promise.all([
    db.puzzles.toCollection().primaryKeys() as Promise<string[]>,
    db.folders.toCollection().primaryKeys() as Promise<string[]>,
    db.creatorProjects.toCollection().primaryKeys() as Promise<string[]>,
  ]);
  return { puzzleKeys, folderIds, creatorProjectKeys };
}

function folderMembershipMap(folder: PuzzleFolder) {
  if (folder.membershipState) return { ...folder.membershipState };
  const at = folder.membershipUpdatedAt ?? folder.updatedAt ?? 0;
  return Object.fromEntries(folder.puzzleKeys.map((key) => [key, { present: true, updatedAt: at }]));
}
function mergeFolderRecords(local: PuzzleFolder | null, remote: PuzzleFolder): PuzzleFolder {
  if (!local) return remote;
  const localNameAt = local.nameUpdatedAt ?? local.updatedAt ?? 0;
  const remoteNameAt = remote.nameUpdatedAt ?? remote.updatedAt ?? 0;
  const localParentAt = local.parentUpdatedAt ?? local.updatedAt ?? 0;
  const remoteParentAt = remote.parentUpdatedAt ?? remote.updatedAt ?? 0;
  const membershipState = folderMembershipMap(local);
  for (const [key, remoteState] of Object.entries(folderMembershipMap(remote))) {
    const current = membershipState[key];
    if (!current || remoteState.updatedAt >= current.updatedAt) membershipState[key] = remoteState;
  }
  const puzzleKeys = Object.entries(membershipState).filter(([, state]) => state.present).map(([key]) => key);
  const deletedAt = Math.max(local.deletedAt ?? 0, remote.deletedAt ?? 0) || undefined;
  const newestNonDelete = Math.max(local.updatedAt ?? 0, remote.updatedAt ?? 0);
  return {
    ...(local.updatedAt >= remote.updatedAt ? local : remote),
    id: local.id,
    name: remoteNameAt > localNameAt ? remote.name : local.name,
    parentId: remoteParentAt > localParentAt ? remote.parentId : local.parentId,
    puzzleKeys: deletedAt && deletedAt >= newestNonDelete ? [] : puzzleKeys,
    membershipState,
    nameUpdatedAt: Math.max(localNameAt, remoteNameAt),
    parentUpdatedAt: Math.max(localParentAt, remoteParentAt),
    membershipUpdatedAt: Math.max(local.membershipUpdatedAt ?? local.updatedAt, remote.membershipUpdatedAt ?? remote.updatedAt),
    updatedAt: newestNonDelete,
    createdAt: Math.min(local.createdAt || remote.createdAt, remote.createdAt || local.createdAt),
    ...(deletedAt ? { deletedAt } : {}),
  };
}

export async function applyRemoteStorageChanges(changes: {
  puzzles: RemotePuzzleChange[];
  folders: RemoteFolderChange[];
  creatorProjects: RemoteCreatorProjectChange[];
}, notify = true) {
  const maxUpdatedAt = Math.max(0,
    ...changes.puzzles.map((entry) => entry.updatedAt),
    ...changes.folders.map((entry) => entry.updatedAt),
    ...changes.creatorProjects.map((entry) => entry.updatedAt),
  );
  const dirtyAtStart = new Map<string, DurableSyncDirtyRecord>();
  for (const record of await readDurableSyncDirtyRecords()) dirtyAtStart.set(`${record.kind}:${record.key}`, record);
  const supersededDirty: DurableSyncDirtyRecord[] = [];
  const repairAfter: Array<{ kind: SyncDirtyRecord["kind"]; key: string }> = [];
  const dirtyFor = (kind: SyncDirtyRecord["kind"], key: string) => dirtyAtStart.get(`${kind}:${key}`);
  const supersede = (kind: SyncDirtyRecord["kind"], key: string) => { const record = dirtyFor(kind, key); if (record) supersededDirty.push(record); };

  await db.transaction("rw", db.creatorProjects, db.puzzles, db.folders, db.syncOutbox, async () => {
    for (const change of changes.creatorProjects) {
      const local = await db.creatorProjects.get(change.key) ?? null;
      const dirty = dirtyFor("creatorProject", change.key);
      if (!change.data) {
        if (change.deleteIntent !== "manual") {
          if (local && !local.deletedAt) repairAfter.push({ kind: "creatorProject", key: change.key });
          continue;
        }
        if (local) await db.creatorProjects.put({ ...local, updatedAt: Math.max(local.updatedAt, change.updatedAt), deletedAt: Math.max(local.deletedAt ?? 0, change.updatedAt) });
        await db.puzzles.delete(change.key);
        supersede("creatorProject", change.key);
        supersede("puzzle", change.key);
        continue;
      }
      const remote = normalizeCreatorProjectStorageRow({ ...change.data, lastOpenedAt: local?.lastOpenedAt ?? 0 });
      if (local?.deletedAt) {
        if (dirty?.deletedAt) continue;
        await db.creatorProjects.put({ ...remote, lastOpenedAt: local.lastOpenedAt ?? 0 });
        continue;
      }
      if (dirty) continue;
      await db.creatorProjects.put({ ...remote, lastOpenedAt: local?.lastOpenedAt ?? 0 });
    }

    for (const change of changes.puzzles) {
      const local = await db.puzzles.get(change.key);
      const dirty = dirtyFor("puzzle", change.key);
      if (!change.data) {
        if (change.deleteIntent !== "manual") {
          if (local) repairAfter.push({ kind: "puzzle", key: change.key });
          continue;
        }
        await db.puzzles.delete(change.key);
        supersede("puzzle", change.key);
        continue;
      }
      if (dirty?.deletedAt) continue;
      const creatorKey = change.data.creatorProjectKey;
      const creatorProject = creatorKey ? (await db.creatorProjects.get(creatorKey) ?? null) : null;
      let materialized: PersistedPuzzle;
      try { materialized = puzzleFromCloudPayload(change.data, local?.data ?? null, creatorProject); }
      catch (error) { console.warn(`Skipping cloud puzzle ${change.key} because its definition dependency is unavailable`, error); continue; }
      if (local && dirty) {
        if (materialized.progress.totalMillis > local.data.progress.totalMillis) {
          await db.puzzles.put({ key: change.key, data: forPersistence({ ...local.data, progress: { ...local.data.progress, totalMillis: materialized.progress.totalMillis } }) });
        }
        continue;
      }
      const withMergedTimer = local && local.data.progress.totalMillis > materialized.progress.totalMillis
        ? { ...materialized, progress: { ...materialized.progress, totalMillis: local.data.progress.totalMillis } }
        : materialized;
      await db.puzzles.put({ key: change.key, data: forPersistence(withMergedTimer) });
    }

    for (const change of changes.folders) {
      const local = await db.folders.get(change.key) ?? null;
      const dirty = dirtyFor("folder", change.key);
      if (!change.data) {
        if (change.deleteIntent !== "manual") {
          if (local && !local.deletedAt) repairAfter.push({ kind: "folder", key: change.key });
          continue;
        }
        await db.folders.delete(change.key);
        supersede("folder", change.key);
        continue;
      }
      if (local?.deletedAt) {
        if (dirty?.deletedAt) continue;
        await db.folders.put(change.data);
        continue;
      }
      if (!local) {
        await db.folders.put(change.data);
      } else if (dirty) {
        await db.folders.put(mergeFolderRecords(local, change.data));
      } else {
        await db.folders.put(change.data);
      }
    }
  });

  await acknowledgeDurableSyncDirty(supersededDirty);
  for (const repair of repairAfter) await markDirtyIntent(repair.kind, repair.key);
  if (puzzlesListCache && changes.puzzles.length) {
    for (const change of changes.puzzles) {
      if (!change.data && change.deleteIntent === "manual") {
        puzzlesListCache = puzzlesListCache.filter((row) => row.key !== change.key);
        continue;
      }
      const stored = await db.puzzles.get(change.key);
      if (!stored) continue;
      const cached = puzzlesListCache.find((row) => row.key === change.key);
      const sameDefinition = Boolean(cached
        && cached.def.id === stored.data.def.id
        && cached.def.sourcePayload === stored.data.def.sourcePayload
        && cached.def.meta.creatorPuzzle === stored.data.def.meta.creatorPuzzle);
      const hydrated = sameDefinition && cached
        ? { ...stored.data, def: cached.def }
        : await hydratePersistedPuzzle(stored.data);
      updatePuzzleListCache(change.key, hydrated);
    }
  }
  if (changes.folders.length) foldersListCache = null;
  if (changes.creatorProjects.length) creatorProjectsListCache = null;
  if (maxUpdatedAt) markLocalDataChanged(maxUpdatedAt, false);
  void notify;
}
