from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'contract': ROOT / 'config/nav-v2-task-edge-identity-contract.json',
    'handler': ROOT / 'supabase/functions/nav-v2-deal-api/task-action-edge-identity-v2.js',
    'validator': ROOT / 'supabase/functions/nav-v2-deal-api/task-action-contract-v2.js',
    'edge_index': ROOT / 'supabase/functions/nav-v2-deal-api/index.ts',
    'canonical': ROOT / 'supabase/prototypes/nav_v2_bounded_task_mutations.sql',
    'actor_overlay': ROOT / 'supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql',
    'actor_contract': ROOT / 'config/nav-v2-bounded-task-actor-aware-contract.json',
    'scenarios': ROOT / 'fixtures/nav-v2-task-edge-identity-scenarios.json',
    'runner': ROOT / 'scripts/check-nav-v2-task-edge-identity.mjs',
    'parity': ROOT / 'scripts/check-nav-v2-task-edge-sql-parity.mjs',
    'sql_setup': ROOT / 'tests/sql/nav_v2_task_edge_identity_setup.sql',
    'sql_assertions': ROOT / 'tests/sql/nav_v2_task_edge_identity_assertions.sql',
    'doc': ROOT / 'docs/NAV_V2_TASK_EDGE_IDENTITY_GATE_2026-07-17.md',
    'actor_doc': ROOT / 'docs/NAV_V2_BOUNDED_TASK_ACTOR_AWARE_SQL_2026-07-17.md',
    'workflow': ROOT / '.github/workflows/nav-v2-task-edge-identity.yml',
}


def need(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    for label, path in FILES.items():
        if not path.exists(): errors.append(f'missing {label}: {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors)); return 1

    text = {label: path.read_text(encoding='utf-8') for label, path in FILES.items() if label not in ('contract','actor_contract','scenarios')}
    contract = json.loads(FILES['contract'].read_text(encoding='utf-8'))
    actor_contract = json.loads(FILES['actor_contract'].read_text(encoding='utf-8'))
    scenarios = json.loads(FILES['scenarios'].read_text(encoding='utf-8'))

    if contract.get('schema_version') != 2 or contract.get('status') != 'repository_only_identity_sql_parity_gate':
        errors.append('identity SQL parity contract metadata drifted')
    for key in ('production_applied','runtime_integrated','edge_deployed','bounded_transport_enabled','deployment_ready'):
        if contract.get(key) is not False: errors.append(f'{key} must remain false')

    conflict = contract.get('current_conflict') or {}
    if conflict.get('canonical_governed_rpc_execute_roles') != ['service_role']:
        errors.append('canonical execute-role fact drifted')
    if conflict.get('canonical_sql_actor_source') != 'auth.uid()':
        errors.append('canonical actor-source fact drifted')
    if conflict.get('user_jwt_has_actor_identity') is not True or conflict.get('user_jwt_has_canonical_governed_execute') is not False:
        errors.append('user JWT conflict facts drifted')
    if conflict.get('service_role_has_canonical_governed_execute') is not True or conflict.get('service_role_user_sub_guaranteed') is not False:
        errors.append('service-role conflict facts drifted')
    if conflict.get('canonical_contract_directly_executable') is not False:
        errors.append('canonical contract must remain blocked')

    resolution = contract.get('repository_sql_resolution') or {}
    if resolution.get('actor_aware_sql_prototype_ready') is not True:
        errors.append('actor-aware repository SQL must be ready')
    if resolution.get('actor_aware_sql_merge') != '5d63d490ad8f210e10cea59e0f9f14863e72b0de':
        errors.append('actor-aware SQL merge drifted')
    if resolution.get('actor_argument') != 'p_actor_id' or resolution.get('task_action_overloads_ready') != 5:
        errors.append('task action SQL resolution drifted')
    if resolution.get('create_overload_ready_separate_flow') is not True or resolution.get('postgres_17_regression_green') is not True:
        errors.append('create overload or PostgreSQL proof missing')
    if resolution.get('production_deployed') is not False:
        errors.append('actor-aware SQL must remain undeployed')

    candidate = contract.get('selected_rehearsal_candidate') or {}
    if candidate.get('name') != 'verified_actor_id_injected_by_edge' or candidate.get('database_actor_argument') != 'p_actor_id':
        errors.append('identity candidate drifted')
    if candidate.get('client_actor_fields_forbidden') != ['actor_id','p_actor_id','user_id','p_user_id']:
        errors.append('client actor boundary drifted')
    if candidate.get('requires_future_sql_signature_refactor') is not False or candidate.get('repository_sql_signatures_ready') is not True:
        errors.append('repository SQL readiness facts drifted')
    invariants = contract.get('security_invariants') or {}
    for key in ('actor_never_trusted_from_request_body','verified_actor_uuid_required','payload_validated_before_actor_injection','exactly_one_mock_rpc_call','exact_sql_parameter_parity_required','no_network','no_service_key_in_browser','no_direct_authenticated_governed_rpc','no_production_edge_import'):
        if invariants.get(key) is not True: errors.append(f'identity invariant missing: {key}')

    need(text['canonical'], ('v_uid uuid := auth.uid();','from public, anon, authenticated','to service_role'), 'canonical SQL', errors)
    if re.search(r'create or replace function public\.nav_v2_[^(]+\([^)]*p_actor_id', text['canonical'], re.I | re.S):
        errors.append('canonical SQL unexpectedly contains actor-aware signature')
    need(text['actor_overlay'], ('REPOSITORY-ONLY ACTOR-AWARE OVERLAY','p_actor_id uuid','nav_v2_require_verified_actor','nav_v2_assert_actor_replay','to service_role'), 'actor overlay', errors)
    if actor_contract.get('status') != 'repository_only_actor_aware_sql_prototype' or actor_contract.get('production_applied') is not False:
        errors.append('actor-aware SQL contract missing')

    need(text['validator'], ('export function validateTaskEdgeAction',"action.startsWith('bounded_')",'Governed action разрешён только для contract-v2 задачи.'), 'validator', errors)
    need(text['handler'], (
        'FORBIDDEN_CLIENT_ACTOR_FIELDS',
        "'actor_id', 'p_actor_id', 'user_id', 'p_user_id'",
        'const rpcArgs = { ...baseArgs, p_actor_id: actorId };',
        'target_sql_signature_ready: true',
        'actor_aware_sql_prototype_ready: true',
        'actor_aware_sql_deployed: false',
        'canonical_sql_refactor_required: false',
        'runtime_integrated: false',
        'edge_deployed: false',
        'transport_enabled: false',
    ), 'identity handler', errors)
    for forbidden in ('fetch(', 'Deno.env', 'createClient(', 'SUPABASE_SERVICE_ROLE_KEY'):
        if forbidden in text['handler']: errors.append(f'detached handler contains transport marker: {forbidden}')
    if 'task-action-edge-identity-v2.js' in text['edge_index']:
        errors.append('identity handler imported into production Edge index')

    if scenarios.get('schema_version') != 1 or scenarios.get('synthetic_only') is not True:
        errors.append('identity scenarios metadata drifted')
    if len(scenarios.get('accepted') or []) < 6 or len(scenarios.get('rejected') or []) < 6:
        errors.append('identity scenario matrix is incomplete')
    for scenario in scenarios.get('accepted') or []:
        if (scenario.get('args') or {}).get('p_actor_id') != scenarios.get('verified_actor_id'):
            errors.append(f"scenario {scenario.get('id')} does not inject verified actor")

    need(text['runner'], ('target_sql_signature_ready, true','actor_aware_sql_prototype_ready, true','actor_aware_sql_deployed, false','no production transport'), 'semantic runner', errors)
    need(text['parity'], ('actorAwareDefinitions','expected six actor-aware SQL overload definitions','Object.keys(preview.rpc_args)','create overload must remain ready for its separate flow','Edge-to-SQL parity passed'), 'parity runner', errors)
    need(text['sql_setup'], ('create role authenticated nologin','create role service_role nologin bypassrls','nav_v2_identity_probe_actor'), 'PostgreSQL setup', errors)
    need(text['sql_assertions'], ('assert_authenticated_governed_execute_absent','assert_service_role_user_identity_absent','assert_explicit_verified_actor_candidate','PostgreSQL task Edge identity propagation gate passed'), 'PostgreSQL assertions', errors)
    need(text['doc'], ('repository-only identity and SQL parity gate','Текущий canonical конфликт','PR #389','Exact Edge-to-SQL parity','Production gate','Rollback'), 'identity doc', errors)
    need(text['actor_doc'], ('repository-only actor-aware SQL prototype','PostgreSQL 17 regression','Production gate'), 'actor SQL doc', errors)
    need(text['workflow'], ('postgres:17','check_nav_v2_task_edge_identity.py','check-nav-v2-task-edge-identity.mjs','check-nav-v2-task-edge-sql-parity.mjs','nav_v2_bounded_task_actor_aware_mutations.sql','nav-v2-task-edge-identity'), 'workflow', errors)

    if not contract.get('remaining_blockers'): errors.append('identity deployment blockers must remain explicit')
    if errors:
        print('Navigator v2 task Edge identity/SQL parity errors:')
        for error in errors: print(f'- {error}')
        return 1
    print('Navigator v2 task Edge identity/SQL parity passed: verified actor mapping exactly matches repository SQL overloads while production SQL, Edge runtime and transport remain disabled')
    return 0


if __name__ == '__main__':
    sys.exit(main())
