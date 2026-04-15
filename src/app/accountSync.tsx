import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import {
  exportLocalAppSnapshot,
  exportLocalAppSnapshotMetadata,
  hasLocalAppSnapshotData,
  importLocalAppSnapshot,
  mergeSnapshots,
} from "../core/appState";
import { getLocalDataOwnerId, readLocalDataUpdatedAt, setLocalDataOwnerId } from "../core/localDataState";
import { onCloudSyncNeeded } from "../core/syncSignal";
import { notifyStorageRefreshNeeded } from "../core/syncSignal";
import {
  type CloudStateMetadata,
  firebaseEnabled,
  googleLogin,
  googleLogout,
  onGoogleAuthStateChanged,
  pullCloudStateMetadata,
  pullCloudState,
  resolveGoogleRedirectLogin,
  pushCloudState,
  type CloudAppSnapshot,
} from "../firebase/client";

type SyncStatus = "idle" | "syncing" | "error";

const CLOUD_RECONCILE_INTERVAL_MS = 45_000;

type AccountSyncContextValue = {
  ready: boolean;
  firebaseEnabled: boolean;
  user: User | null;
  syncStatus: SyncStatus;
  syncError: string;
  appStateNonce: number;
  loginPending: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AccountSyncContext = createContext<AccountSyncContextValue | null>(null);

function snapshotPuzzleKeys(snapshot: CloudAppSnapshot | null): string[] {
  if (!snapshot) return [];
  return snapshot.puzzles.map((row) => row.key);
}

function metadataPuzzleKeys(snapshot: CloudStateMetadata | null): string[] {
  if (!snapshot) return [];
  return snapshot.puzzleKeys;
}

function havePuzzleKeysChanged(previous: string[], next: string[]): boolean {
  if (previous.length !== next.length) return true;
  const previousSet = new Set(previous);
  for (const key of next) {
    if (!previousSet.has(key)) return true;
  }
  return false;
}

function sameLocalStorageSnapshot(
  a: CloudAppSnapshot["localStorage"],
  b: CloudAppSnapshot["localStorage"],
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key as keyof typeof a] !== b[key as keyof typeof b]) return false;
  }
  return true;
}

function snapshotNeedsLocalApply(local: CloudAppSnapshot, merged: CloudAppSnapshot): boolean {
  if (local.updatedAt !== merged.updatedAt) return true;
  if (local.puzzles.length !== merged.puzzles.length) return true;
  if (local.folders.length !== merged.folders.length) return true;
  if (!sameLocalStorageSnapshot(local.localStorage, merged.localStorage)) return true;

  const localPuzzleUpdatedAt = new Map(local.puzzles.map((row) => [row.key, row.data.updatedAt ?? 0]));
  for (const row of merged.puzzles) {
    if (!localPuzzleUpdatedAt.has(row.key)) return true;
    if (localPuzzleUpdatedAt.get(row.key) !== (row.data.updatedAt ?? 0)) return true;
  }

  const localFolderUpdatedAt = new Map(local.folders.map((folder) => [folder.id, folder.updatedAt]));
  for (const folder of merged.folders) {
    if (!localFolderUpdatedAt.has(folder.id)) return true;
    if (localFolderUpdatedAt.get(folder.id) !== folder.updatedAt) return true;
  }

  return false;
}

function makeEmptySnapshot(): CloudAppSnapshot {
  return {
    version: 1,
    updatedAt: 0,
    localStorage: {},
    folders: [],
    puzzles: [],
  };
}

export function AccountSyncProvider(props: { children: ReactNode }) {
  const { children } = props;
  const [ready, setReady] = useState(!firebaseEnabled);
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState("");
  const [appStateNonce, setAppStateNonce] = useState(0);
  const [loginPending, setLoginPending] = useState(false);
  const initializedUserIdRef = useRef<string | null>(null);
  const readyRef = useRef(ready);
  const syncTimeoutRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const syncRequestedRef = useRef(false);
  const reconcileInFlightRef = useRef(false);
  const reconcileRequestedRef = useRef(false);
  const restoringRef = useRef(false);
  const initializingForUidRef = useRef<string | null>(null);
  const loginInFlightRef = useRef(false);
  const cloudPuzzleKeysRef = useRef<string[]>([]);
  const lastSuccessfulSyncAtRef = useRef(0);
  const cloudMetadataUpdatedAtRef = useRef(0);

  function clearScheduledSync() {
    if (syncTimeoutRef.current != null) {
      window.clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }

  function updateCloudSyncPointers(updatedAt: number, puzzleKeys: string[]) {
    cloudPuzzleKeysRef.current = puzzleKeys;
    lastSuccessfulSyncAtRef.current = updatedAt;
    cloudMetadataUpdatedAtRef.current = updatedAt;
  }

  async function uploadLocalSnapshot(activeUser: User) {
    const localSnapshot = await exportLocalAppSnapshot();
    await pushCloudState(activeUser.uid, localSnapshot, cloudPuzzleKeysRef.current);
    updateCloudSyncPointers(
      localSnapshot.updatedAt,
      localSnapshot.puzzles.map((row) => row.key),
    );
  }

  async function reconcileLocalAndCloud(activeUser: User) {
    const [cloudSnapshot, localSnapshot] = await Promise.all([
      pullCloudState(activeUser.uid),
      exportLocalAppSnapshot(),
    ]);
    const cloudPuzzleKeys = snapshotPuzzleKeys(cloudSnapshot);

    if (!cloudSnapshot && hasLocalAppSnapshotData(localSnapshot)) {
      await uploadLocalSnapshot(activeUser);
      return;
    }

    if (cloudSnapshot && !hasLocalAppSnapshotData(localSnapshot)) {
      await importLocalAppSnapshot(cloudSnapshot, false);
      updateCloudSyncPointers(cloudSnapshot.updatedAt, cloudPuzzleKeys);
      notifyStorageRefreshNeeded();
      setAppStateNonce((n) => n + 1);
      return;
    }

    if (!cloudSnapshot) {
      updateCloudSyncPointers(0, []);
      return;
    }

    const merged = mergeSnapshots(localSnapshot, cloudSnapshot);
    if (snapshotNeedsLocalApply(localSnapshot, merged)) {
      await importLocalAppSnapshot(merged, false);
      notifyStorageRefreshNeeded();
      setAppStateNonce((n) => n + 1);
    }

    await pushCloudState(activeUser.uid, merged, cloudPuzzleKeys);
    updateCloudSyncPointers(
      merged.updatedAt,
      merged.puzzles.map((row) => row.key),
    );
  }

  async function reconcileCloudUpdates(activeUser: User, force = false) {
    if (syncInFlightRef.current || restoringRef.current) {
      reconcileRequestedRef.current = true;
      return;
    }
    if (reconcileInFlightRef.current) {
      reconcileRequestedRef.current = true;
      return;
    }

    reconcileInFlightRef.current = true;

    try {
      const cloudMetadata = await pullCloudStateMetadata(activeUser.uid);
      if (!cloudMetadata || !cloudMetadata.hasData) {
        if (readLocalDataUpdatedAt() > lastSuccessfulSyncAtRef.current) {
          setSyncStatus("syncing");
          setSyncError("");
          await uploadLocalSnapshot(activeUser);
          setSyncStatus("idle");
        } else {
          updateCloudSyncPointers(0, []);
        }
        return;
      }

      const nextPuzzleKeys = metadataPuzzleKeys(cloudMetadata);
      const remoteChanged =
        cloudMetadata.updatedAt > cloudMetadataUpdatedAtRef.current ||
        havePuzzleKeysChanged(cloudPuzzleKeysRef.current, nextPuzzleKeys);

      if (!force && !remoteChanged) {
        cloudPuzzleKeysRef.current = nextPuzzleKeys;
        cloudMetadataUpdatedAtRef.current = cloudMetadata.updatedAt;
        return;
      }

      cloudMetadataUpdatedAtRef.current = cloudMetadata.updatedAt;
      setSyncStatus("syncing");
      setSyncError("");
      await reconcileLocalAndCloud(activeUser);
      setSyncStatus("idle");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSyncStatus("error");
      setSyncError(message);
    } finally {
      reconcileInFlightRef.current = false;
      if (reconcileRequestedRef.current) {
        reconcileRequestedRef.current = false;
        window.setTimeout(() => {
          void reconcileCloudUpdates(activeUser);
        }, 350);
      }
    }
  }

  async function initializeUserState(activeUser: User) {
    if (initializingForUidRef.current === activeUser.uid) return;
    initializingForUidRef.current = activeUser.uid;
    restoringRef.current = true;
    setReady(false);
    setSyncError("");
    setSyncStatus("syncing");

    try {
      const [cloudMetadata, localMetadata] = await Promise.all([
        pullCloudStateMetadata(activeUser.uid),
        exportLocalAppSnapshotMetadata(),
      ]);

      const localOwnerId = getLocalDataOwnerId();
      const localBelongsToOtherAccount = localOwnerId !== null && localOwnerId !== activeUser.uid;
      const localUpdatedAt = localMetadata.updatedAt;
      const localLikelyHasData = localMetadata.hasData;
      const cloudLikelyHasData = Boolean(cloudMetadata?.hasData);

      if (
        cloudMetadata &&
        !localBelongsToOtherAccount &&
        localOwnerId === activeUser.uid &&
        localLikelyHasData &&
        localUpdatedAt === cloudMetadata.updatedAt
      ) {
        // Fast path: local and cloud snapshots already match for this account.
        updateCloudSyncPointers(cloudMetadata.updatedAt, metadataPuzzleKeys(cloudMetadata));
      } else if (localBelongsToOtherAccount) {
        if (!cloudLikelyHasData) {
          const empty = makeEmptySnapshot();
          await importLocalAppSnapshot(empty, false);
          updateCloudSyncPointers(0, []);
        } else {
          const cloudSnapshot = await pullCloudState(activeUser.uid);
          const safeCloud = cloudSnapshot ?? makeEmptySnapshot();
          await importLocalAppSnapshot(safeCloud, false);
          updateCloudSyncPointers(safeCloud.updatedAt, snapshotPuzzleKeys(cloudSnapshot));
        }
        notifyStorageRefreshNeeded();
        setAppStateNonce((n) => n + 1);
      } else if (!cloudMetadata || !cloudLikelyHasData) {
        if (localLikelyHasData) {
          await uploadLocalSnapshot(activeUser);
        } else {
          updateCloudSyncPointers(
            cloudMetadata?.updatedAt ?? 0,
            cloudMetadata ? metadataPuzzleKeys(cloudMetadata) : [],
          );
        }
      } else if (!localLikelyHasData) {
        const cloudSnapshot = await pullCloudState(activeUser.uid);
        const safeCloud = cloudSnapshot ?? makeEmptySnapshot();
        await importLocalAppSnapshot(safeCloud, false);
        updateCloudSyncPointers(safeCloud.updatedAt, snapshotPuzzleKeys(cloudSnapshot));
        notifyStorageRefreshNeeded();
        setAppStateNonce((n) => n + 1);
      } else {
        // Any mismatch with data on both sides gets merged to avoid clock-skew local-wins overwrites.
        await reconcileLocalAndCloud(activeUser);
      }

      // Stamp local data as belonging to this account so future logins (same or different
      // account) can be handled correctly.
      setLocalDataOwnerId(activeUser.uid);
      initializedUserIdRef.current = activeUser.uid;
      setSyncStatus("idle");
      setReady(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSyncStatus("error");
      setSyncError(message);
      setReady(true);
    } finally {
      initializingForUidRef.current = null;
      restoringRef.current = false;
    }
  }

  async function flushSync() {
    clearScheduledSync();
    if (!user || !ready || restoringRef.current) return;
    if (syncInFlightRef.current) {
      syncRequestedRef.current = true;
      return;
    }

    syncInFlightRef.current = true;
    syncRequestedRef.current = false;
    setSyncStatus("syncing");
    setSyncError("");

    try {
      await uploadLocalSnapshot(user);
      setSyncStatus("idle");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSyncStatus("error");
      setSyncError(message);
    } finally {
      syncInFlightRef.current = false;
      if (syncRequestedRef.current) {
        syncRequestedRef.current = false;
        syncTimeoutRef.current = window.setTimeout(() => {
          void flushSync();
        }, 800);
      }
    }
  }

  function scheduleSync() {
    if (!user || !ready || restoringRef.current) return;
    syncRequestedRef.current = true;
    clearScheduledSync();
    syncTimeoutRef.current = window.setTimeout(() => {
      void flushSync();
    }, 800);
  }

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    if (!firebaseEnabled) return;

    let cancelled = false;

    const unsubscribe = onGoogleAuthStateChanged((nextUser) => {
      if (cancelled) return;
      setUser(nextUser);
      clearScheduledSync();
      syncRequestedRef.current = false;

      if (!nextUser) {
        initializedUserIdRef.current = null;
        updateCloudSyncPointers(0, []);
        setSyncStatus("idle");
        setSyncError("");
        setReady(true);
        return;
      }

      if (initializedUserIdRef.current === nextUser.uid && readyRef.current) return;
      void initializeUserState(nextUser);
    });

    void (async () => {
      try {
        const redirectUser = await resolveGoogleRedirectLogin();
        if (cancelled || !redirectUser) return;
        setUser(redirectUser);
        if (initializedUserIdRef.current === redirectUser.uid && readyRef.current) return;
        await initializeUserState(redirectUser);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setSyncStatus("error");
        setSyncError(`Google login redirect failed: ${message}`);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      clearScheduledSync();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!firebaseEnabled || !user || !ready) return;
    return onCloudSyncNeeded(() => {
      scheduleSync();
    });
  }, [ready, user]);

  // Retry any dirty local changes as soon as the browser reports it is back online.
  useEffect(() => {
    if (!firebaseEnabled || !user || !ready) return;
    const handleOnline = () => {
      void reconcileCloudUpdates(user);
      if (readLocalDataUpdatedAt() > lastSuccessfulSyncAtRef.current) {
        scheduleSync();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [ready, user]);

  // Pull remote updates while this tab stays open so cross-device progress appears quickly.
  useEffect(() => {
    if (!firebaseEnabled || !user || !ready) return;

    void reconcileCloudUpdates(user);

    const handleFocus = () => {
      void reconcileCloudUpdates(user);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reconcileCloudUpdates(user);
      }
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void reconcileCloudUpdates(user);
      }
    }, CLOUD_RECONCILE_INTERVAL_MS);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, [ready, user]);

  const value = useMemo<AccountSyncContextValue>(
    () => ({
      ready,
      firebaseEnabled,
      user,
      syncStatus,
      syncError,
      appStateNonce,
      loginPending,
      login: async () => {
        if (loginInFlightRef.current) return;
        setSyncError("");
        loginInFlightRef.current = true;
        setLoginPending(true);
        try {
          await googleLogin();
        } finally {
          loginInFlightRef.current = false;
          setLoginPending(false);
        }
      },
      logout: async () => {
        clearScheduledSync();
        syncRequestedRef.current = false;
        await googleLogout();
      },
    }),
    [appStateNonce, ready, syncError, syncStatus, user, loginPending],
  );

  return <AccountSyncContext.Provider value={value}>{children}</AccountSyncContext.Provider>;
}

export function useAccountSync() {
  const context = useContext(AccountSyncContext);
  if (!context) throw new Error("useAccountSync must be used within AccountSyncProvider");
  return context;
}
