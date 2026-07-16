from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-corporate-documents-contract.json"
FIXTURES = ROOT / "fixtures/nav-v2-corporate-documents-scenarios.json"
PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_corporate_documents.sql"
AMENDMENT = ROOT / "supabase/prototypes/nav_v2_corporate_documents_index_amendment.sql"
DOC = ROOT / "docs/NAV_V2_CORPORATE_DOCUMENTS_CONTRACT_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-corporate-documents-contract.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def is_complete(item: dict) -> bool:
    return item.get("status") == "signed" or (
        item.get("outcome_state") == "confirmed"
        and item.get("outcome_code") in {"not_applicable", "replaced", "cancelled"}
    )


def readiness(items: list[dict]) -> dict[str, int]:
    result = {
        "complete": 0,
        "required_incomplete": 0,
        "before_deposit_incomplete": 0,
        "before_deal_incomplete": 0,
        "after_deal_incomplete": 0,
        "problems": 0,
        "awaiting_signature": 0,
    }
    for item in items:
        complete = is_complete(item)
        required = bool(item.get("is_required"))
        stage = item.get("required_stage")
        result["complete"] += int(complete)
        result["required_incomplete"] += int(required and not complete)
        result["before_deposit_incomplete"] += int(
            required and stage in {"before_work", "before_deposit"} and not complete
        )
        result["before_deal_incomplete"] += int(
            required and stage in {"before_work", "before_deposit", "before_deal"} and not complete
        )
        result["after_deal_incomplete"] += int(required and stage == "after_deal" and not complete)
        result["problems"] += int(item.get("status") == "problem")
        result["awaiting_signature"] += int(item.get("status") == "sent_for_signature")
    return result


def role_allowed(role: str, action: str) -> bool:
    if action == "update_operational_status":
        return role in {"spn", "manager", "owner", "admin"}
    if action == "propose_exception":
        return role in {"spn", "manager", "owner", "admin"}
    if action == "confirm_exception":
        return role in {"manager", "owner", "admin"}
    if action == "change_legal_readiness":
        return False
    if action == "view_corporate_documents":
        return role in {"spn", "manager", "owner", "admin"}
    return False


def main() -> int:
    errors: list[str] = []
    for path in (CONTRACT, FIXTURES, PROTOTYPE, AMENDMENT, DOC, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    sql = PROTOTYPE.read_text(encoding="utf-8")
    amendment = AMENDMENT.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    if contract.get("status") != "repository_only_prototype":
        errors.append("corporate document contract status drifted")
    if contract.get("production_applied") is not False:
        errors.append("corporate document prototype must remain non-production")
    if contract.get("prototype_path") != PROTOTYPE.relative_to(ROOT).as_posix():
        errors.append("prototype path drifted")
    if contract.get("amendment_path") != AMENDMENT.relative_to(ROOT).as_posix():
        errors.append("index amendment path drifted")
    if fixtures.get("synthetic_only") is not True:
        errors.append("corporate document fixtures must remain synthetic-only")

    require(sql, (
        "-- REPOSITORY-ONLY PROTOTYPE.",
        "create table if not exists public.nav_deal_corporate_documents_v2",
        "document_type in ('service_agreement', 'inspection_act', 'addendum', 'completion_act')",
        "status in ('planned', 'prepared', 'sent_for_signature', 'signed', 'problem', 'cancelled')",
        "required_stage in ('before_work', 'before_deposit', 'before_deal', 'after_deal', 'conditional')",
        "signing_method in ('unknown', 'paper', 'online')",
        "alter table public.nav_deal_corporate_documents_v2 enable row level security",
        "create or replace function nav_v2_private.nav_v2_corporate_document_is_complete",
        "create or replace function nav_v2_private.nav_v2_corporate_recommended_items",
        "create or replace function public.nav_v2_preview_corporate_document_plan",
        "create or replace function public.nav_v2_get_corporate_document_readiness",
        "'requires_user_confirmation', true",
        "'legal_readiness_changed', false",
        "'backlog_created', false",
        "'corporate_readiness_only', true",
        "no automatic insert into public.nav_deal_corporate_documents_v2",
        "no changes to public.nav_deal_documents_v2",
    ), PROTOTYPE.name, errors)

    require(amendment, (
        "-- REPOSITORY-ONLY PROTOTYPE AMENDMENT.",
        "drop index if exists public.nav_corporate_documents_active_unique_idx",
        "coalesce(outcome_state, '') = 'confirmed'",
        "coalesce(outcome_code, '') in ('not_applicable', 'replaced', 'cancelled')",
        "Normal rows with null outcome fields are included",
    ), AMENDMENT.name, errors)

    if re.search(r"(?im)^\s*insert\s+into\s+public\.nav_deal_corporate_documents_v2\b", sql):
        errors.append("preview prototype must not initialize corporate document rows")
    for forbidden_mutation in (
        r"(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_documents_v2\b",
        r"(?im)^\s*update\s+public\.nav_deals_v2\b",
        r"(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_risks_v2\b",
    ):
        if re.search(forbidden_mutation, sql):
            errors.append(f"corporate prototype crosses separation boundary: {forbidden_mutation}")

    table_block = sql.split("create table if not exists public.nav_deal_corporate_documents_v2", 1)[1].split("\n);", 1)[0]
    for field in contract.get("privacy_forbidden_fields") or []:
        if re.search(rf"(?im)^\s*{re.escape(field)}\s+", table_block):
            errors.append(f"corporate table contains forbidden client field: {field}")

    for signature in (
        "public.nav_v2_preview_corporate_document_plan(uuid)",
        "public.nav_v2_get_corporate_document_readiness(uuid)",
    ):
        if f"revoke execute on function {signature}" not in sql:
            errors.append(f"missing execute revoke for {signature}")
        if f"grant execute on function {signature}" not in sql:
            errors.append(f"missing authenticated grant for {signature}")

    for key in contract.get("preview_keys") or []:
        if f"'{key}'" not in sql:
            errors.append(f"preview key missing from SQL: {key}")
    for key in contract.get("preview_item_keys") or []:
        if f"'{key}'" not in sql:
            errors.append(f"preview item key missing from SQL: {key}")
    for key in contract.get("readiness_item_keys") or []:
        if f"'{key}'" not in sql:
            errors.append(f"readiness item key missing from SQL: {key}")
    for key in contract.get("readiness_summary_keys") or []:
        if f"'{key}'" not in sql:
            errors.append(f"readiness summary key missing from SQL: {key}")

    recommendations = contract.get("recommended_plan_per_represented_side") or []
    if len(recommendations) != 4:
        errors.append("each represented side must have exactly four plan recommendations")
    expected_types = {"service_agreement", "inspection_act", "addendum", "completion_act"}
    if {item.get("document_type") for item in recommendations} != expected_types:
        errors.append("corporate recommendation types drifted")

    for case in fixtures.get("plan_cases") or []:
        sides = []
        if case.get("seller_spn_present"):
            sides.append("seller")
        if case.get("buyer_spn_present"):
            sides.append("buyer")
        item_count = len(sides) * len(recommendations)
        if sides != case.get("expected_sides") or item_count != case.get("expected_items"):
            errors.append(f"plan case {case['id']} mismatch: sides={sides}, items={item_count}")

    if len(fixtures.get("readiness_cases") or []) < 9:
        errors.append("readiness matrix must contain at least nine cases")
    for case in fixtures.get("readiness_cases") or []:
        actual = readiness(case.get("items") or [])
        if actual != case.get("expected"):
            errors.append(f"readiness case {case['id']} mismatch: got {actual}, expected {case.get('expected')}")

    for case in fixtures.get("role_cases") or []:
        actual = role_allowed(case["role"], case["action"])
        if actual != case["allowed"]:
            errors.append(f"role case {case['id']} mismatch: got {actual}, expected {case['allowed']}")

    guarantees = contract.get("separation_guarantees") or {}
    if any(value is not False for value in guarantees.values()):
        errors.append("all separation guarantees must remain false for changed production surfaces")

    require(doc, (
        "repository-only prototype",
        "Договор оказания услуг",
        "Акт осмотра",
        "Дополнительное соглашение",
        "Акт выполненных работ",
        "отдельно от юридических документов",
        "не создаёт строки автоматически",
        "бумажное или онлайн-подписание",
        "Корпоративная готовность",
        "не меняет юридическую готовность",
        "Production gate",
        "Rollback",
    ), DOC.name, errors)

    require(workflow, (
        "python3 scripts/check_nav_v2_corporate_documents_contract.py",
        "python3 -m py_compile scripts/check_nav_v2_corporate_documents_contract.py",
        "nav-v2-corporate-documents-contract",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 corporate document contract errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 corporate document contract passed: separate table, explicit plan, "
        "signed-or-confirmed completion, stage readiness and no automatic/legal backlog mutation"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
