from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

MODEL = ROOT / "assets/js/nav-v2/screen-structure-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/screen-structure-v2.js"
FOCUS = ROOT / "assets/js/nav-v2/focus-continuity-v2.js"
NODE_CHECK = ROOT / "scripts/check-nav-v2-screen-structure.mjs"
BROWSER = ROOT / "tests/e2e/screen-structure.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-screen-structure.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-screen-structure.yml"
PAGES = [
    ROOT / "dashboard-v2.html",
    ROOT / "deals-v2.html",
    ROOT / "deal-card-v2.html",
    ROOT / "manager-v2.html",
]
SOURCES = {
    "dashboard": ROOT / "assets/js/nav-v2/dashboard-v2.js",
    "deals": ROOT / "assets/js/nav-v2/deals-v2.js",
    "deal_card": ROOT / "assets/js/nav-v2/deal-card-v2.js",
    "manager": ROOT / "assets/js/nav-v2/manager-v2.js",
}

for path in [MODEL, RUNTIME, FOCUS, NODE_CHECK, BROWSER, FIXTURE, WORKFLOW, *PAGES, *SOURCES.values()]:
    if not path.exists():
        ERRORS.append(f"Missing screen structure file: {path.relative_to(ROOT)}")

if not ERRORS:
    model = MODEL.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    focus = FOCUS.read_text(encoding="utf-8")
    node_check = NODE_CHECK.read_text(encoding="utf-8")
    browser = BROWSER.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    for marker in (
        "export function normalizeScreenSurface",
        "export function screenStructurePolicy",
        "export function screenStructureId",
        "export function contextualRegionName",
        "export function screenStructureContract",
        "oneMainPerScreen: true",
        "oneH1PerScreen: true",
        "unnamedCardsStayUnpromoted: true",
        "liveStatusIsNotLandmark: true",
        "networkAllowed: false",
    ):
        if marker not in model:
            ERRORS.append(f"Screen structure model missing marker: {marker}")

    for forbidden in (
        "document.", "window.", "HTMLElement", "querySelector", "localStorage", "sessionStorage",
        "indexedDB", "fetch(", "rpc(", "supabase", "MutationObserver"
    ):
        if forbidden in model:
            ERRORS.append(f"Screen structure model must remain pure: {forbidden}")

    for marker in (
        "export function applyScreenStructure",
        "surfaceFromMain",
        "applyMainName",
        "applySectionRules",
        "applyItemRules",
        "applyKpiNames",
        "applyContextualManagerRegions",
        "preserveLiveOnlySemantics",
        "role', 'heading",
        "aria-level",
        "aria-labelledby",
        "role', 'group",
        "Главное действие",
        "Следующий шаг",
    ):
        if marker not in runtime:
            ERRORS.append(f"Screen structure runtime missing marker: {marker}")

    for forbidden in (
        "MutationObserver", "localStorage", "sessionStorage", "indexedDB", "document.cookie",
        "fetch(", "sendBeacon", "XMLHttpRequest", "WebSocket", "rpc(", "supabase",
        "innerHTML =", "insertAdjacentHTML", "appendChild", "replaceChildren"
    ):
        if forbidden in runtime:
            ERRORS.append(f"Screen structure runtime must stay bounded DOM-only: {forbidden}")

    for marker in (
        "import { applyScreenStructure } from './screen-structure-v2.js?v=20260715-01'",
        "applyScreenStructure(root);",
        "export function applyActionFocusContinuity",
    ):
        if marker not in focus:
            ERRORS.append(f"Focus lifecycle missing screen structure marker: {marker}")

    mapping = '"./focus-continuity-v2.js?v=20260715-01": "./assets/js/nav-v2/focus-continuity-v2.js?v=20260715-02"'
    direct_entry = '<script type="module" src="./assets/js/nav-v2/screen-structure-v2.js'
    for page in PAGES:
        source = page.read_text(encoding="utf-8")
        if source.count(mapping) != 1:
            ERRORS.append(f"{page.name} must cache-bust the shared screen structure lifecycle exactly once")
        if direct_entry in source:
            ERRORS.append(f"{page.name} must not increase the page entry-module budget")

    source_markers = {
        "dashboard": ["mobile-first-screen-dashboard", "<h1>", "role-home-focus", "role-home-quick-actions", "role-home-recent"],
        "deals": ["mobile-first-screen-deals", "<h1>", "deals-workspace", "deals-work-card", "deal-title"],
        "deal_card": ["mobile-first-screen-card", "<h1>", "quickActions(deal)", "renderTabs(data)", "applyDealCardRecheckAlert"],
        "manager": ["mobile-first-screen-manager", "<h1>", "manager-confirmed-results", "manager-queue", "manager-decision-card"],
    }
    for name, path in SOURCES.items():
        source = path.read_text(encoding="utf-8")
        for marker in source_markers[name]:
            if marker not in source:
                ERRORS.append(f"{name} source missing screen structure marker: {marker}")

    for marker in (
        "Navigator v2 screen structure semantic checks passed",
        "screenStructureContract",
        "contextualRegionName",
        "oneMainPerScreen",
        "liveStatusIsNotLandmark",
    ):
        if marker not in node_check:
            ERRORS.append(f"Screen structure semantic check missing marker: {marker}")

    for marker in (
        "dashboard exposes one named main and labelled action sections",
        "deals promotes visual card titles to level-three item headings",
        "deal card names action, rework and active content without extra live landmarks",
        "manager gives repeated action regions unique contextual names",
        "getByRole('main'",
        "getByRole('region'",
        "getByRole('heading', { level: 3",
        "getByRole('group'",
        "getByRole('status')",
        "getByRole('alert')",
    ):
        if marker not in browser:
            ERRORS.append(f"Screen structure browser regression missing marker: {marker}")

    for marker in (
        'id="app"',
        "mobile-first-screen-dashboard",
        "mobile-first-screen-deals",
        "mobile-first-screen-card",
        "mobile-first-screen-manager",
        "role-home-priority-card",
        "deals-work-card",
        "manager-main-action",
        "manager-confirmed-next",
        "applyScreenStructure(document)",
    ):
        if marker not in fixture:
            ERRORS.append(f"Screen structure fixture missing marker: {marker}")

    for marker in (
        "node scripts/check-nav-v2-screen-structure.mjs",
        "python3 scripts/check_nav_v2_screen_structure.py",
        "tests/e2e/screen-structure.spec.js",
        "chromium-desktop",
        "chromium-mobile",
        "npx playwright install --with-deps chromium",
    ):
        if marker not in workflow:
            ERRORS.append(f"Screen structure workflow missing marker: {marker}")

if ERRORS:
    print("Navigator v2 screen structure errors:")
    for error in ERRORS:
        print(f"- {error}")
    sys.exit(1)

print(
    "Navigator v2 screen structure contract passed: one named main/h1, labelled action sections, "
    "level-three item headings, contextual repeated regions, named KPI groups, no live/unnamed landmark promotion"
)
