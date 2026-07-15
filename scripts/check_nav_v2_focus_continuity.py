from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "assets/js/nav-v2/focus-continuity-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/focus-continuity-v2.js"
MOBILE = ROOT / "assets/js/nav-v2/mobile-first-screen-v2.js"
CSS = ROOT / "assets/css/nav-v2-mobile-first-screen.css"
SEMANTIC = ROOT / "scripts/check-nav-v2-focus-continuity.mjs"
BROWSER = ROOT / "tests/e2e/focus-continuity.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-focus-continuity.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-focus-continuity.yml"
PAGES = tuple(ROOT / name for name in ("dashboard-v2.html", "deals-v2.html", "deal-card-v2.html", "manager-v2.html"))


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (MODEL, RUNTIME, MOBILE, CSS, SEMANTIC, BROWSER, FIXTURE, WORKFLOW, *PAGES)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "dealTabFromDataset",
        "dealTabPanelSelector",
        "dealTabPanelLabel",
        "primaryActionAccessibleName",
        "shouldRestoreDisclosureFocus",
        "positiveTabindexAllowed: false",
        "focusTargetAfterDealTabChange: 'active_work_panel'",
    ), MODEL.name, errors)

    runtime = RUNTIME.read_text(encoding="utf-8")
    require(runtime, (
        "export function applyActionFocusContinuity",
        "export function installActionFocusContinuity",
        "panel.dataset.dealTabPanel = tab",
        "panel.tabIndex = -1",
        "summary.setAttribute('aria-controls'",
        "summary.setAttribute('aria-expanded'",
        "summary.focus({ preventScroll: true })",
        "panel.focus({ preventScroll: true })",
        "button.setAttribute('aria-pressed'",
        "document.addEventListener('keydown'",
        "document.addEventListener('pointerdown'",
    ), RUNTIME.name, errors)

    for source, label in ((model, MODEL.name), (runtime, RUNTIME.name)):
        for forbidden in ("rpc(", "fetch(", "sendBeacon", "WebSocket", "localStorage", "sessionStorage", "indexedDB", "nav_v2_update_", "nav_v2_save_", "MutationObserver"):
            if forbidden in source:
                errors.append(f"{label}: forbidden focus-layer behavior {forbidden!r}")

    mobile = MOBILE.read_text(encoding="utf-8")
    require(mobile, (
        "focus-continuity-v2.js?v=20260715-01",
        "applyActionFocusContinuity(root)",
        "applyActionFocusContinuity(document)",
        "details.open = !compact",
    ), MOBILE.name, errors)

    css = CSS.read_text(encoding="utf-8")
    require(css, (
        ":focus-visible",
        "outline: 3px solid #1d4ed8",
        "outline-offset: 3px",
        "@media (forced-colors: active)",
        "[data-deal-tab-panel]",
        "scroll-margin-top: 90px",
    ), CSS.name, errors)

    for page in PAGES:
        text = page.read_text(encoding="utf-8")
        for marker in (
            "nav-v2-mobile-first-screen.css?v=20260715-02",
            '"./mobile-first-screen-v2.js?v=20260715-01": "./assets/js/nav-v2/mobile-first-screen-v2.js?v=20260715-04"',
        ):
            if marker not in text:
                errors.append(f"{page.name}: missing focus release marker {marker!r}")

    combined = "\n".join(path.read_text(encoding="utf-8") for path in (*PAGES, FIXTURE, RUNTIME))
    if re.search(r'tabindex=["\'][1-9]', combined, flags=re.IGNORECASE):
        errors.append("positive tabindex is forbidden in action-first focus continuity files")

    browser = BROWSER.read_text(encoding="utf-8")
    require(browser, (
        "action-first keyboard focus remains visible and continuous",
        "toBeFocused",
        "outlineStyle",
        "aria-expanded",
        "aria-controls",
        "data-deal-tab-panel=\"docs\"",
        "toHaveAccessibleName",
    ), BROWSER.name, errors)

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "python3 scripts/check_nav_v2_focus_continuity.py",
        "node scripts/check-nav-v2-focus-continuity.mjs",
        "tests/e2e/focus-continuity.spec.js",
        "--project=chromium-desktop",
        "--project=chromium-mobile",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 focus continuity errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 focus continuity passed: logical keyboard order, visible focus and stable work targets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
