import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  boundedTaskCreateRpcPreview,
  boundedTaskStartRpcPreview,
  boundedTaskCompleteRpcPreview,
  boundedTaskActiveOutcomeRpcPreview,
  boundedTaskTerminalProposalRpcPreview,
  boundedTaskTerminalDecisionRpcPreview,
  minimizeBoundedTaskMutationResponse
} from '../assets/js/nav-v2/bounded-task-server-adapter-v2.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/nav-v2-bounded-task-server-adapter-scenarios.json', import.meta.url), 'utf8'));

for (const scenario of fixture.create_cases) {
  const result = boundedTaskCreateRpcPreview(scenario.input);
  assert.equal(result.ok, scenario.valid, `${scenario.id}: create validity`);
  assert.equal(result.transport_enabled, false);
  assert.equal(result.persistence.automatic_backlog_created, false);
  assert.equal(result.persistence.legacy_rows_backfilled, false);
  if (scenario.valid) {
    assert.equal(result.rpc_preview.name, 'nav_v2_create_bounded_tasks');
    assert.deepEqual(result.rpc_preview.args.p_items.map((item) => item.sla_days), scenario.expected_sla);
    assert.equal(Object.hasOwn(result.rpc_preview.args.p_items[0], 'title'), false);
    assert.equal(Object.hasOwn(result.rpc_preview.args.p_items[0], 'description'), false);
  } else {
    assert.equal(result.rpc_preview, null);
  }
}

const calls = {
  start: boundedTaskStartRpcPreview,
  complete: boundedTaskCompleteRpcPreview,
  active: boundedTaskActiveOutcomeRpcPreview,
  proposal: boundedTaskTerminalProposalRpcPreview,
  decision: boundedTaskTerminalDecisionRpcPreview
};

for (const scenario of fixture.operation_cases) {
  const result = calls[scenario.kind](scenario.input);
  assert.equal(result.ok, scenario.valid, `${scenario.id}: operation validity`);
  assert.equal(result.transport_enabled, false);
  if (scenario.valid) assert.equal(result.rpc_preview.name, scenario.rpc);
  else assert.equal(result.rpc_preview, null);
}

const minimized = minimizeBoundedTaskMutationResponse(fixture.minimize_case.input);
const text = JSON.stringify(minimized);
for (const key of fixture.minimize_case.forbidden) {
  assert.equal(text.includes(`"${key}"`), false, `forbidden ${key}`);
}
assert.equal(minimized.task.task_type, 'legal_decision');
assert.equal(minimized.automatic_backlog_created, false);
assert.equal(minimized.legacy_rows_backfilled, false);

console.log('Navigator v2 bounded task adapter regression passed: exact transport-free RPC previews, catalog validation and DTO minimization');
