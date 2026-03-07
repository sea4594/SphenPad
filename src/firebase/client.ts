import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { PersistedPuzzle } from "../core/model";

/**
 * OPTIONAL: Fill these in (Vite env vars recommended). If unset, Google sync stays disabled.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);

export const app: FirebaseApp | null = firebaseEnabled ? initializeApp(firebaseConfig) : null;
export const auth: Auth | null = firebaseEnabled && app ? getAuth(app) : null;
export const db: Firestore | null = firebaseEnabled && app ? getFirestore(app) : null;

export async function googleLogin() {
  if (!firebaseEnabled || !auth) return null;
  const provider = new GoogleAuthProvider();
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export async function googleLogout() {
  if (!firebaseEnabled || !auth) return;
  await signOut(auth);
}

export async function pullPuzzle(userId: string, key: string): Promise<PersistedPuzzle | null> {
  if (!firebaseEnabled || !db) return null;
  const ref = doc(db, "users", userId, "puzzles", key);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data().data as PersistedPuzzle) : null;
}

export async function pushPuzzle(userId: string, key: string, data: PersistedPuzzle) {
  if (!firebaseEnabled || !db) return;
  const ref = doc(db, "users", userId, "puzzles", key);
  await setDoc(ref, { data }, { merge: true });
}

export async function deleteCloudPuzzle(userId: string, key: string) {
  if (!firebaseEnabled || !db) return;
  const ref = doc(db, "users", userId, "puzzles", key);
  await deleteDoc(ref);
}