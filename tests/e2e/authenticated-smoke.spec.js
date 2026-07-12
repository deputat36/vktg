import { test, expect } from '@playwright/test';
import {
  captureRuntimeFailures,
  expectNoInfiniteLoader,
  expectNoRuntimeFailures,
  login,
  openPage
} from './helpers.mjs';

const role = String(process.env.NAV_E2E_ROLE || '').trim();
const roleNames = {
  owner: /Владелец|owner/i,
  admin: /Администратор|admin/i,
  manager: /Менеджер|manager/i,
  spn: /СПН|spn/i,
  lawyer: /Юрист|lawyer/i,
  broker: /Брокер|broker/i,
  viewer: /Просмотр|наблюдатель|viewer/i
};
const menuByRole = {
  owner: ['Рабочий стол', 'Новая сделка', 'Сделки', 'Кабинет юриста', 'Команда', 'Создать доступ', 'Аудит', 'Проверка', 'Диагностика'],
  admin: ['Рабочий стол', 'Новая сделка', 'Сделки', 'Кабинет юриста', 'Команда', 'Создать доступ', 'Аудит', 'Проверка', 'Диагностика'],
  manager: ['Рабочий стол', 'Сделки команды'],
  spn: ['Рабочий стол', 'Новая сделка', 'Мои сделки'],
  lawyer: ['Рабочий стол', 'Кабинет юриста', 'Все сделки'],
  broker: ['Рабочий стол', 'Брокерская очередь'],
  viewer: ['Рабочий стол', 'Сделки']
};

test('authenticated role smoke with real browser evidence', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await login(page);
  await expect(page.locator('body')).toContainText(roleNames[role]);

  await test.step('role menu and deals list', async () => {
    await openPage(page, '/deals-v2.html');
    await expectNoInfiniteLoader(page);
    const menu = page.locator('.nav-v2-menu');
    await expect(menu).toBeVisible({ timeout: 20_000 });
    for (const label of menuByRole[role] || []) await expect(menu).toContainText(label);
    if (!['owner', 'admin'].includes(role)) {
      await expect(menu).not.toContainText('Команда');
      await expect(menu).not.toContainText('Диагностика');
    }
  });

  await test.step('first allowed deal card', async () => {
    const cards = page.locator('a.deal-card');
    await expect(cards.first(), `${role} fixture must have at least one allowed synthetic deal`).toBeVisible({ timeout: 30_000 });
    await cards.first().click();
    await expect(page).toHaveURL(/deal-card-v2\.html\?id=/);
    await expectNoInfiniteLoader(page);
    await expect(page.locator('.tabs')).toBeVisible({ timeout: 30_000 });

    if (role === 'viewer') {
      const mutationControls = page.locator('#saveStatus, #addComment, [data-task-status], [data-doc-status], [data-legal-action]');
      await expect(mutationControls, 'viewer must not see mutation controls').toHaveCount(0);
    }
  });

  await test.step('role-specific routes', async () => {
    if (['owner', 'admin'].includes(role)) {
      for (const path of ['/admin-v2.html', '/nav-access-v2.html', '/nav-system-check-v2.html']) {
        await openPage(page, path);
        await expect(page.locator('body')).not.toContainText('Нет доступа к разделу');
        await expectNoInfiniteLoader(page);
      }
      return;
    }

    await openPage(page, '/admin-v2.html');
    await expect(page.locator('body')).toContainText('Нет доступа к разделу');

    if (role === 'spn') {
      const forbiddenId = String(process.env.NAV_E2E_SPN_FORBIDDEN_DEAL_ID || '').trim();
      await openPage(page, `/deal-card-v2.html?id=${encodeURIComponent(forbiddenId)}`);
      await expect(page.locator('body')).toContainText(/нет доступа|недоступна|не удалось/i);
      await openPage(page, '/spn-v2.html');
      await expect(page.locator('body')).toContainText(/Новая сделка|Создание сделки|мастер/i);
    } else if (role === 'lawyer') {
      await openPage(page, '/queue-v2.html');
      await expectNoInfiniteLoader(page);
      await expect(page.locator('body')).toContainText(/Кабинет юриста|очеред/i);
    } else if (role === 'broker') {
      await openPage(page, '/deals-v2.html?filter=broker');
      await expectNoInfiniteLoader(page);
    }
  });

  await expectNoRuntimeFailures(failures, testInfo, `${role}-${testInfo.project.name}`);
});
