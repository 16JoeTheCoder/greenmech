import { test, expect, seed, signIn } from './fixtures';

test('app shell and modules load offline after the first visit', async ({ page, context }) => {
  test.skip(test.info().project.name === 'phone', 'one viewport is enough');
  await seed({ sample: true });
  await signIn(page, 'member1@test.example');
  await expect(page.locator('[data-bay]').first()).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the service worker control the page and precache
  await expect(page.locator('[data-bay]').first()).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Greenmech' })).toBeVisible();
  await expect(page.locator('[data-bay]').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.gm-sync')).toContainText('Offline');
  // fonts and icons are local: no request left the origin
  const external = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => !n.startsWith(location.origin) && !n.includes('127.0.0.1')));
  expect(external).toEqual([]);
});
