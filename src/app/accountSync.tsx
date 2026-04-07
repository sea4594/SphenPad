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
import { exportLocalAppSnapshot, hasLocalAppSnapshotData, importLocalAppSnapshot } from "../core/appState";
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
  appStateNonce: number;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AccountSyncContext = createContext<AccountSyncContextValue | null>(null);

function snapshotPuzzleKeys(snapshot: CloudAppSnapshot | null): string[] {
  if (!snapshot) return [];
  return snapshot.puzzles.map((row) => row.key);
}

export function AccountSyncProvider(props: { children: ReactNode }) {
  const { children } = props;
  const [ready, setReady] = useState(!firebaseEnabled);
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState("");
  const [appStateNonce, setAppStateNonce] = useState(0);
  const initializedUserIdRef = useRef<string | null>(null);
  const readyRef = useRef(ready);
  const syncTimeoutRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const syncRequestedRef = useRef(false);
  const restoringRef = useRef(false);
  const cloudPuzzleKeysRef = useRef<string[]>([]);

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
  }

  async function initializeUserState(activeUser: User) {
    restoringRef.current = true;
    setReady(false);
    setSyncError("");
    setSyncStatus("syncing");

    try {
      const [cloudSnapshot, localSnapshot] = await Promise.all([
        pullCloudState(activeUser.uid),
        exportLocalAppSnapshot(),
      ]);

      cloudPuzzleKeysRef.current = snapshotPuzzleKeys(cloudSnapshot);

      if (!cloudSnapshot) {
        await uploadLocalSnapshot(activeUser);
        initializedUserIdRef.current = activeUser.uid;
        setSyncStatus("idle");
        setReady(true);
        return;
      }

      const localHasData = hasLocalAppSnapshotData(localSnapshot);
      const localIsNewer = localHasData && localSnapshot.updatedAt > cloudSnapshot.updatedAt;

      if (localIsNewer) {
        await pushCloudState(activeUser.uid, localSnapshot, cloudPuzzleKeysRef.current);
        cloudPuzzleKeysRef.current = localSnapshot.puzzles.map((row) => row.key);
      } else {
        await importLocalAppSnapshot(cloudSnapshot, false);
        setAppStateNonce((current) => current + 1);
      }

      initializedUserIdRef.current = activeUser.uid;
      setSyncStatus("idle");
      setReady(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSyncStatus("error");
      setSyncError(message);
      setReady(true);
    } finally {
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
    void resolveGoogleRedirectLogin().catch(() => {});

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

  const value = useMemo<AccountSyncContextValue>(
    () => ({
      ready,
      firebaseEnabled,
      user,
      syncStatus,
      syncError,
      appStateNonce,
      login: async () => {
        setSyncError("");
        await googleLogin();
      },
      logout: async () => {
        clearScheduledSync();
        syncRequestedRef.current = false;
        await googleLogout();
      },
    }),
    [appStateNonce, ready, syncError, syncStatus, user],
  );

  return <AccountSyncContext.Provider value={value}>{children}</AccountSyncContext.Provider>;
}

export function useAccountSync() {
  const context = useContext(AccountSyncContext);
  if (!context) throw new Error("useAccountSync must be used within AccountSyncProvider");
  return context;
}
