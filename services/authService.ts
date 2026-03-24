import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import type { User } from '@/types/user';

/**
 * Creates a Firebase Auth record via email/password.
 * The Firestore /users/{uid} document is created automatically by
 * the onAuthUserCreated Cloud Function — do not create it here.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<void> {
  await createUserWithEmailAndPassword(auth, email, password);
  // After sign-up, navigation to the profile completion flow is handled
  // by the consuming screen once auth state resolves.
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

/**
 * Signs in via Google OAuth.
 * The onAuthUserCreated Cloud Function handles first-time Firestore document
 * creation. On subsequent sign-ins no Firestore write is needed.
 */
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Returns the currently signed-in Firebase Auth user, or null if not signed in.
 * Note: this is the raw Auth user — use getCurrentUserProfile() to get the
 * full Firestore profile.
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Fetches the signed-in user's Firestore profile from /users/{uid}.
 * This is the standard way to get the logged-in user's data anywhere in the app.
 * Throws if no user is currently signed in or if the document does not exist.
 */
export async function getCurrentUserProfile(): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('No authenticated user.');
  }

  const snap = await getDoc(doc(db, 'users', currentUser.uid));
  if (!snap.exists()) {
    throw new Error(`User document not found for uid: ${currentUser.uid}`);
  }

  return snap.data() as User;
}

/**
 * Initiates safe account deletion.
 * Does NOT delete the Auth record directly — the onAuthUserDeleted Cloud
 * Function handles ordered cleanup (Firestore first, then Auth).
 * Deleting the Auth record triggers onDelete, which cascades the cleanup.
 */
export async function deleteAccount(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('No authenticated user.');
  }
  // Deleting the Auth record triggers the onAuthUserDeleted Cloud Function,
  // which cleans up Firestore before the record is fully removed.
  await currentUser.delete();
}
