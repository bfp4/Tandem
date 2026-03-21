import { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { getCurrentUserProfile } from '@/services/authService';
import type { User } from '@/types/user';

interface AuthState {
  user: FirebaseUser | null;
  profile: User | null;
  loading: boolean;
}

/**
 * Listens to Firebase Auth state and fetches the matching Firestore profile.
 * Mount this hook at the app root so all screens have access to auth state.
 *
 * - user:    Raw Firebase Auth user (null if signed out)
 * - profile: Full Firestore /users/{uid} document (null if signed out)
 * - loading: True until the initial auth state resolves
 */
export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ user: null, profile: null, loading: false });
        return;
      }

      try {
        const profile = await getCurrentUserProfile();
        setState({ user: firebaseUser, profile, loading: false });
      } catch {
        // Profile may not exist yet if onAuthUserCreated Cloud Function hasn't
        // run. Expose the Auth user without a profile and let the screen handle it.
        setState({ user: firebaseUser, profile: null, loading: false });
      }
    });

    return unsubscribe;
  }, []);

  return state;
}
