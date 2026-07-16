from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-outcome-readiness-contract.json"
PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_outcome_readiness_preview.sql"
OUTCOME_PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_work_item_outcomes.sql"
DOC = ROOT / "docs/NAV_V2_OUTCOME_READINESS_PROTOTYPE_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-outcome-readiness-prototype.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (CONTRACT, PROTOTYPE, OUTCOME_PROTOTYPE, DOC, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    sql = PROTOTYPE.read_text(encoding="utf-8")
    lowered = sql.lower()
    doc = DOC.read_text(encoding="utf-8")
    outcome_sql = OUTCOME_PROTOTYPE.read_text(encoding="utf-8")

    if contract.get("status") != "repository_only_prototype":
        errors.append("contract status drifted")
    if contract.get("production_applied") is not False:
        errors.append("readiness prototype must remain non-production")
    if contract.get("prototype_path") != PROTOTYPE.relative_to(ROOT).as_posix():
        errors.append("prototype path drifted")
    if contract.get("depends_on") != OUTCOME_PROTOTYPE.relative_to(ROOT).as_posix():
        errors.append("outcome prototype dependency drifted")

    require(outcome_sql, (
        "add column if not exists outcome_code text",
        "add column if not exists outcome_state text",
        "add column if not exists resolution_code text",
        "add column if not exists resolution_state text",
    ), OUTCOME_PROTOTYPE.name, errors)

    require(sql, (
        "REPOSITORY-ONLY PROTOTYPE",
        "create or replace function nav_v2_private.nav_v2_document_outcome_is_terminal_complete",
        "coalesce(p_status, '') = 'checked'",
        "p_outcome_state, '') = 'confirmed'",
        "'not_applicable', 'replaced', 'cancelled'",
        "create or replace function nav_v2_private.nav_v2_risk_outcome_is_active",
        "when coalesce(p_resolution_state, '') = 'confirmed'",
        "when coalesce(p_resolution_state, '') in ('proposed', 'rejected') then true",
        "create or replace function public.nav_v2_get_outcome_readiness_preview",
        "nav_v2_private.nav_v2_can_view_deal(d.id, v_uid)",
        "doc.status = 'received'",
        "proposed_terminal_outcomes",
        "external_wait",
        "deferred",
        "legacy_resolved_without_code",
        "active_required_for_deposit",
        "active_required_for_deal",
        "legacy_unresolved_deposit_documents",
        "target_unresolved_deposit_documents",
        "'preview_only', true",
        "No grants are added in this prototype",
        "No status guard, readiness field, document status, outcome state or risk row is changed",
    ), PROTOTYPE.name, errors)

    for forbidden in contract.get("forbidden_behavior") or []:
        normalized = str(forbidden).lower()
        if normalized in lowered:
            errors.append(f"prototype contains forbidden behavior marker {forbidden!r}")

    for forbidden in (
        "update public.nav_deals_v2",
        "update public.nav_deal_documents_v2",
        "update public.nav_deal_risks_v2",
        "delete from public.nav_deals_v2",
        "delete from public.nav_deal_documents_v2",
        "delete from public.nav_deal_risks_v2",
        "grant execute on function",
        "revoke execute on function",
        "'seller_name'",
        "'buyer_name'",
        "'seller_phone'",
        "'buyer_phone'",
        "'wizard_snapshot'",
        "'deal_summary'",
    ):
        if forbidden in lowered:
            errors.append(f"prototype contains forbidden SQL marker {forbidden!r}")

    if PROTOTYPE.parent.name != "prototypes" or "migrations" in PROTOTYPE.parts:
        errors.append("readiness SQL must remain outside migrations")

    expected_item_keys = set(contract.get("preview_item_keys") or [])
    for key in expected_item_keys:
        if f"'{key}'" not in sql:
            errors.append(f"preview item key missing from SQL: {key}")
    for group_name in (
        "deposit_keys",
        "deal_keys",
        "document_count_keys",
        "risk_count_keys",
        "review_count_keys",
        "legacy_comparison_keys",
    ):
        for key in contract.get(group_name) or []:
            if f"'{key}'" not in sql:
                errors.append(f"{group_name}: key missing from SQL: {key}")

    document_rules = contract.get("document_completion_rules") or {}
    if document_rules.get("checked") != "complete":
        errors.append("checked must remain the normal completion state")
    if document_rules.get("received") != "active_until_checked":
        errors.append("received must remain active until checked")
    if document_rules.get("proposed_terminal") != "active_pending_confirmation":
        errors.append("proposed terminal outcome must remain active")
    if document_rules.get("external_wait") != "active_waiting_external_party":
        errors.append("external_wait semantics drifted")

    risk_rules = contract.get("risk_rules") or {}
    if risk_rules.get("proposed_resolution") != "active_and_blocking_if_original_risk_blocks":
        errors.append("proposed risk resolution must not remove the block")
    if "backfill_review" not in str(risk_rules.get("legacy_is_resolved_true_without_code", "")):
        errors.append("legacy resolved risks must be flagged for backfill review")

    require(doc, (
        "repository-only prototype",
        "received",
        "ещё не проверен",
        "proposed",
        "external_wait",
        "deferred",
        "legacy",
        "target",
        "Ипотечный брокер",
        "Маткапитал, сертификаты",
        "Production gate",
        "Rollback",
        "без изменений",
    ), DOC.name, errors)

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "python3 scripts/check_nav_v2_outcome_readiness_prototype.py",
        "python3 -m py_compile scripts/check_nav_v2_outcome_readiness_prototype.py",
        "nav-v2-outcome-readiness-prototype",
    ), WORKFLOW.name, errors)

    if "authenticated role/mutation" not in str(contract.get("production_gate", "")).lower():
        errors.append("production gate must require authenticated role/mutation tests")

    if errors:
        print("Navigator v2 outcome readiness prototype errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 outcome readiness prototype passed: checked-only completion, confirmed exceptions, active proposals/waits and no production mutation")
    return 0


if __name__ == "__main__":
    sys.exit(main())
