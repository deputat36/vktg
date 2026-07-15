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
DEAL_CARD_SOURCE = ROOT / "assets/js/nav-v2/deal-card-v2.js"
SPN_REWORK_SOURCE = ROOT / "assets/js/nav-v2/deal-card-spn-rework-v2.js"
LAWYER_DOCUMENT_SOURCE = ROOT / "assets/js/nav-v2/deal-card-lawyer-document-cycle-v2.js"
DEALS_HOOK = ROOT / "assets/js/nav-v2/deals-spn-priority-hints-v2.js"
DEALS_SOURCE = ROOT / "assets/js/nav-v2/deals-v2.js"
DEALS_PAGE = ROOT / "deals-v2.html"
SEMANTIC = ROOT / "scripts/check-nav-v2-form-association.mjs"
BROWSER = ROOT / "tests/e2e/form-association.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-form-association.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-form-association.yml"

PATHS = (
    MODEL,
    RUNTIME,
    HOOK,
    PAGE,
    DEAL_CARD_SOURCE,
    SPN_REWORK_SOURCE,
    LAWYER_DOCUMENT_SOURCE,
    DEALS_HOOK,
    DEALS_SOURCE,
    DEALS_PAGE,
    SEMANTIC,
    BROWSER,
    FIXTURE,
    WORKFLOW,
)

for path in PATHS:
    if not path.exists():
        ERRORS.append(f"Missing form association file: {path.relative_to(ROOT)}")

if not ERRORS:
    model = MODEL.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    hook = HOOK.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    deal_card_source = DEAL_CARD_SOURCE.read_text(encoding="utf-8")
    spn_rework_source = SPN_REWORK_SOURCE.read_text(encoding="utf-8")
    lawyer_document_source = LAWYER_DOCUMENT_SOURCE.read_text(encoding="utf-8")
    deals_hook = DEALS_HOOK.read_text(encoding="utf-8")
    deals_source = DEALS_SOURCE.read_text(encoding="utf-8")
    deals_page = DEALS_PAGE.read_text(encoding="utf-8")
    semantic = SEMANTIC.read_text(encoding="utf-8")
    browser = BROWSER.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    for marker in (
        "export function formFieldPolicy",
        "export function formFieldIds",
        "export function formGroupPolicy",
        "export function formGroupIds",
        "export function mergeDescriptionIds",
        "export function fieldValidationState",
        "spnReworkReturnOptions",
        "dealQuickStatusActions",
        "dealLegalActions",
        "lawyerDocumentActions",
        "nativeFieldsetPreferred: true",
        "stableGroupNameRequired: true",
        "sharedGroupHelpRequired: true",
        "groupErrorMirrorsFieldError: true",
        "individualControlNamesPreserved: true",
        "nativeKeyboardBehaviorPreserved: true",
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
        "local.htmlFor = field.id",
        "field.setAttribute('aria-label', policy.labelText)",
        "upgradeToFieldset",
        "HTMLFieldSetElement",
        "document.createElement('legend')",
        "group.setAttribute('role', 'group')",
        "group.setAttribute('aria-describedby'",
        "group.setAttribute('aria-invalid', 'true')",
        "group.setAttribute('aria-errormessage'",
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
        "import { applyFormAssociations } from './form-association-v2.js?v=20260715-02';",
        "applyFormAssociations();",
        "applyAccessibleAsyncFeedback();",
    ):
        if marker not in hook:
            ERRORS.append(f"Deal card enhancement hook missing form association marker: {marker}")

    for marker in (
        "import { applyFormAssociations } from './form-association-v2.js?v=20260715-01';",
        "applyFormAssociations(document);",
        "if (!loaded || profile?.role !== 'spn') return;",
    ):
        if marker not in deals_hook:
            ERRORS.append(f"Deals enhancement hook missing form association marker: {marker}")

    for marker in ('data-quick-status', 'data-legal-action'):
        if marker not in deal_card_source:
            ERRORS.append(f"Deal card source missing choice group marker: {marker}")
    for marker in ('spn-rework-options', 'data-spn-rework-option', 'spnReworkReturnReason'):
        if marker not in spn_rework_source:
            ERRORS.append(f"SPN rework source missing choice group marker: {marker}")
    for marker in ('lawyer-document-actions', 'data-lawyer-document-action', 'lawyerDocumentNoteV2'):
        if marker not in lawyer_document_source:
            ERRORS.append(f"Lawyer document source missing choice group marker: {marker}")

    for marker in ('id="dealSearch"', 'id="dealFilter"', 'placeholder="Адрес, объект, клиент, СПН, статус или ID"'):
        if marker not in deals_source:
            ERRORS.append(f"Deals source missing filter field marker: {marker}")

    active_remap = '"./deal-card-recheck-alert-v2.js?v=20260715-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-19"'
    legacy_remap = '"./deal-card-recheck-alert-v2.js?v=20260711-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-15"'
    for marker in (active_remap, legacy_remap):
        if page.count(marker) != 1:
            ERRORS.append(f"Deal card page missing release marker: {marker}")
    if '<script type="module" src="./assets/js/nav-v2/form-association-v2.js' in page:
        ERRORS.append("Form association must not increase deal-card entry-module budget")

    deals_release = '<script type="module" src="./assets/js/nav-v2/deals-spn-priority-hints-v2.js?v=20260715-01"></script>'
    if deals_page.count(deals_release) != 1:
        ERRORS.append("Deals page must release filter form association through the existing enhancement entry exactly once")
    if '<script type="module" src="./assets/js/nav-v2/form-association-v2.js' in deals_page:
        ERRORS.append("Form association must not increase deals entry-module budget")

    for marker in (
        "Navigator v2 form association semantic checks passed",
        "fieldValidationState",
        "formGroupIds",
        "formGroupPolicy",
        "nativeFieldsetPreferred",
        "groupErrorMirrorsFieldError",
        "formAssociationContract",
    ):
        if marker not in semantic:
            ERRORS.append(f"Form association semantic check missing marker: {marker}")

    for marker in (
        "repeated operational choices have stable group names and shared help",
        "return group shares the field error and clears through native Space selection",
        "lawyer problem note and action group are conditionally invalid",
        "server error does not invalidate a valid field or its choice group",
        "Замечания для возврата СПН",
        "Быстрое изменение статуса сделки",
        "Юридическое решение по сделке",
        "Состояние текущего документа",
        "page.keyboard.press('Space')",
        "aria-errormessage",
        "aria-describedby",
        "toHaveAccessibleName",
        "toHaveAccessibleDescription",
    ):
        if marker not in browser:
            ERRORS.append(f"Form association browser regression missing marker: {marker}")

    for marker in (
        'id="app"',
        'id="dealSearch"',
        'id="dealFilter"',
        'id="dealStatus"',
        'id="newComment"',
        'id="spnReworkCompletionText"',
        'id="spnReworkReturnReason"',
        'id="lawyerDocumentNoteV2"',
        'data-quick-status',
        'data-legal-action',
        'class="spn-rework-options"',
        'class="actions lawyer-document-actions"',
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
    "Navigator v2 form association contract passed: explicit labels, named choice groups, native fieldset and keyboard behavior, "
    "shared help and precise field/group errors, no entry-module/network/storage changes"
)
