from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORYBOARD = ROOT / 'config/nav-v2-bounded-task-migration-storyboard.json'
ATTESTATION = ROOT / 'config/nav-v2-bounded-task-production-preflight-attestation.json'
OBJECT_DIFF = ROOT / 'fixtures/nav-v2-bounded-task-migration-object-diff.json'
PREFLIGHT = ROOT / 'tests/sql/nav_v2_bounded_task_production_preflight_read_only.sql'
BASE = ROOT / 'supabase/prototypes/nav_v2_bounded_task_contract.sql'
MUTATIONS = ROOT / 'supabase/prototypes/nav_v2_bounded_task_mutations.sql'
DTO_BASE = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql'
DTO_OVERLAY = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql'
READINESS = ROOT / 'config/nav-v2-bounded-task-deployment-readiness.json'
DOC = ROOT / 'docs/NAV_V2_BOUNDED_TASK_MIGRATION_STORYBOARD_2026-07-17.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-bounded-task-migration-storyboard.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def normalized_sql_without_comments(text: str) -> str:
    no_block = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
    lines = []
    for line in no_block.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('--') or stripped.startswith('\\'):
            continue
        lines.append(re.sub(r'--.*$', '', line))
    return '\n'.join(lines)


def main() -> int:
    errors: list[str] = []
    paths = (
        STORYBOARD, ATTESTATION, OBJECT_DIFF, PREFLIGHT, BASE, MUTATIONS,
        DTO_BASE, DTO_OVERLAY, READINESS, DOC, WORKFLOW,
    )
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    storyboard = json.loads(STORYBOARD.read_text(encoding='utf-8'))
    attestation = json.loads(ATTESTATION.read_text(encoding='utf-8'))
    object_diff = json.loads(OBJECT_DIFF.read_text(encoding='utf-8'))
    readiness = json.loads(READINESS.read_text(encoding='utf-8'))
    preflight = PREFLIGHT.read_text(encoding='utf-8')
    base = BASE.read_text(encoding='utf-8')
    mutations = MUTATIONS.read_text(encoding='utf-8')
    dto_base = DTO_BASE.read_text(encoding='utf-8')
    dto_overlay = DTO_OVERLAY.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    if storyboard.get('schema_version') != 1:
        errors.append('storyboard schema must be 1')
    if storyboard.get('status') != 'repository_only_storyboard_not_a_migration':
        errors.append('storyboard status drifted')
    for key in (
        'migration_file_created', 'production_applied', 'supabase_branch_created',
        'edge_deployed', 'bounded_transport_enabled', 'deployment_ready',
        'owner_migration_approval', 'authenticated_e2e_proven',
    ):
        if storyboard.get(key) is not False:
            errors.append(f'storyboard must keep {key}=false')
    if storyboard.get('cost_gate_issue') != 282:
        errors.append('Issue #282 cost gate must remain explicit')
    placeholder = storyboard.get('future_migration_placeholder', '')
    if not re.fullmatch(r'YYYYMMDDHHMMSS_nav_v2_bounded_task_contract_and_runtime\.sql', placeholder):
        errors.append('future migration placeholder drifted')
    if 'supabase/migrations' in placeholder:
        errors.append('placeholder must not create a migration path')

    phases = storyboard.get('phases') or []
    expected_phase_ids = [
        'preflight', 'additive_schema', 'governed_mutations', 'legacy_rpc_transition',
        'dto_baseline', 'dto_bounded_overlay', 'database_verification',
        'edge_integration', 'frontend_transport',
    ]
    if [phase.get('id') for phase in phases] != expected_phase_ids:
        errors.append('storyboard phase order drifted')
    if [phase.get('order') for phase in phases] != list(range(9)):
        errors.append('storyboard numeric phase order drifted')
    if phases[0].get('mode') != 'read_only' or phases[0].get('writes') is not False:
        errors.append('preflight phase must remain read-only')
    for phase_id in ('edge_integration', 'frontend_transport'):
        phase = next((item for item in phases if item.get('id') == phase_id), {})
        if phase.get('deferred') is not True:
            errors.append(f'{phase_id} must remain deferred')

    if len(storyboard.get('stop_conditions') or []) < 10:
        errors.append('storyboard requires at least ten explicit stop conditions')
    go = storyboard.get('go_conditions') or {}
    if go.get('repository_storyboard_only') is not True or go.get('production_migration') is not False:
        errors.append('GO decision must allow storyboard only, not production migration')
    if len(storyboard.get('post_apply_verification') or []) < 10:
        errors.append('post-apply verification checklist is incomplete')
    rollback = storyboard.get('rollback_order') or []
    if [item.get('order') for item in rollback] != [1, 2, 3]:
        errors.append('rollback order must remain DTO, mutation, base')
    if not all('PR #384' in str(item.get('proof')) for item in rollback):
        errors.append('every rollback phase must reference PR #384 proof')
    forbidden_actions = set(storyboard.get('forbidden_actions') or [])
    for expected in (
        'create file under supabase/migrations', 'apply production SQL',
        'create Supabase branch', 'deploy Edge Function',
        'enable bounded transport', 'mass backfill legacy tasks',
    ):
        if expected not in forbidden_actions:
            errors.append(f'forbidden action missing: {expected}')

    if attestation.get('schema_version') != 1 or attestation.get('source') != 'read_only_production_query':
        errors.append('production attestation metadata drifted')
    if attestation.get('project_ref') != 'ofewxuqfjhamgerwzull':
        errors.append('production project ref drifted')
    if attestation.get('project_status') != 'ACTIVE_HEALTHY' or attestation.get('postgres_version') != '17.6':
        errors.append('production health/version attestation drifted')
    structural = attestation.get('structural_baseline') or {}
    expected_columns = [
        'id','deal_id','title','description','assigned_to','assigned_role','status','priority',
        'due_date','source','completed_by','completed_at','created_by','created_at','updated_at',
        'task_type','sla_days',
    ]
    expected_constraints = [
        'nav_deal_tasks_v2_assigned_to_fkey', 'nav_deal_tasks_v2_completed_by_fkey',
        'nav_deal_tasks_v2_created_by_fkey', 'nav_deal_tasks_v2_deal_id_fkey',
        'nav_deal_tasks_v2_pkey', 'nav_deal_tasks_v2_sla_days_check',
        'nav_deal_tasks_v2_task_type_check',
    ]
    if structural.get('task_columns') != expected_columns:
        errors.append('attested legacy task columns drifted')
    if structural.get('task_constraints') != expected_constraints:
        errors.append('attested legacy task constraints drifted')
    if set(structural.get('legacy_rpc_signatures') or []) != {
        'public.nav_v2_add_task(uuid,text,text,public.nav_v2_user_role,public.nav_v2_task_priority,text)',
        'public.nav_v2_update_task_status(uuid,public.nav_v2_task_status)',
        'public.nav_v2_get_deal_card_lite(uuid)',
    }:
        errors.append('attested legacy RPC signatures drifted')
    if any(value is not True for value in (structural.get('bounded_objects_absent') or {}).values()):
        errors.append('bounded objects must be attested absent')
    if (attestation.get('informational_counts') or {}).get('strict_gate') is not False:
        errors.append('live counts must remain informational')
    interpretation = attestation.get('interpretation') or {}
    if interpretation.get('structural_drift_is_stop') is not True or interpretation.get('count_drift_is_informational') is not True:
        errors.append('structural/count interpretation drifted')
    if interpretation.get('production_write_performed') is not False:
        errors.append('production attestation must remain read-only')

    if object_diff.get('status') != 'future_migration_object_diff_only':
        errors.append('object diff status drifted')
    if object_diff.get('production_applied') is not False or object_diff.get('data_backfill') is not False:
        errors.append('object diff must remain non-production and no-backfill')
    objects = object_diff.get('objects') or {}
    columns = objects.get('alter_table_additive_columns') or {}
    if columns.get('nullable_for_legacy_rows') is not True or columns.get('existing_rows_updated') is not False:
        errors.append('bounded columns must remain nullable/no-update for legacy rows')
    combined_sql = base + '\n' + mutations
    for column in (columns.get('base_contract_columns') or []) + (columns.get('mutation_overlay_columns') or []):
        if column not in combined_sql:
            errors.append(f'object diff column missing from prototypes: {column}')
    constraints = (objects.get('constraints') or {}).get('add_not_valid') or []
    for constraint in constraints:
        if constraint not in combined_sql:
            errors.append(f'object diff constraint missing from prototypes: {constraint}')
    if (objects.get('constraints') or {}).get('validate_existing_rows_during_initial_migration') is not False:
        errors.append('initial bounded constraints must not validate existing rows')
    table = objects.get('new_table') or {}
    if table.get('name') != 'public.nav_deal_task_mutation_events_v2' or table.get('rls_enabled') is not True:
        errors.append('mutation event table object diff drifted')
    require(mutations, (
        'create table if not exists public.nav_deal_task_mutation_events_v2',
        'alter table public.nav_deal_task_mutation_events_v2 enable row level security',
        'client_request_id uuid not null unique',
    ), MUTATIONS.name, errors)
    for signature in objects.get('public_governed_rpcs') or []:
        function_name = signature.split('(')[0]
        if f'create or replace function {function_name}' not in mutations:
            errors.append(f'governed RPC missing from mutation prototype: {signature}')
    for signature in objects.get('replaced_legacy_rpcs') or []:
        function_name = signature.split('(')[0]
        if f'create or replace function {function_name}' not in mutations:
            errors.append(f'legacy RPC replacement missing: {signature}')
    if objects.get('replaced_dto_rpc') != 'public.nav_v2_get_deal_card_lite(uuid)':
        errors.append('DTO replacement signature drifted')
    require(dto_base, ('nav_v2_get_deal_card_lite',), DTO_BASE.name, errors)
    require(dto_overlay, ("'dto_version', 2", "'task_contract_aware', true"), DTO_OVERLAY.name, errors)

    grant_diff = object_diff.get('grant_diff') or {}
    governed = grant_diff.get('governed_rpcs') or {}
    if governed.get('grant') != ['service_role'] or set(governed.get('revoke') or []) != {'public','anon','authenticated'}:
        errors.append('governed grant diff drifted')
    legacy_transition = grant_diff.get('legacy_rpcs_transition') or {}
    if legacy_transition.get('current_authenticated_execute') is not True:
        errors.append('legacy current authenticated grant fact drifted')
    if legacy_transition.get('requires_edge_and_frontend_cutover_plan') is not True:
        errors.append('legacy grant transition must require cutover plan')
    require(mutations, (
        'from public, anon, authenticated',
        'to service_role',
        'no authenticated EXECUTE until a separate deployment migration',
    ), MUTATIONS.name, errors)

    clean_sql = normalized_sql_without_comments(preflight)
    forbidden_sql = re.compile(
        r'(?i)\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|comment|vacuum|analyze|refresh|call|do|copy|lock)\b'
    )
    match = forbidden_sql.search(clean_sql)
    if match:
        errors.append(f'read-only preflight contains forbidden SQL keyword: {match.group(1)}')
    statements = [statement.strip() for statement in clean_sql.split(';') if statement.strip()]
    for statement in statements:
        if not re.match(r'(?is)^(select|with)\b', statement):
            errors.append(f'preflight statement is not SELECT/WITH: {statement[:80]!r}')
    require(preflight, (
        'assert_postgres_major_17', 'assert_exact_legacy_task_columns',
        'assert_exact_legacy_task_constraints', 'assert_legacy_rpc_signatures_exist',
        'assert_attested_legacy_authenticated_grants', 'assert_no_partial_bounded_deployment',
        'counts_are_strict_gate', 'structural_drift_is_stop',
        'Navigator v2 bounded migration read-only preflight passed',
    ), PREFLIGHT.name, errors)

    if readiness.get('status') != 'repository_only_deployment_readiness_dry_run' or readiness.get('deployment_ready') is not False:
        errors.append('PR #384 deployment readiness proof is missing or drifted')
    if readiness.get('production_applied') is not False:
        errors.append('deployment readiness proof must remain non-production')

    require(doc, (
        'repository-only storyboard, not a migration', 'Production attestation',
        'Read-only preflight', 'Object diff', 'Migration phases', 'Grant policy',
        'STOP conditions', 'GO decisions', 'Post-apply verification',
        'Staged rollback', 'Что storyboard запрещает', 'Production boundary',
        'Issue #282', 'Rollback storyboard PR',
    ), DOC.name, errors)
    require(workflow, (
        'git diff --name-only', 'supabase/migrations/',
        'python3 scripts/check_nav_v2_bounded_task_migration_storyboard.py',
        'python3 -m py_compile scripts/check_nav_v2_bounded_task_migration_storyboard.py',
        'postgres:17', 'BEGIN TRANSACTION READ ONLY',
        'nav_v2_bounded_task_production_preflight_read_only.sql',
        'cmp preflight-before.json preflight-after.json',
        'nav-v2-bounded-task-migration-storyboard',
    ), WORKFLOW.name, errors)

    combined_artifacts = '\n'.join((
        json.dumps(storyboard, ensure_ascii=False),
        json.dumps(object_diff, ensure_ascii=False), doc, workflow,
    ))
    for forbidden in (
        'Supabase.apply_migration', 'Supabase.create_branch', 'supabase db push',
        'supabase migration up', 'deploy_edge_function',
    ):
        if forbidden in combined_artifacts:
            errors.append(f'storyboard contains forbidden apply marker: {forbidden}')

    if errors:
        print('Navigator v2 bounded task migration storyboard errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 bounded task migration storyboard passed: production attestation, read-only preflight, phased object/grant diff, stop-go decisions and PR #384 rollback proof remain repository-only with no migration artifact')
    return 0


if __name__ == '__main__':
    sys.exit(main())
