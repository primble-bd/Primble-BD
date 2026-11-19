import { deleteApp, initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  linkWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, firebaseConfig, handleFirestoreError, OperationType } from '../firebase';

export const ADMIN_EMAIL = 'office.primble@gmail.com';

export type AdminPerm =
  | 'dash'
  | 'kyc'
  | 'add'
  | 'wd'
  | 'pay'
  | 'sms'
  | 'ban'
  | 'part'
  | 'users'
  | 'brand'
  | 'bk';

export const STAFF_PERM_DEFS: { key: AdminPerm; label: string }[] = [
  { key: 'dash', label: 'Dashboard' },
  { key: 'kyc', label: 'KYC Approvals' },
  { key: 'add', label: 'Add Money' },
  { key: 'wd', label: 'Withdrawals' },
  { key: 'pay', label: 'Salary & Profit' },
  { key: 'sms', label: 'SMS Composer' },
  { key: 'ban', label: 'Banners & Video' },
  { key: 'part', label: 'Partners' },
  { key: 'users', label: 'Users & Freeze' },
  { key: 'brand', label: 'Settings' },
  { key: 'bk', label: 'Backup (pbdbank.file)' },
];

export interface AdminRecord {
  uid: string;
  email: string;
  name?: string;
  isSuperAdmin?: boolean;
  active?: boolean;
  perms?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WalletUser {
  id: string;
  uid?: string;
  admin?: number;
  name: string;
  email?: string;
  ph: string;
  pin?: string;
  sp?: string;
  kyc: 'PENDING' | 'APPROVED' | 'REJECTED';
  frozen?: boolean;
  bal: number;
  acc?: string;
  role?: string;
  doc?: string;
  dt?: string;
  docImg?: string;
  docImg2?: string;
  selfie?: string;
  photo?: string;
  time?: string;
  emailOk?: number;
  dob?: string;
  gender?: string;
  town?: string;
  job?: string;
  addr?: string;
  notif?: string[];
  perms?: string[];
}

export interface TxItem {
  id: string;
  uid: string;
  senderUid?: string;
  amt: number;
  note: string;
  time: string;
  createdAt?: { toMillis?: () => number };
}

export interface MsgItem {
  id: string;
  uid: string;
  senderUid?: string;
  t: string;
  b: string;
  read: number;
  time: string;
  createdAt?: { toMillis?: () => number };
}

export interface BannerItem {
  id: string;
  src: string;
  active?: boolean;
}

export interface ReqItem {
  id: string;
  type: 'ADD' | 'MFS' | 'BANK';
  uid: string;
  op: string;
  ext: string;
  name: string;
  trx: string;
  amt: number;
  st: 'PENDING' | 'APPROVED' | 'DEBITED' | 'REJECTED';
  time: string;
  createdAt?: { toMillis?: () => number };
}

export interface PartnerItem {
  id: string;
  type: 'MFS' | 'BANK';
  name: string;
  logo: string;
  active?: boolean;
}

export interface AppCfg {
  auto: number;
  name?: string;
  logo?: string;
  ytUrl?: string;
  ytTitle?: string;
  ytOn?: number;
}

export interface RecipientLookup {
  uid: string;
  acc: string;
  name: string;
  kyc: 'PENDING' | 'APPROVED' | 'REJECTED';
  frozen: boolean;
  photo?: string;
}

export interface PublicBrandCallbacks {
  onSettings: (cfg: AppCfg) => void;
  onBanners: (banners: BannerItem[]) => void;
  onPartners: (partners: PartnerItem[]) => void;
}

export interface WalletSyncCallbacks {
  onOwnAccount: (account: WalletUser | null) => void;
  onOwnAdminRecord: (adminRec: AdminRecord | null) => void;
  onAllAdmins: (admins: AdminRecord[]) => void;
  onAllAccounts: (accounts: WalletUser[]) => void;
  onKycDocs: (docsByUid: Record<string, { dt?: string; docImg?: string; docImg2?: string; selfie?: string }>) => void;
  onTransactions: (tx: TxItem[]) => void;
  onRequests: (reqs: ReqItem[]) => void;
  onMessages: (msgs: MsgItem[]) => void;
}

let publicUnsubs: Unsubscribe[] = [];
let activeUnsubs: Unsubscribe[] = [];

export function stopPublicBrandListeners() {
  publicUnsubs.forEach((u) => {
    try {
      u();
    } catch {
      // ignore cleanup errors
    }
  });
  publicUnsubs = [];
}

export function stopWalletListeners() {
  activeUnsubs.forEach((u) => {
    try {
      u();
    } catch {
      // ignore cleanup errors
    }
  });
  activeUnsubs = [];
}

function sortDescByCreated<T extends { createdAt?: { toMillis?: () => number } }>(items: T[]): T[] {
  const pendingMs = Date.now();
  return [...items].sort((a, b) => (b.createdAt?.toMillis?.() ?? pendingMs) - (a.createdAt?.toMillis?.() ?? pendingMs));
}

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
}

export function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Console (Authentication -> Sign-in method -> Email/Password).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please log in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/requires-recent-login':
      return 'Please re-verify your current password or Google login and try again.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing.';
    default:
      return err instanceof Error ? err.message : String(err);
  }
}

export async function loginWithEmailPassword(email: string, password: string): Promise<FirebaseUser> {
  try {
    const res = await signInWithEmailAndPassword(auth, email.trim(), password);
    return res.user;
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export async function registerWithEmailPassword(
  email: string,
  password: string,
  displayName: string
): Promise<FirebaseUser> {
  try {
    const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (displayName.trim()) {
      await updateProfile(res.user, { displayName: displayName.trim().slice(0, 100) });
    }
    await sendEmailVerification(res.user);
    return res.user;
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export async function sendResetPasswordEmail(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export async function resendVerificationEmail(): Promise<void> {
  if (!auth.currentUser) throw new Error('Not signed in.');
  try {
    await sendEmailVerification(auth.currentUser);
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export async function refreshVerifiedSession(): Promise<boolean> {
  if (!auth.currentUser) return false;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser.emailVerified;
}

export async function changeOrLinkPassword(currentPassword: string | null, newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Sign in first.');
  if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');

  const hasPassword = user.providerData.some((p) => p.providerId === 'password');
  try {
    if (hasPassword) {
      if (!currentPassword) throw new Error('Enter your current password.');
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
    } else {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
      try {
        await linkWithCredential(user, EmailAuthProvider.credential(user.email, newPassword));
      } catch (linkErr) {
        if ((linkErr as { code?: string })?.code === 'auth/provider-already-linked') {
          await updatePassword(user, newPassword);
        } else {
          throw linkErr;
        }
      }
    }
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export async function requestAdminEmailChange(newEmail: string, currentPassword?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Sign in first.');
  const cleanEmail = newEmail.trim();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Enter a valid new email address.');
  }
  if (cleanEmail.toLowerCase() === user.email.toLowerCase()) {
    throw new Error('New email must be different from your current email.');
  }

  const hasPassword = user.providerData.some((p) => p.providerId === 'password');
  try {
    if (hasPassword && currentPassword) {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    } else {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    }
    await verifyBeforeUpdateEmail(user, cleanEmail);
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export async function resolveAdminSession(
  user: FirebaseUser,
  defaultPartners: PartnerItem[]
): Promise<AdminRecord | null> {
  const email = user.email || '';
  const displayName = user.displayName || 'Admin';
  const adminRef = doc(db, 'admins', user.uid);

  let snap;
  try {
    snap = await getDoc(adminRef);
  } catch {
    snap = null;
  }

  if (snap && snap.exists()) {
    const rec = snap.data() as AdminRecord;
    if (rec.active === false) {
      return null;
    }
    // If Super Admin changed email via verifyBeforeUpdateEmail, sync DB records automatically
    if (rec.isSuperAdmin && email && rec.email && rec.email.toLowerCase() !== email.toLowerCase() && user.emailVerified) {
      try {
        await updateDoc(adminRef, {
          email: email.slice(0, 150),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'accounts', user.uid), {
          email: email.slice(0, 150),
          updatedAt: serverTimestamp(),
        });
        rec.email = email;
      } catch {
        // non-fatal sync
      }
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          email: email.slice(0, 150),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // users profile doc may not exist for seeded super admin
      }
    }
    if (rec.isSuperAdmin && user.emailVerified) {
      await ensureAdminSeedData(user.uid, email, rec.name || displayName, defaultPartners, true);
    }
    return rec;
  }

  if (isAdminEmail(email) && user.emailVerified) {
    await ensureAdminSeedData(user.uid, email, displayName, defaultPartners, true);
    return {
      uid: user.uid,
      email,
      name: displayName,
      isSuperAdmin: true,
      active: true,
      perms: STAFF_PERM_DEFS.map((p) => p.key),
    };
  }

  return null;
}

export async function ensureAdminSeedData(
  uid: string,
  email: string,
  displayName: string,
  defaultPartners: PartnerItem[],
  forceSuperAdmin = false
): Promise<void> {
  if (!forceSuperAdmin && !isAdminEmail(email)) return;

  const settingsRef = doc(db, 'settings', 'app');
  try {
    const snap = await getDoc(settingsRef);
    if (!snap.exists()) {
      await setDoc(settingsRef, {
        name: 'Primble BD LTD',
        logo: '',
        auto: 1,
        ytUrl: '',
        ytTitle: 'Featured Video',
        ytOn: 1,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/app');
  }

  const adminRef = doc(db, 'admins', uid);
  try {
    const snap = await getDoc(adminRef);
    if (!snap.exists()) {
      await setDoc(adminRef, {
        uid,
        email: email.slice(0, 150),
        name: (displayName || 'Super Admin').slice(0, 100),
        isSuperAdmin: true,
        active: true,
        perms: STAFF_PERM_DEFS.map((p) => p.key),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (snap.data()?.isSuperAdmin !== true && isAdminEmail(email)) {
      await updateDoc(adminRef, {
        isSuperAdmin: true,
        active: true,
        perms: STAFF_PERM_DEFS.map((p) => p.key),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `admins/${uid}`);
  }

  const accRef = doc(db, 'accounts', uid);
  try {
    const snap = await getDoc(accRef);
    if (!snap.exists()) {
      await setDoc(accRef, {
        uid,
        admin: 1,
        name: (displayName || 'Admin').slice(0, 100),
        email: email.slice(0, 150),
        ph: 'admin',
        role: 'ADMIN',
        kyc: 'APPROVED',
        frozen: false,
        bal: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `accounts/${uid}`);
  }

  try {
    const firstPartnerRef = doc(db, 'partners', 'seed_bkash');
    const firstSnap = await getDoc(firstPartnerRef);
    if (!firstSnap.exists()) {
      const batch = writeBatch(db);
      defaultPartners.forEach((p) => {
        const cleanId = `seed_${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`.slice(0, 64);
        batch.set(doc(db, 'partners', cleanId), {
          id: cleanId,
          type: p.type,
          name: p.name.slice(0, 80),
          logo: (p.logo || '').slice(0, 350000),
          active: true,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  } catch {
    // Non-fatal if partners already exist
  }
}

export function startPublicBrandListeners(cbs: PublicBrandCallbacks): void {
  stopPublicBrandListeners();

  publicUnsubs.push(
    onSnapshot(
      doc(db, 'settings', 'app'),
      (snap) => {
        if (snap.exists()) {
          cbs.onSettings(snap.data() as AppCfg);
        }
      },
      (err) => {
        if (!err.message.toLowerCase().includes('permission')) {
          handleFirestoreError(err, OperationType.GET, 'settings/app');
        }
      }
    )
  );

  publicUnsubs.push(
    onSnapshot(
      query(collection(db, 'banners'), where('active', '==', true)),
      (snap) => {
        const list = sortDescByCreated(
          snap.docs.map((d) => d.data() as BannerItem & { createdAt?: { toMillis?: () => number } })
        );
        cbs.onBanners(list);
      },
      (err) => {
        if (!err.message.toLowerCase().includes('permission')) {
          handleFirestoreError(err, OperationType.LIST, 'banners');
        }
      }
    )
  );

  publicUnsubs.push(
    onSnapshot(
      query(collection(db, 'partners'), where('active', '==', true)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as PartnerItem);
        cbs.onPartners(list);
      },
      (err) => {
        if (!err.message.toLowerCase().includes('permission')) {
          handleFirestoreError(err, OperationType.LIST, 'partners');
        }
      }
    )
  );
}

export function startWalletListeners(
  uid: string,
  adminRecord: AdminRecord | null,
  cbs: WalletSyncCallbacks
): void {
  stopWalletListeners();
  const isAdminOrStaff = Boolean(adminRecord && adminRecord.active !== false);
  const isSuper = Boolean(adminRecord?.isSuperAdmin);

  // 1. Own Account
  activeUnsubs.push(
    onSnapshot(
      doc(db, 'accounts', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as WalletUser;
          cbs.onOwnAccount({ ...data, id: data.uid || snap.id });
        } else {
          cbs.onOwnAccount(null);
        }
      },
      (err) => {
        if (!auth.currentUser) return;
        handleFirestoreError(err, OperationType.GET, `accounts/${uid}`);
      }
    )
  );

  // 2. Own Admin Record (so staff permission updates apply immediately)
  if (isAdminOrStaff) {
    activeUnsubs.push(
      onSnapshot(
        doc(db, 'admins', uid),
        (snap) => {
          cbs.onOwnAdminRecord(snap.exists() ? (snap.data() as AdminRecord) : null);
        },
        (err) => {
          if (!auth.currentUser) return;
          if (!err.message.toLowerCase().includes('permission')) {
            handleFirestoreError(err, OperationType.GET, `admins/${uid}`);
          }
        }
      )
    );
  }

  if (isSuper) {
    activeUnsubs.push(
      onSnapshot(
        collection(db, 'admins'),
        (snap) => {
          cbs.onAllAdmins(snap.docs.map((d) => d.data() as AdminRecord));
        },
        (err) => {
          if (!auth.currentUser) return;
          handleFirestoreError(err, OperationType.LIST, 'admins');
        }
      )
    );
  }

  if (isAdminOrStaff) {
    activeUnsubs.push(
      onSnapshot(
        collection(db, 'accounts'),
        (snap) => {
          const list = snap.docs.map((d) => {
            const data = d.data() as WalletUser;
            return { ...data, id: data.uid || d.id };
          });
          cbs.onAllAccounts(list);
        },
        (err) => {
          if (!auth.currentUser) return;
          handleFirestoreError(err, OperationType.LIST, 'accounts');
        }
      )
    );

    activeUnsubs.push(
      onSnapshot(
        collection(db, 'kycDocs'),
        (snap) => {
          const map: Record<string, { dt?: string; docImg?: string; docImg2?: string; selfie?: string }> = {};
          snap.docs.forEach((d) => {
            const data = d.data() as { uid: string; dt?: string; docImg?: string; docImg2?: string; selfie?: string };
            map[data.uid || d.id] = data;
          });
          cbs.onKycDocs(map);
        },
        (err) => {
          if (!auth.currentUser) return;
          handleFirestoreError(err, OperationType.LIST, 'kycDocs');
        }
      )
    );

    activeUnsubs.push(
      onSnapshot(
        collection(db, 'transactions'),
        (snap) => {
          cbs.onTransactions(sortDescByCreated(snap.docs.map((d) => d.data() as TxItem)));
        },
        (err) => {
          if (!auth.currentUser) return;
          handleFirestoreError(err, OperationType.LIST, 'transactions');
        }
      )
    );

    activeUnsubs.push(
      onSnapshot(
        collection(db, 'requests'),
        (snap) => {
          cbs.onRequests(sortDescByCreated(snap.docs.map((d) => d.data() as ReqItem)));
        },
        (err) => {
          if (!auth.currentUser) return;
          handleFirestoreError(err, OperationType.LIST, 'requests');
        }
      )
    );

    activeUnsubs.push(
      onSnapshot(
        collection(db, 'messages'),
        (snap) => {
          cbs.onMessages(sortDescByCreated(snap.docs.map((d) => d.data() as MsgItem)));
        },
        (err) => {
          if (!auth.currentUser) return;
          handleFirestoreError(err, OperationType.LIST, 'messages');
        }
      )
    );
  } else {
    activeUnsubs.push(
      onSnapshot(
        query(collection(db, 'transactions'), where('uid', '==', uid)),
        (snap) => {
          cbs.onTransactions(sortDescByCreated(snap.docs.map((d) => d.data() as TxItem)));
        },
        (err) => {
          if (!auth.currentUser) return;
          handleFirestoreError(err, OperationType.LIST, 'transactions');
        }
      )
    );

    activeUnsubs.push(
      onSnapshot(
        query(collection(db, 'requests'), where('uid', '==', uid)),
        (snap) => {
          cbs.onRequests(sortDescByCreated(snap.docs.map((d) => d.data() as ReqItem)));
        },
        (err) => {
          if (!auth.currentUser) return;
          handleFirestoreError(err, OperationType.LIST, 'requests');
        }
      )
    );

    activeUnsubs.push(
      onSnapshot(
        query(collection(db, 'messages'), where('uid', '==', uid)),
        (snap) => {
          cbs.onMessages(sortDescByCreated(snap.docs.map((d) => d.data() as MsgItem)));
        },
        (err) => {
          if (!auth.currentUser) return;
          handleFirestoreError(err, OperationType.LIST, 'messages');
        }
      )
    );
  }
}

function makeAccountNumber(): string {
  const r = crypto.getRandomValues(new Uint32Array(3));
  return '880' + ('' + r[0] + r[1] + r[2]).slice(0, 10);
}

function makeTxId(): string {
  return 'TRX' + Date.now().toString().slice(-8) + Math.random().toString(36).slice(2, 5).toUpperCase();
}

function makeId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function registerWalletAccountFirestore(params: {
  uid: string;
  name: string;
  email: string;
  ph: string;
  role: 'STAFF' | 'GENERAL_CUSTOMER' | 'VIP_CUSTOMER';
  docNumber: string;
  dt: string;
  spHash: string;
  docImg: string;
  docImg2: string;
  selfie: string;
  timeStr: string;
  autoApprove: boolean;
}): Promise<{ kyc: 'APPROVED' | 'PENDING'; acc?: string }> {
  const { uid, name, email, ph, role, docNumber, dt, spHash, docImg, docImg2, selfie, timeStr, autoApprove } = params;
  let effectiveAuto = autoApprove;
  try {
    const cfgSnap = await getDoc(doc(db, 'settings', 'app'));
    if (cfgSnap.exists()) {
      effectiveAuto = cfgSnap.data()?.auto === 1;
    } else {
      effectiveAuto = false;
    }
  } catch {
    effectiveAuto = false;
  }
  const kyc: 'APPROVED' | 'PENDING' = effectiveAuto ? 'APPROVED' : 'PENDING';
  const accNum = effectiveAuto ? makeAccountNumber() : undefined;

  const batch = writeBatch(db);

  const accountData: Record<string, unknown> = {
    uid,
    admin: 0,
    name: name.trim().slice(0, 100),
    email: email.trim().slice(0, 150),
    ph: ph.trim().slice(0, 30),
    role,
    kyc,
    frozen: false,
    bal: 0,
    doc: docNumber.trim().slice(0, 60),
    dt: dt.slice(0, 10),
    sp: spHash.slice(0, 128),
    photo: selfie.slice(0, 350000),
    time: timeStr.slice(0, 40),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (accNum) accountData.acc = accNum;

  batch.set(doc(db, 'accounts', uid), accountData);

  batch.set(doc(db, 'kycDocs', uid), {
    uid,
    dt: dt.slice(0, 10),
    docImg: docImg.slice(0, 400000),
    docImg2: docImg2.slice(0, 400000),
    selfie: selfie.slice(0, 300000),
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', uid), {
    uid,
    name: name.trim().slice(0, 100),
    email: email.trim().slice(0, 150),
    ph: ph.trim().slice(0, 30),
    role,
    acc: accNum || '',
    notif: ['SMS alerts', 'Push notifications'],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (accNum) {
    batch.set(doc(db, 'accountDirectory', accNum), {
      uid,
      acc: accNum,
      name: name.trim().slice(0, 100),
      kyc: 'APPROVED',
      frozen: false,
      photo: selfie.slice(0, 350000),
    });
    const mId = makeId('msg');
    batch.set(doc(db, 'messages', mId), {
      id: mId,
      uid,
      t: 'Account activated',
      b: `Your Primble BD LTD account number: ${accNum}`,
      read: 0,
      time: timeStr.slice(0, 40),
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return { kyc, acc: accNum };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `accounts/${uid}`);
  }
}

export async function lookupRecipientByAcc(accNumber: string): Promise<RecipientLookup | null> {
  const clean = accNumber.trim();
  if (!/^[a-zA-Z0-9_-]{10,20}$/.test(clean)) return null;
  const path = `accountDirectory/${clean}`;
  try {
    const snap = await getDoc(doc(db, 'accountDirectory', clean));
    if (!snap.exists()) return null;
    const data = snap.data() as RecipientLookup;
    if (data.kyc !== 'APPROVED' || data.frozen || data.uid === auth.currentUser?.uid) {
      return null;
    }
    return data;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function transferMoneyAtomic(params: {
  senderUid: string;
  recipientUid: string;
  amount: number;
  timeStr: string;
}): Promise<void> {
  const { senderUid, recipientUid, amount, timeStr } = params;
  if (!(amount > 0) || senderUid === recipientUid) {
    throw new Error('Invalid transfer amount or recipient.');
  }

  try {
    await runTransaction(db, async (tx) => {
      const sRef = doc(db, 'accounts', senderUid);
      const rRef = doc(db, 'accounts', recipientUid);
      const [sSnap, rSnap] = await Promise.all([tx.get(sRef), tx.get(rRef)]);

      if (!sSnap.exists() || !rSnap.exists()) {
        throw new Error('Account does not exist.');
      }

      const sData = sSnap.data() as WalletUser;
      const rData = rSnap.data() as WalletUser;

      if (sData.kyc !== 'APPROVED' || sData.frozen) {
        throw new Error('Your account is not active for transfers.');
      }
      if (rData.kyc !== 'APPROVED' || rData.frozen) {
        throw new Error('Recipient account is unavailable.');
      }
      if (sData.bal < amount) {
        throw new Error('Insufficient balance');
      }

      const newSBal = Number((sData.bal - amount).toFixed(2));
      const newRBal = Number((rData.bal + amount).toFixed(2));

      tx.update(sRef, { bal: newSBal, updatedAt: serverTimestamp() });
      tx.update(rRef, { bal: newRBal, updatedAt: serverTimestamp() });

      const txOutId = makeTxId();
      const txInId = makeTxId();

      tx.set(doc(db, 'transactions', txOutId), {
        id: txOutId,
        uid: senderUid,
        senderUid,
        amt: -amount,
        note: `Send to ${rData.acc || rData.name}`.slice(0, 200),
        time: timeStr.slice(0, 40),
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'transactions', txInId), {
        id: txInId,
        uid: recipientUid,
        senderUid,
        amt: amount,
        note: `Received from ${sData.acc || sData.name}`.slice(0, 200),
        time: timeStr.slice(0, 40),
        createdAt: serverTimestamp(),
      });

      const msgOutId = makeId('msg');
      const msgInId = makeId('msg');

      tx.set(doc(db, 'messages', msgOutId), {
        id: msgOutId,
        uid: senderUid,
        senderUid,
        t: 'Send Money',
        b: `BDT ${amount} sent to ${rData.name} (${rData.acc || ''}).`.slice(0, 500),
        read: 0,
        time: timeStr.slice(0, 40),
        createdAt: serverTimestamp(),
      });

      tx.set(doc(db, 'messages', msgInId), {
        id: msgInId,
        uid: recipientUid,
        senderUid,
        t: 'Money Received',
        b: `BDT ${amount} received from ${sData.name} (${sData.acc || ''}).`.slice(0, 500),
        read: 0,
        time: timeStr.slice(0, 40),
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('Insufficient') || err.message.includes('Account'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `accounts/${senderUid}`);
  }
}

export async function submitWalletRequestFirestore(params: {
  uid: string;
  type: 'ADD' | 'MFS' | 'BANK';
  op: string;
  ext: string;
  name: string;
  trx: string;
  amt: number;
  timeStr: string;
}): Promise<void> {
  const cleanExt = params.ext.trim().slice(0, 80);
  if (!cleanExt) {
    throw new Error('Enter your account or mobile number.');
  }
  const id = makeId('req');
  try {
    await setDoc(doc(db, 'requests', id), {
      id,
      type: params.type,
      uid: params.uid,
      op: (params.op.trim() || 'Wallet').slice(0, 80),
      ext: cleanExt,
      name: params.name.trim().slice(0, 100),
      trx: params.trx.trim().slice(0, 80),
      amt: params.amt,
      st: 'PENDING',
      time: (params.timeStr.trim() || new Date().toLocaleString('en-GB')).slice(0, 40),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `requests/${id}`);
  }
}

export async function markMessagesReadFirestore(msgs: MsgItem[]): Promise<void> {
  const unread = msgs.filter((m) => !m.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((m) => {
    batch.update(doc(db, 'messages', m.id), { read: 1 });
  });
  try {
    await batch.commit();
  } catch {
    // ignore read-mark failures
  }
}

export async function updateAccountProfileFirestore(
  uid: string,
  acc: string | undefined,
  fields: {
    name: string;
    email: string;
    dob: string;
    gender: string;
    town: string;
    job: string;
    addr: string;
    notif: string[];
    photo?: string;
  }
): Promise<void> {
  const patch: Record<string, unknown> = {
    name: fields.name.trim().slice(0, 100),
    email: fields.email.trim().slice(0, 150),
    dob: fields.dob.slice(0, 20),
    gender: fields.gender.slice(0, 20),
    town: fields.town.slice(0, 60),
    job: fields.job.slice(0, 60),
    addr: fields.addr.trim().slice(0, 300),
    notif: fields.notif.slice(0, 10),
    updatedAt: serverTimestamp(),
  };
  if (fields.photo) {
    patch.photo = fields.photo.slice(0, 350000);
  }

  try {
    await updateDoc(doc(db, 'accounts', uid), patch);
    if (acc) {
      const dirPatch: Record<string, unknown> = {
        name: fields.name.trim().slice(0, 100),
      };
      if (fields.photo) dirPatch.photo = fields.photo.slice(0, 350000);
      await updateDoc(doc(db, 'accountDirectory', acc), dirPatch);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `accounts/${uid}`);
  }
}

export async function updateSecurityPinFirestore(uid: string, spHash: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'accounts', uid), {
      sp: spHash.slice(0, 128),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `accounts/${uid}`);
  }
}

// ---------------- SUPER ADMIN STAFF MANAGEMENT ----------------

export async function adminCreateStaffFirestore(params: {
  name: string;
  email: string;
  password: string;
  ph: string;
  spHash: string;
  perms: string[];
  timeStr: string;
}): Promise<string> {
  const { name, email, password, ph, spHash, perms, timeStr } = params;
  const cleanEmail = email.trim();
  const cleanName = name.trim().slice(0, 100);
  if (!cleanName || !cleanEmail || password.length < 6) {
    throw new Error('Enter staff name, valid email, and a 6+ character password.');
  }

  const secApp = initializeApp(firebaseConfig, `staff_creator_${Date.now()}`);
  const secAuth = getAuth(secApp);
  let staffUid = '';

  try {
    const cred = await createUserWithEmailAndPassword(secAuth, cleanEmail, password);
    await updateProfile(cred.user, { displayName: cleanName });
    await sendEmailVerification(cred.user);
    staffUid = cred.user.uid;
  } catch (err) {
    throw new Error(mapAuthError(err));
  } finally {
    await signOut(secAuth).catch(() => {});
    await deleteApp(secApp).catch(() => {});
  }

  const safePerms = perms.slice(0, 20);
  const batch = writeBatch(db);

  batch.set(doc(db, 'admins', staffUid), {
    uid: staffUid,
    email: cleanEmail.slice(0, 150),
    name: cleanName,
    isSuperAdmin: false,
    active: true,
    perms: safePerms,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'accounts', staffUid), {
    uid: staffUid,
    admin: 1,
    name: cleanName,
    email: cleanEmail.slice(0, 150),
    ph: (ph.trim() || 'staff').slice(0, 30),
    role: 'ADMIN',
    kyc: 'APPROVED',
    frozen: false,
    bal: 0,
    sp: spHash.slice(0, 128),
    perms: safePerms,
    time: timeStr.slice(0, 40),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'users', staffUid), {
    uid: staffUid,
    name: cleanName,
    email: cleanEmail.slice(0, 150),
    ph: (ph.trim() || 'staff').slice(0, 30),
    role: 'ADMIN',
    acc: '',
    notif: ['SMS alerts', 'Push notifications'],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return staffUid;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `admins/${staffUid}`);
  }
}

export async function adminUpdateStaffAccessFirestore(
  staffUid: string,
  params: { perms: string[]; active: boolean; name?: string }
): Promise<void> {
  const safePerms = params.perms.slice(0, 20);
  const batch = writeBatch(db);

  const adminPatch: Record<string, unknown> = {
    perms: safePerms,
    active: params.active,
    updatedAt: serverTimestamp(),
  };
  if (params.name) adminPatch.name = params.name.trim().slice(0, 100);
  batch.update(doc(db, 'admins', staffUid), adminPatch);

  try {
    const accSnap = await getDoc(doc(db, 'accounts', staffUid));
    if (accSnap.exists()) {
      batch.update(doc(db, 'accounts', staffUid), {
        perms: safePerms,
        frozen: !params.active,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `admins/${staffUid}`);
  }
}

export async function adminDeleteStaffFirestore(staffUid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'admins', staffUid));
  try {
    const accSnap = await getDoc(doc(db, 'accounts', staffUid));
    if (accSnap.exists()) batch.delete(doc(db, 'accounts', staffUid));
    const userSnap = await getDoc(doc(db, 'users', staffUid));
    if (userSnap.exists()) batch.delete(doc(db, 'users', staffUid));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `admins/${staffUid}`);
  }
}

// ---------------- ADMIN / STAFF OPERATIONS ----------------

export async function adminKycDecisionFirestore(
  targetUser: WalletUser,
  approve: boolean,
  timeStr: string
): Promise<void> {
  const targetUid = targetUser.uid || targetUser.id;
  const batch = writeBatch(db);

  if (approve) {
    const newAcc = targetUser.acc || makeAccountNumber();
    batch.update(doc(db, 'accounts', targetUid), {
      kyc: 'APPROVED',
      acc: newAcc,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'accountDirectory', newAcc), {
      uid: targetUid,
      acc: newAcc,
      name: targetUser.name.slice(0, 100),
      kyc: 'APPROVED',
      frozen: Boolean(targetUser.frozen),
      photo: (targetUser.photo || '').slice(0, 350000),
    });
    const mId = makeId('msg');
    batch.set(doc(db, 'messages', mId), {
      id: mId,
      uid: targetUid,
      t: 'Account activated',
      b: `Congratulations! Your Primble BD LTD account number: ${newAcc}`,
      read: 0,
      time: timeStr.slice(0, 40),
      createdAt: serverTimestamp(),
    });
  } else {
    batch.update(doc(db, 'accounts', targetUid), {
      kyc: 'REJECTED',
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `accounts/${targetUid}`);
  }
}

export async function adminToggleFreezeFirestore(targetUser: WalletUser): Promise<void> {
  const targetUid = targetUser.uid || targetUser.id;
  const nextFrozen = !targetUser.frozen;
  const batch = writeBatch(db);
  batch.update(doc(db, 'accounts', targetUid), {
    frozen: nextFrozen,
    updatedAt: serverTimestamp(),
  });
  if (targetUser.acc) {
    batch.update(doc(db, 'accountDirectory', targetUser.acc), {
      frozen: nextFrozen,
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `accounts/${targetUid}`);
  }
}

export async function adminProcessRequestFirestore(
  req: ReqItem,
  approve: boolean,
  timeStr: string
): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const reqRef = doc(db, 'requests', req.id);
      const accRef = doc(db, 'accounts', req.uid);
      const [reqSnap, accSnap] = await Promise.all([tx.get(reqRef), tx.get(accRef)]);

      if (!reqSnap.exists() || !accSnap.exists()) {
        throw new Error('Request or user account not found');
      }

      const rData = reqSnap.data() as ReqItem;
      const uData = accSnap.data() as WalletUser;
      if (rData.st !== 'PENDING') {
        throw new Error('Request already processed');
      }

      const mId = makeId('msg');

      if (!approve) {
        tx.update(reqRef, { st: 'REJECTED' });
        tx.set(doc(db, 'messages', mId), {
          id: mId,
          uid: req.uid,
          t: 'Request rejected',
          b: `Your request for BDT ${rData.amt} was rejected.`,
          read: 0,
          time: timeStr.slice(0, 40),
          createdAt: serverTimestamp(),
        });
        return;
      }

      if (rData.type === 'ADD') {
        tx.update(accRef, {
          bal: Number((uData.bal + rData.amt).toFixed(2)),
          updatedAt: serverTimestamp(),
        });
        tx.update(reqRef, { st: 'APPROVED' });
        const txId = makeTxId();
        tx.set(doc(db, 'transactions', txId), {
          id: txId,
          uid: req.uid,
          amt: rData.amt,
          note: `Add Money ${rData.op}`.slice(0, 200),
          time: timeStr.slice(0, 40),
          createdAt: serverTimestamp(),
        });
        tx.set(doc(db, 'messages', mId), {
          id: mId,
          uid: req.uid,
          t: 'Add Money',
          b: `BDT ${rData.amt} has been added to your wallet.`,
          read: 0,
          time: timeStr.slice(0, 40),
          createdAt: serverTimestamp(),
        });
      } else {
        if (uData.bal < rData.amt) {
          throw new Error('User balance is too low');
        }
        tx.update(accRef, {
          bal: Number((uData.bal - rData.amt).toFixed(2)),
          updatedAt: serverTimestamp(),
        });
        tx.update(reqRef, { st: 'DEBITED' });
        const txId = makeTxId();
        tx.set(doc(db, 'transactions', txId), {
          id: txId,
          uid: req.uid,
          amt: -rData.amt,
          note: `Withdraw ${rData.op}`.slice(0, 200),
          time: timeStr.slice(0, 40),
          createdAt: serverTimestamp(),
        });
        tx.set(doc(db, 'messages', mId), {
          id: mId,
          uid: req.uid,
          t: 'Withdraw',
          b: `BDT ${rData.amt} has been debited and transferred to ${rData.op}.`,
          read: 0,
          time: timeStr.slice(0, 40),
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('balance') || err.message.includes('processed'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `requests/${req.id}`);
  }
}

export async function adminPaySalaryOrProfitFirestore(
  targets: WalletUser[],
  kind: string,
  amount: number,
  timeStr: string
): Promise<void> {
  if (!targets.length || !(amount > 0)) return;
  try {
    await runTransaction(db, async (tx) => {
      const snaps = await Promise.all(
        targets.map((u) => tx.get(doc(db, 'accounts', u.uid || u.id)))
      );
      snaps.forEach((snap, idx) => {
        if (!snap.exists()) return;
        const uData = snap.data() as WalletUser;
        const targetUid = targets[idx].uid || targets[idx].id;
        tx.update(doc(db, 'accounts', targetUid), {
          bal: Number((uData.bal + amount).toFixed(2)),
          updatedAt: serverTimestamp(),
        });
        const txId = makeTxId() + idx;
        tx.set(doc(db, 'transactions', txId), {
          id: txId,
          uid: targetUid,
          amt: amount,
          note: kind.slice(0, 200),
          time: timeStr.slice(0, 40),
          createdAt: serverTimestamp(),
        });
        const mId = makeId('msg') + idx;
        tx.set(doc(db, 'messages', mId), {
          id: mId,
          uid: targetUid,
          t: kind.slice(0, 120),
          b: `Your ${kind} of BDT ${amount} has been credited.`.slice(0, 500),
          read: 0,
          time: timeStr.slice(0, 40),
          createdAt: serverTimestamp(),
        });
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'accounts');
  }
}

export async function adminSendSmsFirestore(
  targets: WalletUser[],
  title: string,
  body: string,
  timeStr: string
): Promise<void> {
  if (!targets.length) return;
  const batch = writeBatch(db);
  targets.forEach((u, idx) => {
    const mId = makeId('msg') + idx;
    batch.set(doc(db, 'messages', mId), {
      id: mId,
      uid: u.uid || u.id,
      t: title.slice(0, 120),
      b: body.slice(0, 500),
      read: 0,
      time: timeStr.slice(0, 40),
      createdAt: serverTimestamp(),
    });
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'messages');
  }
}

export async function adminSaveBannersAndYtFirestore(
  nextBanners: BannerItem[],
  _prevBanners: BannerItem[],
  cfg: AppCfg
): Promise<void> {
  const nextIds = new Set(nextBanners.map((b) => b.id));

  try {
    const liveSnap = await getDocs(query(collection(db, 'banners'), where('active', '==', true)));
    const liveIds = new Set(liveSnap.docs.map((d) => d.id));
    const batch = writeBatch(db);
    liveIds.forEach((id) => {
      if (!nextIds.has(id)) {
        batch.delete(doc(db, 'banners', id));
      }
    });
    nextBanners.forEach((b) => {
      if (!liveIds.has(b.id)) {
        batch.set(doc(db, 'banners', b.id), {
          id: b.id,
          src: b.src.slice(0, 600000),
          active: true,
          createdAt: serverTimestamp(),
        });
      }
    });
    batch.set(doc(db, 'settings', 'app'), {
      name: (cfg.name || 'Primble BD LTD').slice(0, 100),
      logo: (cfg.logo || '').slice(0, 450000),
      auto: cfg.auto ? 1 : 0,
      ytUrl: (cfg.ytUrl || '').slice(0, 300),
      ytTitle: (cfg.ytTitle || 'Featured Video').slice(0, 100),
      ytOn: cfg.ytOn === 0 ? 0 : 1,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'banners');
  }
}

export async function adminSaveSettingsFirestore(cfg: AppCfg): Promise<void> {
  try {
    await setDoc(doc(db, 'settings', 'app'), {
      name: (cfg.name || 'Primble BD LTD').slice(0, 100),
      logo: (cfg.logo || '').slice(0, 450000),
      auto: cfg.auto ? 1 : 0,
      ytUrl: (cfg.ytUrl || '').slice(0, 300),
      ytTitle: (cfg.ytTitle || 'Featured Video').slice(0, 100),
      ytOn: cfg.ytOn === 0 ? 0 : 1,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/app');
  }
}

export async function adminSavePartnersFirestore(
  nextPartners: PartnerItem[],
  _prevPartners: PartnerItem[]
): Promise<void> {
  const nextIds = new Set(nextPartners.map((p) => p.id));
  try {
    const liveSnap = await getDocs(query(collection(db, 'partners'), where('active', '==', true)));
    const liveIds = new Set(liveSnap.docs.map((d) => d.id));
    const batch = writeBatch(db);
    liveIds.forEach((id) => {
      if (!nextIds.has(id)) {
        batch.delete(doc(db, 'partners', id));
      }
    });
    nextPartners.forEach((p) => {
      if (liveIds.has(p.id)) {
        batch.update(doc(db, 'partners', p.id), {
          type: p.type,
          name: p.name.slice(0, 80),
          logo: (p.logo || '').slice(0, 350000),
          active: true,
        });
      } else {
        batch.set(doc(db, 'partners', p.id), {
          id: p.id,
          type: p.type,
          name: p.name.slice(0, 80),
          logo: (p.logo || '').slice(0, 350000),
          active: true,
          createdAt: serverTimestamp(),
        });
      }
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'partners');
  }
}

export { deleteDoc };
