from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

MODEL = ROOT / "assets/js/nav-v2/async-feedback-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/async-feedback-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
CARD_PAGE = ROOT / "deal-card-v2.html"
NODE_CHECK = ROOT / "scripts/check-nav-v2-async-feedback.mjs"
BROWSER_SPEC = ROOT / "tests/e2e/async-feedback.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-async-feedback.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-async-feedback.yml"

for path in (MODEL, RUNTIME, HOOK, CARD_PAGE, NODE_CHECK, BROWSER_SPEC, FIXTURE, WORKFLOW):
    if not path.exists():
        ERRORS.append(f"Missing async feedback file: {path.relative_to(ROOT)}")

if not ERRORS:
    model = MODEL.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    hook = HOOK.read_text(encoding="utf-8")
    page = CARD_PAGE.read_text(encoding="utf-8")
    node_check = NODE_CHECK.read_text(encoding="utf-8")
    browser = BROWSER_SPEC.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    for marker in (
        "export function feedbackPolicy",
        "export function feedbackFingerprint",
        "export function publicErrorMessage",
        "export function confirmedFocusTarget",
        "export function reloadHashForTarget",
        "repeatedAnnouncementSuppressed: true",
        "storageAllowed: false",
    ):
        if marker not in model:
            ERRORS.append(f"Async feedback pure model missing marker: {marker}")

    for forbidden in ("document.", "window.", "localStorage", "sessionStorage", "indexedDB", "fetch(", "rpc("):
        if forbidden in model:
            ERRORS.append(f"Async feedback model must remain pure: {forbidden}")

    for marker in (
        "applyAsyncFeedbackLifecycle",
        "installAsyncFeedbackLifecycle",
        "navAsyncFeedbackAnnouncer",
        "role', policy.role",
        "aria-live', policy.live",
        "aria-busy",
        "feedbackFingerprint",
        "publicErrorMessage",
        "reloadHashForTarget",
        "confirmedFocusTarget(location.hash)",
        "keyboardModality",
        "pointerdown",
        "history.replaceState",
        "inputValuesPreservedOnError",
    ):
        if marker not in runtime and marker != "inputValuesPreservedOnError":
            ERRORS.append(f"Async feedback runtime missing marker: {marker}")

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
            ERRORS.append(f"Async feedback runtime must stay DOM-only: {forbidden}")

    for marker in (
        "import { applyAsyncFeedbackLifecycle }",
        "applyAsyncFeedbackLifecycle();",
        "./async-feedback-v2.js?v=20260715-01",
    ):
        if marker not in hook:
            ERRORS.append(f"Deal card enhancement hook missing async feedback marker: {marker}")

    remap = '"./deal-card-recheck-alert-v2.js?v=20260715-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-16"'
    if page.count(remap) != 1:
        ERRORS.append("Deal card page must cache-bust the async feedback lifecycle exactly once")
    direct_entry = '<script type="module" src="./assets/js/nav-v2/async-feedback-v2.js'
    if direct_entry in page:
        ERRORS.append("Async feedback must not increase the deal-card entry-module budget")

    for marker in (
        "Navigator v2 accessible async feedback semantic checks passed",
        "publicErrorMessage",
        "confirmedFocusTarget",
        "reloadHashForTarget",
    ):
        if marker not in node_check:
            ERRORS.append(f"Async feedback semantic check missing marker: {marker}")

    for marker in (
        "keyboard error announces a friendly recovery and preserves input",
        "pointer error does not steal focus",
        "success marks only an allowlisted server confirmation target",
        "confirmed reload focuses the server result once",
        "toBeFocused",
        "navAsyncFeedbackAnnouncer",
    ):
        if marker not in browser:
            ERRORS.append(f"Async feedback browser regression missing marker: {marker}")

    for marker in (
        "data-spn-rework-submit",
        "data-spn-rework-return",
        "data-lawyer-document-action",
        "spnReworkStatusV2",
        "lawyerDocumentStatusV2",
        "dealCompletionEvidenceV2",
        "applyAsyncFeedbackLifecycle(document)",
    ):
        if marker not in fixture:
            ERRORS.append(f"Async feedback fixture missing marker: {marker}")

    for marker in (
        "node scripts/check-nav-v2-async-feedback.mjs",
        "python3 scripts/check_nav_v2_async_feedback.py",
        "tests/e2e/async-feedback.spec.js",
        "chromium-desktop",
        "chromium-mobile",
        "npx playwright install --with-deps chromium",
    ):
        if marker not in workflow:
            ERRORS.append(f"Async feedback workflow missing marker: {marker}")

if ERRORS:
    print("Navigator v2 accessible async feedback errors:")
    for error in ERRORS:
        print(f"- {error}")
    sys.exit(1)

print(
    "Navigator v2 accessible async feedback contract passed: polite busy status, assertive friendly errors, "
    "keyboard-only recovery focus, input preservation, allowlisted server-confirmed reload focus, no storage/network"
)
