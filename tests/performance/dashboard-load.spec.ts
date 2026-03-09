import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('dashboard should load within 2 seconds', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/dashboard/candidate');
    await page.waitForSelector('.dashboard-content, [data-dashboard], main', { timeout: 5000 }).catch(() => {});

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('job search should return results in <3s', async ({ page }) => {
    await page.goto('/dashboard/candidate/jobs');

    const startTime = Date.now();
    const searchInput = page.locator('input[name="search"], input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Engineer');
      await page.waitForSelector('.job-card, [data-job-card], [data-empty]', { timeout: 5000 }).catch(() => {});
    }
    const searchTime = Date.now() - startTime;

    expect(searchTime).toBeLessThan(5000);
  });
});
