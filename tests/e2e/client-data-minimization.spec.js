import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-client-data-minimization.html';

async function draft(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('nav_deal_draft_v2') || '{}'));
}

test('legacy browser draft is reloaded without direct client identifiers', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  await expect(page.locator('[data-client-minimization-notice="buyer"]')).toBeVisible();
  await expect(page.locator('[data-field="buyerName"]')).toHaveCount(0);
  await expect(page.locator('[data-field="buyerPhone"]')).toHaveCount(0);
  await expect(page.locator('#app')).not.toContainText('Секретный покупатель');
  await expect(page.locator('#app')).not.toContainText('+7 900');
  await expect(page.locator('#app')).toContainText('источник денег или рабочий комментарий');

  const value = await draft(page);
  expect(value.sellerName).toBeUndefined();
  expect(value.sellerPhone).toBeUndefined();
  expect(value.buyerName).toBeUndefined();
  expect(value.buyerPhone).toBeUndefined();
  expect(value.payments).toEqual(['mortgage']);
  expect(value.buyerComment).toBe('Ипотека предварительно одобрена');
  await expectNoRuntimeFailures(failures, testInfo, 'client-data-minimization-legacy-draft');
});

test('manually injected retired field is removed and scrubbed after input', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  await expect(page.locator('[data-client-minimization-notice="buyer"]')).toBeVisible();

  await page.evaluate(() => {
    const card = document.querySelector('#app .card');
    card.insertAdjacentHTML('beforeend', '<div class="field"><label>Телефон</label><input data-field="buyerPhone"></div>');
  });
  const injected = page.locator('[data-field="buyerPhone"]');
  await injected.fill('+7 999 111-22-33');

  await expect(injected).toHaveCount(0);
  await expect.poll(async () => (await draft(page)).buyerPhone).toBeUndefined();
  await expectNoRuntimeFailures(failures, testInfo, 'client-data-minimization-injected-field');
});

test('privacy guard remains stable across repeated DOM updates', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);
  for (let index = 0; index < 3; index += 1) {
    await page.evaluate((value) => {
      const card = document.querySelector('#app .card');
      card.insertAdjacentHTML('beforeend', `<div class="field"><input data-field="sellerName" value="${value}"></div>`);
    }, `Имя ${index}`);
  }
  await expect(page.locator('[data-field="sellerName"]')).toHaveCount(0);
  await expect(page.locator('[data-client-minimization-notice="buyer"]')).toHaveCount(1);
  const value = await draft(page);
  expect(value.sellerName).toBeUndefined();
  await expectNoRuntimeFailures(failures, testInfo, 'client-data-minimization-repeat');
});
