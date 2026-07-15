import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const policy = JSON.parse(readFileSync(new URL('../../config/nav-v2-mobile-first-screen.json', import.meta.url), 'utf8'));
const surfaces = Object.keys(policy.surfaces);
const widths = [policy.min_test_width_px, policy.max_width_px];

async function visibleCount(page, selector) {
  return page.locator(selector).evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0
      && rect.width > 0
      && rect.height > 0;
  }).length);
}

async function firstVisibleBox(page, selector) {
  const boxes = await page.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const visible = style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0
      && rect.width > 0
      && rect.height > 0;
    return visible ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
  }).filter(Boolean));
  return boxes[0] || null;
}

for (const width of widths) {
  for (const surface of surfaces) {
    test(`${surface} keeps one mobile first-screen action at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: policy.first_screen_height_px });
      await page.goto(`/tests/fixtures/nav-v2-mobile-first-screen.html?surface=${encodeURIComponent(surface)}`);
      await expect(page.locator(`body[data-mobile-surface="${surface}"]`)).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);

      const mainBox = await firstVisibleBox(page, '[data-fixture-primary]');
      expect(mainBox, `${surface} must expose a primary action`).not.toBeNull();
      expect(mainBox.y, `${surface} primary action must be reachable without a long scroll`).toBeLessThan(760);

      if (surface === 'dashboard') {
        await expect(page.locator('.role-home-priority-card').first()).toBeVisible();
        await expect(page.locator('.role-home-priority-card').nth(1)).toBeHidden();
        expect(await visibleCount(page, '.role-home-focus [data-fixture-context]')).toBeLessThanOrEqual(policy.surfaces.dashboard.max_context_actions);
      }

      if (surface === 'deals') {
        expect(await visibleCount(page, '.deals-quick-mode')).toBe(policy.surfaces.deals.visible_quick_modes);
        await expect(page.locator('.deals-workspace > .section-title > .btn.primary')).toBeHidden();
        const contextCount = await visibleCount(page, '.deals-quick-mode, .deals-advanced-filters > summary');
        expect(contextCount).toBeLessThanOrEqual(policy.surfaces.deals.max_context_actions);
      }

      if (surface === 'deal-card') {
        await expect(page.locator('#dealCompletionEvidenceV2')).toBeVisible();
        await expect(page.locator('#dealActionFocus')).toBeHidden();
        await expect(page.locator('.nav-v2-shell > .kpi-row').first()).toBeVisible();
        await expect(page.locator('.nav-v2-shell > .kpi-row').nth(1)).toBeHidden();
      }

      if (surface === 'manager') {
        expect(await visibleCount(page, '.manager-tabs .tab')).toBe(policy.surfaces.manager.visible_queue_filters);
        expect(await visibleCount(page, '.manager-decision-card:first-child .manager-card-actions .btn.light')).toBeLessThanOrEqual(policy.surfaces.manager.max_context_actions);
        await expect(page.locator('.manager-queue > .section-title .btn')).toBeHidden();
      }
    });
  }
}

for (const surface of surfaces) {
  test(`${surface} keeps desktop controls available`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/tests/fixtures/nav-v2-mobile-first-screen.html?surface=${encodeURIComponent(surface)}`);

    if (surface === 'dashboard') {
      expect(await visibleCount(page, '.role-home-priority-card')).toBe(3);
      expect(await visibleCount(page, '.role-home-hero .role-home-actions .btn')).toBe(2);
      expect(await visibleCount(page, '.role-home-quick-actions .btn')).toBe(3);
    }

    if (surface === 'deals') {
      expect(await visibleCount(page, '.deals-quick-mode')).toBe(5);
      await expect(page.locator('.deals-workspace > .section-title > .btn.primary')).toBeVisible();
    }

    if (surface === 'deal-card') {
      await expect(page.locator('#dealActionFocus')).toBeVisible();
      expect(await visibleCount(page, '.nav-v2-shell > section.card:nth-last-of-type(2) .actions .btn')).toBe(5);
      await expect(page.locator('.nav-v2-shell > .kpi-row').nth(1)).toBeVisible();
    }

    if (surface === 'manager') {
      expect(await visibleCount(page, '.manager-tabs .tab')).toBe(3);
      expect(await visibleCount(page, '.manager-decision-card:first-child .manager-card-actions .btn')).toBe(4);
      await expect(page.locator('.manager-queue > .section-title .btn')).toBeVisible();
    }
  });
}
