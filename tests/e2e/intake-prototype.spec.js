import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const PAGE = '/spn-intake-prototype-v2.html';
const DRAFT_KEY = 'nav_v2_intake_prototype_v1';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('nav-intake-test-initialized') === '1') return;
    localStorage.removeItem(key);
    sessionStorage.setItem('nav-intake-test-initialized', '1');
  }, DRAFT_KEY);
});

test('three-stage intake restores a legal handoff without network mutations', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const mutationRequests = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutationRequests.push(`${request.method()} ${request.url()}`);
  });

  await openPage(page, PAGE);
  await expect(page.locator('h1')).toContainText('Новая сделка за три этапа');
  await expect(page.locator('.intake-step')).toHaveCount(3);
  await expect(page.locator('.intake-step.active')).toContainText('Что происходит');

  await page.locator('[data-set-field="requestType"][data-set-value="prepare_deposit"]').click();
  await page.locator('[data-set-field="representation"][data-set-value="seller"]').click();
  await page.locator('[data-set-field="stage"][data-set-value="urgent_deposit"]').click();
  await page.locator('[data-input-field="objectType"]').selectOption('flat_mkd');
  await page.locator('[data-input-field="objectAddress"]').fill('Рабочий ориентир без персональных данных');
  await page.locator('[data-input-field="urgency"]').selectOption('urgent');
  await page.locator('[data-input-field="targetDate"]').fill('2026-07-20');
  await page.locator('[data-input-field="leadSpnConfirmed"]').check();
  await page.locator('[data-input-field="nextAction"]').selectOption('Запросить ключевые документы.');
  await page.locator('[data-primary-action="continue"]').click();

  await expect(page.locator('.intake-step.active')).toContainText('Что проверить');
  await page.locator('[data-fact-id="minor_seller"][data-fact-value="yes"]').click();
  await page.locator('[data-fact-source-id="minor_seller"][data-fact-source="client"]').click();
  await page.locator('[data-document-type="guardianship_permission"]').selectOption('requested');
  await page.locator('[data-document-type="child_ownership_status"]').selectOption('available');
  await page.locator('[data-primary-action="review"]').click();

  await expect(page.locator('.intake-step.active')).toContainText('Проверить');
  await expect(page.getByRole('heading', { name: 'Известно со слов клиента' })).toBeVisible();
  await expect(page.locator('.review-card').filter({ hasText: 'Риски и стоп-факторы' })).toContainText('minor_seller');
  const sideAwareDocuments = page.locator('.review-card').filter({ hasText: 'Документы по сопровождаемой стороне' });
  await expect(sideAwareDocuments).toContainText('Разрешение или позиция органа опеки');
  await expect(sideAwareDocuments).not.toContainText('Условия приобретения на ребёнка');
  const concreteTasks = page.locator('.review-card').filter({ hasText: 'Конкретные задачи' });
  await expect(concreteTasks).toContainText('Проверить детей и опеку');
  await expect(concreteTasks).toContainText('Ответственный: Юрист · назначается при сохранении');
  await expect(concreteTasks).toContainText('Evidence:');
  await expect(concreteTasks).toContainText('Ожидаемый результат:');
  await page.locator('[data-confirm-lawyer]').check();
  await expect(page.locator('[data-primary-action="lawyer"]')).toContainText('Сохранить и передать юристу');

  const assessment = await page.evaluate(() => window.__NAV_INTAKE_PROTOTYPE__.getAssessment());
  expect(assessment.route).toEqual(['situation', 'facts', 'review']);
  expect(assessment.passport.specialists.lawyer).toBe(true);
  expect(assessment.passport.specialists.broker).toBe(false);
  expect(assessment.work_plan.accompanied_sides).toEqual(['seller']);
  expect(assessment.work_plan.document_candidates.map((item) => item.type).sort()).toEqual(['child_ownership_status', 'guardianship_permission']);
  expect(assessment.work_plan.task_candidates.map((item) => item.rule_id).sort()).toEqual(['expenses_not_agreed', 'minor_seller', 'settlements_not_agreed']);
  expect(assessment.work_plan.ready_tasks).toEqual([]);
  expect(assessment.gates.handoff_lawyer.state).toBe('ready');

  await page.locator('[data-primary-action="lawyer"]').click();
  await expect(page.locator('.prototype-result')).toContainText('данные не отправлены в Supabase');
  await page.reload();
  await expect(page.locator('.intake-step.active')).toContainText('Проверить');
  await expect(page.locator('.prototype-result')).toBeVisible();
  const restored = await page.evaluate(() => ({
    label: 'prototype-restored',
    state: window.__NAV_INTAKE_PROTOTYPE__.getState(),
    assessment: window.__NAV_INTAKE_PROTOTYPE__.getAssessment()
  }));
  expect(restored.label).toBe('prototype-restored');
  expect(restored.state.draft.objectType).toBe('flat_mkd');
  expect(restored.state.outcome.action).toBe('lawyer');
  expect(restored.assessment.gates.handoff_lawyer.state).toBe('ready');

  const viewport = page.viewportSize();
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  const primaryBox = await page.locator('.intake-primary').boundingBox();
  expect(primaryBox).not.toBeNull();
  expect(primaryBox.x + primaryBox.width).toBeLessThanOrEqual((viewport?.width || dimensions.clientWidth) + 1);
  expect(mutationRequests).toEqual([]);
  await expectNoRuntimeFailures(failures, testInfo, `intake-prototype-${testInfo.project.name}`);
});
