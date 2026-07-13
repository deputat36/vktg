from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260713223000_nav_v2_manager_source_remediation_plan.sql"
PAGE = ROOT / "manager-source-remediation-v2.html"
MODULE = ROOT / "assets/js/nav-v2/manager-source-remediation-v2.js"
MENU = ROOT / "assets/js/nav-v2/role-menu-v2.js"
ROLE_CONTRACT = ROOT / "config/nav-v2-role-contract.json"
RPC_REGISTRY = ROOT / "config/nav-v2-rpc-surface.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-manager-source-remediation.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (MIGRATION, PAGE, MODULE, MENU, ROLE_CONTRACT, RPC_REGISTRY, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    sql = MIGRATION.read_text(encoding="utf-8")
    require(sql, (
        "nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(",
        "security definer",
        "set search_path = public, pg_temp",
        "v_role is null or v_role not in ('owner', 'admin', 'manager')",
        "nav_v2_get_manager_assignment_proposal_unchecked_20260713(500)",
        "'deal_field_points_to_non_spn'",
        "'profile_manager_missing'",
        "'deal_spn_missing'",
        "'execution_order'",
        "'mutation_available', false",
        "'report_version', 4",
        "'manager_source_remediation_plan', v_remediation_plan",
        "revoke execute on function nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(integer) from anon, authenticated",
        "grant execute on function nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(integer) to service_role",
        "Manager source remediation implementation must remain private",
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
            errors.append(f"source remediation migration must remain read-only: {forbidden}")

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        'aria-live="polite"',
        "manager-source-remediation-v2.js?v=20260713-01",
        "role-menu-v2.js?v=20260713-02",
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "rpc('nav_v2_get_operational_adoption_report'",
        "manager_source_remediation_plan",
        "Что исправить до назначения менеджера",
        "Порядок исправления",
        "Группы ручного исправления",
        "Автоматические исправления и массовые назначения отключены",
        "Затронутые сделки",
        "mutation_available",
        "operational-adoption-v2.html",
    ), MODULE.name, errors)
    if module.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("remediation UI must use exactly one existing adoption report RPC call")
    for forbidden in (
        "nav_v2_get_manager_source_remediation_plan_unchecked_20260713",
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        ".from('nav_",
        '.from("nav_',
    ):
        if forbidden in module:
            errors.append(f"remediation UI must remain read-only: {forbidden}")

    menu = MENU.read_text(encoding="utf-8")
    require(menu, (
        "path.includes('manager-source-remediation-v2')",
        "makeLink(active, 'remediation', './manager-source-remediation-v2.html', 'Исправить источники')",
        "'dashboard', 'spn', 'deals', 'manager', 'adoption', 'remediation', 'queue'",
    ), MENU.name, errors)

    contract = json.loads(ROLE_CONTRACT.read_text(encoding="utf-8"))
    route = "manager-source-remediation-v2.html"
    for role in ("owner_admin", "manager"):
        if route not in contract["roles"][role]["menu_routes"]:
            errors.append(f"role contract missing remediation route for {role}")
    for role in ("spn", "lawyer", "broker", "viewer"):
        if route in contract["roles"][role]["menu_routes"]:
            errors.append(f"role contract exposes remediation route to {role}")

    registry = json.loads(RPC_REGISTRY.read_text(encoding="utf-8"))
    helper = "nav_v2_get_manager_source_remediation_plan_unchecked_20260713"
    for category in ("frontend_api", "admin_api", "demo_api"):
        if helper in registry.get(category, []):
            errors.append(f"private remediation helper leaked into {category}")
    if registry.get("frontend_api", []).count("nav_v2_get_operational_adoption_report") != 1:
        errors.append("existing adoption report RPC must remain the only remediation browser endpoint")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "python3 scripts/check_nav_v2_manager_source_remediation.py",
        "python3 scripts/check_nav_v2_role_contract.py",
        "python3 scripts/check_nav_v2_rpc_surface.py",
        "python3 scripts/check_nav_v2_release_integrity_v2.py",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 manager source remediation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 manager source remediation passed: grouped manual actions, "
        "one existing browser RPC, role-safe route and mutation disabled"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
