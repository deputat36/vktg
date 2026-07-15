import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-sensitive-free-text-guard.html';

async function count(page, key) {
  return page.evaluate((name) => window.fixtureCounts[name], key);
}

async function expectBlockedField(field, labelPattern) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-errormessage', /navSensitiveFreeTextError\d+/);
  const errorId = await field.getAttribute('aria-errormessage');
  await expect(field.page().locator(`#${errorId}`)).toBeVisible();
  await expect(field.page().locator(`#${errorId}`)).toContainText(labelPattern);
}

test('comment save is blocked for phone and allowed after correction', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  const field = page.locator('#newComment');
  await field.fill('Позвонить клиенту +7 (903) 857-67-10 после 17:00');
  await expectBlockedField(field, 'телефон клиента');
  await page.locator('#addComment').click();
  await expect.poll(() => count(page, 'comment')).toBe(0);
  await expect(field).toBeFocused();

  await field.fill('Позвонить клиенту после 17:00 и уточнить готовность документов');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await page.locator('#addComment').click();
  await expect.poll(() => count(page, 'comment')).toBe(1);
  await expectNoRuntimeFailures(failures, testInfo, 'sensitive-comment-guard');
});

test('dialog form preserves text and blocks passport, SNILS and email', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  const field = page.locator('#decisionNote');
  const sensitive = 'Паспорт 1234 567890, СНИЛС 123-456-789 01, email client@example.ru';
  await field.fill(sensitive);
  await page.locator('#decisionForm button[type="submit"]').click();
  await expect.poll(() => count(page, 'form')).toBe(0);
  await expect(field).toHaveValue(sensitive);
  await expectBlockedField(field, /серия и номер паспорта/);
  const errorId = await field.getAttribute('aria-errormessage');
  const message = page.locator(`#${errorId}`);
  await expect(message).toContainText('СНИЛС');
  await expect(message).toContainText('email клиента');
  await expect(message).not.toContainText('client@example.ru');

  await field.fill('Документ получен, требуется проверить читаемость подписи');
  await page.locator('#decisionForm button[type="submit"]').click();
  await expect.poll(() => count(page, 'form')).toBe(1);
  await expectNoRuntimeFailures(failures, testInfo, 'sensitive-dialog-guard');
});

test('wizard draft and final save are blocked for a valid bank-card number', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  const field = page.locator('#wizardNote');
  await field.fill('Перевести на карту 4111 1111 1111 1111');
  await page.locator('#saveDraft').click();
  await expect.poll(() => count(page, 'draft')).toBe(0);
  await page.locator('#saveDeal').click();
  await expect.poll(() => count(page, 'save')).toBe(0);
  await expectBlockedField(field, 'номер банковской карты');

  await field.fill('Согласовать способ расчёта с юристом и сторонами');
  await page.locator('#saveDraft').click();
  await page.locator('#saveDeal').click();
  await expect.poll(() => count(page, 'draft')).toBe(1);
  await expect.poll(() => count(page, 'save')).toBe(1);
  await expectNoRuntimeFailures(failures, testInfo, 'sensitive-wizard-guard');
});

test('amounts, dates and object references do not trigger false positives', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  const field = page.locator('#newComment');
  await field.fill('Цена 4 500 000 рублей. Срок 18.07.2026. Объект 36:04:0101010:125. Риск 3 из 5.');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await page.locator('#addComment').click();
  await expect.poll(() => count(page, 'comment')).toBe(1);
  await expect(page.locator(`[${'data-sensitive-free-text-error'}]`)).toHaveCount(0);
  await expectNoRuntimeFailures(failures, testInfo, 'sensitive-safe-text');
});

test('explicitly allowed field is not inspected and repeated input keeps one error', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  const allowed = page.locator('#allowedField');
  await allowed.fill('client@example.ru +7 903 857-67-10');
  await page.locator('#allowedSubmit').click();
  await expect.poll(() => count(page, 'allowed')).toBe(1);
  await expect(allowed).not.toHaveAttribute('aria-invalid', 'true');

  const comment = page.locator('#newComment');
  await comment.fill('client@example.ru');
  await comment.fill('Другой email second@example.ru');
  await expect(page.locator('[data-sensitive-free-text-error]')).toHaveCount(1);
  await expectNoRuntimeFailures(failures, testInfo, 'sensitive-singleton-and-allow');
});
