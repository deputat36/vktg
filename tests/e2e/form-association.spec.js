import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-form-association.html';

async function expectHelpAssociation(page, field) {
  const describedBy = await field.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  const firstHelpId = describedBy.split(' ')[0];
  await expect(page.locator(`#${firstHelpId}`)).not.toHaveText('');
}

test('all bounded fields have programmatic labels and help associations', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const search = page.locator('#dealSearch');
  const filter = page.locator('#dealFilter');
  const status = page.locator('#dealStatus');
  const comment = page.locator('#newComment');
  const completion = page.locator('#spnReworkCompletionText');
  const reason = page.locator('#spnReworkReturnReason');
  const lawyerNote = page.locator('#lawyerDocumentNoteV2');

  await expect(search).toHaveAccessibleName('Поиск сделок');
  await expect(filter).toHaveAccessibleName('Режим списка сделок');
  await expect(status).toHaveAccessibleName('Текущий статус');
  await expect(comment).toHaveAccessibleName('Новый комментарий');
  await expect(completion).toHaveAccessibleName('Что именно исправлено');
  await expect(reason).toHaveAccessibleName('Главная причина или другое замечание');
  await expect(lawyerNote).toHaveAccessibleName('Комментарий к действию');

  for (const field of [search, filter, status, comment, completion, reason, lawyerNote]) await expectHelpAssociation(page, field);

  await expect(search).toHaveAccessibleDescription('Ищет по адресу, объекту, клиенту, СПН, статусу или идентификатору сделки.');
  await expect(filter).toHaveAccessibleDescription('Ограничивает рабочую очередь выбранным режимом, не изменяя данные сделок.');
  await expect(search).toHaveAttribute('aria-required', 'false');
  await expect(filter).toHaveAttribute('aria-required', 'false');
  await expect(status).toHaveAttribute('aria-required', 'true');
  await expect(comment).toHaveAttribute('aria-required', 'true');
  await expect(completion).toHaveAttribute('aria-required', 'true');
  await expect(reason).toHaveAttribute('aria-required', 'false');
  await expect(lawyerNote).toHaveAttribute('aria-required', 'false');
  await expect(page.getByRole('group', { name: 'Замечания для возврата СПН' })).toHaveCount(1);
  await expectNoRuntimeFailures(failures, testInfo, 'form-association-labels');
});

test('SPN completion error is associated and clears after correction', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const field = page.locator('#spnReworkCompletionText');
  const status = page.locator('#spnReworkStatusV2');
  await page.locator('#spnSubmit').click();

  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-errormessage', 'spnReworkStatusV2');
  await expect(status).toContainText('Перечислите');

  await field.fill('Исправлено и сохранено');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(field).not.toHaveAttribute('aria-errormessage', /.+/);
  await expectNoRuntimeFailures(failures, testInfo, 'form-association-spn-completion');
});

test('return reason accepts a selected alternative without false invalid state', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const field = page.locator('#spnReworkReturnReason');
  await page.locator('#spnReturn').click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');

  await page.locator('#returnOption').check();
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(field).not.toHaveAttribute('aria-errormessage', /.+/);
  await expectNoRuntimeFailures(failures, testInfo, 'form-association-return-alternative');
});

test('lawyer problem note is conditionally required', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const field = page.locator('#lawyerDocumentNoteV2');
  await page.locator('#lawyerProblem').click();
  await expect(field).toHaveAttribute('aria-required', 'true');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-errormessage', 'lawyerDocumentStatusV2');

  await field.fill('Есть проблема');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');

  await field.fill('');
  await page.locator('#lawyerReceived').click();
  await expect(field).toHaveAttribute('aria-required', 'false');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expectNoRuntimeFailures(failures, testInfo, 'form-association-lawyer-conditional');
});

test('server error does not invalidate a valid field', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const field = page.locator('#lawyerDocumentNoteV2');
  const status = page.locator('#lawyerDocumentStatusV2');
  await field.fill('Конкретная проблема');
  await page.locator('#lawyerProblem').click();
  await expect(status).toContainText('Сервер временно не ответил.');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(field).not.toHaveAttribute('aria-errormessage', /.+/);
  await expect(field).toHaveValue('Конкретная проблема');
  await expectNoRuntimeFailures(failures, testInfo, 'form-association-server-error');
});

test('empty team comment is associated and clears after input', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, fixture);

  const field = page.locator('#newComment');
  await page.locator('#addComment').click();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-errormessage', 'pageStatus');

  await field.fill('Следующий шаг согласован');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(field).not.toHaveAttribute('aria-errormessage', /.+/);
  await expectNoRuntimeFailures(failures, testInfo, 'form-association-comment');
});
