import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

test('mobile DOM and Tab order follow the action-first visual order', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, '/tests/fixtures/nav-v2-accessibility-continuity.html');

  await expect(page.locator('#fixturePage')).toHaveAttribute('data-nav-dom-order', 'compact');
  const order = await page.locator('#fixturePage > *').evaluateAll((items) => items.map((item) => item.id));
  expect(order.slice(0, 4)).toEqual(['heroRegion', 'workspaceRegion', 'statusRegion', 'metricsRegion']);

  await page.locator('body').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#primaryAction')).toBeFocused();

  const outline = await page.locator('#primaryAction').evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline.style).not.toBe('none');
  expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(3);

  await expectNoRuntimeFailures(failures, testInfo, 'mobile-action-first-focus-order');
});

test('closing progressive disclosure returns focus to its summary', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, '/tests/fixtures/nav-v2-accessibility-continuity.html');

  const summary = page.locator('#contextDetails > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contextDetails')).toHaveAttribute('open', '');
  await expect(summary).toHaveAttribute('aria-expanded', 'true');

  await page.locator('#contextLink').focus();
  await page.locator('#contextDetails').evaluate((details) => { details.open = false; });
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAttribute('aria-expanded', 'false');

  await expectNoRuntimeFailures(failures, testInfo, 'progressive-disclosure-focus-return');
});

test('action shortcuts land on the active panel heading and tabs support arrow keys', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, '/tests/fixtures/nav-v2-accessibility-continuity.html');

  await page.locator('#shortcutAction').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#panelHeading')).toHaveText('Документы');
  await expect(page.locator('#panelHeading')).toBeFocused();

  const docsTab = page.locator('[role="tab"][data-tab="docs"]');
  await docsTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[role="tab"][data-tab="tasks"]')).toBeFocused();
  await expect(page.locator('[role="tab"][data-tab="tasks"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[role="tabpanel"]')).toHaveAttribute('data-nav-tab-panel', 'tasks');

  await expectNoRuntimeFailures(failures, testInfo, 'tab-and-panel-focus-continuity');
});

test('desktop viewport restores source DOM order without losing accessible names', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openPage(page, '/tests/fixtures/nav-v2-accessibility-continuity.html');

  await expect(page.locator('#fixturePage')).toHaveAttribute('data-nav-dom-order', 'source');
  const order = await page.locator('#fixturePage > *').evaluateAll((items) => items.map((item) => item.id));
  expect(order.slice(0, 4)).toEqual(['heroRegion', 'statusRegion', 'metricsRegion', 'workspaceRegion']);

  await expect(page.locator('#primaryAction')).toHaveAccessibleName('Продолжить работу');
  await expect(page.locator('#contextDetails > summary')).toHaveAccessibleName('Дополнительный контекст');
  await expect(page.locator('[role="tablist"]')).toHaveAccessibleName('Разделы карточки сделки');

  await expectNoRuntimeFailures(failures, testInfo, 'desktop-source-order-accessible-names');
});
