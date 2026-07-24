import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const pagePath = '/deal-card-v2.html?id=deal-actionable-route';
const rpcPattern = '**/rest/v1/rpc/**';

const profile = {
  id: 'spn-route-user',
  email: 'spn-route@example.test',
  full_name: 'СПН Тест',
  role: 'spn',
  phone: null,
  manager_id: 'manager-route'
};

const otherRoleTask = {
  id: 'task-lawyer-urgent',
  deal_id: 'deal-actionable-route',
  title: 'Срочно проверить юридический риск',
  description: 'Эта задача принадлежит юристу и остаётся видимой для контроля.',
  status: 'open',
  priority: 'urgent',
  due_date: '2026-07-01',
  assigned_to: null,
  assigned_role: 'lawyer',
  source: 'auto_lawyer',
  task_contract_version: null,
  can_change_status: false
};

const ownTask = {
  id: 'task-spn-actionable',
  deal_id: 'deal-actionable-route',
  title: 'Получить согласование клиента',
  description: 'Связаться с клиентом и зафиксировать согласованный вариант.',
  status: 'open',
  priority: 'normal',
  due_date: '2026-07-24',
  assigned_to: profile.id,
  assigned_role: 'spn',
  source: 'manual',
  task_contract_version: null,
  can_change_status: true
};

const cardPayload = {
  profile,
  deal: {
    id: 'deal-actionable-route',
    title: 'Тест маршрута задач',
    display_title: 'Квартира — проверка маршрута задач',
    status: 'draft',
    object_type: 'flat_mkd',
    address: 'Тестовый адрес',
    risk_level: 'yellow',
    readiness_deposit: 40,
    readiness_deal: 30,
    next_action: 'Выполнить ближайшую задачу',
    created_at: '2026-07-20T10:00:00Z',
    manager_id: 'manager-route',
    seller_spn_id: profile.id,
    lawyer_needed: true,
    broker_needed: false,
    expenses_agreed: false,
    settlements_agreed: false
  },
  participants: [],
  risks: [],
  documents: [],
  expenses: [],
  tasks: [otherRoleTask, ownTask],
  comments: [],
  reviews: [],
  events: []
};

async function fulfillJson(route, payload = {}, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function mockNavigator(page) {
  const mutations = [];
  await page.addInitScript(({ profileId }) => {
    localStorage.setItem('nav_session_v2', JSON.stringify({
      access_token: 'fixture-access-token',
      refresh_token: 'fixture-refresh-token',
      user: { id: profileId, email: 'spn-route@example.test' }
    }));
  }, { profileId: profile.id });

  await page.route(rpcPattern, async (route) => {
    const request = route.request();
    const rpcName = new URL(request.url()).pathname.split('/').pop();
    const body = request.postDataJSON();

    if (rpcName === 'nav_v2_get_deal_card') return fulfillJson(route, cardPayload);
    if (rpcName === 'nav_v2_get_my_profile') return fulfillJson(route, { profile });
    if (rpcName === 'nav_v2_get_deal_card_lite') return fulfillJson(route, { tasks: [otherRoleTask, ownTask] });
    if (rpcName === 'nav_v2_update_task_status') {
      mutations.push({ rpcName, body });
      return fulfillJson(route, { ok: true, task_id: body.p_task_id, status: body.p_status });
    }
    if (rpcName === 'nav_v2_get_deal_responsibility_snapshot') return fulfillJson(route, {});
    if (rpcName === 'nav_v2_get_handoff_scores') return fulfillJson(route, {});
    return fulfillJson(route, {});
  });

  return mutations;
}

test('main action selects the current user task and routes to its enabled control', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const mutations = await mockNavigator(page);
  await openPage(page, pagePath);

  await expect(page.locator('#dealActionFocusTitle')).toHaveText('Получить согласование клиента');
  await expect(page.locator('#dealActionFocus')).toContainText('ваша задача');
  const primary = page.locator('#dealActionFocus [data-action-focus-task="task-spn-actionable"]');
  await expect(primary).toHaveText('Начать эту задачу');

  await primary.click();
  await expect(page.locator('[data-tab="tasks"]')).toHaveClass(/active/);

  const startButton = page.locator('button[data-task-id="task-spn-actionable"][data-task-action-guard="ready"]');
  await expect(startButton).toBeVisible();
  await expect(startButton).toBeEnabled();
  await expect(startButton).toHaveText('Начать работу');
  await expect(startButton).toBeFocused();
  await expect(page.locator('text=Эта задача принадлежит юристу')).toBeVisible();

  await startButton.click();
  await expect.poll(() => mutations.length).toBe(1);
  expect(mutations[0]).toEqual({
    rpcName: 'nav_v2_update_task_status',
    body: { p_task_id: 'task-spn-actionable', p_status: 'in_progress' }
  });
  await expect(page.locator('#pageStatus')).toContainText('Задача принята в работу');
  await expectNoRuntimeFailures(failures, testInfo, 'actionable-task-route');
});
