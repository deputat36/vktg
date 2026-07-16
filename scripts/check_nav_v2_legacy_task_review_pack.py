from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'config/nav-v2-legacy-task-review-contract.json'
FIXTURES = ROOT / 'fixtures/nav-v2-legacy-task-review-scenarios.json'
BASE = ROOT / 'supabase/prototypes/nav_v2_bounded_task_contract.sql'
PROTOTYPE = ROOT / 'supabase/prototypes/nav_v2_legacy_task_review_pack.sql'
SETUP = ROOT / 'tests/sql/nav_v2_bounded_task_mutation_setup.sql'
ASSERTIONS = ROOT / 'tests/sql/nav_v2_legacy_task_review_assertions.sql'
ROLLBACK = ROOT / 'tests/sql/nav_v2_legacy_task_review_rollback.sql'
DOC = ROOT / 'docs/NAV_V2_LEGACY_TASK_REVIEW_PACK_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-legacy-task-review-pack.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def suggested(source: str | None, role: str | None) -> str | None:
    value = source or ''
    if value.startswith('auto_quality_'):
        return 'card_correction'
    if value in {'auto_settlements', 'auto_expenses'}:
        return 'term_approval'
    if value in {'auto_lawyer', 'auto_children', 'auto_share_lawyer'}:
        return 'legal_decision'
    if value == 'auto_broker' and role == 'broker':
        return 'financial_decision'
    return None


def role_compatible(task_type: str | None, role: str | None) -> bool:
    allowed = {
        'card_correction': {'spn', 'manager'},
        'term_approval': {'spn', 'manager'},
        'legal_decision': {'lawyer'},
        'financial_decision': {'broker'},
    }
    return role in allowed.get(task_type, set())


def decision(status: str, task_type: str | None, compatible: bool) -> str:
    if status in {'done', 'cancelled'}:
        return 'leave_legacy'
    if task_type and compatible:
        return 'candidate_for_recreate'
    return 'manual_review'


def main() -> int:
    errors: list[str] = []
    paths = (CONTRACT, FIXTURES, BASE, PROTOTYPE, SETUP, ASSERTIONS, ROLLBACK, DOC, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    fixtures = json.loads(FIXTURES.read_text(encoding='utf-8'))
    sql = PROTOTYPE.read_text(encoding='utf-8')
    setup = SETUP.read_text(encoding='utf-8')
    assertions = ASSERTIONS.read_text(encoding='utf-8')
    rollback = ROLLBACK.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    if contract.get('status') != 'repository_only_prototype' or contract.get('production_applied') is not False:
        errors.append('legacy review contract must remain repository-only')
    if fixtures.get('schema_version') != 1 or fixtures.get('synthetic_only') is not True:
        errors.append('legacy review fixtures must remain schema v1 synthetic-only')

    require(sql, (
        '-- REPOSITORY-ONLY PROTOTYPE.',
        'create or replace function public.nav_v2_get_legacy_task_review_pack',
        "v_role not in ('owner', 'admin', 'manager')",
        "coalesce(t.source, '') like 'auto_quality_%'",
        "coalesce(t.source, '') = 'auto_broker'",
        "t.assigned_role = 'broker'::public.nav_v2_user_role",
        "then 'leave_legacy'",
        "then 'candidate_for_recreate'",
        "else 'manual_review'",
        "'retire_after_evidence'",
        "'employee_evaluation_allowed', false",
        "'production_rows_changed', false",
        "'backfill_performed', false",
        "'new_tasks_created', false",
        'no employee evaluation or ranking',
        'no title, description, address, client name, phone, email or document URL in DTO',
    ), PROTOTYPE.name, errors)

    for pattern in (
        r'(?im)^\s*update\s+public\.nav_deal_tasks_v2\b',
        r'(?im)^\s*insert\s+into\s+public\.nav_deal_tasks_v2\b',
        r'(?im)^\s*delete\s+from\s+public\.nav_deal_tasks_v2\b',
        r'(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_documents_v2\b',
        r'(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_risks_v2\b',
        r'(?im)^\s*update\s+public\.nav_deals_v2\b',
    ):
        if re.search(pattern, sql):
            errors.append(f'legacy review SQL is not read-only: {pattern}')

    if 'grant execute on function public.nav_v2_get_legacy_task_review_pack(integer)\n  to service_role;' not in sql:
        errors.append('legacy review RPC must remain service-role-only')
    if re.search(r'grant\s+execute[\s\S]{0,120}\bto\s+authenticated\b', sql, re.I):
        errors.append('legacy review RPC grants authenticated execute')

    for field in contract.get('item_allowlist') or []:
        if f"'{field}'" not in sql:
            errors.append(f'item allowlist field missing from SQL: {field}')
    for field in contract.get('forbidden_fields') or []:
        if f"'{field}'" in sql.split('jsonb_agg(jsonb_build_object(', 1)[1].split(') order by', 1)[0]:
            errors.append(f'forbidden item field exposed: {field}')

    for case in fixtures.get('mapping_cases') or []:
        mapped = suggested(case.get('source'), case.get('assigned_role'))
        compatible = role_compatible(mapped, case.get('assigned_role'))
        actual_decision = decision(case.get('status'), mapped, compatible)
        if mapped != case.get('suggested') or actual_decision != case.get('decision'):
            errors.append(f"mapping case {case['id']} mismatch")

    for case in fixtures.get('role_cases') or []:
        actual = case.get('role') in {'owner', 'admin', 'manager'}
        if actual != case.get('allowed'):
            errors.append(f"role case {case['role']} mismatch")

    guarantees = contract.get('separation_guarantees') or {}
    if any(value is not False for value in guarantees.values()):
        errors.append('all legacy review separation guarantees must remain false')

    require(setup, (
        'Legacy task must remain untouched',
        'create or replace function nav_v2_private.nav_v2_can_edit_deal',
    ), SETUP.name, errors)

    require(assertions, (
        'authenticated unexpectedly has legacy review EXECUTE',
        'owner legacy review summary mismatch',
        'review DTO exposes forbidden free-form/client fields',
        'matcap source was incorrectly routed to broker task',
        'certificate source was incorrectly routed to broker task',
        'cancelled broker task must remain legacy',
        'manager review leaked an unrelated deal',
        'retire_after_evidence must never be automatic',
        'legacy review pack mutated task rows',
        'PostgreSQL legacy task review assertions passed',
    ), ASSERTIONS.name, errors)

    require(rollback, (
        'drop function if exists public.nav_v2_get_legacy_task_review_pack',
        'bounded task catalog was removed by review rollback',
        'legacy task was removed or changed by review rollback',
        'PostgreSQL legacy task review rollback passed',
    ), ROLLBACK.name, errors)

    require(doc, (
        'repository-only review pack',
        'leave_legacy',
        'candidate_for_recreate',
        'manual_review',
        'retire_after_evidence',
        'маткапитал',
        'сертификаты',
        'не используется для оценки сотрудников',
        'Production gate',
        'Rollback',
    ), DOC.name, errors)

    sql_paths = (
        'tests/sql/nav_v2_bounded_task_mutation_setup.sql',
        'supabase/prototypes/nav_v2_bounded_task_contract.sql',
        'supabase/prototypes/nav_v2_legacy_task_review_pack.sql',
        'tests/sql/nav_v2_legacy_task_review_assertions.sql',
        'tests/sql/nav_v2_legacy_task_review_rollback.sql',
    )
    require(workflow, (
        'postgres:17',
        'POSTGRES_DB: navigator_legacy_task_review',
        'python3 scripts/check_nav_v2_legacy_task_review_pack.py',
        'python3 -m py_compile scripts/check_nav_v2_legacy_task_review_pack.py',
        'psql -v ON_ERROR_STOP=1 -f',
        *sql_paths,
        'nav-v2-legacy-task-review-pack',
    ), WORKFLOW.name, errors)
    positions = [workflow.find(f'-f {path}') for path in sql_paths]
    if any(pos < 0 for pos in positions) or positions != sorted(positions):
        errors.append('workflow SQL order is incorrect')

    if errors:
        print('Navigator v2 legacy task review errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 legacy task review passed: role-scoped neutral DTO, safe source mapping, no writes/backfill/evaluation and executable PostgreSQL order')
    return 0


if __name__ == '__main__':
    sys.exit(main())
