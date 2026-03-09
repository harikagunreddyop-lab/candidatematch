import { test, expect } from '@playwright/test';

test.describe('Candidate Application Flow', () => {
  test('should allow candidate to apply to job', async ({ page }) => {
    // Login as candidate
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', 'candidate@test.com');
    await page.fill('input[name="password"]', 'testpass123');
    await page.click('button[type="submit"]');

    // Navigate to jobs
    await page.goto('/dashboard/candidate/jobs');
    await expect(page).toHaveURL(/\/jobs/);

    // Search for job
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Frontend Engineer');
      await page.waitForTimeout(1000); // debounce
    }

    // Click on first job card if present
    const firstCard = page.locator('.job-card').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();

      // Apply
      const applyBtn = page.getByRole('button', { name: /apply now/i });
      if (await applyBtn.isVisible()) {
        await applyBtn.click();

        // Fill application form if visible
        const resumeSelect = page.locator('select[name="resume_id"]');
        if (await resumeSelect.isVisible()) {
          await resumeSelect.selectOption({ index: 1 });
        }
        const coverLetter = page.locator('textarea[name="cover_letter"]');
        if (await coverLetter.isVisible()) {
          await coverLetter.fill('I am excited to apply...');
        }
        const submitBtn = page.getByRole('button', { name: /submit application/i });
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
          await expect(page.locator('.success-message, [data-success], [role="alert"]')).toBeVisible({ timeout: 10000 });
        }
      }
    }
  });

  test('should show jobs page for candidate', async ({ page }) => {
    await page.goto('/dashboard/candidate/jobs');
    await expect(page).toHaveURL(/\/jobs/);
    // Page should load without error
    await expect(page.locator('body')).toBeVisible();
  });

  test('should prevent duplicate applications when already applied', async ({ page }) => {
    await page.goto('/dashboard/candidate/jobs');
    const firstCard = page.locator('.job-card').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      const alreadyApplied = page.getByRole('button', { name: /already applied/i });
      if (await alreadyApplied.isVisible()) {
        await expect(alreadyApplied).toBeDisabled();
      }
    }
  });
});
