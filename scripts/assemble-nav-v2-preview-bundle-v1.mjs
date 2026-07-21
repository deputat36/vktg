#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'config/nav-v2-preview-bundle-assembler-v1.json');
const outputFlag = process.argv.indexOf('--output-dir');
const outputValue = outputFlag >= 0 ? process.argv[outputFlag + 1] : '';

if (!outputValue) throw new Error('--output-dir is required');
const outputDir = path.resolve(outputValue);
const relativeToRoot = path.relative(root, outputDir);
if (!relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot)) {
  throw new Error('assembler output must be outside the repository');
}
if (outputDir.includes(`${path.sep}supabase${path.sep}migrations`)) {
  throw new Error('assembler output cannot target supabase/migrations');
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/u, '') + '\n';
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
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

function redefinitionReport(sql, allowedNames) {
  const counts = new Map();
  for (const definition of functionDefinitions(sql)) {
    counts.set(definition.signature, (counts.get(definition.signature) || 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([signature, count]) => ({ signature, function_name: signature.slice(0, signature.indexOf('(')), count }))
    .sort((a, b) => a.signature.localeCompare(b.signature));
  const unexpected = duplicates.filter((item) => !allowedNames.includes(item.function_name));
  if (unexpected.length) {
    throw new Error(`unexpected exact function redefinitions: ${unexpected.map((item) => item.signature).join(', ')}`);
  }
  return duplicates;
}

async function renderCanonicalAdapter(generated) {
  const catalog = await readJson(generated.catalog);
  const template = await readFile(path.join(root, generated.template), 'utf8');
  const catalogJson = JSON.stringify(catalog);
  const catalogSha = sha256(catalogJson);
  if (Number(catalog.contract_version) !== 1 || !catalog.catalog_version) {
    throw new Error('intake catalog metadata is invalid');
  }
  if ((template.match(/__NAV_V2_INTAKE_CATALOG_JSON__/g) || []).length !== 1) {
    throw new Error('intake adapter JSON marker count differs from one');
  }
  if ((template.match(/__NAV_V2_INTAKE_CATALOG_SHA256__/g) || []).length !== 1) {
    throw new Error('intake adapter SHA marker count differs from one');
  }
  const rendered = template
    .replace('__NAV_V2_INTAKE_CATALOG_JSON__', catalogJson)
    .replace('__NAV_V2_INTAKE_CATALOG_SHA256__', catalogSha);
  if (rendered.includes('__NAV_V2_INTAKE_CATALOG_')) throw new Error('unresolved intake adapter marker');
  return { content: normalize(rendered), catalog_sha256: catalogSha };
}

const allowedRedefinitions = Object.freeze({
  quality: ['nav_v2_private.nav_v2_quality_sync_task_v1'],
  bounded_core: [],
  bounded_dto: ['public.nav_v2_get_deal_card_lite'],
  intake: [],
});

const config = JSON.parse(await readFile(configPath, 'utf8'));
const sourceManifestText = normalize(await readFile(path.join(root, config.source_manifest), 'utf8'));
if (config.status !== 'repository_only_ci_assembler_not_deployable') throw new Error('assembler contract status drifted');
if (config.deployment_bundle_ready !== false || config.production_rollback_bundle_ready !== false) {
  throw new Error('assembler contract claims deployment readiness');
}
if (!Array.isArray(config.segments) || config.segments.map((item) => item.order).join(',') !== '1,2,3,4') {
  throw new Error('assembler segment order must remain 1,2,3,4');
}

await mkdir(outputDir, { recursive: true });
const artifacts = [];
const sourceDigests = [];

for (const segment of config.segments) {
  if (segment.production_executable !== false) throw new Error(`${segment.id} escaped rehearsal-only status`);
  let forward = '-- NAVIGATOR V2 CI-ONLY REHEARSAL FORWARD ARTIFACT\n-- NOT A PRODUCTION MIGRATION. DO NOT APPLY TO PRODUCTION.\n\\set ON_ERROR_STOP on\n';
  const forwardSourceIndex = [];

  for (const generated of segment.generated_forward_sources || []) {
    const rendered = await renderCanonicalAdapter(generated);
    const label = `generated:${generated.id}`;
    forward += sourceSection(label, rendered.content);
    forwardSourceIndex.push({
      kind: 'generated',
      id: generated.id,
      renderer: generated.renderer,
      template: generated.template,
      catalog: generated.catalog,
      catalog_sha256: rendered.catalog_sha256,
      sha256: sha256(rendered.content),
    });
    sourceDigests.push(`${label}:${sha256(rendered.content)}`);
  }

  for (const relative of segment.forward_sources || []) {
    const content = await readText(relative);
    forward += sourceSection(relative, content);
    forwardSourceIndex.push({ kind: 'file', path: relative, sha256: sha256(content) });
    sourceDigests.push(`${relative}:${sha256(content)}`);
  }

  let rollback = '-- NAVIGATOR V2 CI-ONLY REHEARSAL ROLLBACK ARTIFACT\n-- HARNESS ROLLBACK ONLY. NOT AN APPROVED PRODUCTION ROLLBACK.\n\\set ON_ERROR_STOP on\n';
  const rollbackSourceIndex = [];
  for (const relative of segment.rollback_sources || []) {
    const content = await readText(relative);
    rollback += sourceSection(relative, content);
    rollbackSourceIndex.push({ kind: 'file', path: relative, sha256: sha256(content) });
    sourceDigests.push(`${relative}:${sha256(content)}`);
  }

  forward = normalize(forward);
  rollback = normalize(rollback);
  if (forward.includes('__NAV_V2_INTAKE_CATALOG_')) throw new Error(`${segment.id} has unresolved intake marker`);

  const forwardPath = path.join(outputDir, segment.forward_file);
  const rollbackPath = path.join(outputDir, segment.rollback_file);
  await writeFile(forwardPath, forward, 'utf8');
  await writeFile(rollbackPath, rollback, 'utf8');

  const redefinitions = redefinitionReport(forward, allowedRedefinitions[segment.id] || []);
  artifacts.push({
    segment_order: segment.order,
    segment_id: segment.id,
    artifact_kind: 'forward',
    file: segment.forward_file,
    bytes: Buffer.byteLength(forward),
    sha256: sha256(forward),
    source_order: forwardSourceIndex,
    exact_function_redefinitions: redefinitions,
    production_executable: false,
  });
  artifacts.push({
    segment_order: segment.order,
    segment_id: segment.id,
    artifact_kind: 'rollback',
    file: segment.rollback_file,
    bytes: Buffer.byteLength(rollback),
    sha256: sha256(rollback),
    source_order: rollbackSourceIndex,
    production_executable: false,
  });
}

artifacts.sort((a, b) => a.segment_order - b.segment_order || a.artifact_kind.localeCompare(b.artifact_kind));
const index = {
  schema_version: 1,
  assembler_status: 'repository_only_ci_assembler_not_deployable',
  source_manifest: config.source_manifest,
  source_manifest_sha256: sha256(sourceManifestText),
  config_sha256: sha256(normalize(await readFile(configPath, 'utf8'))),
  artifacts,
  combined_source_sha256: sha256(sourceDigests.sort().join('\n')),
  artifacts_are_rehearsal_only: true,
  deployment_bundle_ready: false,
  production_rollback_bundle_ready: false,
  preview_branch_created: false,
  production_applied: false,
};
const indexText = `${JSON.stringify(index, null, 2)}\n`;
await writeFile(path.join(outputDir, config.index_file), indexText, 'utf8');
process.stdout.write(`${JSON.stringify({ output_dir: outputDir, index_sha256: sha256(indexText), artifacts: artifacts.length })}\n`);
