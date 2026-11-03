import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';

let env: RulesTestEnvironment;
const users = {
  admin: { uid: 'u-admin', email: 'admin@test.example' },
  m1: { uid: 'u-m1', email: 'member1@test.example' },
  m2: { uid: 'u-m2', email: 'member2@test.example' },
  coach: { uid: 'u-coach', email: 'coach@test.example' },
  out: { uid: 'u-out', email: 'outsider@test.example' },
};
type Who = keyof typeof users;
const db = (w: Who, verified = true): Firestore =>
  env
    .authenticatedContext(users[w].uid, { email: users[w].email, email_verified: verified, firebase: { sign_in_provider: 'google.com' } } as never)
    .firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const ts = Timestamp.fromDate(new Date('2026-01-01'));
const ports = { in: 'none', out: 'ball' };
const moduleData = (o: Record<string, unknown> = {}) => ({
  slug: 'intake-ramp',
  status: 0,
  tier: 0,
  order: 0,
  purpose: 'Starts the run',
  hasModel: false,
  ports,
  leaderUid: null,
  leaderInitials: null,
  createdAt: ts,
  createdBy: 'u-admin',
  updatedAt: ts,
  updatedBy: 'u-admin',
  deletedAt: null,
  ...o,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-greenmech',
    firestore: { rules: readFileSync('tests/rules/.test.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    const put = (p: string, data: object) => setDoc(doc(f, p), data);
    await put('allowlist/member1@test.example', { role: 'member', initials: 'P1', addedBy: 'u-admin', addedAt: ts });
    await put('allowlist/member2@test.example', { role: 'member', initials: 'P2', addedBy: 'u-admin', addedAt: ts });
    await put('allowlist/coach@test.example', { role: 'coach', initials: 'C1', addedBy: 'u-admin', addedAt: ts });
    await put('modules/mA', moduleData({ slug: 'intake-ramp', status: 3, leaderUid: 'u-m1', leaderInitials: 'P1' }));
    await put('modules/mB', moduleData({ slug: 'gear-train', status: 3 }));
    await put('modules/mC', moduleData({ slug: 'lift-arm', status: 2, leaderUid: 'u-m2', leaderInitials: 'P2' }));
    await put('modules/mDel', moduleData({ slug: 'old-one', deletedAt: ts }));
    await put('slugs/intake-ramp', { kind: 'module', refId: 'mA' });
    await put('connections/mA__mB', {
      slug: 'ramp-feed',
      aId: 'mA',
      bId: 'mB',
      state: 1,
      createdAt: ts,
      createdBy: 'u-m1',
      updatedAt: ts,
      updatedBy: 'u-m1',
      deletedAt: null,
    });
    await put('connections/mB__mC', {
      slug: 'gear-lift',
      aId: 'mB',
      bId: 'mC',
      state: 1,
      createdAt: ts,
      createdBy: 'u-m1',
      updatedAt: ts,
      updatedBy: 'u-m1',
      deletedAt: null,
    });
    await put('connections/mDel__mA', {
      slug: 'dead-link',
      aId: 'mDel',
      bId: 'mA',
      state: 1,
      createdAt: ts,
      createdBy: 'u-m1',
      updatedAt: ts,
      updatedBy: 'u-m1',
      deletedAt: ts,
    });
    await put('flags/f1', {
      moduleId: 'mC',
      text: 'Arm wobbles',
      authorUid: 'u-m1',
      authorInitials: 'P1',
      resolved: false,
      resolvedBy: null,
      createdAt: ts,
      resolvedAt: null,
    });
    await put('ideas/i1', { moduleId: 'mC', text: 'Use a cam', authorUid: 'u-m1', authorInitials: 'P1', createdAt: ts });
    await put('config/app', { staleDays: 7, lastBackupAt: null });
    await put('accessRequests/u-out', { email: 'outsider@test.example', displayName: 'Out', requestedAt: ts });
    await put('users/u-m1', { theme: 'dark', shortcuts: true });
  });
});

const audit = (w: Who) => ({ updatedAt: serverTimestamp(), updatedBy: users[w].uid });
const activity = (w: Who, initials: string, o: Record<string, unknown> = {}) => ({
  at: serverTimestamp(),
  actorUid: users[w].uid,
  actorInitials: initials,
  type: 'status',
  targetKind: 'module',
  targetId: 'mC',
  targetSlug: 'lift-arm',
  summary: 'set lift-arm to Done',
  ...o,
});
function createModule(f: Firestore, w: Who, id: string, slug: string, o: Record<string, unknown> = {}) {
  const b = writeBatch(f);
  b.set(doc(f, 'modules', id), {
    ...moduleData({ slug, tier: -1, createdBy: users[w].uid, createdAt: serverTimestamp(), ...audit(w) }),
    ...o,
  });
  b.set(doc(f, 'slugs', slug), { kind: 'module', refId: id });
  return b.commit();
}

describe('signed-out and unlisted', () => {
  it('anon cannot read modules', () => assertFails(getDoc(doc(anon(), 'modules/mA'))));
  it('anon cannot read config', () => assertFails(getDoc(doc(anon(), 'config/app'))));
  it('anon cannot create access request', () =>
    assertFails(setDoc(doc(anon(), 'accessRequests/x'), { email: 'a@b.c', displayName: 'A', requestedAt: serverTimestamp() })));
  it('unlisted cannot read modules', () => assertFails(getDoc(doc(db('out'), 'modules/mA'))));
  it('unlisted cannot read slugs', () => assertFails(getDoc(doc(db('out'), 'slugs/intake-ramp'))));
  it('unlisted can read own access request', () => assertSucceeds(getDoc(doc(db('out'), 'accessRequests/u-out'))));
  it('unlisted cannot read another access request', () => assertFails(getDoc(doc(db('out'), 'accessRequests/u-m1'))));
  it('unlisted can read own (missing) allowlist doc', () => assertSucceeds(getDoc(doc(db('out'), 'allowlist/outsider@test.example'))));
  it('unlisted cannot read others allowlist', () => assertFails(getDoc(doc(db('out'), 'allowlist/member1@test.example'))));
  it('unlisted can create own access request', async () => {
    await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), 'accessRequests/u-out')));
    await assertSucceeds(
      setDoc(doc(db('out'), 'accessRequests/u-out'), { email: 'outsider@test.example', displayName: 'Out', requestedAt: serverTimestamp() }),
    );
  });
  it('access request with another email is denied', async () => {
    await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), 'accessRequests/u-out')));
    await assertFails(setDoc(doc(db('out'), 'accessRequests/u-out'), { email: 'admin@test.example', displayName: 'Out', requestedAt: serverTimestamp() }));
  });
  it('access request for another uid is denied', () =>
    assertFails(setDoc(doc(db('out'), 'accessRequests/u-zzz'), { email: 'outsider@test.example', displayName: 'Out', requestedAt: serverTimestamp() })));
  it('access request cannot be updated', () => assertFails(updateDoc(doc(db('out'), 'accessRequests/u-out'), { displayName: 'New' })));
  it('unverified email reads nothing', () => assertFails(getDoc(doc(db('m1', false), 'modules/mA'))));
  it('unlisted cannot write activity', () => assertFails(setDoc(doc(db('out'), 'activity/a1'), activity('out', 'XX'))));
});

describe('coach', () => {
  it('reads modules', () => assertSucceeds(getDoc(doc(db('coach'), 'modules/mA'))));
  it('reads config', () => assertSucceeds(getDoc(doc(db('coach'), 'config/app'))));
  it('reads activity query', () => assertSucceeds(getDocs(collection(db('coach'), 'activity'))));
  it('cannot read soft-deleted module', () => assertFails(getDoc(doc(db('coach'), 'modules/mDel'))));
  it('filtered module query succeeds', () => assertSucceeds(getDocs(query(collection(db('coach'), 'modules'), where('deletedAt', '==', null)))));
  it('unfiltered module query fails', () => assertFails(getDocs(collection(db('coach'), 'modules'))));
  it('cannot claim a module', () => assertFails(updateDoc(doc(db('coach'), 'modules/mB'), { leaderUid: 'u-coach', leaderInitials: 'C1', ...audit('coach') })));
  it('cannot create module', () => assertFails(createModule(db('coach'), 'coach', 'mN', 'new-thing')));
  it('cannot add idea', () =>
    assertFails(setDoc(doc(db('coach'), 'ideas/x'), { moduleId: 'mA', text: 'hi', authorUid: 'u-coach', authorInitials: 'C1', createdAt: serverTimestamp() })));
  it('cannot resolve flag', () =>
    assertFails(updateDoc(doc(db('coach'), 'flags/f1'), { resolved: true, resolvedBy: 'u-coach', resolvedAt: serverTimestamp() })));
  it('cannot write activity', () => assertFails(setDoc(doc(db('coach'), 'activity/a1'), activity('coach', 'C1'))));
  it('can write own profile', () => assertSucceeds(setDoc(doc(db('coach'), 'users/u-coach'), { theme: 'light', shortcuts: false })));
  it('cannot write profile with extra fields', () => assertFails(setDoc(doc(db('coach'), 'users/u-coach'), { theme: 'light', name: 'Bob' })));
  it('cannot read another profile', () => assertFails(getDoc(doc(db('coach'), 'users/u-m1'))));
  it('cannot write config', () => assertFails(setDoc(doc(db('coach'), 'config/app'), { staleDays: 3, lastBackupAt: null })));
  it('cannot read the allowlist of others', () => assertFails(getDoc(doc(db('coach'), 'allowlist/member1@test.example'))));
});

describe('member: modules', () => {
  it('creates an unled unplaced idea module with slug', () => assertSucceeds(createModule(db('m1'), 'm1', 'mN', 'solar-updraft')));
  it('cannot create with a leader', () => assertFails(createModule(db('m1'), 'm1', 'mN', 'solar-updraft', { leaderUid: 'u-m1', leaderInitials: 'P1' })));
  it('cannot create placed in a tier', () => assertFails(createModule(db('m1'), 'm1', 'mN', 'solar-updraft', { tier: 1 })));
  it('cannot create with status Done', () => assertFails(createModule(db('m1'), 'm1', 'mN', 'solar-updraft', { status: 3 })));
  it('cannot create without slug registry entry', () =>
    assertFails(setDoc(doc(db('m1'), 'modules/mN'), moduleData({ slug: 'solo', tier: -1, createdBy: 'u-m1', createdAt: serverTimestamp(), ...audit('m1') }))));
  it('cannot take a slug already registered', () => assertFails(createModule(db('m1'), 'm1', 'mN', 'intake-ramp')));
  it('cannot use a reserved slug', () => assertFails(createModule(db('m1'), 'm1', 'mN', 'manage')));
  it('cannot use a bad slug', () => assertFails(createModule(db('m1'), 'm1', 'mN', 'Bad_Slug')));
  it('cannot create with unknown fields', () => assertFails(createModule(db('m1'), 'm1', 'mN', 'solar-updraft', { secret: 1 })));
  it('cannot create with bad ports', () => assertFails(createModule(db('m1'), 'm1', 'mN', 'solar-updraft', { ports: { in: 'laser', out: 'ball' } })));
  it('claims an unled module', () => assertSucceeds(updateDoc(doc(db('m1'), 'modules/mB'), { leaderUid: 'u-m1', leaderInitials: 'P1', ...audit('m1') })));
  it('cannot claim with wrong initials', () =>
    assertFails(updateDoc(doc(db('m1'), 'modules/mB'), { leaderUid: 'u-m1', leaderInitials: 'ZZ', ...audit('m1') })));
  it('cannot claim for someone else', () => assertFails(updateDoc(doc(db('m1'), 'modules/mB'), { leaderUid: 'u-m2', leaderInitials: 'P2', ...audit('m1') })));
  it('cannot take a led module', () => assertFails(updateDoc(doc(db('m1'), 'modules/mC'), { leaderUid: 'u-m1', leaderInitials: 'P1', ...audit('m1') })));
  it('cannot claim while changing status', () =>
    assertFails(updateDoc(doc(db('m1'), 'modules/mB'), { leaderUid: 'u-m1', leaderInitials: 'P1', status: 2, ...audit('m1') })));
  it('steps down from own module', () => assertSucceeds(updateDoc(doc(db('m1'), 'modules/mA'), { leaderUid: null, leaderInitials: null, ...audit('m1') })));
  it('cannot remove another leader', () => assertFails(updateDoc(doc(db('m1'), 'modules/mC'), { leaderUid: null, leaderInitials: null, ...audit('m1') })));
  it('leader changes status', () => assertSucceeds(updateDoc(doc(db('m1'), 'modules/mA'), { status: 2, ...audit('m1') })));
  it('leader changes purpose and ports', () =>
    assertSucceeds(updateDoc(doc(db('m1'), 'modules/mA'), { purpose: 'New', ports: { in: 'spin', out: 'push' }, ...audit('m1') })));
  it('non-leader cannot change status', () => assertFails(updateDoc(doc(db('m1'), 'modules/mC'), { status: 3, ...audit('m1') })));
  it('leader cannot change tier', () => assertFails(updateDoc(doc(db('m1'), 'modules/mA'), { tier: 2, ...audit('m1') })));
  it('leader cannot soft-delete', () => assertFails(updateDoc(doc(db('m1'), 'modules/mA'), { deletedAt: serverTimestamp(), ...audit('m1') })));
  it('update must stamp updatedAt as request time', () => assertFails(updateDoc(doc(db('m1'), 'modules/mA'), { status: 2, updatedAt: ts, updatedBy: 'u-m1' })));
  it('update must stamp updatedBy as self', () =>
    assertFails(updateDoc(doc(db('m1'), 'modules/mA'), { status: 2, updatedAt: serverTimestamp(), updatedBy: 'u-m2' })));
  it('leader renames slug with registry entry', async () => {
    const f = db('m1');
    const b = writeBatch(f);
    b.update(doc(f, 'modules/mA'), { slug: 'start-ramp', ...audit('m1') });
    b.set(doc(f, 'slugs/start-ramp'), { kind: 'module', refId: 'mA' });
    await assertSucceeds(b.commit());
  });
  it('rename without registry entry is denied', () => assertFails(updateDoc(doc(db('m1'), 'modules/mA'), { slug: 'start-ramp', ...audit('m1') })));
  it('registry entry for a module that does not carry the slug is denied', () =>
    assertFails(setDoc(doc(db('m1'), 'slugs/free-slug'), { kind: 'module', refId: 'mA' })));
  it('slug registry is immutable', () => assertFails(setDoc(doc(db('m1'), 'slugs/intake-ramp'), { kind: 'module', refId: 'mB' })));
  it('member cannot delete slug', () => assertFails(deleteDoc(doc(db('m1'), 'slugs/intake-ramp'))));
  it('member cannot hard-delete module', () => assertFails(deleteDoc(doc(db('m1'), 'modules/mA'))));
  it('member cannot read soft-deleted module', () => assertFails(getDoc(doc(db('m1'), 'modules/mDel'))));
  it('leader writes body plan', () => assertSucceeds(setDoc(doc(db('m1'), 'modules/mA/body/main'), { plan: '# Plan', model: null })));
  it('non-leader cannot write body', () => assertFails(setDoc(doc(db('m1'), 'modules/mC/body/main'), { plan: 'x', model: null })));
  it('body model over 40000 chars denied', () =>
    assertFails(
      setDoc(doc(db('m1'), 'modules/mA/body/main'), { plan: '', model: { svg: 'x'.repeat(40001), updatedAt: serverTimestamp(), updatedBy: 'u-m1' } }),
    ));
  it('body model with extra key denied', () =>
    assertFails(setDoc(doc(db('m1'), 'modules/mA/body/main'), { plan: '', model: { svg: '<svg/>', updatedAt: serverTimestamp(), updatedBy: 'u-m1', x: 1 } })));
  it('coach reads body', () => assertSucceeds(getDoc(doc(db('coach'), 'modules/mA/body/main'))));
  it('body of a deleted module is hidden from members', () => assertFails(getDoc(doc(db('m1'), 'modules/mDel/body/main'))));
  it('admin writes any body', () => assertSucceeds(setDoc(doc(db('admin'), 'modules/mC/body/main'), { plan: 'x', model: null })));
  it('slug registered with the wrong kind is denied', async () => {
    const f = db('m1');
    const b = writeBatch(f);
    b.update(doc(f, 'modules/mA'), { slug: 'start-ramp', ...audit('m1') });
    b.set(doc(f, 'slugs/start-ramp'), { kind: 'connection', refId: 'mA' });
    await assertFails(b.commit());
  });
  it('registry entry with an extra key is denied', () => assertFails(setDoc(doc(db('m1'), 'slugs/zz-top'), { kind: 'module', refId: 'mA', x: 1 })));
  it('coach cannot write slugs', () => assertFails(setDoc(doc(db('coach'), 'slugs/zz-top'), { kind: 'module', refId: 'mA' })));
  it('update cannot forge createdBy', () => assertFails(updateDoc(doc(db('m1'), 'modules/mA'), { status: 2, createdBy: 'u-m1', ...audit('m1') })));
  it('member cannot claim a soft-deleted module', () =>
    assertFails(updateDoc(doc(db('m1'), 'modules/mDel'), { leaderUid: 'u-m1', leaderInitials: 'P1', ...audit('m1') })));
  it('listed member cannot file an access request', () =>
    assertFails(setDoc(doc(db('m1'), 'accessRequests/u-m1'), { email: 'member1@test.example', displayName: 'M', requestedAt: serverTimestamp() })));
  it('member cannot write another user profile', () => assertFails(setDoc(doc(db('m1'), 'users/u-m2'), { theme: 'dark' })));
  it('coach cannot delete a flag', () => assertFails(deleteDoc(doc(db('coach'), 'flags/f1'))));
  it('admin cannot delete config', () => assertFails(deleteDoc(doc(db('admin'), 'config/app'))));
  it('coach cannot update a connection', () => assertFails(updateDoc(doc(db('coach'), 'connections/mA__mB'), { state: 2, ...audit('coach') })));
});

describe('connections', () => {
  const conn = (w: Who, a: string, b: string, slug: string, o: Record<string, unknown> = {}) => {
    const f = db(w);
    const batch = writeBatch(f);
    batch.set(doc(f, 'connections', `${a}__${b}`), {
      slug,
      aId: a,
      bId: b,
      state: 1,
      createdAt: serverTimestamp(),
      createdBy: users[w].uid,
      ...audit(w),
      deletedAt: null,
      ...o,
    });
    batch.set(doc(f, 'slugs', slug), { kind: 'connection', refId: `${a}__${b}` });
    return batch.commit();
  };
  it('member creates a connection', () => assertSucceeds(conn('m2', 'mC', 'mA', 'arm-back')));
  it('reverse direction is a different pair', () => assertSucceeds(conn('m2', 'mB', 'mA', 'back-feed')));
  it('cannot create a self-loop', () => assertFails(conn('m2', 'mA', 'mA', 'loop')));
  it('cannot create with wrong id', async () => {
    const f = db('m2');
    await assertFails(
      setDoc(doc(f, 'connections/zzz'), {
        slug: 'x-y',
        aId: 'mA',
        bId: 'mC',
        state: 1,
        createdAt: serverTimestamp(),
        createdBy: 'u-m2',
        ...audit('m2'),
        deletedAt: null,
      }),
    );
  });
  it('cannot create in state 2', () => assertFails(conn('m2', 'mC', 'mA', 'arm-back', { state: 2 })));
  it('cannot create to a deleted module', () => assertFails(conn('m2', 'mA', 'mDel', 'to-dead')));
  it('cannot duplicate an existing pair', () => assertFails(conn('m2', 'mA', 'mB', 'second-feed')));
  it('coach cannot create a connection', () => assertFails(conn('coach', 'mC', 'mA', 'arm-back')));
  it('leader of an end starts connecting when both Done', () => assertSucceeds(updateDoc(doc(db('m1'), 'connections/mA__mB'), { state: 2, ...audit('m1') })));
  it('cannot advance while an end is not Done', async () => {
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), 'modules/mC'), { leaderUid: 'u-m1' }));
    await assertFails(updateDoc(doc(db('m1'), 'connections/mB__mC'), { state: 2, ...audit('m1') }));
  });
  it('non-leader of either end cannot advance', () => assertFails(updateDoc(doc(db('m2'), 'connections/mA__mB'), { state: 2, ...audit('m2') })));
  it('member cannot soft-delete a connection', () =>
    assertFails(updateDoc(doc(db('m1'), 'connections/mA__mB'), { deletedAt: serverTimestamp(), ...audit('m1') })));
  it('member cannot hard-delete a connection', () => assertFails(deleteDoc(doc(db('m1'), 'connections/mA__mB'))));
  it('member cannot change endpoints', () => assertFails(updateDoc(doc(db('m1'), 'connections/mA__mB'), { bId: 'mC', ...audit('m1') })));
  it('member cannot read soft-deleted connection', () => assertFails(getDoc(doc(db('m1'), 'connections/mDel__mA'))));
  it('admin soft-deletes a connection', () =>
    assertSucceeds(updateDoc(doc(db('admin'), 'connections/mA__mB'), { deletedAt: serverTimestamp(), ...audit('admin') })));
  it('admin cannot mark connected when an end is not Done', () =>
    assertFails(updateDoc(doc(db('admin'), 'connections/mB__mC'), { state: 3, ...audit('admin') })));
});

describe('ideas, flags, refs', () => {
  const idea = (w: Who, initials: string, o: Record<string, unknown> = {}) =>
    setDoc(doc(db(w), 'ideas/new'), {
      moduleId: 'mC',
      text: 'Try a cam',
      authorUid: users[w].uid,
      authorInitials: initials,
      createdAt: serverTimestamp(),
      ...o,
    });
  const flag = (w: Who, initials: string, o: Record<string, unknown> = {}) =>
    setDoc(doc(db(w), 'flags/new'), {
      moduleId: 'mC',
      text: 'Too loud',
      authorUid: users[w].uid,
      authorInitials: initials,
      resolved: false,
      resolvedBy: null,
      createdAt: serverTimestamp(),
      resolvedAt: null,
      ...o,
    });
  it('member adds idea to any module', () => assertSucceeds(idea('m1', 'P1')));
  it('idea with forged initials denied', () => assertFails(idea('m1', 'P2')));
  it('idea for another author denied', () => assertFails(idea('m1', 'P1', { authorUid: 'u-m2' })));
  it('idea on a deleted module denied', () => assertFails(idea('m1', 'P1', { moduleId: 'mDel' })));
  it('idea over 1000 chars denied', () => assertFails(idea('m1', 'P1', { text: 'x'.repeat(1001) })));
  it('idea cannot be edited', () => assertFails(updateDoc(doc(db('m1'), 'ideas/i1'), { text: 'changed' })));
  it('author deletes own idea', () => assertSucceeds(deleteDoc(doc(db('m1'), 'ideas/i1'))));
  it('other member cannot delete idea', () => assertFails(deleteDoc(doc(db('m2'), 'ideas/i1'))));
  it('backdated idea is denied', () => assertFails(idea('m1', 'P1', { createdAt: ts })));
  it('link with a malformed host is denied', () => assertFails(ref({ url: 'https://[' })));
  it('other member cannot delete a ref', async () => {
    await env.withSecurityRulesDisabled((c) =>
      setDoc(doc(c.firestore(), 'refs/r9'), {
        moduleId: 'mA',
        kind: 'link',
        title: 'x',
        url: 'https://a.example',
        data: null,
        authorUid: 'u-m2',
        createdAt: ts,
      }),
    );
    await assertFails(deleteDoc(doc(db('m1'), 'refs/r9')));
    await assertSucceeds(deleteDoc(doc(db('m2'), 'refs/r9')));
  });
  it('ref on a deleted module is denied', () => assertFails(ref({ moduleId: 'mDel' })));
  it('member adds flag', () => assertSucceeds(flag('m2', 'P2')));
  it('flag cannot be created resolved', () => assertFails(flag('m2', 'P2', { resolved: true, resolvedBy: 'u-m2' })));
  it('flag author resolves own flag', () =>
    assertSucceeds(updateDoc(doc(db('m1'), 'flags/f1'), { resolved: true, resolvedBy: 'u-m1', resolvedAt: serverTimestamp() })));
  it('module leader resolves any flag on it', () =>
    assertSucceeds(updateDoc(doc(db('m2'), 'flags/f1'), { resolved: true, resolvedBy: 'u-m2', resolvedAt: serverTimestamp() })));
  it('resolvedBy must be self', () => assertFails(updateDoc(doc(db('m1'), 'flags/f1'), { resolved: true, resolvedBy: 'u-m2', resolvedAt: serverTimestamp() })));
  it('flag text cannot change on resolve', () =>
    assertFails(updateDoc(doc(db('m1'), 'flags/f1'), { text: 'x', resolved: true, resolvedBy: 'u-m1', resolvedAt: serverTimestamp() })));
  it('un-resolve clears resolver', async () => {
    await env.withSecurityRulesDisabled((c) => updateDoc(doc(c.firestore(), 'flags/f1'), { resolved: true, resolvedBy: 'u-m1', resolvedAt: ts }));
    await assertSucceeds(updateDoc(doc(db('m1'), 'flags/f1'), { resolved: false, resolvedBy: null, resolvedAt: null }));
  });
  it('admin resolves any flag', () =>
    assertSucceeds(updateDoc(doc(db('admin'), 'flags/f1'), { resolved: true, resolvedBy: 'u-admin', resolvedAt: serverTimestamp() })));
  const ref = (o: Record<string, unknown>) =>
    setDoc(doc(db('m2'), 'refs/r1'), {
      moduleId: 'mA',
      kind: 'link',
      title: 'Guide',
      url: 'https://example.org/a',
      data: null,
      authorUid: 'u-m2',
      createdAt: serverTimestamp(),
      ...o,
    });
  it('member adds https link ref', () => assertSucceeds(ref({})));
  it('http link denied', () => assertFails(ref({ url: 'http://example.org' })));
  it('javascript url denied', () => assertFails(ref({ url: 'javascript:alert(1)' })));
  it('link with data denied', () => assertFails(ref({ data: '<svg/>' })));
  it('vector ref accepted', () => assertSucceeds(ref({ kind: 'vector', url: null, data: '<svg/>' })));
  it('vector over 250000 chars denied', () => assertFails(ref({ kind: 'vector', url: null, data: 'x'.repeat(250001) })));
  it('title over 120 chars denied', () => assertFails(ref({ title: 'x'.repeat(121) })));
});

describe('activity', () => {
  it('member writes own activity', () => assertSucceeds(setDoc(doc(db('m1'), 'activity/a1'), activity('m1', 'P1'))));
  it('forged actor denied', () => assertFails(setDoc(doc(db('m1'), 'activity/a1'), { ...activity('m1', 'P1'), actorUid: 'u-m2' })));
  it('forged initials denied', () => assertFails(setDoc(doc(db('m1'), 'activity/a1'), activity('m1', 'P2'))));
  it('backdated activity denied', () => assertFails(setDoc(doc(db('m1'), 'activity/a1'), { ...activity('m1', 'P1'), at: ts })));
  it('activity cannot be updated', async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'activity/a2'), { ...activity('m1', 'P1'), at: ts }));
    await assertFails(updateDoc(doc(db('m1'), 'activity/a2'), { summary: 'x' }));
  });
  it('member cannot delete activity', async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'activity/a2'), { ...activity('m1', 'P1'), at: ts }));
    await assertFails(deleteDoc(doc(db('m1'), 'activity/a2')));
  });
  it('admin purges activity', async () => {
    await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'activity/a2'), { ...activity('m1', 'P1'), at: ts }));
    await assertSucceeds(deleteDoc(doc(db('admin'), 'activity/a2')));
  });
  it('admin without allowlist entry signs as ADM', () =>
    assertSucceeds(setDoc(doc(db('admin'), 'activity/a1'), activity('admin', 'ADM', { targetKind: 'team' }))));
});

describe('admin', () => {
  it('reads soft-deleted module', () => assertSucceeds(getDoc(doc(db('admin'), 'modules/mDel'))));
  it('unfiltered module query works', () => assertSucceeds(getDocs(collection(db('admin'), 'modules'))));
  it('assigns a leader to someone else', () =>
    assertSucceeds(updateDoc(doc(db('admin'), 'modules/mB'), { leaderUid: 'u-m2', leaderInitials: 'P2', ...audit('admin') })));
  it('sets tier and order', () => assertSucceeds(updateDoc(doc(db('admin'), 'modules/mB'), { tier: 2, order: 4, ...audit('admin') })));
  it('soft-deletes and restores', async () => {
    await assertSucceeds(updateDoc(doc(db('admin'), 'modules/mB'), { deletedAt: serverTimestamp(), ...audit('admin') }));
    await assertSucceeds(updateDoc(doc(db('admin'), 'modules/mB'), { deletedAt: null, ...audit('admin') }));
  });
  it('hard-deletes a module', () => assertSucceeds(deleteDoc(doc(db('admin'), 'modules/mDel'))));
  it('hard-deletes a slug', () => assertSucceeds(deleteDoc(doc(db('admin'), 'slugs/intake-ramp'))));
  it('writes the allowlist', () =>
    assertSucceeds(setDoc(doc(db('admin'), 'allowlist/new@test.example'), { role: 'member', initials: 'P3', addedBy: 'u-admin', addedAt: serverTimestamp() })));
  it('allowlist rejects bad role', () =>
    assertFails(setDoc(doc(db('admin'), 'allowlist/new@test.example'), { role: 'admin', initials: 'P3', addedBy: 'u-admin', addedAt: serverTimestamp() })));
  it('allowlist rejects uppercase email id', () =>
    assertFails(setDoc(doc(db('admin'), 'allowlist/New@test.example'), { role: 'member', initials: 'P3', addedBy: 'u-admin', addedAt: serverTimestamp() })));
  it('member cannot write the allowlist', () =>
    assertFails(setDoc(doc(db('m1'), 'allowlist/new@test.example'), { role: 'member', initials: 'P3', addedBy: 'u-m1', addedAt: serverTimestamp() })));
  it('member reads own allowlist entry', () => assertSucceeds(getDoc(doc(db('m1'), 'allowlist/member1@test.example'))));
  it('writes config', () => assertSucceeds(setDoc(doc(db('admin'), 'config/app'), { staleDays: 10, lastBackupAt: serverTimestamp() })));
  it('config rejects staleDays 0', () => assertFails(setDoc(doc(db('admin'), 'config/app'), { staleDays: 0, lastBackupAt: null })));
  it('member cannot write config', () => assertFails(setDoc(doc(db('m1'), 'config/app'), { staleDays: 10, lastBackupAt: null })));
  it('reads access requests', () => assertSucceeds(getDocs(collection(db('admin'), 'accessRequests'))));
  it('member cannot list access requests', () => assertFails(getDocs(collection(db('m1'), 'accessRequests'))));
  it('deletes an access request', () => assertSucceeds(deleteDoc(doc(db('admin'), 'accessRequests/u-out'))));
  it('reads any user profile', () => assertSucceeds(getDoc(doc(db('admin'), 'users/u-m1'))));
  it('admin cannot file an access request', () =>
    assertFails(setDoc(doc(db('admin'), 'accessRequests/u-admin'), { email: 'admin@test.example', displayName: 'A', requestedAt: serverTimestamp() })));
});
