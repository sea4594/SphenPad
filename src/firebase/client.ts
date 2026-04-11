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
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { LocalAppSnapshot } from "../core/appState";
import type { PersistedPuzzle } from "../core/model";
import type { PuzzleFolder } from "../core/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

const provider = new GoogleAuthProvider();
const MAX_BATCH_SIZE = 400;

export type CloudAppSnapshot = LocalAppSnapshot;
export type CloudStateMetadata = {
  updatedAt: number;
  puzzleKeys: string[];
  hasData: boolean;
};

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);

export const app: FirebaseApp | null = firebaseEnabled ? initializeApp(firebaseConfig) : null;
export const auth: Auth | null = firebaseEnabled && app ? getAuth(app) : null;
export const db: Firestore | null = firebaseEnabled && app ? getFirestore(app) : null;
let persistenceReadyPromise: Promise<void> | null = null;

function ensureAuthPersistence() {
  if (!firebaseEnabled || !auth) return Promise.resolve();
  if (!persistenceReadyPromise) {
    persistenceReadyPromise = setPersistence(auth, browserLocalPersistence).catch(() => {
      // If persistence cannot be configured (e.g. restricted storage), continue best-effort.
    });
  }
  return persistenceReadyPromise;
}

if (firebaseEnabled && auth) {
  void ensureAuthPersistence();
}

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

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function jsonReplacer(_key: string, value: unknown) {
  if (value instanceof Set) {
    return { __type: "Set", values: Array.from(value) };
  }
  return value;
}

function jsonReviver(_key: string, value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    (value as { __type?: unknown }).__type === "Set" &&
    Array.isArray((value as { values?: unknown[] }).values)
  ) {
    return new Set((value as { values: unknown[] }).values);
  }
  return value;
}

function serializePuzzle(data: PersistedPuzzle) {
  return JSON.stringify(data, jsonReplacer);
}

function deserializePuzzle(payload: string) {
  return JSON.parse(payload, jsonReviver) as PersistedPuzzle;
}

function puzzleKeyToDocId(key: string) {
  // Firestore document IDs cannot contain '/'.
  return encodeURIComponent(key);
}

function puzzleDocIdToKey(docId: string) {
  try {
    return decodeURIComponent(docId);
  } catch {
    return docId;
  }
}

function parseFolders(value: unknown): PuzzleFolder[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PuzzleFolder => {
    if (!entry || typeof entry !== "object") return false;
    return typeof (entry as PuzzleFolder).id === "string" && typeof (entry as PuzzleFolder).name === "string";
  });
}

function parseLocalStorageRecord(value: unknown): CloudAppSnapshot["localStorage"] {
  if (!value || typeof value !== "object") return {};
  const record: CloudAppSnapshot["localStorage"] = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue === "string") {
      record[key as keyof CloudAppSnapshot["localStorage"]] = entryValue;
    }
  }
  return record;
}

export async function googleLogin() {
  if (!firebaseEnabled || !auth) return null;
  await ensureAuthPersistence();

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    if (isPopupBenignCancel(error)) return null;
    if (isPopupFallbackError(error)) {
      await ensureAuthPersistence();
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

export async function resolveGoogleRedirectLogin() {
  if (!firebaseEnabled || !auth) return null;
  await ensureAuthPersistence();
  const result = await getRedirectResult(auth);
  return result?.user ?? null;
}

export function onGoogleAuthStateChanged(listener: (user: User | null) => void) {
  if (!firebaseEnabled || !auth) {
    listener(null);
    return () => {};
  }
  void ensureAuthPersistence();
  return onAuthStateChanged(auth, listener);
}

export async function googleLogout() {
  if (!firebaseEnabled || !auth) return;
  await signOut(auth);
}

export async function pullCloudStateMetadata(userId: string): Promise<CloudStateMetadata | null> {
  if (!firebaseEnabled || !db) return null;

  const stateRef = doc(db, "users", userId, "app", "state");
  const stateSnap = await getDoc(stateRef);
  if (!stateSnap.exists()) return null;

  const stateData = stateSnap.data() as {
    updatedAt?: unknown;
    puzzleKeys?: unknown;
    folders?: unknown;
    localStorage?: unknown;
  };

  const puzzleKeys = Array.isArray(stateData.puzzleKeys)
    ? stateData.puzzleKeys.filter((entry): entry is string => typeof entry === "string")
    : [];
  const folderCount = Array.isArray(stateData.folders) ? stateData.folders.length : 0;
  const localStorageCount =
    stateData.localStorage && typeof stateData.localStorage === "object" ? Object.keys(stateData.localStorage as object).length : 0;
  const updatedAt = typeof stateData.updatedAt === "number" ? stateData.updatedAt : 0;

  return {
    updatedAt,
    puzzleKeys,
    hasData: updatedAt > 0 || puzzleKeys.length > 0 || folderCount > 0 || localStorageCount > 0,
  };
}

export async function pullCloudState(userId: string): Promise<CloudAppSnapshot | null> {
  if (!firebaseEnabled || !db) return null;

  const stateRef = doc(db, "users", userId, "app", "state");
  const [stateSnap, puzzleDocs] = await Promise.all([
    getDoc(stateRef),
    getDocs(collection(db, "users", userId, "puzzles")),
  ]);

  if (!stateSnap.exists()) return null;

  const stateData = stateSnap.data() as {
    updatedAt?: unknown;
    localStorage?: unknown;
    folders?: unknown;
  };

  const puzzles = puzzleDocs.docs.flatMap((entry) => {
    const payload = entry.data().payload;
    if (typeof payload !== "string" || !payload.length) return [];
    return [{ key: puzzleDocIdToKey(entry.id), data: deserializePuzzle(payload) }];
  });

  return {
    version: 1,
    updatedAt: typeof stateData.updatedAt === "number" ? stateData.updatedAt : 0,
    localStorage: parseLocalStorageRecord(stateData.localStorage),
    folders: parseFolders(stateData.folders),
    puzzles,
  };
}

export async function pushCloudState(userId: string, snapshot: CloudAppSnapshot, previousPuzzleKeys: string[] = []) {
  if (!firebaseEnabled || !db) return;

  const stateRef = doc(db, "users", userId, "app", "state");
  let effectivePreviousPuzzleKeys = previousPuzzleKeys;
  if (!effectivePreviousPuzzleKeys.length) {
    const existingState = await getDoc(stateRef);
    if (existingState.exists()) {
      const existingStateData = existingState.data() as { puzzleKeys?: unknown };
      if (Array.isArray(existingStateData.puzzleKeys)) {
        effectivePreviousPuzzleKeys = existingStateData.puzzleKeys.filter((entry): entry is string => typeof entry === "string");
      } else {
        // Legacy cloud state may not have puzzleKeys; fall back to listing current cloud puzzle docs.
        const existingPuzzleDocs = await getDocs(collection(db, "users", userId, "puzzles"));
        effectivePreviousPuzzleKeys = existingPuzzleDocs.docs.map((entry) => puzzleDocIdToKey(entry.id));
      }
    }
  }

  const nextPuzzleKeys = snapshot.puzzles.map((row) => row.key);
  const nextPuzzleDocIds = new Set(nextPuzzleKeys.map(puzzleKeyToDocId));
  const previousPuzzleDocIds = new Set(effectivePreviousPuzzleKeys.map(puzzleKeyToDocId));
  await setDoc(stateRef, {
    version: snapshot.version,
    updatedAt: snapshot.updatedAt,
    localStorage: snapshot.localStorage,
    folders: snapshot.folders,
    puzzleKeys: nextPuzzleKeys,
  });

  const operations = [
    ...snapshot.puzzles.map((row) => ({
      type: "set" as const,
      docId: puzzleKeyToDocId(row.key),
      payload: serializePuzzle(row.data),
    })),
    ...Array.from(previousPuzzleDocIds)
      .filter((docId) => !nextPuzzleDocIds.has(docId))
      .map((docId) => ({ type: "delete" as const, docId })),
  ];

  for (const batchItems of chunk(operations, MAX_BATCH_SIZE)) {
    const batch = writeBatch(db);
    for (const item of batchItems) {
      const puzzleRef = doc(db, "users", userId, "puzzles", item.docId);
      if (item.type === "set") {
        batch.set(puzzleRef, { updatedAt: snapshot.updatedAt, payload: item.payload });
      } else {
        batch.delete(puzzleRef);
      }
    }
    await batch.commit();
  }
}
