type SyncListener = () => void;
const listeners = new Set<SyncListener>();
const refreshListeners = new Set<SyncListener>();
const CHANNEL_NAME = "sphenpad-cloud-sync-v2";
let channel: BroadcastChannel | null = null;

function emitSyncNeeded() {
  for (const listener of listeners) { try { listener(); } catch { /* keep notifying */ } }
}
function getChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event) => { if (event.data === "dirty") emitSyncNeeded(); });
  return channel;
}
export function onCloudSyncNeeded(listener: SyncListener) {
  listeners.add(listener); getChannel();
  return () => { listeners.delete(listener); };
}
export function notifyCloudSyncNeeded() {
  emitSyncNeeded();
  try { getChannel()?.postMessage("dirty"); } catch { /* same-tab notification already fired */ }
}
export function onStorageRefreshNeeded(listener: SyncListener) { refreshListeners.add(listener); return () => { refreshListeners.delete(listener); }; }
export function notifyStorageRefreshNeeded() { for (const listener of refreshListeners) { try { listener(); } catch { /* keep notifying */ } } }
