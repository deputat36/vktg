from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'config/nav-v2-task-action-pipeline-contract.json'
PIPELINE = ROOT / 'assets/js/nav-v2/task-action-edge-pipeline-v2.js'
ROUTER = ROOT / 'assets/js/nav-v2/task-action-router-v2.js'
EDGE = ROOT / 'supabase/functions/nav-v2-deal-api/task-action-contract-v2.js'
SCENARIOS = ROOT / 'fixtures/nav-v2-task-action-pipeline-scenarios.json'
DUAL_SCENARIOS = ROOT / 'fixtures/nav-v2-task-dual-path-scenarios.json'
NODE_RUNNER = ROOT / 'scripts/check-nav-v2-task-action-pipeline.mjs'
BROWSER_FIXTURE = ROOT / 'tests/fixtures/nav-v2-task-action-pipeline-rehearsal.html'
BROWSER_SPEC = ROOT / 'tests/e2e/task-action-pipeline-rehearsal.spec.js'
DOC = ROOT / 'docs/NAV_V2_TASK_ACTION_PIPELINE_REHEARSAL_2026-07-17.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-action-pipeline-rehearsal.yml'
DEPLOYED_EDGE = ROOT / 'supabase/functions/nav-v2-deal-api/index.ts'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    paths = (
        CONTRACT, PIPELINE, ROUTER, EDGE, SCENARIOS, DUAL_SCENARIOS, NODE_RUNNER,
        BROWSER_FIXTURE, BROWSER_SPEC, DOC, WORKFLOW, DEPLOYED_EDGE,
    )
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    scenarios = json.loads(SCENARIOS.read_text(encoding='utf-8'))
    pipeline = PIPELINE.read_text(encoding='utf-8')
    router = ROUTER.read_text(encoding='utf-8')
    edge = EDGE.read_text(encoding='utf-8')
    node_runner = NODE_RUNNER.read_text(encoding='utf-8')
    fixture = BROWSER_FIXTURE.read_text(encoding='utf-8')
    browser = BROWSER_SPEC.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')
    deployed_edge = DEPLOYED_EDGE.read_text(encoding='utf-8')

    if contract.get('schema_version') != 1:
        errors.append('pipeline contract schema must be 1')
    if contract.get('status') != 'cost_free_transport_free_pipeline_rehearsal':
        errors.append('pipeline contract status drifted')
    for key in (
        'production_changed', 'cloud_branch_created', 'runtime_integrated', 'edge_deployed',
        'transport_enabled', 'real_auth_proven', 'real_rls_proven', 'real_grants_proven',
    ):
        if contract.get(key) is not False:
            errors.append(f'pipeline contract must keep {key}=false')

    mappings = contract.get('rpc_action_mapping') or {}
    expected_rpcs = {
        'nav_v2_update_task_status',
        'nav_v2_start_bounded_task',
        'nav_v2_complete_bounded_task',
        'nav_v2_set_bounded_task_active_outcome',
        'nav_v2_propose_bounded_task_terminal_outcome',
        'nav_v2_decide_bounded_task_terminal_outcome',
    }
    if set(mappings) != expected_rpcs:
        errors.append(f'RPC action mapping drifted: {sorted(mappings)}')

    guards = contract.get('required_guards') or {}
    for key in (
        'one_action_one_validated_rpc_preview', 'frontend_edge_rpc_name_parity',
        'frontend_edge_rpc_args_parity', 'legacy_action_rejected_for_contract_v2',
        'governed_action_rejected_for_legacy', 'unknown_fields_rejected',
        'uuid_validation', 'reason_enum_validation', 'calendar_date_validation',
        'replacement_validation', 'bounded_reopen_rejected',
    ):
        if guards.get(key) is not True:
            errors.append(f'pipeline guard must remain true: {key}')
    if guards.get('network_calls') != 0:
        errors.append('pipeline network calls must remain zero')

    guarantees = contract.get('separation_guarantees') or {}
    if any(value is not False for value in guarantees.values()):
        errors.append('all pipeline separation guarantees must remain false')

    if scenarios.get('synthetic_only') is not True or scenarios.get('production_changed') is not False:
        errors.append('pipeline scenarios must remain synthetic and non-production')
    if scenarios.get('network_allowed') is not False:
        errors.append('pipeline scenarios must forbid network')
    if len(scenarios.get('valid_cases') or []) < 10 or len(scenarios.get('invalid_cases') or []) < 8:
        errors.append('pipeline scenario coverage is too small')

    require(pipeline, (
        'taskActionEdgePipelinePreview',
        'taskEdgeActionFromRpcName',
        'taskEdgePayloadFromRpcPreview',
        'taskDbArgsFromEdgeValidation',
        'validateTaskEdgeAction',
        "stage: 'validated_rpc_preview'",
        "failed('rpc_parity'",
        'one_action_one_validated_rpc_preview: true',
        'network_called: false',
        'runtime_integrated: false',
        'edge_deployed: false',
        'transport_enabled: false',
    ), PIPELINE.name, errors)
    for forbidden in ('fetch(', '.rpc(', 'XMLHttpRequest', 'sendBeacon', 'localStorage', 'sessionStorage'):
        if forbidden in pipeline:
            errors.append(f'{PIPELINE.name}: forbidden transport/storage marker {forbidden}')

    require(router, (
        'taskActionRoutePreview',
        'nav_v2_update_task_status',
        'nav_v2_complete_bounded_task',
        'Завершённая bounded-задача неизменяема',
    ), ROUTER.name, errors)
    require(edge, (
        'validateTaskEdgeAction',
        "required: ['task_id', 'client_request_id', 'task_contract_version']",
        'Governed action разрешён только для contract-v2 задачи.',
        'Legacy action запрещён для contract-v2 задачи.',
        'reason_code не разрешён для active outcome.',
        'reason_code не разрешён для terminal outcome.',
        'review_date должен быть реальной датой YYYY-MM-DD.',
        'TASK_EDGE_REASON_CONTRACT',
        'runtime_integrated: false',
        'transport_enabled: false',
    ), EDGE.name, errors)

    if 'task-action-contract-v2.js' in deployed_edge or 'task-action-edge-pipeline-v2.js' in deployed_edge:
        errors.append('detached task Edge contracts were integrated into deployed index.ts prematurely')

    require(node_runner, (
        'taskActionEdgePipelinePreview',
        'validateTaskEdgeAction',
        'frontend/edge parity',
        'governedOnLegacy',
        'legacyOnBounded',
        'network_called',
        'TASK_ACTION_EDGE_PIPELINE_CONTRACT',
    ), NODE_RUNNER.name, errors)
    require(fixture, (
        'Frontend router → detached Edge validator → exact RPC preview',
        'data-pipeline-case="legacy_complete"',
        'data-pipeline-case="bounded_complete"',
        'data-pipeline-case="bounded_waiting"',
        'data-pipeline-case="bounded_replaced"',
        'data-pipeline-case="bounded_decision"',
        'data-pipeline-case="bounded_reopen"',
        'data-pipeline-case="tampered_unknown"',
        'window.__taskPipelineResults',
    ), BROWSER_FIXTURE.name, errors)
    require(browser, (
        'one browser action produces one exact validated RPC preview without network',
        'bounded reopen stops at frontend router',
        'tampered Edge payload is rejected before RPC parity',
        'multiple actions remain one click to one preview',
        "page.route('**/rest/v1/rpc/**'",
        'expect(networkCalls).toEqual([])',
    ), BROWSER_SPEC.name, errors)

    require(doc, (
        'cost-free transport-free pipeline rehearsal',
        'Frontend router',
        'Canonical pipeline',
        'Detached Edge validator',
        'Valid scenarios',
        'Rejected/tampered scenarios',
        'Browser rehearsal',
        'Что не доказывает',
        'Production boundary',
        'Rollback',
        'Issue #282',
    ), DOC.name, errors)
    require(workflow, (
        'python3 scripts/check_nav_v2_task_action_pipeline.py',
        'python3 -m py_compile scripts/check_nav_v2_task_action_pipeline.py',
        'node scripts/check-nav-v2-task-action-pipeline.mjs',
        'node scripts/check-nav-v2-task-dual-path.mjs',
        'task-action-pipeline-rehearsal.spec.js',
        '--project=chromium-desktop --project=chromium-mobile',
        'nav-v2-task-action-pipeline-rehearsal',
    ), WORKFLOW.name, errors)

    if errors:
        print('Navigator v2 task action pipeline errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 task action pipeline source contract passed: frontend and detached Edge previews have canonical exact parity, tampered inputs are rejected, and network/deployment remain disabled')
    return 0


if __name__ == '__main__':
    sys.exit(main())
