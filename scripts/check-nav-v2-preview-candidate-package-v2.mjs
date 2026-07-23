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

const packageDirValue = flagValue('--package-dir');
const previewBundleValue = flagValue('--preview-bundle-dir');
const boundedValue = flagValue('--bounded-dir');
const reportValue = flagValue('--report');
if (!packageDirValue) throw new Error('--package-dir is required');
if (!previewBundleValue) throw new Error('--preview-bundle-dir is required');
if (!boundedValue) throw new Error('--bounded-dir is required');
if (!reportValue) throw new Error('--report is required');

const packageDir = path.resolve(packageDirValue);
const previewBundleDir = path.resolve(previewBundleValue);
const boundedDir = path.resolve(boundedValue);
const reportPath = path.resolve(reportValue);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/u, '') + '\n';
const readRootText = async (relative) => normalize(await readFile(path.join(root, relative), 'utf8'));
const readRootJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const readJsonText = async (absolute) => {
  const text = normalize(await readFile(absolute, 'utf8'));
  return { text, value: JSON.parse(text) };
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const packageConfig = await readRootJson('config/nav-v2-preview-candidate-package-v2.json');
const attestation = await readRootJson('config/nav-v2-preview-readonly-attestation-v1.json');
const previewConfig = await readRootJson('config/nav-v2-preview-bundle-assembler-v1.json');
const boundedConfig = await readRootJson('config/nav-v2-bounded-consolidated-candidate-v1.json');
const releaseBaseline = await readRootJson('config/nav-v2-release-baseline.json');
const sharedRelease = await readRootJson('config/nav-v2-release-drift-shared-project-v1.json');
const packageIndexSource = await readJsonText(path.join(packageDir, packageConfig.package_index_file));
const previewIndexSource = await readJsonText(path.join(previewBundleDir, 'bundle-index.json'));
const boundedIndexSource = await readJsonText(path.join(boundedDir, 'bounded-consolidated-index.json'));
const packageIndex = packageIndexSource.value;
const previewIndex = previewIndexSource.value;
const boundedIndex = boundedIndexSource.value;

assert(packageIndex.schema_version === 2, 'package index schema drifted');
assert(packageIndex.status === 'repository_only_preview_candidate_package_v2_index_not_executable', 'package index status drifted');
for (const key of [
  'preview_branch_created', 'production_applied', 'cost_confirmation_performed',
  'preview_apply_allowed', 'edge_deployed', 'deployment_bundle_ready',
  'production_rollback_bundle_ready',
]) {
  assert(packageIndex[key] === false, `package index ${key} escaped fail-closed state`);
}
assert(packageIndex.package_config_sha256 === sha256(normalize(await readFile(path.join(root, 'config/nav-v2-preview-candidate-package-v2.json'), 'utf8'))), 'package config sha256 drifted');
assert(packageIndex.readonly_attestation_sha256 === sha256(normalize(await readFile(path.join(root, 'config/nav-v2-preview-readonly-attestation-v1.json'), 'utf8'))), 'attestation sha256 drifted');
assert(packageIndex.source_indexes.preview_bundle.sha256 === sha256(previewIndexSource.text), 'preview bundle index sha256 drifted');
assert(packageIndex.source_indexes.bounded_consolidated.sha256 === sha256(boundedIndexSource.text), 'bounded index sha256 drifted');

const expectedComponentIds = ['quality', 'bounded_consolidated', 'intake'];
assert(packageIndex.components.map((item) => item.id).join(',') === expectedComponentIds.join(','), 'package component order drifted');

function previewArtifact(segmentId, kind) {
  return previewIndex.artifacts.find((item) => item.segment_id === segmentId && item.artifact_kind === kind);
}

const componentEvidence = [];
for (const component of packageIndex.components) {
  assert(component.sequential_preview_apply_proven === false, `${component.id} claims sequential apply proof`);
  assert(component.can_apply_in_preview === false, `${component.id} permits preview apply`);
  assert(Array.isArray(component.artifacts) && component.artifacts.length === 2, `${component.id} artifact inventory drifted`);

  for (const artifact of component.artifacts) {
    let sourceArtifact;
    let sourceDir;
    if (component.id === 'bounded_consolidated') {
      sourceArtifact = boundedIndex[artifact.artifact_kind];
      sourceDir = boundedDir;
    } else {
      sourceArtifact = previewArtifact(component.id, artifact.artifact_kind);
      sourceDir = previewBundleDir;
    }
    assert(sourceArtifact, `${component.id}/${artifact.artifact_kind} source artifact missing`);
    assert(artifact.file === sourceArtifact.file, `${component.id}/${artifact.artifact_kind} filename drifted`);
    assert(artifact.bytes === sourceArtifact.bytes, `${component.id}/${artifact.artifact_kind} bytes drifted`);
    assert(artifact.sha256 === sourceArtifact.sha256, `${component.id}/${artifact.artifact_kind} sha256 drifted`);
    assert(JSON.stringify(artifact.source_order) === JSON.stringify(sourceArtifact.source_order), `${component.id}/${artifact.artifact_kind} exact source order drifted`);
    const content = normalize(await readFile(path.join(sourceDir, artifact.file), 'utf8'));
    assert(Buffer.byteLength(content) === artifact.bytes, `${artifact.file} byte size mismatch`);
    assert(sha256(content) === artifact.sha256, `${artifact.file} artifact hash mismatch`);
    componentEvidence.push({
      component_id: component.id,
      artifact_kind: artifact.artifact_kind,
      file: artifact.file,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      source_count: artifact.source_order.length,
    });
  }
}

const boundedForward = packageIndex.components.find((item) => item.id === 'bounded_consolidated').artifacts.find((item) => item.artifact_kind === 'forward');
assert(boundedForward.source_order.map((item) => item.path).join(',') === boundedConfig.forward_sources.join(','), 'bounded exact forward source order drifted');
assert(new Set(boundedConfig.forward_sources).size === boundedConfig.forward_sources.length, 'bounded forward contains duplicate source paths');
assert(packageIndex.source_indexes.bounded_consolidated.forward_sha256 === boundedIndex.forward.sha256, 'bounded forward source index hash drifted');
assert(packageIndex.source_indexes.bounded_consolidated.rollback_sha256 === boundedIndex.rollback.sha256, 'bounded rollback source index hash drifted');

const qualityConfig = previewConfig.segments.find((item) => item.id === 'quality');
const intakeConfig = previewConfig.segments.find((item) => item.id === 'intake');
assert(qualityConfig && intakeConfig, 'quality/intake assembler segments missing');
assert(packageIndex.components[0].artifacts[0].source_order.length === qualityConfig.forward_sources.length, 'quality exact source order length drifted');
assert(packageIndex.components[2].artifacts[0].source_order.length === intakeConfig.forward_sources.length + (intakeConfig.generated_forward_sources || []).length, 'intake exact source order length drifted');

assert(attestation.production_project_ref === packageConfig.production_project_ref, 'attestation project mismatch');
assert(attestation.postgres_major === packageConfig.preflight_contract.expected_postgres_major, 'PostgreSQL major attestation drifted');
assert(attestation.migration_boundary.latest_navigator_migration === packageConfig.preflight_contract.expected_latest_navigator_migration, 'Navigator migration boundary drifted');
assert(attestation.migration_boundary.navigator_boundary_matches === true, 'Navigator migration boundary is not attested');
assert(attestation.migration_boundary.latest_remote_migration === packageConfig.preflight_contract.observed_latest_remote_migration, 'overall remote migration snapshot drifted');
assert(attestation.branches.preview === 0 && attestation.branches.technical_branch_present === false, 'preview branch unexpectedly present');
assert(attestation.technical_identity_absence.auth_users === 0 && attestation.technical_identity_absence.profiles === 0, 'technical identities unexpectedly present');
assert(attestation.candidate_database_absence.candidate_objects_present === 0, 'candidate database objects unexpectedly present');
assert(attestation.edge_function.version === 4, 'live Edge version drifted');
assert(attestation.edge_function.status === 'ACTIVE', 'live Edge status drifted');
assert(attestation.edge_function.verify_jwt === true, 'live Edge verify_jwt drifted');
assert(attestation.edge_function.ezbr_sha256 === packageConfig.preflight_contract.expected_edge_bundle_sha256, 'live Edge bundle hash drifted');

assert(packageConfig.migration_boundary.release_baseline_latest_live_migration === '20260715203158', 'historical package v2 release baseline snapshot drifted');
assert(packageConfig.migration_boundary.release_baseline_drift_detected === true, 'historical package v2 drift evidence was rewritten');
assert(packageConfig.migration_boundary.release_baseline_refresh_allowed === false, 'historical package v2 allowed automatic baseline refresh');
assert(packageConfig.active_stops.includes('release_baseline_migration_drift_unreconciled'), 'historical package v2 drift stop missing');
assert(packageConfig.active_stops.includes('cross_component_sequential_apply_not_proven'), 'cross-component apply stop missing');
assert(releaseBaseline.latest_live_migration === '20260716063401', 'current release baseline is not reconciled');
assert(sharedRelease.current_navigator_live_migration === releaseBaseline.latest_live_migration, 'shared-project release contract differs from current baseline');
assert(sharedRelease.navigator_baseline_semantics === 'required_present_not_global_latest', 'shared-project baseline semantics drifted');
assert(sharedRelease.result.production_mutation === false, 'shared-project reconciliation claims production mutation');

const edgeFiles = [];
for (const item of packageIndex.edge_candidate.files) {
  const content = await readRootText(item.path);
  assert(Buffer.byteLength(content) === item.bytes, `Edge file bytes drifted: ${item.path}`);
  assert(sha256(content) === item.sha256, `Edge file sha256 drifted: ${item.path}`);
  edgeFiles.push(item);
}
const candidateEntry = await readRootText('supabase/functions/nav-v2-deal-api/index.ts');
const productionSnapshot = await readRootText('supabase/functions/nav-v2-deal-api/index.production-v4.ts');
assert(candidateEntry.includes('const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;'), 'candidate Edge feature flag is not false');
assert(candidateEntry.includes('routeBoundedTaskEdgeActionV2'), 'candidate Edge route missing');
assert(!productionSnapshot.includes('routeBoundedTaskEdgeActionV2'), 'production snapshot contains candidate route');

const preflightText = await readRootText(packageConfig.readonly_preflight_sql);
assert(preflightText.includes('begin transaction read only;'), 'read-only transaction marker missing');
assert(preflightText.includes('rollback;'), 'read-only rollback marker missing');
assert(preflightText.includes('aggregate_only'), 'aggregate-only evidence marker missing');
const forbiddenSql = /\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|comment|copy|call|do)\b/i;
const executableSql = preflightText.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
assert(!forbiddenSql.test(executableSql), 'read-only preflight contains DDL or DML');
assert(packageIndex.readonly_preflight.sha256 === sha256(preflightText), 'preflight SQL sha256 drifted');
assert(packageIndex.readonly_preflight.aggregate_only === true && packageIndex.readonly_preflight.data_mutated === false, 'preflight index claims mutation');

const report = {
  schema_version: 2,
  status: 'repository_only_preview_candidate_package_v2_validation_report',
  package_index_sha256: sha256(packageIndexSource.text),
  project_ref: packageConfig.production_project_ref,
  exact_component_source_order: true,
  component_artifacts: componentEvidence,
  edge_files: edgeFiles,
  readonly_attestation: {
    checked_at: attestation.checked_at,
    latest_remote_migration: attestation.migration_boundary.latest_remote_migration,
    latest_navigator_migration: attestation.migration_boundary.latest_navigator_migration,
    historical_release_baseline_matches_latest_remote: false,
    preview_branches: 0,
    technical_auth_users: 0,
    technical_profiles: 0,
    candidate_objects_present: 0,
    edge_version: 4,
    edge_bundle_sha256: attestation.edge_function.ezbr_sha256,
  },
  historical_release_baseline_drift_explicit: true,
  current_release_baseline_reconciled: true,
  current_release_baseline: releaseBaseline.latest_live_migration,
  shared_project_baseline_semantics: sharedRelease.navigator_baseline_semantics,
  sequential_preview_apply_proven: false,
  preview_branch_created: false,
  production_applied: false,
  cost_confirmation_performed: false,
  edge_deployed: false,
  deployment_bundle_ready: false,
  production_rollback_bundle_ready: false,
  active_stops: packageConfig.active_stops,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write('Navigator v2 preview candidate package v2 semantic validation passed: historical evidence preserved, current baseline reconciled\n');
