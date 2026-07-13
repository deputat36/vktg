from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config/nav-v2-role-contract.json"
ROLE_MENU_PATH = ROOT / "assets/js/nav-v2/role-menu-v2.js"
ADMIN_LOADER_PATH = ROOT / "assets/js/nav-v2/admin-loader-v2.js"
DASHBOARD_PATH = ROOT / "assets/js/nav-v2/dashboard-v2.js"
DASHBOARD_HTML_PATH = ROOT / "dashboard-v2.html"

ROLE_BLOCKS = {
    "lawyer": ("if (role === 'lawyer') {", "} else if (role === 'broker') {"),
    "broker": ("} else if (role === 'broker') {", "} else if (role === 'spn') {"),
    "spn": ("} else if (role === 'spn') {", "} else if (role === 'manager') {"),
    "manager": ("} else if (role === 'manager') {", "} else if (role === 'viewer') {"),
    "viewer": ("} else if (role === 'viewer') {", "} else if (role === 'owner' || role === 'admin') {"),
    "owner_admin": ("} else if (role === 'owner' || role === 'admin') {", "} else {"),
}

ROLE_DASHBOARD_DESTINATIONS = {
    "manager": "./manager-v2.html",
    "spn": "./spn-v2.html",
    "lawyer": "./queue-v2.html",
    "broker": "./broker-v2.html",
    "viewer": "./viewer-v2.html",
}

HREF_RE = re.compile(r'href="\.\/([^"?#]+)')
MAKE_LINK_RE = re.compile(
    r"makeLink\(\s*[^,]+,\s*['\"][^'\"]+['\"],\s*['\"]\.\/([^'\"?]+)"
)


def route_set(text: str) -> set[str]:
    return set(HREF_RE.findall(text)) | set(MAKE_LINK_RE.findall(text))


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

    for path in (CONTRACT_PATH, ROLE_MENU_PATH, ADMIN_LOADER_PATH, DASHBOARD_PATH, DASHBOARD_HTML_PATH):
        if not path.exists():
            errors.append(f"missing required role UX file: {path.relative_to(ROOT)}")

    if errors:
        for error in errors:
            print(error)
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

    if 'aria-current="page"' not in menu_source:
        errors.append("role-menu-v2.js: active navigation item must expose aria-current=page")
    if "admin: 'администратор'" not in menu_source:
        errors.append("role-menu-v2.js: use consistent user-facing administrator label")
    if "viewer: 'наблюдатель'" not in menu_source:
        errors.append("role-menu-v2.js: use consistent user-facing viewer label")

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

    dashboard_source = DASHBOARD_PATH.read_text(encoding="utf-8")
    if "const canSeeSystemCheck = role === 'owner' || role === 'admin';" not in dashboard_source:
        errors.append("dashboard-v2.js: system check must be owner/admin only")
    if "function roleWorkspace(role)" not in dashboard_source:
        errors.append("dashboard-v2.js: missing role-aware workspace configuration")
    for role, destination in ROLE_DASHBOARD_DESTINATIONS.items():
        role_marker = f"    {role}: {{"
        start_at = dashboard_source.find(role_marker)
        if start_at < 0:
            errors.append(f"dashboard-v2.js: missing role workspace for {role}")
            continue
        next_at = dashboard_source.find("\n    },", start_at)
        block = dashboard_source[start_at:next_at if next_at >= 0 else start_at + 1200]
        if destination not in block:
            errors.append(f"dashboard-v2.js: {role} primary workspace must point to {destination}")
    if "Режим наблюдения" not in dashboard_source:
        errors.append("dashboard-v2.js: viewer workspace must explicitly explain read-only mode")

    dashboard_html = DASHBOARD_HTML_PATH.read_text(encoding="utf-8")
    if "nav-v2-role-home.css" not in dashboard_html:
        errors.append("dashboard-v2.html: role-aware dashboard stylesheet is not loaded")
    if 'aria-live="polite"' not in dashboard_html:
        errors.append("dashboard-v2.html: initial loading status must be announced")

    if errors:
        print("Navigator v2 role contract errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 role contract passed: "
        f"{len(expected_roles)} role menus, {len(guarded_pages)} admin pages and "
        f"{len(ROLE_DASHBOARD_DESTINATIONS)} role dashboard routes checked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
