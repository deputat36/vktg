#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-special-semantics-qualification.json'), 'utf8'));
const wave2 = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-semantics-wave2-integration-v1.json'), 'utf8'));
const sql = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_intake_special_semantics_qualification.sql'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ruleIds = ['legal_problem', 'partner_agency', 'flat_ground', 'house_land'];
assert(config.contract_version === 1, 'unexpected special qualification version');
assert(config.status === 'repository_only_qualification', 'special semantics escaped qualification status');
assert(config.production_ready === false, 'special qualification claims production readiness');
assert(config.changes_supported_inventory === false, 'special qualification claims support promotion');
assert(config.base_effective_supported_count === 21, 'effective supported baseline changed');
assert(config.base_effective_unsupported_count === 4, 'effective unsupported baseline changed');
assert(config.candidate_rules.map((rule) => rule.id).join(',') === ruleIds.join(','), 'special rule inventory changed');
assert(wave2.effective_unsupported_rules.join(',') === ruleIds.join(','), 'special rules differ from wave2 fail-closed inventory');
assert(config.candidate_rules[0].documents.length === 0, 'legal_problem must remain no-document');

for (const rule of config.candidate_rules) {
  assert(rule.owner === 'lawyer', `${rule.id} escaped lawyer ownership`);
  assert(sql.includes(`'id','${rule.id}'`), `missing SQL spec for ${rule.id}`);
  assert(sql.includes(`'trigger_kind','${rule.trigger_kind}'`), `missing trigger kind for ${rule.id}`);
  assert(sql.includes(`'trigger_value','${rule.trigger_value}'`), `missing trigger value for ${rule.id}`);
  for (const document of rule.documents) assert(sql.includes(`'type','${document}'`), `missing document ${document}`);
}

for (const marker of [
  'nav_v2_intake_special_semantics_spec_v1',
  'nav_v2_qualify_intake_special_semantics_v1',
  "'trigger_contract_mismatch'",
  "'unexpected_rule_document'",
  'structured_legal_decision',
  'structured_document_statuses',
  "'base_effective_supported_count',21",
  "'base_effective_unsupported_inventory',4",
  "'changes_supported_inventory',false",
  "'production_ready',false",
  "'writes_performed',false",
]) assert(sql.includes(marker), `missing special qualification marker ${marker}`);

assert(!/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\./i.test(sql), 'special qualification contains business DML');
assert(sql.includes('to service_role'), 'service-role execute missing');

console.log('Navigator v2 special semantics qualification semantic contract passed');
