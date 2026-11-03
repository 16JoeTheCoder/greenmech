import { signal, computed } from '@preact/signals';
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, USE_EMU } from './firebase';
import admins from '../../config/admins.json';
import type { Role } from '../lib/types';

export const user = signal<User | null | undefined>(undefined); // undefined = still loading
export const realRole = signal<Role>('none');
export const initials = signal<string>('');
export const listed = signal(false);
export const preview = signal<'member' | 'coach' | null>(null); // admin UI preview only; never changes permissions
export const authError = signal<string | null>(null);

export const isAdmin = computed(() => realRole.value === 'admin');
/** Role the UI renders for (admin may preview as member or coach). */
export const uiRole = computed<Role>(() => (isAdmin.value && preview.value ? preview.value : realRole.value));
/** Can post (ideas, flags, take modules): members, and admins who also have their own allowlist entry. */
export const canPost = computed(() => uiRole.value === 'member' || (uiRole.value === 'admin' && listed.value));
export const canEdit = computed(() => uiRole.value === 'member' || uiRole.value === 'admin');

const ADMIN_EMAILS: string[] = (admins as { admins: string[] }).admins.map((e) => e.toLowerCase());
const extraAdmins = USE_EMU ? ['admin@test.example'] : [];

async function resolveRole(u: User) {
  const email = (u.email ?? '').toLowerCase();
  const admin = u.emailVerified && (ADMIN_EMAILS.includes(email) || extraAdmins.includes(email));
  type Entry = { role: 'member' | 'coach'; initials: string };
  let entry: Entry | null = null;
  try {
    const snap = await getDoc(doc(db, 'allowlist', email));
    entry = snap.exists() ? (snap.data() as Entry) : null;
  } catch {
    entry = null;
  }
  listed.value = !!entry;
  initials.value = entry?.initials ?? (admin ? 'ADM' : '');
  realRole.value = admin ? 'admin' : entry ? entry.role : 'none';
}

export function startSession() {
  getRedirectResult(auth).catch((e) => (authError.value = signInMessage(e)));
  onAuthStateChanged(auth, async (u) => {
    if (u) await resolveRole(u);
    else {
      realRole.value = 'none';
      listed.value = false;
      initials.value = '';
    }
    user.value = u;
  });
}

function signInMessage(e: { code?: string }): string {
  if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return 'Sign-in was closed before it finished. Try again.';
  if (e.code === 'auth/network-request-failed') return 'No connection to Google. Check the network and try again.';
  if (e.code === 'auth/unauthorized-domain') return 'This address is not authorised for sign-in yet. Ask the admin to add it in Firebase (see SETUP.md).';
  return `Sign-in did not work (${e.code ?? 'unknown error'}). Try again, or ask the admin.`;
}

const touch = () => matchMedia('(pointer: coarse)').matches;
export async function signIn() {
  authError.value = null;
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  if (touch()) return signInWithRedirect(auth, p);
  try {
    await signInWithPopup(auth, p);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/popup-blocked') return signInWithRedirect(auth, p);
    authError.value = signInMessage(e as { code?: string });
  }
}

/** Emulator-only fixture sign-in (E2E and local dev). Never compiled into a production build path that can run. */
export async function signInFixture(email: string) {
  if (!USE_EMU) throw new Error('fixture sign-in is emulator-only');
  const sub = 'u-' + email.split('@')[0];
  await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true })));
}

export const signOut = () => fbSignOut(auth);

// ---------- per-user profile (theme, shortcuts) ----------
export const theme = signal<'system' | 'light' | 'dark'>(readLocal('gm-theme', 'system') as 'system');
export const shortcuts = signal<boolean>(readLocal('gm-shortcuts', '1') === '1');
function readLocal(k: string, d: string) {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
}
function writeLocal(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked: preference lasts this visit */
  }
}
export function applyTheme(t: 'system' | 'light' | 'dark') {
  theme.value = t;
  writeLocal('gm-theme', t);
  const el = document.documentElement;
  el.setAttribute('data-theme-pref', t);
  el.setAttribute('data-theme', t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t);
  saveProfile();
}
export function setShortcuts(on: boolean) {
  shortcuts.value = on;
  writeLocal('gm-shortcuts', on ? '1' : '0');
  saveProfile();
}
function saveProfile() {
  const u = user.value;
  if (u && realRole.value !== 'none') setDoc(doc(db, 'users', u.uid), { theme: theme.value, shortcuts: shortcuts.value }).catch(() => {});
}
export async function loadProfile() {
  const u = user.value;
  if (!u) return;
  try {
    const s = await getDoc(doc(db, 'users', u.uid));
    if (s.exists()) {
      const p = s.data() as { theme?: 'system' | 'light' | 'dark'; shortcuts?: boolean };
      if (p.theme && p.theme !== theme.value) applyTheme(p.theme);
      if (typeof p.shortcuts === 'boolean') {
        shortcuts.value = p.shortcuts;
        writeLocal('gm-shortcuts', p.shortcuts ? '1' : '0');
      }
    }
  } catch {
    /* offline: keep local */
  }
}
