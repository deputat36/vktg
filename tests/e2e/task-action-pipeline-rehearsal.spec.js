import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-task-action-pipeline-rehearsal.html';

async function openPipeline(page) {
  const networkCalls = [];
  await page.route('**/rest/v1/rpc/**', async (route) => {
    networkCalls.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Network forbidden in pipeline rehearsal.' }) });
  });
  await openPage(page, fixture);
  return networkCalls;
}

const validCases = [
  ['#pipelineLegacy', 'nav_v2_update_task_status'],
  ['#pipelineComplete', 'nav_v2_complete_bounded_task'],
  ['#pipelineWaiting', 'nav_v2_set_bounded_task_active_outcome'],
  ['#pipelineReplaced', 'nav_v2_propose_bounded_task_terminal_outcome'],
  ['#pipelineDecision', 'nav_v2_decide_bounded_task_terminal_outcome']
];

for (const [selector, rpc] of validCases) {
  test(`${rpc}: one browser action produces one exact validated RPC preview without network`, async ({ page }, testInfo) => {
    const failures = captureRuntimeFailures(page);
    const networkCalls = await openPipeline(page);

    await page.locator(selector).click();
    const output = page.locator('#pipelineOutput');
    await expect(output).toHaveAttribute('data-ok', 'true');
    await expect(output).toHaveAttribute('data-stage', 'validated_rpc_preview');
    await expect(output).toHaveAttribute('data-rpc', rpc);
    await expect(output).toContainText('"parity": true');
    await expect(output).toContainText('"network_called": false');
    await expect(output).toContainText('"transport_enabled": false');

    expect(networkCalls).toEqual([]);
    expect(await page.evaluate(() => window.__taskPipelineResults.length)).toBe(1);
    await expectNoRuntimeFailures(failures, testInfo, `task-pipeline-${rpc}`);
  });
}

test('bounded reopen stops at frontend router and creates no Edge or RPC preview', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const networkCalls = await openPipeline(page);

  await page.locator('#pipelineReopen').click();
  const output = page.locator('#pipelineOutput');
  await expect(output).toHaveAttribute('data-ok', 'false');
  await expect(output).toHaveAttribute('data-stage', 'frontend_router');
  await expect(output).toHaveAttribute('data-rpc', '');
  await expect(output).toContainText('Завершённая bounded-задача неизменяема');

  expect(networkCalls).toEqual([]);
  expect(await page.evaluate(() => window.__taskPipelineResults.length)).toBe(1);
  await expectNoRuntimeFailures(failures, testInfo, 'task-pipeline-bounded-reopen');
});

test('tampered Edge payload is rejected before RPC parity and creates no network call', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const networkCalls = await openPipeline(page);

  await page.locator('#pipelineTampered').click();
  const output = page.locator('#pipelineOutput');
  await expect(output).toHaveAttribute('data-ok', 'false');
  await expect(output).toHaveAttribute('data-stage', 'edge_validation');
  await expect(output).toHaveAttribute('data-rpc', '');
  await expect(output).toContainText('Неизвестные поля: client_name');

  expect(networkCalls).toEqual([]);
  expect(await page.evaluate(() => window.__taskPipelineResults.length)).toBe(1);
  await expectNoRuntimeFailures(failures, testInfo, 'task-pipeline-tampered');
});

test('multiple actions remain one click to one preview with no hidden transport', async ({ page }, testInfo) => {
  const failures = captureRuntimeFailures(page);
  const networkCalls = await openPipeline(page);

  for (const [selector] of validCases) await page.locator(selector).click();

  const results = await page.evaluate(() => window.__taskPipelineResults);
  expect(results).toHaveLength(validCases.length);
  expect(results.every((result) => result.ok && result.parity)).toBe(true);
  expect(results.every((result) => result.network_called === false && result.transport_enabled === false)).toBe(true);
  expect(new Set(results.map((result) => result.id)).size).toBe(validCases.length);
  expect(networkCalls).toEqual([]);
  await expectNoRuntimeFailures(failures, testInfo, 'task-pipeline-multiple');
});
