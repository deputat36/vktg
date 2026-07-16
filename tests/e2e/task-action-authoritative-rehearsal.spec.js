import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures, openPage } from './helpers.mjs';

const fixture='/tests/fixtures/nav-v2-task-authoritative-rehearsal.html';
async function clickAndRead(page,selector){await page.locator(selector).click();return JSON.parse(await page.locator('#routeOutput').textContent());}

test('authoritative rehearsal suppresses competing handlers and routes every task action once',async({page},testInfo)=>{
  const failures=captureRuntimeFailures(page);
  const networkCalls=[];
  await page.route('**/rest/v1/rpc/**',async route=>{networkCalls.push(route.request().url());await route.abort();});
  await openPage(page,fixture);
  await expect(page.locator('#app')).toHaveAttribute('data-task-authoritative-rehearsal','ready');

  let value=await clickAndRead(page,'#legacyComplete');
  expect(value.rpc_preview.name).toBe('nav_v2_update_task_status');
  expect(value.rpc_preview.args.p_status).toBe('done');

  value=await clickAndRead(page,'#boundedStart');
  expect(value.rpc_preview.name).toBe('nav_v2_start_bounded_task');

  value=await clickAndRead(page,'#boundedComplete');
  expect(value.rpc_preview.name).toBe('nav_v2_complete_bounded_task');
  expect(value.rpc_preview.args.p_evidence_reference_id).toBe('40000000-0000-4000-8000-000000000001');

  value=await clickAndRead(page,'#boundedWaiting');
  expect(value.rpc_preview.name).toBe('nav_v2_set_bounded_task_active_outcome');
  expect(value.rpc_preview.args.p_outcome_code).toBe('waiting_external');

  value=await clickAndRead(page,'#boundedDeferred');
  expect(value.rpc_preview.name).toBe('nav_v2_set_bounded_task_active_outcome');
  expect(value.rpc_preview.args.p_outcome_code).toBe('deferred');

  value=await clickAndRead(page,'#boundedProposal');
  expect(value.rpc_preview.name).toBe('nav_v2_propose_bounded_task_terminal_outcome');

  value=await clickAndRead(page,'#boundedDecision');
  expect(value.rpc_preview.name).toBe('nav_v2_decide_bounded_task_terminal_outcome');

  value=await clickAndRead(page,'#boundedReopen');
  expect(value.ok).toBe(false);
  expect(value.rpc_preview).toBeNull();
  expect(value.errors.join(' ')).toContain('неизменяема');

  const counters=await page.evaluate(()=>window.__taskRehearsalCounters);
  expect(counters).toEqual({authoritative:8,base:0,guard:0});
  expect(await page.evaluate(()=>window.__taskRehearsalResults.length)).toBe(8);
  expect(networkCalls).toEqual([]);
  await expectNoRuntimeFailures(failures,testInfo,'task-authoritative-rehearsal');
});
