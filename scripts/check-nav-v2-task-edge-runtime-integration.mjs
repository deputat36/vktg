import assert from 'node:assert/strict';
import { routeBoundedTaskEdgeActionV2 } from '../supabase/functions/nav-v2-deal-api/task-action-edge-runtime-v2.js';

const actor = '70000000-0000-4000-8000-000000000001';
const other = '70000000-0000-4000-8000-000000000002';
const taskId = '71000000-0000-4000-8000-000000000001';
const requestId = '72000000-0000-4000-8000-000000000001';

const requestBody = (payload = {}, action = 'bounded_task_start') => ({
  action,
  payload: {
    task_id: taskId,
    client_request_id: requestId,
    task_contract_version: 2,
    ...payload
  }
});

function profile(role = 'spn', overrides = {}) {
  return { id: actor, role, is_active: true, ...overrides };
}

function task(assignedRole = 'spn', overrides = {}) {
  return {
    id: taskId,
    assigned_to: actor,
    assigned_role: assignedRole,
    task_type: assignedRole === 'broker' ? 'broker_task' : 'operational_task',
    source: assignedRole === 'broker' ? 'intake_v1:mortgage' : 'intake_v1:test',
    task_contract_version: 2,
    ...overrides
  };
}

async function run({ enabled = true, body = requestBody(), user = { id: actor }, profileValue = profile(), taskValue = task(), rpcThrows = false } = {}) {
  const calls = { profile: 0, task: 0, rpc: 0, rpcArgs: null };
  const result = await routeBoundedTaskEdgeActionV2({
    enabled,
    request_body: body,
    verified_user: user,
    profile_loader: async (id) => {
      calls.profile += 1;
      assert.equal(id, actor);
      return profileValue;
    },
    task_loader: async (id) => {
      calls.task += 1;
      assert.equal(id, taskId);
      return taskValue;
    },
    rpc_client: {
      async rpc(name, args) {
        calls.rpc += 1;
        calls.rpcArgs = { name, args };
        if (rpcThrows) throw new Error('synthetic cross-actor rejection');
        return { ok: true, synthetic: true };
      }
    }
  });
  return { result, calls };
}

const disabled = await run({ enabled: false });
assert.equal(disabled.result.ok, false);
assert.equal(disabled.result.stage, 'feature_disabled');
assert.deepEqual(disabled.calls, { profile: 0, task: 0, rpc: 0, rpcArgs: null });

const accepted = [
  { id: 'spn_assigned_task', profileValue: profile('spn'), taskValue: task('spn') },
  { id: 'lawyer_assigned_task', profileValue: profile('lawyer'), taskValue: task('lawyer', { task_type: 'legal_blocker' }) },
  { id: 'broker_mortgage_task', profileValue: profile('broker'), taskValue: task('broker') },
  { id: 'manager_supervisor_task', profileValue: profile('manager'), taskValue: task('lawyer', { assigned_to: other, task_type: 'legal_blocker' }) }
];

for (const scenario of accepted) {
  const { result, calls } = await run(scenario);
  assert.equal(result.ok, true, `${scenario.id}: ${result.errors?.join(' | ')}`);
  assert.equal(result.stage, 'runtime_rpc_executed');
  assert.equal(result.runtime_integrated, true);
  assert.equal(result.route_enabled, true);
  assert.equal(result.edge_deployed, false);
  assert.equal(result.frontend_transport_enabled, false);
  assert.equal(result.verified_actor_id, actor);
  assert.equal(result.actor_role, scenario.profileValue.role);
  assert.deepEqual(calls.profile, 1);
  assert.deepEqual(calls.task, 1);
  assert.deepEqual(calls.rpc, 1);
  assert.equal(calls.rpcArgs.name, 'nav_v2_start_bounded_task');
  assert.equal(calls.rpcArgs.args.p_actor_id, actor);
  assert.equal(calls.rpcArgs.args.p_task_id, taskId);
  assert.equal(calls.rpcArgs.args.p_client_request_id, requestId);
}

const rejected = [
  { id: 'invalid_user', options: { user: { id: 'bad' } }, stage: 'verified_identity', calls: [0, 0, 0] },
  { id: 'forbidden_actor_field', options: { body: requestBody({ actor_id: actor }) }, stage: 'actor_trust_boundary', calls: [0, 0, 0] },
  { id: 'inactive_profile', options: { profileValue: profile('spn', { is_active: false }) }, stage: 'active_profile', calls: [1, 0, 0] },
  { id: 'unsupported_role', options: { profileValue: profile('unknown') }, stage: 'role_profile', calls: [1, 0, 0] },
  { id: 'viewer_mutation', options: { profileValue: profile('viewer'), taskValue: task('viewer') }, stage: 'role_policy', calls: [1, 1, 0] },
  { id: 'role_mismatch', options: { profileValue: profile('spn'), taskValue: task('lawyer') }, stage: 'role_mismatch', calls: [1, 1, 0] },
  { id: 'assigned_other', options: { profileValue: profile('lawyer'), taskValue: task('lawyer', { assigned_to: other }) }, stage: 'actor_assignment', calls: [1, 1, 0] },
  { id: 'broker_wrong_type', options: { profileValue: profile('broker'), taskValue: task('broker', { task_type: 'operational_task' }) }, stage: 'broker_scope', calls: [1, 1, 0] },
  { id: 'broker_non_mortgage', options: { profileValue: profile('broker'), taskValue: task('broker', { source: 'intake_v1:matcap' }) }, stage: 'broker_scope', calls: [1, 1, 0] },
  { id: 'contract_v1', options: { taskValue: task('spn', { task_contract_version: 1 }) }, stage: 'task_context', calls: [1, 1, 0] },
  { id: 'cross_actor_rpc_rejection', options: { rpcThrows: true }, stage: 'rpc_execution', calls: [1, 1, 1] }
];

for (const scenario of rejected) {
  const { result, calls } = await run(scenario.options);
  assert.equal(result.ok, false, `${scenario.id}: expected rejection`);
  assert.equal(result.stage, scenario.stage, `${scenario.id}: unexpected stage`);
  assert.deepEqual([calls.profile, calls.task, calls.rpc], scenario.calls, `${scenario.id}: unexpected call counts`);
  assert.equal(result.edge_deployed, false);
  assert.equal(result.frontend_transport_enabled, false);
}

console.log(`Navigator v2 Edge runtime integration matrix passed: ${accepted.length} accepted, ${rejected.length + 1} rejected, feature flag disabled by default`);
