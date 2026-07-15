from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "assets/js/nav-v2/ux-metrics-model-v2.js"
SESSION = ROOT / "assets/js/nav-v2/ux-metrics-session-v2.js"
PAGE_MODULE = ROOT / "assets/js/nav-v2/ux-metrics-v2.js"
PAGE = ROOT / "ux-metrics-v2.html"
CLEANUP = ROOT / "assets/js/nav-v2/nav-base-menu-cleanup-v2.js"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
PUBLIC_SMOKE = ROOT / "tests/e2e/public-smoke.spec.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-privacy-safe-ux-metrics.mjs"
WORKFLOW = ROOT / ".github/workflows/nav-v2-privacy-safe-ux-metrics.yml"
DAILY_PAGES = tuple(ROOT / name for name in (
    "dashboard-v2.html",
    "deals-v2.html",
    "deal-card-v2.html",
    "manager-v2.html",
))


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (MODEL, SESSION, PAGE_MODULE, PAGE, CLEANUP, BUDGET, PUBLIC_SMOKE, SEMANTIC, WORKFLOW, *DAILY_PAGES)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "navigator_v2_privacy_safe_ux_metrics",
        "buildPrivacySafeServerMetrics",
        "buildPrivacySafeUxReport",
        "summarizePrivacySafeJourneys",
        "returned_to_spn_rework",
        "spn_rework_submitted",
        "deal_review_added",
        "comment_added_with_review",
        "confirmed_result_requires_server_event_and_current_state_match: true",
        "contains_deal_ids: false",
        "contains_names: false",
        "contains_addresses: false",
        "contains_comments: false",
        "sends_network_telemetry: false",
        "local_storage_used: false",
    ), MODEL.name, errors)

    session = SESSION.read_text(encoding="utf-8")
    require(session, (
        "sessionStorage.getItem(STORAGE_KEY)",
        "sessionStorage.setItem(STORAGE_KEY",
        "sessionStorage.removeItem(STORAGE_KEY)",
        "mobile-first-screen-primary-action",
        "page,",
        "viewport: viewportBucket()",
        "clicksToMain:",
        "elapsedBucket:",
        "installPrivacySafeUxJourneyMeasurement",
    ), SESSION.name, errors)
    for marker in (
        "localStorage",
        "fetch(",
        "rpc(",
        "XMLHttpRequest",
        "sendBeacon",
        "href:",
        "url:",
        "dealId",
        "entityId",
        "email",
        "phone",
        "address",
        "comment",
        "textContent",
        "innerText",
    ):
        if marker in session:
            errors.append(f"{SESSION.name}: forbidden telemetry/storage marker {marker!r}")

    page_module = PAGE_MODULE.read_text(encoding="utf-8")
    require(page_module, (
        "rpc('nav_v2_get_operational_readiness_preview'",
        "rpc('nav_v2_get_deal_card'",
        "['owner', 'admin', 'manager']",
        "UX-метрики Навигатора",
        "Скачать агрегированный JSON",
        "navigator_v2_privacy_safe_ux_metrics.json",
        "Клик не считается результатом",
        "Только sessionStorage",
        "CARD_LIMIT = 40",
        "CONCURRENCY = 4",
    ), PAGE_MODULE.name, errors)
    for marker in ("nav_v2_update_", "nav_v2_add_", "nav_v2_save_", ".from('nav_", '.from("nav_', "localStorage", "sendBeacon"):
        if marker in page_module:
            errors.append(f"{PAGE_MODULE.name}: forbidden write/telemetry marker {marker!r}")
    if page_module.count("rpc(") != 2:
        errors.append(f"{PAGE_MODULE.name}: expected exactly two existing read RPC call sites, got {page_module.count('rpc(')}")

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        "ux-metrics-v2.js?v=20260715-01",
        "role-menu-v2.js?v=20260713-01",
        "nav-base-menu-cleanup-v2.js?v=20260715-01",
        'aria-live="polite"',
    ), PAGE.name, errors)

    cleanup = CLEANUP.read_text(encoding="utf-8")
    require(cleanup, (
        "installPrivacySafeUxJourneyMeasurement",
        "ux-metrics-session-v2.js?v=20260715-01",
        "['owner', 'admin', 'manager']",
        "./ux-metrics-v2.html",
        "dataset.navUxMetrics",
    ), CLEANUP.name, errors)

    for daily_page in DAILY_PAGES:
        text = daily_page.read_text(encoding="utf-8")
        if "nav-base-menu-cleanup-v2.js?v=20260715-01" not in text:
            errors.append(f"{daily_page.name}: missing current privacy-safe tracker cache-bust")

    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    metrics_budget = ((budget.get("pages") or {}).get("ux-metrics-v2.html") or {}).get("max_modules")
    if metrics_budget != 3:
        errors.append(f"ux-metrics-v2.html module budget must be 3, got {metrics_budget!r}")
    if ((budget.get("pages") or {}).get("dashboard-v2.html") or {}).get("max_modules") != 2:
        errors.append("dashboard-v2.html module budget must remain 2 after tracker installation")

    public_smoke = PUBLIC_SMOKE.read_text(encoding="utf-8")
    if "'/ux-metrics-v2.html'" not in public_smoke:
        errors.append("public smoke must include ux-metrics-v2.html guest gate")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "python3 scripts/check_nav_v2_privacy_safe_ux_metrics.py",
        "node scripts/check-nav-v2-privacy-safe-ux-metrics.mjs",
        "node --check assets/js/nav-v2/ux-metrics-model-v2.js",
        "node --check assets/js/nav-v2/ux-metrics-session-v2.js",
        "node --check assets/js/nav-v2/ux-metrics-v2.js",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 privacy-safe UX metrics errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 privacy-safe UX metrics passed: aggregate-only, session-only clicks and server-confirmed outcomes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
