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
  const restoringRef = useRef(false);
  const initializingForUidRef = useRef<string | null>(null);
  const loginInFlightRef = useRef(false);
  const cloudPuzzleKeysRef = useRef<string[]>([]);
  const lastSuccessfulSyncAtRef = useRef(0);

  function clearScheduledSync() {
    if (syncTimeoutRef.current != null) {
      window.clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }

  async function uploadLocalSnapshot(activeUser: User) {
    const localSnapshot = await exportLocalAppSnapshot();
    await pushCloudState(activeUser.uid, localSnapshot, cloudPuzzleKeysRef.current);
    cloudPuzzleKeysRef.current = localSnapshot.puzzles.map((row) => row.key);
    lastSuccessfulSyncAtRef.current = localSnapshot.updatedAt;
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
        cloudPuzzleKeysRef.current = metadataPuzzleKeys(cloudMetadata);
        lastSuccessfulSyncAtRef.current = cloudMetadata.updatedAt;
      } else if (localBelongsToOtherAccount) {
        if (!cloudLikelyHasData) {
          const empty = makeEmptySnapshot();
          await importLocalAppSnapshot(empty, false);
          cloudPuzzleKeysRef.current = [];
          lastSuccessfulSyncAtRef.current = 0;
        } else {
          const cloudSnapshot = await pullCloudState(activeUser.uid);
          const safeCloud = cloudSnapshot ?? makeEmptySnapshot();
          await importLocalAppSnapshot(safeCloud, false);
          cloudPuzzleKeysRef.current = snapshotPuzzleKeys(cloudSnapshot);
          lastSuccessfulSyncAtRef.current = safeCloud.updatedAt;
        }
        notifyStorageRefreshNeeded();
        setAppStateNonce((n) => n + 1);
      } else if (!cloudMetadata || !cloudLikelyHasData) {
        if (localLikelyHasData) {
          await uploadLocalSnapshot(activeUser);
        } else {
          cloudPuzzleKeysRef.current = cloudMetadata ? metadataPuzzleKeys(cloudMetadata) : [];
          lastSuccessfulSyncAtRef.current = cloudMetadata?.updatedAt ?? 0;
        }
      } else if (!localLikelyHasData || (localOwnerId === activeUser.uid && localUpdatedAt < cloudMetadata.updatedAt)) {
        const cloudSnapshot = await pullCloudState(activeUser.uid);
        const safeCloud = cloudSnapshot ?? makeEmptySnapshot();
        await importLocalAppSnapshot(safeCloud, false);
        cloudPuzzleKeysRef.current = snapshotPuzzleKeys(cloudSnapshot);
        lastSuccessfulSyncAtRef.current = safeCloud.updatedAt;
        notifyStorageRefreshNeeded();
        setAppStateNonce((n) => n + 1);
      } else if (localOwnerId === activeUser.uid && localUpdatedAt > cloudMetadata.updatedAt) {
        await uploadLocalSnapshot(activeUser);
      } else {
        // Ambiguous diverged state: hydrate both sides once, merge safely, and reconcile cloud.
        const [cloudSnapshot, localSnapshot] = await Promise.all([
          pullCloudState(activeUser.uid),
          exportLocalAppSnapshot(),
        ]);
        cloudPuzzleKeysRef.current = snapshotPuzzleKeys(cloudSnapshot);

        if (!cloudSnapshot && hasLocalAppSnapshotData(localSnapshot)) {
          await uploadLocalSnapshot(activeUser);
        } else if (cloudSnapshot && !hasLocalAppSnapshotData(localSnapshot)) {
          await importLocalAppSnapshot(cloudSnapshot, false);
          lastSuccessfulSyncAtRef.current = cloudSnapshot.updatedAt;
          notifyStorageRefreshNeeded();
          setAppStateNonce((n) => n + 1);
        } else if (!cloudSnapshot) {
          cloudPuzzleKeysRef.current = [];
          lastSuccessfulSyncAtRef.current = 0;
        } else {
          const merged = mergeSnapshots(localSnapshot, cloudSnapshot);
          await importLocalAppSnapshot(merged, false);
          notifyStorageRefreshNeeded();
          setAppStateNonce((n) => n + 1);
          await pushCloudState(activeUser.uid, merged, cloudPuzzleKeysRef.current);
          cloudPuzzleKeysRef.current = merged.puzzles.map((r: { key: string }) => r.key);
          lastSuccessfulSyncAtRef.current = merged.updatedAt;
        }
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
        cloudPuzzleKeysRef.current = [];
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
      if (readLocalDataUpdatedAt() > lastSuccessfulSyncAtRef.current) {
        scheduleSync();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
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
