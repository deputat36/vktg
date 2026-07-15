import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-accessible-dialog.html?id=deal-1';
const rpcPattern = '**/rest/v1/rpc/**';

async function routeRpc(page, handler) {
  await page.route(rpcPattern, async (route) => {
    const request = route.request();
    await handler(route, request);
  });
}

async function fulfillJson(route, payload = {}) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

test('blocker handoff dialog explains context and Escape cancels without mutation', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const rpcCalls = [];
  await routeRpc(page, async (route, request) => {
    rpcCalls.push(request.url());
    await fulfillJson(route);
  });
  await openPage(page, fixture);

  const trigger = page.locator('#lawyerHandoff');
  await trigger.focus();
  await trigger.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Передать юристу с незакрытыми пунктами?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Не хватает обязательных документов: 2.');
  await expect(dialog).toContainText('Есть красные риски: 1.');
  await page.keyboard.press('Escape');

  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(rpcCalls).toHaveLength(0);
  await expectNoRuntimeFailures(failures, testInfo, 'accessible-dialog-handoff-cancel');
});

test('document problem requires a reason and sends the existing RPC payload', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = [];
  await routeRpc(page, async (route, request) => {
    calls.push({ url: request.url(), body: request.postDataJSON() });
    await fulfillJson(route, {});
  });
  await openPage(page, fixture);

  await page.locator('#documentProblem').click();
  const dialog = page.getByRole('dialog', { name: 'Зафиксировать проблему документа' });
  const input = dialog.getByRole('textbox', { name: 'Что не так с документом' });
  const confirm = dialog.getByRole('button', { name: 'Сохранить проблему' });

  await confirm.click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('alert')).toContainText('Заполните обязательную причину');
  expect(calls).toHaveLength(0);

  await input.fill('На выписке отсутствует подпись');
  await confirm.click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].url).toContain('/rpc/nav_v2_update_document_workflow');
  expect(calls[0].body).toEqual({
    p_document_id: 'doc-1',
    p_status: 'problem',
    p_assigned_to: null,
    p_responsible_role: null,
    p_due_date: null,
    p_note: 'На выписке отсутствует подпись'
  });
  await expectNoRuntimeFailures(failures, testInfo, 'accessible-dialog-document-problem');
});

test('risk dialog keeps optional comment after server error and restores focus on cancel', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = [];
  await routeRpc(page, async (route, request) => {
    calls.push({ url: request.url(), body: request.postDataJSON() });
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Сервер временно не ответил.' })
    });
  });
  await openPage(page, fixture);

  const trigger = page.locator('#riskResolve');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: /Подтвердить изменение риска: Устранить риск/ });
  const input = dialog.getByRole('textbox', { name: 'Комментарий к изменению риска' });
  await input.fill('Согласие получено и загружено');
  await dialog.getByRole('button', { name: 'Подтвердить изменение' }).click();

  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue('Согласие получено и загружено');
  await expect(dialog.getByRole('alert')).toContainText('Сервер временно не ответил.');
  expect(calls[0].url).toContain('/rpc/nav_v2_update_risk_resolution');
  expect(calls[0].body).toEqual({
    p_risk_id: 'risk-1',
    p_is_resolved: true,
    p_note: 'Согласие получено и загружено'
  });

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectNoRuntimeFailures(failures, testInfo, 'accessible-dialog-risk-recovery');
});

test('demo controlled action includes explicit test-data context', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await routeRpc(page, async (route) => fulfillJson(route));
  await openPage(page, `${fixture}&demo=1`);

  await page.locator('#documentProblem').click();
  const dialog = page.getByRole('dialog', { name: 'Зафиксировать проблему документа' });
  await expect(dialog).toContainText('Это демо-сделка');
  await dialog.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.locator('#documentProblem')).toBeFocused();
  await expectNoRuntimeFailures(failures, testInfo, 'accessible-dialog-demo-context');
});

test('dialog keeps keyboard focus inside its controls', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await routeRpc(page, async (route) => fulfillJson(route));
  await openPage(page, fixture);

  await page.locator('#documentProblem').click();
  const dialog = page.getByRole('dialog', { name: 'Зафиксировать проблему документа' });
  const input = dialog.getByRole('textbox', { name: 'Что не так с документом' });
  const cancel = dialog.getByRole('button', { name: 'Отменить' });
  const confirm = dialog.getByRole('button', { name: 'Сохранить проблему' });

  await expect(input).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await cancel.click();
  await expectNoRuntimeFailures(failures, testInfo, 'accessible-dialog-focus-trap');
});
