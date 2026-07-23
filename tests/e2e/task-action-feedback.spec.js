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
        id: 'task-open',
        title: 'Получить документ',
        status: 'open',
        task_contract_version: null,
        can_change_status: canChange,
        assigned_role: assignedRole
      },
      {
        id: 'task-progress',
        title: 'Согласовать порядок расчётов',
        status: 'in_progress',
        task_contract_version: null,
        can_change_status: canChange,
        assigned_role: assignedRole
      },
      {
        id: 'task-done',
        title: 'Проверить данные сделки',
        status: 'done',
        task_contract_version: null,
        can_change_status: canChange,
        assigned_role: assignedRole
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        title: 'Юридическое решение',
        status: 'in_progress',
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

async function routeTaskRpc(page, {
  canChange = true,
  assignedRole = 'spn',
  permissionDelay = 0,
  permissionStatus = 200,
  commentStatuses = [200],
  taskStatuses = [200]
} = {}) {
  const permissionCalls = [];
  const mutationCalls = [];
  let commentIndex = 0;
  let taskIndex = 0;

  await page.route(rpcPattern, async (route) => {
    const request = route.request();
    const url = request.url();
    const body = request.postDataJSON();
    if (url.includes('/rpc/nav_v2_get_deal_card_lite')) {
      permissionCalls.push({ url, body });
      if (permissionDelay) await new Promise((resolve) => setTimeout(resolve, permissionDelay));
      if (permissionStatus !== 200) {
        await fulfillJson(route, { message: 'Не удалось проверить права.' }, permissionStatus);
        return;
      }
      await fulfillJson(route, permissionPayload(canChange, assignedRole));
      return;
    }

    const kind = url.includes('/rpc/nav_v2_add_comment') ? 'comment' : 'task';
    mutationCalls.push({ url, body, kind });
    if (kind === 'comment') {
      const status = commentStatuses[Math.min(commentIndex, commentStatuses.length - 1)];
      commentIndex += 1;
      if (status !== 200) {
        await fulfillJson(route, { message: 'Не удалось сохранить результат.' }, status);
        return;
      }
      await fulfillJson(route, { ok: true, comment_id: 'comment-1' });
      return;
    }

    const status = taskStatuses[Math.min(taskIndex, taskStatuses.length - 1)];
    taskIndex += 1;
    if (status !== 200) {
      await fulfillJson(route, { message: 'Сервер временно не сохранил задачу.' }, status);
      return;
    }
    await fulfillJson(route, { ok: true });
  });
  return { permissionCalls, mutationCalls };
}

async function waitForGuard(page, selector) {
  await expect(page.locator(selector)).toHaveAttribute('data-task-action-guard', 'ready');
}

function unexpectedMockFailures(failures) {
  return failures.filter((failure) => failure !== expectedMockedHttp400 && failure !== expectedMockedHttp500);
}

test('legacy controls follow open, in-progress and done lifecycle phases', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await routeTaskRpc(page);
  await openPage(page, fixture);
  await waitForGuard(page, '#openTaskStart');
  await waitForGuard(page, '#progressTaskDone');
  await waitForGuard(page, '#doneTaskReopen');

  await expect(page.locator('#openTaskStart')).toBeVisible();
  await expect(page.locator('#openTaskStart')).toHaveText('Начать работу');
  await expect(page.locator('#openTaskDone')).toBeHidden();
  await expect(page.locator('#openTaskReopen')).toBeHidden();
  await expect(page.locator('#openTaskItem [data-task-lifecycle-instruction]')).toContainText('Шаг 1 из 2');

  await expect(page.locator('#progressTaskStart')).toBeHidden();
  await expect(page.locator('#progressTaskDone')).toBeVisible();
  await expect(page.locator('#progressTaskDone')).toHaveText('Сохранить результат и завершить');
  await expect(page.locator('#progressTaskReopen')).toBeHidden();
  await expect(page.locator('#progressTaskItem [data-task-completion-editor]')).toBeVisible();
  await expect(page.locator('#progressTaskItem [data-task-lifecycle-instruction]')).toContainText('Шаг 2 из 2');

  await expect(page.locator('#doneTaskStart')).toBeHidden();
  await expect(page.locator('#doneTaskDone')).toBeHidden();
  await expect(page.locator('#doneTaskReopen')).toBeVisible();
  await expect(page.locator('#doneTaskReopen')).toHaveText('Вернуть в работу');
  await expect(page.locator('#doneTaskItem [data-task-lifecycle-instruction]')).toContainText('Результат подтверждён');
  await expectNoRuntimeFailures(failures, testInfo, 'task-lifecycle-controls');
});

test('cold first click checks permission and starts an open task with one status mutation', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page, { permissionDelay: 220 });
  await openPage(page, fixture);

  await page.locator('#openTaskStart').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(1);
  expect(calls.mutationCalls[0].url).toContain('/rpc/nav_v2_update_task_status');
  expect(calls.mutationCalls[0].body).toEqual({ p_task_id: 'task-open', p_status: 'in_progress' });
  await expect(page.locator('#pageStatus')).toContainText('Задача принята в работу');
  expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
  await expectNoRuntimeFailures(failures, testInfo, 'task-action-cold-start');
});

test('completion requires a concrete result before any mutation', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page);
  await openPage(page, fixture);
  await waitForGuard(page, '#progressTaskDone');

  await page.locator('#progressTaskDone').click();
  await expect(page.locator('#pageStatus')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#pageStatus')).toContainText('укажите результат задачи');
  await expect(page.locator('[data-task-completion-result="task-progress"]')).toBeFocused();
  expect(calls.mutationCalls).toHaveLength(0);
  await expectNoRuntimeFailures(failures, testInfo, 'task-completion-result-required');
});

test('completion saves team result first and then marks the task done', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page);
  await openPage(page, fixture);
  await waitForGuard(page, '#progressTaskDone');

  await page.locator('[data-task-completion-result="task-progress"]').fill('Стороны подтвердили аккредитив и срок раскрытия.');
  await page.locator('#progressTaskDone').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(2);

  expect(calls.mutationCalls[0].kind).toBe('comment');
  expect(calls.mutationCalls[0].url).toContain('/rpc/nav_v2_add_comment');
  expect(calls.mutationCalls[0].body).toEqual({
    p_deal_id: 'deal-1',
    p_body: 'Результат задачи «Согласовать порядок расчётов»: Стороны подтвердили аккредитив и срок раскрытия.',
    p_visibility: 'team'
  });
  expect(calls.mutationCalls[1].kind).toBe('task');
  expect(calls.mutationCalls[1].body).toEqual({ p_task_id: 'task-progress', p_status: 'done' });
  await expect(page.locator('#pageStatus')).toContainText('Результат сохранён, задача завершена');
  expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
  await expectNoRuntimeFailures(failures, testInfo, 'task-completion-with-result');
});

test('status failure after saved result is recoverable without duplicate comment', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page, { taskStatuses: [400, 200] });
  await openPage(page, fixture);
  await waitForGuard(page, '#progressTaskDone');

  await page.locator('[data-task-completion-result="task-progress"]').fill('Банк подтвердил условия и направил финальный расчёт.');
  await page.locator('#progressTaskDone').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(2);
  await expect(page.locator('#pageStatus')).toContainText('комментарий не будет продублирован');
  await expect(page.locator('#progressTaskDone')).toBeEnabled();

  await page.locator('#progressTaskDone').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(3);
  expect(calls.mutationCalls.filter((call) => call.kind === 'comment')).toHaveLength(1);
  expect(calls.mutationCalls.filter((call) => call.kind === 'task')).toHaveLength(2);
  await expect(page.locator('#pageStatus')).toContainText('Результат сохранён, задача завершена');
  await expectNoRuntimeFailures(unexpectedMockFailures(failures), testInfo, 'task-completion-retry');
});

test('comment failure blocks completion and keeps the task in progress', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page, { commentStatuses: [500] });
  await openPage(page, fixture);
  await waitForGuard(page, '#progressTaskDone');

  await page.locator('[data-task-completion-result="task-progress"]').fill('Документ получен и передан юристу на проверку.');
  await page.locator('#progressTaskDone').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(1);
  expect(calls.mutationCalls[0].kind).toBe('comment');
  await expect(page.locator('#pageStatus')).toContainText('Статус не изменён');
  await expect(page.locator('#progressTaskDone')).toBeEnabled();
  await expectNoRuntimeFailures(unexpectedMockFailures(failures), testInfo, 'task-completion-comment-failure');
});

test('permission denial explains the responsible role and never mutates the task', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page, { canChange: false, assignedRole: 'lawyer', permissionDelay: 220 });
  await openPage(page, fixture);

  await page.locator('#openTaskStart').click();
  await expect(page.locator('#pageStatus')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#pageStatus')).toContainText('юрист');
  await expect(page.locator('#openTaskStart')).toBeDisabled();
  await expect(page.locator('#openTaskItem [data-task-permission-hint]')).toContainText('ответственному специалисту');
  expect(calls.mutationCalls).toHaveLength(0);
  expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
  await expectNoRuntimeFailures(failures, testInfo, 'task-action-denied');
});

test('permission lookup failure is assertive and leaves the task visible', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page, { permissionDelay: 150, permissionStatus: 500 });
  await openPage(page, fixture);

  await page.locator('#openTaskStart').click();
  await expect(page.locator('#pageStatus')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#pageStatus')).toHaveAttribute('aria-live', 'assertive');
  await expect(page.locator('#pageStatus')).toContainText('Не удалось проверить права');
  await expect(page.locator('#openTaskItem')).toBeVisible();
  expect(calls.mutationCalls).toHaveLength(0);
  await expectNoRuntimeFailures(unexpectedMockFailures(failures), testInfo, 'task-action-permission-error');
});

test('legacy start mutation error restores the relevant control', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page, { taskStatuses: [400] });
  await openPage(page, fixture);
  await waitForGuard(page, '#openTaskStart');

  await page.locator('#openTaskStart').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(1);
  expect(calls.mutationCalls[0].body).toEqual({ p_task_id: 'task-open', p_status: 'in_progress' });
  await expect(page.locator('#pageStatus')).toContainText('Сервер временно не сохранил задачу');
  await expect(page.locator('#openTaskStart')).toBeEnabled();
  await expect(page.locator('#openTaskStart')).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
  await expectNoRuntimeFailures(unexpectedMockFailures(failures), testInfo, 'task-action-start-error');
});

test('done legacy task can be returned to work through the existing status RPC', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = await routeTaskRpc(page);
  await openPage(page, fixture);
  await waitForGuard(page, '#doneTaskReopen');

  await page.locator('#doneTaskReopen').click();
  await expect.poll(() => calls.mutationCalls.length).toBe(1);
  expect(calls.mutationCalls[0].body).toEqual({ p_task_id: 'task-done', p_status: 'open' });
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
