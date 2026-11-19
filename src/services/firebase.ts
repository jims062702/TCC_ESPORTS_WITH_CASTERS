import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  where,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// Firebase bootstrap. All values come from VITE_FIREBASE_* env vars (public by
// design — Firestore security rules are what protect the data).
// ─────────────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  const isOverlay = typeof location !== 'undefined' && location.pathname.startsWith('/overlay');
  _db = initializeFirestore(app, {
    // Overlays run inside OBS (CEF) — keep them on the in-memory cache to avoid
    // IndexedDB lock contention between several browser sources.
    ...(isOverlay ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }),
    ignoreUndefinedProperties: true,
  });
  _auth = getAuth(app);
}

export const db = _db as Firestore;
export const auth = _auth as Auth;

export const COL = {
  teams: 'teams',
  players: 'players',
  tournaments: 'tournaments',
  matches: 'matches',
  games: 'games',
  events: 'events',
  commentary: 'commentary',
  highlights: 'highlights',
  heroes: 'heroes',
  scripts: 'scripts',
  live: 'live',
  settings: 'settings',
  admins: 'admins',
} as const;

export const LIVE_DOC = { current: 'current', caption: 'caption', booth: 'booth' } as const;
export const SETTINGS_DOC = 'site';

// ── Generic real-time helpers ───────────────────────────────────────────────
// Every subscribe* function returns Firestore's Unsubscribe. Hooks call it in
// their effect cleanup so listeners never leak when components unmount.

const noop: Unsubscribe = () => {};

export function subscribeDoc<T>(
  path: string,
  id: string,
  cb: (data: T | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  if (!isFirebaseConfigured) {
    cb(null);
    return noop;
  }
  return onSnapshot(
    doc(db, path, id),
    (snap) => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null),
    (err) => {
      console.error(`[firestore] ${path}/${id}`, err);
      onError?.(err);
    },
  );
}

export function subscribeCollection<T>(
  path: string,
  constraints: QueryConstraint[],
  cb: (rows: T[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  if (!isFirebaseConfigured) {
    cb([]);
    return noop;
  }
  return onSnapshot(
    query(collection(db, path), ...constraints),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) }) as T)),
    (err) => {
      console.error(`[firestore] ${path}`, err);
      onError?.(err);
    },
  );
}

export const whereEq = (field: string, value: unknown) => where(field, '==', value);

// ── Auth ────────────────────────────────────────────────────────────────────

export const watchAuth = (cb: (user: User | null) => void): Unsubscribe => {
  if (!isFirebaseConfigured) {
    cb(null);
    return noop;
  }
  return onAuthStateChanged(auth, cb);
};

export const loginWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const loginWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());

export const logout = () => signOut(auth);

/** An admin is any signed-in user with a document at admins/{uid}. */
export async function checkIsAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, COL.admins, uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function getIdToken(): Promise<string | null> {
  return auth?.currentUser ? auth.currentUser.getIdToken() : null;
}
