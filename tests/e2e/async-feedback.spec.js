import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures } from './helpers.mjs';

const FIXTURE = '/tests/fixtures/nav-v2-async-feedback.html';

async function openFixture(page, suffix = '') {
  const response = await page.goto(`${FIXTURE}${suffix}`, { waitUntil: 'domcontentloaded' });
  expect(response, 'No response for async feedback fixture').not.toBeNull();
  expect(response.status()).toBeLessThan(400);
}

test('keyboard error is announced and focused without losing entered text', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openFixture(page);

  const button = page.locator('#spnError');
  const status = page.locator('#spnReworkStatusV2');
  await button.focus();
  await page.keyboard.press('Enter');

  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toHaveAttribute('aria-busy', 'true');
  await expect(status).toContainText('Выполняю серверное действие');
  await expect(status).toHaveAttribute('role', 'alert');
  await expect(status).toHaveAttribute('aria-live', 'assertive');
  await expect(status).toHaveAttribute('aria-busy', 'false');
  await expect(status).toBeFocused();
  await expect(page.locator('#spnInput')).toHaveValue('Введённый текст должен сохраниться');

  await expectNoRuntimeFailures(failures, testInfo, 'async-feedback-keyboard-error');
});

test('pointer error is announced without forced focus', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openFixture(page);

  const button = page.locator('#spnError');
  const status = page.locator('#spnReworkStatusV2');
  await button.click();
  await expect(status).toHaveAttribute('role', 'alert');
  await expect(status).toHaveAttribute('aria-live', 'assertive');
  await expect(status).not.toBeFocused();
  await expect(page.locator('#spnInput')).toHaveValue('Введённый текст должен сохраниться');

  await expectNoRuntimeFailures(failures, testInfo, 'async-feedback-pointer-error');
});

test('success publishes enum-only reload focus request', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openFixture(page);

  const status = page.locator('#spnReworkStatusV2');
  await page.locator('#spnSuccess').click();
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => new URL(page.url()).searchParams.get('nav_focus')).toBe('spn-submitted');
  expect(page.url()).not.toContain('Введённый');
  expect(page.url()).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);

  await expectNoRuntimeFailures(failures, testInfo, 'async-feedback-success-token');
});

test('post-reload focus lands on confirmed workflow and cleans URL', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openFixture(page, '?nav_focus=spn-submitted');

  const target = page.locator('#spnReworkWorkflowV2');
  await expect(target).toBeFocused({ timeout: 2_000 });
  await expect(target).toHaveAttribute('tabindex', '-1');
  await expect.poll(() => new URL(page.url()).searchParams.has('nav_focus')).toBe(false);

  await expectNoRuntimeFailures(failures, testInfo, 'async-feedback-post-reload-focus');
});
