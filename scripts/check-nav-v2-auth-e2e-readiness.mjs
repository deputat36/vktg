import assert from 'node:assert/strict';
import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync('config/nav-v2-auth-e2e-readiness.json', 'utf8'));
const matrix = JSON.parse(fs.readFileSync('fixtures/nav-v2-auth-e2e-role-matrix.json', 'utf8'));

assert.equal(contract.schema_version, 1);
assert.equal(contract.status, 'repository_only_auth_e2e_readiness_package');
for (const field of [
  'production_applied', 'supabase_branch_created', 'cloud_execution_allowed',
  'cost_approval_confirmed', 'authenticated_e2e_proven', 'deployment_ready'
]) {
  assert.equal(contract[field], false, `${field} must remain false`);
}
assert.equal(contract.cost_gate_issue, 282);
assert.equal(contract.environment_name, 'navigator-e2e');
assert.equal(contract.production_project_ref, 'ofewxuqfjhamgerwzull');
assert.equal(contract.historical_cost_snapshot.stale_for_execution, true);
assert.equal(contract.historical_cost_snapshot.must_recheck_before_branch_creation, true);

const requiredRoles = new Set(['admin', 'manager', 'spn', 'lawyer', 'broker', 'viewer']);
assert.deepEqual(new Set(contract.required_roles), requiredRoles);
assert.deepEqual(new Set(matrix.mandatory_roles), requiredRoles);
assert.deepEqual(contract.optional_roles, ['owner']);
assert.deepEqual(matrix.optional_roles, ['owner']);

const variables = new Set(contract.required_environment_variables);
for (const name of [
  'NAV_E2E_SUPABASE_URL', 'NAV_E2E_SUPABASE_PROJECT_REF',
  'NAV_E2E_SPN_ALLOWED_DEAL_ID', 'NAV_E2E_SPN_FORBIDDEN_DEAL_ID'
]) assert.ok(variables.has(name), `missing variable ${name}`);

const secrets = new Set(contract.required_environment_secrets);
for (const role of requiredRoles) {
  const upper = role.toUpperCase();
  assert.ok(secrets.has(`NAV_E2E_${upper}_EMAIL`), `${role} email secret missing`);
  assert.ok(secrets.has(`NAV_E2E_${upper}_PASSWORD`), `${role} password secret missing`);
}
assert.ok(secrets.has('NAV_E2E_SUPABASE_PUBLISHABLE_KEY'));
for (const forbidden of contract.forbidden_environment_secrets) {
  assert.ok(!secrets.has(forbidden), `forbidden secret included as required: ${forbidden}`);
}
assert.ok(contract.forbidden_environment_secrets.some((name) => name.includes('SERVICE_ROLE')));
assert.ok(contract.forbidden_environment_secrets.some((name) => name.includes('DB_PASSWORD')));

assert.equal(contract.technical_identity_policy.email_prefix, 'nav-e2e');
assert.equal(contract.technical_identity_policy.full_name_prefix, '[NAV E2E]');
assert.equal(contract.technical_identity_policy.real_employee_credentials_allowed, false);
assert.equal(contract.synthetic_data_policy.production_data_copy_allowed, false);
assert.equal(contract.synthetic_data_policy.real_client_data_allowed, false);
assert.equal(contract.synthetic_data_policy.minimum_deals, 2);
assert.equal(contract.synthetic_data_policy.broker_mortgage_only_case_required, true);
assert.equal(contract.synthetic_data_policy.matcap_without_mortgage_must_exclude_broker, true);

const scenarios = matrix.scenarios;
assert.ok(Array.isArray(scenarios) && scenarios.length >= 9);
assert.equal(new Set(scenarios.map((item) => item.id)).size, scenarios.length);
for (const role of requiredRoles) {
  assert.ok(scenarios.some((item) => item.role === role && item.account_required), `account-backed scenario missing for ${role}`);
}

const successfulMutations = scenarios.filter((item) =>
  item.identity_chain_required && item.audit_event && item.expected.startsWith('allowed')
);
assert.ok(successfulMutations.length >= 5);
for (const scenario of successfulMutations) {
  assert.ok(['create_selected','start_task','complete_task','set_active_outcome','propose_terminal_outcome','decide_terminal_outcome'].includes(scenario.audit_event));
  assert.ok(scenario.negative_check);
}

const viewer = scenarios.find((item) => item.id === 'viewer_read_only');
assert.equal(viewer.expected, 'allowed_read_only');
assert.equal(viewer.identity_chain_required, false);
assert.equal(viewer.negative_check, 'all_task_mutations_denied');

const forbiddenSpn = scenarios.find((item) => item.id === 'spn_forbidden_deal');
assert.equal(forbiddenSpn.expected, 'denied');
assert.equal(forbiddenSpn.negative_check, 'no_data_or_event_created');

const crossActor = scenarios.find((item) => item.id === 'cross_actor_replay');
assert.equal(crossActor.expected, 'denied');
assert.equal(crossActor.identity_chain_required, true);
assert.equal(crossActor.negative_check, 'client_request_owned_by_other_actor');

const broker = scenarios.find((item) => item.id === 'broker_operate_mortgage_task');
assert.equal(broker.deal_scope, 'assigned_mortgage_deal');
assert.equal(broker.negative_check, 'matcap_without_mortgage_not_routed_to_broker');

const identityAssertions = new Set(matrix.identity_assertions_for_successful_mutation);
for (const assertion of [
  'authenticated_user_id_equals_verified_actor_id',
  'client_payload_contains_no_actor_field',
  'rpc_p_actor_id_equals_verified_actor_id',
  'audit_actor_id_equals_verified_actor_id',
  'one_client_request_id_has_one_audit_event',
  'edge_response_contains_no_service_secret'
]) assert.ok(identityAssertions.has(assertion), `identity assertion missing: ${assertion}`);

for (const field of ['branch_deleted','technical_auth_users_remaining','active_technical_profiles_remaining','open_p0_if_cleanup_fails']) {
  assert.ok(Object.hasOwn(contract.cleanup_acceptance, field), `cleanup field missing: ${field}`);
}
assert.equal(contract.cleanup_acceptance.branch_deleted, true);
assert.equal(contract.cleanup_acceptance.technical_auth_users_remaining, 0);
assert.equal(contract.cleanup_acceptance.active_technical_profiles_remaining, 0);
assert.equal(contract.cleanup_acceptance.open_p0_if_cleanup_fails, true);

assert.ok(contract.stop_conditions.includes('cost not rechecked'));
assert.ok(contract.stop_conditions.includes('explicit cost approval absent'));
assert.ok(contract.stop_conditions.includes('project reference equals production'));
assert.ok(contract.stop_conditions.includes('cleanup cannot be verified'));
assert.ok(contract.remaining_blockers.length >= 8);

console.log(`Navigator v2 authenticated E2E readiness semantic matrix passed: ${requiredRoles.size} mandatory roles, ${scenarios.length} role/negative scenarios, ${successfulMutations.length} successful mutation identity chains; cloud execution and cost approval remain disabled`);
