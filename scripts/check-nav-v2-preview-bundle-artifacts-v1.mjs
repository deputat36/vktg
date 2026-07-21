#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirFlag = process.argv.indexOf('--bundle-dir');
const bundleValue = dirFlag >= 0 ? process.argv[dirFlag + 1] : '';
if (!bundleValue) throw new Error('--bundle-dir is required');
const bundleDir = path.resolve(bundleValue);
const config = JSON.parse(await readFile(path.join(root, 'config/nav-v2-preview-bundle-assembler-v1.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(bundleDir, config.index_file), 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/u, '') + '\n';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(index.schema_version === 1, 'unexpected bundle index version');
assert(index.assembler_status === 'repository_only_ci_assembler_not_deployable', 'bundle index escaped repository-only status');
assert(index.artifacts_are_rehearsal_only === true, 'bundle artifacts are not rehearsal-only');
for (const key of ['deployment_bundle_ready', 'production_rollback_bundle_ready', 'preview_branch_created', 'production_applied']) {
  assert(index[key] === false, `${key} must remain false`);
}
assert(Array.isArray(index.artifacts) && index.artifacts.length === 6, 'bundle index must contain six artifacts');
assert(index.artifacts.map((item) => `${item.segment_id}:${item.artifact_kind}`).join(',') === [
  'quality:forward', 'quality:rollback',
  'bounded:forward', 'bounded:rollback',
  'intake:forward', 'intake:rollback',
].join(','), 'artifact order changed');

const segmentById = new Map(config.segments.map((segment) => [segment.id, segment]));
for (const artifact of index.artifacts) {
  const segment = segmentById.get(artifact.segment_id);
  assert(segment, `unknown segment ${artifact.segment_id}`);
  assert(artifact.production_executable === false, `${artifact.file} is marked production executable`);
  const expectedFile = artifact.artifact_kind === 'forward' ? segment.forward_file : segment.rollback_file;
  assert(artifact.file === expectedFile, `${artifact.segment_id} ${artifact.artifact_kind} filename drifted`);
  const bytes = await readFile(path.join(bundleDir, artifact.file));
  assert(bytes.length === artifact.bytes, `${artifact.file} byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.file} SHA-256 mismatch`);
  const text = bytes.toString('utf8');
  assert(text.includes('NOT A PRODUCTION MIGRATION') || text.includes('NOT AN APPROVED PRODUCTION ROLLBACK'), `${artifact.file} lacks rehearsal warning`);
  assert(text.includes('\\set ON_ERROR_STOP on'), `${artifact.file} lacks ON_ERROR_STOP`);
  assert(!text.includes('__NAV_V2_INTAKE_CATALOG_'), `${artifact.file} has unresolved intake marker`);

  const sourceOrder = artifact.source_order || [];
  if (artifact.artifact_kind === 'rollback') {
    assert(sourceOrder.map((source) => source.path).join(',') === segment.rollback_sources.join(','), `${artifact.file} rollback source order changed`);
  } else {
    const generated = segment.generated_forward_sources || [];
    const expected = [...generated.map((source) => `generated:${source.id}`), ...segment.forward_sources];
    const actual = sourceOrder.map((source) => source.kind === 'generated' ? `generated:${source.id}` : source.path);
    assert(actual.join(',') === expected.join(','), `${artifact.file} forward source order changed`);
  }
}

const indexRequired = new Set(config.index_required_fields);
for (const field of ['schema_version', 'assembler_status', 'source_manifest_sha256', 'artifacts', 'combined_source_sha256', 'deployment_bundle_ready']) {
  assert(indexRequired.has(field), `config index field missing: ${field}`);
  assert(Object.prototype.hasOwnProperty.call(index, field), `bundle index field missing: ${field}`);
}
assert(/^[0-9a-f]{64}$/.test(index.source_manifest_sha256), 'source manifest hash is invalid');
assert(/^[0-9a-f]{64}$/.test(index.combined_source_sha256), 'combined source hash is invalid');

const qualityForward = index.artifacts.find((item) => item.segment_id === 'quality' && item.artifact_kind === 'forward');
assert((qualityForward.exact_function_redefinitions || []).some((item) => item.function_name === 'nav_v2_private.nav_v2_quality_sync_task_v1' && item.count === 2), 'quality authorship redefinition was not recorded');
const boundedForward = index.artifacts.find((item) => item.segment_id === 'bounded' && item.artifact_kind === 'forward');
assert((boundedForward.exact_function_redefinitions || []).some((item) => item.function_name === 'public.nav_v2_get_deal_card_lite' && item.count === 2), 'bounded DTO redefinition was not recorded');
const intakeForward = index.artifacts.find((item) => item.segment_id === 'intake' && item.artifact_kind === 'forward');
assert((intakeForward.exact_function_redefinitions || []).length === 0, 'intake bundle contains unexpected exact redefinitions');

const configText = normalize(await readFile(path.join(root, 'config/nav-v2-preview-bundle-assembler-v1.json'), 'utf8'));
assert(index.config_sha256 === sha256(configText), 'assembler config hash mismatch');
console.log('Navigator v2 assembled preview bundle artifact verification passed');
