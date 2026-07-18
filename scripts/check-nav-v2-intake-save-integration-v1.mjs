import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const catalog = JSON.parse(await readFile(resolve(root, 'config/nav-v2-intake-contract-v1.json'), 'utf8'));
const integration = JSON.parse(await readFile(resolve(root, 'config/nav-v2-intake-save-integration-v1.json'), 'utf8'));
const sql = await readFile(resolve(root, 'supabase/prototypes/nav_v2_intake_save_integration_v1.sql'), 'utf8');

assert.equal(integration.contract_version, 1);
assert.equal(integration.status, 'repository_only_prototype');
assert.equal(integration.production_applied, false);
assert.equal(integration.production_call_allowed, false);
assert.equal(integration.write_boundary, 'harness_mock_only');
assert.equal(integration.request_id.type, 'uuid');
assert.equal(integration.request_id.required, true);
assert.equal(integration.request_id.production_ledger_present, false);

const requestTypeIds = catalog.request_types.map((item) => item.id).sort();
assert.deepEqual(Object.keys(integration.request_type_to_legacy_mode).sort(), requestTypeIds, 'legacy mode map must cover every request type');
assert.deepEqual(
  Object.values(integration.request_type_to_legacy_mode).sort(),
  ['check_docs', 'consult', 'deal', 'deposit', 'rework'],
  'legacy mode map changed unexpectedly',
);

const canonicalRuleIds = catalog.rules.map((rule) => rule.id).sort();
const supported = [...integration.legacy_rule_projection.supported].sort();
const unsupported = [...integration.legacy_rule_projection.unsupported].sort();
assert.equal(new Set([...supported, ...unsupported]).size, canonicalRuleIds.length, 'legacy rule sets overlap or omit rules');
assert.deepEqual([...supported, ...unsupported].sort(), canonicalRuleIds, 'legacy rule parity inventory must cover all canonical rules');
assert.deepEqual(
  catalog.rules.filter((rule) => rule.owner === 'broker').map((rule) => rule.id).sort(),
  ['military_mortgage', 'mortgage'],
  'canonical broker scope expanded beyond mortgages',
);

for (const [requestType, legacyMode] of Object.entries(integration.request_type_to_legacy_mode)) {
  assert.ok(sql.includes(`when '${requestType}' then '${legacyMode}'`), `SQL is missing request projection ${requestType}`);
}
for (const ruleId of supported) assert.ok(sql.includes(`'${ruleId}'`), `SQL is missing supported rule ${ruleId}`);
for (const reason of integration.mandatory_stop_reasons) {
  assert.ok(sql.includes(`'${reason}'`), `SQL is missing mandatory STOP reason ${reason}`);
}
for (const key of integration.trusted_server_context_keys) {
  assert.ok(sql.includes(`'${key}'`), `SQL is missing trusted server key ${key}`);
}

assert.ok(sql.includes("'production_call', jsonb_build_object('allowed', false"), 'production gate must remain hard-disabled');
assert.ok(sql.includes("'creation_state', 'preview_only'"), 'resolved tasks must remain previews');
assert.ok(sql.includes("'execute', false"), 'legacy call preview must remain non-executable');
assert.ok(sql.includes("'fingerprint_scope', 'trusted_context_and_legacy_payload'"), 'request fingerprint must bind trusted context');
for (const gate of [
  'v_owner_resolution_complete',
  'v_rule_parity',
  'v_document_scope_parity',
  'v_actor_assignment_parity',
]) {
  assert.ok(sql.includes(`and ${gate}`), `mock boundary is missing ${gate}`);
}

console.log(
  `Navigator v2 intake save integration parity passed: ${canonicalRuleIds.length} rules `
  + `(${supported.length} projected, ${unsupported.length} explicit gaps), exact request map and hard production STOP`,
);
