from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'config/nav-v2-task-edge-identity-contract.json'
HANDLER = ROOT / 'supabase/functions/nav-v2-deal-api/task-action-edge-identity-v2.js'
VALIDATOR = ROOT / 'supabase/functions/nav-v2-deal-api/task-action-contract-v2.js'
EDGE_INDEX = ROOT / 'supabase/functions/nav-v2-deal-api/index.ts'
MUTATIONS = ROOT / 'supabase/prototypes/nav_v2_bounded_task_mutations.sql'
SCENARIOS = ROOT / 'fixtures/nav-v2-task-edge-identity-scenarios.json'
RUNNER = ROOT / 'scripts/check-nav-v2-task-edge-identity.mjs'
SQL_SETUP = ROOT / 'tests/sql/nav_v2_task_edge_identity_setup.sql'
SQL_ASSERTIONS = ROOT / 'tests/sql/nav_v2_task_edge_identity_assertions.sql'
DOC = ROOT / 'docs/NAV_V2_TASK_EDGE_IDENTITY_GATE_2026-07-17.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-edge-identity.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    paths = (
        CONTRACT, HANDLER, VALIDATOR, EDGE_INDEX, MUTATIONS, SCENARIOS, RUNNER,
        SQL_SETUP, SQL_ASSERTIONS, DOC, WORKFLOW,
    )
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    scenarios = json.loads(SCENARIOS.read_text(encoding='utf-8'))
    handler = HANDLER.read_text(encoding='utf-8')
    validator = VALIDATOR.read_text(encoding='utf-8')
    edge_index = EDGE_INDEX.read_text(encoding='utf-8')
    mutations = MUTATIONS.read_text(encoding='utf-8')
    runner = RUNNER.read_text(encoding='utf-8')
    sql_setup = SQL_SETUP.read_text(encoding='utf-8')
    sql_assertions = SQL_ASSERTIONS.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    if contract.get('schema_version') != 1:
        errors.append('identity contract schema must be 1')
    if contract.get('status') != 'repository_only_identity_propagation_gate':
        errors.append('identity contract status drifted')
    for key in ('production_applied', 'runtime_integrated', 'edge_deployed', 'bounded_transport_enabled', 'deployment_ready'):
        if contract.get(key) is not False:
            errors.append(f'identity contract must keep {key}=false')

    conflict = contract.get('current_conflict') or {}
    if conflict.get('governed_rpc_execute_roles') != ['service_role']:
        errors.append('current governed execute role fact drifted')
    if conflict.get('sql_actor_source') != 'auth.uid()':
        errors.append('current SQL actor source drifted')
    if conflict.get('user_jwt_has_actor_identity') is not True:
        errors.append('user JWT identity fact missing')
    if conflict.get('user_jwt_has_governed_execute') is not False:
        errors.append('authenticated governed execute must remain false in current prototype')
    if conflict.get('service_role_has_governed_execute') is not True:
        errors.append('service role governed execute fact missing')
    if conflict.get('service_role_user_sub_guaranteed') is not False:
        errors.append('service role user subject must not be assumed')
    if conflict.get('current_contract_directly_executable') is not False:
        errors.append('current identity/grant combination must remain blocked')

    candidate = contract.get('selected_rehearsal_candidate') or {}
    if candidate.get('name') != 'verified_actor_id_injected_by_edge':
        errors.append('identity candidate drifted')
    if candidate.get('database_actor_argument') != 'p_actor_id':
        errors.append('candidate database actor argument drifted')
    if candidate.get('client_actor_fields_forbidden') != ['actor_id', 'p_actor_id', 'user_id', 'p_user_id']:
        errors.append('forbidden client actor field list drifted')
    if candidate.get('requires_future_sql_signature_refactor') is not True:
        errors.append('future SQL actor signature refactor must remain explicit')

    require(mutations, (
        'v_uid uuid := auth.uid();',
        'from public, anon, authenticated',
        'to service_role',
        'no authenticated EXECUTE until a separate deployment migration',
    ), MUTATIONS.name, errors)
    if re.search(r'create or replace function public\.nav_v2_(create|start|complete|set|propose|decide)[^(]*\([^)]*p_actor_id', mutations, re.I | re.S):
        errors.append('canonical governed prototypes already contain p_actor_id unexpectedly')

    require(validator, (
        'export function validateTaskEdgeAction',
        "action.startsWith('bounded_')",
        'Governed action разрешён только для contract-v2 задачи.',
    ), VALIDATOR.name, errors)

    require(handler, (
        "import { validateTaskEdgeAction } from './task-action-contract-v2.js';",
        'FORBIDDEN_CLIENT_ACTOR_FIELDS',
        "'actor_id', 'p_actor_id', 'user_id', 'p_user_id'",
        'Identity gate разрешён только для governed bounded actions.',
        'verified_actor_id должен быть UUID',
        'const rpcArgs = { ...baseArgs, p_actor_id: actorId };',
        "mode !== 'mock_execute'",
        'mock_rpc_call_count: 1',
        'canonical_sql_refactor_required: true',
        'target_sql_signature_ready: false',
        'runtime_integrated: false',
        'edge_deployed: false',
        'transport_enabled: false',
    ), HANDLER.name, errors)
    for forbidden in ('fetch(', 'Deno.env', 'createClient(', 'SUPABASE_SERVICE_ROLE_KEY'):
        if forbidden in handler:
            errors.append(f'detached identity handler contains forbidden runtime transport marker: {forbidden}')
    if 'task-action-edge-identity-v2.js' in edge_index:
        errors.append('identity rehearsal was imported into deployed Edge index prematurely')

    if scenarios.get('schema_version') != 1 or scenarios.get('synthetic_only') is not True:
        errors.append('identity scenarios must remain schema v1 synthetic-only')
    if len(scenarios.get('accepted') or []) < 6:
        errors.append('identity accepted matrix is too small')
    if len(scenarios.get('rejected') or []) < 6:
        errors.append('identity rejected matrix is too small')
    for scenario in scenarios.get('accepted') or []:
        args = scenario.get('args') or {}
        if args.get('p_actor_id') != scenarios.get('verified_actor_id'):
            errors.append(f"accepted scenario {scenario.get('id')} does not inject verified actor")
    for scenario in scenarios.get('rejected') or []:
        if scenario.get('expected_stage') not in {
            'request_shape', 'action_scope', 'actor_trust_boundary', 'verified_identity', 'payload_validation'
        }:
            errors.append(f"rejected scenario {scenario.get('id')} has unknown stage")

    require(runner, (
        'rehearseTaskEdgeIdentityAction',
        "mode: 'preview'",
        "mode: 'mock_execute'",
        'assert.equal(calls.length, 1)',
        'assert.deepEqual(calls[0]',
        'network_called, false',
        'no production transport',
    ), RUNNER.name, errors)

    require(sql_setup, (
        'create role authenticated nologin',
        'create role service_role nologin bypassrls',
        'create or replace function auth.uid()',
        'create or replace function public.nav_v2_identity_probe()',
        'select auth.uid();',
        'create or replace function public.nav_v2_identity_probe_actor(p_actor_id uuid)',
        'Verified actor does not have an active Navigator profile',
        'from public, anon, authenticated',
        'to service_role',
    ), SQL_SETUP.name, errors)
    require(sql_assertions, (
        'assert_authenticated_user_identity_exists',
        'assert_authenticated_governed_execute_absent',
        'assert_service_role_user_identity_absent',
        'assert_service_role_governed_execute_present',
        'assert_current_service_role_pattern_has_no_actor',
        'assert_explicit_verified_actor_candidate',
        'Expected inactive actor rejection',
        'PostgreSQL task Edge identity propagation gate passed',
    ), SQL_ASSERTIONS.name, errors)

    require(doc, (
        'repository-only identity propagation gate',
        'Текущий конфликт',
        'Почему нельзя просто вызвать service-role RPC',
        'Candidate: verified actor injection',
        'Client payload boundary',
        'PostgreSQL 17 proof',
        'Что этот PR не меняет',
        'Production gate',
        'Rollback',
    ), DOC.name, errors)
    require(workflow, (
        'postgres:17',
        'python3 scripts/check_nav_v2_task_edge_identity.py',
        'python3 -m py_compile scripts/check_nav_v2_task_edge_identity.py',
        'node --check supabase/functions/nav-v2-deal-api/task-action-edge-identity-v2.js',
        'node scripts/check-nav-v2-task-edge-identity.mjs',
        'nav_v2_task_edge_identity_setup.sql',
        'nav_v2_task_edge_identity_assertions.sql',
        'nav-v2-task-edge-identity',
    ), WORKFLOW.name, errors)

    if not contract.get('remaining_blockers'):
        errors.append('identity deployment blockers must remain explicit')

    if errors:
        print('Navigator v2 task Edge identity gate errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 task Edge identity gate passed: current auth.uid/service-role conflict is explicit, client actor spoofing is rejected, verified actor injection is rehearsed with one mock RPC, and production Edge/runtime remain unchanged')
    return 0


if __name__ == '__main__':
    sys.exit(main())
