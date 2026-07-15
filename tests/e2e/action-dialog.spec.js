import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-action-dialog.html';

test('risk dialog exposes action context and restores focus after Escape', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const trigger = page.locator('#resolveRisk');
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Устранить риск', exact: true });
  const note = page.getByRole('textbox', { name: 'Комментарий к изменению риска', exact: true });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toHaveAccessibleDescription(/Риск будет отмечен как устранён/);
  await expect(dialog).toContainText('Риск: Не согласованы расчёты');
  await expect(dialog).toContainText('Это демо-сделка');
  await expect(note).toHaveAccessibleDescription(/Необязательно/);
  await expect(page.getByRole('button', { name: 'Отмена', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Устранить риск', exact: true })).toHaveCount(2);

  await note.fill('Проверено по документам');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('data-confirmed', 'false');

  await trigger.click();
  await expect(page.getByRole('textbox', { name: 'Комментарий к изменению риска', exact: true })).toHaveValue('Проверено по документам');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(trigger).toBeFocused();
  await expectNoRuntimeFailures(failures, testInfo, 'action-dialog-escape-focus');
});

test('risk note survives server-error simulation and clears only after success', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const trigger = page.locator('#resolveRisk');
  await trigger.click();
  await page.getByRole('textbox', { name: 'Комментарий к изменению риска', exact: true }).fill('Расчёты согласованы');
  await page.getByRole('button', { name: 'Устранить риск', exact: true }).last().click();

  await expect(trigger).toHaveAttribute('data-confirmed', 'true');
  await expect(trigger).toHaveAttribute('data-note', 'Расчёты согласованы');
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(page.getByRole('textbox', { name: 'Комментарий к изменению риска', exact: true })).toHaveValue('Расчёты согласованы');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();

  await page.locator('#simulateSuccess').check();
  await trigger.click();
  await expect(page.getByRole('textbox', { name: 'Комментарий к изменению риска', exact: true })).toHaveValue('Расчёты согласованы');
  await page.getByRole('button', { name: 'Устранить риск', exact: true }).last().click();
  await expect(trigger).toHaveAttribute('data-confirmed', 'true');

  await trigger.click();
  await expect(page.getByRole('textbox', { name: 'Комментарий к изменению риска', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expectNoRuntimeFailures(failures, testInfo, 'action-dialog-draft-lifecycle');
});

test('required input stays in dialog with a linked error until corrected', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const trigger = page.locator('#requiredReason');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Укажите причину', exact: true });
  const field = page.getByRole('textbox', { name: 'Причина действия', exact: true });
  const confirm = page.getByRole('button', { name: 'Продолжить', exact: true });

  await confirm.click();
  await expect(dialog).toHaveCount(1);
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-errormessage', /InputError$/);
  await expect(page.getByRole('alert')).toHaveText('Введите причину минимум из 5 символов.');
  await expect(field).toBeFocused();

  await field.fill('Нет');
  await confirm.click();
  await expect(dialog).toHaveCount(1);
  await expect(field).toHaveAttribute('aria-invalid', 'true');

  await field.fill('Причина указана');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toHaveAttribute('data-confirmed', 'true');
  await expect(trigger).toHaveAttribute('data-note', 'Причина указана');
  await expect(trigger).toBeFocused();
  await expectNoRuntimeFailures(failures, testInfo, 'action-dialog-required-input');
});

test('reopen action has its own stable title and no positive tabindex', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  await page.locator('#reopenRisk').click();
  const dialog = page.getByRole('dialog', { name: 'Вернуть риск в работу', exact: true });
  await expect(dialog).toHaveAccessibleDescription(/Риск снова станет открытым/);
  await expect(page.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveCount(0);
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expectNoRuntimeFailures(failures, testInfo, 'action-dialog-reopen');
});
