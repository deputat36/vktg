import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture = '/tests/fixtures/nav-v2-task-action-dual-path.html';
async function output(page){return JSON.parse(await page.locator('#routeOutput').textContent());}

test('legacy and bounded actions select exactly one transport-free route', async ({ page }, testInfo) => {
  const failures=captureRuntimeFailures(page);
  const networkCalls=[];
  await page.route('**/rest/v1/rpc/**',async route=>{networkCalls.push(route.request().url());await route.abort();});
  await openPage(page,fixture);

  await page.locator('#legacyComplete').click();
  let value=await output(page);
  expect(value.ok).toBe(true);
  expect(value.mode).toBe('legacy');
  expect(value.rpc_preview.name).toBe('nav_v2_update_task_status');
  expect(value.rpc_preview.args).toEqual({p_task_id:'20000000-0000-4000-8000-000000000001',p_status:'done'});

  await page.locator('#boundedComplete').click();
  value=await output(page);
  expect(value.ok).toBe(true);
  expect(value.mode).toBe('bounded');
  expect(value.rpc_preview.name).toBe('nav_v2_complete_bounded_task');
  expect(value.rpc_preview.args.p_evidence_reference_id).toBe('40000000-0000-4000-8000-000000000001');

  await page.locator('#boundedReopen').click();
  value=await output(page);
  expect(value.ok).toBe(false);
  expect(value.rpc_preview).toBeNull();
  expect(value.errors.join(' ')).toContain('неизменяема');

  await page.locator('#boundedWaiting').click();
  value=await output(page);
  expect(value.ok).toBe(true);
  expect(value.rpc_preview.name).toBe('nav_v2_set_bounded_task_active_outcome');
  expect(value.rpc_preview.args.p_outcome_code).toBe('waiting_external');

  await page.locator('#boundedDecision').click();
  value=await output(page);
  expect(value.ok).toBe(true);
  expect(value.rpc_preview.name).toBe('nav_v2_decide_bounded_task_terminal_outcome');
  expect(value.rpc_preview.args.p_decision).toBe('confirm');

  expect(await page.evaluate(()=>window.__dualPathRouteCalls)).toBe(5);
  expect(networkCalls).toEqual([]);
  await expectNoRuntimeFailures(failures,testInfo,'task-dual-path');
});
