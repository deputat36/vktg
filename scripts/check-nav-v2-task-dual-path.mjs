import fs from 'node:fs';
import assert from 'node:assert/strict';
import { taskActionRoutePreview, taskActionControlModel, TASK_ACTION_DUAL_PATH_CONTRACT } from '../assets/js/nav-v2/task-action-router-v2.js';
import { validateTaskEdgeAction, TASK_EDGE_ACTION_CONTRACT } from '../supabase/functions/nav-v2-deal-api/task-action-contract-v2.js';

const fixtures = JSON.parse(fs.readFileSync(new URL('../fixtures/nav-v2-task-dual-path-scenarios.json', import.meta.url), 'utf8'));
assert.equal(fixtures.synthetic_only, true);
assert.ok(fixtures.cases.length >= 10);
assert.ok(fixtures.edge_cases.length >= 4);

for (const scenario of fixtures.cases) {
  const actual = taskActionRoutePreview({ task: scenario.task, action: scenario.action, input: scenario.input });
  assert.equal(actual.ok, scenario.expected.ok, `${scenario.id}: ok`);
  assert.equal(actual.mode, scenario.expected.mode, `${scenario.id}: mode`);
  assert.equal(actual.transport_enabled, false, `${scenario.id}: transport`);
  assert.equal(actual.runtime_integrated, false, `${scenario.id}: runtime`);
  assert.equal(actual.duplicate_handler_allowed, false, `${scenario.id}: duplicate handler`);
  if (scenario.expected.rpc) assert.equal(actual.rpc_preview?.name, scenario.expected.rpc, `${scenario.id}: rpc`);
  else assert.equal(actual.rpc_preview, null, `${scenario.id}: no rpc`);
  if (scenario.expected.status) assert.equal(actual.rpc_preview?.args?.p_status, scenario.expected.status, `${scenario.id}: status`);
}

for (const scenario of fixtures.edge_cases) {
  const actual = validateTaskEdgeAction(scenario.action, scenario.payload);
  assert.equal(actual.ok, scenario.valid, `${scenario.id}: valid`);
  assert.equal(actual.transport_enabled, false, `${scenario.id}: transport`);
  assert.equal(actual.runtime_integrated, false, `${scenario.id}: runtime`);
  if (scenario.rpc) assert.equal(actual.rpc, scenario.rpc, `${scenario.id}: rpc`);
}

const legacyModel = taskActionControlModel({ task_contract_version: null, can_change_status: true });
assert.deepEqual(legacyModel.actions, ['start', 'complete', 'reopen']);
const boundedModel = taskActionControlModel({ task_contract_version: 2, can_start: true, can_complete: true });
assert.deepEqual(boundedModel.actions, ['start', 'complete']);
assert.equal(boundedModel.reopen_semantics, 'immutable_create_new_audited_task');
assert.equal(TASK_ACTION_DUAL_PATH_CONTRACT.runtime_integrated, false);
assert.equal(TASK_ACTION_DUAL_PATH_CONTRACT.transport_enabled, false);
assert.equal(TASK_EDGE_ACTION_CONTRACT.bounded_task_complete.rpc, 'nav_v2_complete_bounded_task');
console.log('Navigator v2 task dual-path semantic scenarios passed');
