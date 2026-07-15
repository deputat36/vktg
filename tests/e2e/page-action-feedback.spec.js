import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-page-action-feedback.html';

function status(page) {
  return page.locator('#pageStatus');
}

test('busy phase is a polite atomic live status with busy state', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  const trigger = page.locator('#showBusy');
  await trigger.click();
  await expect(status(page)).toHaveAttribute('role', 'status');
  await expect(status(page)).toHaveAttribute('aria-live', 'polite');
  await expect(status(page)).toHaveAttribute('aria-atomic', 'true');
  await expect(status(page)).toHaveAttribute('aria-busy', 'true');
  await expect(status(page)).toHaveAttribute('data-nav-action-feedback-phase', 'busy');
  await expect(status(page)).toContainText('Сохраняю действие');
  await expect(trigger).toBeFocused();
  await expectNoRuntimeFailures(failures, testInfo, 'page-action-feedback-busy');
});

test('success reuses the same polite status and clears busy state', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  const original = status(page);
  await page.locator('#showBusy').click();
  await page.locator('#showSuccess').click();
  await expect(original).toHaveCount(1);
  await expect(page.locator('#pageStatus')).toHaveCount(1);
  await expect(original).toHaveAttribute('role', 'status');
  await expect(original).toHaveAttribute('aria-live', 'polite');
  await expect(original).toHaveAttribute('aria-busy', 'false');
  await expect(original).toHaveAttribute('data-nav-action-feedback-phase', 'success');
  await expect(original).toContainText('Действие сохранено');
  await expectNoRuntimeFailures(failures, testInfo, 'page-action-feedback-success');
});

test('error becomes assertive alert without moving focus', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  const trigger = page.locator('#showError');
  await trigger.click();
  await expect(status(page)).toHaveAttribute('role', 'alert');
  await expect(status(page)).toHaveAttribute('aria-live', 'assertive');
  await expect(status(page)).toHaveAttribute('aria-busy', 'false');
  await expect(status(page)).toHaveAttribute('data-nav-action-feedback-phase', 'error');
  await expect(status(page)).toContainText('Не удалось сохранить');
  await expect(trigger).toBeFocused();
  await expect(status(page)).not.toHaveAttribute('tabindex', /.+/);
  await expectNoRuntimeFailures(failures, testInfo, 'page-action-feedback-error');
});

test('repeated transitions never create duplicate live regions', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  for (let index = 0; index < 3; index += 1) {
    await page.locator('#showBusy').click();
    await page.locator('#showError').click();
    await page.locator('#showIdle').click();
  }
  await expect(page.locator('#pageStatus')).toHaveCount(1);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expect(status(page)).toHaveAttribute('role', 'status');
  await expect(status(page)).toHaveAttribute('aria-busy', 'false');
  await expect(status(page)).toHaveAttribute('data-nav-action-feedback-phase', 'idle');
  await expectNoRuntimeFailures(failures, testInfo, 'page-action-feedback-repeat');
});
