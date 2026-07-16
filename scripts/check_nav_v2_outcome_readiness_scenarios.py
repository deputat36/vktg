from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures/nav-v2-outcome-readiness-scenarios.json"
OUTCOME_CONTRACT = ROOT / "config/nav-v2-work-item-outcome-contract.json"
READINESS_CONTRACT = ROOT / "config/nav-v2-outcome-readiness-contract.json"
OUTCOME_SQL = ROOT / "supabase/prototypes/nav_v2_work_item_outcomes.sql"
READINESS_SQL = ROOT / "supabase/prototypes/nav_v2_outcome_readiness_preview.sql"
DOC = ROOT / "docs/NAV_V2_OUTCOME_READINESS_SCENARIOS_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-outcome-readiness-scenarios.yml"

TERMINAL_DOCUMENT_CODES = {"not_applicable", "replaced", "cancelled"}
MORTGAGE_PAYMENTS = {"mortgage", "militaryMortgage"}
LEGAL_FUNDING_PAYMENTS = {"matcap", "certificate"}


def document_complete(item: dict[str, Any]) -> bool:
    return item.get("status") == "checked" or (
        item.get("outcome_state") == "confirmed"
        and item.get("outcome_code") in TERMINAL_DOCUMENT_CODES
    )


def risk_active(item: dict[str, Any]) -> bool:
    state = item.get("resolution_state")
    code = str(item.get("resolution_code") or "").strip()
    if state == "confirmed" and code:
        return False
    if state in {"proposed", "rejected"}:
        return True
    return not bool(item.get("is_resolved"))


def can_confirm_document(actor: str, responsible: str | None, category: str | None) -> bool:
    if actor in {"owner", "admin"}:
        return True
    if actor == "lawyer":
        return responsible == "lawyer"
    if actor == "broker":
        return responsible == "broker"
    if actor == "manager":
        return responsible in {"spn", "manager"} or category == "corporate"
    return False


def can_confirm_risk(actor: str, assigned: str | None) -> bool:
    if actor in {"owner", "admin"}:
        return True
    if actor == "lawyer":
        return assigned == "lawyer"
    if actor == "broker":
        return assigned == "broker"
    if actor == "manager":
        return assigned is None or assigned in {"spn", "manager"}
    return False


def evaluate(scenario: dict[str, Any]) -> dict[str, Any]:
    documents = scenario.get("documents") or []
    risks = scenario.get("risks") or []
    reviews = scenario.get("reviews") or []

    target_deposit_documents = sum(
        1 for item in documents
        if item.get("required_for_deposit") is True and not document_complete(item)
    )
    target_deal_documents = sum(
        1 for item in documents
        if item.get("required_for_deal") is True and not document_complete(item)
    )
    legacy_deposit_documents = sum(
        1 for item in documents
        if item.get("required_for_deposit") is True and item.get("status") not in {"received", "checked"}
    )
    legacy_deal_documents = sum(
        1 for item in documents
        if item.get("required_for_deal") is True and item.get("status") not in {"received", "checked"}
    )

    active_deposit_risks = sum(1 for item in risks if risk_active(item) and item.get("blocks_deposit") is True)
    active_deal_risks = sum(1 for item in risks if risk_active(item) and item.get("blocks_deal") is True)
    deposit_review_blocks = sum(1 for item in reviews if item.get("decision") == "blocked" or item.get("blocks_deposit") is True)
    deal_review_blocks = sum(1 for item in reviews if item.get("decision") == "blocked" or item.get("blocks_deal") is True)

    result = {
        "target_deposit_documents": target_deposit_documents,
        "target_deal_documents": target_deal_documents,
        "legacy_deposit_documents": legacy_deposit_documents,
        "legacy_deal_documents": legacy_deal_documents,
        "received_not_checked": sum(1 for item in documents if item.get("status") == "received" and not document_complete(item)),
        "proposed_document_outcomes": sum(1 for item in documents if item.get("outcome_state") == "proposed" and item.get("outcome_code") in TERMINAL_DOCUMENT_CODES),
        "confirmed_document_outcomes": sum(1 for item in documents if item.get("outcome_state") == "confirmed" and item.get("outcome_code") in TERMINAL_DOCUMENT_CODES),
        "external_wait": sum(1 for item in documents if item.get("outcome_state") == "confirmed" and item.get("outcome_code") == "external_wait"),
        "deferred": sum(1 for item in documents if item.get("outcome_state") == "confirmed" and item.get("outcome_code") == "deferred"),
        "problem": sum(1 for item in documents if item.get("status") == "problem"),
        "active_deposit_risks": active_deposit_risks,
        "active_deal_risks": active_deal_risks,
        "proposed_risk_resolutions": sum(1 for item in risks if item.get("resolution_state") == "proposed"),
        "confirmed_risk_resolutions": sum(1 for item in risks if item.get("resolution_state") == "confirmed"),
        "legacy_resolved_without_code": sum(1 for item in risks if item.get("is_resolved") is True and not str(item.get("resolution_code") or "").strip()),
        "deposit_review_blocks": deposit_review_blocks,
        "deal_review_blocks": deal_review_blocks,
    }
    result["deposit_ready"] = (
        target_deposit_documents == 0
        and active_deposit_risks == 0
        and deposit_review_blocks == 0
    )
    result["deal_ready"] = (
        target_deal_documents == 0
        and active_deal_risks == 0
        and deal_review_blocks == 0
    )
    return result


def validate_shape(scenario: dict[str, Any], errors: list[str]) -> None:
    scenario_id = scenario.get("id") or "<no-id>"
    for document in scenario.get("documents") or []:
        code = document.get("outcome_code")
        state = document.get("outcome_state")
        if code == "replaced" and not document.get("replacement_document_id"):
            errors.append(f"{scenario_id}: replaced document lacks replacement_document_id")
        if code == "external_wait" and not document.get("external_party"):
            errors.append(f"{scenario_id}: external_wait lacks external_party")
        if code == "deferred" and not document.get("deferred_until"):
            errors.append(f"{scenario_id}: deferred lacks deferred_until")
        if code and not state:
            errors.append(f"{scenario_id}: document outcome lacks state")
    for risk in scenario.get("risks") or []:
        if risk.get("resolution_code") == "superseded" and not risk.get("superseded_by_risk_id"):
            errors.append(f"{scenario_id}: superseded risk lacks superseded_by_risk_id")
        if risk.get("resolution_code") and not risk.get("resolution_state"):
            errors.append(f"{scenario_id}: risk resolution lacks state")


def main() -> int:
    errors: list[str] = []
    for path in (FIXTURES, OUTCOME_CONTRACT, READINESS_CONTRACT, OUTCOME_SQL, READINESS_SQL, DOC, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    if data.get("status") != "synthetic_only" or data.get("production_applied") is not False:
        errors.append("fixtures must remain synthetic-only and non-production")

    scenarios = data.get("readiness_scenarios") or []
    ids = [item.get("id") for item in scenarios]
    if len(scenarios) != 15:
        errors.append(f"expected 15 readiness scenarios, got {len(scenarios)}")
    if len(ids) != len(set(ids)):
        errors.append("readiness scenario ids must be unique")

    required_scenarios = {
        "document_checked",
        "document_received_not_checked",
        "document_proposed_not_applicable",
        "document_confirmed_not_applicable",
        "document_confirmed_replaced",
        "document_external_wait",
        "document_deferred",
        "document_problem",
        "legal_risk_proposed_resolution",
        "legal_risk_confirmed_resolution",
        "mortgage_risk_proposed_resolution",
        "mortgage_risk_confirmed_resolution",
        "blocking_review_deposit",
        "blocking_review_deal",
        "legacy_resolved_risk_without_code",
    }
    if set(ids) != required_scenarios:
        errors.append(f"scenario coverage drifted: {sorted(set(ids) ^ required_scenarios)}")

    for scenario in scenarios:
        validate_shape(scenario, errors)
        actual = evaluate(scenario)
        expected = scenario.get("expected") or {}
        if actual != expected:
            errors.append(f"{scenario.get('id')}: expected={expected} actual={actual}")

    role_cases = data.get("role_decision_cases") or []
    if len(role_cases) < 14:
        errors.append("role matrix is incomplete")
    for case in role_cases:
        if case.get("item_type") == "document":
            actual = can_confirm_document(case.get("actor_role"), case.get("responsible_role"), case.get("category"))
        elif case.get("item_type") == "risk":
            actual = can_confirm_risk(case.get("actor_role"), case.get("assigned_role"))
        else:
            errors.append(f"{case.get('id')}: unknown item_type")
            continue
        if actual is not case.get("expected_can_confirm"):
            errors.append(f"{case.get('id')}: expected can_confirm={case.get('expected_can_confirm')} actual={actual}")

    funding_cases = data.get("funding_route_cases") or []
    if len(funding_cases) < 7:
        errors.append("funding route matrix is incomplete")
    for case in funding_cases:
        payments = set(case.get("payments") or [])
        broker_needed = bool(payments & MORTGAGE_PAYMENTS)
        lawyer_needed = bool(payments & LEGAL_FUNDING_PAYMENTS)
        if broker_needed is not case.get("expected_broker_needed"):
            errors.append(f"{case.get('id')}: broker routing mismatch")
        if lawyer_needed is not case.get("expected_lawyer_needed_from_funding"):
            errors.append(f"{case.get('id')}: lawyer funding routing mismatch")

    for sensitive_key in ("seller_name", "buyer_name", "seller_phone", "buyer_phone", "address", "cadastral_number"):
        if sensitive_key in FIXTURES.read_text(encoding="utf-8"):
            errors.append(f"synthetic fixtures must not contain client field {sensitive_key}")

    outcome_contract = json.loads(OUTCOME_CONTRACT.read_text(encoding="utf-8"))
    readiness_contract = json.loads(READINESS_CONTRACT.read_text(encoding="utf-8"))
    if outcome_contract.get("production_applied") is not False or readiness_contract.get("production_applied") is not False:
        errors.append("scenario matrix must depend only on non-production contracts")

    sql = READINESS_SQL.read_text(encoding="utf-8")
    for marker in (
        "nav_v2_document_outcome_is_terminal_complete",
        "nav_v2_risk_outcome_is_active",
        "legacy_resolved_without_code",
        "legacy_unresolved_deposit_documents",
        "target_unresolved_deposit_documents",
    ):
        if marker not in sql:
            errors.append(f"readiness SQL missing scenario marker {marker!r}")

    doc = DOC.read_text(encoding="utf-8")
    for marker in (
        "15 синтетических сценариев",
        "received",
        "proposed not_applicable",
        "confirmed not_applicable",
        "external_wait",
        "deferred",
        "юридического риска",
        "ипотечного риска",
        "маткапитал",
        "сертификат",
        "не вставляются в Supabase",
        "Rollback",
    ):
        if marker not in doc:
            errors.append(f"scenario documentation missing {marker!r}")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    for marker in (
        "python3 scripts/check_nav_v2_outcome_readiness_scenarios.py",
        "python3 -m py_compile scripts/check_nav_v2_outcome_readiness_scenarios.py",
        "nav-v2-outcome-readiness-scenarios",
    ):
        if marker not in workflow:
            errors.append(f"workflow missing {marker!r}")

    if errors:
        print("Navigator v2 outcome readiness scenario errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Navigator v2 outcome readiness scenarios passed: {len(scenarios)} readiness, {len(role_cases)} role and {len(funding_cases)} funding cases")
    return 0


if __name__ == "__main__":
    sys.exit(main())
