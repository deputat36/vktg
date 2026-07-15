import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-document-problem-dialog.html';
const rpcPattern = '**/rest/v1/rpc/**';
const expectedMockedHttp400 = 'console.error: Failed to load resource: the server responded with a status of 400 (Bad Request)';

async function routeRpc(page, handler) {
  await page.route(rpcPattern, async (route) => handler(route, route.request()));
}

async function fulfillJson(route, payload = {}) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  });
}

test('document problem dialog shows document context and Escape keeps draft without mutation', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = [];
  await routeRpc(page, async (route, request) => {
    calls.push(request.url());
    await fulfillJson(route);
  });
  await openPage(page, fixture);

  const trigger = page.locator('#documentProblem');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Зафиксировать проблему документа' });
  const input = dialog.getByRole('textbox', { name: 'Что не так с документом' });

  await expect(dialog).toHaveAccessibleDescription(/Укажите конкретную причину/);
  await expect(dialog).toContainText('Документ: Выписка ЕГРН');
  await expect(dialog).toContainText('Новое состояние: Проблема');
  await input.fill('Не читается подпись регистратора');
  await page.keyboard.press('Escape');

  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(calls).toHaveLength(0);

  await trigger.click();
  await expect(page.getByRole('textbox', { name: 'Что не так с документом' })).toHaveValue('Не читается подпись регистратора');
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expectNoRuntimeFailures(failures, testInfo, 'document-problem-dialog-cancel');
});

test('required document reason stays inside dialog until corrected', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = [];
  await routeRpc(page, async (route, request) => {
    calls.push(request.url());
    await fulfillJson(route);
  });
  await openPage(page, fixture);

  await page.locator('#documentProblem').click();
  const dialog = page.getByRole('dialog', { name: 'Зафиксировать проблему документа' });
  const input = dialog.getByRole('textbox', { name: 'Что не так с документом' });
  await dialog.getByRole('button', { name: 'Сохранить проблему' }).click();

  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute('aria-errormessage', /navActionDialog\d+InputError/);
  await expect(dialog.getByRole('alert')).toContainText('Укажите короткую причину проблемы документа.');
  expect(calls).toHaveLength(0);

  await input.fill('Отсутствует читаемая подпись');
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expectNoRuntimeFailures(failures, testInfo, 'document-problem-dialog-required');
});

test('server error preserves document reason for a repeat attempt', async ({ page }, testInfo) => {
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

  const trigger = page.locator('#documentProblem');
  await trigger.click();
  const input = page.getByRole('textbox', { name: 'Что не так с документом' });
  await input.fill('В выписке неверно указана площадь');
  await page.getByRole('button', { name: 'Сохранить проблему' }).click();

  await expect.poll(() => calls.length).toBe(1);
  await expect(page.locator('#pageStatus')).toContainText('Сервер временно не ответил.');
  expect(calls[0].url).toContain('/rpc/nav_v2_update_document_workflow');
  expect(calls[0].body).toEqual({
    p_document_id: 'doc-1',
    p_status: 'problem',
    p_assigned_to: null,
    p_responsible_role: null,
    p_due_date: null,
    p_note: 'В выписке неверно указана площадь'
  });

  await trigger.click();
  await expect(page.getByRole('textbox', { name: 'Что не так с документом' })).toHaveValue('В выписке неверно указана площадь');
  await page.getByRole('button', { name: 'Отмена' }).click();
  const unexpectedFailures = failures.filter((failure) => failure !== expectedMockedHttp400);
  await expectNoRuntimeFailures(unexpectedFailures, testInfo, 'document-problem-dialog-server-error');
});

test('successful document problem uses the existing RPC payload', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const calls = [];
  await routeRpc(page, async (route, request) => {
    calls.push({ url: request.url(), body: request.postDataJSON() });
    await fulfillJson(route, {});
  });
  await openPage(page, fixture);

  await page.locator('#documentProblem').click();
  await page.getByRole('textbox', { name: 'Что не так с документом' }).fill('Нет подписи собственника');
  await page.getByRole('button', { name: 'Сохранить проблему' }).click();

  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].url).toContain('/rpc/nav_v2_update_document_workflow');
  expect(calls[0].body).toEqual({
    p_document_id: 'doc-1',
    p_status: 'problem',
    p_assigned_to: null,
    p_responsible_role: null,
    p_due_date: null,
    p_note: 'Нет подписи собственника'
  });
  await expectNoRuntimeFailures(failures, testInfo, 'document-problem-dialog-success');
});

test('demo document dialog includes explicit test-data context', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await routeRpc(page, async (route) => fulfillJson(route));
  await openPage(page, `${fixture}?demo=1`);

  const trigger = page.locator('#documentProblem');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Зафиксировать проблему документа' });
  await expect(dialog).toContainText('Это демо-сделка');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(trigger).toBeFocused();
  await expectNoRuntimeFailures(failures, testInfo, 'document-problem-dialog-demo');
});
