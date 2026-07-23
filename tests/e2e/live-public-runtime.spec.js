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
const expectedAssets = contract.required_runtime_assets.map((asset) => ({
  asset,
  pathname: `/${asset}`,
  version: expectedBuildId
}));

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

    const resources = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((entry) => {
        const url = new URL(entry.name);
        return {
          href: entry.name,
          pathname: url.pathname,
          version: url.searchParams.get('v')
        };
      })
    );

    const observedMatchingAssets = resources.filter((resource) =>
      expectedAssets.some(
        (expectedAsset) =>
          resource.pathname.endsWith(expectedAsset.pathname)
          && resource.version === expectedAsset.version
      )
    );

    await testInfo.attach('public-runtime-evidence.json', {
      body: Buffer.from(JSON.stringify({
        path,
        expected_build_id: expectedBuildId,
        observed_build_id: await page.locator('html').getAttribute('data-nav-v2-build'),
        expected_assets: expectedAssets,
        observed_matching_assets: observedMatchingAssets,
        observed_nav_v2_resources: resources.filter((resource) =>
          resource.pathname.includes('/assets/js/nav-v2/')
        )
      }, null, 2)),
      contentType: 'application/json'
    });

    for (const expectedAsset of expectedAssets) {
      expect(
        resources.some(
          (resource) =>
            resource.pathname.endsWith(expectedAsset.pathname)
            && resource.version === expectedAsset.version
        ),
        `${path}: browser did not execute ${expectedAsset.pathname}?v=${expectedAsset.version}`
      ).toBe(true);
    }

    await expectNoRuntimeFailures(failures, testInfo, path.replaceAll('/', '_'));
  });
}
