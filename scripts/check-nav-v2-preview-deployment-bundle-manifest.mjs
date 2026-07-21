#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const manifest = readJson('config/nav-v2-preview-deployment-bundle-manifest-v1.json');
const decision = readJson('config/nav-v2-deployment-decision-package-v1.json');
const auth = readJson('config/nav-v2-auth-e2e-readiness.json');
const final = readJson('config/nav-v2-intake-special-semantics-integration-v1.json');
const identity = readJson('config/nav-v2-task-edge-identity-contract.json');
const cleanup = readJson('config/nav-v2-legacy-quality-cleanup-decision-v1.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.schema_version === 1, 'unexpected manifest version');
assert(manifest.status === 'repository_only_source_manifest_not_executable', 'manifest escaped repository-only status');
assert(manifest.source_baseline_main_sha === 'dd33b2ab1de6523604386ddbf3aad8d15fd2cdb3', 'source baseline changed');
assert(manifest.repository_source_inventory_complete === true, 'source inventory is incomplete');
for (const key of ['production_applied', 'preview_branch_created', 'executable_migrations_created', 'production_rollback_bundle_ready', 'edge_runtime_integrated', 'frontend_transport_enabled', 'authenticated_e2e_proven', 'deployment_bundle_ready']) {
  assert(manifest[key] === false, `${key} must remain false`);
}
assert(manifest.selected_deployment_option === null, 'deployment option selected automatically');
assert(manifest.selected_cleanup_option === null, 'cleanup option selected automatically');

const cost = manifest.cost_gate;
assert(cost.amount === 0.01344 && cost.recurrence === 'hourly', 'cost snapshot drifted');
assert(Math.abs(cost.six_hour_ceiling - cost.amount * 6) < 1e-9, 'six-hour ceiling drifted');
assert(cost.explicit_owner_cost_approval === false, 'cost approval was inferred');
assert(cost.cost_confirmation_id === null, 'cost confirmation exists without approval');
assert(cost.branch_creation_allowed === false, 'branch creation was enabled');
assert(cost.must_recheck_immediately_before_confirm_cost === true, 'execution-time cost recheck missing');

const layers = manifest.layers;
assert(layers.map((layer) => layer.order).join(',') === '0,1,2,3,4,5,6,7', 'layer order changed');
assert(layers.map((layer) => layer.id).join(',') === [
  'read_only_preflight',
  'privacy_aligned_quality_replacement',
  'bounded_tasks_and_actor_identity',
  'governed_intake_full_25_rule_mapper',
  'edge_identity_and_action_routes',
  'frontend_flagged_transport_pilot',
  'authenticated_preview_e2e',
  'optional_legacy_quality_cleanup',
].join(','), 'layer IDs changed');
assert(layers.every((layer) => layer.apply_allowed === false), 'a layer allows apply');

for (const layer of layers) {
  const paths = [
    ...(layer.source_paths || []),
    ...(layer.rehearsal_paths || []),
    ...(layer.rehearsal_rollback_paths || []),
    ...(layer.storyboard_path ? [layer.storyboard_path] : []),
    ...(layer.identity_contract_path ? [layer.identity_contract_path] : []),
    ...(layer.render_step?.script ? [layer.render_step.script] : []),
  ];
  for (const relative of paths) assert(fs.existsSync(path.join(root, relative)), `missing bundle source: ${relative}`);
}

const privacy = layers[1];
assert(privacy.production_migration_ready === false && privacy.production_rollback_ready === false, 'privacy layer claims production readiness');
assert(privacy.backfill_allowed === false && privacy.legacy_cleanup_allowed === false, 'privacy layer allows backfill or cleanup');

const bounded = layers[2];
assert(bounded.production_migration_ready === false && bounded.production_rollback_ready === false, 'bounded layer claims production readiness');
assert(bounded.legacy_rpc_cutover_approved === false && bounded.final_grant_policy_approved === false, 'bounded cutover or grants approved unexpectedly');
assert(bounded.bounded_transport_enabled === false, 'bounded transport enabled in bundle');

const intake = layers[3];
assert(intake.effective_supported_count === 25 && intake.effective_unsupported_count === 0, 'manifest catalog is not 25/0');
assert(final.effective_supported_count === 25 && final.effective_unsupported_count === 0, 'final catalog source is not 25/0');
assert(intake.render_step.generated_file_committed === false, 'generated adapter was committed as migration');
assert(intake.production_migration_ready === false && intake.production_rollback_ready === false, 'intake layer claims production readiness');

const edge = layers[4];
const edgeIndex = fs.readFileSync(path.join(root, 'supabase/functions/nav-v2-deal-api/index.ts'), 'utf8');
assert(!edgeIndex.includes('task-action-edge-identity-v2.js'), 'identity handler is imported into Edge runtime');
assert(edge.current_index_imports_identity_handler === false, 'manifest misstates Edge import status');
assert(edge.edge_deploy_ready === false && edge.verified_actor_injection_integrated === false, 'Edge layer claims readiness');
assert(edge.service_key_exposure_to_browser_allowed === false, 'browser service key exposure allowed');
assert(identity.runtime_integrated === false && identity.edge_deployed === false, 'identity contract claims runtime deployment');

const frontend = layers[5];
const guard = fs.readFileSync(path.join(root, 'assets/js/nav-v2/task-action-guard-v2.js'), 'utf8');
assert(guard.includes('const BOUNDED_TRANSPORT_ENABLED = false;'), 'bounded transport flag is not false');
assert(frontend.bounded_transport_enabled === false && frontend.default_path === 'legacy_runtime', 'frontend escaped legacy default');

const e2e = layers[6];
assert(auth.supabase_branch_created === false && auth.authenticated_e2e_proven === false, 'auth package claims cloud execution');
assert(e2e.explicit_cost_approval === false && e2e.branch_created === false, 'E2E layer bypasses cost gate');
assert(e2e.production_data_copy_allowed === false, 'E2E layer allows production data copy');

const cleanupLayer = layers[7];
assert(cleanup.selected_option === null && cleanupLayer.selected_cleanup_option === null, 'cleanup option selected');
assert(cleanupLayer.cleanup_allowed === false && cleanupLayer.privacy_replacement_live === false, 'cleanup layer claims live replacement');

for (const stop of ['selected_deployment_option_missing', 'explicit_cost_approval_missing', 'cost_confirmation_id_missing', 'preview_branch_missing', 'executable_migrations_not_created', 'production_rollback_bundle_not_ready', 'edge_identity_handler_not_integrated', 'frontend_bounded_transport_disabled', 'authenticated_role_matrix_not_run', 'production_deployment_approval_missing', 'pilot_scope_missing', 'cleanup_option_unselected']) {
  assert(manifest.active_stops.includes(stop), `active stop missing: ${stop}`);
}
for (const action of ['create_supabase_branch_without_explicit_cost_approval', 'create_or_apply_production_migration', 'deploy_edge_function', 'mass_backfill_or_cleanup_legacy_tasks', 'claim_deployment_readiness']) {
  assert(manifest.forbidden_actions.includes(action), `forbidden action missing: ${action}`);
}
assert(decision.deployment_bundle_ready === false, 'decision package claims deployment bundle readiness');

console.log('Navigator v2 preview deployment bundle manifest semantic contract passed');
