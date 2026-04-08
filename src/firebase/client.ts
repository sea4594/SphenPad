import { initializeApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
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

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);

export const app: FirebaseApp | null = firebaseEnabled ? initializeApp(firebaseConfig) : null;
export const auth: Auth | null = firebaseEnabled && app ? getAuth(app) : null;
export const db: Firestore | null = firebaseEnabled && app ? getFirestore(app) : null;

function shouldUseRedirectLogin() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isPopupFallbackError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "auth/popup-blocked" || code === "auth/web-storage-unsupported";
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
  if (shouldUseRedirectLogin()) {
    await signInWithRedirect(auth, provider);
    return null;
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    if (isPopupFallbackError(error)) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

export async function resolveGoogleRedirectLogin() {
  if (!firebaseEnabled || !auth) return null;
  const result = await getRedirectResult(auth);
  // On some iOS/Safari flows, redirect completes with currentUser populated
  // but getRedirectResult returns null.
  return result?.user ?? auth.currentUser ?? null;
}

export function onGoogleAuthStateChanged(listener: (user: User | null) => void) {
  if (!firebaseEnabled || !auth) {
    listener(null);
    return () => {};
  }
  return onAuthStateChanged(auth, listener);
}

export async function googleLogout() {
  if (!firebaseEnabled || !auth) return;
  await signOut(auth);
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
    return [{ key: entry.id, data: deserializePuzzle(payload) }];
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

  const nextPuzzleKeys = snapshot.puzzles.map((row) => row.key);
  const stateRef = doc(db, "users", userId, "app", "state");
  await setDoc(stateRef, {
    version: snapshot.version,
    updatedAt: snapshot.updatedAt,
    localStorage: snapshot.localStorage,
    folders: snapshot.folders,
    puzzleKeys: nextPuzzleKeys,
  });

  const operations = [
    ...snapshot.puzzles.map((row) => ({ type: "set" as const, key: row.key, payload: serializePuzzle(row.data) })),
    ...previousPuzzleKeys
      .filter((key) => !nextPuzzleKeys.includes(key))
      .map((key) => ({ type: "delete" as const, key })),
  ];

  for (const batchItems of chunk(operations, MAX_BATCH_SIZE)) {
    const batch = writeBatch(db);
    for (const item of batchItems) {
      const puzzleRef = doc(db, "users", userId, "puzzles", item.key);
      if (item.type === "set") {
        batch.set(puzzleRef, { updatedAt: snapshot.updatedAt, payload: item.payload });
      } else {
        batch.delete(puzzleRef);
      }
    }
    await batch.commit();
  }
}
