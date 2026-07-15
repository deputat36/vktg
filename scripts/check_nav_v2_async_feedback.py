from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "assets/js/nav-v2/async-feedback-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/async-feedback-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
PAGE = ROOT / "deal-card-v2.html"
REWORK = ROOT / "assets/js/nav-v2/deal-card-spn-rework-v2.js"
DOCUMENT = ROOT / "assets/js/nav-v2/deal-card-lawyer-document-cycle-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-async-feedback.mjs"
FIXTURE = ROOT / "tests/fixtures/nav-v2-async-feedback.html"
BROWSER = ROOT / "tests/e2e/async-feedback.spec.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-async-feedback.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (MODEL, RUNTIME, HOOK, PAGE, REWORK, DOCUMENT, SEMANTIC, FIXTURE, BROWSER, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function asyncActivationMode",
        "export function buildAsyncFeedbackPolicy",
        "export function asyncFocusToken",
        "export function asyncFocusSelectors",
        "export function classifyAsyncStatus",
        "'spn-submitted'",
        "'spn-returned'",
        "'lawyer-document'",
        "role: 'alert'",
        "live: 'assertive'",
        "focus: normalizedMode === 'keyboard'",
    ), MODEL.name, errors)

    runtime = RUNTIME.read_text(encoding="utf-8")
    require(runtime, (
        "[data-spn-rework-submit]",
        "[data-spn-rework-return]",
        "[data-lawyer-document-action]",
        "const FOCUS_PARAM = 'nav_focus';",
        "setAttribute('aria-busy'",
        "setAttribute('aria-atomic'",
        "history.replaceState",
        "WATCH_TIMEOUT_MS",
        "setInterval",
        "export function applyAccessibleAsyncFeedback",
        "export function installAccessibleAsyncFeedback",
        "asyncActivationMode(event.detail)",
    ), RUNTIME.name, errors)

    forbidden = (
        "MutationObserver",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "sendBeacon",
        "WebSocket",
        "fetch(",
        "rpc(",
        ".from(",
        "service_role",
        "crypto.randomUUID",
    )
    for marker in forbidden:
        if marker in model or marker in runtime:
            errors.append(f"async feedback must remain frontend-only and storage-free; found {marker!r}")

    hook = HOOK.read_text(encoding="utf-8")
    require(hook, (
        "import { applyAccessibleAsyncFeedback } from './async-feedback-v2.js?v=20260715-01';",
        "applyAccessibleAsyncFeedback();",
        "applyMobileFirstScreenDisclosure();",
    ), HOOK.name, errors)

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        '"./deal-card-recheck-alert-v2.js?v=20260711-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-15"',
        '"./deal-card-recheck-alert-v2.js?v=20260715-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-20"',
        '"./mobile-first-screen-v2.js?v=20260715-01": "./assets/js/nav-v2/mobile-first-screen-v2.js?v=20260715-03"',
    ), PAGE.name, errors)

    rework = REWORK.read_text(encoding="utf-8")
    require(rework, (
        'id="spnReworkStatusV2"',
        "nav_v2_submit_spn_rework",
        "nav_v2_return_spn_rework",
        "setTimeout(() => location.reload()",
        "button.disabled = false;",
    ), REWORK.name, errors)

    document = DOCUMENT.read_text(encoding="utf-8")
    require(document, (
        'id="lawyerDocumentStatusV2"',
        "nav_v2_update_document_workflow",
        "setTimeout(() => location.reload()",
        "button.disabled = false;",
    ), DOCUMENT.name, errors)

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "python3 scripts/check_nav_v2_async_feedback.py",
        "node scripts/check-nav-v2-async-feedback.mjs",
        "tests/e2e/async-feedback.spec.js",
        "chromium-desktop",
        "chromium-mobile",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 accessible async feedback errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 accessible async feedback passed: live regions, keyboard error focus and enum-only reload focus are present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
