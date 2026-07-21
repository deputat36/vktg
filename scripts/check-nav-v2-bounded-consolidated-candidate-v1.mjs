#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateFlag = process.argv.indexOf('--candidate-dir');
const reportFlag = process.argv.indexOf('--report');
const candidateValue = candidateFlag >= 0 ? process.argv[candidateFlag + 1] : '';
const reportValue = reportFlag >= 0 ? process.argv[reportFlag + 1] : '';
if (!candidateValue) throw new Error('--candidate-dir is required');
if (!reportValue) throw new Error('--report is required');

const candidateDir = path.resolve(candidateValue);
const reportPath = path.resolve(reportValue);
const configPath = path.join(root, 'config/nav-v2-bounded-consolidated-candidate-v1.json');
const configText = normalize(await readFile(configPath, 'utf8'));
const config = JSON.parse(configText);
const indexText = normalize(await readFile(path.join(candidateDir, 'bounded-consolidated-index.json'), 'utf8'));
const index = JSON.parse(indexText);

function normalize(value) {
  return value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/u, '') + '\n';
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const readRoot = async (relative) => normalize(await readFile(path.join(root, relative), 'utf8'));

assert(config.status === 'repository_only_consolidated_candidate_not_executable', 'candidate config status drifted');
assert(index.status === 'repository_only_consolidated_candidate_not_executable', 'candidate index status drifted');
assert(index.config_sha256 === sha256(configText), 'candidate config sha256 drifted');
assert(index.preview_branch_created === false, 'candidate index claims preview branch');
assert(index.production_applied === false, 'candidate index claims production apply');
assert(index.preview_apply_allowed === false, 'candidate index claims preview apply permission');
assert(index.deployment_bundle_ready === false, 'candidate index claims deployment_bundle_ready');
assert(index.production_rollback_bundle_ready === false, 'candidate index claims rollback readiness');

const forwardText = normalize(await readFile(path.join(candidateDir, config.forward_file), 'utf8'));
const rollbackText = normalize(await readFile(path.join(candidateDir, config.rollback_file), 'utf8'));
assert(index.forward.file === config.forward_file, 'forward filename drifted');
assert(index.rollback.file === config.rollback_file, 'rollback filename drifted');
assert(index.forward.bytes === Buffer.byteLength(forwardText), 'forward byte size drifted');
assert(index.rollback.bytes === Buffer.byteLength(rollbackText), 'rollback byte size drifted');
assert(index.forward.sha256 === sha256(forwardText), 'forward artifact sha256 drifted');
assert(index.rollback.sha256 === sha256(rollbackText), 'rollback artifact sha256 drifted');
assert(!forwardText.includes('__NAV_V2_INTAKE_'), 'unresolved template marker found in forward candidate');

assert(index.forward.source_order.length === config.forward_sources.length, 'exact forward source order length drifted');
for (let position = 0; position < config.forward_sources.length; position += 1) {
  const expectedPath = config.forward_sources[position];
  const actual = index.forward.source_order[position];
  assert(actual.path === expectedPath, `exact forward source order drifted at ${position}`);
  const source = await readRoot(expectedPath);
  assert(actual.bytes === Buffer.byteLength(source), `forward source bytes drifted: ${expectedPath}`);
  assert(actual.sha256 === sha256(source), `forward source sha256 drifted: ${expectedPath}`);
  assert(forwardText.includes(`BEGIN NAVIGATOR SOURCE: ${expectedPath}`), `forward section missing: ${expectedPath}`);
}

assert(index.rollback.source_order.length === config.rollback_sources.length, 'exact rollback source order length drifted');
for (let position = 0; position < config.rollback_sources.length; position += 1) {
  const expectedPath = config.rollback_sources[position];
  const actual = index.rollback.source_order[position];
  assert(actual.path === expectedPath, `exact rollback source order drifted at ${position}`);
  const source = await readRoot(expectedPath);
  assert(actual.bytes === Buffer.byteLength(source), `rollback source bytes drifted: ${expectedPath}`);
  assert(actual.sha256 === sha256(source), `rollback source sha256 drifted: ${expectedPath}`);
  assert(rollbackText.includes(`BEGIN NAVIGATOR SOURCE: ${expectedPath}`), `rollback section missing: ${expectedPath}`);
}

assert(new Set(config.forward_sources).size === config.forward_sources.length, 'duplicate forward path found');
assert(new Set(config.rollback_sources).size === config.rollback_sources.length, 'duplicate rollback path found');

const redefinitions = index.forward.exact_function_redefinitions || [];
for (const item of redefinitions) {
  assert(item.function_name === 'public.nav_v2_get_deal_card_lite', `unexpected exact function redefinition: ${item.signature}`);
}
assert(redefinitions.length <= 1, 'more than one exact function redefinition group found');

for (const signature of [
  'public.nav_v2_create_bounded_tasks(uuid, jsonb, uuid, uuid)',
  'public.nav_v2_start_bounded_task(uuid, uuid, uuid)',
  'public.nav_v2_complete_bounded_task(uuid, uuid, uuid, uuid)',
  'public.nav_v2_set_bounded_task_active_outcome(uuid, text, text, date, uuid, uuid)',
  'public.nav_v2_propose_bounded_task_terminal_outcome(uuid, text, text, uuid, uuid, uuid)',
  'public.nav_v2_decide_bounded_task_terminal_outcome(uuid, text, uuid, uuid)',
]) {
  const normalizedSignature = signature.toLowerCase();
  assert(forwardText.toLowerCase().includes(`grant execute on function ${normalizedSignature} to service_role;`), `service_role grant missing: ${signature}`);
  assert(forwardText.toLowerCase().includes(`revoke execute on function ${normalizedSignature}\n  from public, anon, authenticated;`) || forwardText.toLowerCase().includes(`revoke execute on function ${normalizedSignature} from public, anon, authenticated;`), `public/anon/authenticated revoke missing: ${signature}`);
  assert(!forwardText.toLowerCase().includes(`grant execute on function ${normalizedSignature} to authenticated;`), `authenticated grant found: ${signature}`);
}

const report = {
  schema_version: 1,
  status: 'repository_only_bounded_consolidated_validation_report',
  config_sha256: index.config_sha256,
  index_sha256: sha256(indexText),
  exact_forward_source_order: true,
  exact_rollback_source_order: true,
  forward: {
    file: index.forward.file,
    bytes: index.forward.bytes,
    sha256: index.forward.sha256,
    source_count: index.forward.source_order.length,
    exact_function_redefinitions: redefinitions,
  },
  rollback: {
    file: index.rollback.file,
    bytes: index.rollback.bytes,
    sha256: index.rollback.sha256,
    source_count: index.rollback.source_order.length,
  },
  service_role_boundary: true,
  preview_branch_created: false,
  production_applied: false,
  preview_apply_allowed: false,
  deployment_bundle_ready: false,
  production_rollback_bundle_ready: false,
  active_stops: config.active_stops,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write('Navigator v2 bounded consolidated candidate artifact sha256 and exact source order validation passed; bounded-consolidated-report.json created\n');
