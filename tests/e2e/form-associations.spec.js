import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-form-associations.html';

test('deal filters receive stable names and field-specific help', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}?surface=deals`);

  const search = page.getByRole('textbox', { name: 'Поиск сделок' });
  const filter = page.getByRole('combobox', { name: 'Режим списка сделок' });
  await expect(search).toHaveCount(1);
  await expect(filter).toHaveCount(1);
  await expect(search).toHaveAccessibleDescription('Ищет по адресу, объекту, клиенту, СПН, статусу или идентификатору сделки.');
  await expect(filter).toHaveAccessibleDescription('Ограничивает рабочую очередь выбранным режимом, не изменяя данные сделок.');
  await expect(search).toHaveAttribute('aria-describedby', 'dealSearchHelp');
  await expect(filter).toHaveAttribute('aria-describedby', 'dealFilterHelp');
  await expect(page.locator('[data-nav-field-help="true"]')).toHaveCount(2);

  const unknown = page.locator('#unknownPlaceholderOnly');
  await expect(unknown).not.toHaveAttribute('aria-label', /.+/);
  await expect(unknown).not.toHaveAttribute('aria-describedby', /.+/);
  await expectNoRuntimeFailures(failures, testInfo, 'form-associations-deals');
});

test('visual labels are connected and permanent help stays separate from global status', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}?surface=deal-card`);

  const status = page.getByRole('combobox', { name: 'Текущий статус' });
  const comment = page.getByRole('textbox', { name: 'Новый комментарий' });
  await expect(status).toHaveCount(1);
  await expect(comment).toHaveCount(1);
  await expect(page.locator('label', { hasText: 'Текущий статус' })).toHaveAttribute('for', 'dealStatus');
  await expect(page.locator('label', { hasText: 'Новый комментарий' })).toHaveAttribute('for', 'newComment');
  await expect(status).toHaveAttribute('aria-describedby', 'dealStatusHelp');
  await expect(comment).toHaveAttribute('aria-describedby', 'newCommentHelp');
  await expect(status).not.toHaveAttribute('aria-invalid', /.+/);
  await expect(comment).not.toHaveAttribute('aria-invalid', /.+/);
  await expectNoRuntimeFailures(failures, testInfo, 'form-associations-labels');
});

test('empty comment links its local error and editing restores help-only description', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}?surface=deal-card`);

  const comment = page.getByRole('textbox', { name: 'Новый комментарий' });
  await page.locator('#addComment').click();
  await expect(comment).toHaveAttribute('aria-invalid', 'true');
  await expect(comment).toHaveAttribute('aria-describedby', 'newCommentHelp pageStatus');
  await expect(comment).toHaveAccessibleDescription(/Комментарий увидят участники команды сделки\. Комментарий пустой\./);

  await comment.fill('Уточнил срок получения выписки.');
  await expect(comment).not.toHaveAttribute('aria-invalid', /.+/);
  await expect(comment).toHaveAttribute('aria-describedby', 'newCommentHelp');
  await expect(comment).toHaveAccessibleDescription('Комментарий увидят участники команды сделки.');
  await expectNoRuntimeFailures(failures, testInfo, 'form-associations-comment-recovery');
});

test('rework and document validation attach only the relevant status then clear after correction', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await openPage(page, `${fixture}?surface=deal-card`);

  const completion = page.getByRole('textbox', { name: 'Что именно исправлено' });
  await page.locator('[data-spn-rework-submit]').click();
  await expect(completion).toHaveAttribute('aria-invalid', 'true');
  await expect(completion).toHaveAttribute('aria-describedby', 'spnReworkCompletionHelp spnReworkStatusV2');
  await completion.fill('Добавлена выписка и уточнён порядок расчётов.');
  await expect(completion).toHaveAttribute('aria-describedby', 'spnReworkCompletionHelp');

  const reason = page.getByRole('textbox', { name: 'Главная причина или другое замечание' });
  await page.locator('[data-spn-rework-return]').click();
  await expect(reason).toHaveAttribute('aria-invalid', 'true');
  await expect(reason).toHaveAttribute('aria-describedby', 'spnReworkReturnHelp spnReworkStatusV2');
  await page.locator('[data-spn-rework-option]').check();
  await expect(reason).not.toHaveAttribute('aria-invalid', /.+/);
  await expect(reason).toHaveAttribute('aria-describedby', 'spnReworkReturnHelp');

  const note = page.getByRole('textbox', { name: 'Комментарий к действию' });
  await page.locator('[data-lawyer-document-action]').click();
  await expect(note).toHaveAttribute('aria-invalid', 'true');
  await expect(note).toHaveAttribute('aria-describedby', 'lawyerDocumentNoteHelpV2 lawyerDocumentStatusV2');
  await note.fill('Нет подписи собственника.');
  await expect(note).not.toHaveAttribute('aria-invalid', /.+/);
  await expect(note).toHaveAttribute('aria-describedby', 'lawyerDocumentNoteHelpV2');
  await expectNoRuntimeFailures(failures, testInfo, 'form-associations-workflows');
});
