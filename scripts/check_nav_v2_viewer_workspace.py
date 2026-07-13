from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260713090856_nav_v2_viewer_operational_workspace.sql"
PAGE = ROOT / "viewer-v2.html"
MODULE = ROOT / "assets/js/nav-v2/viewer-v2.js"
STYLE = ROOT / "assets/css/nav-v2-viewer.css"
DASHBOARD = ROOT / "assets/js/nav-v2/dashboard-v2.js"
MENU = ROOT / "assets/js/nav-v2/role-menu-v2.js"
ROLE_CONTRACT = ROOT / "config/nav-v2-role-contract.json"
MODULE_BUDGET = ROOT / "config/nav-v2-module-budget.json"
AUTH_TEST = ROOT / "tests/e2e/authenticated-smoke.spec.js"
PUBLIC_TEST = ROOT / "tests/e2e/public-smoke.spec.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (
        MIGRATION,
        PAGE,
        MODULE,
        STYLE,
        DASHBOARD,
        MENU,
        ROLE_CONTRACT,
        MODULE_BUDGET,
        AUTH_TEST,
        PUBLIC_TEST,
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
        "nav_v2_get_operational_readiness_preview(integer)",
        "v_role not in ('owner', 'admin', 'manager', 'viewer')",
        "v_role = 'viewer'",
        "nav_v2_private.nav_v2_can_view_deal(d.id, v_uid)",
        "operational readiness role gate drifted",
        "operational readiness deal scope drifted",
        "notify pgrst, 'reload schema'",
    ), MIGRATION.name, errors)
    for marker in (
        "update public.nav_deals_v2",
        "insert into public.nav_deals_v2",
        "delete from public.nav_deals_v2",
        "grant select on",
        "alter policy",
    ):
        if marker in sql.lower():
            errors.append(f"viewer migration contains unexpected data/RLS mutation: {marker}")

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        "assets/css/nav-v2-viewer.css?v=20260713-01",
        "assets/js/nav-v2/viewer-v2.js?v=20260713-01",
        "assets/js/nav-v2/role-menu-v2.js?v=20260713-01",
        'aria-live="polite"',
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "rpc('nav_v2_get_operational_readiness_preview'",
        "['owner', 'admin', 'viewer']",
        "Режим наблюдения",
        "Только просмотр",
        "правдивая готовность",
        "Почему нельзя двигаться дальше",
        "Ответственный",
        "Ближайшая дата",
        "История сделки",
        "#history",
    ), MODULE.name, errors)
    for marker in ("nav_v2_update_", "nav_v2_add_", "nav_v2_save_", "nav_v2_invite_"):
        if marker in module:
            errors.append(f"viewer workspace calls mutation surface {marker}")
    if ".from('nav_" in module or '.from("nav_' in module:
        errors.append("viewer workspace must not access Navigator tables directly")

    style = STYLE.read_text(encoding="utf-8")
    require(style, (
        ".viewer-main-obstacle",
        ".viewer-next",
        ".viewer-responsibles",
        ".viewer-details",
        "@media(max-width:700px)",
    ), STYLE.name, errors)

    dashboard = DASHBOARD.read_text(encoding="utf-8")
    if "primaryHref: './viewer-v2.html'" not in dashboard:
        errors.append("dashboard-v2.js: viewer primary route is not viewer-v2.html")

    menu = MENU.read_text(encoding="utf-8")
    require(menu, (
        "path.includes('viewer-v2')",
        "makeLink(active, 'viewer', './viewer-v2.html', 'Обзор')",
    ), MENU.name, errors)

    contract = json.loads(ROLE_CONTRACT.read_text(encoding="utf-8"))
    viewer_routes = set(contract["roles"]["viewer"]["menu_routes"])
    if viewer_routes != {"viewer-v2.html", "deals-v2.html"}:
        errors.append(f"viewer role routes differ: {sorted(viewer_routes)}")
    for role in ("manager", "spn", "lawyer", "broker"):
        if "viewer-v2.html" in contract["roles"][role]["menu_routes"]:
            errors.append(f"role contract exposes viewer-v2.html to {role}")

    budget = json.loads(MODULE_BUDGET.read_text(encoding="utf-8"))
    if budget.get("pages", {}).get("viewer-v2.html", {}).get("max_modules") != 3:
        errors.append("viewer-v2.html module budget must be 3")

    auth_test = AUTH_TEST.read_text(encoding="utf-8")
    public_test = PUBLIC_TEST.read_text(encoding="utf-8")
    require(auth_test, ("role === 'viewer'", "'/viewer-v2.html'", "Обзор сделок|Режим наблюдения"), AUTH_TEST.name, errors)
    if "'/viewer-v2.html'" not in public_test:
        errors.append("public smoke does not include viewer-v2.html guest gate")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_viewer_workspace.py" not in workflow:
        errors.append("static workflow does not run viewer workspace regression")

    if errors:
        print("Navigator v2 viewer workspace errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 viewer workspace passed: truthful read-only summary, scoped server access and role route checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
