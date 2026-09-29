import { notifyCloudSyncNeeded } from "./syncSignal";

export type SyncEntityKind = "puzzle" | "folder" | "creatorProject";
export type SyncDirtyRecord = { kind: SyncEntityKind; key: string; mutationId: number; deletedAt?: number };

type JournalState = { nextMutationId: number; records: Record<string, SyncDirtyRecord> };
const JOURNAL_KEY = "sphenpad-sync-journal-v2";

function storageAvailable() { return typeof localStorage !== "undefined"; }
function recordId(kind: SyncEntityKind, key: string) { return `${kind}:${key}`; }
function readState(): JournalState {
  if (!storageAvailable()) return { nextMutationId: 1, records: {} };
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return { nextMutationId: 1, records: {} };
    const parsed = JSON.parse(raw) as Partial<JournalState>;
    return {
      nextMutationId: typeof parsed.nextMutationId === "number" && parsed.nextMutationId > 0 ? parsed.nextMutationId : 1,
      records: parsed.records && typeof parsed.records === "object" ? parsed.records : {},
    };
  } catch { return { nextMutationId: 1, records: {} }; }
}
function writeState(state: JournalState) { if (storageAvailable()) localStorage.setItem(JOURNAL_KEY, JSON.stringify(state)); }

export function markSyncDirty(kind: SyncEntityKind, key: string, deletedAt?: number, notify = true) {
  const state = readState();
  const mutationId = state.nextMutationId++;
  state.records[recordId(kind, key)] = { kind, key, mutationId, ...(deletedAt ? { deletedAt } : {}) };
  writeState(state);
  if (notify) notifyCloudSyncNeeded();
  return mutationId;
}
export function readSyncDirtyRecords(): SyncDirtyRecord[] { return Object.values(readState().records).sort((a, b) => a.mutationId - b.mutationId); }
export function hasSyncDirtyRecords() { return Object.keys(readState().records).length > 0; }
export function isSyncDirty(kind: SyncEntityKind, key: string) { return Boolean(readState().records[recordId(kind, key)]); }
export function acknowledgeSyncDirty(records: SyncDirtyRecord[]) {
  const state = readState();
  for (const record of records) {
    const id = recordId(record.kind, record.key);
    if (state.records[id]?.mutationId === record.mutationId) delete state.records[id];
  }
  writeState(state);
}
export function clearSyncJournal() { if (storageAvailable()) localStorage.removeItem(JOURNAL_KEY); }
export function markAllSyncDirty(input: { puzzleKeys: string[]; folderIds: string[]; creatorProjectKeys: string[] }, notify = true) {
  const state = readState();
  const add = (kind: SyncEntityKind, key: string) => {
    const mutationId = state.nextMutationId++;
    state.records[recordId(kind, key)] = { kind, key, mutationId };
  };
  for (const key of input.puzzleKeys) add("puzzle", key);
  for (const key of input.folderIds) add("folder", key);
  for (const key of input.creatorProjectKeys) add("creatorProject", key);
  writeState(state);
  if (notify) notifyCloudSyncNeeded();
}
