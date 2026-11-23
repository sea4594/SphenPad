/**
 * Small stale-while-revalidate cache for the two PUBLIC Import catalogs.
 * This database is independent of puzzle/progress/account storage.
 * Never cache puzzle payloads or personal information here.
 */
export type ImportCatalog = "ctc" | "lmg";

export type CatalogSnapshot = {
  entries: unknown[];
  fingerprint: string;
  checkedAt: number;
};

type StoredCatalog = CatalogSnapshot & { key: string; schema: number };

const DB_NAME = "sphenpad-import-catalog-cache";
const STORE_NAME = "manifests";
const SCHEMA_VERSION = 1;
const REVALIDATE_AFTER_MS = 15 * 60 * 1000;
const FAILURE_RETRY_MS = 2 * 60 * 1000;
const memory = new Map<string, CatalogSnapshot>();
const reads = new Map<string, Promise<CatalogSnapshot | null>>();
const updates = new Map<string, Promise<CatalogSnapshot | null>>();
const retryAfter = new Map<string, number>();
let dbPromise: Promise<IDBDatabase | null> | undefined;

function keyFor(catalog: ImportCatalog, url: string): string {
  return `${catalog}:${url}`;
}

function validEntries(catalog: ImportCatalog, entries: unknown): entries is unknown[] {
  return Array.isArray(entries)
    && (catalog === "lmg" || entries.length > 0)
    && entries.every((entry) => !!entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string");
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, SCHEMA_VERSION);
      let finished = false;
      const finish = (db: IDBDatabase | null) => {
        if (finished) return;
        finished = true;
        resolve(db);
      };
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = undefined;
        };
        finish(db);
      };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readStoredCatalog(key: string, catalog: ImportCatalog): Promise<CatalogSnapshot | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const row = request.result as StoredCatalog | undefined;
        if (!row || row.schema !== SCHEMA_VERSION || !validEntries(catalog, row.entries)
          || typeof row.checkedAt !== "number" || typeof row.fingerprint !== "string") {
          resolve(null);
          return;
        }
        resolve({ entries: row.entries, fingerprint: row.fingerprint, checkedAt: row.checkedAt });
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeStoredCatalog(key: string, snapshot: CatalogSnapshot): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, "readwrite")
        .objectStore(STORE_NAME).put({ key, schema: SCHEMA_VERSION, ...snapshot } satisfies StoredCatalog);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve(); // Storage quotas/private browsing must not block Import.
    } catch {
      resolve();
    }
  });
}

// Synchronous access for instant tab switches within a session.
export function peekCatalog(catalog: ImportCatalog, url: string): CatalogSnapshot | null {
  return memory.get(keyFor(catalog, url)) ?? null;
}

// IndexedDB is read once per catalog, then all callers share the same result.
export function readCatalog(catalog: ImportCatalog, url: string): Promise<CatalogSnapshot | null> {
  const key = keyFor(catalog, url);
  const warm = memory.get(key);
  if (warm) return Promise.resolve(warm);
  const existing = reads.get(key);
  if (existing) return existing;
  const promise = readStoredCatalog(key, catalog).then((snapshot) => {
    if (snapshot && !memory.has(key)) memory.set(key, snapshot);
    return memory.get(key) ?? null;
  }).finally(() => reads.delete(key));
  reads.set(key, promise);
  return promise;
}

async function fingerprintText(text: string): Promise<string> {
  // On supported HTTPS browsers, this avoids reparsing and re-rendering an unchanged catalog.
  if (typeof crypto === "undefined" || !crypto.subtle) return "";
  try {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

// Revalidates a catalog in the background. Never drops a usable cached snapshot
// if the network is unavailable or the published manifest is malformed.
export function refreshCatalog(catalog: ImportCatalog, url: string): Promise<CatalogSnapshot | null> {
  const key = keyFor(catalog, url);
  const inflight = updates.get(key);
  if (inflight) return inflight;
  const task = (async () => {
    const cached = await readCatalog(catalog, url);
    const now = Date.now();
    const age = cached ? now - cached.checkedAt : -1;
    if (cached && age >= 0 && age < REVALIDATE_AFTER_MS) return cached;
    if ((retryAfter.get(key) ?? 0) > now) return cached;
    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const fingerprint = await fingerprintText(text);
      if (cached && fingerprint && fingerprint === cached.fingerprint) {
        const updated = { ...cached, checkedAt: Date.now() };
        memory.set(key, updated);
        void writeStoredCatalog(key, updated);
        retryAfter.delete(key);
        return updated;
      }
      const json: unknown = JSON.parse(text);
      const entries = json && typeof json === "object" ? (json as { entries?: unknown }).entries : null;
      if (!validEntries(catalog, entries)) throw new Error("Invalid catalog manifest");
      const updated: CatalogSnapshot = { entries, fingerprint, checkedAt: Date.now() };
      memory.set(key, updated);
      void writeStoredCatalog(key, updated);
      retryAfter.delete(key);
      return updated;
    } catch {
      retryAfter.set(key, Date.now() + FAILURE_RETRY_MS);
      return memory.get(key) ?? cached;
    }
  })().finally(() => updates.delete(key));
  updates.set(key, task);
  return task;
}
