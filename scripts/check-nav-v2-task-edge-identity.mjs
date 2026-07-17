import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rehearseTaskEdgeIdentityAction } from '../supabase/functions/nav-v2-deal-api/task-action-edge-identity-v2.js';

const scenarios = JSON.parse(fs.readFileSync('fixtures/nav-v2-task-edge-identity-scenarios.json', 'utf8'));
assert.equal(scenarios.schema_version, 1);
assert.equal(scenarios.synthetic_only, true);

for (const scenario of scenarios.accepted) {
  const requestBody = { action: scenario.action, payload: scenario.payload };
  const preview = await rehearseTaskEdgeIdentityAction({
    request_body: requestBody,
    verified_actor_id: scenarios.verified_actor_id,
    mode: 'preview'
  });
  assert.equal(preview.ok, true, `${scenario.id}: preview rejected: ${preview.errors?.join(' | ')}`);
  assert.equal(preview.stage, 'actor_aware_rpc_preview');
  assert.equal(preview.rpc, scenario.rpc);
  assert.deepEqual(preview.rpc_args, scenario.args);
  assert.equal(preview.verified_actor_id, scenarios.verified_actor_id);
  assert.equal(preview.mock_rpc_called, false);
  assert.equal(preview.mock_rpc_call_count, 0);
  assert.equal(preview.network_called, false);
  assert.equal(preview.runtime_integrated, false);
  assert.equal(preview.edge_deployed, false);
  assert.equal(preview.transport_enabled, false);
  assert.equal(preview.target_sql_signature_ready, false);
  assert.equal(preview.canonical_sql_refactor_required, true);

  const calls = [];
  const execution = await rehearseTaskEdgeIdentityAction({
    request_body: requestBody,
    verified_actor_id: scenarios.verified_actor_id,
    mode: 'mock_execute',
    rpc_client: {
      async rpc(name, args) {
        calls.push({ name, args });
        return { data: { ok: true, scenario: scenario.id }, error: null };
      }
    }
  });
  assert.equal(execution.ok, true, `${scenario.id}: mock execution rejected`);
  assert.equal(execution.stage, 'mock_rpc_executed');
  assert.equal(execution.mock_rpc_called, true);
  assert.equal(execution.mock_rpc_call_count, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { name: scenario.rpc, args: scenario.args });
  assert.deepEqual(execution.mock_result, { data: { ok: true, scenario: scenario.id }, error: null });
}

for (const scenario of scenarios.rejected) {
  const requestBody = {
    action: scenario.action,
    payload: scenario.payload,
    ...(scenario.extra_top_level || {})
  };
  const result = await rehearseTaskEdgeIdentityAction({
    request_body: requestBody,
    verified_actor_id: scenario.verified_actor_id || scenarios.verified_actor_id,
    mode: 'preview'
  });
  assert.equal(result.ok, false, `${scenario.id}: expected rejection`);
  assert.equal(result.stage, scenario.expected_stage, `${scenario.id}: unexpected rejection stage`);
  assert.equal(result.mock_rpc_called, false);
  assert.equal(result.mock_rpc_call_count, 0);
  assert.equal(result.network_called, false);
}

console.log(`Navigator v2 task Edge identity semantic matrix passed: ${scenarios.accepted.length} accepted actor-injected previews/mock calls and ${scenarios.rejected.length} rejected trust-boundary cases; no production transport`);
