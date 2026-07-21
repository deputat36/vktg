#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function flagValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

const previewValue = flagValue('--preview-bundle-dir');
const boundedValue = flagValue('--bounded-dir');
const reportValue = flagValue('--report');
if (!previewValue) throw new Error('--preview-bundle-dir is required');
if (!boundedValue) throw new Error('--bounded-dir is required');
if (!reportValue) throw new Error('--report is required');

const previewDir = path.resolve(previewValue);
const boundedDir = path.resolve(boundedValue);
const reportPath = path.resolve(reportValue);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/u, '') + '\n';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const config = JSON.parse(await readFile(path.join(root, 'config/nav-v2-combined-preview-lifecycle-v1.json'), 'utf8'));
const previewIndexText = normalize(await readFile(path.join(previewDir, 'bundle-index.json'), 'utf8'));
const boundedIndexText = normalize(await readFile(path.join(boundedDir, 'bounded-consolidated-index.json'), 'utf8'));
const previewIndex = JSON.parse(previewIndexText);
const boundedIndex = JSON.parse(boundedIndexText);

assert(config.status === 'repository_only_combined_preview_lifecycle_not_executable', 'combined lifecycle status drifted');
for (const key of [
  'production_applied', 'preview_branch_created', 'cloud_execution_allowed',
  'cost_confirmation_performed', 'preview_apply_allowed', 'edge_deployed',
  'deployment_bundle_ready', 'production_rollback_bundle_ready',
  'combined_apply_proven', 'combined_rollback_proven',
]) {
  assert(config[key] === false, `${key} escaped fail-closed state`);
}
assert(previewIndex.assembler_status === 'repository_only_ci_assembler_not_deployable', 'preview bundle status drifted');
assert(boundedIndex.status === 'repository_only_consolidated_candidate_not_executable', 'bounded index status drifted');

async function loadArtifact(source, file) {
  const dir = source === 'preview_bundle' ? previewDir : boundedDir;
  const text = normalize(await readFile(path.join(dir, file), 'utf8'));
  let indexItem;
  if (source === 'preview_bundle') {
    indexItem = previewIndex.artifacts.find((item) => item.file === file);
  } else {
    indexItem = boundedIndex.forward.file === file ? boundedIndex.forward : boundedIndex.rollback;
  }
  assert(indexItem, `artifact missing from source index: ${file}`);
  assert(indexItem.bytes === Buffer.byteLength(text), `artifact bytes drifted: ${file}`);
  assert(indexItem.sha256 === sha256(text), `artifact sha256 drifted: ${file}`);
  return { source, file, text, indexItem };
}

const forwardArtifacts = [];
for (const item of config.forward_order) {
  forwardArtifacts.push(await loadArtifact(item.source, item.file));
}
const rollbackArtifacts = [];
for (const item of config.rollback_order) {
  rollbackArtifacts.push(await loadArtifact(item.source, item.file));
}

const forwardSourcePaths = [];
for (const artifact of forwardArtifacts) {
  for (const source of artifact.indexItem.source_order || []) {
    const key = source.path || `generated:${source.id}`;
    forwardSourcePaths.push(key);
  }
}
const duplicateSourcePaths = [...new Set(
  forwardSourcePaths.filter((item, index) => forwardSourcePaths.indexOf(item) !== index)
)];

const combinedForward = forwardArtifacts.map((item) => item.text).join('\n');

function exactFunctions(sql) {
  const definitions = [];
  const pattern = /create\s+or\s+replace\s+function\s+([a-z0-9_.]+)\s*\(([\s\S]*?)\)\s*returns\s+/gi;
  for (const match of sql.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    const args = match[2].replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    definitions.push({ name, signature: `${name}(${args})` });
  }
  return definitions;
}

function namedObjects(sql, expression, kind) {
  const items = [];
  for (const match of sql.matchAll(expression)) {
    items.push({ kind, name: match[1].toLowerCase() });
  }
  return items;
}

const functionCounts = new Map();
for (const item of exactFunctions(combinedForward)) {
  functionCounts.set(item.signature, (functionCounts.get(item.signature) || 0) + 1);
}
const functionRedefinitions = [...functionCounts.entries()]
  .filter(([, count]) => count > 1)
  .map(([signature, count]) => ({
    signature,
    function_name: signature.slice(0, signature.indexOf('(')),
    count,
  }))
  .sort((a, b) => a.signature.localeCompare(b.signature));
const expectedNames = new Set(config.conflict_policy.expected_exact_function_redefinitions);
const unexpectedFunctions = functionRedefinitions.filter((item) => !expectedNames.has(item.function_name));

const objects = [
  ...namedObjects(combinedForward, /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_.]+)/gi, 'table'),
  ...namedObjects(combinedForward, /create\s+type\s+([a-z0-9_.]+)/gi, 'type'),
  ...namedObjects(combinedForward, /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_.]+)/gi, 'index'),
  ...namedObjects(combinedForward, /create\s+(?:constraint\s+)?trigger\s+([a-z0-9_.]+)/gi, 'trigger'),
];
const objectCounts = new Map();
for (const item of objects) {
  const key = `${item.kind}:${item.name}`;
  objectCounts.set(key, (objectCounts.get(key) || 0) + 1);
}
const duplicateObjects = [...objectCounts.entries()]
  .filter(([, count]) => count > 1)
  .map(([key, count]) => ({ key, count }));

const report = {
  schema_version: 1,
  status: 'repository_only_combined_preview_artifact_report',
  validation_passed:
    duplicateSourcePaths.length === 0 &&
    unexpectedFunctions.length === 0 &&
    duplicateObjects.length === 0,
  preview_index_sha256: sha256(previewIndexText),
  bounded_index_sha256: sha256(boundedIndexText),
  forward_order: forwardArtifacts.map((item, index) => ({
    order: index + 1,
    source: item.source,
    file: item.file,
    bytes: Buffer.byteLength(item.text),
    sha256: sha256(item.text),
    source_count: (item.indexItem.source_order || []).length,
  })),
  rollback_order: rollbackArtifacts.map((item, index) => ({
    order: index + 1,
    source: item.source,
    file: item.file,
    bytes: Buffer.byteLength(item.text),
    sha256: sha256(item.text),
    source_count: (item.indexItem.source_order || []).length,
  })),
  duplicate_forward_source_paths: duplicateSourcePaths,
  exact_function_redefinitions: functionRedefinitions,
  unexpected_exact_function_redefinitions: unexpectedFunctions,
  duplicate_created_objects: duplicateObjects,
  preview_branch_created: false,
  production_applied: false,
  preview_apply_allowed: false,
  deployment_bundle_ready: false,
  production_rollback_bundle_ready: false,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (duplicateSourcePaths.length > 0) {
  throw new Error(`duplicate forward source paths: ${duplicateSourcePaths.join(', ')}`);
}
if (unexpectedFunctions.length > 0) {
  throw new Error(`unexpected exact function redefinitions: ${unexpectedFunctions.map((item) => item.signature).join(', ')}`);
}
if (duplicateObjects.length > 0) {
  throw new Error(`duplicate created objects: ${duplicateObjects.map((item) => item.key).join(', ')}`);
}

process.stdout.write('Navigator v2 combined preview artifact conflict validation passed\n');
