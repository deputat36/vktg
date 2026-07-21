from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MATRIX = ROOT / 'config/nav-v2-task-rpc-consumer-matrix.json'
DEAL_CARD = ROOT / 'assets/js/nav-v2/deal-card-v2.js'
GUARD = ROOT / 'assets/js/nav-v2/task-action-guard-v2.js'
EDGE_CANDIDATE = ROOT / 'supabase/functions/nav-v2-deal-api/index.ts'
EDGE_SNAPSHOT = ROOT / 'supabase/functions/nav-v2-deal-api/index.production-v4.ts'
EDGE_RUNTIME = ROOT / 'supabase/functions/nav-v2-deal-api/task-action-edge-runtime-v2.js'
LITE = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql'
UI_PREVIEW = ROOT / 'assets/js/nav-v2/bounded-task-ui-preview-v2.js'
ROUTER = ROOT / 'assets/js/nav-v2/task-action-router-v2.js'
PIPELINE = ROOT / 'assets/js/nav-v2/task-action-edge-pipeline-v2.js'
EDGE_CONTRACT = ROOT / 'supabase/functions/nav-v2-deal-api/task-action-contract-v2.js'
DUAL_E2E = ROOT / 'tests/e2e/task-action-dual-path.spec.js'
PIPELINE_E2E = ROOT / 'tests/e2e/task-action-pipeline-rehearsal.spec.js'
RUNTIME_E2E = ROOT / 'tests/e2e/task-action-feedback.spec.js'
RPC_SURFACE = ROOT / 'config/nav-v2-rpc-surface.json'
DOC = ROOT / 'docs/NAV_V2_TASK_RPC_CONSUMER_MATRIX_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-rpc-consumer-matrix.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def occurrence_paths(needle: str) -> set[str]:
    found: set[str] = set()
    for root, suffixes in ((ROOT / 'assets/js/nav-v2', {'.js'}), (ROOT / 'supabase/functions', {'.ts', '.js'})):
        for path in root.rglob('*'):
            if path.is_file() and path.suffix in suffixes and needle in path.read_text(encoding='utf-8'):
                found.add(path.relative_to(ROOT).as_posix())
    return found


def main() -> int:
    errors: list[str] = []
    paths = (
        MATRIX, DEAL_CARD, GUARD, EDGE_CANDIDATE, EDGE_SNAPSHOT, EDGE_RUNTIME,
        LITE, UI_PREVIEW, ROUTER, PIPELINE, EDGE_CONTRACT, DUAL_E2E,
        PIPELINE_E2E, RUNTIME_E2E, RPC_SURFACE, DOC, WORKFLOW,
    )
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    matrix = json.loads(MATRIX.read_text(encoding='utf-8'))
    read = lambda path: path.read_text(encoding='utf-8')
    deal_card, guard = read(DEAL_CARD), read(GUARD)
    edge_candidate, edge_snapshot, edge_runtime = read(EDGE_CANDIDATE), read(EDGE_SNAPSHOT), read(EDGE_RUNTIME)
    lite, ui_preview, router = read(LITE), read(UI_PREVIEW), read(ROUTER)
    pipeline, edge_contract = read(PIPELINE), read(EDGE_CONTRACT)
    dual_e2e, pipeline_e2e, runtime_e2e = read(DUAL_E2E), read(PIPELINE_E2E), read(RUNTIME_E2E)
    rpc_surface, doc, workflow = read(RPC_SURFACE), read(DOC), read(WORKFLOW)

    if matrix.get('schema_version') != 5:
        errors.append('consumer matrix must use schema version 5')
    if matrix.get('status') != 'frontend_authoritative_edge_candidate_integrated_transport_disabled':
        errors.append('consumer matrix status drifted')
    if matrix.get('frontend_runtime_changed') is not True:
        errors.append('frontend runtime integration must remain explicit')
    if matrix.get('edge_runtime_source_integrated') is not True:
        errors.append('candidate Edge source integration must remain explicit')
    if matrix.get('edge_runtime_enabled') is not False or matrix.get('edge_deployed') is not False:
        errors.append('candidate Edge runtime must remain disabled and undeployed')
    if matrix.get('production_database_changed') is not False or matrix.get('deployment_ready') is not False:
        errors.append('database must remain unchanged and deployment must remain blocked')

    edge_sources = matrix.get('edge_sources') or {}
    production_source = edge_sources.get('production_snapshot') or {}
    candidate_source = edge_sources.get('candidate_entrypoint') or {}
    if production_source.get('path') != EDGE_SNAPSHOT.relative_to(ROOT).as_posix():
        errors.append('production Edge snapshot path drifted')
    if production_source.get('version') != 4 or production_source.get('immutable_release_baseline') is not True:
        errors.append('production Edge snapshot contract drifted')
    if production_source.get('bounded_actions_present') is not False:
        errors.append('production Edge snapshot must remain legacy-only')
    if candidate_source.get('path') != EDGE_CANDIDATE.relative_to(ROOT).as_posix():
        errors.append('candidate Edge entrypoint path drifted')
    if candidate_source.get('repository_only') is not True or candidate_source.get('feature_flag_default') is not False:
        errors.append('candidate Edge entrypoint escaped repository-only disabled state')
    if candidate_source.get('deployed') is not False or candidate_source.get('bounded_actions_source_integrated') is not True:
        errors.append('candidate Edge source/deployment markers drifted')

    legacy = matrix.get('legacy_rpcs') or {}
    update = legacy.get('nav_v2_update_task_status') or {}
    add = legacy.get('nav_v2_add_task') or {}
    active = {item['path'] for item in update.get('active_runtime_consumers') or []}
    expected_active = {GUARD.relative_to(ROOT).as_posix(), EDGE_SNAPSHOT.relative_to(ROOT).as_posix()}
    if active != expected_active:
        errors.append(f'active runtime consumer inventory drifted: {sorted(active)}')
    candidate_consumers = {item['path'] for item in update.get('candidate_runtime_consumers') or []}
    if candidate_consumers != {EDGE_CANDIDATE.relative_to(ROOT).as_posix()}:
        errors.append(f'candidate runtime consumer inventory drifted: {sorted(candidate_consumers)}')
    if update.get('dormant_source_handlers') != []:
        errors.append('dormant source handler inventory must remain empty')
    cleanup = update.get('source_cleanup') or {}
    if cleanup.get('path') != DEAL_CARD.relative_to(ROOT).as_posix() or cleanup.get('removed') is not True:
        errors.append('deal-card source cleanup evidence drifted')

    expected_literals = {
        EDGE_CANDIDATE.relative_to(ROOT).as_posix(),
        EDGE_SNAPSHOT.relative_to(ROOT).as_posix(),
        UI_PREVIEW.relative_to(ROOT).as_posix(),
        ROUTER.relative_to(ROOT).as_posix(),
        PIPELINE.relative_to(ROOT).as_posix(),
        EDGE_CONTRACT.relative_to(ROOT).as_posix(),
    }
    actual_literals = occurrence_paths('nav_v2_update_task_status')
    if actual_literals != expected_literals:
        errors.append(f'update_task_status occurrence drift: actual={sorted(actual_literals)}, expected={sorted(expected_literals)}')
    if occurrence_paths('nav_v2_add_task'):
        errors.append('nav_v2_add_task unexpectedly has a runtime or detached-code consumer')
    if add.get('active_runtime_consumers') != [] or add.get('deployment_blocker') is not False:
        errors.append('legacy add-task inventory drifted')
    if update.get('deployment_blocker') is not True:
        errors.append('legacy status RPC must remain a deployment blocker')

    inventory = set(update.get('test_and_contract_consumers') or [])
    for path in (ROUTER, PIPELINE, UI_PREVIEW, EDGE_CONTRACT, EDGE_RUNTIME, DUAL_E2E, PIPELINE_E2E, RUNTIME_E2E):
        if path.relative_to(ROOT).as_posix() not in inventory:
            errors.append(f'detached/test consumer missing from matrix: {path.relative_to(ROOT)}')

    require(deal_card, ('function taskActions(task)', 'data-task-status="done"', '${taskActions(task)}'), DEAL_CARD.name, errors)
    for forbidden in ("rpc('nav_v2_update_task_status'", "document.querySelectorAll('[data-task-id]').forEach((btn) => btn.onclick"):
        if forbidden in deal_card:
            errors.append(f'{DEAL_CARD.name}: dormant task mutation source remains')

    require(guard, (
        'taskActionRoutePreview', "rpc('nav_v2_get_deal_card_lite'",
        'await rpc(route.rpc_preview.name, route.rpc_preview.args)',
        'const BOUNDED_TRANSPORT_ENABLED = false;', 'event.stopImmediatePropagation()',
    ), GUARD.name, errors)

    require(edge_snapshot, ('if (action === "update_task_status")', 'nav_v2_update_task_status'), EDGE_SNAPSHOT.name, errors)
    for forbidden in ('bounded_task_start', 'routeBoundedTaskEdgeActionV2', 'SUPABASE_SERVICE_ROLE_KEY'):
        if forbidden in edge_snapshot:
            errors.append(f'production Edge snapshot must remain exact legacy v4 source: {forbidden}')

    require(edge_candidate, (
        'import { routeBoundedTaskEdgeActionV2 } from "./task-action-edge-runtime-v2.js";',
        'const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;',
        'if (action === "update_task_status")', 'nav_v2_update_task_status',
        'profile_loader: loadActiveNavProfile', 'task_loader: loadBoundedTaskContext',
        'rpc_client: { rpc: callServiceRpc }',
    ), EDGE_CANDIDATE.name, errors)
    if 'BOUNDED_TASK_EDGE_IDENTITY_ENABLED = true' in edge_candidate:
        errors.append('candidate Edge feature flag was enabled')
    if 'task-action-router-v2.js' in edge_candidate or 'task-action-edge-pipeline-v2.js' in edge_candidate:
        errors.append('frontend router or rehearsal pipeline leaked into candidate Edge entrypoint')

    require(edge_runtime, (
        "from './task-action-edge-identity-v2.js'", 'routeBoundedTaskEdgeActionV2',
        'feature_flag_default: false', 'edge_deployed: false',
        'frontend_transport_enabled: false',
    ), EDGE_RUNTIME.name, errors)
    for forbidden in ('Deno.', 'fetch(', 'SUPABASE_SERVICE_ROLE_KEY'):
        if forbidden in edge_runtime:
            errors.append(f'Edge runtime adapter must remain dependency-injected: {forbidden}')

    for field in (matrix.get('lite_dto') or {}).get('required_fields_present_in_prototype') or []:
        if f"'{field}'" not in lite:
            errors.append(f'bounded lite DTO field missing: {field}')

    require(ui_preview, ('nav_v2_update_task_status', 'transport_enabled:false'), UI_PREVIEW.name, errors)
    require(router, ('taskActionRoutePreview', 'duplicate_handler_allowed: false', 'transport_enabled: false'), ROUTER.name, errors)
    require(pipeline, (
        'taskActionEdgePipelinePreview', 'one_action_one_validated_rpc_preview: true',
        'network_called: false', 'runtime_integrated: false', 'edge_deployed: false', 'transport_enabled: false',
    ), PIPELINE.name, errors)
    require(edge_contract, (
        'validateTaskEdgeAction', 'Legacy action запрещён для contract-v2 задачи',
        'Governed action разрешён только для contract-v2 задачи',
        'runtime_integrated: false', 'transport_enabled: false',
    ), EDGE_CONTRACT.name, errors)

    for text, label in ((deal_card, DEAL_CARD.name), (guard, GUARD.name), (edge_snapshot, EDGE_SNAPSHOT.name)):
        if 'task-action-edge-pipeline-v2.js' in text:
            errors.append(f'rehearsal pipeline was integrated into active production path: {label}')
    if 'task-action-contract-v2.js' in guard or 'SUPABASE_SERVICE_ROLE_KEY' in guard or 'SUPABASE_SERVICE_ROLE_KEY' in deal_card:
        errors.append('Edge contract or service-role transport leaked into frontend runtime')

    require(dual_e2e, ('legacy and bounded actions select exactly one transport-free route', 'toEqual([])'), DUAL_E2E.name, errors)
    require(pipeline_e2e, ('one browser action produces one exact validated RPC preview without network', 'expect(networkCalls).toEqual([])'), PIPELINE_E2E.name, errors)
    require(runtime_e2e, ('authoritative handler performs one legacy mutation', 'base onclick stays dormant'), RUNTIME_E2E.name, errors)

    closed = set(matrix.get('closed_blockers') or [])
    for blocker in (
        'authoritative_handler_not_integrated', 'duplicate_handler_execution_risk',
        'dormant_base_handler_source_not_removed', 'frontend_edge_rpc_parity_missing',
        'edge_actions_not_integrated',
    ):
        if blocker not in closed:
            errors.append(f'closed blocker missing: {blocker}')
    remaining = set(matrix.get('remaining_blockers') or [])
    for blocker in (
        'edge_runtime_feature_flag_disabled', 'edge_function_not_deployed',
        'database_migrations_not_deployed', 'minimal_grants_not_deployed',
        'authenticated_application_e2e_missing', 'frontend_bounded_transport_disabled',
        'controlled_pilot_not_approved',
    ):
        if blocker not in remaining:
            errors.append(f'remaining blocker missing: {blocker}')
    if 'edge_actions_not_integrated' in remaining:
        errors.append('obsolete Edge source integration blocker remains open')

    require(rpc_surface, ('"nav_v2_add_task"', '"nav_v2_update_task_status"'), RPC_SURFACE.name, errors)
    if any(value is not False for value in (matrix.get('separation_guarantees') or {}).values()):
        errors.append('all separation guarantees must remain false')
    require(doc, (
        'frontend authoritative + Edge candidate integrated, transport disabled',
        'Production Edge snapshot', 'Candidate Edge entrypoint', 'Task action pipeline',
        'Production gate', 'Rollback',
    ), DOC.name, errors)
    require(workflow, (
        'task-action-edge-pipeline-v2.js', 'task-action-pipeline-rehearsal.spec.js',
        'nav-v2-task-rpc-consumer-matrix',
    ), WORKFLOW.name, errors)

    if errors:
        print('Navigator v2 task RPC consumer matrix errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 task RPC consumer matrix v5 passed: the frontend handler remains authoritative, deployed Edge v4 is pinned as an immutable legacy snapshot, the candidate Edge route is source-integrated behind a disabled flag, and database/deployment/transport remain blocked')
    return 0


if __name__ == '__main__':
    sys.exit(main())
