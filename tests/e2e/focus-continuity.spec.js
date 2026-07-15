import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures } from './helpers.mjs';

test('action-first keyboard focus remains visible and continuous', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const response = await page.goto('/tests/fixtures/nav-v2-focus-continuity.html', { waitUntil: 'domcontentloaded' });
  expect(response, 'No response for focus continuity fixture').not.toBeNull();
  expect(response.status()).toBeLessThan(400);
  await expect(page.locator('#primaryAction')).toHaveAttribute('data-nav-primary-action', 'true');

  await page.keyboard.press('Tab');
  await expect(page.locator('#primaryAction')).toBeFocused();
  const focusStyle = await page.locator('#primaryAction').evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).toBe('solid');
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#primaryAction')).toHaveAccessibleName('Открыть главное действие');

  const details = page.locator('#contextDetails');
  const summary = details.locator('summary');
  await page.evaluate(() => { document.getElementById('contextDetails').open = false; });
  await expect(details).not.toHaveAttribute('open', '');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect(summary).toHaveAttribute('aria-controls', /navFocusDisclosure/);

  await page.locator('#contextAction').focus();
  await page.evaluate(() => { document.getElementById('contextDetails').open = false; });
  await expect(details).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAttribute('aria-expanded', 'false');

  await page.locator('#docsTab').focus();
  await page.keyboard.press('Enter');
  const docsPanel = page.locator('[data-deal-tab-panel="docs"]');
  await expect(docsPanel).toBeFocused({ timeout: 2_000 });
  await expect(docsPanel).toHaveAttribute('tabindex', '-1');
  await expect(docsPanel).toHaveAttribute('aria-label', 'Документы сделки');
  await expect(page.locator('[data-tab="docs"]')).toHaveAttribute('aria-pressed', 'true');

  await expect(page.locator('[tabindex="1"], [tabindex="2"], [tabindex="3"]')).toHaveCount(0);
  await expectNoRuntimeFailures(failures, testInfo, 'focus-continuity');
});
