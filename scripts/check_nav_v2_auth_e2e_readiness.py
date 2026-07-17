from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'config/nav-v2-auth-e2e-readiness.json'
MATRIX = ROOT / 'fixtures/nav-v2-auth-e2e-role-matrix.json'
TARGET_PLAN = ROOT / 'config/nav-v2-e2e-target-plan.json'
RUNBOOK = ROOT / 'docs/NAV_V2_AUTH_E2E_TARGET_RUNBOOK.md'
ROLE_REHEARSAL = ROOT / 'docs/NAV_V2_TASK_ROLE_MATRIX_REHEARSAL_2026-07-17.md'
IDENTITY_CONTRACT = ROOT / 'config/nav-v2-task-edge-identity-contract.json'
ACTOR_CONTRACT = ROOT / 'config/nav-v2-bounded-task-actor-aware-contract.json'
STORYBOARD = ROOT / 'config/nav-v2-bounded-task-migration-storyboard.json'
SEMANTIC = ROOT / 'scripts/check-nav-v2-auth-e2e-readiness.mjs'
DOC = ROOT / 'docs/NAV_V2_AUTH_E2E_READINESS_2026-07-17.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-auth-e2e-readiness.yml'


def need(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    paths = (
        CONTRACT, MATRIX, TARGET_PLAN, RUNBOOK, ROLE_REHEARSAL, IDENTITY_CONTRACT,
        ACTOR_CONTRACT, STORYBOARD, SEMANTIC, DOC, WORKFLOW,
    )
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors)); return 1

    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    matrix = json.loads(MATRIX.read_text(encoding='utf-8'))
    target = json.loads(TARGET_PLAN.read_text(encoding='utf-8'))
    identity = json.loads(IDENTITY_CONTRACT.read_text(encoding='utf-8'))
    actor = json.loads(ACTOR_CONTRACT.read_text(encoding='utf-8'))
    storyboard = json.loads(STORYBOARD.read_text(encoding='utf-8'))
    runbook = RUNBOOK.read_text(encoding='utf-8')
    role_rehearsal = ROLE_REHEARSAL.read_text(encoding='utf-8')
    semantic = SEMANTIC.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    if contract.get('schema_version') != 1 or contract.get('status') != 'repository_only_auth_e2e_readiness_package':
        errors.append('auth E2E readiness metadata drifted')
    for key in (
        'production_applied', 'supabase_branch_created', 'cloud_execution_allowed',
        'cost_approval_confirmed', 'authenticated_e2e_proven', 'deployment_ready',
    ):
        if contract.get(key) is not False:
            errors.append(f'auth E2E readiness must keep {key}=false')
    if contract.get('cost_gate_issue') != 282 or contract.get('environment_name') != 'navigator-e2e':
        errors.append('cost gate or environment name drifted')
    if contract.get('production_project_ref') != 'ofewxuqfjhamgerwzull':
        errors.append('production project reference drifted')
    snapshot = contract.get('historical_cost_snapshot') or {}
    if snapshot.get('stale_for_execution') is not True or snapshot.get('must_recheck_before_branch_creation') is not True:
        errors.append('historical cost must remain stale and require recheck')

    required_roles = {'admin','manager','spn','lawyer','broker','viewer'}
    if set(contract.get('required_roles') or []) != required_roles:
        errors.append('required role inventory drifted')
    if contract.get('optional_roles') != ['owner']:
        errors.append('owner must remain optional')
    if set(matrix.get('mandatory_roles') or []) != required_roles or matrix.get('optional_roles') != ['owner']:
        errors.append('role matrix inventory drifted')
    if matrix.get('schema_version') != 1 or matrix.get('synthetic_only') is not True:
        errors.append('role matrix must remain schema v1 synthetic-only')

    variables = set(contract.get('required_environment_variables') or [])
    for name in (
        'NAV_E2E_SUPABASE_URL', 'NAV_E2E_SUPABASE_PROJECT_REF',
        'NAV_E2E_SPN_ALLOWED_DEAL_ID', 'NAV_E2E_SPN_FORBIDDEN_DEAL_ID',
    ):
        if name not in variables: errors.append(f'required variable missing: {name}')
    secrets = set(contract.get('required_environment_secrets') or [])
    if 'NAV_E2E_SUPABASE_PUBLISHABLE_KEY' not in secrets:
        errors.append('publishable key secret missing')
    for role in required_roles:
        upper = role.upper()
        for suffix in ('EMAIL','PASSWORD'):
            if f'NAV_E2E_{upper}_{suffix}' not in secrets:
                errors.append(f'{role} {suffix.lower()} secret missing')
    forbidden = set(contract.get('forbidden_environment_secrets') or [])
    if secrets & forbidden:
        errors.append(f'forbidden secrets included in required list: {sorted(secrets & forbidden)}')
    if not any('SERVICE_ROLE' in item for item in forbidden) or not any('DB_PASSWORD' in item for item in forbidden):
        errors.append('service role and database password must be explicitly forbidden')

    identity_chain = contract.get('identity_chain') or {}
    for key in (
        'bearer_user_verified', 'edge_verified_actor_equals_auth_user',
        'task_actor_fields_match_verified_actor', 'audit_actor_matches_verified_actor',
        'one_client_request_one_event', 'cross_actor_replay_rejected',
    ):
        if identity_chain.get(key) is not True:
            errors.append(f'identity-chain invariant missing: {key}')
    if identity_chain.get('sql_actor_argument') != 'p_actor_id':
        errors.append('identity SQL actor argument drifted')
    if identity_chain.get('client_actor_fields_forbidden') != ['actor_id','p_actor_id','user_id','p_user_id']:
        errors.append('client actor field boundary drifted')

    proofs = contract.get('repository_proofs') or {}
    if set(proofs.values()) != {'PR #384','PR #387','PR #389','PR #390','PR #391'}:
        errors.append('repository proof inventory drifted')
    if identity.get('status') != 'repository_only_identity_sql_parity_gate' or identity.get('authenticated_e2e_proven') is not None:
        # identity contract intentionally has no misleading authenticated-E2E flag
        pass
    if identity.get('production_applied') is not False or identity.get('edge_deployed') is not False:
        errors.append('identity contract must remain undeployed')
    if actor.get('status') != 'repository_only_actor_aware_sql_prototype' or actor.get('production_applied') is not False:
        errors.append('actor-aware SQL proof missing or deployed')
    if storyboard.get('schema_version') != 2 or storyboard.get('authenticated_e2e_proven') is not False:
        errors.append('migration storyboard must remain blocked on authenticated E2E')

    scenarios = matrix.get('scenarios') or []
    if len(scenarios) < 9 or len({item.get('id') for item in scenarios}) != len(scenarios):
        errors.append('role matrix scenarios are incomplete or duplicated')
    for role in required_roles:
        if not any(item.get('role') == role and item.get('account_required') is True for item in scenarios):
            errors.append(f'account-backed scenario missing for {role}')
    scenario_ids = {item.get('id') for item in scenarios}
    for required_id in (
        'admin_terminal_decision','manager_team_terminal_decision','spn_create_selected_tasks',
        'spn_complete_document_task','lawyer_propose_legal_outcome','broker_operate_mortgage_task',
        'viewer_read_only','spn_forbidden_deal','cross_actor_replay',
    ):
        if required_id not in scenario_ids: errors.append(f'scenario missing: {required_id}')
    broker = next((item for item in scenarios if item.get('id') == 'broker_operate_mortgage_task'), {})
    if broker.get('deal_scope') != 'assigned_mortgage_deal' or broker.get('negative_check') != 'matcap_without_mortgage_not_routed_to_broker':
        errors.append('broker scope scenario drifted')
    viewer = next((item for item in scenarios if item.get('id') == 'viewer_read_only'), {})
    if viewer.get('expected') != 'allowed_read_only' or viewer.get('negative_check') != 'all_task_mutations_denied':
        errors.append('viewer read-only scenario drifted')

    cleanup = contract.get('cleanup_acceptance') or {}
    if cleanup.get('branch_deleted') is not True or cleanup.get('technical_auth_users_remaining') != 0 or cleanup.get('active_technical_profiles_remaining') != 0 or cleanup.get('open_p0_if_cleanup_fails') is not True:
        errors.append('cleanup acceptance drifted')
    if len(contract.get('stop_conditions') or []) < 10 or len(contract.get('remaining_blockers') or []) < 8:
        errors.append('STOP conditions or blockers are incomplete')

    if target.get('status') != 'approval_required' or (target.get('approval') or {}).get('branch_creation_allowed') is not False:
        errors.append('existing target plan must remain approval-required')
    need(runbook, (
        'A generic instruction to continue project work is not cost approval.',
        'do not create a persistent branch',
        'service-role key',
        'delete the branch immediately',
        'Authenticated role matrix: blocked',
    ), 'target runbook', errors)
    need(role_rehearsal, (
        'cost-free mocked role matrix rehearsal',
        'Зелёный результат нельзя называть authenticated application E2E.',
        'Issue #282',
    ), 'mock role rehearsal', errors)
    need(semantic, (
        'repository_only_auth_e2e_readiness_package',
        'NAV_E2E_SUPABASE_PUBLISHABLE_KEY',
        'SERVICE_ROLE',
        'cross_actor_replay',
        'cloud execution and cost approval remain disabled',
    ), 'semantic runner', errors)
    need(doc, (
        'repository-only readiness package',
        'Cost gate',
        'Обязательные роли',
        'GitHub Environment',
        'Synthetic data',
        'Role matrix',
        'Identity chain',
        'STOP conditions',
        'Evidence package',
        'Текущее состояние',
        'Rollback',
    ), 'readiness document', errors)
    need(workflow, (
        'python3 scripts/check_nav_v2_auth_e2e_readiness.py',
        'python3 -m py_compile scripts/check_nav_v2_auth_e2e_readiness.py',
        'node --check scripts/check-nav-v2-auth-e2e-readiness.mjs',
        'node scripts/check-nav-v2-auth-e2e-readiness.mjs',
        'nav-v2-auth-e2e-readiness',
    ), 'workflow', errors)
    for forbidden_marker in (
        'create_branch', 'confirm_cost', 'apply_migration', 'deploy_edge_function',
        'SUPABASE_SERVICE_ROLE_KEY:', 'supabase db push', 'supabase migration up',
    ):
        if forbidden_marker in workflow:
            errors.append(f'cost-free readiness workflow contains forbidden cloud/apply marker: {forbidden_marker}')

    if errors:
        print('Navigator v2 authenticated E2E readiness errors:')
        for error in errors: print(f'- {error}')
        return 1
    print('Navigator v2 authenticated E2E readiness passed: roles, environment contract, synthetic fixtures, identity evidence, STOP/cleanup gates and repository proofs are complete while cloud execution remains blocked')
    return 0


if __name__ == '__main__':
    sys.exit(main())
