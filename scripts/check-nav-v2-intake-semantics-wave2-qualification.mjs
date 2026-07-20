#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-semantics-wave2-qualification.json'), 'utf8'));
const sql = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_intake_semantics_wave2_qualification.sql'), 'utf8');
const mapper = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_intake_production_schema_mapping_v1.sql'), 'utf8');
const wave1 = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_intake_semantics_wave1_integration_v1.sql'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ruleIds = ['bankruptcy_risk', 'redevelopment', 'after_registration', 'certificate'];
assert(config.contract_version === 1, 'unexpected wave2 qualification version');
assert(config.status === 'repository_only_qualification', 'wave2 escaped qualification status');
assert(config.production_ready === false, 'wave2 claims production readiness');
assert(config.changes_supported_inventory === false, 'wave2 claims support promotion');
assert(config.base_effective_supported_count === 17, 'effective supported baseline changed');
assert(config.base_effective_unsupported_count === 8, 'effective unsupported baseline changed');
assert(config.candidate_rules.map((rule) => rule.id).join(',') === ruleIds.join(','), 'wave2 rule inventory changed');

for (const rule of config.candidate_rules) {
  assert(rule.owner === 'lawyer', `${rule.id} escaped lawyer ownership`);
  assert(sql.includes(`'id','${rule.id}'`), `missing SQL spec for ${rule.id}`);
  assert(sql.includes(rule.expected_decision), `missing expected decision for ${rule.id}`);
  for (const document of rule.documents) assert(sql.includes(`'type','${document}'`), `missing document ${document}`);
}

assert(sql.includes("'fact_evidence_source_missing'"), 'evidence-source fail-closed gap missing');
assert(sql.includes("'lawyer_owner_unresolved'"), 'lawyer owner gate missing');
assert(sql.includes("'lawyer_handoff_not_ready'"), 'handoff gate missing');
assert(sql.includes("'broker_scope_expansion'"), 'broker scope gate missing');
assert(sql.includes("'base_effective_supported_count',17"), 'effective supported evidence missing');
assert(sql.includes("'base_effective_unsupported_inventory',8"), 'effective unsupported evidence missing');
assert(sql.includes("'changes_supported_inventory',false"), 'qualification-only evidence missing');
assert(!/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\./i.test(sql), 'qualification contains business DML');
assert(sql.includes('to service_role'), 'service-role execute missing');

const baseSupported = mapper.split('v_supported text[] := array[')[1]?.split('];')[0] || '';
const wave1Ids = wave1.split('v_wave_ids text[] := array[')[1]?.split('];')[0] || '';
for (const ruleId of ruleIds) {
  assert(!baseSupported.includes(`'${ruleId}'`), `${ruleId} silently entered base mapper support`);
  assert(!wave1Ids.includes(`'${ruleId}'`), `${ruleId} silently entered wave1 support`);
}

console.log('Navigator v2 intake semantics wave2 qualification semantic contract passed');
