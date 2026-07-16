from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260712203000_nav_v2_broker_triage_queue.sql"
PAGE = ROOT / "broker-v2.html"
MODULE = ROOT / "assets/js/nav-v2/broker-v2.js"
STYLE = ROOT / "assets/css/nav-v2-broker.css"
DASHBOARD = ROOT / "assets/js/nav-v2/dashboard-v2.js"
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
    for path in (MIGRATION, PAGE, MODULE, STYLE, DASHBOARD, MENU, ROLE_CONTRACT, RPC_SURFACE, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    sql = MIGRATION.read_text(encoding="utf-8")
    require(sql, (
        "nav_v2_get_broker_queue_preview",
        "'preview_only', true",
        "v_role not in ('owner', 'admin', 'manager', 'broker')",
        "nav_v2_private.nav_v2_can_view_deal(d.id, v_uid)",
        "d.broker_needed is true",
        "coalesce((d.deal_summary ->> 'demo') = 'true', false)",
        "'waiting_assignment'",
        "'collecting_data'",
        "'ready_for_review'",
        "'missing_finance_data'",
        "'data_contract'",
        "'not_yet_supported'",
        "'статус банковской заявки'",
        "revoke execute on function public.nav_v2_get_broker_queue_preview(integer) from anon",
        "grant execute on function public.nav_v2_get_broker_queue_preview(integer) to authenticated, service_role",
        "broker triage queue",
    ), MIGRATION.name, errors)
    function_body = sql.split(
        "create or replace function public.nav_v2_get_broker_queue_preview", 1
    )[1].split(
        "revoke all on function public.nav_v2_get_broker_queue_preview", 1
    )[0].lower()
    for marker in (
        "update public.nav_deals_v2",
        "insert into public.nav_deals_v2",
        "delete from public.nav_deals_v2",
        "update public.nav_deal_tasks_v2",
        "nav_v2_update_",
    ):
        if marker in function_body:
            errors.append(f"broker preview contains mutation marker: {marker}")

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        "assets/css/nav-v2-broker.css?v=20260712-01",
        "assets/js/nav-v2/broker-v2.js?v=20260712-01",
        "assets/js/nav-v2/role-menu-v2.js?v=20260712-04",
        'aria-live="polite"',
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "rpc('nav_v2_get_broker_queue_preview'",
        "['owner', 'admin', 'manager', 'broker']",
        "Ипотечная консультация и одобрение",
        "Только просмотр",
        "Ожидает назначения",
        "Нужно уточнить данные",
        "Готово к консультации",
        "Пока не ведётся",
        "не является банковской CRM",
        "Подготовку и оформление сделки ведут СПН и юрист",
        "Брокер не отвечает за оформление маткапитала или сертификата",
    ), MODULE.name, errors)
    for marker in ("nav_v2_update_", "nav_v2_add_", "nav_v2_save_"):
        if marker in module:
            errors.append(f"broker preview unexpectedly calls mutation surface {marker}")
    if ".from('nav_" in module or '.from("nav_' in module:
        errors.append("broker preview must not access Navigator tables directly")

    dashboard = DASHBOARD.read_text(encoding="utf-8")
    if "primaryHref: './broker-v2.html'" not in dashboard:
        errors.append("dashboard-v2.js: broker primary route is not broker-v2.html")

    menu = MENU.read_text(encoding="utf-8")
    require(menu, (
        "path.includes('broker-v2')",
        "makeLink(active, 'broker', './broker-v2.html', 'Брокерская очередь')",
        "Все финансовые сделки",
    ), MENU.name, errors)

    contract = json.loads(ROLE_CONTRACT.read_text(encoding="utf-8"))
    broker_routes = contract["roles"]["broker"]["menu_routes"]
    if "broker-v2.html" not in broker_routes:
        errors.append("role contract does not expose broker-v2.html to broker")
    for role in ("spn", "lawyer", "viewer"):
        if "broker-v2.html" in contract["roles"][role]["menu_routes"]:
            errors.append(f"role contract exposes broker-v2.html to {role}")

    surface = json.loads(RPC_SURFACE.read_text(encoding="utf-8"))
    if "nav_v2_get_broker_queue_preview" not in surface.get("frontend_api", []):
        errors.append("broker preview RPC is not classified as frontend_api")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_broker_queue.py" not in workflow:
        errors.append("static workflow does not run broker queue regression")

    if errors:
        print("Navigator v2 broker queue errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 broker queue passed: read-only mortgage triage, role route and honest responsibility boundary checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
