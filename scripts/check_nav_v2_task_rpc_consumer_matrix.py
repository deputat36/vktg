from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MATRIX = ROOT / 'config/nav-v2-task-rpc-consumer-matrix.json'
DEAL_CARD = ROOT / 'assets/js/nav-v2/deal-card-v2.js'
GUARD = ROOT / 'assets/js/nav-v2/task-action-guard-v2.js'
EDGE = ROOT / 'supabase/functions/nav-v2-deal-api/index.ts'
LITE = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql'
E2E = ROOT / 'tests/e2e/task-action-feedback.spec.js'
SOURCE_CHECK = ROOT / 'scripts/check_nav_v2_task_action_feedback.py'
FIXTURE = ROOT / 'tests/fixtures/nav-v2-task-action-feedback.html'
RPC_SURFACE = ROOT / 'config/nav-v2-rpc-surface.json'
DOC = ROOT / 'docs/NAV_V2_TASK_RPC_CONSUMER_MATRIX_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-rpc-consumer-matrix.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def runtime_occurrences(needle: str) -> set[str]:
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
    paths = (MATRIX, DEAL_CARD, GUARD, EDGE, LITE, E2E, SOURCE_CHECK, FIXTURE, RPC_SURFACE, DOC, WORKFLOW)
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
    lite = LITE.read_text(encoding='utf-8')
    e2e = E2E.read_text(encoding='utf-8')
    source_check = SOURCE_CHECK.read_text(encoding='utf-8')
    fixture = FIXTURE.read_text(encoding='utf-8')
    rpc_surface = RPC_SURFACE.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    if matrix.get('status') != 'repository_only_deployment_gate':
        errors.append('consumer matrix status drifted')
    if matrix.get('production_changed') is not False or matrix.get('deployment_ready') is not False:
        errors.append('consumer matrix must remain non-production and deployment-blocking')

    legacy = matrix.get('legacy_rpcs') or {}
    update = legacy.get('nav_v2_update_task_status') or {}
    add = legacy.get('nav_v2_add_task') or {}

    expected_update_runtime = {
        item['path'] for item in update.get('active_runtime_consumers') or []
    }
    actual_update_runtime = runtime_occurrences('nav_v2_update_task_status')
    if actual_update_runtime != expected_update_runtime:
        errors.append(
            f'update_task_status runtime consumer drift: actual={sorted(actual_update_runtime)}, '
            f'expected={sorted(expected_update_runtime)}'
        )

    expected_add_runtime = set(add.get('active_runtime_consumers') or [])
    actual_add_runtime = runtime_occurrences('nav_v2_add_task')
    if actual_add_runtime != expected_add_runtime:
        errors.append(
            f'add_task runtime consumer drift: actual={sorted(actual_add_runtime)}, '
            f'expected={sorted(expected_add_runtime)}'
        )

    require(deal_card, (
        "rpc('nav_v2_update_task_status'",
        'p_task_id: btn.dataset.taskId',
        'p_status: btn.dataset.taskStatus',
        'data-task-status="in_progress"',
        'data-task-status="done"',
        'data-task-status="open"',
    ), DEAL_CARD.name, errors)

    require(guard, (
        "rpc('nav_v2_get_deal_card_lite'",
        "rpc('nav_v2_update_task_status'",
        'p_task_id: taskId',
        'p_status: taskStatus',
        'event.stopImmediatePropagation()',
        'can_change_status',
    ), GUARD.name, errors)

    require(edge, (
        '| "update_task_status"',
        '"update_task_status",',
        'if (action === "update_task_status")',
        'return await callUserRpc(req, "nav_v2_update_task_status"',
    ), EDGE.name, errors)

    task_block = lite.split("'tasks', v_tasks", 1)[0].split('select coalesce(jsonb_agg(jsonb_build_object(', 2)[-1]
    for field in matrix.get('current_lite_task_fields') or []:
        if f"'{field}'" not in task_block:
            errors.append(f'current lite task field missing: {field}')
    for field in matrix.get('required_lite_task_fields') or []:
        if f"'{field}'" in task_block:
            errors.append(f'lite DTO advanced but consumer matrix was not refreshed: {field}')

    require(e2e, (
        "url.includes('/rpc/nav_v2_update_task_status')",
        "{ p_task_id: 'task-1', p_status: 'done' }",
        "{ p_task_id: 'task-1', p_status: 'open' }",
        'completion and reopen use the same existing RPC',
    ), E2E.name, errors)

    require(source_check, (
        "rpc('nav_v2_update_task_status'",
        "{ p_task_id: 'task-1', p_status: 'done' }",
        "{ p_task_id: 'task-1', p_status: 'open' }",
    ), SOURCE_CHECK.name, errors)

    require(fixture, (
        'data-task-status="in_progress"',
        'data-task-status="done"',
        'data-task-status="open"',
    ), FIXTURE.name, errors)

    require(rpc_surface, (
        '"nav_v2_add_task"',
        '"nav_v2_update_task_status"',
    ), RPC_SURFACE.name, errors)

    if update.get('deployment_blocker') is not True:
        errors.append('update_task_status must remain a deployment blocker')
    if add.get('deployment_blocker') is not False:
        errors.append('add_task has no active runtime consumer and is not the primary deployment blocker')

    blockers = {
        blocker
        for consumer in update.get('active_runtime_consumers') or []
        for blocker in consumer.get('blockers') or []
    }
    for required in (
        'evidence_input_missing',
        'reopen_semantics_undefined',
        'lite_dto_contract_fields_missing',
        'edge_deployment_order',
        'governed_action_validation_missing',
    ):
        if required not in blockers:
            errors.append(f'missing deployment blocker: {required}')

    guarantees = matrix.get('separation_guarantees') or {}
    if any(value is not False for value in guarantees.values()):
        errors.append('all consumer matrix separation guarantees must remain false')

    require(doc, (
        'repository-only deployment gate',
        'nav_v2_add_task',
        'nav_v2_update_task_status',
        'deal-card-v2.js',
        'task-action-guard-v2.js',
        'nav-v2-deal-api/index.ts',
        'evidence',
        'reopen',
        'lite DTO',
        'не готов к deployment',
        'Production gate',
        'Rollback',
    ), DOC.name, errors)

    require(workflow, (
        'python3 scripts/check_nav_v2_task_rpc_consumer_matrix.py',
        'python3 -m py_compile scripts/check_nav_v2_task_rpc_consumer_matrix.py',
        'nav-v2-task-rpc-consumer-matrix',
    ), WORKFLOW.name, errors)

    if errors:
        print('Navigator v2 task RPC consumer matrix errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print(
        'Navigator v2 task RPC consumer matrix passed: all runtime consumers are accounted for, '
        'legacy add has no active consumer, and deployment blockers remain explicit'
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
