from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-bounded-task-mutations-contract.json"
FIXTURES = ROOT / "fixtures/nav-v2-bounded-task-mutation-scenarios.json"
BASE = ROOT / "supabase/prototypes/nav_v2_bounded_task_contract.sql"
MUTATIONS = ROOT / "supabase/prototypes/nav_v2_bounded_task_mutations.sql"
SETUP = ROOT / "tests/sql/nav_v2_bounded_task_mutation_setup.sql"
ASSERTIONS = ROOT / "tests/sql/nav_v2_bounded_task_mutation_assertions.sql"
ASSERTION_PARTS = tuple(ROOT / f"tests/sql/nav_v2_bounded_task_mutation_assertions_part{i}.sql" for i in range(1, 4))
ROLLBACK = ROOT / "tests/sql/nav_v2_bounded_task_mutation_rollback.sql"
DOC = ROOT / "docs/NAV_V2_BOUNDED_TASK_MUTATIONS_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-bounded-task-mutations.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def role_allowed(role: str, action: str) -> bool:
    if action == "create":
        return role in {"spn", "manager", "owner", "admin"}
    if action == "operate_assigned":
        return role in {"spn", "lawyer", "broker", "manager"}
    if action == "decide_terminal":
        return role in {"manager", "owner", "admin"}
    return False


def transition_allowed(source: str, action: str) -> bool:
    if action == "start":
        return source in {"open", "in_progress"}
    if action == "complete":
        return source in {"open", "in_progress"}
    return False


def sla_value(case: dict) -> int | None:
    requested = case.get("requested")
    value = case.get("default") if requested is None else requested
    if not isinstance(value, int) or value < 1 or value > case.get("max", 0):
        return None
    return value


def active_outcome_valid(case: dict) -> bool:
    reasons = {
        "waiting_external": {"awaiting_counterparty", "awaiting_bank", "awaiting_document"},
        "deferred": {"postponed_by_client", "route_changed"},
    }
    review_days = case.get("review_days")
    return (
        case.get("reason") in reasons.get(case.get("code"), set())
        and isinstance(review_days, int)
        and 1 <= review_days <= 90
    )


def terminal_outcome_valid(case: dict) -> bool:
    reasons = {
        "not_applicable": {"no_longer_required", "route_changed"},
        "replaced": {"replaced_by_specific_task", "duplicate_work_item"},
        "cancelled": {"process_cancelled", "route_changed"},
    }
    code = case.get("code")
    replacement = bool(case.get("replacement"))
    return (
        case.get("reason") in reasons.get(code, set())
        and ((code == "replaced" and replacement) or (code != "replaced" and not replacement))
    )


def main() -> int:
    errors: list[str] = []
    paths = (CONTRACT, FIXTURES, BASE, MUTATIONS, SETUP, ASSERTIONS, *ASSERTION_PARTS, ROLLBACK, DOC, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    mutations = MUTATIONS.read_text(encoding="utf-8")
    setup = SETUP.read_text(encoding="utf-8")
    assertion_master = ASSERTIONS.read_text(encoding="utf-8")
    assertions = "\n".join(path.read_text(encoding="utf-8") for path in ASSERTION_PARTS)
    rollback = ROLLBACK.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    if contract.get("status") != "repository_only_prototype" or contract.get("production_applied") is not False:
        errors.append("bounded task mutation contract must remain repository-only and non-production")
    if contract.get("batch_limit") != 5:
        errors.append("bounded task batch limit must remain five")
    if fixtures.get("schema_version") != 1 or fixtures.get("synthetic_only") is not True:
        errors.append("bounded task mutation fixtures must remain schema v1 synthetic-only")

    require(mutations, (
        "-- REPOSITORY-ONLY PROTOTYPE.",
        "Existing legacy tasks remain unchanged and are never backfilled",
        "drop constraint if exists nav_deal_tasks_v2_task_type_check",
        "create table if not exists public.nav_deal_task_mutation_events_v2",
        "alter table public.nav_deal_task_mutation_events_v2 enable row level security",
        "client_request_id uuid not null unique",
        "create or replace function nav_v2_private.nav_v2_bounded_task_replay",
        "client_request_id уже использован другой операцией",
        "create or replace function nav_v2_private.nav_v2_bounded_task_subject_allowed",
        "create or replace function nav_v2_private.nav_v2_bounded_task_reason_allowed",
        "create or replace function public.nav_v2_create_bounded_tasks",
        "create or replace function public.nav_v2_start_bounded_task",
        "create or replace function public.nav_v2_complete_bounded_task",
        "create or replace function public.nav_v2_set_bounded_task_active_outcome",
        "create or replace function public.nav_v2_propose_bounded_task_terminal_outcome",
        "create or replace function public.nav_v2_decide_bounded_task_terminal_outcome",
        "Выберите от 1 до 5 задач",
        "Для bounded-задачи нужен конкретный assigned_to",
        "Назначенный сотрудник не соответствует роли в этой сделке",
        "Для завершения требуется evidence_reference_id",
        "review_date должен быть в пределах 1–90 дней",
        "Replacement task должна быть другой активной bounded-задачей той же сделки",
        "Generic task creation disabled: use nav_v2_create_bounded_tasks",
        "Для bounded-задачи используйте governed lifecycle RPC",
        "no mass update/backfill",
        "no authenticated EXECUTE until a separate deployment migration",
    ), MUTATIONS.name, errors)

    create_start = mutations.find("create or replace function public.nav_v2_create_bounded_tasks")
    create_end = mutations.find("create or replace function public.nav_v2_start_bounded_task", create_start)
    create_block = mutations[create_start:create_end] if create_start >= 0 and create_end > create_start else ""
    if not create_block:
        errors.append("could not locate create bounded tasks function")
    for forbidden in ("p_title", "p_description", "'title'", "'description'", "document_url", "client_name", "phone", "email"):
        if forbidden in create_block:
            errors.append(f"create bounded tasks accepts or stores forbidden free-form/client field: {forbidden}")

    for key in contract.get("create_item_allowlist") or []:
        if f"'{key}'" not in create_block:
            errors.append(f"create allowlist key missing from SQL: {key}")

    compact_mutations = re.sub(r"\s+", "", mutations)
    for signature in contract.get("public_rpcs") or []:
        qualified = f"public.{signature}"
        compact_signature = re.sub(r"\s+", "", qualified)
        if f"revokeexecuteonfunction{compact_signature}" not in compact_mutations:
            errors.append(f"missing service-gated revoke for {qualified}")
        if f"grantexecuteonfunction{compact_signature}toservice_role" not in compact_mutations:
            errors.append(f"missing service-role grant for {qualified}")

    if re.search(r"(?im)^\s*grant\s+execute\s+on\s+function[\s\S]{0,220}\bto\s+authenticated\b", mutations):
        errors.append("repository-only bounded task mutations grant EXECUTE to authenticated")

    forbidden_cross_surface = (
        r"(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_documents_v2\b",
        r"(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_risks_v2\b",
        r"(?im)^\s*update\s+public\.nav_deals_v2\b",
    )
    for pattern in forbidden_cross_surface:
        if re.search(pattern, mutations):
            errors.append(f"bounded task mutation crosses protected surface: {pattern}")

    if re.search(
        r"(?is)update\s+public\.nav_deal_tasks_v2\s+set[\s\S]{0,500}task_contract_version\s*=\s*2(?![\s\S]{0,200}where\s+id\s*=)",
        mutations,
    ):
        errors.append("mutation SQL appears to mass-backfill task_contract_version")

    if "task_contract_version = 2" not in mutations or "status in ('open'" not in mutations:
        errors.append("active bounded task duplicate index is missing contract/status scope")

    role_cases = fixtures.get("role_cases") or []
    if len(role_cases) < 10:
        errors.append("role matrix must include at least ten cases")
    for case in role_cases:
        if role_allowed(case["role"], case["action"]) != case["allowed"]:
            errors.append(f"role case {case['id']} mismatch")

    for case in fixtures.get("batch_cases") or []:
        valid = isinstance(case.get("count"), int) and 1 <= case["count"] <= 5
        if valid != case["valid"]:
            errors.append(f"batch case {case['id']} mismatch")

    for case in fixtures.get("transition_cases") or []:
        if transition_allowed(case["from"], case["action"]) != case["allowed"]:
            errors.append(f"transition case {case['id']} mismatch")

    for case in fixtures.get("sla_cases") or []:
        if sla_value(case) != case.get("expected"):
            errors.append(f"SLA case {case['id']} mismatch")

    for case in fixtures.get("active_outcome_cases") or []:
        if active_outcome_valid(case) != case["valid"]:
            errors.append(f"active outcome case {case['id']} mismatch")

    for case in fixtures.get("terminal_outcome_cases") or []:
        if terminal_outcome_valid(case) != case["valid"]:
            errors.append(f"terminal outcome case {case['id']} mismatch")

    for case in fixtures.get("separation_cases") or []:
        if case.get("mutated") is not False:
            errors.append(f"separation case {case['surface']} must remain non-mutating")

    guarantees = contract.get("separation_guarantees") or {}
    if any(value is not False for value in guarantees.values()):
        errors.append("all bounded task separation guarantees must remain false for production surfaces")

    require(setup, (
        "create role authenticated nologin",
        "create role service_role nologin bypassrls",
        "create or replace function auth.uid()",
        "create type public.nav_v2_task_status as enum",
        "create type public.nav_v2_task_priority as enum",
        "constraint nav_deal_tasks_v2_task_type_check",
        "Legacy task must remain untouched",
        "Other SPN Synthetic",
        "create or replace function nav_v2_private.nav_v2_can_edit_deal",
    ), SETUP.name, errors)

    require(assertion_master, ("\\i tests/sql/nav_v2_bounded_task_mutation_assertions_part1.sql", "\\i tests/sql/nav_v2_bounded_task_mutation_assertions_part2.sql", "\\i tests/sql/nav_v2_bounded_task_mutation_assertions_part3.sql"), ASSERTIONS.name, errors)

    require(assertions, (
        "authenticated unexpectedly has create bounded task EXECUTE",
        "legacy task was backfilled or changed",
        "Generic task creation disabled",
        "repeat create must replay without duplicate rows",
        "client_request_id уже использован другой операцией",
        "unknown",
        "Выберите от 1 до 5 задач",
        "Назначенный сотрудник не соответствует роли в этой сделке",
        "Нет прав создавать bounded-задачи",
        "completion evidence/outcome contract mismatch",
        "waiting_external must remain active with review date",
        "deferred task must remain active with review date",
        "manager confirmation did not terminate task correctly",
        "admin rejection must keep financial task active",
        "Replacement task должна быть другой активной bounded-задачей той же сделки",
        "Для bounded-задачи используйте governed lifecycle RPC",
        "legacy task lifecycle/backfill boundary mismatch",
        "bounded task mutation created a document",
        "bounded task mutation created a risk",
        "PostgreSQL bounded task mutation assertions passed",
    ), ASSERTIONS.name, errors)

    require(rollback, (
        "drop function if exists public.nav_v2_create_bounded_tasks",
        "delete from public.nav_deal_tasks_v2 where task_contract_version = 2",
        "add constraint nav_deal_tasks_v2_task_type_check",
        "create or replace function public.nav_v2_add_task",
        "base bounded task catalog was removed by mutation rollback",
        "legacy task was removed by mutation rollback",
        "PostgreSQL bounded task mutation rollback passed",
    ), ROLLBACK.name, errors)

    sql_paths = (
        "tests/sql/nav_v2_bounded_task_mutation_setup.sql",
        "supabase/prototypes/nav_v2_bounded_task_contract.sql",
        "supabase/prototypes/nav_v2_bounded_task_mutations.sql",
        "tests/sql/nav_v2_bounded_task_mutation_assertions.sql",
        "tests/sql/nav_v2_bounded_task_mutation_rollback.sql",
    )
    require(workflow, (
        "postgres:17",
        "POSTGRES_DB: navigator_bounded_task_harness",
        "python3 scripts/check_nav_v2_bounded_task_mutations.py",
        "python3 -m py_compile scripts/check_nav_v2_bounded_task_mutations.py",
        "psql -v ON_ERROR_STOP=1 -f",
        *sql_paths,
        "nav-v2-bounded-task-mutations",
    ), WORKFLOW.name, errors)
    positions = [workflow.find(f"-f {path}") for path in sql_paths]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        errors.append("workflow must run setup, base contract, mutations, assertions and rollback in order")

    require(doc, (
        "repository-only prototype",
        "Явное создание",
        "client_request_id",
        "Legacy RPC guards",
        "waiting_external",
        "deferred",
        "Двухэтапные terminal outcomes",
        "PostgreSQL 17",
        "не выполняет массовый backfill",
        "не меняет readiness",
        "Production gate",
        "Rollback",
    ), DOC.name, errors)

    if errors:
        print("Navigator v2 bounded task mutation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 bounded task mutations passed: explicit catalog-driven creation, exact owner/SLA/evidence, "
        "active waits, confirmed terminal outcomes, legacy guards, idempotency and executable PostgreSQL 17 order"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
