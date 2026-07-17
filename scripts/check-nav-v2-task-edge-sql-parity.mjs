import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rehearseTaskEdgeIdentityAction } from '../supabase/functions/nav-v2-deal-api/task-action-edge-identity-v2.js';

const sql = fs.readFileSync('supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql', 'utf8');
const scenarios = JSON.parse(fs.readFileSync('fixtures/nav-v2-task-edge-identity-scenarios.json', 'utf8'));
const sqlContract = JSON.parse(fs.readFileSync('config/nav-v2-bounded-task-actor-aware-contract.json', 'utf8'));
const identityContract = JSON.parse(fs.readFileSync('config/nav-v2-task-edge-identity-contract.json', 'utf8'));

function actorAwareDefinitions(source) {
  const definitions = new Map();
  const pattern = /create\s+or\s+replace\s+function\s+public\.(nav_v2_[a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns\s+jsonb/gi;
  for (const match of source.matchAll(pattern)) {
    const params = match[2]
      .split(',')
      .map((item) => item.trim().match(/^(p_[a-z0-9_]+)\s+/i)?.[1] || null)
      .filter(Boolean);
    if (params.includes('p_actor_id')) definitions.set(match[1], params);
  }
  return definitions;
}

const definitions = actorAwareDefinitions(sql);
assert.equal(definitions.size, 6, 'expected six actor-aware SQL overload definitions');
assert.equal(sqlContract.actor_aware_overloads.length, 6);
assert.equal(identityContract.repository_sql_resolution.actor_aware_sql_prototype_ready, true);
assert.equal(identityContract.repository_sql_resolution.production_deployed, false);
assert.equal(identityContract.repository_sql_resolution.task_action_overloads_ready, 5);
assert.equal(identityContract.repository_sql_resolution.create_overload_ready_separate_flow, true);

const expectedTaskRpcs = new Set([
  'nav_v2_start_bounded_task',
  'nav_v2_complete_bounded_task',
  'nav_v2_set_bounded_task_active_outcome',
  'nav_v2_propose_bounded_task_terminal_outcome',
  'nav_v2_decide_bounded_task_terminal_outcome'
]);
const exercised = new Set();

for (const scenario of scenarios.accepted) {
  const preview = await rehearseTaskEdgeIdentityAction({
    request_body: { action: scenario.action, payload: scenario.payload },
    verified_actor_id: scenarios.verified_actor_id,
    mode: 'preview'
  });
  assert.equal(preview.ok, true, `${scenario.id}: preview rejected`);
  assert.equal(preview.target_sql_signature_ready, true);
  assert.equal(preview.actor_aware_sql_prototype_ready, true);
  assert.equal(preview.actor_aware_sql_deployed, false);
  assert.equal(preview.canonical_sql_refactor_required, false);
  assert.equal(preview.runtime_integrated, false);
  assert.equal(preview.edge_deployed, false);
  assert.equal(preview.transport_enabled, false);
  assert.equal(preview.network_called, false);

  const sqlParams = definitions.get(preview.rpc);
  assert.ok(sqlParams, `${scenario.id}: actor-aware SQL overload missing for ${preview.rpc}`);
  assert.deepEqual(Object.keys(preview.rpc_args), sqlParams, `${scenario.id}: Edge args differ from SQL parameter order`);
  assert.deepEqual(preview.rpc_args, scenario.args, `${scenario.id}: Edge args differ from semantic fixture`);
  assert.equal(preview.rpc_args.p_actor_id, scenarios.verified_actor_id);
  exercised.add(preview.rpc);
}

assert.deepEqual(exercised, expectedTaskRpcs, 'task action scenarios must cover all five Edge RPC overloads');
assert.deepEqual(definitions.get('nav_v2_create_bounded_tasks'), [
  'p_deal_id', 'p_items', 'p_client_request_id', 'p_actor_id'
], 'create overload must remain ready for its separate flow');

for (const scenario of scenarios.rejected) {
  const result = await rehearseTaskEdgeIdentityAction({
    request_body: {
      action: scenario.action,
      payload: scenario.payload,
      ...(scenario.extra_top_level || {})
    },
    verified_actor_id: scenario.verified_actor_id || scenarios.verified_actor_id,
    mode: 'preview'
  });
  assert.equal(result.ok, false, `${scenario.id}: rejected case unexpectedly accepted`);
  assert.equal(result.mock_rpc_call_count, 0);
  assert.equal(result.network_called, false);
}

console.log(`Navigator v2 Edge-to-SQL parity passed: ${exercised.size} task-action overloads match exact SQL parameter order, create overload is inventoried separately, spoof cases remain rejected and production transport is disabled`);
