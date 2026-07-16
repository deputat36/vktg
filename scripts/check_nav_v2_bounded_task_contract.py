from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-bounded-task-contract.json"
FIXTURES = ROOT / "fixtures/nav-v2-bounded-task-contract-scenarios.json"
PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_bounded_task_contract.sql"
DOC = ROOT / "docs/NAV_V2_BOUNDED_TASK_CONTRACT_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-bounded-task-contract.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def catalog_valid(case: dict, catalog: dict) -> bool:
    item = catalog.get(case["type"])
    if not item:
        return False
    return (
        case["role"] in item["owner_roles"]
        and 1 <= case["sla"] <= item["max_sla_days"]
        and case["criterion"] == item["criterion"]
        and case["evidence"] in item["evidence"]
    )


def source_suggestion(source: str) -> tuple[str | None, str]:
    if source.startswith("auto_quality_"):
        return "card_correction", "high"
    if source in {"auto_settlements", "auto_expenses"}:
        return "term_approval", "high"
    if source in {"auto_lawyer", "auto_children", "auto_share_lawyer"}:
        return "legal_decision", "high"
    if source == "auto_broker":
        return "financial_decision", "high"
    return None, "none"


def outcome_result(case: dict) -> tuple[bool, bool]:
    code = case.get("outcome_code")
    state = case.get("outcome_state")
    status = case.get("status")
    terminal = False
    valid = True
    if code == "completed":
        valid = bool(
            status == "done"
            and case.get("completed_by")
            and case.get("completed_at")
            and case.get("evidence_kind")
            and case.get("evidence_confirmed_at")
            and state == "confirmed"
        )
        terminal = valid
    elif code in {"not_applicable", "cancelled"}:
        terminal = state == "confirmed"
    elif code == "replaced":
        valid = bool(case.get("replacement"))
        terminal = valid and state == "confirmed"
    elif code in {"waiting_external", "deferred"}:
        valid = bool(case.get("review_date"))
        terminal = False
    return valid, terminal


def main() -> int:
    errors: list[str] = []
    for path in (CONTRACT, FIXTURES, PROTOTYPE, DOC, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    sql = PROTOTYPE.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    if contract.get("schema_version") != 2:
        errors.append("bounded task contract version must be 2")
    if contract.get("status") != "repository_only_prototype":
        errors.append("bounded task contract must remain repository-only")
    if contract.get("production_applied") is not False:
        errors.append("bounded task contract must remain non-production")
    if contract.get("existing_rows_backfilled") is not False:
        errors.append("existing tasks must not be backfilled automatically")
    if fixtures.get("synthetic_only") is not True:
        errors.append("fixtures must remain synthetic-only")

    require(sql, (
        "-- REPOSITORY-ONLY PROTOTYPE.",
        "add column if not exists task_contract_version integer",
        "add column if not exists completion_criterion_code text",
        "add column if not exists evidence_kind text",
        "add column if not exists evidence_reference_id uuid",
        "add column if not exists gate_scope text",
        "add column if not exists outcome_code text",
        "add column if not exists outcome_state text",
        "add column if not exists outcome_review_date date",
        "nav_deal_tasks_v2_bounded_task_type_check",
        "nav_deal_tasks_v2_done_evidence_check",
        "nav_deal_tasks_v2_contract_completeness_check",
        "create or replace function nav_v2_private.nav_v2_task_contract_catalog",
        "create or replace function nav_v2_private.nav_v2_suggest_bounded_task_contract",
        "create or replace function public.nav_v2_get_bounded_task_contract_preview",
        "'contract_version', 2",
        "'preview_only', true",
        "'production_rows_changed', false",
        "no automatic backfill of task_type, SLA, evidence or outcomes",
        "no generic operational_task, quality_warning or system_recommendation in contract v2",
    ), PROTOTYPE.name, errors)

    for forbidden in (
        r"(?im)^\s*update\s+public\.nav_deal_tasks_v2\b",
        r"(?im)^\s*insert\s+into\s+public\.nav_deal_tasks_v2\b",
        r"(?im)^\s*delete\s+from\s+public\.nav_deal_tasks_v2\b",
        r"(?im)^\s*alter\s+table\s+public\.nav_deal_tasks_v2\s+alter\s+column.+set\s+not\s+null",
        r"(?im)^\s*alter\s+table\s+public\.nav_deal_tasks_v2\s+alter\s+column.+set\s+default",
    ):
        if re.search(forbidden, sql):
            errors.append(f"prototype mutates/backfills existing task rows: {forbidden}")

    catalog = contract.get("task_types") or {}
    expected_types = {
        "document_request", "document_check", "term_approval", "legal_decision",
        "financial_decision", "corporate_document_signing", "card_correction",
        "contract_preparation", "appointment_scheduling", "post_deal_action"
    }
    if set(catalog) != expected_types:
        errors.append("bounded taxonomy must contain exactly ten task types")
    for forbidden_type in contract.get("forbidden_v2_types") or []:
        if forbidden_type in catalog:
            errors.append(f"generic/legacy task type leaked into v2 catalog: {forbidden_type}")

    for task_type, item in catalog.items():
        if item["default_sla_days"] > item["max_sla_days"]:
            errors.append(f"{task_type}: default SLA exceeds max")
        if not item.get("owner_roles") or not item.get("criterion") or not item.get("evidence"):
            errors.append(f"{task_type}: incomplete catalog definition")
        for marker in (
            f"'{task_type}'",
            f"'{item['criterion']}'",
            f"'{item['gate']}'",
        ):
            if marker not in sql:
                errors.append(f"{task_type}: SQL catalog missing {marker}")

    for case in fixtures.get("catalog_cases") or []:
        actual = catalog_valid(case, catalog)
        if actual != case["allowed"]:
            errors.append(f"catalog case {case['type']}/{case['role']} mismatch: got {actual}")

    for case in fixtures.get("source_cases") or []:
        actual_type, confidence = source_suggestion(case["source"])
        if actual_type != case["expected"] or confidence != case["confidence"]:
            errors.append(f"source case {case['source']} mismatch")

    for case in fixtures.get("outcome_cases") or []:
        valid, terminal = outcome_result(case)
        if valid != case["valid"] or terminal != case["terminal"]:
            errors.append(f"outcome case {case['id']} mismatch: valid={valid}, terminal={terminal}")

    preview_block = sql.split("create or replace function public.nav_v2_get_bounded_task_contract_preview", 1)[1]
    for forbidden_key in contract.get("preview_forbidden_keys") or []:
        if f"'{forbidden_key}'" in preview_block:
            errors.append(f"preview DTO exposes forbidden key: {forbidden_key}")

    for required in contract.get("required_contract_fields") or []:
        if f"'{required}'" not in sql and required not in {"task_type", "sla_days", "assigned_role"}:
            errors.append(f"missing required contract field marker {required}")

    guarantees = contract.get("separation_guarantees") or {}
    if any(value is not False for value in guarantees.values()):
        errors.append("separation guarantees must all remain false for production changes")

    require(doc, (
        "repository-only prototype",
        "10 типов задач",
        "document_request",
        "legal_decision",
        "corporate_document_signing",
        "post_deal_action",
        "waiting_external",
        "deferred",
        "evidence",
        "не выполняет backfill",
        "98",
        "Production gate",
        "Rollback",
    ), DOC.name, errors)

    require(workflow, (
        "python3 scripts/check_nav_v2_bounded_task_contract.py",
        "python3 -m py_compile scripts/check_nav_v2_bounded_task_contract.py",
        "nav-v2-bounded-task-contract",
    ), WORKFLOW.name, errors)

    if "authenticated role/mutation" not in str(contract.get("production_gate", "")).lower():
        errors.append("production gate must require authenticated role/mutation E2E")

    if errors:
        print("Navigator v2 bounded task contract errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 bounded task contract passed: ten task types, bounded SLA, owner roles, "
        "completion evidence, active waits, confirmed terminal outcomes and no legacy backfill"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
