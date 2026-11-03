import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, seed, signIn, newUser } from './fixtures';

const M1 = 'member1@test.example',
  M2 = 'member2@test.example',
  ADMIN = 'admin@test.example',
  COACH = 'coach@test.example';
const phone = () => test.info().project.name === 'phone';
const vp = () => (phone() ? { width: 390, height: 844 } : { width: 1440, height: 900 });
const bay = (p: Page, slug: string) => p.locator(`[data-bay="m-${slug}"]`);

test('2 connections: labels never cover bays; bays hit-test', async ({ page }) => {
  test.skip(phone(), 'desktop only');
  await seed({ sample: true });
  await signIn(page, M1, '/connections');
  await expect(page.locator('[data-bay]').first()).toBeVisible();
  const lines = page.locator('[data-line]');
  const n = await lines.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    await lines.nth(i).locator('.gm-line-hit').hover({ force: true });
    const hits = await page.evaluate(() => {
      const bays = [...document.querySelectorAll('[data-bay]')].map((b) => b.getBoundingClientRect());
      return [...document.querySelectorAll('[data-label]')].filter((l) => {
        const r = l.getBoundingClientRect();
        return bays.some((b) => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top);
      }).length;
    });
    expect(hits, `line ${i}`).toBe(0);
  }
  await page.mouse.move(0, 0);
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll('[data-bay]')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(e && (e === b || b.contains(e)));
      })
      .map((b) => b.getAttribute('data-bay')),
  );
  expect(bad).toEqual([]);
});

async function setDark(page: Page) {
  await page.getByRole('button', { name: 'Account and settings' }).click();
  await page.getByRole('radio', { name: 'Dark' }).check({ force: true });
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}
for (const dark of [false, true]) {
  test(`3 axe and opacity (${dark ? 'dark' : 'light'})`, async ({ page }) => {
    test.setTimeout(90000);
    // BUG: Elevation.tsx Bay aria-label does not contain visible text (label-content-name-mismatch on some bays at 1440)
    await seed({ sample: true });
    await signIn(page, M1);
    if (dark) await setDark(page);
    for (const path of ['/', '/connections', '/m/lift-arm', '/monitor', '/help']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0]).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        bad.map(
          (v) =>
            `${v.id}: ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(' '))
              .join(' | ')}`,
        ),
        path,
      ).toEqual([]);
      const faded = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter((el) => {
            if (el.closest('svg') || el instanceof SVGElement) return false;
            const hasText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim());
            return hasText && Number(getComputedStyle(el).opacity) < 1;
          })
          .map((el) => `${el.tagName}.${el.className}`),
      );
      expect(faded, `opacity on ${path}`).toEqual([]);
    }
  });
}

test('4 every line has an arrow marker and count matches list', async ({ page }) => {
  test.skip(phone(), 'desktop only');
  await seed({ sample: true });
  await signIn(page, M1, '/connections');
  const lines = page.locator('[data-line]');
  await expect(lines.first()).toBeAttached();
  const paths = page.locator('[data-line] .gm-line-path');
  const c = await paths.count();
  for (let i = 0; i < c; i++) await expect(paths.nth(i)).toHaveAttribute('marker-end', /.+/);
  await expect(lines).toHaveCount(await page.locator('.gm-connlist li').count());
});

test('5 connection badges', async ({ page }) => {
  await seed({ sample: true });
  await signIn(page, M1, '/connections');
  const gl = page.locator('.gm-connlist li', { hasText: 'gear-lift' });
  await expect(gl.getByText('Locked')).toBeVisible();
  await expect(gl.getByText('Adapter needed')).toBeVisible();
  const rf = page.locator('.gm-connlist li', { hasText: 'ramp-feed' });
  await expect(rf.getByText('Ready', { exact: true })).toBeVisible();
  await expect(rf.locator('.gm-badge svg.gm-icon')).toBeVisible();
});

test('6 phone list default and drawing toggle', async ({ page }) => {
  test.skip(!phone(), 'phone only');
  await seed({ sample: true });
  await signIn(page, M1);
  await expect(page.locator('[data-row]').first()).toBeVisible();
  await expect(page.locator('[data-bay]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Drawing' }).click();
  await expect(page.getByText('Scroll sideways to see all tiers')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('7 phone touch targets', async ({ page }) => {
  test.skip(!phone(), 'phone only');
  await seed({ sample: true });
  await signIn(page, M1);
  for (const path of ['/', '/m/lift-arm']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, input, select, [role=tab]')]
        .filter((el) => {
          if (el.closest('p') || el.classList.contains('gm-sr')) return false;
          const r = el.getBoundingClientRect(),
            cs = getComputedStyle(el);
          if (!r.width || !r.height || cs.visibility === 'hidden') return false;
          if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
            const l = el.closest('label')?.getBoundingClientRect();
            if (l && l.width >= 44 && l.height >= 44) return false;
          }
          return r.width < 43.5 || r.height < 43.5;
        })
        .map(
          (el) =>
            `${el.tagName}.${el.className} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`,
        ),
    );
    expect(small, path).toEqual([]);
  }
});

test('8 toast stays in viewport on a long page', async ({ page }) => {
  await seed({ sample: true });
  await signIn(page, M1, '/m/lift-arm');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByLabel('Add an idea').fill('use a cam');
  await page
    .locator('form.gm-addline', { has: page.getByLabel('Add an idea') })
    .getByRole('button', { name: 'Add' })
    .click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Take it' }).first().click();
  const t = page.locator('[data-toast]').last();
  await expect(t).toBeVisible();
  await page.waitForTimeout(700); // let the entry animation settle
  const box = (await t.boundingBox())!;
  const v = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(v.height);
  expect(box.x + box.width).toBeLessThanOrEqual(v.width);
});

test('9a undo reports conflict after admin changes status', async ({ page, browser }) => {
  await seed({ sample: true });
  await signIn(page, M1, '/m/lift-arm');
  await page.getByRole('button', { name: 'Take it' }).first().click();
  await expect(page.locator('[data-toast]')).toContainText('You lead lift-arm now');
  const admin = await newUser(browser, ADMIN, '/m/lift-arm', vp());
  await admin.getByRole('radio', { name: 'Planning' }).click();
  await expect(admin.getByRole('radio', { name: 'Planning' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Planning' })).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-toast]').first().getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-toast]')).toContainText("changed this since. Can't undo");
  await admin.context().close();
});

test('9b undo of rename keeps page on lift-arm', async ({ page }) => {
  await seed({ sample: true });
  await signIn(page, M1, '/m/lift-arm');
  await page.getByRole('button', { name: 'Take it' }).first().click();
  await page.getByRole('button', { name: 'Rename module' }).click();
  await page.getByLabel('New name').fill('lift-arm-two');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.locator('h1')).toContainText('lift-arm-two');
  await page.locator('[data-toast]').last().getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('h1')).toHaveText('lift-arm');
  await expect(page).toHaveURL(/\/m\/lift-arm$/);
});

test('11 legend above drawing and filtering', async ({ page }) => {
  test.skip(phone(), 'desktop only');
  await seed({ sample: true });
  await signIn(page, M1);
  const lg = (await page.locator('.gm-legend').boundingBox())!;
  const first = (await page.locator('[data-bay]').first().boundingBox())!;
  expect(lg.y + lg.height).toBeLessThan(first.y);
  for (const c of await page.locator('.gm-legend .gm-chip').all())
    expect(parseFloat(await c.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
  const b = page.locator('.gm-legend').getByRole('button', { name: 'Building' });
  await b.click();
  await expect(b).toHaveAttribute('aria-pressed', 'true');
  await expect(bay(page, 'intake-ramp')).toHaveClass(/gm-bay-dim/);
  await expect(bay(page, 'lift-arm')).not.toHaveClass(/gm-bay-dim/);
});

test('13 add module form', async ({ page }) => {
  await seed({ sample: true });
  await signIn(page, M1);
  await page.getByRole('button', { name: 'Add module' }).click();
  const name = page.getByLabel('Name', { exact: true });
  await name.fill('x'.repeat(33));
  await expect(name).toHaveAttribute('maxlength', '32');
  await expect(page.locator('#gm-add-count')).toBeVisible();
  await name.fill('Bad Slug!');
  await page.getByRole('button', { name: 'Add module' }).last().click();
  await expect(page.locator('#gm-add-err')).not.toBeEmpty();
  await name.fill('fresh-idea');
  await page.getByRole('button', { name: 'Add module' }).last().click();
  if (phone()) {
    const row = page.locator('[data-row="' + 'x' + '"]');
    void row;
    const sec = page.locator('section[aria-label="Unplaced"]');
    await expect(sec).toContainText('fresh-idea');
    await expect(sec).toContainText('no lead');
  } else {
    const sec = page.locator('section[aria-label="Unplaced modules"]');
    await expect(sec).toContainText('fresh-idea');
    await expect(sec).toContainText('no lead');
  }
});

test('14 dark screenshots', async ({ page }) => {
  await seed({ sample: true });
  await signIn(page, M1);
  await setDark(page);
  await page.screenshot({ path: `test-results/dark-${test.info().project.name}.png`, fullPage: true });
});

test('17 help panel and page', async ({ page }) => {
  await seed({ sample: true });
  await signIn(page, M1);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();
  await page.goto('/help');
  await expect(page.locator('h1')).toBeVisible();
});

test('18 thirty modules: slugs not clipped', async ({ page }) => {
  await seed({ count: 30 });
  await signIn(page, M1);
  if (phone()) await page.getByRole('button', { name: 'Drawing' }).click();
  const bays = page.locator('[data-bay]');
  await expect(bays).toHaveCount(30);
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.gm-bay-slug')].filter((s) => s.scrollWidth > s.clientWidth).map((s) => s.textContent),
  );
  expect(clipped).toEqual([]);
  if (!phone()) for (const b of await bays.all()) await expect(b).toBeVisible();
});

test('19 slug font weight 500', async ({ page }) => {
  await seed({ sample: true });
  await signIn(page, M1);
  const w = (l: ReturnType<Page['locator']>) => l.first().evaluate((e) => getComputedStyle(e).fontWeight);
  expect(await w(page.locator('h1 .gm-slug'))).toBe('500');
  if (phone()) expect(await w(page.locator('[data-row] .gm-slug'))).toBe('500');
  else expect(await w(page.locator('.gm-slug'))).toBe('500');
});

test('20 keyboard focus ring on bay', async ({ page }) => {
  test.skip(phone(), 'desktop only');
  await seed({ sample: true });
  await signIn(page, M1);
  await page.locator('#gm-search').focus();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.hasAttribute('data-bay'))) break;
  }
  const f = page.locator('[data-bay]:focus');
  await expect(f).toBeVisible();
  const s = await f.evaluate((e) => {
    const c = getComputedStyle(e);
    return [c.outlineStyle, c.outlineWidth];
  });
  expect(s).toEqual(['solid', '2px']);
});

test('21 live leader initials across contexts', async ({ page, browser }) => {
  test.skip(phone(), 'desktop only');
  await seed({ sample: true });
  await signIn(page, M1);
  const p2 = await newUser(browser, M2, '/');
  await bay(page, 'intake-ramp').click();
  await page.locator('[data-sheet]').getByRole('button', { name: 'Take it' }).click();
  await expect(bay(p2, 'intake-ramp').locator('.gm-initials')).toHaveText('P1', { timeout: 8000 });
  await p2.context().close();
});

test('12a coach is read-only; outsider blocked', async ({ page, browser }) => {
  await seed({ sample: true });
  await signIn(page, COACH, '/m/lift-arm');
  await expect(page.getByRole('button', { name: 'Take it' })).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add module' })).toHaveCount(0);
  const o = await browser.newContext({ viewport: vp(), baseURL: 'http://127.0.0.1:4173' });
  const op = await o.newPage();
  await op.goto('/signin');
  await op.getByLabel('Emulator fixture email').fill('outsider@test.example');
  await op.getByRole('button', { name: 'Sign in as fixture' }).click();
  await expect(op.getByRole('heading', { name: 'Not on the team list' })).toBeVisible();
  await o.close();
});

test('10 remove connection is admin only', async ({ page, browser }) => {
  test.skip(phone(), 'desktop only');
  await seed({ sample: true });
  await signIn(page, ADMIN, '/c/ramp-feed');
  await expect(page.getByRole('button', { name: 'Remove connection' })).toBeVisible();
  const m = await newUser(browser, M1, '/c/ramp-feed');
  await expect(m.getByRole('heading', { name: /Connection/ })).toBeVisible();
  await expect(m.getByRole('button', { name: 'Remove connection' })).toHaveCount(0);
  await m.context().close();
});
