import { test, expect, seed, signIn } from './fixtures';
test('member sees modules', async ({ page }) => {
  await seed({ sample: true });
  await signIn(page, 'member1@test.example');
  await expect(page.locator('h1')).toContainText('in development');
  await page.screenshot({ path: `test-results/shot-${test.info().project.name}-modules.png`, fullPage: true });
  await page.goto('/m/lift-arm');
  await expect(page.locator('h1')).toContainText('lift-arm');
  await page.screenshot({ path: `test-results/shot-${test.info().project.name}-module.png`, fullPage: true });
  await page.goto('/connections');
  await expect(page.getByRole('heading', { name: 'All connections' })).toBeVisible();
  await page.screenshot({ path: `test-results/shot-${test.info().project.name}-conns.png`, fullPage: true });
});
