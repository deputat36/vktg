#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-legacy-quality-cleanup-decision-v1.json'), 'utf8'));
const sql = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_legacy_quality_cleanup_plan_v1.sql'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(config.contract_version === 1, 'unexpected cleanup contract version');
assert(config.status === 'repository_only_decision_package', 'cleanup contract escaped repository-only status');
assert(config.production_ready === false, 'cleanup contract claims production readiness');
assert(config.writes_allowed === false, 'cleanup contract allows writes');
assert(config.selected_option === null, 'cleanup option was selected without owner decision');
assert(config.inventory_snapshot.total_open_rows === 46, 'cleanup inventory differs from 46');
assert(config.inventory_snapshot.obsolete_privacy_conflict === 40, 'privacy-conflict inventory differs from 40');
assert(config.owner_options.length === 3, 'owner options must remain three');
assert(config.owner_options.filter((item) => item.recommended).length === 1, 'exactly one safest option must be marked');

for (const source of config.managed_legacy_sources) assert(sql.includes(source), `missing legacy source ${source}`);
for (const classification of config.classifications) assert(sql.includes(classification), `missing classification ${classification}`);
assert(sql.includes("'selected_option', null"), 'planner selected an option');
assert(sql.includes("'writes_performed', false"), 'planner write evidence missing');
assert(sql.includes("'production_ready', false"), 'planner production gate missing');
assert(sql.includes('order by source, deal_id, task_id'), 'planner output is not deterministically ordered');
assert(!/\b(insert|update|delete|truncate)\s+(into\s+|from\s+)?public\./i.test(sql), 'planner contains public-table DML');
assert(!/(seller_name|buyer_name|seller_phone|buyer_phone|passport|snils|\binn\b)/i.test(sql), 'planner contains PII dependency');
assert(!/(assigned_to|created_by|employee_score|performance)/i.test(sql), 'planner contains employee evaluation or assignment data');
assert(sql.includes('to service_role'), 'service-only grant is missing');

console.log('Navigator v2 legacy quality cleanup decision semantic contract passed');
