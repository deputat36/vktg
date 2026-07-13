from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260713193000_nav_v2_operational_adoption_report.sql"
GUARD_MIGRATION = ROOT / "supabase/migrations/20260713193500_nav_v2_operational_adoption_active_profile_guard.sql"
PAGE = ROOT / "operational-adoption-v2.html"
MODULE = ROOT / "assets/js/nav-v2/operational-adoption-v2.js"
ROLE_MENU = ROOT / "assets/js/nav-v2/role-menu-v2.js"
ROLE_CONTRACT = ROOT / "config/nav-v2-role-contract.json"
RPC_REGISTRY = ROOT / "config/nav-v2-rpc-surface.json"
ADVISOR_SCOPE = ROOT / "config/nav-v2-advisor-scope.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def assert_read_only(sql: str, label: str, errors: list[str]) -> None:
    lowered_sql = sql.lower()
    for forbidden in (
        "update public.nav_deals_v2",
        "update public.nav_deal_tasks_v2",
        "update public.nav_deal_risks_v2",
        "update public.nav_deal_documents_v2",
        "insert into public.nav_deals_v2",
        "insert into public.nav_deal_tasks_v2",
        "insert into public.nav_deal_risks_v2",
        "insert into public.nav_deal_documents_v2",
        "delete from public.nav_deals_v2",
        "delete from public.nav_deal_tasks_v2",
        "delete from public.nav_deal_risks_v2",
        "delete from public.nav_deal_documents_v2",
    ):
        if forbidden in lowered_sql:
            errors.append(f"{label} must remain read-only: {forbidden}")


def main() -> int:
    errors: list[str] = []
    paths = (
        MIGRATION,
        GUARD_MIGRATION,
        PAGE,
        MODULE,
        ROLE_MENU,
        ROLE_CONTRACT,
        RPC_REGISTRY,
        ADVISOR_SCOPE,
        WORKFLOW,
    )
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")

    if errors:
        print("\n".join(errors))
        return 1

    sql = MIGRATION.read_text(encoding="utf-8")
    require(sql, (
        "create or replace function public.nav_v2_get_operational_adoption_report(",
        "security definer",
        "set search_path = public, pg_temp",
        "activity_without_result",
        "confirmed_results",
        "meaningful_events",
        "missing_manager",
        "missing_spn",
        "missing_next_action",
        "'preview_only', true",
        "revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon",
        "grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer) to authenticated, service_role",
        "nav_v2_get_operational_adoption_report'),",
        "Operational adoption report definition drifted",
    ), MIGRATION.name, errors)
    assert_read_only(sql, MIGRATION.name, errors)

    guard_sql = GUARD_MIGRATION.read_text(encoding="utf-8")
    require(guard_sql, (
        "set schema nav_v2_private",
        "rename to nav_v2_get_operational_adoption_report_unchecked_20260713",
        "revoke all on function nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(integer, integer)",
        "from public, anon, authenticated",
        "create or replace function public.nav_v2_get_operational_adoption_report(",
        "if not exists (",
        "p.is_active is true",
        "'manager'::public.nav_v2_user_role",
        "return nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(",
        "Operational adoption active-profile wrapper drifted",
        "Internal operational adoption implementation is executable by a browser role",
    ), GUARD_MIGRATION.name, errors)
    assert_read_only(guard_sql, GUARD_MIGRATION.name, errors)

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        "aria-live=\"polite\"",
        "assets/js/nav-v2/operational-adoption-v2.js?v=20260713-03",
        "assets/js/nav-v2/role-menu-v2.js?v=20260713-01",
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "rpc('nav_v2_get_operational_adoption_report'",
        "p_days: periodDays",
        "['owner', 'admin', 'manager']",
        "Активность без результата",
        "Подтверждённый результат",
        "Никакие сделки, задачи, риски, документы и назначения здесь не изменяются",
        "data-period",
        "data-filter",
    ), MODULE.name, errors)
    for forbidden in (
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        ".from('nav_",
        '.from("nav_',
    ):
        if forbidden in module:
            errors.append(f"operational adoption UI must remain read-only: {forbidden}")

    menu = ROLE_MENU.read_text(encoding="utf-8")
    require(menu, (
        "path.includes('operational-adoption-v2')",
        "makeLink(active, 'adoption', './operational-adoption-v2.html', 'Движение и результат')",
        "'dashboard', 'spn', 'deals', 'manager', 'adoption', 'queue'",
    ), ROLE_MENU.name, errors)

    role_contract = json.loads(ROLE_CONTRACT.read_text(encoding="utf-8"))
    route = "operational-adoption-v2.html"
    for role in ("owner_admin", "manager"):
        routes = set(role_contract["roles"][role]["menu_routes"])
        if route not in routes:
            errors.append(f"role contract missing {route} for {role}")
    for role in ("spn", "lawyer", "broker", "viewer"):
        routes = set(role_contract["roles"][role]["menu_routes"])
        if route in routes:
            errors.append(f"role contract unexpectedly exposes {route} to {role}")

    registry = json.loads(RPC_REGISTRY.read_text(encoding="utf-8"))
    rpc_name = "nav_v2_get_operational_adoption_report"
    internal_name = "nav_v2_get_operational_adoption_report_unchecked_20260713"
    if registry.get("frontend_api", []).count(rpc_name) != 1:
        errors.append("operational adoption RPC must be registered exactly once in frontend_api")
    for category in ("admin_api", "demo_api", "internal_only"):
        if rpc_name in registry.get(category, []):
            errors.append(f"operational adoption RPC must not be registered in {category}")
    if registry.get("internal_only", []).count(internal_name) != 1:
        errors.append("internal operational adoption implementation must be classified exactly once")
    for category in ("frontend_api", "admin_api", "demo_api"):
        if internal_name in registry.get(category, []):
            errors.append(f"internal operational adoption implementation leaked into {category}")

    advisor = json.loads(ADVISOR_SCOPE.read_text(encoding="utf-8"))
    external = sum(len(registry.get(category, [])) for category in ("frontend_api", "admin_api", "demo_api"))
    exceptions = len(advisor["authenticated_security_definer"]["security_invoker_exceptions"])
    expected = advisor["authenticated_security_definer"]["expected_warning_count"]
    if expected != external - exceptions:
        errors.append(
            f"Advisor expected warning count drift: expected {external - exceptions}, config has {expected}"
        )

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_operational_adoption.py" not in workflow:
        errors.append("static workflow does not run operational adoption regression")

    if errors:
        print("Navigator v2 operational adoption errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 operational adoption passed: read-only report, active-profile wrapper, "
        "private implementation, role routes and registry/Advisor alignment checked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
