from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'config/nav-v2-bounded-task-deployment-readiness.json'
BASE = ROOT / 'supabase/prototypes/nav_v2_bounded_task_contract.sql'
MUTATIONS = ROOT / 'supabase/prototypes/nav_v2_bounded_task_mutations.sql'
DTO_BASE = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql'
DTO_OVERLAY = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql'
SETUP = ROOT / 'tests/sql/nav_v2_bounded_task_mutation_setup.sql'
LITE_SETUP = ROOT / 'tests/sql/nav_v2_deal_card_lite_bounded_setup.sql'
SNAPSHOT = ROOT / 'tests/sql/nav_v2_bounded_task_deployment_snapshot.sql'
MUTATION_ASSERTIONS = ROOT / 'tests/sql/nav_v2_bounded_task_mutation_assertions.sql'
DTO_ASSERTIONS = ROOT / 'tests/sql/nav_v2_deal_card_lite_bounded_assertions.sql'
READINESS_ASSERTIONS = ROOT / 'tests/sql/nav_v2_bounded_task_deployment_readiness_assertions.sql'
DTO_ROLLBACK = ROOT / 'tests/sql/nav_v2_deal_card_lite_bounded_rollback.sql'
MUTATION_ROLLBACK = ROOT / 'tests/sql/nav_v2_bounded_task_mutation_rollback.sql'
BASE_ROLLBACK = ROOT / 'tests/sql/nav_v2_bounded_task_base_rollback.sql'
BASE_ROLLBACK_ASSERTIONS = ROOT / 'tests/sql/nav_v2_bounded_task_base_rollback_assertions.sql'
FINAL_ASSERTIONS = ROOT / 'tests/sql/nav_v2_bounded_task_deployment_final_assertions.sql'
DOC = ROOT / 'docs/NAV_V2_BOUNDED_TASK_DEPLOYMENT_READINESS_2026-07-17.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-bounded-task-deployment-readiness.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def ordered(text: str, markers: list[str], label: str, errors: list[str]) -> None:
    positions = [text.find(marker) for marker in markers]
    if any(position < 0 for position in positions):
        missing = [marker for marker, position in zip(markers, positions) if position < 0]
        errors.append(f'{label}: missing ordered markers {missing}')
    elif positions != sorted(positions):
        errors.append(f'{label}: order drifted for {markers}')


def main() -> int:
    errors: list[str] = []
    paths = (
        MANIFEST, BASE, MUTATIONS, DTO_BASE, DTO_OVERLAY, SETUP, LITE_SETUP, SNAPSHOT,
        MUTATION_ASSERTIONS, DTO_ASSERTIONS, READINESS_ASSERTIONS, DTO_ROLLBACK,
        MUTATION_ROLLBACK, BASE_ROLLBACK, BASE_ROLLBACK_ASSERTIONS, FINAL_ASSERTIONS,
        DOC, WORKFLOW,
    )
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    read = lambda path: path.read_text(encoding='utf-8')
    base, mutations = read(BASE), read(MUTATIONS)
    dto_base, dto_overlay = read(DTO_BASE), read(DTO_OVERLAY)
    snapshot = read(SNAPSHOT)
    readiness = read(READINESS_ASSERTIONS)
    base_rollback = read(BASE_ROLLBACK)
    base_rollback_assertions = read(BASE_ROLLBACK_ASSERTIONS)
    final_assertions = read(FINAL_ASSERTIONS)
    doc, workflow = read(DOC), read(WORKFLOW)

    if manifest.get('schema_version') != 1:
        errors.append('deployment readiness manifest schema must be 1')
    if manifest.get('status') != 'repository_only_deployment_readiness_dry_run':
        errors.append('deployment readiness status drifted')
    for key in (
        'production_applied', 'supabase_branch_created', 'production_migration_created',
        'edge_deployed', 'authenticated_e2e_proven', 'deployment_ready',
    ):
        if manifest.get(key) is not False:
            errors.append(f'manifest must keep {key}=false')
    if manifest.get('cost_gate_issue') != 282:
        errors.append('Issue #282 cost gate must remain explicit')
    if manifest.get('postgres_version') != 17:
        errors.append('deployment dry-run must target PostgreSQL 17')

    expected_apply = [
        'supabase/prototypes/nav_v2_bounded_task_contract.sql',
        'supabase/prototypes/nav_v2_bounded_task_mutations.sql',
        'supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql',
        'supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql',
    ]
    if manifest.get('apply_order') != expected_apply:
        errors.append(f'apply order drifted: {manifest.get("apply_order")}')
    if any('/migrations/' in path or path.startswith('supabase/migrations') for path in manifest.get('apply_order') or []):
        errors.append('deployment readiness bundle must not reference production migrations')

    grant_policy = manifest.get('grant_policy') or {}
    if grant_policy.get('governed_rpc_execute_roles') != ['service_role']:
        errors.append('governed RPC must remain service_role-only')
    if set(grant_policy.get('forbidden_governed_rpc_roles') or []) != {'public', 'anon', 'authenticated'}:
        errors.append('forbidden governed RPC roles drifted')
    if grant_policy.get('authenticated_execute_deferred') is not True:
        errors.append('authenticated governed EXECUTE must remain deferred')
    if grant_policy.get('edge_transport_required_before_frontend_bounded_transport') is not True:
        errors.append('Edge transport ordering guard is missing')

    for section in ('required_apply_assertions', 'required_rollback_assertions'):
        values = manifest.get(section) or {}
        if not values or any(value is not True for value in values.values()):
            errors.append(f'all {section} flags must remain true')
    if not manifest.get('remaining_blockers'):
        errors.append('deployment blockers must remain explicit')
    guarantees = manifest.get('separation_guarantees') or {}
    if any(value is not False for value in guarantees.values()):
        errors.append('all deployment readiness separation guarantees must remain false')

    require(base, (
        'REPOSITORY-ONLY PROTOTYPE',
        'Existing tasks remain unchanged',
        'add column if not exists task_contract_version integer',
        'not valid',
        'nav_v2_task_contract_catalog',
    ), BASE.name, errors)
    require(mutations, (
        'REPOSITORY-ONLY PROTOTYPE',
        'Existing legacy tasks remain unchanged and are never backfilled',
        'Generic task creation disabled',
        'Для bounded-задачи используйте governed lifecycle RPC',
        'from public, anon, authenticated',
        'to service_role',
        'no mass update/backfill',
        'no authenticated EXECUTE until a separate deployment migration',
    ), MUTATIONS.name, errors)
    require(dto_base, ('nav_v2_get_deal_card_lite', "'dto_version', 1"), DTO_BASE.name, errors)
    require(dto_overlay, (
        'REPOSITORY-ONLY PROTOTYPE',
        "'dto_version', 2",
        "'task_contract_aware', true",
        'task_contract_version',
        'can_complete',
    ), DTO_OVERLAY.name, errors)

    if 'task_contract_version' in snapshot:
        errors.append('baseline snapshot must run before bounded columns exist')
    require(snapshot, (
        'create schema nav_v2_deployment_test',
        'legacy_task_snapshot',
        'deal_snapshot',
        'document_snapshot',
        'risk_snapshot',
        'task_trigger_count',
    ), SNAPSHOT.name, errors)

    require(readiness, (
        'pg_temp.assert_service_only',
        'legacy task count changed or rows were backfilled',
        'deal rows changed during bounded deployment dry-run',
        'document rows changed during bounded deployment dry-run',
        'risk rows changed during bounded deployment dry-run',
        'automatic task trigger count changed',
        'must exist as NOT VALID',
        'SECURITY DEFINER with fixed search_path',
        'contract-aware lite DTO v2 is not active',
        'deployment DTO exposed free-form or client data',
    ), READINESS_ASSERTIONS.name, errors)
    require(base_rollback, (
        'Complete rollback of the repository-only bounded task base contract',
        'drop function if exists nav_v2_private.nav_v2_task_contract_catalog()',
        'drop constraint if exists nav_deal_tasks_v2_bounded_task_type_check',
        'drop column if exists task_contract_version',
    ), BASE_ROLLBACK.name, errors)
    require(base_rollback_assertions, (
        'bounded column % remains after base rollback',
        'legacy task was not preserved by complete rollback',
        'legacy task type constraint was not restored',
        'legacy authenticated grants were not restored',
    ), BASE_ROLLBACK_ASSERTIONS.name, errors)
    require(final_assertions, (
        'bounded mutation event table remains after complete rollback',
        'bounded catalog functions remain after complete rollback',
        'governed bounded RPC remains after complete rollback',
        'legacy synthetic baseline grants were not restored',
        'lite DTO v1 was not restored after complete rollback',
        'drop schema nav_v2_deployment_test cascade',
        'deployment test snapshot schema remains after cleanup',
    ), FINAL_ASSERTIONS.name, errors)

    require(doc, (
        'repository-only deployment readiness dry-run',
        'Apply order',
        'Grant policy',
        'Mutation lifecycle job',
        'DTO lifecycle job',
        'Complete rollback',
        'Что не разрешает этот bundle',
        'Production boundary',
        'Issue #282',
        'Rollback',
    ), DOC.name, errors)
    require(workflow, (
        'postgres:17',
        'manifest-static',
        'mutation-lifecycle-dry-run',
        'dto-lifecycle-dry-run',
        'python3 scripts/check_nav_v2_bounded_task_deployment_readiness.py',
        'nav_v2_bounded_task_mutation_assertions.sql',
        'nav_v2_deal_card_lite_bounded_assertions.sql',
        'nav_v2_bounded_task_deployment_readiness_assertions.sql',
        'nav_v2_bounded_task_base_rollback.sql',
        'nav_v2_bounded_task_deployment_final_assertions.sql',
        'nav-v2-bounded-task-deployment-readiness',
    ), WORKFLOW.name, errors)
    ordered(workflow, [
        'nav_v2_bounded_task_contract.sql',
        'nav_v2_bounded_task_mutations.sql',
        'nav_v2_get_deal_card_lite_explicit_dto.sql',
        'nav_v2_get_deal_card_lite_bounded_tasks.sql',
    ], WORKFLOW.name, errors)

    combined = '\n'.join((doc, workflow, json.dumps(manifest, ensure_ascii=False)))
    for forbidden in (
        'Supabase.apply_migration',
        'Supabase.create_branch',
        'supabase migration up',
        'supabase db push',
        'deploy_edge_function',
    ):
        if forbidden in combined:
            errors.append(f'deployment readiness artifact contains forbidden apply marker: {forbidden}')

    if errors:
        print('Navigator v2 bounded task deployment readiness errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 bounded task deployment readiness source contract passed: prototype order, service-role-only grants, no-backfill assertions and complete rollback remain repository-only and deployment-blocked')
    return 0


if __name__ == '__main__':
    sys.exit(main())
