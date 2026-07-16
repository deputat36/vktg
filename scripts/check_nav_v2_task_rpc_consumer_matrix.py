from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MATRIX = ROOT / 'config/nav-v2-task-rpc-consumer-matrix.json'
DEAL_CARD = ROOT / 'assets/js/nav-v2/deal-card-v2.js'
GUARD = ROOT / 'assets/js/nav-v2/task-action-guard-v2.js'
EDGE = ROOT / 'supabase/functions/nav-v2-deal-api/index.ts'
LITE_BOUNDED = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql'
UI_PREVIEW = ROOT / 'assets/js/nav-v2/bounded-task-ui-preview-v2.js'
ROUTER = ROOT / 'assets/js/nav-v2/task-action-router-v2.js'
EDGE_CONTRACT = ROOT / 'supabase/functions/nav-v2-deal-api/task-action-contract-v2.js'
DUAL_E2E = ROOT / 'tests/e2e/task-action-dual-path.spec.js'
LEGACY_E2E = ROOT / 'tests/e2e/task-action-feedback.spec.js'
RPC_SURFACE = ROOT / 'config/nav-v2-rpc-surface.json'
DOC = ROOT / 'docs/NAV_V2_TASK_RPC_CONSUMER_MATRIX_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-rpc-consumer-matrix.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def occurrence_paths(needle: str) -> set[str]:
    paths: set[str] = set()
    for root, suffixes in (
        (ROOT / 'assets/js/nav-v2', {'.js'}),
        (ROOT / 'supabase/functions', {'.ts', '.js'}),
    ):
        for path in root.rglob('*'):
            if path.is_file() and path.suffix in suffixes and needle in path.read_text(encoding='utf-8'):
                paths.add(path.relative_to(ROOT).as_posix())
    return paths


def main() -> int:
    errors: list[str] = []
    paths = (MATRIX, DEAL_CARD, GUARD, EDGE, LITE_BOUNDED, UI_PREVIEW, ROUTER, EDGE_CONTRACT, DUAL_E2E, LEGACY_E2E, RPC_SURFACE, DOC, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    matrix = json.loads(MATRIX.read_text(encoding='utf-8'))
    deal_card = DEAL_CARD.read_text(encoding='utf-8')
    guard = GUARD.read_text(encoding='utf-8')
    edge = EDGE.read_text(encoding='utf-8')
    lite = LITE_BOUNDED.read_text(encoding='utf-8')
    ui_preview = UI_PREVIEW.read_text(encoding='utf-8')
    router = ROUTER.read_text(encoding='utf-8')
    edge_contract = EDGE_CONTRACT.read_text(encoding='utf-8')
    dual_e2e = DUAL_E2E.read_text(encoding='utf-8')
    legacy_e2e = LEGACY_E2E.read_text(encoding='utf-8')
    rpc_surface = RPC_SURFACE.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    if matrix.get('schema_version') != 2:
        errors.append('consumer matrix must use schema version 2')
    if matrix.get('status') != 'repository_only_deployment_gate':
        errors.append('consumer matrix status drifted')
    if matrix.get('production_changed') is not False or matrix.get('deployment_ready') is not False:
        errors.append('consumer matrix must remain non-production and deployment-blocking')

    legacy = matrix.get('legacy_rpcs') or {}
    update = legacy.get('nav_v2_update_task_status') or {}
    add = legacy.get('nav_v2_add_task') or {}
    expected_active = {item['path'] for item in update.get('active_runtime_consumers') or []}
    required_active = {
        DEAL_CARD.relative_to(ROOT).as_posix(),
        GUARD.relative_to(ROOT).as_posix(),
        EDGE.relative_to(ROOT).as_posix(),
    }
    if expected_active != required_active:
        errors.append(f'active runtime consumer inventory drifted: {sorted(expected_active)}')

    detached_preview_paths = {
        UI_PREVIEW.relative_to(ROOT).as_posix(),
        ROUTER.relative_to(ROOT).as_posix(),
        EDGE_CONTRACT.relative_to(ROOT).as_posix(),
    }
    actual_update = occurrence_paths('nav_v2_update_task_status')
    expected_occurrences = required_active | detached_preview_paths
    if actual_update != expected_occurrences:
        errors.append(
            f'update_task_status occurrence drift: actual={sorted(actual_update)}, expected={sorted(expected_occurrences)}'
        )

    if occurrence_paths('nav_v2_add_task'):
        errors.append('nav_v2_add_task unexpectedly has a runtime or detached-code consumer')
    if add.get('active_runtime_consumers') != [] or add.get('deployment_blocker') is not False:
        errors.append('legacy add-task inventory drifted')
    if update.get('deployment_blocker') is not True:
        errors.append('legacy update-task-status remains a deployment blocker')

    require(deal_card, (
        "rpc('nav_v2_update_task_status'",
        'data-task-status="in_progress"',
        'data-task-status="done"',
        'data-task-status="open"',
    ), DEAL_CARD.name, errors)
    require(guard, (
        "rpc('nav_v2_get_deal_card_lite'",
        "rpc('nav_v2_update_task_status'",
        'event.stopImmediatePropagation()',
        'can_change_status',
    ), GUARD.name, errors)
    require(edge, (
        '| "update_task_status"',
        'if (action === "update_task_status")',
        'return await callUserRpc(req, "nav_v2_update_task_status"',
    ), EDGE.name, errors)

    for field in (matrix.get('lite_dto') or {}).get('required_fields_present') or []:
        if f"'{field}'" not in lite:
            errors.append(f'bounded lite DTO field missing: {field}')

    require(ui_preview, (
        'nav_v2_update_task_status',
        'transport_enabled:false',
        'legacy_status_path:true',
    ), UI_PREVIEW.name, errors)
    require(router, (
        'taskActionRoutePreview',
        'taskActionControlModel',
        'duplicate_handler_allowed: false',
        'runtime_integrated: false',
        'transport_enabled: false',
        'Завершённая bounded-задача неизменяема',
    ), ROUTER.name, errors)
    require(edge_contract, (
        'validateTaskEdgeAction',
        'legacy_update_task_status',
        'bounded_task_complete',
        'Legacy action запрещён для contract-v2 задачи',
        'runtime_integrated: false',
        'transport_enabled: false',
    ), EDGE_CONTRACT.name, errors)

    for runtime_text, label in ((deal_card, DEAL_CARD.name), (guard, GUARD.name), (edge, EDGE.name)):
        if 'task-action-router-v2.js' in runtime_text or 'task-action-contract-v2.js' in runtime_text:
            errors.append(f'detached dual-path artifact was integrated prematurely: {label}')

    require(dual_e2e, (
        'legacy and bounded actions select exactly one transport-free route',
        'nav_v2_complete_bounded_task',
        'networkCalls',
        'toEqual([])',
    ), DUAL_E2E.name, errors)
    require(legacy_e2e, (
        "url.includes('/rpc/nav_v2_update_task_status')",
        'completion and reopen use the same existing RPC',
    ), LEGACY_E2E.name, errors)

    closed = set(matrix.get('closed_blockers') or [])
    for blocker in (
        'lite_dto_contract_fields_missing',
        'evidence_input_missing',
        'reopen_semantics_undefined',
        'governed_action_validation_missing',
        'dual_path_browser_contract_missing',
    ):
        if blocker not in closed:
            errors.append(f'closed blocker missing: {blocker}')

    remaining = set(matrix.get('remaining_blockers') or [])
    for blocker in (
        'authoritative_handler_not_integrated',
        'duplicate_runtime_handlers',
        'edge_actions_not_integrated',
        'database_migrations_not_deployed',
        'minimal_grants_not_deployed',
        'authenticated_application_e2e_missing',
        'frontend_transport_disabled',
        'controlled_pilot_not_approved',
    ):
        if blocker not in remaining:
            errors.append(f'remaining deployment blocker missing: {blocker}')

    require(rpc_surface, ('"nav_v2_add_task"', '"nav_v2_update_task_status"'), RPC_SURFACE.name, errors)
    guarantees = matrix.get('separation_guarantees') or {}
    if any(value is not False for value in guarantees.values()):
        errors.append('all consumer matrix separation guarantees must remain false')

    require(doc, (
        'repository-only deployment gate v2',
        'PR #371',
        'PR #372',
        'PR #373',
        'PR #374',
        'PR #375',
        'Закрытые blockers',
        'Оставшиеся blockers',
        'authoritative handler',
        'Production gate',
        'Rollback',
    ), DOC.name, errors)
    require(workflow, (
        'python3 scripts/check_nav_v2_task_rpc_consumer_matrix.py',
        'python3 -m py_compile scripts/check_nav_v2_task_rpc_consumer_matrix.py',
        'nav-v2-task-rpc-consumer-matrix',
        'bounded-task-ui-preview-v2.js',
        'task-action-router-v2.js',
        'task-action-contract-v2.js',
        'nav_v2_get_deal_card_lite_bounded_tasks.sql',
        'task-action-dual-path.spec.js',
    ), WORKFLOW.name, errors)

    if errors:
        print('Navigator v2 task RPC consumer matrix errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 task RPC consumer matrix v2 passed: DTO/evidence/reopen/validation blockers are closed, active runtime consumers remain explicit, detached previews are accounted for, and deployment stays blocked on integration/E2E/deploy/pilot')
    return 0


if __name__ == '__main__':
    sys.exit(main())
