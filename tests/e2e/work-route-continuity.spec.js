import { expect, test } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.js';

const fixture = '/tests/fixtures/nav-v2-work-route-continuity.html';

test('dashboard and working list preserve the exact work section', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  await expect(page.locator('#priorityTaskLink')).toHaveAttribute('href', './deal-card-v2.html?id=priority-task#tasks');
  await expect(page.locator('#priorityTaskLink')).toHaveText('Открыть задачи');
  await expect(page.locator('#priorityRiskLink')).toHaveAttribute('href', './deal-card-v2.html?id=priority-risk#risks');
  await expect(page.locator('#priorityRiskLink')).toHaveText('Открыть риски');
  await expect(page.locator('#priorityDocsLink')).toHaveAttribute('href', './deal-card-v2.html?id=priority-docs#docs');
  await expect(page.locator('#priorityDocsLink')).toHaveText('Открыть документы');

  await expect(page.locator('#recentTaskLink')).toHaveAttribute('href', './deal-card-v2.html?id=recent-task#tasks');
  await expect(page.locator('#dealListLink')).toHaveAttribute('href', './deal-card-v2.html?id=deal-list#tasks');
  await expect(page.locator('#dealListLink')).toHaveText('Открыть задачи');
  await expect(page.locator('#dealListLink')).toHaveAttribute('data-work-route-tab', 'tasks');

  await expectNoRuntimeFailures(failures, testInfo, 'work-route-default');
});

test('explicit red-risk filter wins over generic task counts', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}?filter=red`);

  await expect(page.locator('#dealListLink')).toHaveAttribute('href', './deal-card-v2.html?id=deal-list#risks');
  await expect(page.locator('#dealListLink')).toHaveText('Открыть риски');
  await expectNoRuntimeFailures(failures, testInfo, 'work-route-red');
});

test('explicit document filter opens documents directly', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}?filter=docs`);

  await expect(page.locator('#dealListLink')).toHaveAttribute('href', './deal-card-v2.html?id=deal-list#docs');
  await expect(page.locator('#dealListLink')).toHaveText('Открыть документы');
  await expectNoRuntimeFailures(failures, testInfo, 'work-route-docs');
});
