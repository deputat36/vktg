from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'config/nav-v2-task-role-matrix-rehearsal.json'
TARGET_PLAN = ROOT / 'config/nav-v2-e2e-target-plan.json'
GUARD = ROOT / 'assets/js/nav-v2/task-action-guard-v2.js'
ROUTER = ROOT / 'assets/js/nav-v2/task-action-router-v2.js'
FIXTURE = ROOT / 'tests/fixtures/nav-v2-task-role-matrix-rehearsal.html'
SPEC = ROOT / 'tests/e2e/task-action-role-matrix-rehearsal.spec.js'
DOC = ROOT / 'docs/NAV_V2_TASK_ROLE_MATRIX_REHEARSAL_2026-07-17.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-role-matrix-rehearsal.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    for path in (CONTRACT, TARGET_PLAN, GUARD, ROUTER, FIXTURE, SPEC, DOC, WORKFLOW):
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    target = json.loads(TARGET_PLAN.read_text(encoding='utf-8'))
    guard = GUARD.read_text(encoding='utf-8')
    router = ROUTER.read_text(encoding='utf-8')
    fixture = FIXTURE.read_text(encoding='utf-8')
    spec = SPEC.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    if contract.get('schema_version') != 1:
        errors.append('role matrix rehearsal schema must be 1')
    if contract.get('status') != 'cost_free_mocked_role_matrix_rehearsal':
        errors.append('role matrix rehearsal status drifted')
    for key in (
        'production_changed',
        'cloud_branch_created',
        'real_auth_proven',
        'real_rls_proven',
        'real_rpc_grants_proven',
        'bounded_transport_enabled',
    ):
        if contract.get(key) is not False:
            errors.append(f'contract must keep {key}=false')
    if contract.get('source_issue') != 282:
        errors.append('cost gate must remain linked to issue 282')

    approval = target.get('approval') or {}
    if approval.get('confirmed') is not False or approval.get('branch_creation_allowed') is not False:
        errors.append('paid preview branch must remain unapproved')
    if target.get('production_project_ref') != 'ofewxuqfjhamgerwzull':
        errors.append('production project ref drifted in target plan')

    roles = contract.get('roles') or []
    by_scenario = {item.get('scenario'): item for item in roles}
    expected_scenarios = {
        'owner',
        'admin',
        'manager',
        'spn_assigned',
        'lawyer_assigned',
        'broker_assigned',
        'viewer',
        'spn_unassigned',
    }
    if set(by_scenario) != expected_scenarios:
        errors.append(f'role scenarios drifted: {sorted(by_scenario)}')

    decision_allowed = {name for name, item in by_scenario.items() if item.get('terminal_decision_allowed') is True}
    if decision_allowed != {'owner', 'admin', 'manager'}:
        errors.append(f'terminal decision scope drifted: {sorted(decision_allowed)}')
    for name in ('viewer', 'spn_unassigned'):
        item = by_scenario.get(name) or {}
        if any(item.get(key) is not False for key in ('legacy_allowed', 'bounded_complete_allowed', 'terminal_decision_allowed')):
            errors.append(f'{name} must remain denied in all task actions')

    assertions = contract.get('required_assertions') or {}
    required_true = (
        'authoritative_handler_only',
        'legacy_rpc_exact_payload',
        'bounded_reopen_disabled',
        'desktop_and_mobile',
        'real_auth_claim_forbidden',
    )
    for key in required_true:
        if assertions.get(key) is not True:
            errors.append(f'assertion must remain true: {key}')
    if assertions.get('synthetic_base_onclick_calls') != 0 or assertions.get('bounded_network_rpc_calls') != 0:
        errors.append('competing onclick and bounded network counters must remain zero')

    guarantees = contract.get('separation_guarantees') or {}
    if any(value is not False for value in guarantees.values()):
        errors.append('all separation guarantees must remain false')

    require(guard, (
        'const BOUNDED_TRANSPORT_ENABLED = false;',
        "app.addEventListener('click', handleTaskAction, true)",
        'event.stopImmediatePropagation()',
        'taskActionRoutePreview',
    ), GUARD.name, errors)
    require(router, (
        "name: 'nav_v2_update_task_status'",
        'nav_v2_complete_bounded_task',
        'nav_v2_decide_bounded_task_terminal_outcome',
        'Завершённая bounded-задача неизменяема',
    ), ROUTER.name, errors)

    require(fixture, (
        'Task role matrix rehearsal',
        'Это не реальная авторизация или RLS-проверка',
        'id="legacyDone"',
        'id="boundedDone"',
        'id="boundedReopen"',
        'id="boundedDecision"',
        '__baseTaskHandlerCalls',
        'task-action-guard-v2.js?v=20260717-01',
    ), FIXTURE.name, errors)
    require(spec, (
        'role-scoped DTO controls the legacy action through the single authoritative handler',
        'bounded completion follows DTO permission but never enables network transport',
        'terminal outcome decision is manager-owner-admin only and transport-free',
        'must not be reported as real authenticated or RLS proof',
        "p_task_id: 'task-role-legacy'",
        "p_status: 'done'",
        'boundedMutationCalls).toHaveLength(0)',
        '__baseTaskHandlerCalls',
        'spn_unassigned',
        'broker_assigned',
    ), SPEC.name, errors)

    forbidden_combined = '\n'.join((fixture, spec, doc, workflow))
    for forbidden in (
        'service_role',
        'SUPABASE_SERVICE_ROLE',
        'create_branch(',
        'merge_branch(',
        'production credentials',
    ):
        if forbidden in forbidden_combined:
            errors.append(f'role matrix rehearsal contains forbidden cloud/privileged marker: {forbidden}')

    require(doc, (
        'cost-free mocked role matrix rehearsal',
        'Issue #282',
        'Не доказывает',
        'owner',
        'admin',
        'manager',
        'spn',
        'lawyer',
        'broker',
        'viewer',
        'Bounded transport',
        'Production boundary',
        'Rollback',
    ), DOC.name, errors)
    require(workflow, (
        'python3 scripts/check_nav_v2_task_role_matrix_rehearsal.py',
        'python3 -m py_compile scripts/check_nav_v2_task_role_matrix_rehearsal.py',
        'node --check tests/e2e/task-action-role-matrix-rehearsal.spec.js',
        'task-action-role-matrix-rehearsal.spec.js',
        '--project=chromium-desktop --project=chromium-mobile',
        'nav-v2-task-role-matrix-rehearsal',
    ), WORKFLOW.name, errors)

    if errors:
        print('Navigator v2 task role matrix rehearsal errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 task role matrix rehearsal passed: seven roles plus unassigned SPN are exercised with mocked role-scoped DTOs, the authoritative handler stays single-source, bounded transport stays off, and no real auth/RLS/deployment claim is made')
    return 0


if __name__ == '__main__':
    sys.exit(main())
