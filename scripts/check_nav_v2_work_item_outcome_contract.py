from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-work-item-outcome-contract.json"
PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_work_item_outcomes.sql"
DOC = ROOT / "docs/NAV_V2_WORK_ITEM_OUTCOME_CONTRACT_2026-07-16.md"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (CONTRACT, PROTOTYPE, DOC):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    sql = PROTOTYPE.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    lowered = sql.lower()

    if contract.get("status") != "repository_only_prototype":
        errors.append("contract status drifted")
    if contract.get("production_applied") is not False:
        errors.append("prototype must remain non-production")
    if contract.get("prototype_path") != PROTOTYPE.relative_to(ROOT).as_posix():
        errors.append("prototype path drifted")

    expected_document_codes = {"not_applicable", "replaced", "cancelled", "external_wait", "deferred"}
    actual_document_codes = set((contract.get("document_outcome_codes") or {}).keys())
    if actual_document_codes != expected_document_codes:
        errors.append(f"document outcome codes drifted: {sorted(actual_document_codes)}")

    expected_risk_codes = {"mitigated", "not_applicable", "superseded", "accepted_by_specialist", "cancelled"}
    actual_risk_codes = set((contract.get("risk_resolution_codes") or {}).keys())
    if actual_risk_codes != expected_risk_codes:
        errors.append(f"risk resolution codes drifted: {sorted(actual_risk_codes)}")

    if set(contract.get("proposal_states") or []) != {"proposed", "confirmed", "rejected"}:
        errors.append("proposal states drifted")

    require(sql, (
        "REPOSITORY-ONLY PROTOTYPE",
        "add column if not exists outcome_code text",
        "add column if not exists resolution_code text",
        "nav_document_outcome_shape_check",
        "nav_risk_resolution_shape_check",
        "create or replace function public.nav_v2_propose_document_outcome",
        "create or replace function public.nav_v2_decide_document_outcome",
        "create or replace function public.nav_v2_propose_risk_resolution",
        "create or replace function public.nav_v2_decide_risk_resolution",
        "nav_v2_private.nav_v2_can_confirm_document_outcome",
        "nav_v2_private.nav_v2_can_confirm_risk_outcome",
        "'document_outcome_proposed'",
        "'document_outcome_confirmed'",
        "'risk_resolution_proposed'",
        "'risk_resolution_confirmed'",
        "p_responsible_role = 'broker'::public.nav_v2_user_role",
        "p_assigned_role = 'broker'::public.nav_v2_user_role",
        "v_state := case when v_terminal then 'proposed' else 'confirmed' end",
        "resolution_state = 'proposed'",
        "is_resolved = false",
        "Production rollout must also",
    ), PROTOTYPE.name, errors)

    for code in sorted(expected_document_codes | expected_risk_codes):
        if f"'{code}'" not in sql:
            errors.append(f"prototype does not contain outcome code {code!r}")

    forbidden = (
        "update public.nav_deal_documents_v2 set status = 'checked'",
        "update public.nav_deal_risks_v2 set is_resolved = true where",
        "grant execute on function",
        "revoke execute on function",
        "delete from public.nav_deal_documents_v2",
        "delete from public.nav_deal_risks_v2",
    )
    for marker in forbidden:
        if marker in lowered:
            errors.append(f"prototype contains forbidden shortcut {marker!r}")

    if PROTOTYPE.parent.name != "prototypes" or "migrations" in PROTOTYPE.parts:
        errors.append("prototype must remain outside migrations")

    forbidden_shortcuts = set(contract.get("forbidden_shortcuts") or [])
    for required in (
        "SPN confirms lawyer-assigned risk",
        "SPN confirms broker-assigned mortgage risk",
        "resolved=true without resolution_code",
        "bulk auto-resolution of existing production rows",
    ):
        if required not in forbidden_shortcuts:
            errors.append(f"contract missing forbidden shortcut {required!r}")

    require(doc, (
        "repository-only prototype",
        "49 рисков открыты",
        "external_wait",
        "deferred",
        "accepted_by_specialist",
        "СПН не должен самостоятельно",
        "Ипотечный брокер",
        "Маткапитал, сертификаты",
        "Production gate",
        "Rollback",
        "без изменений",
    ), DOC.name, errors)

    if "Authenticated role/mutation regression" not in str(contract.get("production_gate", "")):
        errors.append("production gate must require authenticated role/mutation regression")

    if errors:
        print("Navigator v2 work-item outcome contract errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 work-item outcome contract passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
