import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-async-feedback.html';

test('keyboard error announces a friendly recovery and preserves input', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const input = page.locator('#savedInput');
  const button = page.locator('#keyboardErrorButton');
  const status = page.locator('#spnReworkStatusV2');
  const announcer = page.locator('#navAsyncFeedbackAnnouncer');

  await input.fill('Пользовательский комментарий не должен исчезнуть');
  await button.focus();
  await page.keyboard.press('Enter');

  await expect(status).toHaveAttribute('role', 'alert');
  await expect(status).toHaveAttribute('data-nav-async-state', 'error');
  await expect(status).toContainText('Введённые данные сохранены');
  await expect(status).not.toContainText(/JWT|RPC|unauthorized/i);
  await expect(status).toBeFocused();
  await expect(input).toHaveValue('Пользовательский комментарий не должен исчезнуть');
  await expect(button).toBeEnabled();

  await expect(announcer).toHaveAttribute('role', 'alert');
  await expect(announcer).toHaveAttribute('aria-live', 'assertive');
  await expect(announcer).toContainText('Повторите действие той же кнопкой');
  await expectNoRuntimeFailures(failures, testInfo, 'async-feedback-keyboard-error');
});

test('pointer error does not steal focus', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const button = page.locator('#pointerErrorButton');
  const status = page.locator('#spnReworkStatusV2');
  await button.click();

  await expect(status).toHaveAttribute('data-nav-async-state', 'error');
  await expect(status).not.toBeFocused();
  await expect(button).toBeEnabled();
  await expectNoRuntimeFailures(failures, testInfo, 'async-feedback-pointer-error');
});

test('success marks only an allowlisted server confirmation target', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await openPage(page, fixture);

  const button = page.locator('#successButton');
  const status = page.locator('#lawyerDocumentStatusV2');
  await button.click();

  await expect(status).toHaveAttribute('data-nav-async-state', 'success');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#lawyerDocumentCycleV2');
  await expect(page.locator('#navAsyncFeedbackAnnouncer')).toHaveAttribute('role', 'status');
  expect(requests.some((url) => url.includes('supabase.co') || url.includes('/rest/v1/') || url.includes('/functions/v1/'))).toBe(false);
  await expectNoRuntimeFailures(failures, testInfo, 'async-feedback-success');
});

test('confirmed reload focuses the server result once', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}#dealCompletionEvidenceV2`);

  const result = page.locator('#dealCompletionEvidenceV2');
  await expect(result).toBeFocused();
  await expect(result).toHaveAttribute('role', 'status');
  await expect(result).toHaveAttribute('aria-label', 'Подтверждённый результат и следующий шаг');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');

  await page.evaluate(() => {
    document.activeElement?.blur();
    window.dispatchEvent(new Event('nav-test-rerender'));
  });
  await expect(result).not.toBeFocused();
  await expectNoRuntimeFailures(failures, testInfo, 'async-feedback-confirmed-focus');
});
