from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'contract': ROOT / 'config/nav-v2-bounded-task-actor-aware-contract.json',
    'base': ROOT / 'supabase/prototypes/nav_v2_bounded_task_contract.sql',
    'canonical': ROOT / 'supabase/prototypes/nav_v2_bounded_task_mutations.sql',
    'overlay': ROOT / 'supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql',
    'edge': ROOT / 'supabase/functions/nav-v2-deal-api/task-action-edge-identity-v2.js',
    'edge_index': ROOT / 'supabase/functions/nav-v2-deal-api/index.ts',
    'assertions': ROOT / 'tests/sql/nav_v2_bounded_task_actor_aware_assertions.sql',
    'rollback': ROOT / 'tests/sql/nav_v2_bounded_task_actor_aware_rollback.sql',
    'rollback_assertions': ROOT / 'tests/sql/nav_v2_bounded_task_actor_aware_rollback_assertions.sql',
    'doc': ROOT / 'docs/NAV_V2_BOUNDED_TASK_ACTOR_AWARE_SQL_2026-07-17.md',
    'workflow': ROOT / '.github/workflows/nav-v2-bounded-task-actor-aware.yml',
}


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
        print('\n'.join(errors)); return 1

    text = {label: path.read_text(encoding='utf-8') for label, path in FILES.items() if label != 'contract'}
    contract = json.loads(FILES['contract'].read_text(encoding='utf-8'))

    if contract.get('schema_version') != 1 or contract.get('status') != 'repository_only_actor_aware_sql_prototype':
        errors.append('actor-aware contract metadata drifted')
    for key in ('production_applied','migration_file_created','runtime_integrated','edge_deployed','transport_enabled','deployment_ready','production_database_changed'):
        if contract.get(key) is not False: errors.append(f'{key} must remain false')
    for key in ('actor_verified_outside_client_payload','active_profile_required','same_actor_replay','cross_actor_replay_rejected','claim_restored_on_success','claim_restored_on_error','audit_actor_preserved','canonical_signatures_preserved','edge_rpc_names_unchanged','edge_appends_actor_argument','canonical_regression_required','overlay_rollback_required'):
        if contract.get(key) is not True: errors.append(f'{key} must remain true')
    if contract.get('actor_argument') != 'p_actor_id' or contract.get('execute_roles') != ['service_role']:
        errors.append('actor argument or execute-role policy drifted')
    if set(contract.get('forbidden_execute_roles') or []) != {'public','anon','authenticated'}:
        errors.append('forbidden execute-role policy drifted')
    if contract.get('service_role_auth_uid_assumed') is not False:
        errors.append('service role auth.uid must not be assumed')

    overlay = text['overlay']
    need(overlay, (
        'REPOSITORY-ONLY ACTOR-AWARE OVERLAY',
        'nav_v2_require_verified_actor',
        'nav_v2_assert_actor_replay',
        'client_request_id принадлежит другому verified actor',
        'nav_v2_actor_claim_restore',
        "set_config('request.jwt.claim.sub'",
        "jsonb_build_object('verified_actor_id', v_actor_id, 'actor_aware', true)",
        'from public, anon, authenticated',
        'to service_role',
    ), 'overlay', errors)
    uncommented = re.sub(r'(?m)^\s*--.*$', '', overlay)
    if 'auth.uid()' in uncommented: errors.append('overlay must not source actor from auth.uid()')
    if overlay.count("set_config('request.jwt.claim.sub', v_actor_id::text, true)") != 6:
        errors.append('expected six verified-actor claim injections')
    if overlay.count('perform nav_v2_private.nav_v2_assert_actor_replay(') != 6:
        errors.append('expected six actor-bound replay checks')
    if overlay.count('nav_v2_actor_claim_restore(v_previous_sub)') != 12:
        errors.append('expected success/error claim restoration for six wrappers')

    signatures = contract.get('actor_aware_overloads') or []
    if len(signatures) != 6: errors.append('six actor-aware overloads required')
    compact = re.sub(r'\s+', '', overlay.lower())
    for signature in signatures:
        function_name = signature.split('(', 1)[0]
        full = f'public.{signature}'.lower().replace(' ', '')
        if overlay.lower().count(f'create or replace function public.{function_name.lower()}(') != 1:
            errors.append(f'missing actor-aware definition {signature}')
        if f'revokeexecuteonfunction{full}frompublic,anon,authenticated' not in compact:
            errors.append(f'missing revoke {signature}')
        if f'grantexecuteonfunction{full}toservice_role' not in compact:
            errors.append(f'missing service grant {signature}')

    need(text['canonical'], ('v_uid uuid := auth.uid();','nav_v2_bounded_task_replay','to service_role'), 'canonical', errors)
    need(text['edge'], ('const rpcArgs = { ...baseArgs, p_actor_id: actorId };','target_sql_signature_ready: true','actor_aware_sql_prototype_ready: true','actor_aware_sql_deployed: false','runtime_integrated: false'), 'edge', errors)
    if 'task-action-edge-identity-v2.js' in text['edge_index']: errors.append('Edge identity module imported prematurely')

    need(text['assertions'], ('same-actor replay contract mismatch','принадлежит другому verified actor','created_by did not preserve verified actor','actor-aware completion state mismatch','actor-aware active outcome state mismatch','actor-aware terminal decision state mismatch','PostgreSQL actor-aware bounded task lifecycle assertions passed'), 'assertions', errors)
    need(text['rollback'], ('drop function if exists public.nav_v2_create_bounded_tasks(uuid, jsonb, uuid, uuid)','drop function if exists nav_v2_private.nav_v2_require_verified_actor(uuid)'), 'rollback', errors)
    need(text['rollback_assertions'], ('actor-aware overload remains after overlay rollback','canonical governed RPC was removed by actor-aware rollback','PostgreSQL actor-aware bounded task rollback assertions passed'), 'rollback assertions', errors)
    need(text['doc'], ('repository-only actor-aware SQL prototype','Identity contract','Overload strategy','Replay binding','Claim hygiene','PostgreSQL 17 regression','Edge mapping','Production gate','Rollback'), 'doc', errors)
    need(text['workflow'], ('postgres:17','check_nav_v2_bounded_task_actor_aware.py','nav_v2_bounded_task_actor_aware_mutations.sql','nav_v2_bounded_task_mutation_assertions.sql','nav_v2_bounded_task_actor_aware_assertions.sql','nav_v2_bounded_task_actor_aware_rollback.sql','nav_v2_bounded_task_actor_aware_rollback_assertions.sql','nav-v2-bounded-task-actor-aware'), 'workflow', errors)
    if not contract.get('remaining_blockers'): errors.append('deployment blockers must remain explicit')

    if errors:
        print('Navigator v2 actor-aware bounded task errors:')
        for error in errors: print(f'- {error}')
        return 1
    print('Navigator v2 actor-aware bounded task contract passed: verified actor overloads preserve canonical lifecycle, replay, audit and rollback while production remains unchanged')
    return 0


if __name__ == '__main__':
    sys.exit(main())
