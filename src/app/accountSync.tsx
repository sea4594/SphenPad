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
import { exportLocalAppSnapshot, hasLocalAppSnapshotData, importLocalAppSnapshot, mergeSnapshots } from "../core/appState";
import { getLocalDataOwnerId, readLocalDataUpdatedAt, setLocalDataOwnerId } from "../core/localDataState";
import { onCloudSyncNeeded } from "../core/syncSignal";
import {
  firebaseEnabled,
  googleLogin,
  googleLogout,
  onGoogleAuthStateChanged,
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
  loginPending: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AccountSyncContext = createContext<AccountSyncContextValue | null>(null);

function snapshotPuzzleKeys(snapshot: CloudAppSnapshot | null): string[] {
  if (!snapshot) return [];
  return snapshot.puzzles.map((row) => row.key);
}

function snapshotSignature(snapshot: CloudAppSnapshot) {
  const puzzleSig = snapshot.puzzles
    .map((row) => `${row.key}:${row.data.updatedAt || 0}`)
    .sort()
    .join("|");
  const folderSig = snapshot.folders
    .map((folder) => `${folder.id}:${folder.updatedAt}`)
    .sort()
    .join("|");
  const localStorageSig = JSON.stringify(snapshot.localStorage);
  return `${snapshot.updatedAt}::${localStorageSig}::${folderSig}::${puzzleSig}`;
}

export function AccountSyncProvider(props: { children: ReactNode }) {
  const { children } = props;
  const [ready, setReady] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const initializedUserIdRef = useRef<string | null>(null);
  const readyRef = useRef(ready);
  const syncTimeoutRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const syncRequestedRef = useRef(false);
  const restoringRef = useRef(false);
  const initializingForUidRef = useRef<string | null>(null);
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
    setSyncError("");
    setSyncStatus("syncing");

    try {
      const [cloudSnapshot, localSnapshot] = await Promise.all([
        pullCloudState(activeUser.uid),
        exportLocalAppSnapshot(),
      ]);

      cloudPuzzleKeysRef.current = snapshotPuzzleKeys(cloudSnapshot);

      const localOwnerId = getLocalDataOwnerId();
      const localBelongsToOtherAccount = localOwnerId !== null && localOwnerId !== activeUser.uid;

      if (localBelongsToOtherAccount) {
        // Case: local data is from a different Google account — restore this account's cloud,
        // discard local so account A's data can never pollute account B (or vice-versa).
        const safeCloud = cloudSnapshot ?? {
          version: 1 as const,
          updatedAt: 0,
          localStorage: {},
          folders: [],
          puzzles: [],
        };
        if (snapshotSignature(localSnapshot) !== snapshotSignature(safeCloud)) {
          await importLocalAppSnapshot(safeCloud, false);
        }
        cloudPuzzleKeysRef.current = snapshotPuzzleKeys(cloudSnapshot);
        lastSuccessfulSyncAtRef.current = safeCloud.updatedAt;
      } else if (!cloudSnapshot) {
        // No cloud data for this account yet — upload everything local (first login ever, or
        // first login on this account from this device with anonymous local data).
        await uploadLocalSnapshot(activeUser);
      } else if (!hasLocalAppSnapshotData(localSnapshot)) {
        // Cloud has data but local is empty — straightforward restore.
        if (snapshotSignature(localSnapshot) !== snapshotSignature(cloudSnapshot)) {
          await importLocalAppSnapshot(cloudSnapshot, false);
        }
        lastSuccessfulSyncAtRef.current = cloudSnapshot.updatedAt;
      } else {
        // Both sides have data (first login on this device with prior local work, OR same
        // account re-login after offline work, OR any diverged state).
        // Merge: union of all puzzles and folders, per-item newer timestamp wins.
        const merged = mergeSnapshots(localSnapshot, cloudSnapshot);
        if (snapshotSignature(localSnapshot) !== snapshotSignature(merged)) {
          await importLocalAppSnapshot(merged, false);
        }
        // Push the merged result back so the cloud also reflects any locally-only items.
        await pushCloudState(activeUser.uid, merged, cloudPuzzleKeysRef.current);
        cloudPuzzleKeysRef.current = merged.puzzles.map((r: { key: string }) => r.key);
        lastSuccessfulSyncAtRef.current = merged.updatedAt;
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

      // Keep startup non-blocking: show local data immediately and sync/merge in background.
      if (!readyRef.current) setReady(true);
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
      loginPending,
      login: async () => {
        if (loginPending) return;
        setSyncError("");
        setLoginPending(true);
        try {
          await googleLogin();
        } finally {
          setLoginPending(false);
        }
      },
      logout: async () => {
        clearScheduledSync();
        syncRequestedRef.current = false;
        await googleLogout();
      },
    }),
    [ready, syncError, syncStatus, user, loginPending],
  );

  return <AccountSyncContext.Provider value={value}>{children}</AccountSyncContext.Provider>;
}

export function useAccountSync() {
  const context = useContext(AccountSyncContext);
  if (!context) throw new Error("useAccountSync must be used within AccountSyncProvider");
  return context;
}
