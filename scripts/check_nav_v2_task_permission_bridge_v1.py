from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUARD = ROOT / 'assets/js/nav-v2/task-action-guard-v2.js'
SUPABASE = ROOT / 'assets/js/nav-v2/supabase-v2.js'
PAGE = ROOT / 'deal-card-v2.html'
BROWSER = ROOT / 'tests/e2e/task-permission-bridge.spec.js'
CONTRACT = ROOT / 'config/nav-v2-task-permission-bridge-v1.json'
DOC = ROOT / 'docs/NAV_V2_TASK_PERMISSION_BRIDGE_V1_2026-07-24.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-permission-bridge-v1.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    for path in (GUARD, SUPABASE, PAGE, BROWSER, CONTRACT, DOC, WORKFLOW):
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    guard = GUARD.read_text(encoding='utf-8')
    supabase = SUPABASE.read_text(encoding='utf-8')
    page = PAGE.read_text(encoding='utf-8')
    browser = BROWSER.read_text(encoding='utf-8')
    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    require(guard, (
        "rpc('nav_v2_get_deal_card_lite'",
        "rpc('nav_v2_get_deal_card'",
        'function hasAuthoritativePermission(task = {})',
        'function needsFullCardPermissions(taskPermissions)',
        'function mergeFullCardPermissions(litePermissions, fullCard = {})',
        'async function loadFullCardPermissions(basePermissions = new Map())',
        'if (needsFullCardPermissions(nextPermissions))',
        'nextPermissions = await loadFullCardPermissions(nextPermissions);',
        'catch (liteError)',
        'loaded = false;',
        'const BOUNDED_TRANSPORT_ENABLED = false;',
        'event.stopImmediatePropagation()',
        "app.addEventListener('click', handleTaskAction, true)",
    ), GUARD.name, errors)
    if guard.count("rpc('nav_v2_get_deal_card_lite'") != 1:
        errors.append('guard must keep exactly one lite permission read site')
    if guard.count("rpc('nav_v2_get_deal_card'") != 1:
        errors.append('guard must keep exactly one full-card permission fallback site')
    for forbidden in ('localStorage', 'sessionStorage', 'fetch(', 'sendBeacon', 'collector', 'telemetry'):
        if forbidden in guard:
            errors.append(f'{GUARD.name}: forbidden {forbidden!r}')
    if 'const BOUNDED_TRANSPORT_ENABLED = true;' in guard:
        errors.append('bounded transport was enabled')

    require(supabase, (
        "const DEDUPED_RPC_NAMES = new Set([",
        "'nav_v2_get_deal_card'",
        'if (current)',
        'использую уже выполняющийся запрос',
    ), SUPABASE.name, errors)

    require(page, ('task-action-guard-v2.js?v=20260724-02',), PAGE.name, errors)
    require(browser, (
        'lite DTO without can_change_status is repaired by the full-card server permission',
        'full-card denial remains fail-closed when lite DTO omits permission',
        'full card recovers permissions when the lite DTO request fails',
        'missing lite and full permission sources keep every action blocked',
        '/rpc/nav_v2_get_deal_card_lite',
        '/rpc/nav_v2_get_deal_card',
        '/rpc/nav_v2_update_task_status',
    ), BROWSER.name, errors)

    if contract.get('decision') != 'full_card_task_permission_fallback_enabled_lite_dto_database_change_blocked':
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
    runtime = contract.get('runtime') or {}
    if runtime.get('authoritative_permission_source') != 'nav_v2_get_deal_card':
        errors.append('contract: full card must remain the authoritative permission source')
    if runtime.get('shared_rpc_dedupe') is not True or runtime.get('permission_inference') is not False:
        errors.append('contract: shared dedupe and no-inference guarantees drifted')
    boundaries = contract.get('boundaries') or {}
    if any(value is not False for value in boundaries.values()):
        errors.append('contract: every production/change boundary must remain false')
    blocked = contract.get('blocked_follow_up') or {}
    if blocked.get('item') != 'add_authoritative_task_permissions_to_lite_dto':
        errors.append('contract: lite DTO follow-up is not recorded')
    if blocked.get('blocks_frontend_fix') is not False:
        errors.append('contract: database follow-up must not block safe frontend fallback')

    require(doc, (
        '# Navigator v2 — восстановление серверных разрешений задач',
        '`nav_v2_get_deal_card_lite`',
        '`nav_v2_get_deal_card`',
        '`can_change_status`',
        'DEDUPED_RPC_NAMES',
        'Fail-closed',
        'заблокирован',
        'Production Supabase не менялся',
    ), DOC.name, errors)
    require(workflow, (
        'check_nav_v2_task_permission_bridge_v1.py',
        'task-permission-bridge.spec.js',
        'node --check assets/js/nav-v2/task-action-guard-v2.js',
        'chromium-desktop',
        'chromium-mobile',
    ), WORKFLOW.name, errors)

    if errors:
        print('Navigator v2 task permission bridge errors:')
        for error in errors:
            print(f'- {error}')
        return 1
    print('Navigator v2 task permission bridge v1 passed: incomplete lite permissions recover from the deduped full card, explicit denial stays denied, and production remains unchanged')
    return 0


if __name__ == '__main__':
    sys.exit(main())
