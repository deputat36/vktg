import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-lawyer-handoff-dialog.html?id=deal-1';
const rpcPattern = '**/rest/v1/rpc/**';

async function prepareSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('nav_session_v2', JSON.stringify({
      access_token: 'fixture-access-token',
      refresh_token: 'fixture-refresh-token',
      user: { id: 'fixture-user' }
    }));
  });
}

async function routeRpc(page, handler) {
  await page.route(rpcPattern, async (route) => handler(route, route.request()));
}

async function fulfillJson(route, payload = {}) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
}

test.beforeEach(async ({ page }) => prepareSession(page));

function handoffDialog(page) {
  return page.getByRole('dialog', { name: 'Передать юристу с незакрытыми пунктами?' });
}

test('lawyer handoff dialog shows the full issue list and Escape cancels mutation', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = [];
  await routeRpc(page, async (route, request) => { calls.push(request.url()); await fulfillJson(route); });
  await openPage(page, fixture);

  const trigger = page.locator('#lawyerHandoff');
  await trigger.click();
  const dialog = handoffDialog(page);
  await expect(dialog).toHaveAccessibleDescription(/Юрист получит карточку/);
  await expect(dialog).toContainText('Не хватает обязательных документов: 2.');
  await expect(dialog).toContainText('Есть красные риски: 1.');
  await expect(dialog).toContainText('Порядок расчетов не согласован.');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(calls).toHaveLength(0);
  await expectNoRuntimeFailures(failures, testInfo, 'lawyer-handoff-v2-cancel');
});

test('confirmed lawyer handoff keeps the existing status RPC payload', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = [];
  await routeRpc(page, async (route, request) => { calls.push({ url: request.url(), body: request.postDataJSON() }); await fulfillJson(route); });
  await openPage(page, fixture);

  await page.locator('#lawyerHandoff').click();
  const dialog = handoffDialog(page);
  await dialog.getByRole('button', { name: 'Передать юристу' }).click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].url).toContain('/rpc/nav_v2_update_deal_status');
  expect(calls[0].body).toEqual({ p_deal_id: 'deal-1', p_status: 'need_lawyer' });
  await expect(page.locator('#pageStatus')).toContainText('Сделка передана юристу');
  await expectNoRuntimeFailures(failures, testInfo, 'lawyer-handoff-v2-success');
});

test('server error restores the handoff button for another attempt', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await routeRpc(page, async (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Сервер временно не ответил.' }) }));
  await openPage(page, fixture);

  const trigger = page.locator('#lawyerHandoff');
  await trigger.click();
  await handoffDialog(page).getByRole('button', { name: 'Передать юристу' }).click();
  await expect(page.locator('#pageStatus')).toContainText('Сервер временно не ответил.');
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const retryDialog = handoffDialog(page);
  await expect(retryDialog).toBeVisible();
  await retryDialog.getByRole('button', { name: 'Вернуться к карточке' }).click();
  const unexpected = failures.filter((failure) => !failure.includes('Failed to load resource: the server responded with a status of 400'));
  await expectNoRuntimeFailures(unexpected, testInfo, 'lawyer-handoff-v2-server-error');
});

test('ready handoff leaves the existing direct handler untouched', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await routeRpc(page, async (route) => fulfillJson(route));
  await openPage(page, `${fixture}&ready=1`);
  await page.locator('#lawyerHandoff').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.baseHandoffClicks)).toBe(1);
  await expectNoRuntimeFailures(failures, testInfo, 'lawyer-handoff-v2-ready');
});

test('demo handoff dialog clearly identifies test data', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await routeRpc(page, async (route) => fulfillJson(route));
  await openPage(page, `${fixture}&demo=1`);
  const trigger = page.locator('#lawyerHandoff');
  await trigger.click();
  const dialog = handoffDialog(page);
  await expect(dialog).toContainText('Это демо-сделка');
  await dialog.getByRole('button', { name: 'Вернуться к карточке' }).click();
  await expect(trigger).toBeFocused();
  await expectNoRuntimeFailures(failures, testInfo, 'lawyer-handoff-v2-demo');
});
