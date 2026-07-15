from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

MODEL = ROOT / "assets/js/nav-v2/accessibility-continuity-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/accessibility-continuity-v2.js"
MOBILE = ROOT / "assets/js/nav-v2/mobile-first-screen-v2.js"
CSS = ROOT / "assets/css/nav-v2-focus-continuity.css"
NODE_CHECK = ROOT / "scripts/check-nav-v2-accessibility-continuity.mjs"
BROWSER_SPEC = ROOT / "tests/e2e/accessibility-continuity.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-accessibility-continuity.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-accessibility-continuity.yml"
PAGES = (
    ROOT / "dashboard-v2.html",
    ROOT / "deals-v2.html",
    ROOT / "deal-card-v2.html",
    ROOT / "manager-v2.html",
)

for path in (MODEL, RUNTIME, MOBILE, CSS, NODE_CHECK, BROWSER_SPEC, FIXTURE, WORKFLOW, *PAGES):
    if not path.exists():
        ERRORS.append(f"Missing accessibility continuity file: {path.relative_to(ROOT)}")

if not ERRORS:
    model = MODEL.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    mobile = MOBILE.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    node_check = NODE_CHECK.read_text(encoding="utf-8")
    browser = BROWSER_SPEC.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    for marker in (
        "export function sortOperationalRegions",
        "export function nextTabIndex",
        "export function focusModeForControl",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
    ):
        if marker not in model:
            ERRORS.append(f"Accessibility pure model missing marker: {marker}")

    for forbidden in ("document.", "window.", "localStorage", "sessionStorage", "indexedDB", "fetch(", "rpc("):
        if forbidden in model:
            ERRORS.append(f"Accessibility pure model must remain DOM/network/storage-free: {forbidden}")

    for marker in (
        "applyAccessibilityContinuity",
        "sortOperationalRegions",
        "nextTabIndex",
        "dataset.navDomOrder",
        "aria-expanded",
        "role', 'tablist",
        "role', 'tabpanel",
        "pendingFocus",
        "document.addEventListener('toggle'",
        "document.addEventListener('keydown'",
        "focus({ preventScroll: true })",
        "nav-focus-landed",
    ):
        if marker not in runtime:
            ERRORS.append(f"Accessibility runtime missing marker: {marker}")

    for forbidden in (
        "MutationObserver",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "document.cookie",
        "fetch(",
        "sendBeacon",
        "XMLHttpRequest",
        "WebSocket",
        "rpc(",
        "supabase",
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
    ):
        if forbidden in runtime:
            ERRORS.append(f"Accessibility runtime must remain DOM-only and read-only: {forbidden}")

    for marker in (
        "import { applyAccessibilityContinuity }",
        "applyAccessibilityContinuity(root, compact)",
        "details.open = !compact",
        "window.matchMedia('(max-width: 430px)')",
    ):
        if marker not in mobile:
            ERRORS.append(f"Shared mobile lifecycle missing accessibility marker: {marker}")

    for marker in (
        "summary:focus-visible",
        "[role=\"tab\"]:focus-visible",
        ".nav-focus-landed",
        "[role=\"tabpanel\"]",
        "prefers-reduced-motion",
    ):
        if marker not in css:
            ERRORS.append(f"Focus continuity CSS missing marker: {marker}")

    css_marker = "nav-v2-focus-continuity.css?v=20260715-01"
    remap_marker = '"./mobile-first-screen-v2.js?v=20260715-01": "./assets/js/nav-v2/mobile-first-screen-v2.js?v=20260715-03"'
    for page in PAGES:
        source = page.read_text(encoding="utf-8")
        if source.count(css_marker) != 1:
            ERRORS.append(f"{page.name} must load shared focus CSS exactly once")
        if source.count(remap_marker) != 1:
            ERRORS.append(f"{page.name} must cache-bust the accessibility lifecycle exactly once")

    for marker in (
        "compact DOM order must follow the visible action-first order",
        "desktop DOM order must restore source order",
        "nextTabIndex",
        "focusModeForControl",
    ):
        if marker not in node_check:
            ERRORS.append(f"Accessibility semantic regression missing marker: {marker}")

    for marker in (
        "mobile DOM and Tab order follow the action-first visual order",
        "closing progressive disclosure returns focus to its summary",
        "action shortcuts land on the active panel heading",
        "desktop viewport restores source DOM order",
        "toHaveAccessibleName",
        "toBeFocused",
        "aria-expanded",
        "data-nav-dom-order",
    ):
        if marker not in browser:
            ERRORS.append(f"Accessibility browser regression missing marker: {marker}")

    for marker in (
        "mobile-first-screen-page",
        "mobile-first-screen-primary-action",
        "data-tab-shortcut=\"docs\"",
        "mobile-first-screen-details",
        "data-tab=\"overview\"",
        "applyMobileFirstScreenDisclosure(document)",
        'body class="nav-v2" tabindex="-1"',
    ):
        if marker not in fixture:
            ERRORS.append(f"Accessibility fixture missing marker: {marker}")

    for marker in (
        "node scripts/check-nav-v2-accessibility-continuity.mjs",
        "python3 scripts/check_nav_v2_accessibility_continuity.py",
        "tests/e2e/accessibility-continuity.spec.js",
        "chromium-desktop",
        "chromium-mobile",
        "npx playwright install --with-deps chromium",
    ):
        if marker not in workflow:
            ERRORS.append(f"Accessibility workflow missing marker: {marker}")

if ERRORS:
    print("Navigator v2 accessibility continuity errors:")
    for error in ERRORS:
        print(f"- {error}")
    sys.exit(1)

print(
    "Navigator v2 accessibility continuity contract passed: DOM order follows visual order, "
    "focus survives disclosure and tab rerenders, names and focus-visible states are explicit"
)
