import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const contract = JSON.parse(
  readFileSync(new URL('../../config/nav-v2-live-public-browser-runtime-v1.json', import.meta.url), 'utf8')
);
const buildConfig = JSON.parse(
  readFileSync(new URL('../../config/nav-v2-build.json', import.meta.url), 'utf8')
);

const expectedBuildId = String(buildConfig.build_id || '').trim();
const expectedAssets = contract.required_runtime_assets.map(
  (asset) => `/${asset}?v=${expectedBuildId}`
);

for (const path of contract.representative_pages) {
  test(`public runtime executes canonical build: ${path}`, async ({ page }, testInfo) => {
    const failures = captureRuntimeFailures(page);
    await openPage(page, path);

    for (const selector of contract.required_login_selectors) {
      await expect(page.locator(selector)).toBeVisible({ timeout: 30_000 });
    }

    await expect(page.locator('html')).toHaveAttribute(
      'data-nav-v2-build',
      expectedBuildId,
      { timeout: 30_000 }
    );

    const resourceNames = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name)
    );

    for (const expectedAsset of expectedAssets) {
      expect(
        resourceNames.some((name) => name.includes(expectedAsset)),
        `${path}: browser did not execute resource ${expectedAsset}`
      ).toBe(true);
    }

    await testInfo.attach('public-runtime-evidence.json', {
      body: Buffer.from(JSON.stringify({
        path,
        expected_build_id: expectedBuildId,
        observed_build_id: await page.locator('html').getAttribute('data-nav-v2-build'),
        expected_assets: expectedAssets,
        observed_matching_assets: resourceNames.filter((name) =>
          expectedAssets.some((asset) => name.includes(asset))
        )
      }, null, 2)),
      contentType: 'application/json'
    });

    await expectNoRuntimeFailures(failures, testInfo, path.replaceAll('/', '_'));
  });
}
