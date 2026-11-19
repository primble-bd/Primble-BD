import { useCallback, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';

export type WalletRole = 'STAFF' | 'GENERAL_CUSTOMER' | 'VIP_CUSTOMER' | 'ADMIN';

export interface FirestoreUserProfile {
  uid: string;
  name: string;
  email?: string;
  ph?: string;
  role: WalletRole;
  acc?: string;
  dob?: string;
  gender?: string;
  town?: string;
  job?: string;
  addr?: string;
  notif?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProfileUpdateInput {
  name: string;
  email?: string;
  ph?: string;
  role?: WalletRole;
  acc?: string;
  dob?: string;
  gender?: string;
  town?: string;
  job?: string;
  addr?: string;
  notif?: string[];
}

const VALID_ROLES: WalletRole[] = ['STAFF', 'GENERAL_CUSTOMER', 'VIP_CUSTOMER', 'ADMIN'];
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function sanitizeProfilePayload(uid: string, input: ProfileUpdateInput, fallbackRole: WalletRole) {
  if (!ID_PATTERN.test(uid) || uid.length > 128) {
    throw new Error('Invalid user UID format.');
  }
  const cleanName = String(input.name || '').trim().slice(0, 100);
  if (!cleanName) {
    throw new Error('Name is required.');
  }
  const requestedRole = input.role && VALID_ROLES.includes(input.role) ? input.role : fallbackRole;
  const safeRole: WalletRole = requestedRole === 'ADMIN' ? fallbackRole : requestedRole;

  return {
    uid,
    name: cleanName,
    email: String(input.email ?? '').trim().slice(0, 150),
    ph: String(input.ph ?? '').trim().slice(0, 30),
    role: safeRole,
    acc: String(input.acc ?? '').trim().slice(0, 20),
    dob: String(input.dob ?? '').trim().slice(0, 20),
    gender: String(input.gender ?? '').trim().slice(0, 20),
    town: String(input.town ?? '').trim().slice(0, 60),
    job: String(input.job ?? '').trim().slice(0, 60),
    addr: String(input.addr ?? '').trim().slice(0, 300),
    notif: Array.isArray(input.notif)
      ? input.notif.map((x) => String(x).slice(0, 60)).slice(0, 10)
      : [],
  };
}

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const provider = new GoogleAuthProvider();
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export async function saveUserProfileToFirestore(
  input: ProfileUpdateInput
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Sign in with Google first to sync your profile to Firestore.');
  }
  const path = `users/${currentUser.uid}`;
  const ref = doc(db, 'users', currentUser.uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const existingRole =
    existingSnap.exists() && VALID_ROLES.includes(existingSnap.data().role)
      ? (existingSnap.data().role as WalletRole)
      : 'GENERAL_CUSTOMER';

  const clean = sanitizeProfilePayload(
    currentUser.uid,
    {
      ...input,
      email: input.email || currentUser.email || '',
      name: input.name || currentUser.displayName || 'Member',
    },
    existingRole
  );

  if (existingSnap.exists()) {
    try {
      await updateDoc(ref, {
        name: clean.name,
        email: clean.email,
        ph: clean.ph,
        acc: clean.acc,
        dob: clean.dob,
        gender: clean.gender,
        town: clean.town,
        job: clean.job,
        addr: clean.addr,
        notif: clean.notif,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    try {
      await setDoc(ref, {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export function useFirestoreProfile() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<FirestoreUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let unsubSnap: Unsubscribe | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubSnap) {
        unsubSnap();
        unsubSnap = null;
      }

      setFirebaseUser(user);
      setAuthReady(true);

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const path = `users/${user.uid}`;
      const ref = doc(db, 'users', user.uid);

      unsubSnap = onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            setProfile(snap.data() as FirestoreUserProfile);
          } else {
            setProfile(null);
          }
          setLoading(false);
        },
        (err) => {
          setLoading(false);
          try {
            handleFirestoreError(err, OperationType.GET, path);
          } catch (wrapped) {
            setError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubSnap) unsubSnap();
    };
  }, []);

  const saveProfile = useCallback(async (input: ProfileUpdateInput) => {
    setSaving(true);
    setError(null);
    try {
      await saveUserProfileToFirestore(input);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  if (error) {
    throw error;
  }

  return {
    authReady,
    firebaseUser,
    profile,
    loading,
    saving,
    saveProfile,
    signInWithGoogle,
    signOutFirebase,
  };
}
