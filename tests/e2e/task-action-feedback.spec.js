import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-task-action-feedback.html?id=deal-1';
const rpcPattern = '**/rest/v1/rpc/**';
const expectedMockedHttp400 = 'console.error: Failed to load resource: the server responded with a status of 400 (Bad Request)';
const expectedMockedHttp500 = 'console.error: Failed to load resource: the server responded with a status of 500 (Internal Server Error)';

function permissionPayload(canChange = true, assignedRole = 'spn') {
  return {
    tasks: [
      {
        id: 'task-1',
        task_contract_version: null,
        can_change_status: canChange,
        assigned_role: assignedRole
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        task_contract_version: 2,
        can_change_status: false,
        can_start: false,
        can_complete: true,
        can_set_active_outcome: false,
        can_propose_terminal_outcome: false,
        can_decide_terminal_outcome: false,
        assigned_role: 'lawyer'
      }
    ]
  };
}

async function fulfillJson(route, payload = {}, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

async function routeTaskRpc(page, { canChange = true, assignedRole = 'spn', permissionDelay = 0, permissionStatus = 200, mutationStatus = 200 } = {}) {
  const permissionCalls = [];
  const mutationCalls = [];
  await page.route(rpcPattern, async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/rpc/nav_v2_get_deal_card_lite')) {
      permissionCalls.push({ url, body: request.postDataJSON() });
      if (permissionDelay) await new Promise((resolve) => setTimeout(resolve, permissionDelay));
      if (permissionStatus !== 200) {
        await fulfillJson(route, { message: 'Не удалось проверить права.' }, permissionStatus);
        return;
      }
      await fulfillJson(route, permissionPayload(canChange, assignedRole));
      return;
    }
    mutationCalls.push({ url, body: request.postDataJSON() });
    if (mutationStatus !== 200) {
      await fulfillJson(route, { message: 'Сервер временно не сохранил задачу.' }, mutationStatus);
      return;
    }
    await fulfillJson(route, {});
  });
  return { permissionCalls, mutationCalls };
}

async function waitForGuard(page, selector = '#taskDone') {
  await expect(page.locator(selector)).toHaveAttribute('data-task-action-guard', 'ready');
}

test('cold first click checks permission and authoritative handler performs one legacy mutation', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page, { permissionDelay: 220 });
  await openPage(page, fixture);

  await page.locator('#taskDone').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(1);
  expect(calls.mutationCalls[0].url).toContain('/rpc/nav_v2_update_task_status');
  expect(calls.mutationCalls[0].body).toEqual({ p_task_id: 'task-1', p_status: 'done' });
  await expect(page.locator('#pageStatus')).toHaveAttribute('role', 'status');
  await expect(page.locator('#pageStatus')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#pageStatus')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#pageStatus')).toContainText('Статус задачи сохранён');
  expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
  await expectNoRuntimeFailures(failures, testInfo, 'task-action-cold-permission');
});

test('permission denial explains the responsible role and never mutates the task', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page, { canChange: false, assignedRole: 'lawyer', permissionDelay: 220 });
  await openPage(page, fixture);

  await page.locator('#taskDone').click();
  await expect(page.locator('#pageStatus')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#pageStatus')).toContainText('юрист');
  await expect(page.locator('#taskDone')).toBeDisabled();
  await expect(page.locator('#taskItem [data-task-permission-hint]')).toContainText('ответственному специалисту');
  expect(calls.mutationCalls).toHaveLength(0);
  expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
  await expectNoRuntimeFailures(failures, testInfo, 'task-action-denied');
});

test('permission lookup failure is assertive and leaves the task visible', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page, { permissionDelay: 150, permissionStatus: 500 });
  await openPage(page, fixture);

  await page.locator('#taskDone').click();
  await expect(page.locator('#pageStatus')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#pageStatus')).toHaveAttribute('aria-live', 'assertive');
  await expect(page.locator('#pageStatus')).toContainText('Не удалось проверить права');
  await expect(page.locator('#taskItem')).toBeVisible();
  expect(calls.mutationCalls).toHaveLength(0);
  const unexpectedFailures = failures.filter((failure) => failure !== expectedMockedHttp500);
  await expectNoRuntimeFailures(unexpectedFailures, testInfo, 'task-action-permission-error');
});

test('legacy mutation error restores controls and keeps the exact existing payload', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page, { mutationStatus: 400 });
  await openPage(page, fixture);
  await waitForGuard(page);

  await page.locator('#taskProgress').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(1);
  expect(calls.mutationCalls[0].url).toContain('/rpc/nav_v2_update_task_status');
  expect(calls.mutationCalls[0].body).toEqual({ p_task_id: 'task-1', p_status: 'in_progress' });
  await expect(page.locator('#pageStatus')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#pageStatus')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#pageStatus')).toContainText('Сервер временно не сохранил задачу');
  await expect(page.locator('#taskProgress')).toBeEnabled();
  await expect(page.locator('#taskProgress')).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
  const unexpectedFailures = failures.filter((failure) => failure !== expectedMockedHttp400);
  await expectNoRuntimeFailures(unexpectedFailures, testInfo, 'task-action-mutation-error');
});

test('legacy completion and reopen use the same RPC while base onclick stays dormant', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page);
  await openPage(page, fixture);
  await waitForGuard(page);

  await page.locator('#taskDone').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(1);
  await page.waitForTimeout(400);
  await waitForGuard(page);
  await page.locator('#taskOpen').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(2);

  expect(calls.mutationCalls.map((call) => call.body)).toEqual([
    { p_task_id: 'task-1', p_status: 'done' },
    { p_task_id: 'task-1', p_status: 'open' }
  ]);
  expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
  await expectNoRuntimeFailures(failures, testInfo, 'task-action-reopen');
});

test('bounded completion is routed by authoritative handler but transport remains disabled', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page);
  await openPage(page, fixture);
  await waitForGuard(page, '#boundedDone');

  await page.locator('#boundedDone').click();
  await expect(page.locator('#pageStatus')).toContainText('сохранение ещё не включено');
  expect(calls.mutationCalls).toHaveLength(0);
  expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
  await expect(page.locator('#boundedReopen')).toBeDisabled();
  await expectNoRuntimeFailures(failures, testInfo, 'task-action-bounded-transport-disabled');
});
