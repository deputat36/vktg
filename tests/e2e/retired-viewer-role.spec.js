import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-retired-viewer-role.html';

async function openFixture(page) {
  await openPage(page, fixture);
  await expect(page.locator('#newRole')).toBeVisible();
  await expect(page.locator('[data-role="legacy-viewer"]')).toBeVisible();
}

test('new profiles no longer offer the viewer role', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openFixture(page);

  await expect(page.locator('#newRole option[value="viewer"]')).toHaveCount(0);
  await expect(page.locator('#newRole')).toHaveValue('spn');
  await expectNoRuntimeFailures(failures, testInfo, 'retired-viewer-new-profile');
});

test('legacy viewer stays visible only long enough to select a working role', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openFixture(page);

  const select = page.locator('[data-role="legacy-viewer"]');
  const legacyOption = select.locator('option[value="viewer"]');
  await expect(select).toHaveValue('viewer');
  await expect(legacyOption).toBeDisabled();
  await expect(legacyOption).toContainText('устаревшая роль');
  await expect(page.locator('[data-retired-role-hint]')).toContainText('роль больше не назначается');

  await select.selectOption('spn');
  await expect(select).toHaveValue('spn');
  await expect(select.locator('option[value="viewer"]')).toHaveCount(0);
  await expect(page.locator('[data-retired-role-hint]')).toHaveCount(0);
  await expectNoRuntimeFailures(failures, testInfo, 'retired-viewer-legacy-transition');
});

test('manual viewer injection is blocked before the profile save handler', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openFixture(page);

  await page.evaluate(() => {
    const select = document.getElementById('newRole');
    const option = document.createElement('option');
    option.value = 'viewer';
    option.textContent = 'Наблюдатель';
    option.selected = true;
    select.appendChild(option);
  });

  await page.locator('#addUser').click();
  await expect(page.locator('#adminStatus')).toHaveClass(/error/);
  await expect(page.locator('#adminStatus')).toContainText('больше не назначается');
  await expect(page.locator('#newRole')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.fixtureSaveCount)).toBe(0);
  await expectNoRuntimeFailures(failures, testInfo, 'retired-viewer-manual-injection');
});
