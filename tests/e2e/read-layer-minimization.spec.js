import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-read-layer-minimization.html';

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test(`${viewport.name}: legacy client identifiers are removed before render`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const failures = captureRuntimeFailures(page);
    await openPage(page, fixture);
    await page.locator('#run').click();

    const result = page.locator('#result');
    await expect(result).toContainText('Квартира в МКД — г. Борисоглебск, ул. Бланская, д. 67А · ABCDEF12');
    await expect(result).toContainText('Алексей Ковтун');
    await expect(result).toContainText('+7 900 000-00-00');
    await expect(result).toContainText('Проверить выписку');
    await expect(result).toContainText('Сделка · ABCDEF12');
    await expect(result).toContainText('[телефон клиента скрыт]');
    await expect(result).toContainText('[email клиента скрыт]');
    await expect(result).toContainText('[паспортные данные скрыты]');
    await expect(result).toContainText('[СНИЛС скрыт]');
    await expect(result).toContainText('[номер карты скрыт]');
    await expect(result).toContainText('4 500 000 рублей');
    await expect(result).toContainText('18.07.2026');
    await expect(result).not.toContainText('Иванов Иван Иванович');
    await expect(result).not.toContainText('Петров Пётр Петрович');
    await expect(result).not.toContainText('+7 900 111-22-33');
    await expect(result).not.toContainText('+7 900 555-66-77');
    await expect(result).not.toContainText('client@example.ru');
    await expect(result).not.toContainText('1234 567890');
    await expect(result).not.toContainText('123-456-789 01');
    await expect(result).not.toContainText('4111 1111 1111 1111');
    await expect(result).not.toContainText('кв. 15');

    const output = await page.evaluate(() => window.fixtureOutput);
    expect(output.deals[0].wizard_snapshot.floor).toBe(4);
    expect(output.profile.role).toBe('manager');
    expect(output.tasks[0].title).toBe('Проверить выписку');
    await expectNoRuntimeFailures(failures, testInfo, `read-layer-${viewport.name}`);
  });
}
