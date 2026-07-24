from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP = ROOT / 'assets/js/nav-v2/task-permission-bootstrap-v1.js'
BASE = ROOT / 'assets/js/nav-v2/deal-card-v2.js'
GUARD = ROOT / 'assets/js/nav-v2/task-action-guard-v2.js'
PAGE = ROOT / 'deal-card-v2.html'
UNIT = ROOT / 'tests/unit/nav-v2-task-permission-bootstrap.test.mjs'
BROWSER = ROOT / 'tests/e2e/task-action-feedback.spec.js'
CONTRACT = ROOT / 'config/nav-v2-task-permission-bridge-v1.json'
DOC = ROOT / 'docs/NAV_V2_TASK_PERMISSION_BRIDGE_V1_2026-07-24.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-permission-bridge-v1.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    paths = (BOOTSTRAP, BASE, GUARD, PAGE, UNIT, BROWSER, CONTRACT, DOC, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    bootstrap = BOOTSTRAP.read_text(encoding='utf-8')
    base = BASE.read_text(encoding='utf-8')
    guard = GUARD.read_text(encoding='utf-8')
    page = PAGE.read_text(encoding='utf-8')
    unit = UNIT.read_text(encoding='utf-8')
    browser = BROWSER.read_text(encoding='utf-8')
    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    require(bootstrap, (
        "TASK_PERMISSION_BOOTSTRAP_KEY = '__NAV_V2_TASK_PERMISSION_BOOTSTRAP_V1__'",
        "TASK_PERMISSION_BOOTSTRAP_EVENT = 'nav-v2-task-permissions-ready'",
        'export function buildTaskPermissionBootstrap(data = {})',
        'export function readTaskPermissionBootstrap',
        'export function publishTaskPermissionBootstrap',
        "authority: 'full_deal_card_server_permission'",
        "storage: 'memory_only'",
        'contains_pii: false',
        'permission_inference: false',
        'fail_closed_without_snapshot: true',
    ), BOOTSTRAP.name, errors)
    for forbidden in ('rpc(', 'fetch(', 'localStorage', 'sessionStorage', 'assigned_to', 'title:', 'description:'):
        if forbidden in bootstrap:
            errors.append(f'{BOOTSTRAP.name}: forbidden {forbidden!r}')

    require(base, (
        "import { publishTaskPermissionBootstrap } from './task-permission-bootstrap-v1.js?v=20260724-01';",
        'publishTaskPermissionBootstrap(data);',
        "return task?.can_change_status === true || task?.can_change_status === 'true';",
    ), BASE.name, errors)
    if 'task.assigned_to && task.assigned_to === userId' in base:
        errors.append(f'{BASE.name}: local task permission inference remains')

    require(guard, (
        "from './task-permission-bootstrap-v1.js?v=20260724-01';",
        'function mergeBootstrapPermissions()',
        'readTaskPermissionBootstrap(globalThis, dealId)',
        'permissions = litePermissions;',
        'const bootstrapped = mergeBootstrapPermissions();',
        'TASK_PERMISSION_BOOTSTRAP_EVENT',
        "globalThis.addEventListener(TASK_PERMISSION_BOOTSTRAP_EVENT",
        'void loadPermissions(true);',
    ), GUARD.name, errors)
    if 'assigned_to ===' in guard or 'assigned_role ===' in guard:
        errors.append(f'{GUARD.name}: permission must not be inferred from assignment')
    if 'const BOUNDED_TRANSPORT_ENABLED = true;' in guard:
        errors.append(f'{GUARD.name}: bounded transport was enabled')

    require(page, (
        'deal-card-v2.js?v=20260724-01',
        'task-action-guard-v2.js?v=20260724-02',
    ), PAGE.name, errors)

    require(unit, (
        'buildTaskPermissionBootstrap',
        'publishTaskPermissionBootstrap',
        'readTaskPermissionBootstrap',
        "assert.equal('assigned_to' in snapshot.tasks[0], false)",
        "readTaskPermissionBootstrap(target, 'another-deal'), null",
    ), UNIT.name, errors)
    require(browser, (
        'lite DTO without can_change_status is repaired by the full-card bootstrap',
        'mismatched full-card bootstrap stays fail-closed',
        'TASK_PERMISSION_BOOTSTRAP_EVENT',
        'includeCanChange',
    ), BROWSER.name, errors)

    if contract.get('decision') != 'full_card_task_permission_bridge_enabled_lite_dto_database_change_blocked':
        errors.append('contract: unexpected decision')
    diagnosis = contract.get('diagnosis') or {}
    for key, value in {
        'all_tasks': 98,
        'open_tasks': 88,
        'in_progress_tasks': 0,
        'done_tasks': 0,
        'task_status_changed_events': 0,
        'lite_task_has_can_change_status': False,
        'full_card_task_has_can_change_status': True,
    }.items():
        if diagnosis.get(key) != value:
            errors.append(f'contract diagnosis: {key} must equal {value!r}')
    boundaries = contract.get('boundaries') or {}
    if any(value is not False for value in boundaries.values()):
        errors.append('contract: every production/change boundary must remain false')
    blocked = contract.get('blocked_follow_up') or {}
    if blocked.get('item') != 'add_authoritative_task_permissions_to_lite_dto':
        errors.append('contract: lite DTO follow-up is not recorded')
    if blocked.get('blocks_frontend_fix') is not False:
        errors.append('contract: database follow-up must not block safe frontend bridge')

    require(doc, (
        '# Navigator v2 — мост серверных разрешений задач',
        '`nav_v2_get_deal_card_lite`',
        '`can_change_status`',
        'memory-only snapshot',
        'Fail-closed',
        'заблокирован',
        'Production Supabase не менялся',
    ), DOC.name, errors)
    require(workflow, (
        'check_nav_v2_task_permission_bridge_v1.py',
        'nav-v2-task-permission-bootstrap.test.mjs',
        'node --check assets/js/nav-v2/task-permission-bootstrap-v1.js',
    ), WORKFLOW.name, errors)

    if errors:
        print('Navigator v2 task permission bridge errors:')
        for error in errors:
            print(f'- {error}')
        return 1
    print('Navigator v2 task permission bridge v1 passed: full-card server permissions survive the incomplete lite DTO, remain memory-only and fail closed, with no production change')
    return 0


if __name__ == '__main__':
    sys.exit(main())
