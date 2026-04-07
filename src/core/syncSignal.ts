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
