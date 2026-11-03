import { test as base, expect, type Page, type Browser } from '@playwright/test';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import sample from '../../src/seed/sample.json' with { type: 'json' };

let env: RulesTestEnvironment | null = null;
export async function testEnv() {
  env ??= await initializeTestEnvironment({
    projectId: 'demo-greenmech',
    firestore: { rules: readFileSync('tests/rules/.test.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  return env;
}
const ts = Timestamp.now();
export const TEAM = {
  'member1@test.example': { role: 'member', initials: 'P1' },
  'member2@test.example': { role: 'member', initials: 'P2' },
  'coach@test.example': { role: 'coach', initials: 'C1' },
  'admin@test.example': { role: 'member', initials: 'JY' },
} as const;

/** Wipes Firestore and Auth, then seeds the team and (optionally) the sample structure or N generated modules. */
export async function seed(opts: { sample?: boolean; count?: number } = {}) {
  const e = await testEnv();
  await e.clearFirestore();
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-greenmech/accounts', { method: 'DELETE' });
  await e.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore() as unknown as import('firebase/firestore').Firestore;
    for (const [email, v] of Object.entries(TEAM)) await setDoc(doc(f, 'allowlist', email), { ...v, addedBy: 'seed', addedAt: ts });
    await setDoc(doc(f, 'config/app'), { staleDays: 7, lastBackupAt: ts });
    const b = writeBatch(f);
    const mod = (id: string, slug: string, status: number, tier: number, order: number, ports = { in: 'none', out: 'none' }, purpose = '') => {
      b.set(doc(f, 'modules', id), {
        slug,
        status,
        tier,
        order,
        purpose,
        hasModel: false,
        ports,
        leaderUid: null,
        leaderInitials: null,
        createdAt: ts,
        createdBy: 'seed',
        updatedAt: ts,
        updatedBy: 'seed',
        deletedAt: null,
      });
      b.set(doc(f, 'slugs', slug), { kind: 'module', refId: id });
    };
    if (opts.sample) {
      const s = sample as unknown as {
        tiers: string[][];
        modules: Record<string, { status: number; in: string; out: string; purpose: string }>;
        connections: string[][];
      };
      s.tiers.forEach((row, t) =>
        row.forEach((slug, o) => {
          const d = s.modules[slug];
          mod(`m-${slug}`, slug, d.status, t, o, { in: d.in, out: d.out }, d.purpose);
        }),
      );
      for (const [slug, a, c] of s.connections) {
        const id = `m-${a}__m-${c}`;
        b.set(doc(f, 'connections', id), {
          slug,
          aId: `m-${a}`,
          bId: `m-${c}`,
          state: 1,
          createdAt: ts,
          createdBy: 'seed',
          updatedAt: ts,
          updatedBy: 'seed',
          deletedAt: null,
        });
        b.set(doc(f, 'slugs', slug), { kind: 'connection', refId: id });
      }
    }
    for (let i = 0; i < (opts.count ?? 0); i++) mod(`g${i}`, `generated-module-number-${i}`, i % 4, Math.floor(i / 6), i % 6);
    await b.commit();
  });
}

export async function signIn(page: Page, email: string, path = '/') {
  await page.goto('/signin');
  await page.getByLabel('Emulator fixture email').fill(email);
  await page.getByRole('button', { name: 'Sign in as fixture' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/signin'));
  if (path !== '/') await page.goto(path);
  await expect(page.locator('main')).not.toContainText('Loading modules', { timeout: 15000 });
}
export async function newUser(browser: Browser, email: string, path = '/', viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, baseURL: 'http://127.0.0.1:4173' });
  const page = await ctx.newPage();
  await signIn(page, email, path);
  return page;
}
export const test = base;
export { expect };
