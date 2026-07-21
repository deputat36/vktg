#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-deployment-decision-package-v1.json'), 'utf8'));
const auth = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-auth-e2e-readiness.json'), 'utf8'));
const final = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-special-semantics-integration-v1.json'), 'utf8'));
const cleanup = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-legacy-quality-cleanup-decision-v1.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(config.contract_version === 1, 'unexpected deployment package version');
assert(config.status === 'repository_only_decision_package', 'package escaped repository-only status');
for (const key of ['production_applied', 'production_ready', 'deployment_bundle_ready', 'authenticated_e2e_proven', 'branch_cost_rechecked', 'branch_creation_allowed', 'technical_accounts_created']) {
  assert(config[key] === false, `${key} must remain false`);
}
assert(config.selected_deployment_option === null, 'deployment option selected automatically');
assert(config.selected_cleanup_option === null, 'cleanup option selected automatically');
assert(final.effective_supported_count === 25 && final.effective_unsupported_count === 0, 'final structural catalog is not 25/0');
assert(final.production_ready === false, 'final structural package claims deployment readiness');
assert(auth.authenticated_e2e_proven === false, 'auth package claims proof');
assert(auth.historical_cost_snapshot.stale_for_execution === true, 'historical cost is not marked stale');
assert(cleanup.selected_option === null, 'cleanup option selected outside owner decision');

assert(config.owner_options.length === 3, 'owner option count changed');
assert(config.owner_options.filter((option) => option.recommended_next).length === 1, 'exactly one next option must be recommended');
assert(config.owner_options[0].id === 'authenticated_e2e_only', 'authenticated E2E is no longer first');
assert(config.owner_options[0].allows_production_merge === false, 'E2E-only option allows production merge');

assert(config.ordered_rollout.map((phase) => phase.order).join(',') === '0,1,2,3,4,5,6,7,8,9', 'rollout order changed');
assert(config.ordered_rollout[2].target === 'non_production_only', 'preview target changed');
assert(config.ordered_rollout[6].id === 'branch_rollback_and_delete', 'branch cleanup phase moved');
assert(config.ordered_rollout[7].id === 'separate_production_decision', 'production decision is not separate');
assert(config.ordered_rollout[9].id === 'optional_legacy_cleanup', 'cleanup is not final and optional');
assert(config.ordered_rollout[9].required_evidence.includes('selected_cleanup_option'), 'cleanup owner evidence missing');

const matrix = config.ordered_rollout[5].required_evidence;
for (const item of ['allowed_deals', 'forbidden_deals', 'broker_mortgage_only', 'viewer_read_only', 'cross_actor_replay_rejected', 'identity_chain']) {
  assert(matrix.includes(item), `matrix evidence missing: ${item}`);
}
for (const stop of ['selected_deployment_option_missing', 'current_branch_cost_missing', 'explicit_cost_approval_missing', 'deployment_bundle_not_ready', 'authenticated_e2e_not_proven', 'production_deployment_approval_missing', 'rollback_attestation_missing', 'cleanup_option_unselected']) {
  assert(config.mandatory_stops.includes(stop), `mandatory stop missing: ${stop}`);
}
for (const artifact of config.source_artifacts) assert(fs.existsSync(path.join(root, artifact)), `source artifact missing: ${artifact}`);

console.log('Navigator v2 deployment decision package semantic contract passed');
