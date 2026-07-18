import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const governed = JSON.parse(await readFile(resolve(root, 'config/nav-v2-governed-intake-save-boundary-v1.json'), 'utf8'));
const integration = JSON.parse(await readFile(resolve(root, 'config/nav-v2-intake-save-integration-v1.json'), 'utf8'));
const sql = await readFile(resolve(root, 'supabase/prototypes/nav_v2_governed_intake_save_boundary_v1.sql'), 'utf8');

assert.equal(governed.contract_version, 1);
assert.equal(governed.status, 'repository_only_prototype');
assert.equal(governed.production_applied, false);
assert.equal(governed.production_rpc_exposed, false);
assert.equal(governed.write_boundary, 'single_private_transaction');
assert.deepEqual(governed.request_ledger.primary_key, ['client_request_id']);
assert.deepEqual(governed.request_ledger.bound_fields, ['verified_actor_id', 'payload_fingerprint']);
assert.deepEqual(governed.request_ledger.states, ['started', 'completed']);
assert.equal(governed.request_ledger.stranded_started_commit_allowed, false);
assert.equal(governed.request_ledger.exact_replay_returns_stored_result, true);
assert.equal(governed.request_ledger.changed_actor_or_payload_rejected, true);

assert.deepEqual(
  [...governed.unsupported_legacy_rules].sort(),
  [...integration.legacy_rule_projection.unsupported].sort(),
  '12 semantic gaps must remain fail-closed',
);
assert.deepEqual(
  governed.planned_rows,
  ['deal', 'participants', 'documents', 'risks', 'tasks', 'created_event'],
  'governed row topology changed unexpectedly',
);
assert.deepEqual(
  governed.document_scope.allowed_sides,
  ['seller', 'buyer', 'object', 'deal'],
  'side-aware document scope changed unexpectedly',
);

for (const marker of [
  'pg_advisory_xact_lock',
  'deferrable initially deferred',
  "state in ('started', 'completed')",
  "'replaces_legacy_document_scope', true",
  "'replaces_legacy_actor_assignment', true",
  "'unsupported_rule_semantics'",
  "'owner_resolution_incomplete'",
  'replay_count = replay_count + 1',
]) {
  assert.ok(sql.includes(marker), `governed SQL is missing ${marker}`);
}
for (const role of Object.keys(governed.trusted_owner_sources)) {
  assert.ok(sql.includes(`'${role === 'created_by' ? 'created_by' : `${role}_id`}'`) || role === 'lead_spn', `SQL owner plan is missing ${role}`);
}
assert.ok(!sql.includes('nav_v2_save_wizard_result_legacy'), 'governed prototype must not invoke legacy production save');
assert.ok(!sql.includes('public.nav_'), 'governed prototype must not touch public business tables');

console.log(
  `Navigator v2 governed intake semantics passed: ${governed.unsupported_legacy_rules.length} gaps remain blocked, `
  + `${governed.planned_rows.length} explicit row groups and atomic replay ledger`,
);
