import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
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

export const app = firebaseEnabled ? initializeApp(firebaseConfig) : (null as any);
export const auth = firebaseEnabled ? getAuth(app) : (null as any);
export const db = firebaseEnabled ? getFirestore(app) : (null as any);

export async function googleLogin() {
  if (!firebaseEnabled) return null;
  const provider = new GoogleAuthProvider();
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export async function googleLogout() {
  if (!firebaseEnabled) return;
  await signOut(auth);
}

export async function pullPuzzle(userId: string, key: string): Promise<PersistedPuzzle | null> {
  if (!firebaseEnabled) return null;
  const ref = doc(db, "users", userId, "puzzles", key);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data().data as PersistedPuzzle) : null;
}

export async function pushPuzzle(userId: string, key: string, data: PersistedPuzzle) {
  if (!firebaseEnabled) return;
  const ref = doc(db, "users", userId, "puzzles", key);
  await setDoc(ref, { data }, { merge: true });
}