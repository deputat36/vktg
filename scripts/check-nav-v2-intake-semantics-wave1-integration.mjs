#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-semantics-wave1-integration-v1.json'), 'utf8'));
const base = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-save-integration-v1.json'), 'utf8'));
const sql = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_intake_semantics_wave1_integration_v1.sql'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(config.contract_version === 1, 'unexpected wave1 integration version');
assert(config.status === 'repository_only_integration_rehearsal', 'wave1 integration escaped rehearsal');
assert(config.production_ready === false, 'wave1 integration claims production readiness');
assert(config.effective_supported_count === 17, 'effective support count differs from 17');
assert(config.effective_unsupported_count === 8, 'effective unsupported count differs from 8');
assert(config.qualified_wave1_rules.join(',') === 'spouse,seller_absent,encumbrance,inheritance', 'wave1 rule inventory changed');
assert(base.legacy_rule_projection.supported.length === 13, 'base support inventory is no longer 13');
assert(base.legacy_rule_projection.unsupported.length === 12, 'base unsupported inventory is no longer 12');

for (const fn of [
  'nav_v2_prepare_intake_legacy_save_wave1_v1',
  'nav_v2_build_governed_intake_write_plan_wave1_v1',
  'nav_v2_map_governed_intake_to_production_wave1_v1'
]) assert(sql.includes(fn), `missing integration function ${fn}`);

for (const rule of config.qualified_wave1_rules) assert(sql.includes(rule), `missing wave1 rule ${rule}`);
assert(sql.includes("'effective_supported_count',17"), 'mapper effective supported evidence missing');
assert(sql.includes("'effective_unsupported_count',8"), 'mapper effective unsupported evidence missing');
assert(sql.includes("'production_ready',false"), 'production-ready false gate missing');
assert(sql.includes("'writes_performed',false"), 'zero-write evidence missing');
assert(sql.includes("'task_type','legal_blocker'"), 'wave1 task type escaped legal blocker');
assert(sql.includes("'assigned_role','lawyer'"), 'wave1 risk/task owner escaped lawyer');
assert(sql.includes("'production_execute', false"), 'production execute false gate missing');
assert(!/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\./i.test(sql), 'integration overlay contains public-table DML');
assert(sql.includes('to service_role'), 'service-role grant missing');

console.log('Navigator v2 intake semantics wave1 integration semantic contract passed');
