import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { exportLocalAppSnapshot, exportLocalAppSnapshotMetadata, importLocalAppSnapshot, mergeSnapshots, type LocalAppSnapshot } from "../core/appState";
import { getLocalDataOwnerId, readLocalMutationRevision, setLocalDataOwnerId } from "../core/localDataState";
import { puzzleToCloudPayload } from "../core/puzzleSync";
import { notifyStorageRefreshNeeded, onCloudSyncNeeded } from "../core/syncSignal";
import { acknowledgeDurableSyncDirty, applyRemoteStorageChanges, clearDurableSyncJournal, hasDurableSyncDirtyRecords, markAllDurableSyncDirty, readAllSyncKeys, readCreatorProjectForSync, readDurableSyncDirtyRecords, readFolderForSync, readPuzzleRowForSync, type DurableSyncDirtyRecord } from "../core/storage";
import {
  CLOUD_SCHEMA_VERSION, type CloudChange, type CloudStateMetadata, archiveCloudConflicts, firebaseEnabled, googleLogin, googleLogout, onCloudStateChanged, onGoogleAuthStateChanged, pullCloudChanges, pullCloudState,
  migrateCloudToCurrentSchema, pullCloudStateMetadata, pushCloudChanges, resolveGoogleRedirectLogin, snapshotToCloudChanges,
} from "../firebase/client";

type SyncStatus = "idle" | "syncing" | "error";
const CLOUD_RECONCILE_INTERVAL_MS = 5 * 60_000;
const REVISION_KEY_PREFIX = "sphenpad-cloud-revision-v3:";
const LOCAL_MUTATION_CHECKPOINT_KEY_PREFIX = "sphenpad-cloud-local-mutation-v1:";
const CREATOR_REPAIR_KEY_PREFIX = "sphenpad-creator-dependency-repair-v1:";
const SAFETY_RECONCILE_KEY_PREFIX = "sphenpad-sync-safety-reconciled-v1:";

type AccountSyncContextValue = {
  ready: boolean; firebaseEnabled: boolean; user: User | null; syncStatus: SyncStatus; syncError: string;
  appStateNonce: number; loginPending: boolean; login: () => Promise<void>; logout: () => Promise<void>;
};
const AccountSyncContext = createContext<AccountSyncContextValue | null>(null);
function emptySnapshot() { return { version: 1 as const, updatedAt: 0, localStorage: {}, folders: [], puzzles: [], creatorProjects: [] }; }
function errorCodeOf(error: unknown) { return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? String((error as { code: string }).code) : ""; }
function isLikelyOfflineError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const text = `${errorCodeOf(error)} ${error instanceof Error ? error.message : String(error)}`.toLowerCase();
  return text.includes("network") || text.includes("offline") || text.includes("failed to fetch") || text.includes("timeout") || text.includes("unavailable");
}
function describeSyncError(error: unknown) {
  if (isLikelyOfflineError(error)) return "Cloud sync is temporarily unavailable. Local puzzles remain available on this device and will sync automatically when the connection returns.";
  const message = error instanceof Error ? error.message : String(error);
  return `Cloud sync failed${message.trim() ? `: ${message}` : ""}. Local puzzles remain available on this device.`;
}
function readSavedRevision(uid: string) { try { const value = Number(localStorage.getItem(`${REVISION_KEY_PREFIX}${uid}`)); return Number.isFinite(value) && value >= 0 ? value : 0; } catch { return 0; } }
function saveRevision(uid: string, revision: number) { try { localStorage.setItem(`${REVISION_KEY_PREFIX}${uid}`, String(revision)); } catch { /* best effort */ } }
function readSavedLocalMutationRevision(uid: string) {
  try { const value = Number(localStorage.getItem(`${LOCAL_MUTATION_CHECKPOINT_KEY_PREFIX}${uid}`)); return Number.isFinite(value) && value >= 0 ? value : 0; } catch { return 0; }
}
function saveLocalMutationRevision(uid: string, revision: number) {
  try { localStorage.setItem(`${LOCAL_MUTATION_CHECKPOINT_KEY_PREFIX}${uid}`, String(revision)); } catch { /* best effort */ }
}

function overlayDirtyLocalState(merged: LocalAppSnapshot, local: LocalAppSnapshot, dirty: DurableSyncDirtyRecord[]): LocalAppSnapshot {
  const puzzles = new Map(merged.puzzles.map((row) => [row.key, row]));
  const localPuzzles = new Map(local.puzzles.map((row) => [row.key, row]));
  const folders = new Map(merged.folders.map((row) => [row.id, row]));
  const localFolders = new Map(local.folders.map((row) => [row.id, row]));
  const creators = new Map(merged.creatorProjects.map((row) => [row.key, row]));
  const localCreators = new Map(local.creatorProjects.map((row) => [row.key, row]));
  for (const record of dirty) {
    if (record.kind === "puzzle") {
      if (record.deletedAt) puzzles.delete(record.key);
      else { const row = localPuzzles.get(record.key); if (row) puzzles.set(record.key, row); }
    } else if (record.kind === "folder") {
      const row = localFolders.get(record.key);
      if (row) folders.set(record.key, row);
      else if (record.deletedAt) folders.delete(record.key);
    } else {
      const row = localCreators.get(record.key);
      if (row) creators.set(record.key, row);
      else if (record.deletedAt) creators.delete(record.key);
    }
  }
  return { ...merged, puzzles: [...puzzles.values()], folders: [...folders.values()], creatorProjects: [...creators.values()] };
}

function mergeCloudChanges(base: CloudChange[], overrides: CloudChange[]) {
  const map = new Map(base.map((change) => [`${change.kind}:${change.key}`, change]));
  for (const change of overrides) map.set(`${change.kind}:${change.key}`, change);
  return [...map.values()];
}

function cloudValueFingerprint(value: unknown) {
  try {
    return JSON.stringify(value, (_key, current) => current instanceof Set ? { __set: [...current].sort() } : current);
  } catch { return ""; }
}
function cloudChangesEquivalent(a: CloudChange, b: CloudChange) {
  return a.kind === b.kind && a.key === b.key && a.updatedAt === b.updatedAt
    && (a.payload == null) === (b.payload == null)
    && cloudValueFingerprint(a.payload) === cloudValueFingerprint(b.payload);
}

export function AccountSyncProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState("");
  const [appStateNonce, setAppStateNonce] = useState(0);
  const [loginPending, setLoginPending] = useState(false);
  const readyRef = useRef(ready);
  const userRef = useRef<User | null>(null);
  const authEpochRef = useRef(0);
  const initializedUidRef = useRef<string | null>(null);
  const cloudRevisionRef = useRef(0);
  const syncTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const operationTailRef = useRef<Promise<void>>(Promise.resolve());
  const loginInFlightRef = useRef(false);

  useEffect(() => { readyRef.current = ready; }, [ready]);
  function clearSyncTimer() { if (syncTimerRef.current != null) { window.clearTimeout(syncTimerRef.current); syncTimerRef.current = null; } }
  function clearRetryTimer() { if (retryTimerRef.current != null) { window.clearTimeout(retryTimerRef.current); retryTimerRef.current = null; } }
  function sessionIsCurrent(uid: string, epoch: number) { return userRef.current?.uid === uid && authEpochRef.current === epoch; }
  function assertSession(uid: string, epoch: number) { if (!sessionIsCurrent(uid, epoch)) throw new Error("cloud-sync-session-changed"); }
  function runExclusive(task: () => Promise<void>) {
    const run = operationTailRef.current.catch(() => {}).then(task);
    operationTailRef.current = run.catch(() => {});
    return run;
  }
  function scheduleRetry() {
    if (!userRef.current || !readyRef.current || retryTimerRef.current != null) return;
    const delay = Math.min(60_000, 2_000 * (2 ** retryCountRef.current)); retryCountRef.current = Math.min(retryCountRef.current + 1, 5);
    retryTimerRef.current = window.setTimeout(() => { retryTimerRef.current = null; scheduleSync(0); }, delay);
  }
  async function recoverMissingDirtyJournal(uid: string, forceAll = false) {
    const mutationRevision = readLocalMutationRevision();
    if (!forceAll && mutationRevision <= readSavedLocalMutationRevision(uid)) return;
    // Normal mutations are journaled before IndexedDB is changed. If any dirty
    // record exists, the journal is live and complete; avoid turning a one-row
    // save into a full-library upload.
    if (!forceAll && await hasDurableSyncDirtyRecords()) return;
    const keys = await readAllSyncKeys();
    if (keys.puzzleKeys.length || keys.folderIds.length || keys.creatorProjectKeys.length) await markAllDurableSyncDirty(keys);
  }
  async function checkpointLocalMutation(uid: string) { if (!(await hasDurableSyncDirtyRecords())) saveLocalMutationRevision(uid, readLocalMutationRevision()); }
  function creatorRepairDone(uid: string) { try { return localStorage.getItem(`${CREATOR_REPAIR_KEY_PREFIX}${uid}`) === "1"; } catch { return false; } }
  function markCreatorRepairDone(uid: string) { try { localStorage.setItem(`${CREATOR_REPAIR_KEY_PREFIX}${uid}`, "1"); } catch { /* best effort */ } }
  function safetyReconcileDone(uid: string) { try { return localStorage.getItem(`${SAFETY_RECONCILE_KEY_PREFIX}${uid}`) === "1"; } catch { return false; } }
  function markSafetyReconcileDone(uid: string) { try { localStorage.setItem(`${SAFETY_RECONCILE_KEY_PREFIX}${uid}`, "1"); } catch { /* best effort */ } }
  async function queueCreatorDependencyRepairs(uid: string) {
    if (creatorRepairDone(uid)) return false;
    const keys = await readAllSyncKeys();
    if (keys.creatorProjectKeys.length) await markAllDurableSyncDirty({ puzzleKeys: keys.creatorProjectKeys, folderIds: [], creatorProjectKeys: keys.creatorProjectKeys });
    return true;
  }

  async function buildDirtyChanges(records: DurableSyncDirtyRecord[]): Promise<CloudChange[]> {
    const changes = new Map<string, CloudChange>();
    const put = (change: CloudChange) => changes.set(`${change.kind}:${change.key}`, change);
    for (const record of records) {
      if (record.deletedAt) { put({ kind: record.kind, key: record.key, updatedAt: record.deletedAt, payload: null, deleteIntent: "manual" } as CloudChange); continue; }
      if (record.kind === "puzzle") {
        const row = await readPuzzleRowForSync(record.key);
        if (!row) { await acknowledgeDurableSyncDirty([record]); continue; } // missing storage is never inferred as deletion
        const payload = puzzleToCloudPayload(record.key, row.data);
        if (payload.creatorProjectKey) {
          let creator = await readCreatorProjectForSync(payload.creatorProjectKey);
          if (!creator) { await readAllSyncKeys(); creator = await readCreatorProjectForSync(payload.creatorProjectKey); }
          if (creator && !creator.deletedAt) put({ kind: "creatorProject", key: creator.key, updatedAt: creator.updatedAt, payload: creator });
          else payload.def = row.data.def;
        }
        put({ kind: "puzzle", key: record.key, updatedAt: row.data.updatedAt, payload });
      } else if (record.kind === "folder") {
        const row = await readFolderForSync(record.key);
        if (!row || row.deletedAt) { await acknowledgeDurableSyncDirty([record]); continue; }
        put({ kind: "folder", key: record.key, updatedAt: row.updatedAt, payload: row });
      } else {
        const row = await readCreatorProjectForSync(record.key);
        if (!row || row.deletedAt) { await acknowledgeDurableSyncDirty([record]); continue; }
        put({ kind: "creatorProject", key: record.key, updatedAt: row.updatedAt, payload: row });
      }
    }
    return [...changes.values()];
  }

  async function applyIncrementalCloud(uid: string, epoch: number, revisionHint?: CloudStateMetadata | null) {
    assertSession(uid, epoch);
    const result = await pullCloudChanges(uid, cloudRevisionRef.current, revisionHint);
    assertSession(uid, epoch);
    if (result.version < CLOUD_SCHEMA_VERSION) return false;
    if (result.changes.length) {
      const dirtyRecords = await readDurableSyncDirtyRecords();
      const dirtyIds = new Set(dirtyRecords.map((record) => `${record.kind}:${record.key}`));
      const remoteCandidates = result.changes.filter((change) => dirtyIds.has(`${change.kind}:${change.key}`));
      const candidateIds = new Set(remoteCandidates.map((change) => `${change.kind}:${change.key}`));
      const candidateLocalRecords = dirtyRecords.filter((record) => candidateIds.has(`${record.kind}:${record.key}`));
      const candidateLocalBranches = (await buildDirtyChanges(candidateLocalRecords)).map((change) => ({ ...change, sourceRevision: cloudRevisionRef.current }));
      const localById = new Map(candidateLocalBranches.map((change) => [`${change.kind}:${change.key}`, change]));
      const conflicts = remoteCandidates.filter((remote) => {
        const local = localById.get(`${remote.kind}:${remote.key}`);
        return Boolean(local && !cloudChangesEquivalent(local, remote));
      });
      // Deleting a creator project also deletes its puzzle row. Preserve an
      // unsynced local puzzle branch before applying that explicit remote delete.
      const impliedPuzzleKeys = new Set(result.changes
        .filter((change) => change.kind === "creatorProject" && change.payload == null && change.deleteIntent === "manual" && dirtyIds.has(`puzzle:${change.key}`))
        .map((change) => change.key));
      const localArchiveIds = new Set(conflicts.map((change) => `${change.kind}:${change.key}`));
      const extraPuzzleRecords = dirtyRecords.filter((record) => record.kind === "puzzle" && impliedPuzzleKeys.has(record.key) && !candidateIds.has(`puzzle:${record.key}`));
      const extraPuzzleBranches = (await buildDirtyChanges(extraPuzzleRecords)).map((change) => ({ ...change, sourceRevision: cloudRevisionRef.current }));
      const localBranches = [...candidateLocalBranches.filter((change) => localArchiveIds.has(`${change.kind}:${change.key}`)), ...extraPuzzleBranches];
      if (conflicts.length) await archiveCloudConflicts(uid, conflicts, "cloud");
      if (localBranches.length) await archiveCloudConflicts(uid, localBranches, "local");
      if (conflicts.length || localBranches.length) assertSession(uid, epoch);
      await applyRemoteStorageChanges({
        creatorProjects: result.changes.filter((c) => c.kind === "creatorProject").map((c) => ({ key: c.key, updatedAt: c.updatedAt, data: c.payload, deleteIntent: c.deleteIntent })),
        folders: result.changes.filter((c) => c.kind === "folder").map((c) => ({ key: c.key, updatedAt: c.updatedAt, data: c.payload, deleteIntent: c.deleteIntent })),
        puzzles: result.changes.filter((c) => c.kind === "puzzle").map((c) => ({ key: c.key, updatedAt: c.updatedAt, data: c.payload, deleteIntent: c.deleteIntent })),
      }, false);
      assertSession(uid, epoch); notifyStorageRefreshNeeded(); setAppStateNonce((value) => value + 1);
    }
    cloudRevisionRef.current = result.revision; saveRevision(uid, result.revision);
    return true;
  }

  async function pushDirty(uid: string, epoch: number) {
    for (let attempt = 0; attempt < 4; attempt++) {
      assertSession(uid, epoch);
      const dirty = await readDurableSyncDirtyRecords();
      if (!dirty.length) return;
      const metadata = await pullCloudStateMetadata(uid); assertSession(uid, epoch);
      if (metadata && metadata.version < CLOUD_SCHEMA_VERSION) { await migrateAccountSchema(uid, epoch); continue; }
      const remoteRevision = metadata?.revision ?? 0;
      if (remoteRevision !== cloudRevisionRef.current) { await applyIncrementalCloud(uid, epoch); continue; }
      const changes = await buildDirtyChanges(dirty); assertSession(uid, epoch);
      try {
        const result = await pushCloudChanges(uid, changes, cloudRevisionRef.current); assertSession(uid, epoch);
        cloudRevisionRef.current = result.revision; saveRevision(uid, result.revision);
        await acknowledgeDurableSyncDirty(dirty);
        retryCountRef.current = 0; clearRetryTimer();
        return;
      } catch (error) {
        if (error instanceof Error && error.message === "cloud-state-revision-conflict" && attempt < 3) { await applyIncrementalCloud(uid, epoch); continue; }
        throw error;
      }
    }
  }

  async function migrateAccountSchema(uid: string, epoch: number) {
    for (let attempt = 0; attempt < 3; attempt++) {
      assertSession(uid, epoch);
      const localSnapshot = await exportLocalAppSnapshot();
      const dirtyBefore = await readDurableSyncDirtyRecords();
      const dirtyOverrides = await buildDirtyChanges(dirtyBefore);
      const capturedLocalRevision = readLocalMutationRevision();
      const [cloudSnapshot, legacyMetadata] = await Promise.all([pullCloudState(uid), pullCloudStateMetadata(uid)]);
      assertSession(uid, epoch);
      if (legacyMetadata?.version && legacyMetadata.version >= CLOUD_SCHEMA_VERSION) {
        cloudRevisionRef.current = 0;
        await applyIncrementalCloud(uid, epoch);
        return;
      }
      if (readLocalMutationRevision() !== capturedLocalRevision) continue;
      const mergedBase = cloudSnapshot ? mergeSnapshots(localSnapshot, cloudSnapshot) : localSnapshot;
      const merged = overlayDirtyLocalState(mergedBase, localSnapshot, dirtyBefore);
      const changes = mergeCloudChanges(snapshotToCloudChanges(merged), dirtyOverrides);
      try {
        const result = await migrateCloudToCurrentSchema(uid, changes, legacyMetadata?.version ?? 1, legacyMetadata?.revision ?? 0);
        assertSession(uid, epoch);
        const localUnchanged = readLocalMutationRevision() === capturedLocalRevision;
        if (localUnchanged) await importLocalAppSnapshot(merged, false);
        await acknowledgeDurableSyncDirty(dirtyBefore);
        cloudRevisionRef.current = result.revision; saveRevision(uid, result.revision);
        if (localUnchanged) { notifyStorageRefreshNeeded(); setAppStateNonce((value) => value + 1); }
        return;
      } catch (error) {
        if (error instanceof Error && error.message === "cloud-state-revision-conflict" && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error("Cloud account changed repeatedly during migration. Local changes remain queued and will retry automatically.");
  }

  async function syncOnce(activeUser = userRef.current, revisionHint?: CloudStateMetadata | null) {
    if (!activeUser || !readyRef.current) return;
    const uid = activeUser.uid; const epoch = authEpochRef.current;
    setSyncError("");
    try {
      await recoverMissingDirtyJournal(uid); assertSession(uid, epoch);
      const metadata = revisionHint && revisionHint.revision > cloudRevisionRef.current
        ? revisionHint : await pullCloudStateMetadata(uid);
      assertSession(uid, epoch);
      const needsMigration = Boolean(metadata?.version && metadata.version < CLOUD_SCHEMA_VERSION);
      const needsPull = !needsMigration && (metadata?.revision ?? 0) > cloudRevisionRef.current;
      const needsPush = await hasDurableSyncDirtyRecords();
      if (!needsMigration && !needsPull && !needsPush) {
        await checkpointLocalMutation(uid);
        if (syncStatus !== "idle") setSyncStatus("idle");
        retryCountRef.current = 0; clearRetryTimer();
        return;
      }
      setSyncStatus("syncing");
      if (needsMigration) await migrateAccountSchema(uid, epoch);
      else {
        if (needsPull) await applyIncrementalCloud(uid, epoch, metadata);
        if (await hasDurableSyncDirtyRecords()) await pushDirty(uid, epoch);
      }
      assertSession(uid, epoch); await checkpointLocalMutation(uid); setSyncStatus("idle"); retryCountRef.current = 0; clearRetryTimer();
    } catch (error) {
      if (error instanceof Error && error.message === "cloud-sync-session-changed") return;
      setSyncStatus("error"); setSyncError(describeSyncError(error));
      if (await hasDurableSyncDirtyRecords()) scheduleRetry();
      throw error;
    }
  }

  async function initializeUser(activeUser: User, epoch: number) {
    const uid = activeUser.uid;
    const owner = getLocalDataOwnerId(); const switchingAccounts = owner !== null && owner !== uid;
    if (switchingAccounts) { readyRef.current = false; setReady(false); }
    setSyncStatus("syncing"); setSyncError("");
    try {
      const [metadata, localMetadata] = await Promise.all([pullCloudStateMetadata(uid), exportLocalAppSnapshotMetadata()]); assertSession(uid, epoch);
      if (switchingAccounts) {
        await recoverMissingDirtyJournal(owner!);
        if (await hasDurableSyncDirtyRecords()) throw new Error("Unsynced local changes still belong to the previously signed-in account. Sign back into that account and allow sync to finish before switching accounts.");
        const cloudSnapshot = await pullCloudState(uid); assertSession(uid, epoch);
        await importLocalAppSnapshot(cloudSnapshot ?? emptySnapshot(), false); await clearDurableSyncJournal();
        cloudRevisionRef.current = metadata?.version === CLOUD_SCHEMA_VERSION ? metadata.revision : 0; saveRevision(uid, cloudRevisionRef.current);
        const queuedRepair = metadata?.version === CLOUD_SCHEMA_VERSION ? await queueCreatorDependencyRepairs(uid) : false;
        if (await hasDurableSyncDirtyRecords()) await pushDirty(uid, epoch);
        if (queuedRepair && !(await hasDurableSyncDirtyRecords())) markCreatorRepairDone(uid);
        notifyStorageRefreshNeeded(); setAppStateNonce((value) => value + 1);
      } else if (!metadata?.hasData) {
        cloudRevisionRef.current = 0; saveRevision(uid, 0);
        if (localMetadata.hasData) { await markAllDurableSyncDirty(await readAllSyncKeys()); await pushDirty(uid, epoch); }
      } else if (metadata.version < CLOUD_SCHEMA_VERSION) {
        await recoverMissingDirtyJournal(uid, owner === null && localMetadata.hasData);
        await migrateAccountSchema(uid, epoch);
      } else if (!localMetadata.hasData) {
        const cloudSnapshot = await pullCloudState(uid); assertSession(uid, epoch);
        await importLocalAppSnapshot(cloudSnapshot ?? emptySnapshot(), false); await clearDurableSyncJournal();
        cloudRevisionRef.current = metadata.revision; saveRevision(uid, metadata.revision);
        const queuedRepair = await queueCreatorDependencyRepairs(uid);
        if (await hasDurableSyncDirtyRecords()) await pushDirty(uid, epoch);
        if (queuedRepair && !(await hasDurableSyncDirtyRecords())) markCreatorRepairDone(uid);
        notifyStorageRefreshNeeded(); setAppStateNonce((value) => value + 1);
      } else {
        const checkpointMatches = owner === uid && readSavedLocalMutationRevision(uid) === readLocalMutationRevision();
        const hasJournal = await hasDurableSyncDirtyRecords();
        const needsSafetyReconcile = !safetyReconcileDone(uid);
        if (owner === null || needsSafetyReconcile) await recoverMissingDirtyJournal(uid, true);
        else await recoverMissingDirtyJournal(uid);
        // Normal launches resume incrementally. The first launch on the hardened
        // sync model (and anonymous-device login) replays from revision zero once
        // so old journal/cursor corruption cannot strand account records.
        cloudRevisionRef.current = owner === uid && !needsSafetyReconcile && (checkpointMatches || hasJournal)
          ? Math.min(readSavedRevision(uid), metadata.revision)
          : 0;
        saveRevision(uid, cloudRevisionRef.current);
        await applyIncrementalCloud(uid, epoch);
        if (await hasDurableSyncDirtyRecords()) await pushDirty(uid, epoch);
        const queuedRepair = await queueCreatorDependencyRepairs(uid);
        if (await hasDurableSyncDirtyRecords()) await pushDirty(uid, epoch);
        if (queuedRepair && !(await hasDurableSyncDirtyRecords())) markCreatorRepairDone(uid);
      }
      assertSession(uid, epoch);
      setLocalDataOwnerId(uid);
      await checkpointLocalMutation(uid);
      if (!(await hasDurableSyncDirtyRecords())) markSafetyReconcileDone(uid);
      initializedUidRef.current = uid; setSyncStatus("idle"); readyRef.current = true; setReady(true);
    } catch (error) {
      if (error instanceof Error && error.message === "cloud-sync-session-changed") return;
      setSyncStatus("error"); setSyncError(describeSyncError(error));
      if (!switchingAccounts) { readyRef.current = true; setReady(true); }
    }
  }

  function scheduleSync(delay = 75) {
    if (!userRef.current || !readyRef.current) return;
    clearSyncTimer();
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void runExclusive(() => syncOnce()).catch(() => {});
    }, delay);
  }

  useEffect(() => {
    if (!firebaseEnabled) return;
    let cancelled = false;
    const unsubscribe = onGoogleAuthStateChanged((nextUser) => {
      if (cancelled) return;
      authEpochRef.current += 1; const epoch = authEpochRef.current;
      userRef.current = nextUser; setUser(nextUser); clearSyncTimer(); clearRetryTimer();
      if (!nextUser) {
        initializedUidRef.current = null; cloudRevisionRef.current = 0; setReady(true); setSyncStatus("idle"); setSyncError(""); return;
      }
      if (initializedUidRef.current === nextUser.uid && readyRef.current) return;
      void runExclusive(() => initializeUser(nextUser, epoch));
    });
    void resolveGoogleRedirectLogin().catch((error) => { if (!cancelled) { setSyncStatus("error"); setSyncError(`Google login redirect failed: ${describeSyncError(error)}`); } });
    return () => { cancelled = true; clearSyncTimer(); clearRetryTimer(); unsubscribe(); };
  }, []);

  useEffect(() => { if (!firebaseEnabled || !user || !ready) return; return onCloudSyncNeeded(() => scheduleSync()); }, [ready, user]);
  useEffect(() => {
    if (!firebaseEnabled || !user || !ready) return;
    const reconcile = (revisionHint?: CloudStateMetadata | null) => void runExclusive(() => syncOnce(user, revisionHint)).catch(() => {});
    // Listen only to the tiny account state document. A revision change wakes
    // incremental sync immediately; the slow interval remains only as a fallback.
    const unsubscribeCloud = onCloudStateChanged(user.uid, (metadata) => {
      if (!metadata) return;
      if (metadata.version < CLOUD_SCHEMA_VERSION || metadata.revision > cloudRevisionRef.current) reconcile(metadata);
    }, () => { scheduleRetry(); });
    const online = () => reconcile();
    const focus = () => reconcile();
    const visibility = () => {
      if (document.visibilityState === "visible") reconcile();
      else void hasDurableSyncDirtyRecords().then((dirty) => { if (dirty) reconcile(); });
    };
    const pageHide = () => { void hasDurableSyncDirtyRecords().then((dirty) => { if (dirty) reconcile(); }); };
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") reconcile(); }, CLOUD_RECONCILE_INTERVAL_MS);
    window.addEventListener("online", online);
    window.addEventListener("focus", focus);
    window.addEventListener("pagehide", pageHide);
    document.addEventListener("visibilitychange", visibility);
    reconcile();
    return () => {
      unsubscribeCloud();
      window.removeEventListener("online", online);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", pageHide);
      document.removeEventListener("visibilitychange", visibility);
      window.clearInterval(interval);
    };
  }, [ready, user]);

  const value = useMemo<AccountSyncContextValue>(() => ({
    ready, firebaseEnabled, user, syncStatus, syncError, appStateNonce, loginPending,
    login: async () => {
      if (loginInFlightRef.current) return; loginInFlightRef.current = true; setLoginPending(true); setSyncError("");
      try { await googleLogin(); } finally { loginInFlightRef.current = false; setLoginPending(false); }
    },
    logout: async () => {
      const active = userRef.current;
      if (active) {
        await recoverMissingDirtyJournal(active.uid);
        if (await hasDurableSyncDirtyRecords()) {
          await runExclusive(() => syncOnce(active));
          if (await hasDurableSyncDirtyRecords()) throw new Error("Logout cancelled because some local changes could not be synced. Your local data has been preserved; try again when cloud sync succeeds.");
        }
      }
      await googleLogout();
    },
  }), [appStateNonce, loginPending, ready, syncError, syncStatus, user]);

  return <AccountSyncContext.Provider value={value}>{ready ? children : null}</AccountSyncContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccountSync() { const context = useContext(AccountSyncContext); if (!context) throw new Error("useAccountSync must be used within AccountSyncProvider"); return context; }
