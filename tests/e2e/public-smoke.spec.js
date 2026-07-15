import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const guestPages = [
  '/nav-v2.html?clean=1',
  '/dashboard-v2.html',
  '/deals-v2.html',
  '/queue-v2.html',
  '/manager-v2.html',
  '/ux-metrics-v2.html',
  '/task-review-v2.html',
  '/broker-v2.html',
  '/viewer-v2.html',
  '/admin-v2.html',
  '/operational-pilot-decision-v2.html',
  '/operational-pilot-decision-validation-v2.html',
  '/operational-pilot-action-checklist-v2.html',
  '/operational-pilot-start-confirmation-v2.html',
  '/operational-pilot-responsible-acknowledgement-v2.html',
  '/operational-duplicate-review-v2.html'
];

for (const path of guestPages) {
  test(`guest gate loads without browser errors: ${path}`, async ({ page }, testInfo) => {
    const failures = captureRuntimeFailures(page);
    await openPage(page, path);
    await expect(page.locator('#navEmail')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#navPassword')).toBeVisible();
    await expect(page.locator('#navLogin')).toBeVisible();
    await expectNoRuntimeFailures(failures, testInfo, path.replaceAll('/', '_'));
  });
}

test('mobile operational first screen keeps the primary action before secondary data', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, '/nav-v2.html?clean=1');
  await page.setContent(`<!doctype html><html><head>
    <link rel="stylesheet" href="./assets/css/nav-v2.css?v=20260701-0815">
    <link rel="stylesheet" href="./assets/css/nav-v2-mobile-first-screen.css?v=20260715-01">
  </head><body class="nav-v2"><main class="nav-v2-shell mobile-first-screen-page mobile-first-screen-deals">
    <section class="hero"><h1>Рабочие сделки</h1><p>Сначала выполните ближайшее действие, затем проверьте остальные показатели.</p></section>
    <div class="status warn" data-test-secondary-status>Вторичная сводка</div>
    <section class="kpi-row" data-test-secondary-kpi><div class="metric"><b>4</b></div></section>
    <section class="card deals-workspace" data-test-primary-region>
      <h2>Следующий шаг</h2>
      <a class="btn primary mobile-first-screen-primary-action" href="#done">Продолжить работу</a>
      <details class="mobile-first-screen-details"><summary>Ответственные и препятствия</summary><div class="mobile-first-screen-details-body"><p>Вторичные данные сделки</p></div></details>
    </section>
  </main></body></html>`);
  await page.evaluate(async () => {
    const { applyMobileFirstScreenDisclosure } = await import('./assets/js/nav-v2/mobile-first-screen-v2.js?v=20260715-01');
    applyMobileFirstScreenDisclosure(document);
  });

  const viewportWidth = page.viewportSize()?.width || 0;
  const primaryOrder = await page.locator('[data-test-primary-region]').evaluate((element) => getComputedStyle(element).order);
  const statusOrder = await page.locator('[data-test-secondary-status]').evaluate((element) => getComputedStyle(element).order);
  const summary = page.locator('.mobile-first-screen-details > summary');
  const detailBody = page.locator('.mobile-first-screen-details-body');

  if (viewportWidth <= 430) {
    expect(Number(primaryOrder)).toBeLessThan(Number(statusOrder));
    await expect(summary).toBeVisible();
    await expect(detailBody).toBeHidden();
    await summary.click();
    await expect(detailBody).toBeVisible();
    const actionBox = await page.locator('.mobile-first-screen-primary-action').boundingBox();
    const regionBox = await page.locator('[data-test-primary-region]').boundingBox();
    expect(actionBox?.width || 0).toBeGreaterThan((regionBox?.width || 0) * 0.8);
  } else {
    await expect(summary).toBeHidden();
    await expect(detailBody).toBeVisible();
  }

  await expectNoRuntimeFailures(failures, testInfo, 'mobile-first-screen');
});

test('privacy-safe journey storage contains only aggregate fields', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, '/nav-v2.html?clean=1');
  await page.evaluate(() => {
    history.replaceState({}, '', './dashboard-v2.html');
    sessionStorage.removeItem('nav_v2_privacy_safe_ux_journeys_v1');
  });
  await page.setContent(`<!doctype html><html><body>
    <button id="secondary" type="button">Открыть секретный адрес и UUID 123</button>
    <a id="primary" class="mobile-first-screen-primary-action" href="./deal-card-v2.html?id=secret-deal-id">Главное действие по Иванову</a>
  </body></html>`);
  await page.evaluate(async () => {
    const { installPrivacySafeUxJourneyMeasurement } = await import('./assets/js/nav-v2/ux-metrics-session-v2.js?v=20260715-01');
    installPrivacySafeUxJourneyMeasurement();
  });
  await page.locator('#secondary').click();
  await page.locator('#primary').click();

  const records = await page.evaluate(() => JSON.parse(sessionStorage.getItem('nav_v2_privacy_safe_ux_journeys_v1') || '[]'));
  expect(records).toHaveLength(1);
  expect(Object.keys(records[0]).sort()).toEqual(['clicksToMain', 'elapsedBucket', 'page', 'viewport']);
  expect(records[0].page).toBe('dashboard');
  expect(records[0].clicksToMain).toBe(2);
  const serialized = JSON.stringify(records);
  expect(serialized).not.toContain('secret-deal-id');
  expect(serialized).not.toContain('Иванову');
  expect(serialized).not.toContain('секретный адрес');
  expect(serialized).not.toContain('href');

  await expectNoRuntimeFailures(failures, testInfo, 'privacy-safe-journey');
});
