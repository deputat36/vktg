from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config/nav-v2-role-contract.json"
ROLE_MENU_PATH = ROOT / "assets/js/nav-v2/role-menu-v2.js"
ADMIN_LOADER_PATH = ROOT / "assets/js/nav-v2/admin-loader-v2.js"

ROLE_BLOCKS = {
    "lawyer": ("if (role === 'lawyer') {", "} else if (role === 'broker') {"),
    "broker": ("} else if (role === 'broker') {", "} else if (role === 'spn') {"),
    "spn": ("} else if (role === 'spn') {", "} else if (role === 'manager') {"),
    "manager": ("} else if (role === 'manager') {", "} else if (role === 'viewer') {"),
    "viewer": ("} else if (role === 'viewer') {", "} else if (role === 'owner' || role === 'admin') {"),
    "owner_admin": ("} else if (role === 'owner' || role === 'admin') {", "} else {"),
}

HREF_RE = re.compile(r'href="\.\/([^"?#]+)')


def route_set(text: str) -> set[str]:
    return set(HREF_RE.findall(text))


def extract_block(source: str, start: str, end: str) -> str | None:
    start_at = source.find(start)
    if start_at < 0:
        return None
    end_at = source.find(end, start_at + len(start))
    if end_at < 0:
        return None
    return source[start_at:end_at]


def main() -> int:
    errors: list[str] = []

    if not CONTRACT_PATH.exists():
        print("Missing config/nav-v2-role-contract.json")
        return 1
    if not ROLE_MENU_PATH.exists():
        print("Missing assets/js/nav-v2/role-menu-v2.js")
        return 1
    if not ADMIN_LOADER_PATH.exists():
        print("Missing assets/js/nav-v2/admin-loader-v2.js")
        return 1

    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if contract.get("schema_version") != 1:
        errors.append("role contract schema_version must be 1")

    expected_roles = set(ROLE_BLOCKS)
    configured_roles = set((contract.get("roles") or {}).keys())
    if configured_roles != expected_roles:
        errors.append(
            "role contract roles mismatch: "
            f"expected {sorted(expected_roles)}, got {sorted(configured_roles)}"
        )

    menu_source = ROLE_MENU_PATH.read_text(encoding="utf-8")
    admin_only = set(contract.get("admin_only_routes") or [])
    diagnostics_block = extract_block(
        menu_source,
        "function addAdminDiagnosticsLinks(links, active) {",
        "function buildMenu(role) {",
    )
    diagnostics_routes = route_set(diagnostics_block or "")
    if diagnostics_routes != {"nav-system-check-v2.html", "diagnostics-v2.html"}:
        errors.append(
            "role-menu-v2.js: delegated admin diagnostics routes differ: "
            f"got {sorted(diagnostics_routes)}"
        )

    for role, markers in ROLE_BLOCKS.items():
        block = extract_block(menu_source, markers[0], markers[1])
        if block is None:
            errors.append(f"role-menu-v2.js: cannot locate block for {role}")
            continue

        actual = route_set(block)
        if role == "owner_admin" and "addAdminDiagnosticsLinks(links, active);" in block:
            actual |= diagnostics_routes

        expected = set((contract.get("roles") or {}).get(role, {}).get("menu_routes") or [])
        if actual != expected:
            errors.append(
                f"role-menu-v2.js: routes for {role} differ: "
                f"expected {sorted(expected)}, got {sorted(actual)}"
            )

        if role != "owner_admin":
            leaked = actual & admin_only
            if leaked:
                errors.append(f"role-menu-v2.js: {role} exposes admin routes {sorted(leaked)}")

    safe_start = menu_source.find("function safeMenu()")
    safe_end = menu_source.find("function addAdminDiagnosticsLinks", safe_start)
    if safe_start < 0 or safe_end < 0:
        errors.append("role-menu-v2.js: safeMenu block not found")
    else:
        actual_safe = route_set(menu_source[safe_start:safe_end])
        expected_safe = set(contract.get("safe_menu_routes") or [])
        if actual_safe != expected_safe:
            errors.append(
                "role-menu-v2.js: safe menu differs: "
                f"expected {sorted(expected_safe)}, got {sorted(actual_safe)}"
            )

    loader = ADMIN_LOADER_PATH.read_text(encoding="utf-8")
    if "if (!['owner', 'admin'].includes(profile?.role))" not in loader:
        errors.append("admin-loader-v2.js: missing owner/admin role gate")
    if "rpc('nav_v2_get_my_profile'" not in loader:
        errors.append("admin-loader-v2.js: profile must be loaded through nav_v2_get_my_profile")

    guarded_pages = contract.get("admin_guarded_pages") or {}
    for page_name, page_key in sorted(guarded_pages.items()):
        page_path = ROOT / page_name
        if not page_path.exists():
            errors.append(f"missing guarded admin page: {page_name}")
            continue
        page_source = page_path.read_text(encoding="utf-8")
        if f'data-admin-page="{page_key}"' not in page_source:
            errors.append(f"{page_name}: missing data-admin-page={page_key!r}")
        if "admin-loader-v2.js" not in page_source:
            errors.append(f"{page_name}: must load admin-loader-v2.js")

    for route in sorted({
        route
        for role_data in (contract.get("roles") or {}).values()
        for route in (role_data.get("menu_routes") or [])
    } | set(contract.get("safe_menu_routes") or [])):
        if not (ROOT / route).exists():
            errors.append(f"role contract references missing page: {route}")

    start_source = (ROOT / "assets/js/nav-v2/start-v2.js").read_text(encoding="utf-8")
    if "const canSeeSystemCheck = role === 'owner' || role === 'admin';" not in start_source:
        errors.append("start-v2.js: system check must be owner/admin only")

    dashboard_source = (ROOT / "assets/js/nav-v2/dashboard-v2.js").read_text(encoding="utf-8")
    if "const canSeeSystemCheck = role === 'owner' || role === 'admin';" not in dashboard_source:
        errors.append("dashboard-v2.js: system check must be owner/admin only")

    if errors:
        print("Navigator v2 role contract errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 role contract passed: "
        f"{len(expected_roles)} role menus and {len(guarded_pages)} admin pages checked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
