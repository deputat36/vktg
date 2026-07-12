from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260712162609_nav_v2_operational_readiness_manager_queue.sql"
PAGE = ROOT / "manager-v2.html"
MODULE = ROOT / "assets/js/nav-v2/manager-v2.js"
MENU = ROOT / "assets/js/nav-v2/role-menu-v2.js"
ROLE_CONTRACT = ROOT / "config/nav-v2-role-contract.json"
RPC_SURFACE = ROOT / "config/nav-v2-rpc-surface.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (MIGRATION, PAGE, MODULE, MENU, ROLE_CONTRACT, RPC_SURFACE, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    sql = MIGRATION.read_text(encoding="utf-8")
    require(
        sql,
        (
            "nav_v2_get_operational_readiness_preview",
            "'preview_only', true",
            "'operational_readiness_percent'",
            "'operational_blockers'",
            "'missing_critical_data'",
            "'next_action_owner_id'",
            "'next_action_owner_role'",
            "'next_action_due_date'",
            "'stale_days'",
            "'needs_manager_attention'",
            "'cannot_advance_reason'",
            "manager_exception_reason",
            "blocking_risks_count > 0 then 60",
            "overdue_required_documents_count > 0 then 65",
            "then 59",
            "v_role not in ('owner', 'admin', 'manager')",
            "coalesce((d.deal_summary ->> 'demo') = 'true', false)",
            "revoke execute on function public.nav_v2_get_operational_readiness_preview(integer) from anon",
            "coalesce(jsonb_agg(jsonb_build_object(",
        ),
        MIGRATION.name,
        errors,
    )
    function_body = sql.split("create or replace function public.nav_v2_get_operational_readiness_preview", 1)[1].split(
        "revoke all on function public.nav_v2_get_operational_readiness_preview", 1
    )[0].lower()
    for forbidden in ("update public.nav_deals_v2", "insert into public.nav_deals_v2", "delete from public.nav_deals_v2"):
        if forbidden in function_body:
            errors.append(f"read-only preview contains forbidden deal mutation: {forbidden}")
    if "jsonb_strip_nulls" in function_body:
        errors.append("preview must preserve required keys when a value is null")

    page = PAGE.read_text(encoding="utf-8")
    require(
        page,
        (
            "Content-Security-Policy",
            "assets/js/nav-v2/manager-v2.js?v=20260712-01",
            "assets/js/nav-v2/role-menu-v2.js?v=20260712-01",
        ),
        PAGE.name,
        errors,
    )

    module = MODULE.read_text(encoding="utf-8")
    require(
        module,
        (
            "rpc('nav_v2_get_operational_readiness_preview'",
            "['owner', 'admin', 'manager']",
            "Почему в очереди",
            "Главное действие",
            "Ответственный и срок",
            "Безопасный предварительный просмотр",
            "Старая к задатку",
            "Операционная",
        ),
        MODULE.name,
        errors,
    )
    for mutation_marker in ("nav_v2_update_", "nav_v2_add_", "nav_v2_save_"):
        if mutation_marker in module:
            errors.append(f"manager preview unexpectedly calls mutation surface {mutation_marker}")

    menu = MENU.read_text(encoding="utf-8")
    if menu.count("./manager-v2.html") != 2:
        errors.append("role menu must expose manager-v2 exactly to manager and owner/admin")

    role_contract = json.loads(ROLE_CONTRACT.read_text(encoding="utf-8"))
    for role in ("manager", "owner_admin"):
        routes = role_contract["roles"][role]["menu_routes"]
        if "manager-v2.html" not in routes:
            errors.append(f"role contract does not expose manager-v2.html to {role}")
    for role in ("spn", "lawyer", "broker", "viewer"):
        if "manager-v2.html" in role_contract["roles"][role]["menu_routes"]:
            errors.append(f"role contract leaks manager-v2.html to {role}")

    rpc_surface = json.loads(RPC_SURFACE.read_text(encoding="utf-8"))
    if "nav_v2_get_operational_readiness_preview" not in rpc_surface["frontend_api"]:
        errors.append("operational preview RPC is not classified as frontend_api")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_operational_readiness.py" not in workflow:
        errors.append("static workflow does not run operational readiness regression")

    if errors:
        print("Navigator v2 operational readiness errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 operational readiness passed: read-only server preview and manager queue checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
