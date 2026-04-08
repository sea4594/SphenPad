type SyncListener = () => void;

const listeners = new Set<SyncListener>();

export function onCloudSyncNeeded(listener: SyncListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyCloudSyncNeeded() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignore listener failures so other subscribers still run.
    }
  }
}

const refreshListeners = new Set<SyncListener>();

/** Subscribe to notifications that local storage data has been rewritten by a cloud sync. */
export function onStorageRefreshNeeded(listener: SyncListener) {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

/** Notify all UI listeners that IndexedDB data has been replaced and should be re-queried. */
export function notifyStorageRefreshNeeded() {
  for (const listener of refreshListeners) {
    try {
      listener();
    } catch {
      // Ignore listener failures so other subscribers still run.
    }
  }
}
