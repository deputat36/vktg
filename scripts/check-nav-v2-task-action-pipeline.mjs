import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  taskActionEdgePipelinePreview,
  TASK_ACTION_EDGE_PIPELINE_CONTRACT
} from '../assets/js/nav-v2/task-action-edge-pipeline-v2.js';
import {
  validateTaskEdgeAction,
  TASK_EDGE_REASON_CONTRACT
} from '../supabase/functions/nav-v2-deal-api/task-action-contract-v2.js';

const fixtures = JSON.parse(fs.readFileSync(
  new URL('../fixtures/nav-v2-task-action-pipeline-scenarios.json', import.meta.url),
  'utf8'
));

assert.equal(fixtures.schema_version, 1);
assert.equal(fixtures.synthetic_only, true);
assert.equal(fixtures.production_changed, false);
assert.equal(fixtures.network_allowed, false);
assert.ok(fixtures.valid_cases.length >= 10);
assert.ok(fixtures.invalid_cases.length >= 8);

for (const scenario of fixtures.valid_cases) {
  const actual = taskActionEdgePipelinePreview({
    task: scenario.task,
    action: scenario.action,
    input: scenario.input
  });

  assert.equal(actual.ok, true, `${scenario.id}: ok`);
  assert.equal(actual.stage, 'validated_rpc_preview', `${scenario.id}: stage`);
  assert.equal(actual.edge_action, scenario.expected_edge_action, `${scenario.id}: edge action`);
  assert.equal(actual.rpc_preview?.name, scenario.expected_rpc, `${scenario.id}: rpc`);
  assert.deepEqual(actual.rpc_preview?.args, scenario.expected_args, `${scenario.id}: args`);
  assert.deepEqual(actual.route?.rpc_preview, actual.rpc_preview, `${scenario.id}: frontend/edge parity`);
  assert.equal(actual.parity, true, `${scenario.id}: parity`);
  assert.equal(actual.network_called, false, `${scenario.id}: network`);
  assert.equal(actual.runtime_integrated, false, `${scenario.id}: runtime`);
  assert.equal(actual.edge_deployed, false, `${scenario.id}: Edge deployed`);
  assert.equal(actual.transport_enabled, false, `${scenario.id}: transport`);
}

for (const scenario of fixtures.invalid_cases) {
  const actual = taskActionEdgePipelinePreview({
    task: scenario.task,
    action: scenario.action,
    input: scenario.input,
    edge_action_override: scenario.edge_action_override,
    edge_payload_patch: scenario.edge_payload_patch
  });

  assert.equal(actual.ok, false, `${scenario.id}: rejected`);
  assert.equal(actual.stage, scenario.expected_stage, `${scenario.id}: stage`);
  assert.equal(actual.rpc_preview, null, `${scenario.id}: no validated RPC`);
  assert.equal(actual.parity, false, `${scenario.id}: no parity`);
  assert.equal(actual.network_called, false, `${scenario.id}: network`);
  assert.equal(actual.runtime_integrated, false, `${scenario.id}: runtime`);
  assert.equal(actual.edge_deployed, false, `${scenario.id}: Edge deployed`);
  assert.equal(actual.transport_enabled, false, `${scenario.id}: transport`);
}

const governedOnLegacy = validateTaskEdgeAction('bounded_task_start', {
  task_id: '20000000-0000-4000-8000-000000000001',
  client_request_id: '30000000-0000-4000-8000-000000000019',
  task_contract_version: 1
});
assert.equal(governedOnLegacy.ok, false);
assert.ok(governedOnLegacy.errors.some((error) => error.includes('contract-v2')));

const legacyOnBounded = validateTaskEdgeAction('legacy_update_task_status', {
  task_id: '20000000-0000-4000-8000-000000000002',
  status: 'done',
  task_contract_version: 2
});
assert.equal(legacyOnBounded.ok, false);
assert.ok(legacyOnBounded.errors.some((error) => error.includes('Legacy action')));

const badReason = validateTaskEdgeAction('bounded_task_terminal_proposal', {
  task_id: '20000000-0000-4000-8000-000000000004',
  outcome_code: 'cancelled',
  reason_code: 'no_longer_required',
  client_request_id: '30000000-0000-4000-8000-000000000020',
  task_contract_version: 2
});
assert.equal(badReason.ok, false);
assert.ok(badReason.errors.some((error) => error.includes('reason_code')));

assert.deepEqual(
  [...TASK_EDGE_REASON_CONTRACT.active.waiting_external],
  ['awaiting_counterparty', 'awaiting_bank', 'awaiting_document']
);
assert.deepEqual(
  [...TASK_EDGE_REASON_CONTRACT.terminal.replaced],
  ['replaced_by_specific_task', 'duplicate_work_item']
);
assert.equal(TASK_ACTION_EDGE_PIPELINE_CONTRACT.one_action_one_validated_rpc_preview, true);
assert.equal(TASK_ACTION_EDGE_PIPELINE_CONTRACT.network_called, false);
assert.equal(TASK_ACTION_EDGE_PIPELINE_CONTRACT.runtime_integrated, false);
assert.equal(TASK_ACTION_EDGE_PIPELINE_CONTRACT.edge_deployed, false);
assert.equal(TASK_ACTION_EDGE_PIPELINE_CONTRACT.transport_enabled, false);

console.log('Navigator v2 task action pipeline semantic scenarios passed: frontend router and detached Edge validator produce exact RPC parity, tampered payloads are rejected, and no network/deployment is enabled');
