from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "deals-v2.html"
PAGE = ROOT / "assets/js/nav-v2/deals-v2.js"
MODEL = ROOT / "assets/js/nav-v2/deals-work-modes-v2.js"
SHARED = ROOT / "assets/js/nav-v2/dashboard-priority-v2.js"
CSS = ROOT / "assets/css/nav-v2-deals.css"
SEMANTIC = ROOT / "scripts/check-nav-v2-deals-work-modes.mjs"


def main() -> int:
    errors: list[str] = []

    for path in (HTML, PAGE, MODEL, SHARED, CSS, SEMANTIC):
        if not path.exists():
            errors.append(f"missing deals work-mode file: {path.relative_to(ROOT)}")

    if errors:
        print("Navigator v2 deals work-mode errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    html = HTML.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    model = MODEL.read_text(encoding="utf-8")
    shared = SHARED.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")

    required_html = [
        "nav-v2-deals.css?v=20260714-01",
        "deals-v2.js?v=20260715-01",
        "nav-base-menu-cleanup-v2.js",
        "role-menu-v2.js",
    ]
    for marker in required_html:
        if marker not in html:
            errors.append(f"deals-v2.html: missing {marker!r}")

    required_page = [
        "buildDealsWorkspace",
        "dealMatchesWorkMode",
        "'work', 'all', 'real', 'demo', 'attention', 'overdue', 'unassigned'",
        "data-deals-filter",
        "Быстрые режимы списка",
        "Все исходные записи",
        "Рабочие без демо и повторов",
        "Просроченные",
        "Без ответственного",
        "Готовы к задатку",
        "sourceDealsForFilter",
        "workspace.canonicalDeals",
    ]
    for marker in required_page:
        if marker not in page:
            errors.append(f"deals-v2.js: missing {marker!r}")

    rpc_calls = re.findall(r"rpc\(\s*['\"]([^'\"]+)", page)
    if rpc_calls != ["nav_v2_get_deals_list"]:
        errors.append(f"deals-v2.js: expected one read-only deals RPC, got {rpc_calls}")

    forbidden_page = [
        "localStorage",
        "sessionStorage",
        "supabase.from(",
        "insert(",
        "update(",
        "delete(",
        "nav_v2_save_",
        "nav_v2_update_",
    ]
    for marker in forbidden_page:
        if marker in page:
            errors.append(f"deals-v2.js: forbidden mutation/storage marker {marker!r}")

    required_model = [
        "buildWorkingDealSet",
        "isOverdueDeal",
        "hasMissingResponsibility",
        "needsWorkAttention",
        "dealMatchesWorkMode",
        "buildDealsWorkspace",
        "['work', 'attention', 'overdue', 'unassigned', 'deposit']",
        "['work', 'attention', 'overdue', 'docs', 'deposit']",
        "['lawyer', 'red', 'overdue', 'docs']",
        "['broker', 'overdue', 'unassigned', 'deposit']",
    ]
    for marker in required_model:
        if marker not in model:
            errors.append(f"deals-work-modes-v2.js: missing {marker!r}")

    for marker in ("document.", "window.", "rpc(", "localStorage", "sessionStorage"):
        if marker in model:
            errors.append(f"deals-work-modes-v2.js: pure model contains browser/RPC marker {marker!r}")

    if "export function buildWorkingDealSet" not in shared:
        errors.append("dashboard-priority-v2.js: shared working-set export is missing")
    if "const workingSet = buildWorkingDealSet(deals);" not in shared:
        errors.append("dashboard-priority-v2.js: dashboard must consume the shared working set")

    required_css = [
        ".deals-quick-modes",
        ".deals-quick-mode.active",
        ".deals-advanced-filters",
        ".deals-work-next",
        "overflow-x:auto",
    ]
    for marker in required_css:
        if marker not in css:
            errors.append(f"nav-v2-deals.css: missing {marker!r}")

    if errors:
        print("Navigator v2 deals work-mode errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 deals work-mode contract passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
