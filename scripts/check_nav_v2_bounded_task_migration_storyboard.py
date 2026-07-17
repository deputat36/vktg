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
ACTOR_OVERLAY = ROOT / 'supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql'
ACTOR_CONTRACT = ROOT / 'config/nav-v2-bounded-task-actor-aware-contract.json'
DTO_BASE = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql'
DTO_OVERLAY = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql'
READINESS = ROOT / 'config/nav-v2-bounded-task-deployment-readiness.json'
DOC = ROOT / 'docs/NAV_V2_BOUNDED_TASK_MIGRATION_STORYBOARD_2026-07-17.md'
ADDENDUM = ROOT / 'docs/NAV_V2_BOUNDED_TASK_IDENTITY_STORYBOARD_ADDENDUM_2026-07-17.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-bounded-task-migration-storyboard.yml'


def need(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def clean_sql(text: str) -> str:
    text = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('--') or stripped.startswith('\\'):
            continue
        lines.append(re.sub(r'--.*$', '', line))
    return '\n'.join(lines)


def main() -> int:
    errors: list[str] = []
    paths = (STORYBOARD, ATTESTATION, OBJECT_DIFF, PREFLIGHT, BASE, MUTATIONS,
             ACTOR_OVERLAY, ACTOR_CONTRACT, DTO_BASE, DTO_OVERLAY, READINESS,
             DOC, ADDENDUM, WORKFLOW)
    for path in paths:
        if not path.exists(): errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors)); return 1

    storyboard = json.loads(STORYBOARD.read_text(encoding='utf-8'))
    attestation = json.loads(ATTESTATION.read_text(encoding='utf-8'))
    object_diff = json.loads(OBJECT_DIFF.read_text(encoding='utf-8'))
    actor_contract = json.loads(ACTOR_CONTRACT.read_text(encoding='utf-8'))
    readiness = json.loads(READINESS.read_text(encoding='utf-8'))
    base = BASE.read_text(encoding='utf-8')
    mutations = MUTATIONS.read_text(encoding='utf-8')
    actor_overlay = ACTOR_OVERLAY.read_text(encoding='utf-8')
    dto_base = DTO_BASE.read_text(encoding='utf-8')
    dto_overlay = DTO_OVERLAY.read_text(encoding='utf-8')
    preflight = PREFLIGHT.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    addendum = ADDENDUM.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    if storyboard.get('schema_version') != 2 or storyboard.get('status') != 'repository_only_storyboard_not_a_migration':
        errors.append('storyboard v2 metadata drifted')
    for key in ('migration_file_created','production_applied','supabase_branch_created','edge_deployed','bounded_transport_enabled','deployment_ready','owner_migration_approval','authenticated_e2e_proven','identity_propagation_proven'):
        if storyboard.get(key) is not False: errors.append(f'storyboard must keep {key}=false')
    if storyboard.get('actor_aware_sql_contract_ready') is not True or storyboard.get('actor_aware_postgres_regression_green') is not True:
        errors.append('actor-aware repository gates must be green')
    if storyboard.get('actor_aware_prototype_merge') != '5d63d490ad8f210e10cea59e0f9f14863e72b0de':
        errors.append('actor-aware prototype merge drifted')
    if storyboard.get('cost_gate_issue') != 282:
        errors.append('Issue #282 cost gate missing')
    if storyboard.get('future_migration_placeholder') != 'YYYYMMDDHHMMSS_nav_v2_bounded_task_contract_and_runtime.sql':
        errors.append('migration placeholder drifted')

    phases = storyboard.get('phases') or []
    phase_ids = ['preflight','additive_schema','governed_mutations','actor_aware_identity_overlay','legacy_rpc_transition','dto_baseline','dto_bounded_overlay','database_verification','edge_integration','frontend_transport']
    if [item.get('id') for item in phases] != phase_ids or [item.get('order') for item in phases] != list(range(10)):
        errors.append('storyboard phase order drifted')
    if phases[0].get('mode') != 'read_only' or phases[0].get('writes') is not False:
        errors.append('preflight must remain read-only')
    actor_phase = next((item for item in phases if item.get('id') == 'actor_aware_identity_overlay'), {})
    if actor_phase.get('prototype') != 'supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql' or actor_phase.get('postgres_regression_proof') != 'PR #389':
        errors.append('actor-aware phase drifted')
    for phase_id in ('edge_integration','frontend_transport'):
        if next((item for item in phases if item.get('id') == phase_id), {}).get('deferred') is not True:
            errors.append(f'{phase_id} must remain deferred')

    cleared = set(storyboard.get('cleared_repository_gates') or [])
    for marker in ('PR #384 bounded deployment readiness dry-run','PR #387 identity propagation gate','PR #389 actor-aware PostgreSQL 17 regression'):
        if marker not in cleared: errors.append(f'cleared repository gate missing: {marker}')
    if len(storyboard.get('stop_conditions') or []) < 10:
        errors.append('future production STOP list is incomplete')
    go = storyboard.get('go_conditions') or {}
    if go.get('repository_storyboard_only') is not True or go.get('production_migration') is not False:
        errors.append('GO decision must remain repository-only')
    rollback = storyboard.get('rollback_order') or []
    if [item.get('order') for item in rollback] != [1,2,3,4]:
        errors.append('rollback order must include DTO, actor overlay, canonical mutation and base')
    if 'PR #389' not in str(rollback[1].get('proof')):
        errors.append('actor-aware rollback must reference PR #389')
    if not all('PR #384' in str(rollback[i].get('proof')) for i in (0,2,3)):
        errors.append('canonical rollback phases must reference PR #384')

    if attestation.get('schema_version') != 2 or attestation.get('source') != 'read_only_production_query' or attestation.get('project_ref') != 'ofewxuqfjhamgerwzull':
        errors.append('production attestation v2 metadata drifted')
    structural = attestation.get('structural_baseline') or {}
    expected_columns = ['id','deal_id','title','description','assigned_to','assigned_role','status','priority','due_date','source','completed_by','completed_at','created_by','created_at','updated_at','task_type','sla_days']
    if structural.get('task_columns') != expected_columns: errors.append('attested legacy columns drifted')
    if any(value is not True for value in (structural.get('bounded_objects_absent') or {}).values()):
        errors.append('production bounded and actor-aware objects must remain absent')
    if (attestation.get('interpretation') or {}).get('production_write_performed') is not False:
        errors.append('production attestation must remain read-only')

    if object_diff.get('schema_version') != 2 or object_diff.get('status') != 'future_migration_object_diff_only':
        errors.append('object diff v2 metadata drifted')
    if object_diff.get('production_applied') is not False or object_diff.get('data_backfill') is not False:
        errors.append('object diff must remain no-production/no-backfill')
    objects = object_diff.get('objects') or {}
    columns = objects.get('alter_table_additive_columns') or {}
    combined = base + '\n' + mutations
    for column in (columns.get('base_contract_columns') or []) + (columns.get('mutation_overlay_columns') or []):
        if column not in combined: errors.append(f'object diff column missing: {column}')
    for constraint in (objects.get('constraints') or {}).get('add_not_valid') or []:
        if constraint not in combined: errors.append(f'object diff constraint missing: {constraint}')
    if (objects.get('constraints') or {}).get('validate_existing_rows_during_initial_migration') is not False:
        errors.append('initial constraints must remain NOT VALID')
    if (objects.get('new_table') or {}).get('name') != 'public.nav_deal_task_mutation_events_v2':
        errors.append('event table object diff drifted')

    for signature in objects.get('public_governed_rpcs') or []:
        if f"create or replace function {signature.split('(')[0]}" not in mutations:
            errors.append(f'canonical governed RPC missing: {signature}')
    compact_actor = re.sub(r'\s+', '', actor_overlay.lower())
    actor_overloads = objects.get('actor_aware_overloads') or []
    if len(actor_overloads) != 6: errors.append('object diff must list six actor-aware overloads')
    for signature in actor_overloads:
        name = signature.split('(')[0]
        compact_signature = signature.lower().replace(' ', '')
        if actor_overlay.lower().count(f'create or replace function {name.lower()}(') != 1:
            errors.append(f'actor-aware overload missing: {signature}')
        if f'grantexecuteonfunction{compact_signature}toservice_role' not in compact_actor:
            errors.append(f'actor-aware grant missing: {signature}')
    helpers = (objects.get('private_functions') or {}).get('actor_aware_helpers') or []
    if len(helpers) != 3: errors.append('object diff must list three actor-aware helpers')
    for helper in helpers:
        if helper.split('(')[0] not in actor_overlay: errors.append(f'actor helper missing: {helper}')

    actor_grants = (object_diff.get('grant_diff') or {}).get('actor_aware_overloads') or {}
    if actor_grants.get('grant') != ['service_role'] or set(actor_grants.get('revoke') or []) != {'public','anon','authenticated'}:
        errors.append('actor-aware grant diff drifted')
    if actor_grants.get('actor_argument') != 'p_actor_id' or actor_grants.get('client_payload_actor_forbidden') is not True:
        errors.append('actor-aware identity boundary drifted')
    proofs = object_diff.get('repository_proofs') or {}
    if set(proofs.values()) != {'PR #384','PR #387','PR #389'}:
        errors.append('repository proof inventory drifted')

    if actor_contract.get('status') != 'repository_only_actor_aware_sql_prototype' or actor_contract.get('production_applied') is not False:
        errors.append('PR #389 actor-aware contract missing')
    need(dto_base, ('nav_v2_get_deal_card_lite',), 'DTO base', errors)
    need(dto_overlay, ("'dto_version', 2", "'task_contract_aware', true"), 'DTO overlay', errors)
    if readiness.get('status') != 'repository_only_deployment_readiness_dry_run' or readiness.get('deployment_ready') is not False:
        errors.append('PR #384 readiness proof missing')

    normalized = clean_sql(preflight)
    forbidden = re.search(r'(?i)\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|comment|vacuum|analyze|refresh|call|do|copy|lock)\b', normalized)
    if forbidden: errors.append(f'read-only preflight contains forbidden keyword: {forbidden.group(1)}')
    for statement in [part.strip() for part in normalized.split(';') if part.strip()]:
        if not re.match(r'(?is)^(select|with)\b', statement): errors.append('preflight contains non-select statement')
    need(preflight, ('assert_postgres_major_17','assert_exact_legacy_task_columns','assert_no_partial_bounded_deployment','nav_v2_require_verified_actor(uuid)','Navigator v2 bounded migration read-only preflight passed'), 'preflight', errors)

    need(doc, ('repository-only storyboard, not a migration','Production attestation','Object diff','Migration phases','STOP conditions','Staged rollback','Issue #282'), 'storyboard doc', errors)
    need(addendum, ('PR #389','actor-aware SQL','Production boundary','Issue #282','Rollback'), 'identity addendum', errors)
    need(workflow, ('git diff --name-only','supabase/migrations/','check_nav_v2_bounded_task_migration_storyboard.py','nav_v2_bounded_task_actor_aware_mutations.sql','postgres:17','TRANSACTION READ ONLY','nav-v2-bounded-task-migration-storyboard'), 'workflow', errors)

    if errors:
        print('Navigator v2 bounded migration storyboard errors:')
        for error in errors: print(f'- {error}')
        return 1
    print('Navigator v2 bounded migration storyboard v2 passed: actor-aware objects and rollback are inventoried, repository proofs are green, production preflight stays read-only and deployment remains blocked')
    return 0


if __name__ == '__main__':
    sys.exit(main())
