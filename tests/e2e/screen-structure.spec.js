import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-screen-structure.html';

async function expectSingleNamedMain(page, surface, title) {
  await openPage(page, `${fixture}?surface=${surface}`);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.getByRole('main', { name: title })).toHaveCount(1);
}

test('dashboard exposes one named main and labelled action sections', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await expectSingleNamedMain(page, 'dashboard', 'Рабочий стол менеджера');

  await expect(page.getByRole('region', { name: 'Что делать сейчас' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Быстрые действия' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Последние сделки' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Показатели рабочего стола' })).toHaveCount(1);
  await expect(page.getByRole('article', { name: 'Сделка на Просторной' })).toHaveCount(1);
  await expect(page.locator('#unnamedCard')).not.toHaveAttribute('aria-label', /.+/);
  await expect(page.locator('#unnamedCard')).not.toHaveAttribute('aria-labelledby', /.+/);
  await expect(page.getByRole('status')).toHaveCount(1);
  await expectNoRuntimeFailures(failures, testInfo, 'screen-structure-dashboard');
});

test('deals promotes visual card titles to level-three item headings', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await expectSingleNamedMain(page, 'deals', 'Рабочие сделки');

  await expect(page.getByRole('region', { name: 'Сделки для работы' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Показатели списка сделок' })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 3, name: 'Квартира — Просторная, 4А' })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 3, name: 'Дом — Северный микрорайон' })).toHaveCount(1);
  await expect(page.getByRole('article', { name: 'Квартира — Просторная, 4А' })).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Не удалось обновить список' })).toHaveCount(0);
  await expectNoRuntimeFailures(failures, testInfo, 'screen-structure-deals');
});

test('deal card names action, rework and active content without extra live landmarks', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await expectSingleNamedMain(page, 'deal_card', 'Карточка сделки: Просторная, 4А');

  await expect(page.getByRole('region', { name: 'Главное действие по сделке' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Исправьте замечания' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Документы для проверки' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Показатели карточки сделки' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Показатели карточки сделки, дополнительная группа' })).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Документы загружены' })).toHaveCount(0);
  await expectNoRuntimeFailures(failures, testInfo, 'screen-structure-deal-card');
});

test('manager gives repeated action regions unique contextual names', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await expectSingleNamedMain(page, 'manager', 'Что требует решения сегодня');

  await expect(page.getByRole('region', { name: 'Подтверждённые результаты' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Правдивая готовность' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Очередь решений' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Главные показатели контроля' })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 3, name: 'Квартира — Просторная, 4А' })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 3, name: 'Дом — Северный микрорайон' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Главное действие: Квартира — Просторная, 4А' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Главное действие: Дом — Северный микрорайон' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Следующий шаг: Документ проверен' })).toHaveCount(1);
  await expectNoRuntimeFailures(failures, testInfo, 'screen-structure-manager');
});
