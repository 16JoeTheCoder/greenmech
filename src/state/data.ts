import { signal, computed, effect } from '@preact/signals';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp,
  getDoc,
  getDocs,
  orderBy,
  limit,
  onSnapshotsInSync,
  deleteField,
  type DocumentData,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { user, initials, isAdmin, realRole } from './session';
import type { Activity, Connection, Flag, Module, Status } from '../lib/types';
import { undoConflict, UNDO_MS, type UndoEntry } from '../lib/undo';
import { STATUS } from '../lib/status';
import { pairId } from '../lib/connections';

void deleteField;
export const modules = signal<Module[]>([]);
export const connections = signal<Connection[]>([]);
export const openFlags = signal<Flag[]>([]);
export const config = signal<{ staleDays: number; lastBackupAt: import('firebase/firestore').Timestamp | null }>({ staleDays: 7, lastBackupAt: null });
export const loaded = signal(false);

export const live = computed(() => modules.value.filter((m) => !m.deletedAt));
export const liveConns = computed(() => {
  const ids = new Set(live.value.map((m) => m.id));
  return connections.value.filter((c) => !c.deletedAt && ids.has(c.aId) && ids.has(c.bId));
});
export const byId = computed(() => new Map(modules.value.map((m) => [m.id, m])));
export const bySlug = computed(() => new Map(modules.value.map((m) => [m.slug, m])));
export const connBySlug = computed(() => new Map(connections.value.map((c) => [c.slug, c])));
export const flagsByModule = computed(() => {
  const map = new Map<string, number>();
  for (const f of openFlags.value) map.set(f.moduleId, (map.get(f.moduleId) ?? 0) + 1);
  return map;
});
export const slugTaken = (s: string) => bySlug.value.has(s) || connBySlug.value.has(s);

// ---------- listeners (only modules, connections, open flags) ----------
let unsub: (() => void)[] = [];
export function startData() {
  stopData();
  const filt = (c: string) => (isAdmin.value ? collection(db, c) : query(collection(db, c), where('deletedAt', '==', null)));
  const withId = <T>(d: { id: string; data: () => DocumentData }) => ({ id: d.id, ...d.data() }) as T;
  let pending = 3;
  const done = () => {
    if (--pending === 0) loaded.value = true;
  };
  const once = () => {
    let first = true;
    return () => {
      if (first) {
        first = false;
        done();
      }
    };
  };
  const a = once(),
    b = once(),
    c = once();
  unsub.push(
    onSnapshot(
      filt('modules'),
      { includeMetadataChanges: false },
      (s) => {
        modules.value = s.docs.map((d) => withId<Module>(d));
        a();
      },
      onListenError,
    ),
    onSnapshot(
      filt('connections'),
      (s) => {
        connections.value = s.docs.map((d) => withId<Connection>(d));
        b();
      },
      onListenError,
    ),
    onSnapshot(
      query(collection(db, 'flags'), where('resolved', '==', false)),
      (s) => {
        openFlags.value = s.docs.map((d) => withId<Flag>(d));
        c();
      },
      onListenError,
    ),
    onSnapshotsInSync(db, () => {
      if (inflight.value === 0) sync.value = navigator.onLine ? 'saved' : 'offline';
    }),
  );
  getDoc(doc(db, 'config/app'))
    .then((s) => {
      if (s.exists()) config.value = s.data() as typeof config.value;
    })
    .catch(() => {});
}
export function stopData() {
  unsub.forEach((u) => u());
  unsub = [];
  loaded.value = false;
}
function onListenError(e: Error) {
  toast(`Could not load data: ${e.message}. Reload the page; if it keeps happening, ask the admin.`);
}

// ---------- sync indicator ----------
export const sync = signal<'saved' | 'saving' | 'offline'>('saved');
export const inflight = signal(0);
addEventListener('online', () => (sync.value = inflight.value ? 'saving' : 'saved'));
addEventListener('offline', () => (sync.value = 'offline'));

// ---------- toasts and undo ----------
export interface Toast {
  id: number;
  text: string;
  undo?: UndoEntry;
  tone?: 'error';
}
export const toasts = signal<Toast[]>([]);
let tid = 0;
export function toast(text: string, undo?: UndoEntry, tone?: 'error') {
  const t = { id: ++tid, text, undo, tone };
  toasts.value = [t];
  return t.id;
}
/** PWA update: offered in the toast, never forced. */
export function offerUpdate(reload: () => void) {
  toast('A new version of Greenmech is ready.', { label: 'Reload', wrote: {}, targetPath: null, run: async () => reload(), at: Date.now() + 1e12 });
}
export const dismissToast = (id: number) => (toasts.value = toasts.value.filter((t) => t.id !== id));

/** Runs the inverse of an earlier action unless someone changed the target since. */
export async function runUndo(t: Toast) {
  const u = t.undo;
  if (!u) return;
  if (Date.now() - u.at > UNDO_MS + 60000) return toast('Undo has expired.');
  if (u.targetPath) {
    let current: Record<string, unknown> | undefined;
    try {
      const s = await getDoc(doc(db, u.targetPath));
      current = s.exists() ? s.data() : undefined;
    } catch {
      current = undefined;
    }
    if (undoConflict(u, current, user.value!.uid)) {
      let who = 'Someone';
      try {
        const id = u.targetPath.split('/')[1];
        const a = await getDocs(query(collection(db, 'activity'), where('targetId', '==', id), orderBy('at', 'desc'), limit(1)));
        if (!a.empty) who = (a.docs[0].data() as Activity).actorInitials;
      } catch {
        /* keep generic */
      }
      return toast(`${who} changed this since. Can't undo.`);
    }
  }
  dismissToast(t.id);
  await u.run();
}

// ---------- writing ----------
const me = () => user.value!.uid;
const audit = () => ({ updatedAt: serverTimestamp(), updatedBy: me() });
function act(b: WriteBatch, type: string, targetKind: Activity['targetKind'], targetId: string, targetSlug: string | null, summary: string) {
  b.set(doc(collection(db, 'activity')), {
    at: serverTimestamp(),
    actorUid: me(),
    actorInitials: initials.value,
    type,
    targetKind,
    targetId,
    targetSlug,
    summary: summary.slice(0, 200),
  });
}
/** Commits a batch. Offline: resolves locally at once and syncs later (we do not await the server). */
function commit(b: WriteBatch, failMsg: string): Promise<void> {
  inflight.value++;
  sync.value = navigator.onLine ? 'saving' : 'offline';
  const p = b
    .commit()
    .then(
      () => {},
      (e: Error) => {
        toast(`${failMsg}: ${friendly(e)}`, undefined, 'error');
        throw e;
      },
    )
    .finally(() => {
      inflight.value--;
      if (!inflight.value && navigator.onLine) sync.value = 'saved';
    });
  p.catch(() => {});
  return Promise.resolve();
}
function friendly(e: Error & { code?: string }) {
  if (e.code === 'permission-denied') return 'you do not have permission for this. Ask the module leader or the admin';
  return e.message;
}
const undoable = (label: string, path: string | null, wrote: Record<string, unknown>, run: () => Promise<void>): UndoEntry => ({
  label,
  targetPath: path,
  wrote,
  run,
  at: Date.now(),
});

const mod = (id: string) => byId.value.get(id)!;
const mref = (id: string) => doc(db, 'modules', id);

export function setStatus(id: string, status: Status, opts: { silent?: boolean } = {}) {
  const m = mod(id);
  const prev = m.status;
  if (prev === status) return;
  const b = writeBatch(db);
  b.update(mref(id), { status, ...audit() });
  act(b, 'status', 'module', id, m.slug, `set ${m.slug} to ${STATUS[status].word}`);
  commit(b, 'Status not saved');
  if (!opts.silent)
    toast(
      `${m.slug} is now ${STATUS[status].word}.`,
      undoable('status', `modules/${id}`, { status }, async () => setStatus(id, prev, { silent: true })),
    );
}

export function takeModule(id: string, silent = false) {
  const m = mod(id);
  const b = writeBatch(db);
  b.update(mref(id), { leaderUid: me(), leaderInitials: initials.value, ...audit() });
  act(b, 'take', 'module', id, m.slug, `took the lead on ${m.slug}`);
  commit(b, 'Could not take the module');
  if (!silent)
    toast(
      `You lead ${m.slug} now.`,
      undoable('take', `modules/${id}`, { leaderUid: me() }, async () => stepDown(id, true)),
    );
}
export function stepDown(id: string, silent = false) {
  const m = mod(id);
  const b = writeBatch(db);
  b.update(mref(id), { leaderUid: null, leaderInitials: null, ...audit() });
  act(b, 'stepdown', 'module', id, m.slug, `stepped down from ${m.slug}`);
  commit(b, 'Could not step down');
  if (!silent)
    toast(
      `You stepped down from ${m.slug}.`,
      undoable('stepdown', `modules/${id}`, { leaderUid: null }, async () => takeModule(id, true)),
    );
}
export function assignLeader(id: string, uid: string | null, ini: string | null) {
  const m = mod(id);
  const b = writeBatch(db);
  b.update(mref(id), { leaderUid: uid, leaderInitials: ini, ...audit() });
  act(b, 'assign', 'module', id, m.slug, uid ? `made ${ini} leader of ${m.slug}` : `removed the leader of ${m.slug}`);
  commit(b, 'Leader not saved');
}

export function updateModule(id: string, fields: Partial<Pick<Module, 'purpose' | 'ports' | 'hasModel' | 'tier' | 'order'>>, summary: string, undo = true) {
  const m = mod(id);
  const prev = Object.fromEntries(Object.keys(fields).map((k) => [k, m[k as keyof Module]]));
  const b = writeBatch(db);
  b.update(mref(id), { ...fields, ...audit() });
  act(b, 'edit', 'module', id, m.slug, summary);
  commit(b, 'Change not saved');
  if (undo)
    toast(
      `Saved. ${summary[0].toUpperCase()}${summary.slice(1)}.`,
      undoable('edit', `modules/${id}`, fields, async () => updateModule(id, prev as typeof fields, `undid: ${summary}`, false)),
    );
}

/** Rename (module or connection): one batch writes the registry entry and the new slug. Retired slugs stay reserved and redirect. */
export async function rename(kind: 'module' | 'connection', id: string, next: string, silent = false): Promise<void> {
  const coll = kind === 'module' ? 'modules' : 'connections';
  const cur = kind === 'module' ? mod(id) : connections.value.find((c) => c.id === id)!;
  const prev = cur.slug;
  const b = writeBatch(db);
  const reg = await getDoc(doc(db, 'slugs', next)).catch(() => null);
  if (reg?.exists() && reg.data().refId !== id) {
    toast(`"${next}" is already used. Pick another name.`, undefined, 'error');
    return;
  }
  if (!reg?.exists()) b.set(doc(db, 'slugs', next), { kind, refId: id });
  b.update(doc(db, coll, id), { slug: next, ...audit() });
  act(b, 'rename', kind, id, next, `renamed ${prev} to ${next}`);
  commit(b, 'Rename not saved');
  if (!silent)
    toast(
      `Renamed to ${next}. Old links keep working.`,
      undoable('rename', `${coll}/${id}`, { slug: next }, () => rename(kind, id, prev, true)),
    );
}

export function createModule(slug: string, purpose: string): string {
  const ref = doc(collection(db, 'modules'));
  const b = writeBatch(db);
  b.set(ref, {
    slug,
    status: 0,
    tier: -1,
    order: 0,
    purpose,
    hasModel: false,
    ports: { in: 'none', out: 'none' },
    leaderUid: null,
    leaderInitials: null,
    createdAt: serverTimestamp(),
    createdBy: me(),
    ...audit(),
    deletedAt: null,
  });
  b.set(doc(db, 'slugs', slug), { kind: 'module', refId: ref.id });
  act(b, 'create', 'module', ref.id, slug, `added ${slug}`);
  commit(b, 'Module not created');
  toast(`Added ${slug}. It sits in Unplaced until the admin gives it a tier.`);
  return ref.id;
}

export function softDelete(kind: 'module' | 'connection', id: string, restore = false, silent = false) {
  const coll = kind === 'module' ? 'modules' : 'connections';
  const slug = kind === 'module' ? mod(id).slug : connections.value.find((c) => c.id === id)!.slug;
  const b = writeBatch(db);
  b.update(doc(db, coll, id), { deletedAt: restore ? null : serverTimestamp(), ...audit() });
  act(b, restore ? 'restore' : 'remove', kind, id, slug, `${restore ? 'restored' : 'removed'} ${slug}`);
  commit(b, restore ? 'Not restored' : 'Not removed');
  if (!silent)
    toast(
      restore ? `Restored ${slug}.` : `Removed ${slug}. The admin can restore it in Manage.`,
      restore ? undefined : undoable('remove', null, {}, async () => softDelete(kind, id, true, true)),
    );
}

// ---------- connections ----------
export function createConnection(aId: string, bId: string, slug: string) {
  const id = pairId(aId, bId);
  const b = writeBatch(db);
  b.set(doc(db, 'connections', id), { slug, aId, bId, state: 1, createdAt: serverTimestamp(), createdBy: me(), ...audit(), deletedAt: null });
  b.set(doc(db, 'slugs', slug), { kind: 'connection', refId: id });
  act(b, 'create', 'connection', id, slug, `linked ${mod(aId).slug} to ${mod(bId).slug} as ${slug}`);
  commit(b, 'Connection not created');
  toast(`Linked ${mod(aId).slug} to ${mod(bId).slug}.`);
  return id;
}
const CWORD = { 1: 'Ready', 2: 'In progress', 3: 'Connected' } as const;
export function setConnState(id: string, state: 1 | 2 | 3, silent = false) {
  const c = connections.value.find((x) => x.id === id)!;
  const prev = c.state;
  const b = writeBatch(db);
  b.update(doc(db, 'connections', id), { state, ...audit() });
  act(b, 'connstate', 'connection', id, c.slug, `set ${c.slug} to ${CWORD[state]}`);
  commit(b, 'Connection state not saved');
  if (!silent)
    toast(
      `${c.slug} is ${CWORD[state]}.`,
      undoable('connstate', `connections/${id}`, { state }, async () => setConnState(id, prev, true)),
    );
}

// ---------- discussion and references (hard delete, undo re-creates same id + content) ----------
export function addIdea(moduleId: string, text: string) {
  const m = mod(moduleId);
  const ref = doc(collection(db, 'ideas'));
  const b = writeBatch(db);
  b.set(ref, { moduleId, text, authorUid: me(), authorInitials: initials.value, createdAt: serverTimestamp() });
  act(b, 'idea', 'module', moduleId, m.slug, `added an idea to ${m.slug}`);
  commit(b, 'Idea not saved');
}
export function addFlag(moduleId: string, text: string) {
  const m = mod(moduleId);
  const ref = doc(collection(db, 'flags'));
  const b = writeBatch(db);
  b.set(ref, {
    moduleId,
    text,
    authorUid: me(),
    authorInitials: initials.value,
    resolved: false,
    resolvedBy: null,
    createdAt: serverTimestamp(),
    resolvedAt: null,
  });
  act(b, 'flag', 'module', moduleId, m.slug, `flagged ${m.slug}: ${text}`);
  commit(b, 'Flag not saved');
}
export function resolveFlag(f: Flag, resolved: boolean, silent = false) {
  const m = mod(f.moduleId);
  const b = writeBatch(db);
  b.update(doc(db, 'flags', f.id), resolved ? { resolved, resolvedBy: me(), resolvedAt: serverTimestamp() } : { resolved, resolvedBy: null, resolvedAt: null });
  act(b, resolved ? 'resolve' : 'unresolve', 'module', f.moduleId, m.slug, `${resolved ? 'resolved' : 'reopened'} a flag on ${m.slug}`);
  commit(b, 'Flag not updated');
  if (!silent && resolved)
    toast(
      'Flag resolved.',
      undoable('resolve', `flags/${f.id}`, { resolved: true }, async () => resolveFlag(f, false, true)),
    );
}
export function removeDoc(coll: 'ideas' | 'flags' | 'refs', id: string, data: Record<string, unknown>, label: string) {
  const moduleId = data.moduleId as string;
  const m = mod(moduleId);
  const b = writeBatch(db);
  b.delete(doc(db, coll, id));
  act(b, 'delete', 'module', moduleId, m.slug, `deleted ${label} on ${m.slug}`);
  commit(b, 'Not deleted');
  toast(
    `Deleted ${label}.`,
    undoable('delete', null, {}, async () => {
      const r = writeBatch(db);
      // flags are re-created unresolved: the rules only allow creating open flags
      const fresh = { ...data, createdAt: serverTimestamp() };
      const restored = coll === 'flags' ? { ...fresh, resolved: false, resolvedBy: null, resolvedAt: null } : fresh;
      r.set(doc(db, coll, id), restored);
      act(r, 'restore', 'module', moduleId, m.slug, `restored ${label} on ${m.slug}`);
      commit(r, 'Not restored');
    }),
  );
}
export function addRef(moduleId: string, r: { kind: 'link' | 'vector'; title: string; url: string | null; data: string | null }) {
  const m = mod(moduleId);
  const b = writeBatch(db);
  b.set(doc(collection(db, 'refs')), { moduleId, ...r, authorUid: me(), createdAt: serverTimestamp() });
  act(b, 'ref', 'module', moduleId, m.slug, `added reference "${r.title}" to ${m.slug}`);
  commit(b, 'Reference not saved');
}
export function saveBody(moduleId: string, body: { plan: string; model: { svg: string } | null }, summary: string, hasModel?: boolean) {
  const m = mod(moduleId);
  const b = writeBatch(db);
  const model = body.model ? { svg: body.model.svg, updatedAt: serverTimestamp(), updatedBy: me() } : null;
  b.set(doc(db, 'modules', moduleId, 'body', 'main'), { plan: body.plan, model });
  if (hasModel !== undefined && hasModel !== m.hasModel) b.update(mref(moduleId), { hasModel, ...audit() });
  act(b, 'body', 'module', moduleId, m.slug, summary);
  commit(b, 'Not saved');
}

// keep listeners matched to the signed-in role
effect(() => {
  if (user.value && realRole.value !== 'none') startData();
  else stopData();
});
export { CWORD, writeBatch, act, commit, audit, me };
