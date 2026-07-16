from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADAPTER = ROOT / 'assets/js/nav-v2/bounded-task-server-adapter-v2.js'
FIXTURES = ROOT / 'fixtures/nav-v2-bounded-task-server-adapter-scenarios.json'
SEMANTIC = ROOT / 'scripts/check-nav-v2-bounded-task-server-adapter.mjs'
CONTRACT = ROOT / 'config/nav-v2-bounded-task-mutations-contract.json'
MUTATIONS = ROOT / 'supabase/prototypes/nav_v2_bounded_task_mutations.sql'
DOC = ROOT / 'docs/NAV_V2_BOUNDED_TASK_SERVER_ADAPTER_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-bounded-task-server-adapter.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    paths = (ADAPTER, FIXTURES, SEMANTIC, CONTRACT, MUTATIONS, DOC, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    adapter = ADAPTER.read_text(encoding='utf-8')
    fixtures = json.loads(FIXTURES.read_text(encoding='utf-8'))
    semantic = SEMANTIC.read_text(encoding='utf-8')
    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    mutations = MUTATIONS.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    if contract.get('status') != 'repository_only_prototype' or contract.get('production_applied') is not False:
        errors.append('mutation contract must remain repository-only')
    if fixtures.get('schema_version') != 1 or fixtures.get('synthetic_only') is not True:
        errors.append('fixtures must remain schema v1 synthetic-only')

    exports = (
        'boundedTaskUuid', 'boundedTaskCreateRpcPreview', 'boundedTaskStartRpcPreview',
        'boundedTaskCompleteRpcPreview', 'boundedTaskActiveOutcomeRpcPreview',
        'boundedTaskTerminalProposalRpcPreview', 'boundedTaskTerminalDecisionRpcPreview',
        'minimizeBoundedTaskMutationResponse'
    )
    for name in exports:
        if f'export function {name}' not in adapter:
            errors.append(f'adapter export missing: {name}')

    rpc_names = [signature.split('(', 1)[0] for signature in contract.get('public_rpcs') or []]
    for name in rpc_names:
        if name not in adapter:
            errors.append(f'adapter preview missing: {name}')
        if name not in mutations:
            errors.append(f'mutation SQL missing: {name}')

    require(adapter, (
        'transport_enabled: false',
        'automatic_backlog_created: false',
        'legacy_rows_backfilled: false',
        'deal_readiness_changed: false',
        'risk_gate_changed: false',
        'deal_status_changed: false',
        'Выберите от 1 до 5 задач.',
        'evidence_reference_id должен быть UUID.',
        'replacement_task_id должен отличаться от task_id.'
    ), ADAPTER.name, errors)

    for forbidden in ('document.', 'window.', 'localStorage', 'sessionStorage', 'rpc(', 'fetch(', '.from('):
        if forbidden in adapter:
            errors.append(f'adapter is not transport-free: {forbidden}')

    if len(fixtures.get('create_cases') or []) < 6:
        errors.append('create matrix must contain at least six cases')
    if len(fixtures.get('operation_cases') or []) < 9:
        errors.append('operation matrix must contain at least nine cases')

    require(semantic, (
        'boundedTaskCreateRpcPreview',
        'boundedTaskCompleteRpcPreview',
        'boundedTaskTerminalProposalRpcPreview',
        'minimizeBoundedTaskMutationResponse',
        'transport-free RPC previews'
    ), SEMANTIC.name, errors)

    require(doc, (
        'repository-only consumer contract', 'transport-free', 'catalog',
        'client_request_id', 'waiting_external', 'terminal outcome',
        'DTO minimization', 'Production gate', 'Rollback'
    ), DOC.name, errors)

    require(workflow, (
        'python3 scripts/check_nav_v2_bounded_task_server_adapter.py',
        'node scripts/check-nav-v2-bounded-task-server-adapter.mjs',
        'node --check assets/js/nav-v2/bounded-task-server-adapter-v2.js',
        'nav-v2-bounded-task-server-adapter'
    ), WORKFLOW.name, errors)

    if errors:
        print('Navigator v2 bounded task adapter errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 bounded task adapter passed: exact transport-free previews, catalog validation and DTO minimization')
    return 0


if __name__ == '__main__':
    sys.exit(main())
