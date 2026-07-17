import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-task-role-matrix-rehearsal.html?id=deal-role-matrix';
const rpcPattern = '**/rest/v1/rpc/**';

const scenarios = [
  { name: 'owner', role: 'owner', legacy: true, complete: true, decision: true },
  { name: 'admin', role: 'admin', legacy: true, complete: true, decision: true },
  { name: 'manager', role: 'manager', legacy: true, complete: true, decision: true },
  { name: 'spn_assigned', role: 'spn', legacy: true, complete: true, decision: false },
  { name: 'lawyer_assigned', role: 'lawyer', legacy: true, complete: true, decision: false },
  { name: 'broker_assigned', role: 'broker', legacy: true, complete: true, decision: false },
  { name: 'viewer', role: 'viewer', legacy: false, complete: false, decision: false },
  { name: 'spn_unassigned', role: 'spn', legacy: false, complete: false, decision: false }
];

function permissionPayload(scenario) {
  return {
    tasks: [
      {
        id: 'task-role-legacy',
        assigned_role: scenario.role,
        can_change_status: scenario.legacy
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        task_contract_version: 2,
        assigned_role: scenario.role,
        can_change_status: false,
        can_start: false,
        can_complete: scenario.complete,
        can_set_active_outcome: false,
        can_propose_terminal_outcome: false,
        can_decide_terminal_outcome: false
      },
      {
        id: '20000000-0000-4000-8000-000000000003',
        task_contract_version: 2,
        assigned_role: scenario.role,
        outcome_state: 'proposed',
        can_change_status: false,
        can_start: false,
        can_complete: false,
        can_set_active_outcome: false,
        can_propose_terminal_outcome: false,
        can_decide_terminal_outcome: scenario.decision
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

async function routeRoleMatrixRpc(page, scenario) {
  const permissionCalls = [];
  const legacyMutationCalls = [];
  const boundedMutationCalls = [];

  await page.route(rpcPattern, async (route) => {
    const request = route.request();
    const url = request.url();
    const body = request.postDataJSON();

    if (url.includes('/rpc/nav_v2_get_deal_card_lite')) {
      permissionCalls.push({ url, body });
      await fulfillJson(route, permissionPayload(scenario));
      return;
    }

    if (url.includes('/rpc/nav_v2_update_task_status')) {
      legacyMutationCalls.push({ url, body });
      await fulfillJson(route, {});
      return;
    }

    if (
      url.includes('/rpc/nav_v2_start_bounded_task')
      || url.includes('/rpc/nav_v2_complete_bounded_task')
      || url.includes('/rpc/nav_v2_set_bounded_task_active_outcome')
      || url.includes('/rpc/nav_v2_propose_bounded_task_terminal_outcome')
      || url.includes('/rpc/nav_v2_decide_bounded_task_terminal_outcome')
    ) {
      boundedMutationCalls.push({ url, body });
      await fulfillJson(route, {});
      return;
    }

    await fulfillJson(route, {});
  });

  return { permissionCalls, legacyMutationCalls, boundedMutationCalls };
}

for (const scenario of scenarios) {
  test(`${scenario.name}: role-scoped DTO controls the legacy action through the single authoritative handler`, async ({ page }, testInfo) => {
    const failures = captureRuntimeFailures(page);
    const calls = await routeRoleMatrixRpc(page, scenario);
    await openPage(page, `${fixture}&scenario=${scenario.name}`);

    const button = page.locator('#legacyDone');
    if (scenario.legacy) {
      await expect(button).toHaveAttribute('data-task-action-guard', 'ready');
      await button.click();
      await expect.poll(() => calls.legacyMutationCalls.length).toBe(1);
      expect(calls.legacyMutationCalls[0].body).toEqual({
        p_task_id: 'task-role-legacy',
        p_status: 'done'
      });
    } else {
      await expect(button).toBeDisabled();
      expect(calls.legacyMutationCalls).toHaveLength(0);
    }

    expect(calls.permissionCalls).toHaveLength(1);
    expect(calls.boundedMutationCalls).toHaveLength(0);
    expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
    await expectNoRuntimeFailures(failures, testInfo, `task-role-matrix-legacy-${scenario.name}`);
  });

  test(`${scenario.name}: bounded completion follows DTO permission but never enables network transport`, async ({ page }, testInfo) => {
    const failures = captureRuntimeFailures(page);
    const calls = await routeRoleMatrixRpc(page, scenario);
    await openPage(page, `${fixture}&scenario=${scenario.name}`);

    const complete = page.locator('#boundedDone');
    const reopen = page.locator('#boundedReopen');

    if (scenario.complete) {
      await expect(complete).toHaveAttribute('data-task-action-guard', 'ready');
      await complete.click();
      await expect(page.locator('#pageStatus')).toContainText('сохранение ещё не включено');
    } else {
      await expect(complete).toBeDisabled();
    }

    await expect(reopen).toBeDisabled();
    expect(calls.legacyMutationCalls).toHaveLength(0);
    expect(calls.boundedMutationCalls).toHaveLength(0);
    expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
    await expectNoRuntimeFailures(failures, testInfo, `task-role-matrix-complete-${scenario.name}`);
  });

  test(`${scenario.name}: terminal outcome decision is manager-owner-admin only and transport-free`, async ({ page }, testInfo) => {
    const failures = captureRuntimeFailures(page);
    const calls = await routeRoleMatrixRpc(page, scenario);
    await openPage(page, `${fixture}&scenario=${scenario.name}`);

    const decision = page.locator('#boundedDecision');
    if (scenario.decision) {
      await expect(decision).toHaveAttribute('data-task-action-guard', 'ready');
      await decision.click();
      await expect(page.locator('#pageStatus')).toContainText('сохранение ещё не включено');
    } else {
      await expect(decision).toBeDisabled();
    }

    expect(calls.legacyMutationCalls).toHaveLength(0);
    expect(calls.boundedMutationCalls).toHaveLength(0);
    expect(await page.evaluate(() => window.__baseTaskHandlerCalls)).toBe(0);
    await expectNoRuntimeFailures(failures, testInfo, `task-role-matrix-decision-${scenario.name}`);
  });
}

test('role matrix rehearsal is mocked evidence and must not be reported as real authenticated or RLS proof', async ({ page }) => {
  const scenario = scenarios[0];
  const calls = await routeRoleMatrixRpc(page, scenario);
  await openPage(page, `${fixture}&scenario=${scenario.name}`);

  await expect(page.locator('#scenarioLabel')).toContainText('Это не реальная авторизация или RLS-проверка');
  expect(calls.permissionCalls).toHaveLength(1);
  expect(calls.legacyMutationCalls).toHaveLength(0);
  expect(calls.boundedMutationCalls).toHaveLength(0);
});
