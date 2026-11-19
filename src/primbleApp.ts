// Primble BD LTD Web Wallet & Admin Console — Real-Time Firestore Edition
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth } from './firebase';
import { signInWithGoogle } from './hooks/useFirestoreProfile';
import {
  STAFF_PERM_DEFS,
  adminCreateStaffFirestore,
  adminDeleteStaffFirestore,
  adminKycDecisionFirestore,
  adminPaySalaryOrProfitFirestore,
  adminProcessRequestFirestore,
  adminSaveBannersAndYtFirestore,
  adminSavePartnersFirestore,
  adminSaveSettingsFirestore,
  adminSendSmsFirestore,
  adminToggleFreezeFirestore,
  adminUpdateStaffAccessFirestore,
  changeOrLinkPassword,
  isAdminEmail,
  loginWithEmailPassword,
  lookupRecipientByAcc,
  markMessagesReadFirestore,
  refreshVerifiedSession,
  registerWalletAccountFirestore,
  registerWithEmailPassword,
  requestAdminEmailChange,
  resendVerificationEmail,
  resolveAdminSession,
  sendResetPasswordEmail,
  startPublicBrandListeners,
  startWalletListeners,
  stopWalletListeners,
  submitWalletRequestFirestore,
  transferMoneyAtomic,
  updateAccountProfileFirestore,
  updateSecurityPinFirestore,
  type AdminRecord,
  type AppCfg,
  type BannerItem,
  type MsgItem,
  type PartnerItem,
  type RecipientLookup,
  type ReqItem,
  type TxItem,
  type WalletUser,
} from './services/firestoreWallet';

declare global {
  interface Window {
    jspdf?: { jsPDF: new () => JsPdfDoc };
    showSaveFilePicker?: (opts?: { suggestedName?: string }) => Promise<FileSystemFileHandle>;
    [key: string]: unknown;
  }
}

interface JsPdfDoc {
  setFillColor(r: number, g: number, b: number): void;
  rect(x: number, y: number, w: number, h: number, style?: string): void;
  setTextColor(c: number): void;
  setFontSize(s: number): void;
  text(txt: string, x: number, y: number): void;
  setFont(font: unknown, style: string): void;
  addPage(): void;
  save(name: string): void;
}

interface FileSystemFileHandle {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

interface AppState {
  users: WalletUser[];
  tx: TxItem[];
  msgs: MsgItem[];
  banners: BannerItem[];
  reqs: ReqItem[];
  partners: PartnerItem[];
  cfg: AppCfg;
}

interface DraftState {
  cfg: AppCfg;
  ban: BannerItem[];
  parts: PartnerItem[];
}

interface PendingManualReg {
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
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

const IP: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-4 4-6 7-6s6 2 7 6M17 5a3.5 3.5 0 010 7M22 20c0-3-2-5-4-6"/>',
  logout: '<path d="M9 4H4v16h5M16 8l4 4-4 4M20 12H9"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="14" r="4"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  dl: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  check: '<path d="M5 13l4 4 10-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  hash: '<path d="M5 9h14M5 15h14M10 3L8 21M16 3l-2 18"/>',
  save: '<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4"/>',
};

const ic = (n: string, z = 20) =>
  `<svg viewBox="0 0 24 24" width="${z}" height="${z}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px">${IP[n] || ''}</svg>`;

function parseYt(raw?: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    if (u.hostname.includes('youtu.be') && /^[a-zA-Z0-9_-]{11}$/.test(parts[0] || '')) return parts[0];
    if (['shorts', 'embed', 'live', 'v'].includes(parts[0] || '') && /^[a-zA-Z0-9_-]{11}$/.test(parts[1] || '')) return parts[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(last)) return last;
  } catch {
    const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  }
  return '';
}

const defp = (): PartnerItem[] => [
  ...['bKash', 'Nagad', 'Rocket'].map((n) => ({
    id: `seed_${n.toLowerCase()}`,
    type: 'MFS' as const,
    name: n,
    logo: '',
  })),
  ...['City Bank PLC', 'Dutch-Bangla Bank', 'Islami Bank', 'BRAC Bank', 'Eastern Bank', 'Sonali Bank'].map((n) => ({
    id: `seed_${n.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    type: 'BANK' as const,
    name: n,
    logo: '',
  })),
];

const PUBLIC_CACHE_KEY = 'pbd_public_cache_v1';

function loadPublicCache(): { cfg: AppCfg; banners: BannerItem[]; partners: PartnerItem[] } {
  const fallback = {
    cfg: { auto: 1, name: 'Primble BD LTD', ytOn: 1 } as AppCfg,
    banners: [] as BannerItem[],
    partners: defp(),
  };
  try {
    const raw = localStorage.getItem(PUBLIC_CACHE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<{ cfg: AppCfg; banners: BannerItem[]; partners: PartnerItem[] }>;
    return {
      cfg: parsed.cfg ? { ...fallback.cfg, ...parsed.cfg } : fallback.cfg,
      banners: Array.isArray(parsed.banners) ? parsed.banners : [],
      partners: Array.isArray(parsed.partners) && parsed.partners.length ? parsed.partners : fallback.partners,
    };
  } catch {
    return fallback;
  }
}

function savePublicCache() {
  try {
    localStorage.setItem(
      PUBLIC_CACHE_KEY,
      JSON.stringify({ cfg: S.cfg, banners: S.banners, partners: S.partners })
    );
  } catch {
    // ignore storage quota errors
  }
}

const initialBrand = loadPublicCache();

let S: AppState = {
  users: [],
  tx: [],
  msgs: [],
  banners: initialBrand.banners,
  reqs: [],
  partners: initialBrand.partners,
  cfg: initialBrand.cfg,
};

function applyBrandHead() {
  const name = S.cfg.name || 'Primble BD LTD';
  document.title = name;
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = name;
  if (S.cfg.logo) {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.href = S.cfg.logo;
  }
}

let fbUser: FirebaseUser | null = null;
let authReady = false;
let accountLoaded = false;
let ownAccount: WalletUser | null = null;
let adminRec: AdminRecord | null = null;
let allAdmins: AdminRecord[] = [];
let kycDocsMap: Record<string, { dt?: string; docImg?: string; docImg2?: string; selfie?: string }> = {};
let pendingManualReg: PendingManualReg | null = null;
let pinUnlocked = false;
let busy = false;

let dr: DraftState | null = null;
let dph: string | null = null;
let tab = 'home';
let mode = 'home';
let msg = '';
let showBal = false;
let bt: ReturnType<typeof setTimeout> | undefined;
let look: { ok: 1; u: RecipientLookup } | { ok: 0; a: string } | null = null;
let pinIn = '';
let tries = 0;
let fh: FileSystemFileHandle | null = null;
let rg: { nidf?: string; nidb?: string; bc?: string; selfie?: string } = {};
let stream: MediaStream | null = null;

const D = (): DraftState =>
  dr || (dr = { cfg: { ...S.cfg }, ban: S.banners.slice(), parts: S.partners.map((x) => ({ ...x })) });

const sha = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pbd' + s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

const isSuperAdminUser = (): boolean =>
  Boolean(adminRec?.isSuperAdmin || (fbUser && isAdminEmail(fbUser.email) && fbUser.emailVerified));

const isAdminOrStaff = (): boolean =>
  Boolean((adminRec && adminRec.active !== false) || (fbUser && isAdminEmail(fbUser.email) && fbUser.emailVerified));

const canTab = (t: string): boolean => {
  if (isSuperAdminUser()) return true;
  if (!adminRec || adminRec.active === false) return false;
  if (t === 'prof' || t === 'me') return true;
  return Boolean(adminRec.perms?.includes(t));
};

const firstAllowedAdminTab = (): string => {
  const order = ['dash', 'kyc', 'add', 'wd', 'pay', 'sms', 'ban', 'part', 'users', 'brand', 'bk', 'staff', 'prof', 'me'];
  return order.find((t) => canTab(t)) || 'prof';
};

const U = (): WalletUser | undefined => {
  if (!fbUser) return undefined;
  return S.users.find((u) => u.id === fbUser!.uid || u.uid === fbUser!.uid) || ownAccount || undefined;
};

const fm = (n: number) => '৳' + Number(n).toFixed(2);
const now = () => new Date().toLocaleString('en-GB');
const uid = () => 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

const flash = (m: string) => {
  msg = m;
  render();
};

const isEditingForm = () => {
  const el = document.activeElement;
  return Boolean(dr || (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')));
};

const safeBackgroundRender = () => {
  if (!isEditingForm()) {
    render();
  }
};

function mergeAdminKyc() {
  if (!isAdminOrStaff()) return;
  S.users = S.users.map((u) => {
    const k = kycDocsMap[u.uid || u.id];
    return k ? { ...u, dt: k.dt || u.dt, docImg: k.docImg || u.docImg, docImg2: k.docImg2 || u.docImg2, selfie: k.selfie || u.selfie } : u;
  });
}

async function bkW() {
  if (!fh) return;
  try {
    const w = await fh.createWritable();
    await w.write(JSON.stringify(S));
    await w.close();
  } catch {
    // ignore file handle errors
  }
}

const sv = () => {
  void bkW();
};

const go = (t: string) => {
  tab = t;
  msg = '';
  look = null;
  dr = null;
  dph = null;
  if (t === 'sms' && fbUser) {
    const myUnread = S.msgs.filter((m) => m.uid === fbUser!.uid && !m.read);
    if (myUnread.length) {
      myUnread.forEach((m) => (m.read = 1));
      void markMessagesReadFirestore(myUnread);
    }
  }
  render();
};

async function startSessionForUser(user: FirebaseUser) {
  stopWalletListeners();
  accountLoaded = false;
  render();

  const resolvedAdmin = await resolveAdminSession(user, defp());
  adminRec = resolvedAdmin;

  if (resolvedAdmin) {
    if (!canTab(tab)) {
      tab = firstAllowedAdminTab();
    }
  } else if (tab === 'dash' || tab === 'staff') {
    tab = 'home';
  }

  // If returning from email verification after manual registration, finish saving KYC/wallet now!
  if (pendingManualReg && user.emailVerified && !resolvedAdmin) {
    const regData = pendingManualReg;
    pendingManualReg = null;
    try {
      const res = await registerWalletAccountFirestore({
        uid: user.uid,
        name: regData.name,
        email: regData.email,
        ph: regData.ph,
        role: regData.role,
        docNumber: regData.docNumber,
        dt: regData.dt,
        spHash: regData.spHash,
        docImg: regData.docImg,
        docImg2: regData.docImg2,
        selfie: regData.selfie,
        timeStr: regData.timeStr,
        autoApprove: Boolean(S.cfg.auto),
      });
      pinUnlocked = true;
      tab = 'home';
      msg =
        res.kyc === 'APPROVED'
          ? `Registration complete! Your account number: ${res.acc}.`
          : 'Application submitted. Your wallet will activate as soon as the admin approves.';
    } catch (err) {
      msg = err instanceof Error ? err.message : 'Failed to finish saving registration.';
    }
  }

  startWalletListeners(user.uid, resolvedAdmin, {
    onOwnAccount: (account) => {
      ownAccount = account;
      accountLoaded = true;
      if (account) {
        const idx = S.users.findIndex((u) => u.id === account.id || u.uid === account.uid);
        if (idx >= 0) S.users[idx] = account;
        else S.users.unshift(account);
        // Only bypass PIN if account has NO 4-digit PIN set yet
        if (!account.sp) {
          pinUnlocked = true;
        }
      }
      safeBackgroundRender();
    },
    onOwnAdminRecord: (rec) => {
      adminRec = rec;
      if (rec && !canTab(tab)) {
        tab = firstAllowedAdminTab();
      }
      safeBackgroundRender();
    },
    onAllAdmins: (admins) => {
      allAdmins = admins;
      safeBackgroundRender();
    },
    onAllAccounts: (accounts) => {
      S.users = accounts;
      mergeAdminKyc();
      safeBackgroundRender();
    },
    onKycDocs: (docsByUid) => {
      kycDocsMap = docsByUid;
      mergeAdminKyc();
      safeBackgroundRender();
    },
    onTransactions: (tx) => {
      S.tx = tx;
      safeBackgroundRender();
    },
    onRequests: (reqs) => {
      S.reqs = reqs;
      safeBackgroundRender();
    },
    onMessages: (msgs) => {
      S.msgs = msgs;
      safeBackgroundRender();
    },
  });
}

function init() {
  applyBrandHead();

  startPublicBrandListeners({
    onSettings: (cfg) => {
      S.cfg = {
        auto: cfg.auto ?? 1,
        name: cfg.name || 'Primble BD LTD',
        logo: cfg.logo || '',
        ytUrl: cfg.ytUrl || '',
        ytTitle: cfg.ytTitle || 'Featured Video',
        ytOn: cfg.ytOn === 0 ? 0 : 1,
      };
      savePublicCache();
      applyBrandHead();
      safeBackgroundRender();
    },
    onBanners: (banners) => {
      S.banners = banners;
      savePublicCache();
      safeBackgroundRender();
    },
    onPartners: (partners) => {
      S.partners = partners.length ? partners : defp();
      savePublicCache();
      safeBackgroundRender();
    },
  });

  onAuthStateChanged(auth, async (user) => {
    fbUser = user;
    authReady = true;
    stopWalletListeners();

    if (!user) {
      accountLoaded = false;
      ownAccount = null;
      adminRec = null;
      allAdmins = [];
      pinUnlocked = false;
      S = {
        users: [],
        tx: [],
        msgs: [],
        banners: S.banners,
        reqs: [],
        partners: S.partners.length ? S.partners : defp(),
        cfg: S.cfg,
      };
      render();
      return;
    }

    if (mode === 'home') {
      mode = 'app';
    }

    if (!user.emailVerified) {
      try {
        await user.reload();
        if (user.emailVerified) {
          await user.getIdToken(true);
        }
      } catch {
        // ignore transient reload failure
      }
      if (!user.emailVerified) {
        accountLoaded = true;
        render();
        return;
      }
    }

    await startSessionForUser(user);
  });
}

async function googleAuth(targetMode?: 'login' | 'register') {
  if (busy) return;
  busy = true;
  msg = '';
  render();
  try {
    pinUnlocked = false;
    if (targetMode) mode = targetMode;
    await signInWithGoogle();
  } catch (err) {
    pinUnlocked = false;
    flash(err instanceof Error ? err.message : 'Google sign-in failed');
  } finally {
    busy = false;
    render();
  }
}

async function pwLogin(e: Event) {
  e.preventDefault();
  if (busy) return;
  const f = Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;
  if (!f.email || !f.pw) return flash('Enter email and password');
  busy = true;
  msg = '';
  render();
  try {
    pinUnlocked = false;
    await loginWithEmailPassword(f.email, f.pw);
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Sign-in failed');
  } finally {
    busy = false;
    render();
  }
}

async function forgotPw() {
  const emailEl = document.querySelector<HTMLInputElement>('form input[name="email"]');
  const email = emailEl?.value.trim() || '';
  if (!email) return flash('Enter your email above first, then click Forgot password');
  try {
    await sendResetPasswordEmail(email);
    flash(`Password reset email sent to ${email}`);
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to send password reset email');
  }
}

async function checkVerify() {
  if (busy || !fbUser) return;
  busy = true;
  msg = '';
  render();
  try {
    const ok = await refreshVerifiedSession();
    if (!ok) {
      flash('Email is still not verified. Please click the verification link in your email inbox first.');
      return;
    }
    await startSessionForUser(auth.currentUser!);
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Verification check failed');
  } finally {
    busy = false;
    render();
  }
}

async function resendVerify() {
  if (busy) return;
  busy = true;
  render();
  try {
    await resendVerificationEmail();
    flash('Verification email resent! Check your inbox (and spam folder).');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Could not resend verification email');
  } finally {
    busy = false;
    render();
  }
}

function wshow(n: number) {
  document.querySelectorAll<HTMLElement>('.stp').forEach((x) => {
    x.style.display = x.dataset.s == String(n) ? 'block' : 'none';
  });
  document.querySelectorAll('.wz i').forEach((x, i) => {
    x.className = i < n ? 'on' : '';
  });
  const r = document.getElementById('rm');
  if (r) r.style.display = 'none';
}

function wb(n: number) {
  wshow(n - 1);
}

function wn(n: number) {
  const st = document.querySelector<HTMLElement>('.stp[data-s="' + n + '"]');
  if (!st) return;
  for (const el of st.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[name],select[name]')) {
    if (!el.checkValidity()) {
      el.reportValidity();
      return;
    }
  }
  if (n === 1) {
    const form = st.closest('form');
    if (form) {
      const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
      if (!fbUser) {
        if (!f.email) return note('Enter your email address');
        if ((f.pw || '').length < 6) return note('Password must be at least 6 characters');
      }
      if (!/^\d{4}$/.test(f.sp || '')) return note('Enter a 4-digit security PIN');
    }
  }
  if (n === 2) {
    const dtEl = document.querySelector<HTMLSelectElement>('[name=dt]');
    const t = dtEl ? dtEl.value : 'NID';
    if (!(t === 'NID' ? rg.nidf && rg.nidb : rg.bc)) {
      return note(t === 'NID' ? 'Add both the front and back photo of your NID' : 'Add a photo of your birth certificate');
    }
  }
  wshow(n + 1);
}

const note = (m: string) => {
  const x = document.getElementById('rm');
  if (x) {
    x.textContent = m;
    x.style.display = 'block';
  } else flash(m);
};

const imgs = (x: WalletUser) =>
  x.docImg
    ? `<div style="margin-top:6px"><img src="${x.selfie || ''}" style="width:64px;height:64px;object-fit:cover;border-radius:8px"> <img src="${
        x.docImg
      }" style="height:64px;border-radius:8px">${x.docImg2 ? `<img src="${x.docImg2}" style="height:64px;border-radius:8px">` : ''}</div>`
    : '';

function pic(inp: HTMLInputElement, k: 'nidf' | 'nidb' | 'bc' | 'selfie') {
  gal(
    inp,
    (d) => {
      rg[k] = d;
      const i = document.getElementById('pv' + k) as HTMLImageElement | null;
      if (i) {
        i.src = d;
        i.style.display = 'block';
      }
    },
    k === 'selfie' ? 420 : 680
  );
}

async function camOn() {
  const v = document.getElementById('cam') as HTMLVideoElement | null;
  const l = document.getElementById('lv');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    if (v) {
      v.srcObject = stream;
      v.style.display = 'block';
    }
    const shot = document.getElementById('shot');
    if (shot) shot.style.display = 'inline-block';
    if (l) {
      l.textContent =
        'Live check: ' + ['Look to your right', 'Look to your left', 'Blink your eyes', 'Smile'][Math.floor(Math.random() * 4)] + ' — then take the photo';
    }
  } catch {
    if (l) l.textContent = 'Camera did not start. Tap the button below to take a selfie with your phone camera.';
    const b = document.getElementById('fb');
    if (b) b.style.display = 'block';
  }
}

function snap() {
  const v = document.getElementById('cam') as HTMLVideoElement | null;
  if (!v || !v.videoWidth) return;
  const c = document.createElement('canvas');
  const k = Math.min(1, 420 / v.videoWidth);
  c.width = v.videoWidth * k;
  c.height = v.videoHeight * k;
  c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
  rg.selfie = c.toDataURL('image/jpeg', 0.7);
  const i = document.getElementById('pvselfie') as HTMLImageElement | null;
  if (i) {
    i.src = rg.selfie;
    i.style.display = 'block';
  }
  stream && stream.getTracks().forEach((t) => t.stop());
  v.style.display = 'none';
  const shot = document.getElementById('shot');
  if (shot) shot.style.display = 'none';
}

async function reg(e: Event) {
  e.preventDefault();
  if (busy) return;
  const f = Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;
  if (!/^\d{4}$/.test(f.sp || '')) return note('Enter your 4-digit security PIN');
  if (!(f.dt === 'NID' ? rg.nidf && rg.nidb : rg.bc) || !rg.selfie) return note('Upload all ID photos and take a live selfie');
  if (!fbUser && ((f.pw || '').length < 6 || !f.email)) {
    return note('Enter your email and a 6+ character password');
  }

  busy = true;
  render();
  try {
    const spHash = await sha('p' + f.sp);
    const payload: PendingManualReg = {
      name: f.name || fbUser?.displayName || 'Member',
      email: fbUser?.email || f.email || '',
      ph: f.ph,
      role: (f.role as 'STAFF' | 'GENERAL_CUSTOMER' | 'VIP_CUSTOMER') || 'GENERAL_CUSTOMER',
      docNumber: f.doc,
      dt: f.dt || 'NID',
      spHash,
      docImg: rg.nidf || rg.bc || '',
      docImg2: rg.nidb || '',
      selfie: rg.selfie || '',
      timeStr: now(),
    };

    if (!fbUser) {
      // Manual Email & Password registration
      pendingManualReg = payload;
      await registerWithEmailPassword(f.email, f.pw, f.name);
      stream && stream.getTracks().forEach((t) => t.stop());
      rg = {};
      flash(`Verification email sent to ${f.email}. Click the link in your inbox, then press "I Verified — Continue".`);
      return;
    }

    // Google already authenticated & verified
    const res = await registerWalletAccountFirestore({
      uid: fbUser.uid,
      ...payload,
      autoApprove: Boolean(S.cfg.auto),
    });
    stream && stream.getTracks().forEach((t) => t.stop());
    rg = {};
    pinUnlocked = true;
    tab = 'home';
    flash(
      res.kyc === 'APPROVED'
        ? `Registration complete! Your account number: ${res.acc}.`
        : 'Application submitted. Your wallet will activate as soon as the admin approves.'
    );
  } catch (err) {
    pendingManualReg = null;
    note(err instanceof Error ? err.message : 'Registration failed');
  } finally {
    busy = false;
    render();
  }
}

const TOWNS =
  'Bagerhat,Bandarban,Barguna,Barishal,Bhola,Bogura,Brahmanbaria,Chandpur,Chapainawabganj,Chattogram,Chuadanga,Cox’s Bazar,Cumilla,Dhaka,Dinajpur,Faridpur,Feni,Gaibandha,Gazipur,Gopalganj,Habiganj,Jamalpur,Jashore,Jhalokati,Jhenaidah,Joypurhat,Khagrachhari,Khulna,Kishoreganj,Kurigram,Kushtia,Lakshmipur,Lalmonirhat,Madaripur,Magura,Manikganj,Meherpur,Moulvibazar,Munshiganj,Mymensingh,Naogaon,Narail,Narayanganj,Narsingdi,Natore,Netrokona,Nilphamari,Noakhali,Pabna,Panchagarh,Patuakhali,Pirojpur,Rajbari,Rajshahi,Rangamati,Rangpur,Satkhira,Shariatpur,Sherpur,Sirajganj,Sunamganj,Sylhet,Tangail,Thakurgaon'.split(
    ','
  );
const JOBS = ['Employee', 'Business', 'Student', 'Teacher', 'Doctor', 'Engineer', 'Banker', 'Farmer', 'Freelancer', 'Homemaker', 'Other'];
const GEN = ['Male', 'Female', 'Other'];
const NOTI = ['SMS alerts', 'Email alerts', 'Push notifications', 'Salary alerts', 'Offers & news'];

const plogo = (p: PartnerItem, z = 36) =>
  p.logo
    ? `<img src="${p.logo}" alt="" style="width:${z}px;height:${z}px;object-fit:contain;border-radius:10px;background:#fff;padding:3px;border:1px solid var(--b)">`
    : `<b class="mg" style="width:${z}px;height:${z}px">${esc(p.name.slice(0, 2).toUpperCase())}</b>`;

const partTiles = (t: 'MFS' | 'BANK') => {
  const l = S.partners.filter((p) => p.type === t);
  if (!l.length) {
    return `<p class="m">No ${t === 'MFS' ? 'mobile banking' : 'bank'} partners configured.</p><input type="hidden" name="op" value="${t}">`;
  }
  return `<div class="pt">${l
    .map(
      (p, i) =>
        `<button type="button" class="ptl${i ? '' : ' on'}" data-v="${esc(p.name)}" onclick="pk2(this)">${plogo(p, 40)}<span>${esc(p.name)}</span></button>`
    )
    .join('')}</div><input type="hidden" name="op" value="${esc(l[0] ? l[0].name : t)}">`;
};

function pk2(b: HTMLElement) {
  b.parentNode?.querySelectorAll('.ptl').forEach((x) => x.classList.remove('on'));
  b.classList.add('on');
  const next = b.parentNode?.nextSibling as HTMLInputElement | null;
  if (next) next.value = b.dataset.v || '';
}

function partLogo(inp: HTMLInputElement, id: string) {
  gal(
    inp,
    (d) => {
      const item = D().parts.find((x) => x.id === id);
      if (item) item.logo = d;
      render();
    },
    320,
    180000
  );
}

function partDel(id: string) {
  D().parts = D().parts.filter((x) => x.id !== id);
  render();
}

function partAdd() {
  const pn = document.getElementById('pn') as HTMLInputElement | null;
  const pt = document.getElementById('pt') as HTMLSelectElement | null;
  const n = pn?.value.trim() || '';
  if (!n) return;
  D().parts.push({ id: uid(), type: (pt?.value as 'BANK' | 'MFS') || 'BANK', name: n, logo: '' });
  render();
}

const opt = (a: string[], v?: string) => a.map((x) => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');

const profileView = (u: WalletUser) => {
  const ph = dph || u.photo;
  const nt = u.notif || ['SMS alerts', 'Push notifications'];
  return `<form class="pf" onsubmit="saveProf(event)"><h3 style="text-align:center;margin:0 0 16px">Edit Profile</h3><div class="pfp"><div class="pfa" onclick="document.getElementById('pfi').click()">${
    ph ? `<img src="${ph}" alt="">` : `<span>${esc(u.name[0])}</span>`
  }<i>${ic('cam', 20)}</i></div><input id="pfi" type="file" accept="image/*" hidden onchange="setPhoto(this)"></div><label>Name</label><input name="name" value="${esc(
    u.name
  )}" required><label>Email</label><input name="email" type="email" value="${esc(u.email || '')}" disabled>${
    u.admin ? '' : `<label>Mobile number</label><input value="${esc(u.ph)}" disabled>`
  }${u.acc ? `<label>Account number</label><input class="n" value="${u.acc}" disabled>` : ''}${
    u.doc ? `<label>${u.role === 'STAFF' ? 'Staff ID' : 'NID / Birth registration number'}</label><input value="${esc(u.doc)}" disabled>` : ''
  }<label>Birthday</label><input name="dob" type="date" value="${esc(u.dob || '')}"><label>Gender</label><select name="gender"><option value="">Select Gender</option>${opt(
    GEN,
    u.gender
  )}</select><label>Home Town</label><select name="town"><option value="">Select Home Town</option>${opt(
    TOWNS,
    u.town
  )}</select><label>Occupation</label><select name="job"><option value="">Select Occupation</option>${opt(
    JOBS,
    u.job
  )}</select><label>Present address</label><textarea name="addr" rows="2" placeholder="House, road, area">${esc(
    u.addr || ''
  )}</textarea><h3>Notification preferences</h3><div class="chips">${NOTI.map(
    (x) => `<button type="button" class="chip${nt.includes(x) ? ' on' : ''}" onclick="this.classList.toggle('on')">${x}</button>`
  ).join('')}</div><button class="p upd">Update</button></form>`;
};

async function saveProf(e: Event) {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
  const u = U();
  if (!u || !fbUser) return;
  const notifList = [...form.querySelectorAll('.chip.on')].map((x) => x.textContent || '');
  const newPhoto = dph || undefined;
  try {
    await updateAccountProfileFirestore(fbUser.uid, u.acc, {
      name: f.name.trim() || u.name,
      email: u.email || fbUser.email || '',
      dob: f.dob || '',
      gender: f.gender || '',
      town: f.town || '',
      job: f.job || '',
      addr: f.addr.trim(),
      notif: notifList,
      photo: newPhoto,
    });
    dph = null;
    flash('Profile updated');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Profile update failed');
  }
}

function dashView() {
  const us = S.users.filter((x) => !x.admin);
  const ok = us.filter((x) => x.kyc === 'APPROVED');
  const pend = us.filter((x) => x.kyc === 'PENDING').length;
  const pa = S.reqs.filter((r) => r.type === 'ADD' && r.st === 'PENDING').length;
  const pw = S.reqs.filter((r) => r.type !== 'ADD' && r.st === 'PENDING').length;
  const tot = ok.reduce((a, x) => a + x.bal, 0);
  const C: [string, string, number, string, string?][] = [
    ['users', 'Active users', ok.length, '#E11D48'],
    ['shield', 'Pending KYC', pend, '#f59e0b'],
    ['plus', 'Add Money requests', pa, '#16a34a'],
    ['bank', 'Withdraw requests', pw, '#6366f1'],
    ['cash', 'Total wallet balance', tot, '#0ea5e9', '৳'],
    ['list', 'Transactions', S.tx.length, '#a855f7'],
  ];
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * 864e5);
    const k = d.toLocaleDateString('en-GB');
    return [d.toLocaleDateString('en-GB', { weekday: 'short' }), S.tx.filter((t) => String(t.time).slice(0, 10) === k).length] as const;
  });
  const mx = Math.max(1, ...days.map((x) => x[1]));
  const rec = S.tx.slice(0, 6);
  return `<div class="sg">${C.map(
    (c) =>
      `<div class="sc" style="--c1:${c[3]}"><div class="si">${ic(c[0], 22)}</div><div><div class="m">${c[1]}</div><b class="n" data-c="${c[2]}" data-p="${
        c[4] || ''
      }">${c[4] || ''}0</b></div></div>`
  ).join('')}</div><div class="g g2"><div class="card"><h3>Transactions · last 7 days</h3><div class="bars">${days
    .map(
      (d) =>
        `<div class="bc"><div class="bb" style="height:${Math.max(3, Math.round((d[1] / mx) * 100))}%"><span>${d[1]}</span></div><small>${d[0]}</small></div>`
    )
    .join('')}</div></div><div class="card"><h3>Recent activity</h3>${
    rec.length
      ? rec
          .map((t) => {
            const x = S.users.find((y) => y.id === t.uid || y.uid === t.uid);
            return `<div class="row"><div>${esc(t.note)}<div class="m">${x ? esc(x.name) : ''} · ${t.time}</div></div><b class="n ${
              t.amt > 0 ? 'cr' : 'db'
            }">${t.amt > 0 ? '+' : ''}${fm(t.amt)}</b></div>`;
          })
          .join('')
      : '<p class="m">No activity yet</p>'
  }</div></div>`;
}

function cu() {
  document.querySelectorAll<HTMLElement>('[data-c]').forEach((el) => {
    const t = +(el.dataset.c || 0);
    const p = el.dataset.p || '';
    const t0 = performance.now();
    const f = (n: number) => {
      const k = Math.min(1, (n - t0) / 800);
      el.textContent = p + Math.round(t * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US');
      if (k < 1) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
}

const CN = () => S.cfg.name || 'Primble BD LTD';
const logoImg = (s: number) =>
  S.cfg.logo
    ? `<img src="${S.cfg.logo}" alt="${esc(CN())}" style="height:${s}px;width:${s}px;flex:none;object-fit:contain;border-radius:8px;background:#fff;padding:2px;box-sizing:border-box;display:block">`
    : `<div style="height:${s}px;width:${s}px;flex:none;border-radius:8px;background:var(--r);color:#fff;display:grid;place-items:center;font-weight:700">${esc(
        CN()[0]
      )}</div>`;

function goHome() {
  mode = 'home';
  msg = '';
  render();
}

const brand = () =>
  `<div class="bd" style="cursor:pointer" onclick="goHome()">${logoImg(56)}<div><h1>${esc(
    CN()
  )}</h1><p class="m" style="margin:0">Digital banking & corporate wallet</p></div></div>`;

const hero = () =>
  `<div class="hero"><div class="orb o1"></div><div class="orb o2"></div>${logoImg(72)}<h2>${esc(
    CN()
  )}</h2><p>Your company's own digital wallet — secure, fast, transparent.</p><div class="ch"><span>${ic('bolt', 16)}Instant transfer</span><span>${ic(
    'brief',
    16
  )}Salary & Profit</span><span>${ic('lock', 16)}PIN protection</span></div></div>`;

const slot = (k: string, t: string) =>
  `<div class="sl"><div class="pc"><svg viewBox="0 0 64 44" width="64" height="44"><rect x="1" y="1" width="62" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="18" r="6" fill="currentColor"/><path d="M8 36c2-7 18-7 20 0" fill="currentColor"/><path d="M36 14h20M36 22h20M36 30h14" stroke="currentColor" stroke-width="2"/></svg><b>${t}</b></div><img id="pv${k}" style="display:none"><div class="bs"><label>${ic(
    'cam',
    16
  )} Camera<input type="file" accept="image/*" capture="environment" onchange="pic(this,'${k}')" hidden></label><label>${ic(
    'img',
    16
  )} Gallery<input type="file" accept="image/*" onchange="pic(this,'${k}')" hidden></label></div></div>`;

const dz = (t: string) =>
  t === 'NID'
    ? `<div class="dzg">${slot('nidf', 'NID card — front side')}${slot('nidb', 'NID card — back side')}</div>`
    : `<div class="dzg">${slot('bc', 'Birth certificate')}</div>`;

const lockView = (u: WalletUser) =>
  `<div class="auw">${hero()}<div class="au lk">${brand()}${msgBox()}<div class="card"><div style="display:flex;justify-content:center">${
    u.photo ? `<img src="${u.photo}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid var(--r)">` : ''
  }</div><h3>Welcome, ${esc(u.name)}</h3><div class="m">${isAdminOrStaff() ? (isSuperAdminUser() ? 'Super Admin' : 'Staff Console') : 'Wallet Lock'} · Enter your 4-digit security PIN</div><div class="dots" id="dots"><i></i><i></i><i></i><i></i></div><div class="kp">${[
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    '',
    0,
    'del',
  ]
    .map((k) => (k === '' ? '<span></span>' : `<button onclick="pk('${k}')">${k === 'del' ? ic('back', 22) : k}</button>`))
    .join('')}</div><p><button class="d" onclick="swAcc()">Log in to another account</button></p></div></div></div>`;

async function pk(k: string) {
  const dt = document.getElementById('dots');
  if (!dt) return;
  if (k === 'del') pinIn = pinIn.slice(0, -1);
  else if (pinIn.length < 4) pinIn += k;
  dt.querySelectorAll('i').forEach((i, n) => (i.className = n < pinIn.length ? 'f' : ''));
  if (pinIn.length < 4) return;
  const u = ownAccount;
  if (u && (await sha('p' + pinIn)) === u.sp) {
    pinUnlocked = true;
    pinIn = '';
    tries = 0;
    mode = 'app';
    tab = isAdminOrStaff() ? firstAllowedAdminTab() : 'home';
    render();
  } else {
    pinIn = '';
    if (++tries >= 5) return swAcc();
    dt.classList.remove('sk');
    void dt.offsetWidth;
    dt.classList.add('sk');
    setTimeout(() => dt.querySelectorAll('i').forEach((i) => (i.className = '')), 350);
  }
}

async function swAcc() {
  pinUnlocked = false;
  pinIn = '';
  tries = 0;
  pendingManualReg = null;
  stopWalletListeners();
  await signOut(auth);
  mode = 'login';
  render();
}

function out() {
  const u = U();
  msg = '';
  pinIn = '';
  if (u && u.sp) {
    pinUnlocked = false;
    mode = 'app';
    render();
  } else {
    void swAcc();
  }
}

async function setPin(e: Event) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;
  const u = U();
  if (!u || !fbUser) return;
  if (!/^\d{4}$/.test(f.n)) return flash('Enter a 4-digit PIN');
  if (u.sp && (!f.o || (await sha('p' + f.o)) !== u.sp)) return flash('Current PIN is wrong');
  try {
    await updateSecurityPinFirestore(fbUser.uid, await sha('p' + f.n));
    flash('Security PIN saved (required every time you open the app)');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to save PIN');
  }
}

async function chPw(e: Event) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;
  if ((f.n || '').length < 6) return flash('New password must be at least 6 characters');
  try {
    await changeOrLinkPassword(f.o || null, f.n);
    flash('Login password saved! You can now log in with Email & Password.');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to update password');
  }
}

async function chAdminEmail(e: Event) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;
  try {
    await requestAdminEmailChange(f.newEmail || '', f.pw || undefined);
    flash(
      `Verification link sent to ${f.newEmail}. Click that link in your new inbox to complete the switch — then log in with your new email & password!`
    );
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to request email change');
  }
}

async function addStaff(e: Event) {
  e.preventDefault();
  if (busy) return;
  const form = e.target as HTMLFormElement;
  const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
  const perms = [...form.querySelectorAll<HTMLInputElement>('input[name="perm"]:checked')].map((x) => x.value);
  if (!/^\d{4}$/.test(f.sp || '')) return flash('Enter a 4-digit Security PIN for this staff member');
  if ((f.pw || '').length < 6) return flash('Staff password must be at least 6 characters');

  busy = true;
  render();
  try {
    const spHash = await sha('p' + f.sp);
    await adminCreateStaffFirestore({
      name: f.name || '',
      email: f.email || '',
      password: f.pw || '',
      ph: f.ph || '',
      spHash,
      perms,
      timeStr: now(),
    });
    flash(`Staff account created for ${f.email}! A verification email was sent — tell staff to verify their email & log in.`);
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to add staff');
  } finally {
    busy = false;
    render();
  }
}

async function saveStaffPerms(staffUid: string) {
  const box = document.getElementById('stf_' + staffUid);
  if (!box) return;
  const perms = [...box.querySelectorAll<HTMLInputElement>('input[data-perm]:checked')].map((x) => x.dataset.perm || '').filter(Boolean);
  const rec = allAdmins.find((a) => a.uid === staffUid);
  if (!rec) return;
  try {
    await adminUpdateStaffAccessFirestore(staffUid, { perms, active: rec.active !== false, name: rec.name });
    flash(`Access updated for ${rec.name || rec.email}`);
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to update staff access');
  }
}

async function toggleStaffActive(staffUid: string) {
  const rec = allAdmins.find((a) => a.uid === staffUid);
  if (!rec) return;
  try {
    await adminUpdateStaffAccessFirestore(staffUid, {
      perms: rec.perms || [],
      active: rec.active === false,
      name: rec.name,
    });
    flash(rec.active === false ? 'Staff access enabled' : 'Staff access disabled');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to toggle staff status');
  }
}

async function delStaff(staffUid: string) {
  try {
    await adminDeleteStaffFirestore(staffUid);
    flash('Staff removed from Admin Console');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to remove staff');
  }
}

function setLogo(inp: HTMLInputElement) {
  gal(
    inp,
    (d) => {
      D().cfg.logo = d;
      render();
    },
    320,
    260000
  );
}

async function bkOn() {
  try {
    if (!window.showSaveFilePicker) throw new Error('unsupported');
    fh = await window.showSaveFilePicker({ suggestedName: 'pbdbank.file' });
    await bkW();
    flash('Auto-save enabled (pbdbank.file)');
  } catch {
    flash('This browser or preview does not support this feature — use the Download button');
  }
}

function bkDl() {
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/octet-stream' }));
  a.href = url;
  a.download = 'pbdbank.file';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bkRs(inp: HTMLInputElement) {
  const f = inp.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(String(r.result || '{}')) as Partial<AppState>;
      S = {
        users: parsed.users || S.users,
        tx: parsed.tx || S.tx,
        msgs: parsed.msgs || S.msgs,
        banners: parsed.banners || S.banners,
        reqs: parsed.reqs || S.reqs,
        partners: parsed.partners || defp(),
        cfg: parsed.cfg || S.cfg,
      };
      flash('Backup loaded');
    } catch {
      flash('Invalid file');
    }
  };
  r.readAsText(f);
}

const bkCard = () =>
  `<div class="card"><h3>Device backup (pbdbank.file)</h3><p class="m">Download <b>pbdbank.file</b> to your device or enable auto-save so every change is backed up.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="p" onclick="bkOn()">${ic(
    'save',
    16
  )} Enable auto-save</button> <button type="button" class="o" onclick="bkDl()">${ic(
    'dl',
    16
  )} pbdbank.file Download</button></div><p style="margin-bottom:0"><label>Restore from backup</label><input type="file" onchange="bkRs(this)"></p></div>`;

function stmt() {
  const J = window.jspdf && window.jspdf.jsPDF;
  if (!J) return flash('PDF library failed to load');
  const A = (s: unknown) => String(s).replace(/[^\x20-\x7E]/g, '');
  const u = U();
  if (!u) return;
  const d = new J();
  d.setFillColor(9, 9, 11);
  d.rect(0, 0, 210, 28, 'F');
  d.setTextColor(255);
  d.setFontSize(16);
  d.text(A(CN()) + ' - Account Statement', 12, 17);
  d.setTextColor(0);
  d.setFontSize(10);
  let y = 38;
  d.text('Account: ' + (u.acc || '') + '   ' + A(u.name), 12, y);
  y += 6;
  d.text('Balance: BDT ' + u.bal.toFixed(2) + '   Generated: ' + now(), 12, y);
  y += 10;
  d.setFont(undefined, 'bold');
  d.text('Date', 12, y);
  d.text('Reference', 45, y);
  d.text('Details', 90, y);
  d.text('Amount (BDT)', 165, y);
  d.setFont(undefined, 'normal');
  y += 6;
  S.tx
    .filter((t) => t.uid === u.id || t.uid === u.uid)
    .forEach((t) => {
      if (y > 280) {
        d.addPage();
        y = 20;
      }
      d.text(String(t.time).slice(0, 10), 12, y);
      d.text(t.id, 45, y);
      d.text(A(t.note).slice(0, 40), 90, y);
      d.text((t.amt > 0 ? '+' : '') + t.amt.toFixed(2), 165, y);
      y += 6;
    });
  d.save('Primble-Statement.pdf');
}

const gal = (inp: HTMLInputElement, cb: (dataUrl: string) => void, maxW = 720, maxBytes = 240000) =>
  [...(inp.files || [])].forEach((f) => {
    const r = new FileReader();
    r.onload = () => {
      const i = new Image();
      i.onload = () => {
        const c = document.createElement('canvas');
        const renderAt = (scale: number, q: number): string => {
          const w = Math.max(48, Math.round(i.width * scale));
          const h = Math.max(48, Math.round(i.height * scale));
          c.width = w;
          c.height = h;
          const x = c.getContext('2d');
          if (x) {
            x.fillStyle = '#fff';
            x.fillRect(0, 0, w, h);
            x.drawImage(i, 0, 0, w, h);
          }
          return c.toDataURL('image/jpeg', q);
        };
        const baseScale = Math.min(1, maxW / Math.max(1, i.width));
        let outUrl = renderAt(baseScale, 0.72);
        for (const [sMul, q] of [
          [1, 0.58],
          [1, 0.45],
          [0.75, 0.5],
          [0.55, 0.45],
        ] as const) {
          if (outUrl.length <= maxBytes) break;
          outUrl = renderAt(baseScale * sMul, q);
        }
        cb(outUrl);
      };
      i.src = String(r.result || '');
    };
    r.readAsDataURL(f);
  });

function addBan(inp: HTMLInputElement) {
  gal(
    inp,
    (d) => {
      D().ban.push({ id: uid(), src: d });
      render();
    },
    720,
    380000
  );
}

function delBan(id: string) {
  D().ban = D().ban.filter((b) => b.id !== id);
  render();
}

function setPhoto(inp: HTMLInputElement) {
  gal(
    inp,
    (d) => {
      dph = d;
      render();
    },
    420,
    220000
  );
}

async function kyc(id: string, ok: number) {
  const u = S.users.find((x) => x.id === id || x.uid === id);
  if (!u) return;
  try {
    await adminKycDecisionFirestore(u, Boolean(ok), now());
    flash(ok ? 'User KYC approved & 13-digit account activated' : 'User KYC rejected');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'KYC update failed');
  }
}

async function frz(id: string) {
  const u = S.users.find((x) => x.id === id || x.uid === id);
  if (!u) return;
  try {
    await adminToggleFreezeFirestore(u);
    flash(u.frozen ? 'Account unfrozen' : 'Account frozen');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Freeze update failed');
  }
}

async function chk() {
  const acnEl = document.getElementById('acn') as HTMLInputElement | null;
  const a = acnEl?.value.trim() || '';
  if (!a) return;
  try {
    const w = await lookupRecipientByAcc(a);
    look = w ? { ok: 1, u: w } : { ok: 0, a };
    render();
    const nextAcn = document.getElementById('acn') as HTMLInputElement | null;
    if (nextAcn) nextAcn.value = a;
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Account lookup failed');
  }
}

async function send(e: Event) {
  e.preventDefault();
  const a = +String(new FormData(e.target as HTMLFormElement).get('amt') || 0);
  const s = U();
  if (!s || !fbUser || !look || !look.ok) return;
  const r = look.u;
  if (!(a > 0) || a > s.bal || r.uid === fbUser.uid) {
    return flash(r.uid === fbUser.uid ? 'You cannot send money to your own account' : 'Insufficient balance');
  }
  try {
    await transferMoneyAtomic({
      senderUid: fbUser.uid,
      recipientUid: r.uid,
      amount: a,
      timeStr: now(),
    });
    look = null;
    tab = 'home';
    flash('Transfer successful');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Transfer failed');
  }
}

async function req(e: Event, type: 'ADD' | 'MFS' | 'BANK') {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;
  const u = U();
  if (!u || !fbUser) return;
  if (!f.ext?.trim()) return flash('Enter your account or mobile number');
  if (!(+f.amt > 0)) return flash('Enter a valid amount');
  if (type !== 'ADD' && +f.amt > u.bal) return flash('Insufficient balance');
  try {
    await submitWalletRequestFirestore({
      uid: fbUser.uid,
      type,
      op: f.op || 'Wallet',
      ext: f.ext || '',
      name: f.name || '',
      trx: f.trx || '',
      amt: +f.amt,
      timeStr: now(),
    });
    tab = 'home';
    flash('Request submitted, awaiting admin approval');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Request submission failed');
  }
}

async function act(id: string, ok: number) {
  const r = S.reqs.find((x) => x.id === id);
  if (!r) return;
  try {
    await adminProcessRequestFirestore(r, Boolean(ok), now());
    flash(ok ? 'Request approved' : 'Request rejected');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Action failed');
  }
}

async function pay(e: Event) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;
  const a = +f.amt;
  if (!(a > 0)) return;
  const t =
    f.to === 'ALL'
      ? S.users.filter((u) => u.role === 'STAFF' && u.kyc === 'APPROVED')
      : S.users.filter((u) => u.id === f.to || u.uid === f.to);
  try {
    await adminPaySalaryOrProfitFirestore(t, f.kind || 'Salary', a, now());
    flash(t.length + ' people credited');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Credit failed');
  }
}

async function sms(e: Event) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target as HTMLFormElement)) as Record<string, string>;
  const list =
    f.to === 'ALL'
      ? S.users.filter((u) => !u.admin && u.kyc === 'APPROVED')
      : S.users.filter((u) => u.id === f.to || u.uid === f.to);
  try {
    await adminSendSmsFirestore(list, f.t || '', f.b || '', now());
    flash('Message sent');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'SMS send failed');
  }
}

async function saveBannersAction() {
  const draft = D();
  const nextCfg: AppCfg = {
    ...S.cfg,
    ytUrl: (draft.cfg.ytUrl || '').trim(),
    ytTitle: (draft.cfg.ytTitle || '').trim() || 'Featured Video',
    ytOn: draft.cfg.ytOn === 0 ? 0 : 1,
  };
  try {
    await adminSaveBannersAndYtFirestore(draft.ban.slice(), S.banners, nextCfg);
    S.banners = draft.ban.slice();
    S.cfg = nextCfg;
    savePublicCache();
    applyBrandHead();
    dr = null;
    flash('Banners & Video Banner saved');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to save banners');
  }
}

async function saveSettingsAction() {
  const draft = D();
  const nextCfg: AppCfg = {
    ...S.cfg,
    ...draft.cfg,
    name: (draft.cfg.name || '').trim() || 'Primble BD LTD',
  };
  try {
    await adminSaveSettingsFirestore(nextCfg);
    S.cfg = nextCfg;
    savePublicCache();
    applyBrandHead();
    dr = null;
    flash('Settings saved');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to save settings');
  }
}

async function savePartnersAction() {
  const draft = D();
  const nextParts = draft.parts.map((x) => ({ ...x }));
  try {
    await adminSavePartnersFirestore(nextParts, S.partners);
    S.partners = nextParts;
    savePublicCache();
    dr = null;
    flash('Partners saved');
  } catch (err) {
    flash(err instanceof Error ? err.message : 'Failed to save partners');
  }
}

function tilt(e: MouseEvent, el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.transform = `perspective(800px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg)`;
}

const gm = (m: number) => {
  mode = m ? 'register' : 'login';
  msg = '';
  render();
};

const sc = () => document.getElementById('feat')?.scrollIntoView({ behavior: 'smooth' });

const STEPS: [string, string][] = [
  ['user', 'Register'],
  ['cam', 'Selfie and NID'],
  ['check', 'Admin approval'],
  ['hash', '13-digit account'],
  ['send', 'Start transacting'],
];

const landing = () => `<div class='lp'><div class='ln'><div class='ln-in'><div class='lb' onclick="window.scrollTo({top:0,behavior:'smooth'})">${logoImg(34)}<b>${esc(CN())}</b></div><div class='lr'><button class='gh' onclick=sc()>Features</button><button class='o' onclick=gm(0)>Log in</button><button class='p' onclick=gm(1)>Get started</button></div></div></div>
<section class='lh'><div class='lt'><span class='tag'>Live · Your company's own digital wallet</span><h1>Instant payments,<br><span class='ul'>in your own wallet<svg class='sq' viewBox='0 0 240 16' preserveAspectRatio='none'><path d='M3 11C40 3 80 15 120 8S195 5 237 10' fill='none' stroke='#E11D48' stroke-width='3' stroke-linecap='round'/></svg></span></h1><p>13-digit account numbers, instant Send Money, salary and profit share — all in one place, completely secure.</p><button class='cta' onclick=gm(1)>Get started <i>${ic('arrow', 20)}</i></button><div class='tk' id='tk'>Live demo: ৳2,500 Sent</div></div>
<div class='lv'><svg class='cn' viewBox='0 0 400 440' preserveAspectRatio='none'><path d='M80 190Q120 220 150 240'/><path d='M270 215Q310 150 295 95'/><path d='M300 330Q335 365 305 392'/></svg>
<div class='fc c1'><div class='av2'></div><div style='margin-top:8px;font-weight:600'>Rahim</div><small>Account holder</small></div>
<div class='fc c2'><small>Send Money</small><div class='amt n' id='amt'>৳ 0</div><div class='m n'>8802611482915</div><div class='cf'>CONFIRM</div></div>
<div class='fc c3'><small>${ic('mail', 14)} SMS Inbox</small><p style='margin:6px 0 0;font-size:13px'>Your wallet ৳7,500 credited.</p></div>
<div class='fc c4'><svg class='ck' viewBox='0 0 60 60' width='60'><circle cx='30' cy='30' r='26' fill='none' stroke='#E11D48' stroke-width='4'/><path d='M18 31l9 9 16-18' fill='none' stroke='#E11D48' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/></svg><div style='font-weight:600'>Successful transaction</div><small>The money has arrived!</small></div></div></section>
<section class='ls rv2' id='feat'><h2>One wallet, <span>every feature</span></h2><div class='gr'><div class='gl'>${[
  ic('user', 18) + ' Staff',
  ic('user', 18) + ' Customer',
  ic('star', 18) + ' VIP',
  ic('brief', 18) + ' Salary',
  ic('trend', 18) + ' Profit',
  ic('bank', 18) + ' Bank/MFS',
]
  .map((t) => `<div class='tl'>${t}</div>`)
  .join('')}</div><div class='cx'></div><div class='hub'>${logoImg(64)}<i></i><i></i></div><div class='cx'></div><div class='gc'><div class='ok'>${ic(
  'check',
  28
)}</div><b>Successful transaction</b><div class='m'>Money is in your wallet!</div></div></div></section>
<section class='lz rv2'><div><h2>Your balance,<br><span>in one tap</span></h2><p style='opacity:.75;max-width:380px'>Live balance, full transaction history and PDF statements — all within reach.</p><button class='cta' onclick=gm(1)>Get started <i>${ic(
  'arrow',
  20
)}</i></button></div><div class='tc'><div class='t1'><div class='half'></div><b>Balance</b><small>See your balance in real time</small></div><div class='t2'><b>Transactions</b><small>Every transaction in one place</small></div></div></section>
<section class='ls rv2'><h2>Getting started is <span>easy</span></h2><div class='fw'>${STEPS.map(
  (s, i) => `${i ? "<span class='ar'>" + ic('arrow', 20) + '</span>' : ''}<div class='st'><i>${ic(s[0], 28)}</i>${s[1]}</div>`
).join('')}</div></section>
<section class='ls rv2'><h2>Works with <span>your banks & wallets</span></h2><div class='mq'><div class='mt'>${[...S.partners, ...S.partners]
  .map((p) => `<div>${plogo(p, 30)}<b style='font-weight:500'>${esc(p.name)}</b></div>`)
  .join('')}</div></div></section>
<section class='cb rv2'><h2>Get <span style='color:#fb7185'>started</span> today</h2><p>Register, and your wallet goes live as soon as the admin approves.</p><button class='cta' onclick=gm(1)>Register <i>${ic(
  'arrow',
  20
)}</i></button></section>
<div class='lf'>© ${new Date().getFullYear()} ${esc(CN())}</div></div>`;

let lt: ReturnType<typeof setInterval> | null = null;

function initLand() {
  if (lt) clearInterval(lt);
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.rv2').forEach((x) => io.observe(x));
  const M = ['৳2,500 Sent', 'Salary ৳35,000 credited', 'New account approved', 'Add Money ৳5,000 added'];
  let i = 1;
  let v = 0;
  lt = setInterval(() => {
    const a = document.getElementById('amt');
    const t = document.getElementById('tk');
    if (!a || !t) {
      if (lt) clearInterval(lt);
      return;
    }
    v = (v + 250) % 8000;
    a.textContent = '৳ ' + v.toLocaleString('en-US');
    if (v % 4000 === 0) {
      t.classList.remove('sw');
      void t.offsetWidth;
      t.textContent = 'Live demo: ' + M[i++ % M.length];
      t.classList.add('sw');
    }
    const s = document.querySelectorAll('.st');
    if (s.length) {
      const k = Math.floor(Date.now() / 1500) % s.length;
      s.forEach((x, n) => x.classList.toggle('on', n === k));
    }
  }, 120);
}

function tapBal() {
  showBal = true;
  render();
  if (bt) clearTimeout(bt);
  bt = setTimeout(() => {
    showBal = false;
    render();
  }, 5000);
}

const msgBox = () => (msg ? `<div class="msg">${esc(msg)}</div>` : '');
const uopt = (all?: number) =>
  (all ? '<option value="ALL">Everyone</option>' : '') +
  S.users
    .filter((u) => !u.admin && u.kyc === 'APPROVED')
    .map((u) => `<option value="${u.id}">${esc(u.name)} (${esc(u.ph)})</option>`)
    .join('');

function verifyEmailView() {
  return `<div class="auw">${hero()}<div class="au">${brand()}${msgBox()}<div class="card"><h3>Verify Your Email</h3><p class="m">A verification link has been sent to <b>${esc(
    fbUser?.email || ''
  )}</b>. Open your email inbox, click the verification link, and then tap <b>I Verified — Continue</b>.</p><div style="display:flex;flex-direction:column;gap:8px"><button class="p" onclick="checkVerify()" ${
    busy ? 'disabled' : ''
  }>${ic('check', 16)} ${busy ? 'Checking...' : 'I Verified — Continue'}</button><button class="o" onclick="resendVerify()" ${
    busy ? 'disabled' : ''
  }>${ic('mail', 16)} Resend Verification Email</button><button class="d" onclick="swAcc()">Switch account / Back to login</button></div></div></div></div>`;
}

function authView() {
  // Signed in (e.g. Google or verified Email) & needs to complete 3-step KYC registration
  const needsKycForm = Boolean(fbUser && fbUser.emailVerified && accountLoaded && !ownAccount && !isAdminOrStaff());
  const showRegister = mode === 'register' || needsKycForm;

  if (showRegister) {
    return `<div class="auw">${hero()}<div class="au">${brand()}${msgBox()}<div class="card">${
      !fbUser
        ? `<button type="button" class="o" style="width:100%;margin-bottom:12px" onclick="googleAuth('register')" ${busy ? 'disabled' : ''}>${ic(
            'shield',
            18
          )} ${busy ? 'Connecting...' : 'Continue with Google'}</button><div class="m" style="text-align:center;margin-bottom:10px">— or register with Email & Password —</div>`
        : ''
    }<form onsubmit="reg(event)"><div class="wz"><i class="on"></i><i></i><i></i></div><div class="msg" id="rm" style="display:none"></div><div class="stp" data-s="1"><label>Account type</label><select name="role"><option value="STAFF">Company Staff / Employee</option><option value="GENERAL_CUSTOMER">General Customer</option><option value="VIP_CUSTOMER">VIP Customer</option></select><label>Full name</label><input name="name" value="${esc(
      fbUser?.displayName || ''
    )}" required><label>Mobile number</label><input name="ph" type="tel" required><label>Email</label>${
      fbUser
        ? `<input name="email" type="email" value="${esc(fbUser.email || '')}" disabled>`
        : `<input name="email" type="email" placeholder="you@example.com" required>`
    }<label>Staff ID card number (staff) / NID or birth registration number (customer)</label><input name="doc" required>${
      fbUser ? '' : `<label>Password (6+ characters)</label><input name="pw" type="password" minlength="6" required>`
    }<label>4-digit security PIN (needed to open the app)</label><input name="sp" class="n" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required><div class="nv">${
      fbUser ? `<button type="button" class="d" onclick="swAcc()">Switch account</button>` : '<span></span>'
    }<button type="button" class="p" onclick="wn(1)">Next ${ic(
      'arrow',
      16
    )}</button></div></div><div class="stp" data-s="2" style="display:none"><label>ID type</label><select name="dt" onchange="document.getElementById('dz').innerHTML=dz(this.value)"><option value="NID">NID Card</option><option value="BC">Birth certificate</option></select><div id="dz">${dz(
      'NID'
    )}</div><div class="nv"><button type="button" class="o" onclick="wb(2)">${ic('back', 16)} Back</button><button type="button" class="p" onclick="wn(2)">Next ${ic(
      'arrow',
      16
    )}</button></div></div><div class="stp" data-s="3" style="display:none"><label>Live selfie (face verification)</label><div id="lv" class="m"></div><video id="cam" autoplay playsinline muted style="display:none;width:100%;border-radius:12px;transform:scaleX(-1)"></video><button type="button" class="o" onclick="camOn()">${ic(
      'cam',
      16
    )} Start camera</button> <button type="button" class="p" id="shot" style="display:none" onclick="snap()">Take photo</button><input id="fb" type="file" accept="image/*" capture="user" onchange="pic(this,'selfie')" style="display:none"><img id="pvselfie" style="display:none;width:140px;height:140px;object-fit:cover;border-radius:50%;margin:10px 0"><br><div class="nv"><button type="button" class="o" onclick="wb(3)">${ic(
      'back',
      16
    )} Back</button><button class="p" ${busy ? 'disabled' : ''}>${ic('save', 16)} ${busy ? 'Submitting...' : 'Submit Application'}</button></div></div></form>${
      fbUser
        ? ''
        : `<p class="m" style="margin-top:14px">Already have an account? <button class="d" onclick="mode='login';msg='';render()">Log in</button></p>`
    }</div></div></div>`;
  }

  return `<div class="auw">${hero()}<div class="au">${brand()}${msgBox()}<div class="card"><h3>Sign in to your wallet</h3><form onsubmit="pwLogin(event)"><label>Email</label><input name="email" type="email" placeholder="you@example.com" required><label>Password</label><input name="pw" type="password" required><button class="p" style="width:100%" ${
    busy ? 'disabled' : ''
  }>${busy ? 'Signing in...' : 'Log in'}</button></form><div style="display:flex;justify-content:flex-end;margin-top:6px"><button type="button" class="d" style="font-size:13px" onclick="forgotPw()">Forgot password?</button></div><div class="m" style="text-align:center;margin:12px 0">— or —</div><button type="button" class="o" style="width:100%" onclick="googleAuth('login')" ${
    busy ? 'disabled' : ''
  }>${ic('shield', 18)} Continue with Google</button><p class="m" style="margin-top:14px">New here? <button class="d" onclick="mode='register';msg='';render()">Register</button></p></div></div></div>`;
}

const hdr = (u: WalletUser) =>
  `<header><div class="hd-in">${logoImg(32)}<div class="av">${
    u.photo ? `<img src="${u.photo}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : esc((u.name || 'U')[0])
  }</div><div class="hu"><b>${esc(u.name)}</b><small>${
    ({ STAFF: 'Staff / Employee', GENERAL_CUSTOMER: 'General Customer', VIP_CUSTOMER: 'VIP Customer' } as Record<string, string>)[u.role || ''] || 'Admin'
  }</small></div><div class="sp"></div>${
    u.admin ? '' : `<button class="pill n" onclick="tapBal()">${showBal ? fm(u.bal) : 'Show balance'}</button>`
  }<button class="pill" onclick="out()">Log out</button></div></header>`;

function securityCardsView(u: WalletUser, showAdminEmailChange: boolean) {
  const hasPw = Boolean(fbUser?.providerData.some((p) => p.providerId === 'password'));
  return `<div class="card"><h3>Security PIN (4 digits)</h3><p class="m">${
    u.sp
      ? 'PIN lock is active — your 4-digit PIN is required every time you open the app.'
      : 'Set a 4-digit Security PIN so opening the app always requires your PIN.'
  }</p><form onsubmit="setPin(event)">${
    u.sp ? '<label>Current PIN</label><input name="o" class="n" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required>' : ''
  }<label>New 4-digit PIN</label><input name="n" class="n" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required><button class="p">Save PIN</button></form></div>
  <div class="card"><h3>${hasPw ? 'Change Login Password' : 'Create Email & Password Login'}</h3><p class="m">${
    hasPw
      ? 'Update your email/password sign-in password.'
      : 'Add a password to your account so you can log in manually with Email & Password in addition to Google.'
  }</p><form onsubmit="chPw(event)">${
    hasPw ? '<label>Current password</label><input name="o" type="password" required>' : ''
  }<label>New password (6+ characters)</label><input name="n" type="password" minlength="6" required><button class="p">${
    hasPw ? 'Save password' : 'Set password'
  }</button></form></div>${
    showAdminEmailChange
      ? `<div class="card"><h3>Change Super Admin Login Email</h3><p class="m">Current login email: <b>${esc(
          fbUser?.email || u.email || ''
        )}</b>. After clicking the verification link sent to your new email, you can log in with the new email & password.</p><form onsubmit="chAdminEmail(event)"><label>New Admin Email</label><input name="newEmail" type="email" placeholder="new-admin@example.com" required>${
          hasPw ? '<label>Current password (to confirm)</label><input name="pw" type="password" required>' : ''
        }<button class="p">Update Admin Email</button></form></div>`
      : ''
  }`;
}

const ytBannerView = () => {
  if (S.cfg.ytOn === 0) return '';
  const vid = parseYt(S.cfg.ytUrl);
  const title = (S.cfg.ytTitle || '').trim() || 'Video Banner';
  return `<div class="vban"><div class="vban-hd"><div style="display:flex;align-items:center;gap:8px"><span style="width:28px;height:28px;border-radius:8px;background:#E11D4818;color:var(--r);display:grid;place-items:center">${ic(
    'play',
    15
  )}</span><b>${esc(title)}</b></div><span class="m">YouTube</span></div>${
    vid
      ? `<div class="vban-frame"><iframe src="https://www.youtube-nocookie.com/embed/${esc(
          vid
        )}?rel=0&modestbranding=1&playsinline=1" title="${esc(
          title
        )}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>`
      : `<div class="vban-empty">No video set yet · Admin can add a YouTube link in <b>Banners</b> to play it here.</div>`
  }</div>`;
};

function ytPrev(inp: HTMLInputElement) {
  D().cfg.ytUrl = inp.value;
  const box = document.getElementById('ytpv');
  if (!box) return;
  const vid = parseYt(inp.value);
  box.innerHTML = vid
    ? `<div class="vban-frame" style="margin-top:8px"><iframe src="https://www.youtube-nocookie.com/embed/${esc(
        vid
      )}?rel=0&modestbranding=1&playsinline=1" title="YouTube preview" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`
    : inp.value.trim()
      ? '<p class="m" style="color:var(--r)">Invalid YouTube URL or Video ID</p>'
      : '';
}

function userView(u: WalletUser) {
  const my = S.tx.filter((t) => t.uid === u.id || t.uid === u.uid);
  const ms = S.msgs.filter((m) => m.uid === u.id || m.uid === u.uid);
  const un = ms.some((m) => !m.read);
  let b = '';
  const txl = (l: TxItem[]) =>
    l.length
      ? l
          .map(
            (t) =>
              `<div class="row"><div>${esc(t.note)}<div class="m n">${t.id} · ${t.time}</div></div><b class="n ${t.amt > 0 ? 'cr' : 'db'}">${
                t.amt > 0 ? '+' : ''
              }${fm(t.amt)}</b></div>`
          )
          .join('')
      : '<p class="m">No transactions</p>';

  if (tab === 'home') {
    b = `${S.banners.length ? `<div class="bn" style="margin-bottom:14px">${S.banners.map((x) => `<img src="${x.src}" alt="">`).join('')}</div>` : ''}<div class="uh-grid"><div class="amx" onmousemove="tilt(event,this)" onmouseleave="this.style.transform=''"><div class="sh"></div><div class="top"><b class="lg">${
      S.cfg.logo ? `<img src="${S.cfg.logo}" alt="" style="height:22px;width:22px;object-fit:contain;border-radius:4px;background:#fff;padding:1px;flex:none">` : ''
    }${esc(CN().toUpperCase())}</b><span class="tp">${
      ({ STAFF: 'STAFF', GENERAL_CUSTOMER: 'MEMBER', VIP_CUSTOMER: 'VIP' } as Record<string, string>)[u.role || ''] || 'MEMBER'
    }</span></div><div class="chip"></div><svg class="nfc" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M6 8a6 6 0 010 8M10 6a10 10 0 010 12M14 4a14 14 0 010 16"/></svg><div class="no2 n">${(
      u.acc || ''
    ).replace(/(\d{4})(?=\d)/g, '$1 ')}</div><div class="bt"><div><small>CARD MEMBER</small><b>${esc(
      u.name.toUpperCase()
    )}</b></div><div><small>MEMBER SINCE</small><b class="n">${(u.time || '').slice(6, 10) || '2026'}</b></div><div class="bal"><small>BALANCE</small><b class="n${
      showBal ? ' rv' : ''
    }">${showBal ? fm(u.bal) : '৳ ••••••'}</b></div></div></div><div class="g"><div class="qa"><button onclick="go('add')"><i>${ic(
      'plus',
      22
    )}</i>Add Money</button><button onclick="go('wd')"><i>${ic('bank', 22)}</i>Withdraw</button><button onclick="go('send')"><i>${ic(
      'send',
      22
    )}</i>Send Money</button><button onclick="go('sal')"><i>${ic('brief', 22)}</i>Salary</button></div><div class="card"><b>Recent transactions</b>${txl(
      my.slice(0, 4)
    )}</div></div></div>${ytBannerView()}`;
  }

  if (tab === 'tx') {
    b = `<div class="card"><h3>Transactions</h3><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="p" onclick="stmt()">${ic(
      'dl',
      16
    )} Download statement (PDF)</button><button class="o" onclick="bkDl()">${ic('dl', 16)} pbdbank.file Download</button></div>${txl(my)}</div>`;
  }
  if (tab === 'sal') b = `<div class="card"><h3>Salary & Profit</h3>${txl(my.filter((t) => /Salary|Profit/i.test(t.note)))}</div>`;
  if (tab === 'sms')
    b = `<div class="card"><h3>SMS Inbox</h3>${
      ms.length
        ? ms.map((m) => `<div class="row"><div><b>${esc(m.t)}</b><div>${esc(m.b)}</div><div class="m">Primble BD LTD Admin · ${m.time}</div></div></div>`).join('')
        : '<p class="m">No messages</p>'
    }</div>`;
  if (tab === 'send')
    b = `<div class="card"><h3>Send Money</h3><label>13-digit account number</label><input id="acn" class="n" inputmode="numeric" maxlength="13"><button class="o" onclick="chk()">Next ${ic(
      'arrow',
      16
    )}</button>${
      look
        ? look.ok
          ? `<div class="card" style="margin-top:12px"><div style="display:flex;gap:12px;align-items:center;animation:up .4s">${
              look.u.photo ? `<img src="${look.u.photo}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid var(--r)">` : ''
            }<div><b>${esc(look.u.name)}</b><div class="m n">${look.u.acc || ''}</div></div></div><form onsubmit="send(event)"><label>Amount (৳)</label><input name="amt" type="number" min="1" step="0.01" required><div class="nv"><button type="button" class="o" onclick="look=null;render()">${ic(
              'back',
              16
            )} Back</button><button class="p">Confirm & send</button></div></form></div>`
          : `<div class="msg" style="margin-top:12px">Account does not exist. Transaction aborted.</div>`
        : ''
    }</div>`;
  if (tab === 'add')
    b = `<div class="card"><h3>Add Money</h3><p class="m">First Send Money to the company number (ask the admin for it), then enter the details below.</p><form onsubmit="req(event,'ADD')"><label>Operator</label>${partTiles(
      'MFS'
    )}<label>Your sender number</label><input name="ext" required><label>TrxID</label><input name="trx" required><label>Amount (৳)</label><input name="amt" type="number" required><button class="p">Submit</button></form></div>`;
  if (tab === 'wd')
    b = `<div class="g g2" style="align-items:start"><div class="card"><h3>Withdraw</h3><form onsubmit="req(event,'MFS')"><b>Mobile banking</b><br>${partTiles(
      'MFS'
    )}<label>Number</label><input name="ext" required><label>Amount (৳)</label><input name="amt" type="number" required><button class="p">Request</button></form></div><div class="card"><form onsubmit="req(event,'BANK')"><b>Bank transfer</b><br>${partTiles(
      'BANK'
    )}<label>Account holder name</label><input name="name" required><label>Bank account number</label><input name="ext" required><label>Amount (৳)</label><input name="amt" type="number" required><button class="p">Request</button></form></div></div>`;
  if (tab === 'me')
    b = `<div class="g g2" style="align-items:start"><div>${profileView(u)}</div><div>${bkCard()}${securityCardsView(u, false)}</div></div>`;

  const T = [
    ['home', 'home', 'Home'],
    ['tx', 'list', 'Transactions'],
    ['sms', 'mail', 'SMS' + (un ? ' •' : '')],
    ['me', 'user', 'Profile'],
  ];
  return (
    hdr(u) +
    `<nav>${T.map((t) => `<button class="${tab === t[0] ? 'a' : ''}" onclick="go('${t[0]}')"><i>${ic(t[1], 22)}</i><span>${t[2]}</span></button>`).join('')}</nav><div class="w">${msgBox()}${
      ['send', 'add', 'wd', 'sal'].includes(tab) ? `<button class="o" onclick="go('home')" style="margin-bottom:12px">${ic('back', 16)} Back</button>` : ''
    }${b}</div>`
  );
}

function staffManagerView() {
  const staffList = allAdmins.filter((a) => !a.isSuperAdmin && a.uid !== fbUser?.uid);
  const permBox = (nameAttr: string, selected: string[], dataAttr = false) =>
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:8px;margin:8px 0 14px">${STAFF_PERM_DEFS.map(
      (p) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--b);border-radius:10px;background:var(--bg);cursor:pointer;color:var(--t)"><input type="${'checkbox'}" ${
          dataAttr ? `data-perm="${p.key}"` : `name="${nameAttr}" value="${p.key}"`
        } style="width:auto;margin:0" ${selected.includes(p.key) ? 'checked' : ''}><span>${esc(p.label)}</span></label>`
    ).join('')}</div>`;

  return `<div class="card"><h3>Add Staff Member</h3><p class="m">Create an Email & Password account for your staff and choose exactly which admin panels they can access.</p><form onsubmit="addStaff(event)"><div class="g g2"><div><label>Staff Name</label><input name="name" placeholder="Staff full name" required></div><div><label>Mobile Number</label><input name="ph" type="tel" placeholder="01XXXXXXXXX"></div></div><div class="g g2"><div><label>Staff Login Email</label><input name="email" type="email" placeholder="staff@primblebd.com" required></div><div><label>Login Password (6+ characters)</label><input name="pw" type="password" minlength="6" required></div></div><label>4-digit Security PIN (required on app open)</label><input name="sp" class="n" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" value="1234" required><label>Select Allowed Access Panels</label>${permBox(
    'perm',
    ['dash', 'kyc', 'add', 'wd']
  )}<button class="p" ${busy ? 'disabled' : ''}>${ic('plus', 16)} ${busy ? 'Creating Staff...' : 'Create Staff Account'}</button></form></div>
  <div class="card"><h3>Staff Members & Access Control (${staffList.length})</h3>${
    staffList.length
      ? staffList
          .map(
            (st) =>
              `<div id="stf_${st.uid}" style="padding:12px 0;border-bottom:1px solid var(--b)"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><b>${esc(
                st.name || 'Staff'
              )}</b> <span class="m">· ${esc(st.email)} · ${st.active === false ? '<span class="db">DISABLED</span>' : '<span class="cr">ACTIVE</span>'}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="o" onclick="toggleStaffActive('${
                st.uid
              }')">${st.active === false ? 'Enable' : 'Disable'}</button><button type="button" class="p" onclick="saveStaffPerms('${
                st.uid
              }')">Save Access</button><button type="button" class="d" onclick="delStaff('${st.uid}')">${ic('x', 14)} Remove</button></div></div>${permBox(
                'p',
                st.perms || [],
                true
              )}</div>`
          )
          .join('')
      : '<p class="m">No staff members added yet.</p>'
  }</div>`;
}

function adminView(u: WalletUser) {
  const allTabs: [string, string, string][] = [
    ['dash', 'grid', 'Dashboard'],
    ['kyc', 'shield', 'KYC Approvals'],
    ['add', 'plus', 'Add Money'],
    ['wd', 'bank', 'Withdrawals'],
    ['pay', 'cash', 'Salary & Profit'],
    ['sms', 'chat', 'SMS Composer'],
    ['ban', 'img', 'Banners'],
    ['part', 'bank', 'Partners'],
    ['users', 'users', 'Users'],
    ['staff', 'shield', 'Staff & Access'],
    ['brand', 'gear', 'Settings'],
    ['bk', 'db', 'Backup'],
    ['prof', 'user', 'My Profile'],
    ['me', 'lock', 'Security'],
  ];
  const T = allTabs.filter((t) => canTab(t[0]));
  if (!canTab(tab)) tab = firstAllowedAdminTab();

  let b = '';
  const rq = (types: string[]) => {
    const l = S.reqs.filter((r) => types.includes(r.type));
    return l.length
      ? l
          .map((r) => {
            const x = S.users.find((y) => y.id === r.uid || y.uid === r.uid);
            return `<div class="row"><div><b>${esc(x?.name || 'User')}</b> · <span class="n">${fm(r.amt)}</span><div class="m">${r.type} · ${esc(
              r.op
            )} · ${esc(r.name)} ${esc(r.ext)} ${r.trx ? 'TrxID: ' + esc(r.trx) : ''}</div><div class="m">${r.time} · ${r.st}</div></div>${
              r.st === 'PENDING'
                ? `<div class="row-act"><button class="p" onclick="act('${r.id}',1)">Approve</button><button class="o" onclick="act('${r.id}',0)">Reject</button></div>`
                : ''
            }</div>`;
          })
          .join('')
      : '<p class="m">No requests</p>';
  };

  if (tab === 'kyc') {
    const l = S.users.filter((x) => !x.admin && x.kyc === 'PENDING');
    b = `<div class="card"><h3>Pending KYC</h3><p class="m">Auto-approval is ${S.cfg.auto ? 'ON' : 'OFF'} (change it in Settings).</p>${
      l.length
        ? l
            .map(
              (x) =>
                `<div class="row"><div><b>${esc(x.name)}</b> · ${x.role || ''}<div class="m">${esc(x.ph)} ${esc(x.email || '')} · ID/NID: ${esc(
                  x.doc || ''
                )}</div>${imgs(x)}</div><div class="row-act"><button class="p" onclick="kyc('${x.id}',1)">Approve</button><button class="o" onclick="kyc('${
                  x.id
                }',0)">Reject</button></div></div>`
            )
            .join('')
        : '<p class="m">No pending applications</p>'
    }</div>`;
  }
  if (tab === 'users')
    b = `<div class="card"><h3>All users</h3>${
      S.users
        .filter((x) => !x.admin)
        .map(
          (x) =>
            `<div class="row"><div><b>${esc(x.name)}</b> · ${x.kyc}${x.frozen ? ' · FROZEN' : ''}<div class="m n">${x.acc || '-'} · ${fm(
              x.bal
            )}</div>${imgs(x)}</div>${
              x.kyc === 'APPROVED' ? `<button class="o" onclick="frz('${x.id}')">${x.frozen ? 'Unfreeze' : 'Freeze'}</button>` : ''
            }</div>`
        )
        .join('') || '<p class="m">No one yet</p>'
    }</div>`;
  if (tab === 'add') b = `<div class="card"><h3>Add Money Queue</h3>${rq(['ADD'])}</div>`;
  if (tab === 'wd') b = `<div class="card"><h3>Withdrawal Requests</h3>${rq(['BANK', 'MFS'])}</div>`;
  if (tab === 'pay')
    b = `<div class="card"><h3>Salary / Profit Share</h3><form onsubmit="pay(event)"><label>To</label><select name="to"><option value="ALL">All staff</option>${uopt()}</select><label>Type</label><select name="kind"><option>Salary</option><option>Profit Share</option></select><label>Amount (৳)</label><input name="amt" type="number" required><button class="p">Submit</button></form></div>`;
  if (tab === 'sms')
    b = `<div class="card"><h3>SMS Composer</h3><form onsubmit="sms(event)"><label>Recipient</label><select name="to">${uopt(
      1
    )}</select><label>Title</label><input name="t" required><label>Message (editable)</label><textarea name="b" rows="4" required>Your account transaction was completed.</textarea><button class="p">Send</button></form></div>`;
  if (tab === 'ban') {
    const draft = D();
    const vid = parseYt(draft.cfg.ytUrl);
    b = `<div class="card"><h3>Banners (Mobile App Rounded · Unlimited)</h3><p class="m">Changes are saved to Firestore for all devices when you press Save.</p><input type="file" accept="image/*" multiple onchange="addBan(this)"><div class="g g2">${draft.ban
      .map(
        (x) =>
          `<div class="bx"><img src="${x.src}" style="width:100%;aspect-ratio:16/6.5;object-fit:cover;border-radius:20px;border:1px solid var(--b)"><button class="x" onclick="delBan('${x.id}')">${ic(
            'x',
            14
          )}</button></div>`
      )
      .join('')}</div><hr style="border:0;border-top:1px solid var(--b);margin:18px 0"><h3>YouTube Video Banner (User Home Bottom)</h3><p class="m">Paste any YouTube video link (watch, youtu.be, shorts) to display a playable video banner at the bottom of User Home.</p><label>Video Banner Title</label><input value="${esc(
      draft.cfg.ytTitle ?? 'Featured Video'
    )}" placeholder="Featured Video" oninput="D().cfg.ytTitle=this.value"><label>YouTube URL or Video ID</label><input value="${esc(
      draft.cfg.ytUrl || ''
    )}" placeholder="https://www.youtube.com/watch?v=..." oninput="ytPrev(this)"><label style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><input type="checkbox" style="width:auto;margin:0" ${
      draft.cfg.ytOn !== 0 ? 'checked' : ''
    } onchange="D().cfg.ytOn=this.checked?1:0"> Show video banner on user Home</label><div id="ytpv">${
      vid
        ? `<div class="vban-frame" style="margin-top:8px"><iframe src="https://www.youtube-nocookie.com/embed/${esc(
            vid
          )}?rel=0&modestbranding=1&playsinline=1" title="YouTube preview" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`
        : ''
    }</div><div class="nv"><button class="o" onclick="go('${firstAllowedAdminTab()}')">${ic('back', 16)} Back</button><button class="p" onclick="saveBannersAction()">${ic(
      'save',
      16
    )} Save</button></div></div>`;
  }
  if (tab === 'brand')
    b = `<div class="card"><h3>Settings</h3><p class="m">Changes are saved to Firestore for all devices when you press Save.</p><label>Logo (from device)</label>${
      D().cfg.logo ? `<img src="${D().cfg.logo}" style="height:80px;border-radius:10px;background:#fff;padding:2px;display:block;margin:6px 0">` : ''
    }<input type="file" accept="image/*" onchange="setLogo(this)"><label>Company name</label><input value="${esc(
      D().cfg.name || 'Primble BD LTD'
    )}" oninput="D().cfg.name=this.value"><label><input type="checkbox" style="width:auto" ${
      D().cfg.auto ? 'checked' : ''
    } onchange="D().cfg.auto=this.checked?1:0"> Auto-approve accounts after KYC submission</label><div class="nv"><button class="o" onclick="go('${firstAllowedAdminTab()}')">${ic(
      'back',
      16
    )} Back</button><button class="p" onclick="saveSettingsAction()">${ic('save', 16)} Save</button></div></div>`;
  if (tab === 'bk') b = bkCard();
  if (tab === 'dash') b = dashView();
  if (tab === 'staff') b = staffManagerView();
  if (tab === 'prof') b = profileView(u);
  if (tab === 'part')
    b = `<div class="card"><h3>Payment partners</h3><p class="m">Upload each partner's official logo (take it from their brand kit). Changes are saved to Firestore when you press Save.</p>${D().parts
      .map(
        (x) =>
          `<div class="row"><div style="display:flex;gap:12px;align-items:center">${plogo(x, 44)}<div><b>${esc(x.name)}</b><div class="m">${
            x.type === 'MFS' ? 'Mobile banking' : 'Bank'
          }</div></div></div><div><label class="up">${ic(
            'img',
            16
          )} Logo<input type="file" accept="image/*" hidden onchange="partLogo(this,'${x.id}')"></label> <button class="d" onclick="partDel('${
            x.id
          }')">${ic('x', 14)}</button></div></div>`
      )
      .join(
        ''
      )}<div class="row"><input id="pn" placeholder="New partner name" style="margin:0"><select id="pt" style="margin:0;width:auto"><option value="BANK">Bank</option><option value="MFS">Mobile banking</option></select><button class="o" onclick="partAdd()">${ic(
      'plus',
      16
    )} Add</button></div><div class="nv"><button class="o" onclick="go('${firstAllowedAdminTab()}')">${ic(
      'back',
      16
    )} Back</button><button class="p" onclick="savePartnersAction()">${ic('save', 16)} Save</button></div></div>`;
  if (tab === 'me') b = securityCardsView(u, isSuperAdminUser());

  const cur = T.find((t) => t[0] === tab) || T[0];
  return `<div class="adm"><aside class="sb"><div class="lg0">${logoImg(38)}<b>${esc(CN())}</b></div>${T.map(
    (t) => `<button class="ni ${tab === t[0] ? 'a' : ''}" onclick="go('${t[0]}')">${ic(t[1], 18)}<span>${t[2]}</span></button>`
  ).join('')}</aside><main class="mn"><div class="mn-in"><div class="tb"><div class="tb-l"><div class="tb-logo">${logoImg(34)}</div><div class="tb-t"><h2>${cur[2]}</h2><div class="m">${
    isSuperAdminUser() ? 'Super Admin console' : 'Staff Admin console'
  }</div></div></div><div class="tr">${
    u.photo ? `<img class="tav" src="${u.photo}" alt="">` : `<span class="tav">${esc((u.name || 'A')[0])}</span>`
  }<button class="o" onclick="out()">${ic('logout', 16)} Log out</button></div></div>${
    !u.sp && tab !== 'me'
      ? `<div class="msg">${ic('alert', 16)} Set your 4-digit Security PIN in <b>Security</b> so your admin panel always locks with PIN on app open. <button class="d" onclick="go('me')">Set PIN now</button></div>`
      : ''
  }${msgBox()}${b}</div></main></div>`;
}

function statusCard(title: string, detail: string) {
  return `<div class="auw">${hero()}<div class="au">${brand()}<div class="card"><h3>${esc(title)}</h3><p class="m">${esc(
    detail
  )}</p><button class="o" onclick="swAcc()">Log in to another account</button></div></div></div>`;
}

function render() {
  const a = document.getElementById('app');
  if (!a) return;

  if (!authReady) {
    a.innerHTML = `<div class="auw">${hero()}<div class="au">${brand()}<div class="card"><p class="m">Loading...</p></div></div></div>`;
    return;
  }

  if (!fbUser) {
    a.innerHTML = mode === 'home' ? landing() : authView();
    if (mode === 'home') initLand();
    return;
  }

  if (mode === 'home' && !pinUnlocked) {
    a.innerHTML = landing();
    initLand();
    return;
  }

  if (!fbUser.emailVerified) {
    a.innerHTML = verifyEmailView();
    return;
  }

  if (!accountLoaded) {
    a.innerHTML = `<div class="auw">${hero()}<div class="au">${brand()}<div class="card"><p class="m">Syncing your wallet...</p></div></div></div>`;
    return;
  }

  if (isAdminOrStaff()) {
    const adminUser: WalletUser = ownAccount || {
      id: fbUser.uid,
      uid: fbUser.uid,
      admin: 1,
      name: adminRec?.name || fbUser.displayName || 'Admin',
      email: fbUser.email || '',
      ph: 'admin',
      kyc: 'APPROVED',
      bal: 0,
    };
    if (adminUser.sp && !pinUnlocked) {
      a.innerHTML = lockView(adminUser);
      return;
    }
    a.innerHTML = adminView(adminUser);
    if (tab === 'dash') cu();
    return;
  }

  if (!ownAccount) {
    a.innerHTML = authView();
    return;
  }

  if (ownAccount.kyc === 'PENDING') {
    a.innerHTML = statusCard('Application Under Review', 'Your application is awaiting admin approval. It will activate automatically once approved.');
    return;
  }

  if (ownAccount.kyc === 'REJECTED') {
    a.innerHTML = statusCard('Application Rejected', 'Your KYC application was rejected by the admin.');
    return;
  }

  if (ownAccount.frozen) {
    a.innerHTML = statusCard('Account Frozen', 'Your account has been frozen by the admin.');
    return;
  }

  if (ownAccount.sp && !pinUnlocked) {
    a.innerHTML = lockView(ownAccount);
    return;
  }

  a.innerHTML = userView(ownAccount);
}

export function mountPrimbleApp() {
  Object.assign(window, {
    wshow,
    wb,
    wn,
    pk2,
    partLogo,
    partDel,
    partAdd,
    saveProf,
    googleAuth,
    pwLogin,
    forgotPw,
    checkVerify,
    resendVerify,
    pic,
    camOn,
    snap,
    reg,
    dz,
    pk,
    swAcc,
    out,
    setPin,
    chPw,
    chAdminEmail,
    addStaff,
    saveStaffPerms,
    toggleStaffActive,
    delStaff,
    setLogo,
    bkOn,
    bkDl,
    bkRs,
    stmt,
    addBan,
    delBan,
    setPhoto,
    kyc,
    frz,
    chk,
    send,
    req,
    act,
    pay,
    sms,
    saveBannersAction,
    saveSettingsAction,
    savePartnersAction,
    tilt,
    gm,
    goHome,
    sc,
    tapBal,
    go,
    flash,
    render,
    ytPrev,
    D,
    sv,
  });

  Object.defineProperties(window, {
    S: { get: () => S, set: (v: AppState) => (S = v), configurable: true },
    dr: { get: () => dr, set: (v: DraftState | null) => (dr = v), configurable: true },
    mode: { get: () => mode, set: (v: string) => (mode = v), configurable: true },
    msg: { get: () => msg, set: (v: string) => (msg = v), configurable: true },
    look: { get: () => look, set: (v: typeof look) => (look = v), configurable: true },
  });

  init();
}
