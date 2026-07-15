import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-landmark-structure.html';

async function expectPageFrame(page, surface) {
  const main = page.locator('main.mobile-first-screen-page');
  await expect(main).toHaveCount(1);
  await expect(main.locator('h1')).toHaveCount(1);
  const title = main.locator('h1');
  await expect(title).toHaveAttribute('id', /nav-.+-page-title-1/);
  await expect(main).toHaveAttribute('aria-labelledby', await title.getAttribute('id'));
  await expect(main).toHaveAttribute('data-nav-landmark-surface', surface);
  await expect(main).toHaveAttribute('data-nav-heading-sequence', /^1:/);
  await expect(main.locator('[role="status"], [role="alert"]')).not.toHaveAttribute('aria-labelledby', /.+/);
}

test('dashboard exposes one named main and ordered regions', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}?surface=dashboard`);
  await expectPageFrame(page, 'dashboard');
  await expect(page.locator('.role-home-focus')).toHaveAccessibleName('Что делать сейчас');
  await expect(page.locator('.role-home-quick-actions')).toHaveAccessibleName('Быстрые действия');
  await expect(page.locator('.role-home-recent')).toHaveAccessibleName('Последние рабочие сделки');
  await expect(page.locator('.role-home-priority-card')).toHaveAccessibleName('Сделка на Советской');
  await expectNoRuntimeFailures(failures, testInfo, 'landmark-dashboard');
});

test('deals expose named workspace and deal article headings', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}?surface=deals`);
  await expectPageFrame(page, 'deals');
  await expect(page.locator('.deals-workspace')).toHaveAccessibleName('Сделки для работы');
  await expect(page.locator('.deals-work-card')).toHaveAccessibleName('Дом на Просторной');
  const dealHeading = page.locator('.deal-title');
  await expect(dealHeading).toHaveAttribute('role', 'heading');
  await expect(dealHeading).toHaveAttribute('aria-level', '3');
  await expectNoRuntimeFailures(failures, testInfo, 'landmark-deals');
});

test('deal card names action-first regions without promoting live status', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}?surface=deal_card`);
  await expectPageFrame(page, 'deal_card');
  await expect(page.locator('#spnReworkWorkflowV2')).toHaveAccessibleName('Доработка карточки СПН');
  await expect(page.locator('#lawyerDocumentCycleV2')).toHaveAccessibleName('Документный цикл юриста');
  await expect(page.locator('#dealCompletionEvidenceV2')).toHaveAccessibleName('Подтверждённый результат');
  await expect(page.locator('#dealActionFocus')).toHaveAccessibleName('Главное действие сейчас');
  await expect(page.locator('[role="alert"]')).toHaveCount(1);
  await expect(page.locator('[role="alert"]')).not.toHaveAttribute('role', 'region');
  await expectNoRuntimeFailures(failures, testInfo, 'landmark-deal-card');
});

test('manager exposes named decision and confirmed result structure', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}?surface=manager`);
  await expectPageFrame(page, 'manager');
  await expect(page.locator('.manager-confirmed-results')).toHaveAccessibleName('Подтверждённые результаты');
  await expect(page.locator('.manager-readiness-summary')).toHaveAccessibleName('Правдивая готовность');
  await expect(page.locator('.manager-queue')).toHaveAccessibleName('Очередь решений');
  await expect(page.locator('.manager-confirmed-card')).toHaveAccessibleName('Документ проверен');
  await expect(page.locator('.manager-decision-card')).toHaveAccessibleName('Сделка на Аэродромной');
  const decisionHeading = page.locator('.manager-decision-head b');
  await expect(decisionHeading).toHaveAttribute('role', 'heading');
  await expect(decisionHeading).toHaveAttribute('aria-level', '3');
  await expectNoRuntimeFailures(failures, testInfo, 'landmark-manager');
});
