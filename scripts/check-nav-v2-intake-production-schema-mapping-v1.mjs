#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-intake-production-schema-mapping-v1.json'), 'utf8'));
const sql = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_intake_production_schema_mapping_v1.sql'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(config.contract_version === 1, 'unexpected contract version');
assert(config.status === 'repository_only_rehearsal', 'mapping contract escaped rehearsal status');
assert(config.production_ready === false, 'mapping must remain production-blocked');
assert(config.supported_rules_count === 13, 'supported rule inventory changed');
assert(config.unsupported_rules_count === 12, 'unsupported rule inventory changed');
assert(config.document_side_mapping.object === 'both', 'object scope mapping is missing');
assert(config.document_side_mapping.deal === 'both', 'deal scope mapping is missing');
assert(config.blocking_findings.includes('privacy_quality_task_collision'), 'trigger collision is not a STOP');

const expectedHelpers = [
  'nav_v2_map_intake_document_side_v1',
  'nav_v2_map_intake_document_status_v1',
  'nav_v2_map_intake_risk_level_v1',
  'nav_v2_map_intake_task_type_v1',
  'nav_v2_map_intake_task_priority_v1',
  'nav_v2_map_governed_intake_to_production_v1'
];
for (const name of expectedHelpers) assert(sql.includes(name), `missing SQL helper ${name}`);
assert(sql.includes("'info' then 'green'"), 'informational broker rule is not mapped to production risk enum');
assert(sql.includes("'lawyer' then 'legal_blocker'"), 'lawyer task type mapping is missing');
assert(sql.includes("'broker' then 'broker_task'"), 'broker task type mapping is missing');
assert(sql.includes("'spn' then 'operational_task'"), 'SPN task type mapping is missing');
assert(sql.includes("'source', 'intake_v1:'"), 'safe source prefix is missing');
assert(!sql.includes("'source', 'auto_"), 'mapper can accidentally activate production auto due-date semantics');
assert(!sql.match(/\b(insert|update|delete)\s+(into\s+|from\s+)?public\.nav_/i), 'prototype performs production-table DML');

console.log('Navigator v2 intake production schema mapping semantic contract passed');
