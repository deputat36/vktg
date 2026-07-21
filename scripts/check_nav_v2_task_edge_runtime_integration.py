from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'config': ROOT / 'config/nav-v2-task-edge-runtime-integration-v1.json',
    'manifest': ROOT / 'config/nav-v2-preview-deployment-bundle-manifest-v1.json',
    'decision': ROOT / 'config/nav-v2-deployment-decision-package-v1.json',
    'runtime': ROOT / 'supabase/functions/nav-v2-deal-api/task-action-edge-runtime-v2.js',
    'identity': ROOT / 'supabase/functions/nav-v2-deal-api/task-action-edge-identity-v2.js',
    'validator': ROOT / 'supabase/functions/nav-v2-deal-api/task-action-contract-v2.js',
    'index': ROOT / 'supabase/functions/nav-v2-deal-api/index.ts',
    'actor_sql': ROOT / 'supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql',
    'matrix': ROOT / 'scripts/check-nav-v2-task-edge-runtime-integration.mjs',
    'parity': ROOT / 'scripts/check-nav-v2-task-edge-sql-parity.mjs',
    'doc': ROOT / 'docs/NAV_V2_TASK_EDGE_RUNTIME_INTEGRATION_V1_2026-07-21.md',
    'workflow': ROOT / '.github/workflows/nav-v2-task-edge-runtime-integration-v1.yml',
    'guard': ROOT / 'assets/js/nav-v2/task-action-guard-v2.js',
}
MIGRATIONS = ROOT / 'supabase/migrations'


def need(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    for label, path in FILES.items():
        if not path.exists():
            errors.append(f'missing {label}: {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    config = json.loads(FILES['config'].read_text(encoding='utf-8'))
    manifest = json.loads(FILES['manifest'].read_text(encoding='utf-8'))
    decision = json.loads(FILES['decision'].read_text(encoding='utf-8'))
    text = {label: path.read_text(encoding='utf-8') for label, path in FILES.items() if label not in ('config', 'manifest', 'decision')}

    if config.get('contract_version') != 1 or config.get('status') != 'repository_only_runtime_integration_disabled':
        errors.append('runtime integration contract metadata drifted')
    for key in ('production_applied', 'edge_deployed', 'feature_flag_default', 'frontend_transport_enabled', 'actor_aware_sql_deployed', 'service_role_key_browser_exposure_allowed'):
        if config.get(key) is not False:
            errors.append(f'{key} must remain false')
    if config.get('runtime_source_integrated') is not True or config.get('verify_jwt_required') is not True:
        errors.append('runtime source integration or JWT requirement missing')

    expected_actions = [
        'bounded_task_start', 'bounded_task_complete', 'bounded_task_active_outcome',
        'bounded_task_terminal_proposal', 'bounded_task_terminal_decision',
    ]
    if config.get('bounded_actions') != expected_actions:
        errors.append('bounded action inventory drifted')
    if config.get('identity_chain') != [
        'authorization_bearer_user_jwt', 'auth_v1_user_lookup', 'verified_auth_user_id',
        'active_nav_user_profile_lookup', 'contract_v2_task_context_lookup',
        'role_and_assignment_preflight', 'actor_aware_rpc_with_p_actor_id',
    ]:
        errors.append('identity chain drifted')

    role_policy = config.get('role_policy') or {}
    if role_policy.get('supervisors') != ['owner', 'admin', 'manager']:
        errors.append('supervisor role policy drifted')
    if role_policy.get('specialists') != ['spn', 'lawyer', 'broker']:
        errors.append('specialist role policy drifted')
    if role_policy.get('viewer_mutations_allowed') is not False:
        errors.append('viewer mutations must remain forbidden')
    broker = role_policy.get('broker') or {}
    if broker.get('task_type') != 'broker_task' or broker.get('allowed_sources') != ['intake_v1:mortgage', 'intake_v1:military_mortgage']:
        errors.append('broker mortgage-only policy drifted')

    if len(config.get('required_positive_scenarios') or []) != 4:
        errors.append('positive runtime scenario inventory drifted')
    if len(config.get('required_negative_scenarios') or []) < 11:
        errors.append('negative runtime scenario inventory is incomplete')
    for stop in ('feature_flag_disabled', 'actor_aware_sql_not_deployed', 'edge_not_deployed', 'frontend_transport_disabled', 'authenticated_e2e_not_proven', 'deployment_approval_missing'):
        if stop not in (config.get('active_stops') or []):
            errors.append(f'active stop missing: {stop}')
    for forbidden in ('service_role_key_in_frontend', 'service_role_key_in_response', 'service_role_key_in_log', 'client_supplied_actor_id', 'client_supplied_role', 'broker_non_mortgage_task', 'edge_deploy_from_repository_only_pr', 'enable_frontend_transport'):
        if forbidden not in (config.get('forbidden') or []):
            errors.append(f'forbidden runtime action missing: {forbidden}')

    need(text['runtime'], (
        "from './task-action-edge-identity-v2.js'",
        'routeBoundedTaskEdgeActionV2',
        "const SUPERVISOR_ROLES = new Set(['owner', 'admin', 'manager']);",
        "const SPECIALIST_ROLES = new Set(['spn', 'lawyer', 'broker']);",
        "const MORTGAGE_TASK_SOURCES = new Set(['intake_v1:mortgage', 'intake_v1:military_mortgage']);",
        "failed('feature_disabled'",
        "stage: 'runtime_rpc_executed'",
        "stage: 'broker_scope'",
        'task.task_contract_version !== 2',
        "actor_argument: 'p_actor_id'",
        'feature_flag_default: false',
        'edge_deployed: false',
        'frontend_transport_enabled: false',
    ), 'runtime adapter', errors)
    for forbidden in ('Deno.', 'fetch(', 'SUPABASE_SERVICE_ROLE_KEY', 'console.log', 'console.error'):
        if forbidden in text['runtime']:
            errors.append(f'runtime adapter contains forbidden transport/secret/log marker: {forbidden}')

    need(text['index'], (
        'import { routeBoundedTaskEdgeActionV2 } from "./task-action-edge-runtime-v2.js";',
        'const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;',
        'boundedActions.has(action as BoundedNavV2Action)',
        'profile_loader: loadActiveNavProfile',
        'task_loader: loadBoundedTaskContext',
        'rpc_client: { rpc: callServiceRpc }',
        'SUPABASE_SERVICE_ROLE_KEY',
        'select=id,role,is_active&limit=1',
        'select=id,assigned_to,assigned_role,task_type,source,task_contract_version&limit=1',
    ), 'Edge index', errors)
    if text['index'].count('const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;') != 1:
        errors.append('Edge feature flag count differs from one')
    if 'BOUNDED_TASK_EDGE_IDENTITY_ENABLED = true' in text['index']:
        errors.append('Edge feature flag was enabled')
    if re.search(r'jsonResponse\([^\n]*SUPABASE_SERVICE_ROLE_KEY', text['index']):
        errors.append('service role env appears in response path')
    if re.search(r'console\.(?:log|error|warn)\([^\n]*(?:serviceKey|SUPABASE_SERVICE_ROLE_KEY)', text['index']):
        errors.append('service role key appears in log path')

    need(text['identity'], (
        'FORBIDDEN_CLIENT_ACTOR_FIELDS',
        'const rpcArgs = { ...baseArgs, p_actor_id: actorId };',
        'actor_aware_sql_deployed: false',
    ), 'identity handler', errors)
    need(text['validator'], ('validateTaskEdgeAction', "action.startsWith('bounded_')"), 'action validator', errors)

    actor_signatures = re.findall(r'create\s+or\s+replace\s+function\s+public\.(nav_v2_[a-z0-9_]+)\s*\((.*?)\)\s*returns', text['actor_sql'], flags=re.I | re.S)
    actor_task_actions = []
    for name, arguments in actor_signatures:
        normalized = re.sub(r'\s+', ' ', arguments.lower())
        if 'p_actor_id uuid' in normalized and name != 'nav_v2_create_bounded_tasks':
            actor_task_actions.append(name.lower())
    if sorted(set(actor_task_actions)) != sorted([
        'nav_v2_start_bounded_task', 'nav_v2_complete_bounded_task',
        'nav_v2_set_bounded_task_active_outcome', 'nav_v2_propose_bounded_task_terminal_outcome',
        'nav_v2_decide_bounded_task_terminal_outcome',
    ]):
        errors.append('actor-aware SQL action signature inventory drifted')

    need(text['matrix'], (
        'spn_assigned_task', 'lawyer_assigned_task', 'broker_mortgage_task',
        'manager_supervisor_task', 'inactive_profile', 'viewer_mutation',
        'role_mismatch', 'assigned_other', 'broker_non_mortgage',
        'contract_v1', 'cross_actor_rpc_rejection',
        "calls.rpcArgs.args.p_actor_id, actor",
    ), 'runtime semantic matrix', errors)
    need(text['parity'], ('Edge-to-SQL parity passed', 'expected six actor-aware SQL overload definitions'), 'SQL parity checker', errors)
    need(text['guard'], ('const BOUNDED_TRANSPORT_ENABLED = false;',), 'frontend guard', errors)
    if 'SUPABASE_SERVICE_ROLE_KEY' in text['guard']:
        errors.append('service role env leaked into frontend guard')

    edge_layer = (manifest.get('layers') or [])[4]
    if manifest.get('edge_runtime_integrated') is not True or manifest.get('edge_runtime_enabled') is not False or manifest.get('edge_deployed') is not False:
        errors.append('preview manifest Edge state drifted')
    if edge_layer.get('mode') != 'source_integrated_feature_disabled' or edge_layer.get('edge_deploy_ready') is not False:
        errors.append('preview manifest Edge layer drifted')
    if decision.get('edge_runtime_source_integrated') is not True or decision.get('edge_runtime_enabled') is not False or decision.get('edge_deployed') is not False:
        errors.append('deployment decision Edge state drifted')
    if decision.get('deployment_bundle_ready') is not False:
        errors.append('deployment decision claims bundle readiness')

    for path in (ROOT / 'assets').rglob('*'):
        if path.is_file() and 'SUPABASE_SERVICE_ROLE_KEY' in path.read_text(encoding='utf-8', errors='ignore'):
            errors.append(f'service role env leaked into frontend asset: {path.relative_to(ROOT)}')
    leaked = [path.name for path in MIGRATIONS.glob('*edge*runtime*integration*')]
    if leaked:
        errors.append(f'Edge runtime integration leaked into migrations: {leaked}')

    need(text['doc'], (
        'repository-only Edge identity runtime integration',
        'Feature flag', 'Identity chain', 'Role policy', 'Broker scope',
        'Semantic matrix', 'Deployment gate', 'Rollback',
    ), 'runtime integration doc', errors)
    need(text['workflow'], (
        'check_nav_v2_task_edge_runtime_integration.py',
        'check-nav-v2-task-edge-runtime-integration.mjs',
        'check-nav-v2-task-edge-sql-parity.mjs',
        'check-nav-v2-task-edge-identity.mjs',
        'node --check supabase/functions/nav-v2-deal-api/task-action-edge-runtime-v2.js',
        'BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false',
    ), 'runtime integration workflow', errors)

    if errors:
        print('Navigator v2 task Edge runtime integration errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 task Edge runtime integration source contract passed: verified actor route is integrated behind a disabled feature flag while SQL, deployment and frontend transport remain disabled')
    return 0


if __name__ == '__main__':
    sys.exit(main())
