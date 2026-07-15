from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

MODEL = ROOT / "assets/js/nav-v2/form-association-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/form-association-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
PAGE = ROOT / "deal-card-v2.html"
SEMANTIC = ROOT / "scripts/check-nav-v2-form-association.mjs"
BROWSER = ROOT / "tests/e2e/form-association.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-form-association.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-form-association.yml"

for path in (MODEL, RUNTIME, HOOK, PAGE, SEMANTIC, BROWSER, FIXTURE, WORKFLOW):
    if not path.exists():
        ERRORS.append(f"Missing form association file: {path.relative_to(ROOT)}")

if not ERRORS:
    model = MODEL.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    hook = HOOK.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    semantic = SEMANTIC.read_text(encoding="utf-8")
    browser = BROWSER.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    for marker in (
        "export function formFieldPolicy",
        "export function formFieldIds",
        "export function mergeDescriptionIds",
        "export function fieldValidationState",
        "explicitProgrammaticLabel: true",
        "fieldErrorUsesAriaErrormessage: true",
        "ariaInvalidOnlyForClientFieldError: true",
        "serverErrorDoesNotInvalidateValidField: true",
        "positiveTabindexAllowed: false",
        "storageAllowed: false",
    ):
        if marker not in model:
            ERRORS.append(f"Form association pure model missing marker: {marker}")

    for forbidden in ("document.", "window.", "localStorage", "sessionStorage", "indexedDB", "fetch(", "rpc("):
        if forbidden in model:
            ERRORS.append(f"Form association model must remain pure: {forbidden}")

    for marker in (
        "export function applyFormAssociations",
        "export function installFormAssociationLifecycle",
        "label.htmlFor = field.id",
        "setAttribute('aria-describedby'",
        "setAttribute('aria-invalid', 'true')",
        "setAttribute('aria-errormessage'",
        "removeAttribute('aria-invalid')",
        "removeAttribute('aria-errormessage')",
        "data-spn-rework-option",
        "data-lawyer-document-note-required",
        "queueMicrotask(() => validateAfterAction",
        "document.addEventListener('input'",
        "document.addEventListener('change'",
    ):
        if marker not in runtime:
            ERRORS.append(f"Form association runtime missing marker: {marker}")

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
            ERRORS.append(f"Form association runtime must remain bounded DOM-only: {forbidden}")

    for marker in (
        "import { applyFormAssociations } from './form-association-v2.js?v=20260715-01';",
        "applyFormAssociations();",
        "applyAccessibleAsyncFeedback();",
    ):
        if marker not in hook:
            ERRORS.append(f"Deal card enhancement hook missing form association marker: {marker}")

    active_remap = '"./deal-card-recheck-alert-v2.js?v=20260715-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-17"'
    legacy_remap = '"./deal-card-recheck-alert-v2.js?v=20260711-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-15"'
    for marker in (active_remap, legacy_remap):
        if page.count(marker) != 1:
            ERRORS.append(f"Deal card page missing release marker: {marker}")
    if '<script type="module" src="./assets/js/nav-v2/form-association-v2.js' in page:
        ERRORS.append("Form association must not increase deal-card entry-module budget")

    for marker in (
        "Navigator v2 form association semantic checks passed",
        "fieldValidationState",
        "mergeDescriptionIds",
        "formAssociationContract",
    ):
        if marker not in semantic:
            ERRORS.append(f"Form association semantic check missing marker: {marker}")

    for marker in (
        "all bounded fields have programmatic labels and help associations",
        "SPN completion error is associated and clears after correction",
        "return reason accepts a selected alternative without false invalid state",
        "lawyer problem note is conditionally required",
        "server error does not invalidate a valid field",
        "aria-errormessage",
        "aria-describedby",
        "toHaveAccessibleName",
        "chromium-mobile",
    ):
        if marker not in browser:
            ERRORS.append(f"Form association browser regression missing marker: {marker}")

    for marker in (
        'id="app"',
        'id="dealStatus"',
        'id="newComment"',
        'id="spnReworkCompletionText"',
        'id="spnReworkReturnReason"',
        'id="lawyerDocumentNoteV2"',
        'id="pageStatus"',
        'id="spnReworkStatusV2"',
        'id="lawyerDocumentStatusV2"',
        "applyFormAssociations(document)",
    ):
        if marker not in fixture:
            ERRORS.append(f"Form association fixture missing marker: {marker}")

    for marker in (
        "node scripts/check-nav-v2-form-association.mjs",
        "python3 scripts/check_nav_v2_form_association.py",
        "tests/e2e/form-association.spec.js",
        "chromium-desktop",
        "chromium-mobile",
        "npx playwright install --with-deps chromium",
    ):
        if marker not in workflow:
            ERRORS.append(f"Form association workflow missing marker: {marker}")

    combined = "\n".join((runtime, fixture, browser))
    if re.search(r'tabindex=["\'][1-9]', combined, flags=re.IGNORECASE):
        ERRORS.append("Positive tabindex is forbidden in form association files")

if ERRORS:
    print("Navigator v2 form association errors:")
    for error in ERRORS:
        print(f"- {error}")
    sys.exit(1)

print(
    "Navigator v2 form association contract passed: explicit labels, described help, precise field errors, "
    "invalid state clears after correction, no layout/network/storage changes"
)
