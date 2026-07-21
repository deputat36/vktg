#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundleFlag = process.argv.indexOf('--bundle-dir');
const reportFlag = process.argv.indexOf('--report');
const bundleValue = bundleFlag >= 0 ? process.argv[bundleFlag + 1] : '';
const reportValue = reportFlag >= 0 ? process.argv[reportFlag + 1] : '';

if (!bundleValue) throw new Error('--bundle-dir is required');
if (!reportValue) throw new Error('--report is required');

const bundleDir = path.resolve(bundleValue);
const reportPath = path.resolve(reportValue);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/u, '') + '\n';
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const readRoot = async (relative) => normalize(await readFile(path.join(root, relative), 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const packageConfig = await readJson('config/nav-v2-preview-candidate-package-v1.json');
const assemblerConfig = await readJson('config/nav-v2-preview-bundle-assembler-v1.json');
const bundleIndexText = normalize(await readFile(path.join(bundleDir, 'bundle-index.json'), 'utf8'));
const bundleIndex = JSON.parse(bundleIndexText);

assert(packageConfig.status === 'repository_only_review_candidate_not_executable', 'package status drifted');
assert(packageConfig.execution_model === 'independent_segment_review_not_sequential_deployment', 'execution model drifted');
assert(packageConfig.preview_apply_allowed === false, 'preview apply was enabled');
assert(packageConfig.deployment_bundle_ready === false, 'package claims deployment_bundle_ready');
assert(packageConfig.production_rollback_bundle_ready === false, 'package claims rollback readiness');
assert(bundleIndex.assembler_status === 'repository_only_ci_assembler_not_deployable', 'bundle index status drifted');
assert(bundleIndex.deployment_bundle_ready === false, 'bundle index claims deployment_bundle_ready');
assert(bundleIndex.production_rollback_bundle_ready === false, 'bundle index claims rollback readiness');
assert(bundleIndex.preview_branch_created === false && bundleIndex.production_applied === false, 'bundle index claims cloud mutation');
assert(Array.isArray(bundleIndex.artifacts) && bundleIndex.artifacts.length === 8, 'bundle-index.json must contain eight rehearsal artifacts');

const assemblerSegments = new Map(assemblerConfig.segments.map((segment) => [segment.id, segment]));
const packageSegments = new Map(packageConfig.segments.map((segment) => [segment.id, segment]));
assert([...packageSegments.keys()].join(',') === 'quality,bounded_core,bounded_dto,intake', 'package segment order drifted');

const artifactReport = [];
for (const segmentId of packageSegments.keys()) {
  const packageSegment = packageSegments.get(segmentId);
  const assemblerSegment = assemblerSegments.get(segmentId);
  assert(assemblerSegment, `assembler segment missing: ${segmentId}`);

  const expected = [
    ['forward', packageSegment.forward_artifact],
    ['rollback', packageSegment.rollback_artifact],
  ];
  for (const [kind, file] of expected) {
    const artifact = bundleIndex.artifacts.find((item) =>
      item.segment_id === segmentId && item.artifact_kind === kind
    );
    assert(artifact, `bundle artifact missing: ${segmentId}/${kind}`);
    assert(artifact.file === file, `bundle artifact filename drifted: ${segmentId}/${kind}`);
    assert(artifact.production_executable === false, `artifact escaped rehearsal-only status: ${file}`);

    const content = normalize(await readFile(path.join(bundleDir, file), 'utf8'));
    assert(Buffer.byteLength(content) === artifact.bytes, `artifact byte size drifted: ${file}`);
    assert(sha256(content) === artifact.sha256, `artifact sha256 drifted: ${file}`);
    assert(!content.includes('__NAV_V2_INTAKE_CATALOG_'), `unresolved intake marker: ${file}`);

    const expectedSourceOrder = kind === 'forward'
      ? [
          ...(assemblerSegment.generated_forward_sources || []).map((item) => ({
            kind: 'generated',
            id: item.id,
            renderer: item.renderer,
            template: item.template,
            catalog: item.catalog,
          })),
          ...(assemblerSegment.forward_sources || []).map((sourcePath) => ({
            kind: 'file',
            path: sourcePath,
          })),
        ]
      : (assemblerSegment.rollback_sources || []).map((sourcePath) => ({
          kind: 'file',
          path: sourcePath,
        }));

    assert(artifact.source_order.length === expectedSourceOrder.length, `exact source order length drifted: ${file}`);
    for (let index = 0; index < expectedSourceOrder.length; index += 1) {
      const actual = artifact.source_order[index];
      const expectedSource = expectedSourceOrder[index];
      assert(actual.kind === expectedSource.kind, `exact source order kind drifted: ${file}#${index}`);
      if (expectedSource.kind === 'file') {
        assert(actual.path === expectedSource.path, `exact source order path drifted: ${file}#${index}`);
        const sourceText = await readRoot(actual.path);
        assert(actual.sha256 === sha256(sourceText), `source sha256 drifted: ${actual.path}`);
      } else {
        for (const key of ['id', 'renderer', 'template', 'catalog']) {
          assert(actual[key] === expectedSource[key], `generated source ${key} drifted: ${file}#${index}`);
        }
        assert(typeof actual.sha256 === 'string' && actual.sha256.length === 64, `generated source hash missing: ${file}#${index}`);
        assert(typeof actual.catalog_sha256 === 'string' && actual.catalog_sha256.length === 64, `catalog hash missing: ${file}#${index}`);
      }
    }

    artifactReport.push({
      segment_id: segmentId,
      artifact_kind: kind,
      file,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      source_count: artifact.source_order.length,
      production_executable: false,
    });
  }
}

const boundedCore = assemblerSegments.get('bounded_core').forward_sources;
const boundedDto = assemblerSegments.get('bounded_dto').forward_sources;
const boundedOverlap = boundedCore.filter((item) => boundedDto.includes(item));
assert(
  JSON.stringify(boundedOverlap) === JSON.stringify(packageConfig.bounded_consolidation.shared_forward_sources),
  'bounded overlap inventory drifted'
);
assert(boundedOverlap.length === 2, 'bounded overlap must remain explicit and non-empty');
assert(packageConfig.bounded_consolidation.required === true, 'bounded overlap no longer requires consolidation');
assert(packageConfig.bounded_consolidation.consolidated_forward_artifact_created === false, 'consolidated bounded forward unexpectedly exists');
assert(packageConfig.bounded_consolidation.consolidated_rollback_artifact_created === false, 'consolidated bounded rollback unexpectedly exists');
assert(packageConfig.bounded_consolidation.preview_apply_blocked === true, 'bounded overlap no longer blocks preview apply');

const edgePaths = [
  packageConfig.edge_candidate.entrypoint,
  ...packageConfig.edge_candidate.support_files,
  packageConfig.edge_candidate.production_snapshot,
];
const edgeFiles = [];
for (const relative of edgePaths) {
  const content = await readRoot(relative);
  edgeFiles.push({
    path: relative,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  });
}
const candidateEntry = await readRoot(packageConfig.edge_candidate.entrypoint);
const productionSnapshot = await readRoot(packageConfig.edge_candidate.production_snapshot);
assert(candidateEntry.includes('const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;'), 'candidate Edge flag is not false');
assert(candidateEntry.includes('routeBoundedTaskEdgeActionV2'), 'candidate Edge route is not source-integrated');
assert(!productionSnapshot.includes('routeBoundedTaskEdgeActionV2'), 'production Edge snapshot contains candidate route');
assert(packageConfig.edge_candidate.deployed === false && packageConfig.edge_candidate.deploy_allowed === false, 'Edge deploy was enabled');

const activeStops = new Set(packageConfig.active_stops);
for (const stop of [
  'bounded_full_forward_not_consolidated',
  'bounded_full_rollback_not_consolidated',
  'preview_branch_missing',
  'explicit_cost_approval_missing',
  'authenticated_role_matrix_not_run',
  'edge_not_deployed',
  'preview_apply_not_approved',
]) {
  assert(activeStops.has(stop), `active stop missing: ${stop}`);
}

const report = {
  schema_version: 1,
  status: 'repository_only_preview_candidate_validation_report',
  package_source_main_sha: packageConfig.source_main_sha,
  bundle_index_sha256: sha256(bundleIndexText),
  exact_source_order: true,
  artifacts: artifactReport,
  bounded_overlap: {
    shared_forward_sources: boundedOverlap,
    sequential_apply_allowed: false,
    consolidated_forward_created: false,
    consolidated_rollback_created: false,
  },
  edge_file_set: edgeFiles,
  preview_branch_created: false,
  production_applied: false,
  edge_deployed: false,
  deployment_bundle_ready: false,
  production_rollback_bundle_ready: false,
  active_stops: packageConfig.active_stops,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write('Navigator v2 preview candidate package v1 semantic validation passed; candidate-package-report.json created\n');
