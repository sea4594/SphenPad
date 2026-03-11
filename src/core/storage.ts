import Dexie from "dexie";
import type { Table } from "dexie";
import type { PersistedPuzzle } from "./model";

type PersistedArchiveEntry = {
  stableKey: string;
  sourceId: string;
  updatedAt: number;
  data: unknown;
};

type ArchiveEntryWrite = Omit<PersistedArchiveEntry, "updatedAt"> & { updatedAt?: number };

type PersistedArchivePayload = {
  stableKey: string;
  payload: string;
};

type PersistedArchiveMeta = {
  key: string;
  value: unknown;
};

class SphenDB extends Dexie {
  puzzles!: Table<{ key: string; data: PersistedPuzzle }, string>;
  archiveEntries!: Table<PersistedArchiveEntry, string>;
  archivePayloads!: Table<PersistedArchivePayload, string>;
  archiveMeta!: Table<PersistedArchiveMeta, string>;
  constructor() {
    super("sphenpad");
    this.version(1).stores({
      puzzles: "key",
    });
    this.version(2).stores({
      puzzles: "key",
      archiveEntries: "stableKey, sourceId, updatedAt",
      archivePayloads: "stableKey",
      archiveMeta: "key",
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

export async function deletePuzzle(key: string) {
  await db.puzzles.delete(key);
}

export async function clearArchiveCache() {
  await Promise.all([db.archiveEntries.clear(), db.archivePayloads.clear(), db.archiveMeta.clear()]);
}

export async function putArchiveEntries(entries: ArchiveEntryWrite[]) {
  if (!entries.length) return;
  const updatedAt = Date.now();
  await db.archiveEntries.bulkPut(
    entries.map((entry) => ({
      stableKey: entry.stableKey,
      sourceId: entry.sourceId,
      updatedAt: entry.updatedAt ?? updatedAt,
      data: entry.data,
    }))
  );
}

export async function getArchiveEntries<T = unknown>() {
  const rows = await db.archiveEntries.toArray();
  return rows.map((row) => row.data as T);
}

export async function putArchivePayload(stableKey: string, payload: string) {
  if (!stableKey) return;
  await db.archivePayloads.put({ stableKey, payload });
}

export async function getArchivePayload(stableKey: string) {
  return (await db.archivePayloads.get(stableKey))?.payload;
}

export async function setArchiveMeta(key: string, value: unknown) {
  await db.archiveMeta.put({ key, value });
}

export async function getArchiveMeta<T = unknown>(key: string) {
  return (await db.archiveMeta.get(key))?.value as T | undefined;
}
