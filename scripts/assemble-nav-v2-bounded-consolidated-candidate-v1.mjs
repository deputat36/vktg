#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'config/nav-v2-bounded-consolidated-candidate-v1.json');
const outputFlag = process.argv.indexOf('--output-dir');
const outputValue = outputFlag >= 0 ? process.argv[outputFlag + 1] : '';

if (!outputValue) throw new Error('--output-dir is required');
const outputDir = path.resolve(outputValue);
const relativeToRoot = path.relative(root, outputDir);
if (!relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot)) {
  throw new Error('candidate output must be outside the repository');
}
if (outputDir.includes(`${path.sep}supabase${path.sep}migrations`)) {
  throw new Error('candidate output cannot target supabase/migrations');
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/u, '') + '\n';
const readText = async (relative) => normalize(await readFile(path.join(root, relative), 'utf8'));

function sourceSection(label, content) {
  return `\n-- ============================================================================\n-- BEGIN NAVIGATOR SOURCE: ${label}\n-- ============================================================================\n${normalize(content)}-- END NAVIGATOR SOURCE: ${label}\n`;
}

function functionDefinitions(sql) {
  const definitions = [];
  const pattern = /create\s+or\s+replace\s+function\s+([a-z0-9_.]+)\s*\(([\s\S]*?)\)\s*returns\s+/gi;
  for (const match of sql.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    const args = match[2].replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    definitions.push({ name, signature: `${name}(${args})` });
  }
  return definitions;
}

function validateRedefinitions(sql) {
  const counts = new Map();
  for (const definition of functionDefinitions(sql)) {
    counts.set(definition.signature, (counts.get(definition.signature) || 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([signature, count]) => ({
      signature,
      function_name: signature.slice(0, signature.indexOf('(')),
      count,
    }))
    .sort((a, b) => a.signature.localeCompare(b.signature));
  const unexpected = duplicates.filter((item) => item.function_name !== 'public.nav_v2_get_deal_card_lite');
  if (unexpected.length) {
    throw new Error(`unexpected exact function redefinitions: ${unexpected.map((item) => item.signature).join(', ')}`);
  }
  return duplicates;
}

const configText = normalize(await readFile(configPath, 'utf8'));
const config = JSON.parse(configText);
if (config.status !== 'repository_only_consolidated_candidate_not_executable') {
  throw new Error('candidate contract status drifted');
}
for (const key of [
  'production_applied', 'preview_branch_created', 'cloud_execution_allowed',
  'preview_apply_allowed', 'writes_to_supabase_migrations_allowed',
  'deployment_bundle_ready', 'production_rollback_bundle_ready',
]) {
  if (config[key] !== false) throw new Error(`${key} escaped fail-closed state`);
}
if (!config.artifacts_are_temporary_review_candidates) {
  throw new Error('candidate artifacts are not marked temporary review-only');
}
if (new Set(config.forward_sources).size !== config.forward_sources.length) {
  throw new Error('duplicate forward source path');
}
if (new Set(config.rollback_sources).size !== config.rollback_sources.length) {
  throw new Error('duplicate rollback source path');
}

await mkdir(outputDir, { recursive: true });

let forward = '-- NAVIGATOR V2 TEMPORARY CONSOLIDATED BOUNDED FORWARD CANDIDATE\n-- REVIEW/CI ONLY. NOT A MIGRATION. DO NOT APPLY TO PRODUCTION.\n\\set ON_ERROR_STOP on\n';
const forwardSourceOrder = [];
for (const relative of config.forward_sources) {
  const content = await readText(relative);
  forward += sourceSection(relative, content);
  forwardSourceOrder.push({ path: relative, sha256: sha256(content), bytes: Buffer.byteLength(content) });
}
forward = normalize(forward);
const exactFunctionRedefinitions = validateRedefinitions(forward);

let rollback = '-- NAVIGATOR V2 TEMPORARY CONSOLIDATED BOUNDED ROLLBACK CANDIDATE\n-- REVIEW/CI ONLY. NOT AN APPROVED PRODUCTION ROLLBACK.\n\\set ON_ERROR_STOP on\n';
const rollbackSourceOrder = [];
for (const relative of config.rollback_sources) {
  const content = await readText(relative);
  rollback += sourceSection(relative, content);
  rollbackSourceOrder.push({ path: relative, sha256: sha256(content), bytes: Buffer.byteLength(content) });
}
rollback = normalize(rollback);

const forwardPath = path.join(outputDir, config.forward_file);
const rollbackPath = path.join(outputDir, config.rollback_file);
await writeFile(forwardPath, forward, 'utf8');
await writeFile(rollbackPath, rollback, 'utf8');

const index = {
  schema_version: 1,
  status: 'repository_only_consolidated_candidate_not_executable',
  config_path: path.relative(root, configPath).split(path.sep).join('/'),
  config_sha256: sha256(configText),
  forward: {
    file: config.forward_file,
    bytes: Buffer.byteLength(forward),
    sha256: sha256(forward),
    source_order: forwardSourceOrder,
    exact_function_redefinitions: exactFunctionRedefinitions,
  },
  rollback: {
    file: config.rollback_file,
    bytes: Buffer.byteLength(rollback),
    sha256: sha256(rollback),
    source_order: rollbackSourceOrder,
  },
  preview_branch_created: false,
  production_applied: false,
  preview_apply_allowed: false,
  deployment_bundle_ready: false,
  production_rollback_bundle_ready: false,
};
const indexText = `${JSON.stringify(index, null, 2)}\n`;
await writeFile(path.join(outputDir, config.index_file), indexText, 'utf8');
process.stdout.write(`${JSON.stringify({
  output_dir: outputDir,
  forward_sha256: index.forward.sha256,
  rollback_sha256: index.rollback.sha256,
  index_sha256: sha256(indexText),
})}\n`);
