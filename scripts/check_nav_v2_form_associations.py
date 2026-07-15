from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

MODEL = ROOT / "assets/js/nav-v2/form-association-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/form-association-v2.js"
STRUCTURE = ROOT / "assets/js/nav-v2/screen-structure-v2.js"
NODE_CHECK = ROOT / "scripts/check-nav-v2-form-associations.mjs"
BROWSER = ROOT / "tests/e2e/form-associations.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-form-associations.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-form-associations.yml"
PAGES = [
    ROOT / "dashboard-v2.html",
    ROOT / "deals-v2.html",
    ROOT / "deal-card-v2.html",
    ROOT / "manager-v2.html",
]
SOURCES = {
    "deals": ROOT / "assets/js/nav-v2/deals-v2.js",
    "deal_card": ROOT / "assets/js/nav-v2/deal-card-v2.js",
    "rework": ROOT / "assets/js/nav-v2/deal-card-spn-rework-v2.js",
    "document": ROOT / "assets/js/nav-v2/deal-card-lawyer-document-cycle-v2.js",
}

for path in [MODEL, RUNTIME, STRUCTURE, NODE_CHECK, BROWSER, FIXTURE, WORKFLOW, *PAGES, *SOURCES.values()]:
    if not path.exists():
        ERRORS.append(f"Missing form association file: {path.relative_to(ROOT)}")

if not ERRORS:
    model = MODEL.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    structure = STRUCTURE.read_text(encoding="utf-8")
    node_check = NODE_CHECK.read_text(encoding="utf-8")
    browser = BROWSER.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    for marker in (
        "export function describedByTokens",
        "export function fieldAssociationPolicy",
        "export function baseDescriptionIds",
        "export function validationDescriptionIds",
        "export function fieldAssociationContract",
        "placeholderIsNotName: true",
        "permanentHelpPreserved: true",
        "errorRemovedAfterEdit: true",
        "unknownFieldsUntouched: true",
        "hiddenHelperInsertionAllowed: true",
        "networkAllowed: false",
    ):
        if marker not in model:
            ERRORS.append(f"Form association model missing marker: {marker}")

    for forbidden in (
        "document.", "window.", "HTMLElement", "querySelector", "localStorage", "sessionStorage",
        "indexedDB", "fetch(", "rpc(", "supabase", "MutationObserver"
    ):
        if forbidden in model:
            ERRORS.append(f"Form association model must remain pure: {forbidden}")

    for marker in (
        "export function applyFormAssociations",
        "export function setFieldValidation",
        "export function clearFieldValidation",
        "createHiddenHelp",
        "data-spn-rework-submit",
        "data-spn-rework-return",
        "data-lawyer-document-note-required",
        "aria-describedby",
        "aria-invalid",
        "data-nav-field-help",
        "queueMicrotask",
    ):
        if marker not in runtime:
            ERRORS.append(f"Form association runtime missing marker: {marker}")

    for forbidden in (
        "MutationObserver", "localStorage", "sessionStorage", "indexedDB", "document.cookie",
        "fetch(", "sendBeacon", "XMLHttpRequest", "WebSocket", "rpc(", "supabase",
        "innerHTML", "insertAdjacentHTML", "replaceChildren"
    ):
        if forbidden in runtime:
            ERRORS.append(f"Form association runtime must stay bounded and local: {forbidden}")

    for marker in (
        "import { applyFormAssociations } from './form-association-v2.js?v=20260715-01'",
        "applyFormAssociations(main);",
        "export function applyScreenStructure",
    ):
        if marker not in structure:
            ERRORS.append(f"Shared screen lifecycle missing form association marker: {marker}")

    mapping = '"./screen-structure-v2.js?v=20260715-01": "./assets/js/nav-v2/screen-structure-v2.js?v=20260715-02"'
    direct_entry = '<script type="module" src="./assets/js/nav-v2/form-association-v2.js'
    for page in PAGES:
        source = page.read_text(encoding="utf-8")
        if source.count(mapping) != 1:
            ERRORS.append(f"{page.name} must cache-bust the shared form association lifecycle exactly once")
        if direct_entry in source:
            ERRORS.append(f"{page.name} must not increase the page entry-module budget")

    source_markers = {
        "deals": ['id="dealSearch"', 'id="dealFilter"', 'placeholder="Адрес, объект, клиент, СПН, статус или ID"'],
        "deal_card": ['id="dealStatus"', 'id="newComment"', 'id="pageStatus"', 'Комментарий пустой.'],
        "rework": ['id="spnReworkCompletionText"', 'id="spnReworkReturnReason"', 'id="spnReworkStatusV2"'],
        "document": ['id="lawyerDocumentNoteV2"', 'id="lawyerDocumentStatusV2"', 'data-lawyer-document-note-required'],
    }
    for name, path in SOURCES.items():
        source = path.read_text(encoding="utf-8")
        for marker in source_markers[name]:
            if marker not in source:
                ERRORS.append(f"{name} source missing working-field marker: {marker}")

    for marker in (
        "Navigator v2 form association semantic checks passed",
        "fieldAssociationContract",
        "validationDescriptionIds",
        "errorRemovedAfterEdit",
    ):
        if marker not in node_check:
            ERRORS.append(f"Form association semantic check missing marker: {marker}")

    for marker in (
        "deal filters receive stable names and field-specific help",
        "visual labels are connected and permanent help stays separate from global status",
        "empty comment links its local error and editing restores help-only description",
        "rework and document validation attach only the relevant status then clear after correction",
        "toHaveAccessibleDescription",
        "aria-describedby",
        "aria-invalid",
        "unknownPlaceholderOnly",
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
        "applyScreenStructure(document)",
    ):
        if marker not in fixture:
            ERRORS.append(f"Form association fixture missing marker: {marker}")

    for marker in (
        "node scripts/check-nav-v2-form-associations.mjs",
        "python3 scripts/check_nav_v2_form_associations.py",
        "tests/e2e/form-associations.spec.js",
        "chromium-desktop",
        "chromium-mobile",
        "npx playwright install --with-deps chromium",
    ):
        if marker not in workflow:
            ERRORS.append(f"Form association workflow missing marker: {marker}")

if ERRORS:
    print("Navigator v2 form association errors:")
    for error in ERRORS:
        print(f"- {error}")
    sys.exit(1)

print(
    "Navigator v2 form association contract passed: stable field names, hidden permanent help, "
    "local error describedby only while invalid, edit recovery, unknown fields untouched, no backend/storage"
)
