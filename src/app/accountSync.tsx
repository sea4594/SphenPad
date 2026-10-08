import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { exportLocalAppSnapshot, exportLocalAppSnapshotMetadata, importLocalAppSnapshot, mergeSnapshots, type LocalAppSnapshot } from "../core/appState";
import { getLocalDataOwnerId, readLocalMutationRevision, setLocalDataOwnerId } from "../core/localDataState";
import { puzzleToCloudPayload } from "../core/puzzleSync";
import { acknowledgeSyncDirty, clearSyncJournal, hasSyncDirtyRecords, markAllSyncDirty, readSyncDirtyRecords, type SyncDirtyRecord } from "../core/syncJournal";
import { notifyStorageRefreshNeeded, onCloudSyncNeeded } from "../core/syncSignal";
import { applyRemoteStorageChanges, readAllSyncKeys, readCreatorProjectForSync, readFolderForSync, readPuzzleRowForSync } from "../core/storage";
import {
  CLOUD_SCHEMA_VERSION, type CloudChange, firebaseEnabled, googleLogin, googleLogout, onCloudStateChanged, onGoogleAuthStateChanged, pullCloudChanges, pullCloudState,
  migrateCloudToCurrentSchema, pullCloudStateMetadata, pushCloudChanges, resolveGoogleRedirectLogin, snapshotToCloudChanges,
} from "../firebase/client";

type SyncStatus = "idle" | "syncing" | "error";
const CLOUD_RECONCILE_INTERVAL_MS = 5 * 60_000;
const REVISION_KEY_PREFIX = "sphenpad-cloud-revision-v3:";
const LOCAL_MUTATION_CHECKPOINT_KEY_PREFIX = "sphenpad-cloud-local-mutation-v1:";

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
function saveRevision(uid: string, revision: number) { try { localStorage.setItem(`${REVISION_KEY_PREFIX}${uid}`, String(revision)); } catch { /* best effort */ } }
function readSavedLocalMutationRevision(uid: string) {
  try { const value = Number(localStorage.getItem(`${LOCAL_MUTATION_CHECKPOINT_KEY_PREFIX}${uid}`)); return Number.isFinite(value) && value >= 0 ? value : 0; } catch { return 0; }
}
function saveLocalMutationRevision(uid: string, revision: number) {
  try { localStorage.setItem(`${LOCAL_MUTATION_CHECKPOINT_KEY_PREFIX}${uid}`, String(revision)); } catch { /* best effort */ }
}

function overlayDirtyLocalState(merged: LocalAppSnapshot, local: LocalAppSnapshot, dirty: SyncDirtyRecord[]): LocalAppSnapshot {
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
    const keys = await readAllSyncKeys();
    if (keys.puzzleKeys.length || keys.folderIds.length || keys.creatorProjectKeys.length) markAllSyncDirty(keys, false);
  }
  function checkpointLocalMutation(uid: string) {
    if (!hasSyncDirtyRecords()) saveLocalMutationRevision(uid, readLocalMutationRevision());
  }
  async function queueCreatorDependencyRepairs() {
    const keys = await readAllSyncKeys();
    if (!keys.creatorProjectKeys.length) return;
    markAllSyncDirty({ puzzleKeys: keys.creatorProjectKeys, folderIds: [], creatorProjectKeys: keys.creatorProjectKeys }, false);
  }

  async function buildDirtyChanges(records: SyncDirtyRecord[]): Promise<CloudChange[]> {
    const changes = new Map<string, CloudChange>();
    const put = (change: CloudChange) => changes.set(`${change.kind}:${change.key}`, change);
    for (const record of records) {
      if (record.kind === "puzzle") {
        const row = await readPuzzleRowForSync(record.key);
        const deletedAt = record.deletedAt ?? (row ? 0 : Date.now());
        if (deletedAt) { put({ kind: "puzzle", key: record.key, updatedAt: deletedAt, payload: null }); continue; }
        const payload = puzzleToCloudPayload(record.key, row!.data);
        if (payload.creatorProjectKey) {
          let creator = await readCreatorProjectForSync(payload.creatorProjectKey);
          if (!creator) { await readAllSyncKeys(); creator = await readCreatorProjectForSync(payload.creatorProjectKey); }
          if (creator && !creator.deletedAt) {
            put({ kind: "creatorProject", key: creator.key, updatedAt: creator.updatedAt, payload: creator });
          } else {
            // Last-resort recovery copy: never create another creator progress
            // record that cannot materialize without a separate project document.
            payload.def = row!.data.def;
          }
        }
        put({ kind: "puzzle", key: record.key, updatedAt: row!.data.updatedAt, payload });
      } else if (record.kind === "folder") {
        const row = await readFolderForSync(record.key);
        const deletedAt = record.deletedAt ?? row?.deletedAt ?? (row ? 0 : Date.now());
        put({ kind: "folder", key: record.key, updatedAt: deletedAt || row!.updatedAt, payload: deletedAt ? null : row });
      } else {
        const row = await readCreatorProjectForSync(record.key);
        const deletedAt = record.deletedAt ?? row?.deletedAt ?? (row ? 0 : Date.now());
        put({ kind: "creatorProject", key: record.key, updatedAt: deletedAt || row!.updatedAt, payload: deletedAt ? null : row });
      }
    }
    return [...changes.values()];
  }

  async function applyIncrementalCloud(uid: string, epoch: number) {
    assertSession(uid, epoch);
    const result = await pullCloudChanges(uid, cloudRevisionRef.current);
    assertSession(uid, epoch);
    if (result.version < CLOUD_SCHEMA_VERSION) return false;
    if (result.changes.length) {
      await applyRemoteStorageChanges({
        creatorProjects: result.changes.filter((c) => c.kind === "creatorProject").map((c) => ({ key: c.key, updatedAt: c.updatedAt, data: c.payload })),
        folders: result.changes.filter((c) => c.kind === "folder").map((c) => ({ key: c.key, updatedAt: c.updatedAt, data: c.payload })),
        puzzles: result.changes.filter((c) => c.kind === "puzzle").map((c) => ({ key: c.key, updatedAt: c.updatedAt, data: c.payload })),
      }, false);
      assertSession(uid, epoch);
      notifyStorageRefreshNeeded(); setAppStateNonce((value) => value + 1);
    }
    cloudRevisionRef.current = result.revision; saveRevision(uid, result.revision);
    return true;
  }

  async function pushDirty(uid: string, epoch: number) {
    for (let attempt = 0; attempt < 4; attempt++) {
      assertSession(uid, epoch);
      const dirty = readSyncDirtyRecords();
      if (!dirty.length) return;
      const metadata = await pullCloudStateMetadata(uid); assertSession(uid, epoch);
      if (metadata && metadata.version < CLOUD_SCHEMA_VERSION) { await migrateAccountSchema(uid, epoch); continue; }
      const remoteRevision = metadata?.revision ?? 0;
      if (remoteRevision !== cloudRevisionRef.current) { await applyIncrementalCloud(uid, epoch); continue; }
      const changes = await buildDirtyChanges(dirty); assertSession(uid, epoch);
      try {
        const result = await pushCloudChanges(uid, changes, cloudRevisionRef.current); assertSession(uid, epoch);
        cloudRevisionRef.current = result.revision; saveRevision(uid, result.revision);
        acknowledgeSyncDirty(dirty);
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
      const dirtyBefore = readSyncDirtyRecords();
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
        acknowledgeSyncDirty(dirtyBefore);
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

  async function syncOnce(activeUser = userRef.current) {
    if (!activeUser || !readyRef.current) return;
    const uid = activeUser.uid; const epoch = authEpochRef.current;
    setSyncError("");
    try {
      await recoverMissingDirtyJournal(uid); assertSession(uid, epoch);
      const metadata = await pullCloudStateMetadata(uid); assertSession(uid, epoch);
      const needsMigration = Boolean(metadata?.version && metadata.version < CLOUD_SCHEMA_VERSION);
      const needsPull = !needsMigration && (metadata?.revision ?? 0) > cloudRevisionRef.current;
      const needsPush = hasSyncDirtyRecords();
      if (!needsMigration && !needsPull && !needsPush) {
        checkpointLocalMutation(uid);
        if (syncStatus !== "idle") setSyncStatus("idle");
        retryCountRef.current = 0; clearRetryTimer();
        return;
      }
      setSyncStatus("syncing");
      if (needsMigration) await migrateAccountSchema(uid, epoch);
      else {
        if (needsPull) await applyIncrementalCloud(uid, epoch);
        if (hasSyncDirtyRecords()) await pushDirty(uid, epoch);
      }
      assertSession(uid, epoch); checkpointLocalMutation(uid); setSyncStatus("idle"); retryCountRef.current = 0; clearRetryTimer();
    } catch (error) {
      if (error instanceof Error && error.message === "cloud-sync-session-changed") return;
      setSyncStatus("error"); setSyncError(describeSyncError(error));
      if (hasSyncDirtyRecords()) scheduleRetry();
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
        // Reconstruct a lost dirty journal before another account is allowed to
        // replace this device's database.
        await recoverMissingDirtyJournal(owner!);
        if (hasSyncDirtyRecords()) throw new Error("Unsynced local changes still belong to the previously signed-in account. Sign back into that account and allow sync to finish before switching accounts.");
        const cloudSnapshot = await pullCloudState(uid); assertSession(uid, epoch);
        await importLocalAppSnapshot(cloudSnapshot ?? emptySnapshot(), false); clearSyncJournal();
        cloudRevisionRef.current = metadata?.version === CLOUD_SCHEMA_VERSION ? metadata.revision : 0; saveRevision(uid, cloudRevisionRef.current);
        if (metadata?.version === CLOUD_SCHEMA_VERSION) { await queueCreatorDependencyRepairs(); if (hasSyncDirtyRecords()) await pushDirty(uid, epoch); }
        notifyStorageRefreshNeeded(); setAppStateNonce((value) => value + 1);
      } else if (!metadata?.hasData) {
        cloudRevisionRef.current = 0; saveRevision(uid, 0);
        if (localMetadata.hasData) {
          // A cloud-empty account adopts every local record, including work
          // done before the user logged in on this device.
          markAllSyncDirty(await readAllSyncKeys(), false);
          await pushDirty(uid, epoch);
        }
      } else if (metadata.version < CLOUD_SCHEMA_VERSION) {
        await recoverMissingDirtyJournal(uid, owner === null && localMetadata.hasData);
        await migrateAccountSchema(uid, epoch);
      } else if (!localMetadata.hasData) {
        // A genuinely empty/new device can safely restore a full tolerant
        // snapshot. This also recovers old creator rows missing syncRevision.
        const cloudSnapshot = await pullCloudState(uid); assertSession(uid, epoch);
        await importLocalAppSnapshot(cloudSnapshot ?? emptySnapshot(), false); clearSyncJournal();
        cloudRevisionRef.current = metadata.revision; saveRevision(uid, metadata.revision);
        await queueCreatorDependencyRepairs(); if (hasSyncDirtyRecords()) await pushDirty(uid, epoch);
        notifyStorageRefreshNeeded(); setAppStateNonce((value) => value + 1);
      } else {
        // Never trust only a saved localStorage cloud cursor at login. Replaying
        // v3 changes from zero recovers missing IndexedDB rows and includes
        // tombstones, while dirty local work is protected by storage conflict rules.
        // Treat every existing local record as a candidate local change before
        // replaying the account from revision zero. This makes login resilient
        // even if the localStorage dirty journal was selectively lost while
        // IndexedDB still contains newer puzzle progress.
        await recoverMissingDirtyJournal(uid, true);
        cloudRevisionRef.current = 0; saveRevision(uid, 0);
        await applyIncrementalCloud(uid, epoch);
        if (hasSyncDirtyRecords()) await pushDirty(uid, epoch);
      }
      assertSession(uid, epoch); setLocalDataOwnerId(uid); checkpointLocalMutation(uid); initializedUidRef.current = uid; setSyncStatus("idle"); readyRef.current = true; setReady(true);
    } catch (error) {
      if (error instanceof Error && error.message === "cloud-sync-session-changed") return;
      setSyncStatus("error"); setSyncError(describeSyncError(error));
      // Same-account/offline failures may continue using local data. Cross-account restore failures stay gated.
      if (!switchingAccounts) { readyRef.current = true; setReady(true); }
    }
  }

  function scheduleSync(delay = 800) {
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
    const reconcile = () => void runExclusive(() => syncOnce(user)).catch(() => {});
    // Listen only to the tiny account state document. A revision change wakes
    // incremental sync immediately; the slow interval remains only as a fallback.
    const unsubscribeCloud = onCloudStateChanged(user.uid, (metadata) => {
      if (!metadata) return;
      if (metadata.version < CLOUD_SCHEMA_VERSION || metadata.revision > cloudRevisionRef.current) reconcile();
    }, () => { if (hasSyncDirtyRecords()) scheduleRetry(); });
    const online = () => reconcile();
    const focus = () => reconcile();
    const visibility = () => {
      if (document.visibilityState === "visible") reconcile();
      else if (hasSyncDirtyRecords()) reconcile();
    };
    const pageHide = () => { if (hasSyncDirtyRecords()) reconcile(); };
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
        if (hasSyncDirtyRecords()) {
          await runExclusive(() => syncOnce(active));
          if (hasSyncDirtyRecords()) throw new Error("Logout cancelled because some local changes could not be synced. Your local data has been preserved; try again when cloud sync succeeds.");
        }
      }
      await googleLogout();
    },
  }), [appStateNonce, loginPending, ready, syncError, syncStatus, user]);

  return <AccountSyncContext.Provider value={value}>{ready ? children : null}</AccountSyncContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccountSync() { const context = useContext(AccountSyncContext); if (!context) throw new Error("useAccountSync must be used within AccountSyncProvider"); return context; }
