#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-deployment-decision-package-v1.json'), 'utf8'));
const auth = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-auth-e2e-readiness.json'), 'utf8'));
const final = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-special-semantics-integration-v1.json'), 'utf8'));
const cleanup = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-legacy-quality-cleanup-decision-v1.json'), 'utf8'));
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-task-edge-runtime-integration-v1.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(config.contract_version === 1, 'unexpected deployment package version');
assert(config.status === 'repository_only_decision_package', 'package escaped repository-only status');
for (const key of ['production_applied', 'production_ready', 'deployment_bundle_ready', 'edge_runtime_enabled', 'edge_deployed', 'authenticated_e2e_proven', 'branch_creation_allowed', 'technical_accounts_created']) {
  assert(config[key] === false, `${key} must remain false`);
}
assert(config.repository_bundle_manifest_ready === true, 'repository source manifest is not ready');
assert(config.rehearsal_bundle_assembler_proven === true, 'rehearsal bundle assembler evidence missing');
assert(config.edge_runtime_source_integrated === true, 'Edge runtime source integration evidence missing');
assert(config.branch_cost_rechecked === true, 'current branch cost was not rechecked');
assert(config.selected_deployment_option === null, 'deployment option selected automatically');
assert(config.selected_cleanup_option === null, 'cleanup option selected automatically');

const cost = config.current_branch_cost_snapshot;
assert(cost?.source === 'supabase_get_cost', 'unexpected cost source');
assert(cost.checked_at === '2026-07-21', 'unexpected cost snapshot date');
assert(cost.organization_id === 'tcbupmmcojrcxfqjuwsm', 'cost snapshot organization changed');
assert(cost.organization_name === 'Lider' && cost.organization_plan === 'free', 'organization metadata changed');
assert(cost.type === 'branch' && cost.recurrence === 'hourly', 'cost type or recurrence changed');
assert(cost.amount === 0.01344, 'branch hourly amount changed');
assert(Math.abs(cost.six_hour_ceiling - cost.amount * 6) < 1e-9, 'six-hour ceiling is inconsistent');
assert(cost.currency === null, 'connector did not return a currency');
assert(cost.valid_for_owner_decision === true, 'cost snapshot is not decision evidence');
assert(cost.valid_for_branch_creation === false, 'cost snapshot incorrectly authorizes branch creation');
assert(cost.must_recheck_immediately_before_confirm_cost === true, 'execution-time cost recheck missing');
assert(cost.explicit_owner_cost_approval === false, 'cost approval was inferred');
assert(cost.cost_confirmation_id === null, 'cost confirmation was created without approval');

assert(final.effective_supported_count === 25 && final.effective_unsupported_count === 0, 'final structural catalog is not 25/0');
assert(final.production_ready === false, 'final structural package claims deployment readiness');
assert(auth.authenticated_e2e_proven === false, 'auth package claims proof');
assert(auth.historical_cost_snapshot.stale_for_execution === true, 'historical cost is not marked stale');
assert(cleanup.selected_option === null, 'cleanup option selected outside owner decision');
assert(runtime.runtime_source_integrated === true && runtime.feature_flag_default === false, 'runtime source integration contract drifted');
assert(runtime.edge_deployed === false && runtime.actor_aware_sql_deployed === false, 'runtime contract claims deployment');

const evidence = config.repository_evidence;
for (const key of ['preview_bundle_rehearsal_assembler_proven', 'edge_identity_runtime_source_integrated']) {
  assert(evidence[key] === true, `repository evidence missing: ${key}`);
}
assert(evidence.edge_identity_runtime_feature_flag_default === false, 'Edge runtime flag default changed');
assert(evidence.edge_identity_runtime_deployed === false, 'Edge runtime deployment was inferred');

assert(config.owner_options.length === 3, 'owner option count changed');
assert(config.owner_options.filter((option) => option.recommended_next).length === 1, 'exactly one next option must be recommended');
assert(config.owner_options[0].id === 'authenticated_e2e_only', 'authenticated E2E is no longer first');
assert(config.owner_options[0].current_cost_snapshot_available === true, 'current cost snapshot is not surfaced');
assert(config.owner_options[0].requires_execution_time_cost_recheck === true, 'execution-time recheck was removed');
assert(config.owner_options[0].allows_production_merge === false, 'E2E-only option allows production merge');

assert(config.ordered_rollout.map((phase) => phase.order).join(',') === '0,1,2,3,4,5,6,7,8,9', 'rollout order changed');
assert(config.ordered_rollout[1].required_evidence.includes('cost_confirmation_id'), 'cost confirmation evidence missing');
assert(config.ordered_rollout[2].target === 'non_production_only', 'preview target changed');
assert(config.ordered_rollout[6].id === 'branch_rollback_and_delete', 'branch cleanup phase moved');
assert(config.ordered_rollout[7].id === 'separate_production_decision', 'production decision is not separate');
assert(config.ordered_rollout[9].id === 'optional_legacy_cleanup', 'cleanup is not final and optional');
assert(config.ordered_rollout[9].required_evidence.includes('selected_cleanup_option'), 'cleanup owner evidence missing');

const matrix = config.ordered_rollout[5].required_evidence;
for (const item of ['allowed_deals', 'forbidden_deals', 'broker_mortgage_only', 'viewer_read_only', 'cross_actor_replay_rejected', 'identity_chain']) {
  assert(matrix.includes(item), `matrix evidence missing: ${item}`);
}
for (const stop of ['selected_deployment_option_missing', 'current_cost_snapshot_not_execution_authority', 'explicit_cost_approval_missing', 'cost_confirmation_id_missing', 'deployment_bundle_not_ready', 'executable_migrations_not_created', 'production_rollback_bundle_not_ready', 'actor_aware_sql_not_deployed', 'edge_runtime_feature_flag_disabled', 'edge_not_deployed', 'authenticated_e2e_not_proven', 'production_deployment_approval_missing', 'pilot_scope_missing', 'rollback_attestation_missing', 'cleanup_option_unselected']) {
  assert(config.mandatory_stops.includes(stop), `mandatory stop missing: ${stop}`);
}
assert(!config.mandatory_stops.includes('edge_identity_handler_not_integrated'), 'obsolete Edge integration stop remains');
assert(!config.mandatory_stops.includes('current_branch_cost_missing'), 'current cost is still incorrectly marked missing');
for (const artifact of config.source_artifacts) assert(fs.existsSync(path.join(root, artifact)), `source artifact missing: ${artifact}`);

console.log('Navigator v2 deployment decision package semantic contract passed');
