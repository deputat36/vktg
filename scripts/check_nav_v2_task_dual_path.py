from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'config/nav-v2-task-dual-path-contract.json'
SCENARIOS = ROOT / 'fixtures/nav-v2-task-dual-path-scenarios.json'
ROUTER = ROOT / 'assets/js/nav-v2/task-action-router-v2.js'
PIPELINE = ROOT / 'assets/js/nav-v2/task-action-edge-pipeline-v2.js'
EDGE_CONTRACT = ROOT / 'supabase/functions/nav-v2-deal-api/task-action-contract-v2.js'
EDGE_RUNTIME = ROOT / 'supabase/functions/nav-v2-deal-api/task-action-edge-runtime-v2.js'
RUNTIME_CONFIG = ROOT / 'config/nav-v2-task-edge-runtime-integration-v1.json'
SEMANTIC = ROOT / 'scripts/check-nav-v2-task-dual-path.mjs'
FIXTURE = ROOT / 'tests/fixtures/nav-v2-task-action-dual-path.html'
E2E = ROOT / 'tests/e2e/task-action-dual-path.spec.js'
DOC = ROOT / 'docs/NAV_V2_TASK_DUAL_PATH_CONTRACT_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-dual-path.yml'
DEAL_CARD = ROOT / 'assets/js/nav-v2/deal-card-v2.js'
GUARD = ROOT / 'assets/js/nav-v2/task-action-guard-v2.js'
EDGE_INDEX = ROOT / 'supabase/functions/nav-v2-deal-api/index.ts'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    paths = (
        CONTRACT, SCENARIOS, ROUTER, PIPELINE, EDGE_CONTRACT, EDGE_RUNTIME, RUNTIME_CONFIG,
        SEMANTIC, FIXTURE, E2E, DOC, WORKFLOW, DEAL_CARD, GUARD, EDGE_INDEX,
    )
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    runtime_config = json.loads(RUNTIME_CONFIG.read_text(encoding='utf-8'))
    scenarios = json.loads(SCENARIOS.read_text(encoding='utf-8'))
    router = ROUTER.read_text(encoding='utf-8')
    pipeline = PIPELINE.read_text(encoding='utf-8')
    edge_contract = EDGE_CONTRACT.read_text(encoding='utf-8')
    edge_runtime = EDGE_RUNTIME.read_text(encoding='utf-8')
    semantic = SEMANTIC.read_text(encoding='utf-8')
    fixture = FIXTURE.read_text(encoding='utf-8')
    e2e = E2E.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')
    deal_card = DEAL_CARD.read_text(encoding='utf-8')
    guard = GUARD.read_text(encoding='utf-8')
    edge_index = EDGE_INDEX.read_text(encoding='utf-8')

    if contract.get('schema_version') != 3:
        errors.append('dual-path contract schema must be 3')
    if contract.get('status') != 'frontend_router_and_edge_source_integrated_transport_disabled':
        errors.append('dual-path contract status drifted')
    if contract.get('production_changed') is not False:
        errors.append('dual-path contract must remain non-production')
    if contract.get('frontend_runtime_integrated') is not True:
        errors.append('frontend router integration must remain explicit')
    if contract.get('edge_runtime_source_integrated') is not True:
        errors.append('Edge source integration must remain explicit')
    if contract.get('edge_runtime_enabled') is not False or contract.get('edge_deployed') is not False or contract.get('transport_enabled') is not False:
        errors.append('Edge route, deploy and bounded transport must remain disabled')
    flags = contract.get('feature_flags') or {}
    if flags.get('frontend_bounded_transport') is not False or flags.get('edge_bounded_identity_route') is not False:
        errors.append('dual-path feature flags must remain false')
    if runtime_config.get('runtime_source_integrated') is not True or runtime_config.get('feature_flag_default') is not False:
        errors.append('Edge runtime integration contract drifted')
    if runtime_config.get('edge_deployed') is not False or runtime_config.get('frontend_transport_enabled') is not False:
        errors.append('Edge runtime integration claims deployment')
    if scenarios.get('synthetic_only') is not True:
        errors.append('dual-path scenarios must remain synthetic-only')
    if len(scenarios.get('cases') or []) < 10 or len(scenarios.get('edge_cases') or []) < 7:
        errors.append('dual-path scenario coverage is too small')

    require(router, (
        'taskActionControlModel', 'taskActionRoutePreview', 'nav_v2_update_task_status',
        'boundedTaskStartRpcPreview', 'boundedTaskCompleteRpcPreview',
        'boundedTaskActiveOutcomeRpcPreview', 'boundedTaskTerminalProposalRpcPreview',
        'boundedTaskTerminalDecisionRpcPreview', 'Завершённая bounded-задача неизменяема',
        'duplicate_handler_allowed: false', 'transport_enabled: false',
    ), ROUTER.name, errors)
    for forbidden in ('fetch(', '.rpc(', '.from(', 'document.', 'window.', 'localStorage', 'sessionStorage'):
        if forbidden in router:
            errors.append(f'dual-path router must remain pure: {forbidden}')

    require(edge_contract, (
        'validateTaskEdgeAction', 'legacy_update_task_status', 'bounded_task_start',
        'bounded_task_complete', 'bounded_task_active_outcome',
        'bounded_task_terminal_proposal', 'bounded_task_terminal_decision',
        'Неизвестные поля', 'Legacy action запрещён для contract-v2 задачи',
        'Governed action разрешён только для contract-v2 задачи',
        'TASK_EDGE_REASON_CONTRACT', 'runtime_integrated: false', 'transport_enabled: false',
    ), EDGE_CONTRACT.name, errors)
    for forbidden in ('Deno.serve', 'fetch(', '.rpc(', 'createClient(', 'SUPABASE_'):
        if forbidden in edge_contract:
            errors.append(f'edge action contract must remain transport-free: {forbidden}')

    require(edge_runtime, (
        "from './task-action-edge-identity-v2.js'",
        'routeBoundedTaskEdgeActionV2',
        'feature_flag_default: false',
        'edge_deployed: false',
        'frontend_transport_enabled: false',
        "'intake_v1:mortgage'",
        "'intake_v1:military_mortgage'",
    ), EDGE_RUNTIME.name, errors)
    for forbidden in ('Deno.', 'fetch(', 'SUPABASE_SERVICE_ROLE_KEY'):
        if forbidden in edge_runtime:
            errors.append(f'Edge runtime adapter must remain dependency-injected: {forbidden}')

    require(pipeline, (
        'taskActionEdgePipelinePreview', 'validateTaskEdgeAction',
        'one_action_one_validated_rpc_preview: true', 'network_called: false',
        'runtime_integrated: false', 'edge_deployed: false', 'transport_enabled: false',
    ), PIPELINE.name, errors)

    require(guard, (
        "import { taskActionControlModel, taskActionRoutePreview } from './task-action-router-v2.js?v=20260716-01';",
        "app.addEventListener('click', handleTaskAction, true)",
        'const BOUNDED_TRANSPORT_ENABLED = false;',
    ), GUARD.name, errors)
    if 'task-action-router-v2.js' in deal_card or 'task-action-edge-pipeline-v2.js' in deal_card:
        errors.append('deal-card must remain renderer-only')
    if 'task-action-contract-v2.js' in guard or 'task-action-edge-pipeline-v2.js' in guard:
        errors.append('authoritative frontend guard must not import Edge contracts')
    require(edge_index, (
        'import { routeBoundedTaskEdgeActionV2 } from "./task-action-edge-runtime-v2.js";',
        'const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;',
        'profile_loader: loadActiveNavProfile',
        'task_loader: loadBoundedTaskContext',
        'rpc_client: { rpc: callServiceRpc }',
    ), EDGE_INDEX.name, errors)
    if 'task-action-router-v2.js' in edge_index or 'task-action-edge-pipeline-v2.js' in edge_index:
        errors.append('frontend router or rehearsal pipeline was integrated into Edge index')
    if 'SUPABASE_SERVICE_ROLE_KEY' in guard or 'SUPABASE_SERVICE_ROLE_KEY' in deal_card:
        errors.append('service role environment name leaked into frontend')

    require(semantic, (
        'taskActionRoutePreview', 'validateTaskEdgeAction', 'duplicate_handler_allowed',
        'immutable_create_new_audited_task', 'Navigator v2 task dual-path semantic scenarios passed',
    ), SEMANTIC.name, errors)
    require(fixture, (
        'id="legacyComplete"', 'id="boundedComplete"', 'id="boundedReopen"',
        'id="boundedWaiting"', 'id="boundedDecision"',
        'window.__dualPathRouteCalls', 'taskActionRoutePreview',
    ), FIXTURE.name, errors)
    require(e2e, (
        'legacy and bounded actions select exactly one transport-free route',
        'nav_v2_update_task_status', 'nav_v2_complete_bounded_task',
        'nav_v2_set_bounded_task_active_outcome',
        'nav_v2_decide_bounded_task_terminal_outcome',
        'window.__dualPathRouteCalls', 'networkCalls', 'toEqual([])',
    ), E2E.name, errors)

    closed = set(contract.get('closed_blockers') or [])
    for blocker in ('authoritative_router_not_integrated', 'duplicate_frontend_handlers', 'frontend_edge_rpc_parity_missing', 'edge_action_source_route_not_integrated'):
        if blocker not in closed:
            errors.append(f'closed dual-path blocker missing: {blocker}')
    remaining = set(contract.get('remaining_blockers') or [])
    for blocker in (
        'edge_runtime_feature_flag_disabled', 'edge_function_not_deployed',
        'authenticated_application_e2e_missing', 'database_migrations_not_deployed',
        'minimal_grants_not_deployed', 'frontend_bounded_transport_disabled',
        'controlled_pilot_not_approved',
    ):
        if blocker not in remaining:
            errors.append(f'remaining dual-path blocker missing: {blocker}')
    if any(value is not False for value in (contract.get('separation_guarantees') or {}).values()):
        errors.append('all dual-path separation guarantees must remain false')

    require(doc, (
        'frontend router and Edge source integrated, transport disabled',
        'Authoritative frontend', 'Legacy path', 'Bounded path',
        'Bounded reopen запрещён', 'Edge action contract', 'Edge runtime adapter',
        'Pipeline rehearsal', 'Synthetic browser regression',
        'Что ещё блокирует deployment', 'Production gate', 'Rollback',
    ), DOC.name, errors)
    require(workflow, (
        'python3 scripts/check_nav_v2_task_dual_path.py',
        'node scripts/check-nav-v2-task-dual-path.mjs',
        'node --check assets/js/nav-v2/task-action-router-v2.js',
        'node --check supabase/functions/nav-v2-deal-api/task-action-contract-v2.js',
        'npx playwright test tests/e2e/task-action-dual-path.spec.js',
        'nav-v2-task-dual-path',
    ), WORKFLOW.name, errors)

    if errors:
        print('Navigator v2 task dual-path contract errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 task dual-path contract v3 passed: frontend and Edge sources are integrated behind disabled flags, legacy runtime remains default, and deployment/transport stay disabled')
    return 0


if __name__ == '__main__':
    sys.exit(main())
