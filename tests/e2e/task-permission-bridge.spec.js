import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-task-action-feedback.html?id=deal-1';
const rpcPattern = '**/rest/v1/rpc/**';
const expectedMockedHttp500 = 'console.error: Failed to load resource: the server responded with a status of 500 (Internal Server Error)';

function litePayload() {
  return {
    tasks: [
      { id: 'task-open', title: 'Получить документ', status: 'open', assigned_role: 'spn', priority: 'high' },
      { id: 'task-progress', title: 'Согласовать расчёты', status: 'in_progress', assigned_role: 'spn', priority: 'high' },
      { id: 'task-done', title: 'Проверить данные', status: 'done', assigned_role: 'spn', priority: 'normal' },
      { id: '20000000-0000-4000-8000-000000000002', title: 'Юридическое решение', status: 'in_progress', assigned_role: 'lawyer', task_contract_version: 2 }
    ]
  };
}

function fullPayload(canChange = true) {
  return {
    deal: { id: 'deal-1' },
    tasks: [
      { id: 'task-open', status: 'open', assigned_role: 'spn', can_change_status: canChange },
      { id: 'task-progress', status: 'in_progress', assigned_role: 'spn', can_change_status: canChange },
      { id: 'task-done', status: 'done', assigned_role: 'spn', can_change_status: canChange },
      {
        id: '20000000-0000-4000-8000-000000000002',
        status: 'in_progress',
        assigned_role: 'lawyer',
        task_contract_version: 2,
        can_change_status: false,
        can_complete: true,
        can_start: false,
        can_set_active_outcome: false,
        can_propose_terminal_outcome: false,
        can_decide_terminal_outcome: false
      }
    ]
  };
}

async function fulfillJson(route, payload = {}, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function routePermissions(page, { canChange = true, liteStatus = 200, fullStatus = 200 } = {}) {
  const calls = { lite: [], full: [], mutation: [] };
  await page.route(rpcPattern, async (route) => {
    const request = route.request();
    const url = request.url();
    const body = request.postDataJSON();
    if (url.includes('/rpc/nav_v2_get_deal_card_lite')) {
      calls.lite.push({ url, body });
      if (liteStatus !== 200) return fulfillJson(route, { message: 'Lite DTO недоступен' }, liteStatus);
      return fulfillJson(route, litePayload());
    }
    if (url.includes('/rpc/nav_v2_get_deal_card')) {
      calls.full.push({ url, body });
      if (fullStatus !== 200) return fulfillJson(route, { message: 'Полная карточка недоступна' }, fullStatus);
      return fulfillJson(route, fullPayload(canChange));
    }
    if (url.includes('/rpc/nav_v2_update_task_status')) {
      calls.mutation.push({ url, body });
      return fulfillJson(route, { ok: true });
    }
    return fulfillJson(route, { ok: true, comment_id: 'comment-1' });
  });
  return calls;
}

function unexpectedMockFailures(failures) {
  return failures.filter((failure) => failure !== expectedMockedHttp500);
}

test('lite DTO without can_change_status is repaired by the full-card server permission', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routePermissions(page, { canChange: true });
  await openPage(page, fixture);

  await expect(page.locator('#openTaskStart')).toHaveAttribute('data-task-action-guard', 'ready');
  await expect(page.locator('#openTaskStart')).toHaveText('Начать работу');
  expect(calls.lite).toHaveLength(1);
  expect(calls.full).toHaveLength(1);

  await page.locator('#openTaskStart').click();
  await expect.poll(() => calls.mutation.length).toBe(1);
  expect(calls.mutation[0].body).toEqual({ p_task_id: 'task-open', p_status: 'in_progress' });
  await expectNoRuntimeFailures(failures, testInfo, 'task-permission-full-card-fallback');
});

test('full-card denial remains fail-closed when lite DTO omits permission', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routePermissions(page, { canChange: false });
  await openPage(page, fixture);

  await expect(page.locator('#openTaskStart')).toBeDisabled();
  await expect(page.locator('#openTaskItem [data-task-permission-hint]')).toContainText('ответственному специалисту');
  expect(calls.lite).toHaveLength(1);
  expect(calls.full).toHaveLength(1);
  expect(calls.mutation).toHaveLength(0);
  await expectNoRuntimeFailures(failures, testInfo, 'task-permission-full-card-denial');
});

test('full card recovers permissions when the lite DTO request fails', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routePermissions(page, { liteStatus: 500, canChange: true });
  await openPage(page, fixture);

  await expect(page.locator('#openTaskStart')).toHaveAttribute('data-task-action-guard', 'ready');
  expect(calls.lite).toHaveLength(1);
  expect(calls.full).toHaveLength(1);
  await expectNoRuntimeFailures(unexpectedMockFailures(failures), testInfo, 'task-permission-lite-error-recovery');
});

test('missing lite and full permission sources keep every action blocked', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routePermissions(page, { liteStatus: 500, fullStatus: 500 });
  await openPage(page, fixture);

  await page.locator('#openTaskStart').click();
  await expect(page.locator('#pageStatus')).toContainText('Не удалось проверить права');
  expect(calls.mutation).toHaveLength(0);
  await expectNoRuntimeFailures(unexpectedMockFailures(failures), testInfo, 'task-permission-all-sources-fail-closed');
});
