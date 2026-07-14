import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const guestPages = [
  '/nav-v2.html?clean=1',
  '/dashboard-v2.html',
  '/deals-v2.html',
  '/queue-v2.html',
  '/manager-v2.html',
  '/task-review-v2.html',
  '/broker-v2.html',
  '/viewer-v2.html',
  '/admin-v2.html',
  '/operational-pilot-decision-v2.html',
  '/operational-pilot-decision-validation-v2.html',
  '/operational-pilot-action-checklist-v2.html',
  '/operational-pilot-start-confirmation-v2.html',
  '/operational-pilot-responsible-acknowledgement-v2.html',
  '/operational-duplicate-review-v2.html'
];

for (const path of guestPages) {
  test(`guest gate loads without browser errors: ${path}`, async ({ page }, testInfo) => {
    const failures = captureRuntimeFailures(page);
    await openPage(page, path);
    await expect(page.locator('#navEmail')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#navPassword')).toBeVisible();
    await expect(page.locator('#navLogin')).toBeVisible();
    await expectNoRuntimeFailures(failures, testInfo, path.replaceAll('/', '_'));
  });
}
