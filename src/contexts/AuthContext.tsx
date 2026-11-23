import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  OperationType,
  handleFirestoreError,
} from '../firebase';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  role: 'member' | 'operator';
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function buildSafeDisplayName(user: User): string {
  const raw =
    user.displayName?.trim() ||
    user.email?.split('@')[0]?.trim() ||
    'AethexFlow User';
  return raw.slice(0, 100);
}

function buildSafePhotoUrl(user: User): string | undefined {
  const raw = user.photoURL?.trim();
  if (!raw || raw.length > 500) return undefined;
  return raw;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setAuthReady(true);
        return;
      }

      const displayName = buildSafeDisplayName(nextUser);
      const photoURL = buildSafePhotoUrl(nextUser);
      const userPath = `users/${nextUser.uid}`;
      const privatePath = `users/${nextUser.uid}/private/account`;

      try {
        const userRef = doc(db, 'users', nextUser.uid);
        let existingSnap;
        try {
          existingSnap = await getDoc(userRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, userPath);
        }

        if (!existingSnap.exists()) {
          const createPayload: Record<string, unknown> = {
            uid: nextUser.uid,
            displayName,
            role: 'member',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (photoURL) createPayload.photoURL = photoURL;

          try {
            await setDoc(userRef, createPayload);
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, userPath);
          }

          setProfile({
            uid: nextUser.uid,
            displayName,
            photoURL,
            role: 'member',
          });
        } else {
          const existingData = existingSnap.data();
          const currentRole =
            existingData.role === 'operator' ? 'operator' : 'member';
          const updatePayload: Record<string, unknown> = {
            displayName,
            updatedAt: serverTimestamp(),
          };
          if (photoURL) {
            updatePayload.photoURL = photoURL;
          } else if (existingData.photoURL) {
            updatePayload.photoURL = existingData.photoURL;
          }

          try {
            await updateDoc(userRef, updatePayload);
          } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, userPath);
          }

          setProfile({
            uid: nextUser.uid,
            displayName,
            photoURL: photoURL || existingData.photoURL,
            role: currentRole,
          });
        }

        // Isolate PII (email) into /users/{uid}/private/account
        if (nextUser.email && nextUser.emailVerified) {
          const privRef = doc(db, 'users', nextUser.uid, 'private', 'account');
          let privSnap;
          try {
            privSnap = await getDoc(privRef);
          } catch (err) {
            handleFirestoreError(err, OperationType.GET, privatePath);
          }

          if (!privSnap.exists()) {
            try {
              await setDoc(privRef, {
                uid: nextUser.uid,
                email: nextUser.email.slice(0, 254),
                updatedAt: serverTimestamp(),
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, privatePath);
            }
          } else {
            try {
              await updateDoc(privRef, {
                email: nextUser.email.slice(0, 254),
                updatedAt: serverTimestamp(),
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.UPDATE, privatePath);
            }
          }
        }
      } catch (err) {
        console.error('Auth profile sync warning:', err);
        setProfile({
          uid: nextUser.uid,
          displayName,
          photoURL,
          role: 'member',
        });
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('Google sign-in popup was closed before finishing.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Browser blocked the sign-in popup. Please allow popups for this site.');
      } else {
        setAuthError(err?.message || 'Sign-in failed. Please try again.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      await signOut(auth);
      setProfile(null);
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to sign out.');
    } finally {
      setAuthBusy(false);
    }
  };

  const isAdmin = Boolean(
    user?.emailVerified &&
      (user?.email === 'aethexflow@gmail.com' || profile?.role === 'operator')
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        authReady,
        authBusy,
        authError,
        isAdmin,
        signInWithGoogle,
        signOutUser,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
