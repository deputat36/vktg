#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-special-semantics-integration-v1.json'), 'utf8'));
const wave2 = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-semantics-wave2-integration-v1.json'), 'utf8'));
const preview = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_intake_special_semantics_integration_preview_v1.sql'), 'utf8');
const mapping = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_intake_special_semantics_mapping_v1.sql'), 'utf8');
const sql = `${preview}\n${mapping}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const special = ['legal_problem', 'partner_agency', 'flat_ground', 'house_land'];
assert(config.contract_version === 1, 'unexpected final integration version');
assert(config.status === 'repository_only_integration_rehearsal', 'final integration escaped rehearsal status');
assert(config.production_ready === false, 'final integration claims production readiness');
assert(config.base_effective_supported_count === 21, 'wave2 supported baseline changed');
assert(config.base_effective_unsupported_count === 4, 'wave2 unsupported baseline changed');
assert(config.effective_supported_count === 25, 'final support differs from 25');
assert(config.effective_unsupported_count === 0, 'final unsupported differs from zero');
assert(wave2.effective_supported_rules.join(',') === config.effective_supported_rules.slice(0, 21).join(','), 'wave2 support inventory drifted');
assert(wave2.effective_unsupported_rules.join(',') === special.join(','), 'special inventory drifted');
assert(config.qualified_special_rules.join(',') === special.join(','), 'qualified special inventory drifted');

for (const rule of special) assert(sql.includes(`'${rule}'`), `missing special rule ${rule}`);
for (const marker of [
  'nav_v2_prepare_intake_legacy_save_special_v1',
  'nav_v2_build_governed_intake_write_plan_special_v1',
  'nav_v2_map_governed_intake_to_production_special_v1',
  'Special rule is not backed by qualification evidence',
  'Special no-document rule contains document row',
  "'effective_supported_count',25",
  "'effective_unsupported_count',0",
  "'production_ready',false",
  "'writes_performed',false",
  "'task_type','legal_blocker'",
]) assert(sql.includes(marker), `missing final integration marker ${marker}`);

assert(!/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\./i.test(sql), 'final integration contains business DML');
assert(sql.includes('to service_role'), 'service-role execute missing');
assert(preview.includes("'production_execute',false"), 'production execute gate missing');

console.log('Navigator v2 final special semantics integration semantic contract passed');
