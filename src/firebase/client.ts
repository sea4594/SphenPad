import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  where,
  writeBatch,
  deleteField,
} from "firebase/firestore";
import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { LocalAppSnapshot } from "../core/appState";
import type { PersistedPuzzle } from "../core/model";
import { puzzleFromCloudPayload, puzzleToCloudPayload, type CloudPuzzlePayload } from "../core/puzzleSync";
import type { CreatorProjectStorageRow, PuzzleFolder } from "../core/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};
const provider = new GoogleAuthProvider();
export const CLOUD_SCHEMA_VERSION = 3;
const MAX_WRITES_PER_COMMIT = 75;
const MAX_ESTIMATED_COMMIT_BYTES = 5 * 1024 * 1024;
const MAX_RECORD_PAYLOAD_BYTES = 850 * 1024;

export type CloudAppSnapshot = LocalAppSnapshot;
export type CloudStateMetadata = { version: number; updatedAt: number; hasData: boolean; revision: number };
export type CloudPuzzleChange = { kind: "puzzle"; key: string; updatedAt: number; payload: CloudPuzzlePayload | null };
export type CloudFolderChange = { kind: "folder"; key: string; updatedAt: number; payload: PuzzleFolder | null };
export type CloudCreatorProjectChange = { kind: "creatorProject"; key: string; updatedAt: number; payload: CreatorProjectStorageRow | null };
export type CloudChange = CloudPuzzleChange | CloudFolderChange | CloudCreatorProjectChange;
export type CloudChangesResult = { version: number; revision: number; updatedAt: number; changes: CloudChange[] };

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);
export const app: FirebaseApp | null = firebaseEnabled ? initializeApp(firebaseConfig) : null;
export const auth: Auth | null = firebaseEnabled && app ? getAuth(app) : null;
export const db: Firestore | null = firebaseEnabled && app ? getFirestore(app) : null;
let persistenceReadyPromise: Promise<void> | null = null;

function ensureAuthPersistence() {
  if (!firebaseEnabled || !auth) return Promise.resolve();
  if (!persistenceReadyPromise) persistenceReadyPromise = setPersistence(auth, browserLocalPersistence).catch(() => {});
  return persistenceReadyPromise;
}
if (firebaseEnabled && auth) void ensureAuthPersistence();
function isPopupFallbackError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "auth/popup-blocked" || code === "auth/web-storage-unsupported" || code === "auth/operation-not-supported-in-this-environment";
}
function isPopupBenignCancel(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "auth/cancelled-popup-request" || code === "auth/popup-closed-by-user";
}
function jsonReplacer(_key: string, value: unknown) { return value instanceof Set ? { __type: "Set", values: Array.from(value) } : value; }
function jsonReviver(_key: string, value: unknown) {
  if (value && typeof value === "object" && (value as { __type?: unknown }).__type === "Set" && Array.isArray((value as { values?: unknown[] }).values)) {
    return new Set((value as { values: unknown[] }).values);
  }
  return value;
}
function serialize(value: unknown) { return JSON.stringify(value, jsonReplacer); }
function deserialize<T>(payload: string) { return JSON.parse(payload, jsonReviver) as T; }
function docIdForKey(key: string) { return encodeURIComponent(key); }
function keyForDocId(docId: string) { try { return decodeURIComponent(docId); } catch { return docId; } }
function byteLength(value: string) { return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(value).byteLength : value.length * 2; }
function cleanCreatorProject(row: CreatorProjectStorageRow): CreatorProjectStorageRow { return { ...row, lastOpenedAt: 0 }; }
function cleanFolder(folder: PuzzleFolder): PuzzleFolder {
  return {
    id: folder.id, parentId: folder.parentId ?? null, name: folder.name, puzzleKeys: [...folder.puzzleKeys],
    createdAt: folder.createdAt, updatedAt: folder.updatedAt,
    ...(typeof folder.nameUpdatedAt === "number" ? { nameUpdatedAt: folder.nameUpdatedAt } : {}),
    ...(typeof folder.parentUpdatedAt === "number" ? { parentUpdatedAt: folder.parentUpdatedAt } : {}),
    ...(typeof folder.membershipUpdatedAt === "number" ? { membershipUpdatedAt: folder.membershipUpdatedAt } : {}),
    ...(folder.membershipState ? { membershipState: folder.membershipState } : {}),
    ...(typeof folder.deletedAt === "number" ? { deletedAt: folder.deletedAt } : {}),
  };
}
function parseLegacyFolders(value: unknown): PuzzleFolder[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PuzzleFolder => Boolean(entry && typeof entry === "object" && typeof (entry as PuzzleFolder).id === "string"));
}

export async function googleLogin() {
  if (!firebaseEnabled || !auth) return null;
  await ensureAuthPersistence();
  try { return (await signInWithPopup(auth, provider)).user; }
  catch (error) {
    if (isPopupBenignCancel(error)) return null;
    if (isPopupFallbackError(error)) { await ensureAuthPersistence(); await signInWithRedirect(auth, provider); return null; }
    throw error;
  }
}
export async function resolveGoogleRedirectLogin() {
  if (!firebaseEnabled || !auth) return null;
  await ensureAuthPersistence();
  return (await getRedirectResult(auth))?.user ?? null;
}
export function onGoogleAuthStateChanged(listener: (user: User | null) => void) {
  if (!firebaseEnabled || !auth) { listener(null); return () => {}; }
  void ensureAuthPersistence();
  return onAuthStateChanged(auth, listener);
}
export async function googleLogout() { if (firebaseEnabled && auth) await signOut(auth); }

export async function pullCloudStateMetadata(userId: string): Promise<CloudStateMetadata | null> {
  if (!firebaseEnabled || !db) return null;
  const snap = await getDoc(doc(db, "users", userId, "app", "state"));
  if (!snap.exists()) return null;
  const data = snap.data() as { version?: unknown; updatedAt?: unknown; revision?: unknown; puzzleKeys?: unknown; creatorProjectKeys?: unknown; folders?: unknown };
  const version = typeof data.version === "number" ? data.version : 1;
  const updatedAt = typeof data.updatedAt === "number" ? data.updatedAt : 0;
  const revision = typeof data.revision === "number" ? data.revision : 0;
  const legacyHasData = (Array.isArray(data.puzzleKeys) && data.puzzleKeys.length > 0) || (Array.isArray(data.creatorProjectKeys) && data.creatorProjectKeys.length > 0) || (Array.isArray(data.folders) && data.folders.length > 0);
  return { version, updatedAt, revision, hasData: revision > 0 || updatedAt > 0 || legacyHasData };
}

async function pullLegacyCloudState(userId: string): Promise<CloudAppSnapshot | null> {
  if (!db) return null;
  const [stateSnap, puzzleDocs, creatorDocs] = await Promise.all([
    getDoc(doc(db, "users", userId, "app", "state")),
    getDocs(collection(db, "users", userId, "puzzles")),
    getDocs(collection(db, "users", userId, "creatorProjects")),
  ]);
  if (!stateSnap.exists()) return null;
  const state = stateSnap.data() as { updatedAt?: unknown; folders?: unknown };
  const puzzles: { key: string; data: PersistedPuzzle }[] = [];
  for (const entry of puzzleDocs.docs) {
    const payload = entry.data().payload;
    if (typeof payload !== "string") continue;
    try { puzzles.push({ key: keyForDocId(entry.id), data: deserialize<PersistedPuzzle>(payload) }); } catch { throw new Error(`Malformed legacy cloud puzzle: ${keyForDocId(entry.id)}`); }
  }
  const creatorProjects: CreatorProjectStorageRow[] = [];
  for (const entry of creatorDocs.docs) {
    const payload = entry.data().payload;
    if (typeof payload !== "string") continue;
    try { creatorProjects.push(cleanCreatorProject(deserialize<CreatorProjectStorageRow>(payload))); } catch { throw new Error(`Malformed legacy creator project: ${keyForDocId(entry.id)}`); }
  }
  return { version: 1, updatedAt: typeof state.updatedAt === "number" ? state.updatedAt : 0, localStorage: {}, folders: parseLegacyFolders(state.folders), puzzles, creatorProjects };
}

export async function pullCloudState(userId: string): Promise<CloudAppSnapshot | null> {
  if (!firebaseEnabled || !db) return null;
  const metadata = await pullCloudStateMetadata(userId);
  if (!metadata) return null;
  if (metadata.version < 2) return pullLegacyCloudState(userId);
  const v2 = metadata.version < CLOUD_SCHEMA_VERSION;
  const puzzleCollection = v2 ? "puzzles" : "syncPuzzles";
  const folderCollection = v2 ? "folders" : "syncFolders";
  const creatorCollection = v2 ? "creatorProjects" : "syncCreatorProjects";
  const [puzzleDocs, folderDocs, creatorDocs] = await Promise.all([
    getDocs(collection(db, "users", userId, puzzleCollection)),
    getDocs(collection(db, "users", userId, folderCollection)),
    getDocs(collection(db, "users", userId, creatorCollection)),
  ]);
  const creatorProjects: CreatorProjectStorageRow[] = [];
  const creatorByKey = new Map<string, CreatorProjectStorageRow>();
  for (const entry of creatorDocs.docs) {
    const data = entry.data();
    if (typeof data.syncRevision !== "number") continue;
    if (data.syncDeleted === true) continue;
    if (typeof data.syncPayload !== "string") throw new Error(`Malformed cloud creator project: ${keyForDocId(entry.id)}`);
    const row = cleanCreatorProject(deserialize<CreatorProjectStorageRow>(data.syncPayload)); creatorProjects.push(row); creatorByKey.set(row.key, row);
  }
  const folders: PuzzleFolder[] = [];
  for (const entry of folderDocs.docs) {
    const data = entry.data();
    if (typeof data.syncRevision !== "number") continue;
    if (data.syncDeleted === true) continue;
    if (typeof data.syncPayload !== "string") throw new Error(`Malformed cloud folder: ${keyForDocId(entry.id)}`);
    folders.push(deserialize<PuzzleFolder>(data.syncPayload));
  }
  const puzzles: { key: string; data: PersistedPuzzle }[] = [];
  for (const entry of puzzleDocs.docs) {
    const data = entry.data();
    if (typeof data.syncRevision !== "number") continue;
    if (data.syncDeleted === true) continue;
    if (typeof data.syncPayload !== "string") throw new Error(`Malformed cloud puzzle: ${keyForDocId(entry.id)}`);
    const key = keyForDocId(entry.id);
    const payload = deserialize<CloudPuzzlePayload>(data.syncPayload);
    puzzles.push({ key, data: puzzleFromCloudPayload(payload, null, payload.creatorProjectKey ? creatorByKey.get(payload.creatorProjectKey) : null) });
  }
  return { version: 1, updatedAt: metadata.updatedAt, localStorage: {}, folders, puzzles, creatorProjects };
}

async function changedDocs(userId: string, name: string, afterRevision: number) {
  if (!db) return [];
  return (await getDocs(query(collection(db, "users", userId, name), where("syncRevision", ">", afterRevision)))).docs;
}
export async function pullCloudChanges(userId: string, afterRevision: number): Promise<CloudChangesResult> {
  if (!firebaseEnabled || !db) return { version: CLOUD_SCHEMA_VERSION, revision: afterRevision, updatedAt: 0, changes: [] };
  const metadata = await pullCloudStateMetadata(userId);
  if (!metadata) return { version: CLOUD_SCHEMA_VERSION, revision: 0, updatedAt: 0, changes: [] };
  if (metadata.version < CLOUD_SCHEMA_VERSION) return { version: metadata.version, revision: metadata.revision, updatedAt: metadata.updatedAt, changes: [] };
  if (metadata.revision <= afterRevision) return { version: metadata.version, revision: metadata.revision, updatedAt: metadata.updatedAt, changes: [] };
  const [puzzles, folders, creators] = await Promise.all([
    changedDocs(userId, "syncPuzzles", afterRevision), changedDocs(userId, "syncFolders", afterRevision), changedDocs(userId, "syncCreatorProjects", afterRevision),
  ]);
  const changes: CloudChange[] = [];
  for (const entry of creators) {
    const data = entry.data(); const key = keyForDocId(entry.id); const updatedAt = typeof data.syncUpdatedAt === "number" ? data.syncUpdatedAt : 0;
    if (data.syncDeleted !== true && typeof data.syncPayload !== "string") throw new Error(`Malformed v2 creator project: ${key}`);
    changes.push({ kind: "creatorProject", key, updatedAt, payload: data.syncDeleted === true ? null : cleanCreatorProject(deserialize<CreatorProjectStorageRow>(data.syncPayload as string)) });
  }
  for (const entry of folders) {
    const data = entry.data(); const key = keyForDocId(entry.id); const updatedAt = typeof data.syncUpdatedAt === "number" ? data.syncUpdatedAt : 0;
    if (data.syncDeleted !== true && typeof data.syncPayload !== "string") throw new Error(`Malformed v2 folder: ${key}`);
    changes.push({ kind: "folder", key, updatedAt, payload: data.syncDeleted === true ? null : deserialize<PuzzleFolder>(data.syncPayload as string) });
  }
  for (const entry of puzzles) {
    const data = entry.data(); const key = keyForDocId(entry.id); const updatedAt = typeof data.syncUpdatedAt === "number" ? data.syncUpdatedAt : 0;
    if (data.syncDeleted !== true && typeof data.syncPayload !== "string") throw new Error(`Malformed v2 cloud puzzle: ${key}`);
    changes.push({ kind: "puzzle", key, updatedAt, payload: data.syncDeleted === true ? null : deserialize<CloudPuzzlePayload>(data.syncPayload as string) });
  }
  return { version: metadata.version, revision: metadata.revision, updatedAt: metadata.updatedAt, changes };
}

function encodedMutation(change: CloudChange) {
  const payload = change.payload == null ? null : serialize(change.payload);
  const bytes = payload == null ? 256 : byteLength(payload) + 512;
  if (payload != null && byteLength(payload) > MAX_RECORD_PAYLOAD_BYTES) throw new Error(`Cloud sync record is too large: ${change.kind} ${change.key}`);
  return { change, payload, bytes };
}
function chunkChanges(changes: CloudChange[]) {
  const chunks: ReturnType<typeof encodedMutation>[][] = []; let current: ReturnType<typeof encodedMutation>[] = []; let bytes = 0;
  for (const encoded of changes.map(encodedMutation)) {
    if (current.length && (current.length >= MAX_WRITES_PER_COMMIT || bytes + encoded.bytes > MAX_ESTIMATED_COMMIT_BYTES)) { chunks.push(current); current = []; bytes = 0; }
    current.push(encoded); bytes += encoded.bytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
function yieldToBrowser() { return new Promise<void>((resolve) => setTimeout(resolve, 0)); }
async function chunkChangesYielding(changes: CloudChange[]) {
  const chunks: ReturnType<typeof encodedMutation>[][] = []; let current: ReturnType<typeof encodedMutation>[] = []; let bytes = 0;
  for (let index = 0; index < changes.length; index += 1) {
    const encoded = encodedMutation(changes[index]);
    if (current.length && (current.length >= MAX_WRITES_PER_COMMIT || bytes + encoded.bytes > MAX_ESTIMATED_COMMIT_BYTES)) { chunks.push(current); current = []; bytes = 0; }
    current.push(encoded); bytes += encoded.bytes;
    if (index % 8 === 7) await yieldToBrowser();
  }
  if (current.length) chunks.push(current);
  return chunks;
}
function collectionForKind(kind: CloudChange["kind"]) { return kind === "puzzle" ? "syncPuzzles" : kind === "folder" ? "syncFolders" : "syncCreatorProjects"; }

export async function pushCloudChanges(userId: string, changes: CloudChange[], expectedRevision: number): Promise<{ revision: number; updatedAt: number }> {
  if (!firebaseEnabled || !db || changes.length === 0) return { revision: expectedRevision, updatedAt: 0 };
  let revision = expectedRevision; let latestUpdatedAt = 0;
  for (const chunk of chunkChanges(changes)) {
    const stateRef = doc(db, "users", userId, "app", "state");
    const result = await runTransaction(db, async (transaction) => {
      const stateSnap = await transaction.get(stateRef);
      const state = stateSnap.exists() ? stateSnap.data() as { version?: unknown; revision?: unknown } : {};
      const currentRevision = typeof state.revision === "number" ? state.revision : 0;
      const currentVersion = typeof state.version === "number" ? state.version : 1;
      if (stateSnap.exists() && currentVersion < CLOUD_SCHEMA_VERSION) throw new Error("cloud-schema-migration-required");
      if (currentRevision !== revision) throw new Error("cloud-state-revision-conflict");
      const nextRevision = currentRevision + 1;
      const chunkUpdatedAt = Math.max(Date.now(), ...chunk.map((entry) => entry.change.updatedAt));
      for (const entry of chunk) {
        const target = doc(db, "users", userId, collectionForKind(entry.change.kind), docIdForKey(entry.change.key));
        transaction.set(target, {
          syncRevision: nextRevision,
          syncUpdatedAt: entry.change.updatedAt,
          syncDeleted: entry.change.payload == null,
          ...(entry.payload == null ? {} : { syncPayload: entry.payload }),
        });
      }
      transaction.set(stateRef, { version: CLOUD_SCHEMA_VERSION, revision: nextRevision, updatedAt: chunkUpdatedAt }, { merge: stateSnap.exists() });
      return { revision: nextRevision, updatedAt: chunkUpdatedAt };
    });
    revision = result.revision; latestUpdatedAt = result.updatedAt;
  }
  return { revision, updatedAt: latestUpdatedAt };
}

/** Stage any older cloud schema into isolated v3 collections, then atomically publish v3. */
export async function migrateCloudToCurrentSchema(
  userId: string,
  changes: CloudChange[],
  expectedSourceVersion: number,
  expectedSourceRevision: number,
): Promise<{ revision: number; updatedAt: number }> {
  if (!firebaseEnabled || !db) return { revision: expectedSourceRevision, updatedAt: 0 };
  const targetRevision = expectedSourceRevision + 1;
  const intended = {
    puzzle: new Set(changes.filter((change) => change.kind === "puzzle").map((change) => change.key)),
    folder: new Set(changes.filter((change) => change.kind === "folder").map((change) => change.key)),
    creatorProject: new Set(changes.filter((change) => change.kind === "creatorProject").map((change) => change.key)),
  };
  const [existingPuzzles, existingFolders, existingCreators] = await Promise.all([
    getDocs(collection(db, "users", userId, "syncPuzzles")),
    getDocs(collection(db, "users", userId, "syncFolders")),
    getDocs(collection(db, "users", userId, "syncCreatorProjects")),
  ]);
  const stagedChanges = [...changes];
  const addMissingTombstones = (kind: CloudChange["kind"], docs: typeof existingPuzzles.docs) => {
    for (const entry of docs) {
      const key = keyForDocId(entry.id);
      if (!intended[kind].has(key)) stagedChanges.push({ kind, key, updatedAt: Date.now(), payload: null } as CloudChange);
    }
  };
  addMissingTombstones("puzzle", existingPuzzles.docs);
  addMissingTombstones("folder", existingFolders.docs);
  addMissingTombstones("creatorProject", existingCreators.docs);

  const chunks = await chunkChangesYielding(stagedChanges);
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const entry of chunk) {
      const target = doc(db, "users", userId, collectionForKind(entry.change.kind), docIdForKey(entry.change.key));
      batch.set(target, {
        syncRevision: targetRevision,
        syncUpdatedAt: entry.change.updatedAt,
        syncDeleted: entry.change.payload == null,
        ...(entry.payload == null ? {} : { syncPayload: entry.payload }),
      });
    }
    await batch.commit();
    await yieldToBrowser();
  }

  const latestUpdatedAt = Math.max(Date.now(), ...stagedChanges.map((entry) => entry.updatedAt));
  const stateRef = doc(db, "users", userId, "app", "state");
  return runTransaction(db, async (transaction) => {
    const stateSnap = await transaction.get(stateRef);
    if (!stateSnap.exists()) throw new Error("cloud-state-revision-conflict");
    const state = stateSnap.data() as { version?: unknown; revision?: unknown };
    const currentVersion = typeof state.version === "number" ? state.version : 1;
    const currentRevision = typeof state.revision === "number" ? state.revision : 0;
    if (currentVersion >= CLOUD_SCHEMA_VERSION) throw new Error("cloud-state-revision-conflict");
    if (currentVersion !== expectedSourceVersion || currentRevision !== expectedSourceRevision) throw new Error("cloud-state-revision-conflict");
    transaction.set(stateRef, {
      version: CLOUD_SCHEMA_VERSION, revision: targetRevision, updatedAt: latestUpdatedAt,
      puzzleKeys: deleteField(), creatorProjectKeys: deleteField(), folders: deleteField(), localStorage: deleteField(),
    }, { merge: true });
    return { revision: targetRevision, updatedAt: latestUpdatedAt };
  });
}

export function snapshotToCloudChanges(snapshot: CloudAppSnapshot): CloudChange[] {
  const changes: CloudChange[] = [];
  for (const row of snapshot.creatorProjects) {
    const clean = cleanCreatorProject(row);
    changes.push({ kind: "creatorProject", key: row.key, updatedAt: row.deletedAt ?? row.updatedAt, payload: row.deletedAt ? null : clean });
  }
  for (const folder of snapshot.folders) changes.push({ kind: "folder", key: folder.id, updatedAt: folder.deletedAt ?? folder.updatedAt, payload: folder.deletedAt ? null : cleanFolder(folder) });
  for (const row of snapshot.puzzles) changes.push({ kind: "puzzle", key: row.key, updatedAt: row.data.updatedAt, payload: puzzleToCloudPayload(row.key, row.data) });
  return changes;
}
