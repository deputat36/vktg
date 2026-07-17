import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const FIXTURE = '/tests/fixtures/nav-v2-legal-passport-preview.html';

test('lawyer sees canonical passport before the old profile and can reuse legal actions', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const mutationRequests = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutationRequests.push(`${request.method()} ${request.url()}`);
  });
  await openPage(page, FIXTURE);

  const passport = page.locator('#dealLegalPassportV1');
  await expect(passport).toBeVisible();
  await expect(passport).toContainText('Паспорт v1');
  await expect(passport.getByRole('heading', { name: 'Проверить доверенность' })).toBeVisible();
  await expect(passport).toContainText('Подтвердить полномочия на подписание и получение денег.');
  await expect(passport).toContainText('Обременение не найдено');
  await expect(passport).toContainText('Представитель действует по доверенности');
  await expect(passport).toContainText('Неизвестен статус согласия супруга');
  await expect(passport).toContainText('Доверенность');
  await expect(passport).toContainText('Мария, СПН продавца');
  await expect(passport).toContainText('Иван, СПН покупателя');

  const beforeOldProfile = await page.evaluate(() => {
    const passportNode = document.getElementById('dealLegalPassportV1');
    const oldProfile = document.querySelector('.existing-legal-profile');
    return Boolean(passportNode.compareDocumentPosition(oldProfile) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(beforeOldProfile).toBe(true);

  await passport.locator('[data-legal-passport-action="need_documents"]').click();
  expect(await page.evaluate(() => window.fixtureLastAction)).toBe('need_documents');
  expect(await page.evaluate(() => window.fixtureModel.source)).toBe('passport_v1');

  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(mutationRequests).toEqual([]);
  await expectNoRuntimeFailures(failures, testInfo, `legal-passport-v1-${testInfo.project.name}`);
});

test('old deal gets an honest legacy fallback without invented evidence', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${FIXTURE}?legacy=1`);
  const passport = page.locator('#dealLegalPassportV1');
  await expect(passport).toContainText('Старая карточка');
  await expect(passport).toContainText('без юридического паспорта v1');
  await expect(passport.getByRole('heading', { name: 'Провести первичную юридическую проверку' })).toBeVisible();
  await expect(passport).toContainText('Источник значимых фактов в старой карточке не разделён');
  await expect(passport).toContainText('Документы на землю');
  await expect(passport).toContainText('Не уточнены границы');
  await expect(passport.getByRole('heading', { name: 'Подтверждено документом' }).locator('..')).toContainText('Подтверждённых фактов нет.');
  expect(await page.evaluate(() => window.fixtureModel.source)).toBe('legacy');

  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await expectNoRuntimeFailures(failures, testInfo, `legal-passport-legacy-${testInfo.project.name}`);
});
