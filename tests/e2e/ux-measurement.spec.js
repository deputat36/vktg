import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const allowedKeys = new Set([
  'schema_version',
  'event_name',
  'event_source',
  'surface',
  'viewport',
  'action_kind',
  'action_slot',
  'result_type',
  'duration_bucket'
]);

test('privacy-safe UX measurement emits enum-only local events', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  await openPage(page, '/tests/fixtures/nav-v2-ux-measurement.html');
  await expect(page.locator('html')).toHaveAttribute('data-nav-ux-measurement', 'event-only-v1');

  await page.locator('#primaryAction').click();
  await expect.poll(() => page.evaluate(() => window.__NAV_V2_UX_EVENTS__.length)).toBe(1);

  await page.locator('#contextDetails summary').click();
  await expect.poll(() => page.evaluate(() => window.__NAV_V2_UX_EVENTS__.length)).toBe(2);

  const events = await page.evaluate(() => window.__NAV_V2_UX_EVENTS__);
  expect(events[0].event_name).toBe('primary_action_opened');
  expect(events[0].event_source).toBe('ui');
  expect(events[0].surface).toBe('deals');
  expect(events[0].action_kind).toBe('continue_work');
  expect(events[0].action_slot).toBe('primary');
  expect(events[0].duration_bucket).toMatch(/^(under_15s|15_to_30s|30_to_60s|1_to_3m|over_3m)$/);

  expect(events[1]).toEqual(expect.objectContaining({
    event_name: 'secondary_details_opened',
    event_source: 'ui',
    surface: 'deals',
    action_kind: 'expand_context',
    action_slot: 'context'
  }));

  const expectedViewport = (page.viewportSize()?.width || 0) <= 430 ? 'compact' : 'desktop';
  expect(events.every((event) => event.viewport === expectedViewport)).toBe(true);
  expect(events.every((event) => Object.keys(event).every((key) => allowedKeys.has(key)))).toBe(true);

  const serialized = JSON.stringify(events);
  for (const forbidden of ['deal_id', 'task_id', 'document_id', 'actor_id', '@', 'Тестовый контекст', '#done']) {
    expect(serialized.includes(forbidden)).toBe(false);
  }

  expect(requests.some((url) => url.includes('supabase.co') || url.includes('/rest/v1/') || url.includes('/functions/v1/'))).toBe(false);
  await expectNoRuntimeFailures(failures, testInfo, 'privacy-safe-ux-measurement');
});
