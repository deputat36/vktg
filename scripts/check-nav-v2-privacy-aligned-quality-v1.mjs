#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/nav-v2-privacy-aligned-quality-completeness-v1.json'), 'utf8'));
const sql = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_privacy_aligned_quality_completeness_v1.sql'), 'utf8');
const authorSql = fs.readFileSync(path.join(root, 'supabase/prototypes/nav_v2_privacy_aligned_quality_task_author_v1.sql'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(config.contract_version === 1, 'unexpected quality contract version');
assert(config.status === 'repository_only_rehearsal', 'quality contract escaped rehearsal');
assert(config.production_applied === false, 'quality contract claims production apply');
assert(config.production_ready === false, 'quality contract claims production readiness');
assert(config.no_mass_backfill === true, 'quality contract allows mass backfill');
assert(config.production_snapshot.open_auto_quality_seller_name === 23, 'seller-name inventory changed');
assert(config.production_snapshot.open_auto_quality_buyer_name === 17, 'buyer-name inventory changed');

for (const source of config.managed_sources) assert(sql.includes(source), `missing managed source ${source}`);
assert(sql.includes("v_representation = 'partner_agency'"), 'partner side is not handled explicitly');
assert(sql.includes("v_representation = 'one_spn_both'"), 'one-SPN consistency is missing');
assert(sql.includes("v_intake_v1 and v_target_date = '' and not v_date_unknown"), 'structured-only deadline gate is missing');
assert(sql.includes('v_intake_v1 and d.lawyer_needed'), 'structured-only lawyer question gate is missing');
assert(sql.includes('v_intake_v1 and d.broker_needed'), 'structured-only broker question gate is missing');
assert(!/d\.(seller_name|buyer_name|seller_phone|buyer_phone)/i.test(sql), 'quality logic depends on forbidden client identifiers');
assert(!/select\s+public\.nav_v2_sync_deal_quality_tasks\s*\(\s*id\s*\)/i.test(sql), 'prototype contains a mass sync');
assert(authorSql.includes('select created_by into v_created_by'), 'author overlay does not resolve deal creator');
assert(authorSql.includes('v_created_by, p_task_type'), 'author overlay does not persist deal creator');
assert(sql.includes("'management_escalation'"), 'manager assignment is not bounded');
assert(sql.includes("'operational_task'"), 'SPN completeness task type is missing');
assert(sql.includes('sla_days'), 'quality tasks lack SLA contract');

console.log('Navigator v2 privacy-aligned quality semantic contract passed');
