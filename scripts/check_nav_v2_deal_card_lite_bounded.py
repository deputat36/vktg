from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'config/nav-v2-deal-card-lite-bounded-contract.json'
BASE = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql'
OVERLAY = ROOT / 'supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql'
MUTATIONS = ROOT / 'supabase/prototypes/nav_v2_bounded_task_mutations.sql'
SETUP = ROOT / 'tests/sql/nav_v2_deal_card_lite_bounded_setup.sql'
ASSERTIONS = ROOT / 'tests/sql/nav_v2_deal_card_lite_bounded_assertions.sql'
ROLLBACK = ROOT / 'tests/sql/nav_v2_deal_card_lite_bounded_rollback.sql'
DOC = ROOT / 'docs/NAV_V2_DEAL_CARD_LITE_BOUNDED_DTO_2026-07-16.md'
WORKFLOW = ROOT / '.github/workflows/nav-v2-deal-card-lite-bounded.yml'


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker!r}')


def main() -> int:
    errors: list[str] = []
    paths = (CONTRACT, BASE, OVERLAY, MUTATIONS, SETUP, ASSERTIONS, ROLLBACK, DOC, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f'missing {path.relative_to(ROOT)}')
    if errors:
        print('\n'.join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    base = BASE.read_text(encoding='utf-8')
    overlay = OVERLAY.read_text(encoding='utf-8')
    mutations = MUTATIONS.read_text(encoding='utf-8')
    setup = SETUP.read_text(encoding='utf-8')
    assertions = ASSERTIONS.read_text(encoding='utf-8')
    rollback = ROLLBACK.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    if contract.get('status') != 'repository_only_prototype' or contract.get('production_applied') is not False:
        errors.append('bounded lite DTO contract must remain repository-only')
    if contract.get('dto_version') != 2:
        errors.append('bounded lite DTO version must be 2')
    if contract.get('public_signature') != 'nav_v2_get_deal_card_lite(uuid)':
        errors.append('public lite DTO signature drifted')

    require(overlay, (
        '-- REPOSITORY-ONLY PROTOTYPE.',
        'create or replace function public.nav_v2_get_deal_card_lite(p_deal_id uuid)',
        "'task_contract_version', t.task_contract_version",
        "'task_type', case when t.task_contract_version = 2",
        "'evidence_kind', case when t.task_contract_version = 2",
        "'completion_criterion_code'",
        "'gate_scope'",
        "'subject_kind'",
        "'outcome_code'",
        "'outcome_state'",
        "'outcome_reason_code'",
        "'outcome_review_date'",
        "'is_bounded', t.task_contract_version = 2",
        "'legacy_status_path', t.task_contract_version is distinct from 2",
        "'requires_evidence_reference', t.task_contract_version = 2",
        "'supports_reopen', t.task_contract_version is distinct from 2",
        "'can_change_status', case",
        "when t.task_contract_version = 2 then false",
        "'can_start', case",
        "'can_complete', case",
        "'can_set_active_outcome', case",
        "'can_propose_terminal_outcome', case",
        "'can_decide_terminal_outcome', case",
        'nav_v2_private.nav_v2_can_operate_bounded_task',
        'nav_v2_private.nav_v2_can_decide_bounded_task',
        "'task_contract_aware', true",
        "'dto_version', 2",
        'No task, deal, document, risk, readiness or permission row is mutated.',
    ), OVERLAY.name, errors)

    task_start = overlay.find('select coalesce(jsonb_agg(jsonb_build_object(', overlay.find('into v_documents'))
    task_end = overlay.find('into v_tasks', task_start)
    task_block = overlay[task_start:task_end] if task_start >= 0 and task_end > task_start else ''
    if not task_block:
        errors.append('could not locate bounded task DTO block')
    for field in contract.get('task_fields') or []:
        if f"'{field}'" not in task_block:
            errors.append(f'task field missing from overlay: {field}')
    for field in contract.get('forbidden_task_fields') or []:
        if f"'{field}'" in task_block:
            errors.append(f'forbidden task field exposed: {field}')

    for pattern in (
        r'(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_tasks_v2\b',
        r'(?im)^\s*update\s+public\.nav_deals_v2\b',
        r'(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_documents_v2\b',
        r'(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_risks_v2\b',
    ):
        if re.search(pattern, overlay):
            errors.append(f'lite DTO overlay contains mutation: {pattern}')

    if 'grant execute' in overlay.lower() or 'revoke execute' in overlay.lower():
        errors.append('lite DTO overlay must not change grants')
    if overlay.count('create or replace function public.nav_v2_get_deal_card_lite(p_deal_id uuid)') != 1:
        errors.append('lite DTO overlay must replace exactly one public function')

    for helper in ('nav_v2_can_operate_bounded_task', 'nav_v2_can_decide_bounded_task'):
        if helper not in mutations:
            errors.append(f'mutation prototype missing required helper: {helper}')

    require(setup, (
        'alter table public.nav_deals_v2',
        'add column object_type text',
        'create or replace function public.nav_v2_can_change_document_status',
        'create or replace function public.nav_v2_can_change_task_status',
        'кв. 99',
    ), SETUP.name, errors)

    require(assertions, (
        'lite DTO version/contract flag mismatch',
        'lite DTO exposed unit-level address',
        'legacy task compatibility fields mismatch',
        'seller view of bounded lawyer task mismatch',
        'assigned lawyer governed permissions mismatch',
        'manager terminal-decision permissions mismatch',
        'lite DTO read mutated bounded task',
        'PostgreSQL contract-aware lite DTO assertions passed',
    ), ASSERTIONS.name, errors)

    require(rollback, (
        '\\i supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql',
        'base lite DTO was not restored',
        'contract-aware task fields remain after rollback',
        'bounded task contract/mutations were removed by DTO rollback',
        'PostgreSQL contract-aware lite DTO rollback passed',
    ), ROLLBACK.name, errors)

    require(doc, (
        'repository-only prototype',
        'Legacy rows',
        'Bounded rows',
        'evidence',
        'supports_reopen=false',
        'terminal proposal',
        'PostgreSQL 17',
        'не меняет grants',
        'Production gate',
        'Rollback',
    ), DOC.name, errors)

    sql_paths = (
        'tests/sql/nav_v2_bounded_task_mutation_setup.sql',
        'tests/sql/nav_v2_deal_card_lite_bounded_setup.sql',
        'supabase/prototypes/nav_v2_bounded_task_contract.sql',
        'supabase/prototypes/nav_v2_bounded_task_mutations.sql',
        'supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql',
        'supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql',
        'tests/sql/nav_v2_deal_card_lite_bounded_assertions.sql',
        'tests/sql/nav_v2_deal_card_lite_bounded_rollback.sql',
    )
    require(workflow, (
        'postgres:17',
        'POSTGRES_DB: navigator_lite_bounded_dto',
        'python3 scripts/check_nav_v2_deal_card_lite_bounded.py',
        'python3 -m py_compile scripts/check_nav_v2_deal_card_lite_bounded.py',
        'psql -v ON_ERROR_STOP=1 -f',
        *sql_paths,
        'nav-v2-deal-card-lite-bounded',
    ), WORKFLOW.name, errors)
    positions = [workflow.find(f'-f {path}') for path in sql_paths]
    if any(pos < 0 for pos in positions) or positions != sorted(positions):
        errors.append('workflow SQL order is incorrect')

    if "'dto_version', 1" not in base:
        errors.append('base lite DTO rollback target no longer has version 1')

    if errors:
        print('Navigator v2 contract-aware lite DTO errors:')
        for error in errors:
            print(f'- {error}')
        return 1

    print('Navigator v2 contract-aware lite DTO passed: legacy/governed paths separated, permissions explicit, privacy preserved and PostgreSQL order executable')
    return 0


if __name__ == '__main__':
    sys.exit(main())
