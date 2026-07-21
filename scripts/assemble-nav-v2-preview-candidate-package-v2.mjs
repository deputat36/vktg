#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(root, 'config/nav-v2-preview-candidate-package-v2.json');
const attestationPath = path.join(root, 'config/nav-v2-preview-readonly-attestation-v1.json');
const expectedIndexFile = 'preview-candidate-package-v2-index.json';

function flagValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

const previewBundleValue = flagValue('--preview-bundle-dir');
const boundedValue = flagValue('--bounded-dir');
const outputValue = flagValue('--output-dir');

if (!previewBundleValue) throw new Error('--preview-bundle-dir is required');
if (!boundedValue) throw new Error('--bounded-dir is required');
if (!outputValue) throw new Error('--output-dir is required');

const previewBundleDir = path.resolve(previewBundleValue);
const boundedDir = path.resolve(boundedValue);
const outputDir = path.resolve(outputValue);
const relativeToRoot = path.relative(root, outputDir);
if (!relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot)) {
  throw new Error('package output must be outside the repository');
}
if (outputDir.includes(`${path.sep}supabase${path.sep}migrations`)) {
  throw new Error('package output cannot target supabase/migrations');
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/u, '') + '\n';
const readRootText = async (relative) => normalize(await readFile(path.join(root, relative), 'utf8'));
const readJsonText = async (absolute) => {
  const text = normalize(await readFile(absolute, 'utf8'));
  return { text, value: JSON.parse(text) };
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const packageSource = await readJsonText(packagePath);
const attestationSource = await readJsonText(attestationPath);
const previewIndexSource = await readJsonText(path.join(previewBundleDir, 'bundle-index.json'));
const boundedIndexSource = await readJsonText(path.join(boundedDir, 'bounded-consolidated-index.json'));

const packageConfig = packageSource.value;
const attestation = attestationSource.value;
const previewIndex = previewIndexSource.value;
const boundedIndex = boundedIndexSource.value;

assert(packageConfig.schema_version === 2, 'package v2 schema drifted');
assert(packageConfig.status === 'repository_only_preview_candidate_package_v2_not_executable', 'package v2 status drifted');
assert(packageConfig.package_index_file === expectedIndexFile, 'package v2 index filename drifted');
for (const key of [
  'production_applied', 'preview_branch_created', 'cloud_execution_allowed',
  'cost_confirmation_performed', 'preview_apply_allowed', 'edge_deploy_allowed',
  'technical_accounts_allowed', 'deployment_bundle_ready',
  'production_rollback_bundle_ready', 'authenticated_e2e_proven',
]) {
  assert(packageConfig[key] === false, `${key} escaped fail-closed state`);
}
assert(previewIndex.assembler_status === 'repository_only_ci_assembler_not_deployable', 'preview bundle index status drifted');
assert(boundedIndex.status === 'repository_only_consolidated_candidate_not_executable', 'bounded index status drifted');
assert(attestation.status === 'captured_read_only_production_attestation_not_execution_approval', 'attestation status drifted');
assert(attestation.production_project_ref === packageConfig.production_project_ref, 'attestation project ref drifted');
assert(attestation.data_mutated === false && attestation.ddl_executed === false, 'attestation claims mutation');

async function artifactFromPreview(segmentId, kind, expectedFile) {
  const artifact = previewIndex.artifacts.find((item) =>
    item.segment_id === segmentId && item.artifact_kind === kind
  );
  assert(artifact, `preview artifact missing: ${segmentId}/${kind}`);
  assert(artifact.file === expectedFile, `preview artifact filename drifted: ${segmentId}/${kind}`);
  const content = normalize(await readFile(path.join(previewBundleDir, expectedFile), 'utf8'));
  assert(Buffer.byteLength(content) === artifact.bytes, `preview artifact bytes drifted: ${expectedFile}`);
  assert(sha256(content) === artifact.sha256, `preview artifact sha256 drifted: ${expectedFile}`);
  return {
    artifact_kind: kind,
    file: expectedFile,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    source_order: artifact.source_order,
    production_executable: false,
  };
}

async function artifactFromBounded(kind, expectedFile) {
  const artifact = boundedIndex[kind];
  assert(artifact && artifact.file === expectedFile, `bounded artifact filename drifted: ${kind}`);
  const content = normalize(await readFile(path.join(boundedDir, expectedFile), 'utf8'));
  assert(Buffer.byteLength(content) === artifact.bytes, `bounded artifact bytes drifted: ${expectedFile}`);
  assert(sha256(content) === artifact.sha256, `bounded artifact sha256 drifted: ${expectedFile}`);
  return {
    artifact_kind: kind,
    file: expectedFile,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    source_order: artifact.source_order,
    exact_function_redefinitions: artifact.exact_function_redefinitions || [],
    production_executable: false,
  };
}

const componentIndex = [];
for (const component of packageConfig.components) {
  if (component.id === 'quality' || component.id === 'intake') {
    componentIndex.push({
      order: component.order,
      id: component.id,
      source_index: component.source_index,
      review_state: component.review_state,
      sequential_preview_apply_proven: false,
      can_apply_in_preview: false,
      artifacts: [
        await artifactFromPreview(component.source_segment, 'forward', component.forward_artifact),
        await artifactFromPreview(component.source_segment, 'rollback', component.rollback_artifact),
      ],
    });
  } else if (component.id === 'bounded_consolidated') {
    componentIndex.push({
      order: component.order,
      id: component.id,
      source_index: component.source_index,
      review_state: component.review_state,
      sequential_preview_apply_proven: false,
      can_apply_in_preview: false,
      artifacts: [
        await artifactFromBounded('forward', component.forward_artifact),
        await artifactFromBounded('rollback', component.rollback_artifact),
      ],
    });
  }
}

const edgeComponent = packageConfig.components.find((item) => item.id === 'edge_candidate');
assert(edgeComponent, 'edge candidate component missing');
const edgePaths = [
  edgeComponent.entrypoint,
  ...edgeComponent.support_files,
  edgeComponent.production_snapshot,
];
const edgeFiles = [];
for (const relative of edgePaths) {
  const content = await readRootText(relative);
  edgeFiles.push({
    path: relative,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  });
}
const candidateEntry = await readRootText(edgeComponent.entrypoint);
const productionSnapshot = await readRootText(edgeComponent.production_snapshot);
assert(candidateEntry.includes('const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;'), 'candidate Edge flag is not false');
assert(candidateEntry.includes('routeBoundedTaskEdgeActionV2'), 'candidate Edge route is not source-integrated');
assert(!productionSnapshot.includes('routeBoundedTaskEdgeActionV2'), 'production Edge snapshot contains candidate route');

const preflightText = await readRootText(packageConfig.readonly_preflight_sql);
const index = {
  schema_version: 2,
  status: 'repository_only_preview_candidate_package_v2_index_not_executable',
  package_config_path: path.relative(root, packagePath).split(path.sep).join('/'),
  package_config_sha256: sha256(packageSource.text),
  readonly_attestation_path: path.relative(root, attestationPath).split(path.sep).join('/'),
  readonly_attestation_sha256: sha256(attestationSource.text),
  source_indexes: {
    preview_bundle: {
      file: 'bundle-index.json',
      sha256: sha256(previewIndexSource.text),
      combined_source_sha256: previewIndex.combined_source_sha256,
    },
    bounded_consolidated: {
      file: 'bounded-consolidated-index.json',
      sha256: sha256(boundedIndexSource.text),
      forward_sha256: boundedIndex.forward.sha256,
      rollback_sha256: boundedIndex.rollback.sha256,
    },
  },
  components: componentIndex,
  edge_candidate: {
    files: edgeFiles,
    feature_flag_default: false,
    deployed: false,
    live_baseline: attestation.edge_function,
  },
  readonly_preflight: {
    path: packageConfig.readonly_preflight_sql,
    bytes: Buffer.byteLength(preflightText),
    sha256: sha256(preflightText),
    aggregate_only: true,
    data_mutated: false,
  },
  migration_boundary: packageConfig.migration_boundary,
  active_stops: packageConfig.active_stops,
  preview_branch_created: false,
  production_applied: false,
  cost_confirmation_performed: false,
  preview_apply_allowed: false,
  edge_deployed: false,
  deployment_bundle_ready: false,
  production_rollback_bundle_ready: false,
};

await mkdir(outputDir, { recursive: true });
const indexText = `${JSON.stringify(index, null, 2)}\n`;
await writeFile(path.join(outputDir, expectedIndexFile), indexText, 'utf8');
process.stdout.write(`${JSON.stringify({
  output_dir: outputDir,
  index_sha256: sha256(indexText),
  component_count: componentIndex.length,
  edge_file_count: edgeFiles.length,
})}\n`);
