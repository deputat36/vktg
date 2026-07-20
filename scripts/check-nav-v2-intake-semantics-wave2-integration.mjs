#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-semantics-wave2-integration-v1.json'), 'utf8'));
const wave1 = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-semantics-wave1-integration-v1.json'), 'utf8'));
const sql = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_intake_semantics_wave2_integration_v1.sql'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(config.contract_version === 1, 'unexpected wave2 integration version');
assert(config.status === 'repository_only_integration_rehearsal', 'wave2 escaped integration rehearsal');
assert(config.production_ready === false, 'wave2 claims production readiness');
assert(config.base_effective_supported_count === 17, 'wave1 supported baseline changed');
assert(config.base_effective_unsupported_count === 8, 'wave1 unsupported baseline changed');
assert(config.effective_supported_count === 21, 'wave2 effective support differs from 21');
assert(config.effective_unsupported_count === 4, 'wave2 effective unsupported differs from 4');
assert(wave1.effective_supported_rules.join(',') === config.effective_supported_rules.slice(0, 17).join(','), 'wave1 effective inventory drifted');
assert(
  wave1.effective_unsupported_rules.filter((rule) => config.qualified_wave2_rules.includes(rule)).join(',') === config.qualified_wave2_rules.join(','),
  'wave2 qualification order drifted',
);
assert(
  wave1.effective_unsupported_rules.filter((rule) => !config.qualified_wave2_rules.includes(rule)).join(',') === config.effective_unsupported_rules.join(','),
  'wave2 remaining special inventory drifted',
);

for (const rule of config.qualified_wave2_rules) assert(sql.includes(`'${rule}'`), `missing wave2 rule ${rule}`);
for (const marker of [
  'nav_v2_prepare_intake_legacy_save_wave2_v1',
  'nav_v2_build_governed_intake_write_plan_wave2_v1',
  'nav_v2_map_governed_intake_to_production_wave2_v1',
  'Wave2 rule is not backed by qualification evidence',
  'Wave2 risk row differs from qualified catalog contract',
  'Wave2 lawyer task differs from qualified catalog contract',
  'Wave2 document row differs from qualified catalog contract',
  "'effective_supported_count',21",
  "'effective_unsupported_count',4",
  "'production_ready',false",
  "'writes_performed',false",
  "'task_type','legal_blocker'",
]) assert(sql.includes(marker), `missing wave2 integration marker ${marker}`);

assert(!/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\./i.test(sql), 'wave2 integration contains business DML');
assert(sql.includes('to service_role'), 'service-role execute missing');
assert(sql.includes("'production_execute',false"), 'production execute gate missing');

console.log('Navigator v2 intake semantics wave2 integration semantic contract passed');
