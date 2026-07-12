import { expect } from '@playwright/test';

export function captureRuntimeFailures(page) {
  const failures = [];
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
  });
  return failures;
}

export async function openPage(page, path) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response, `No document response for ${path}`).not.toBeNull();
  expect(response.status(), `Unexpected HTTP status for ${path}`).toBeLessThan(400);
  await expect(page.locator('#app')).toBeVisible();
}

export async function expectNoInfiniteLoader(page) {
  const loader = page.locator('.status').filter({ hasText: /Загружаю|Проверяю доступ|Проверяю вход/ });
  await expect(loader).toHaveCount(0, { timeout: 50_000 });
}

export async function expectNoRuntimeFailures(failures, testInfo, scope) {
  await testInfo.attach(`${scope}-runtime-failures.json`, {
    body: Buffer.from(JSON.stringify(failures, null, 2)),
    contentType: 'application/json'
  });
  expect(failures, `Runtime errors detected in ${scope}`).toEqual([]);
}

export async function login(page) {
  await openPage(page, '/nav-v2.html?clean=1');
  await expect(page.locator('#navEmail')).toBeVisible();
  await page.locator('#navEmail').fill(String(process.env.NAV_E2E_EMAIL || ''));
  await page.locator('#navPassword').fill(String(process.env.NAV_E2E_PASSWORD || ''));
  await Promise.all([
    page.waitForURL(/dashboard-v2\.html/, { timeout: 30_000 }),
    page.locator('#navLogin').click()
  ]);
  await expect(page.locator('h1')).toContainText(/Рабочий стол/);
  await expectNoInfiniteLoader(page);
}
