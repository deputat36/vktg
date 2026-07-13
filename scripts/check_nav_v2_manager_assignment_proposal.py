from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260713213000_nav_v2_manager_assignment_proposal.sql"
PAGE = ROOT / "operational-adoption-v2.html"
MODULE = ROOT / "assets/js/nav-v2/operational-adoption-v2.js"
REGISTRY = ROOT / "config/nav-v2-rpc-surface.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (MIGRATION, PAGE, MODULE, REGISTRY, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    sql = MIGRATION.read_text(encoding="utf-8")
    require(sql, (
        "nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(",
        "security definer",
        "set search_path = public, pg_temp",
        "v_role is null or v_role not in ('owner', 'admin', 'manager')",
        "'already_assigned'",
        "'single_candidate'",
        "'conflict'",
        "'missing_source'",
        "'seller_role_not_spn'",
        "'buyer_role_not_spn'",
        "'seller_manager_missing'",
        "'buyer_manager_missing'",
        "'mutation_available', false",
        "'source_policy', 'assigned_spn_manager_id_only'",
        "nav_v2_get_manager_assignment_proposal_unchecked_20260713(",
        "'report_version', 3",
        "'manager_assignment_proposal', v_manager_proposal",
        "revoke execute on function nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer) from anon, authenticated",
        "grant execute on function nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer) to service_role",
        "Manager assignment proposal implementation must remain private",
    ), MIGRATION.name, errors)

    lowered = sql.lower()
    for forbidden in (
        "update public.nav_deals_v2",
        "update public.nav_user_profiles",
        "insert into public.nav_deals_v2",
        "insert into public.nav_user_profiles",
        "delete from public.nav_deals_v2",
        "delete from public.nav_user_profiles",
    ):
        if forbidden in lowered:
            errors.append(f"manager proposal migration must remain read-only: {forbidden}")

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        "assets/js/nav-v2/operational-adoption-v2.js?v=20260713-03",
        'aria-live="polite"',
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "function managerProposal()",
        "function managerProposalBlock()",
        "function proposalCard(item)",
        "Кого можно предложить менеджером",
        "Никаких назначений",
        "Автоназначение отключено",
        "Решение владельца",
        "Проблемы источника",
        "Следующее безопасное действие",
        "manager_assignment_proposal",
        "rpc('nav_v2_get_operational_adoption_report'",
    ), MODULE.name, errors)
    if module.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("manager proposal UI must reuse exactly one adoption report RPC call")
    for forbidden in (
        "nav_v2_get_manager_assignment_proposal_unchecked_20260713",
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        ".from('nav_",
        '.from("nav_',
    ):
        if forbidden in module:
            errors.append(f"manager proposal UI must remain on the curated read-only RPC surface: {forbidden}")

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    helper = "nav_v2_get_manager_assignment_proposal_unchecked_20260713"
    if registry.get("internal_only", []).count(helper) != 1:
        errors.append("manager proposal helper must be classified exactly once as internal_only")
    for category in ("frontend_api", "admin_api", "demo_api"):
        if helper in registry.get(category, []):
            errors.append(f"manager proposal helper leaked into {category}")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_manager_assignment_proposal.py" not in workflow:
        errors.append("static workflow does not run manager proposal regression")

    if errors:
        print("Navigator v2 manager assignment proposal errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 manager assignment proposal passed: one read-only browser RPC, "
        "private source derivation, explicit states/reasons and mutation disabled"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
