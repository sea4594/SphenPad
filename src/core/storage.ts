import Dexie from "dexie";
import type { Table } from "dexie";
import type { PersistedPuzzle } from "./model";

class SphenDB extends Dexie {
  puzzles!: Table<{ key: string; data: PersistedPuzzle }, string>;
  constructor() {
    super("sphenpad");
    this.version(1).stores({
      puzzles: "key",
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
