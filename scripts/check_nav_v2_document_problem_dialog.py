from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "assets/js/nav-v2/action-dialog-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/action-dialog-v2.js"
INTEGRATION = ROOT / "assets/js/nav-v2/deal-card-document-problem-dialog-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
BASE = ROOT / "assets/js/nav-v2/deal-card-v2.js"
PAGE = ROOT / "deal-card-v2.html"
BROWSER = ROOT / "tests/e2e/document-problem-dialog.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-document-problem-dialog.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-document-problem-dialog.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (MODEL, RUNTIME, INTEGRATION, HOOK, BASE, PAGE, BROWSER, FIXTURE, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function buildDocumentProblemDialog",
        "id: 'deal-document-problem'",
        "title: 'Зафиксировать проблему документа'",
        "fallbackConfirm: false",
        "label: 'Что не так с документом'",
        "required: true",
        "errorText: 'Укажите короткую причину проблемы документа.'",
    ), MODEL.name, errors)

    runtime = RUNTIME.read_text(encoding="utf-8")
    require(runtime, (
        "const DRAFTS = new WeakMap()",
        "config.fallbackConfirm !== false",
        "rememberDraft(trigger, field.value)",
        "field.setAttribute('aria-invalid', 'true')",
        "field.setAttribute('aria-errormessage'",
        "focusTrigger(trigger)",
        "export function clearActionDialogDraft",
    ), RUNTIME.name, errors)

    integration = INTEGRATION.read_text(encoding="utf-8")
    require(integration, (
        "buildDocumentProblemDialog",
        "requestActionDialog(config, button)",
        "clearActionDialogDraft(button)",
        "[data-doc-id][data-doc-status=\"problem\"]",
        "nav_v2_update_document_workflow",
        "p_document_id: button.dataset.docId",
        "p_status: 'problem'",
        "p_assigned_to: null",
        "p_responsible_role: null",
        "p_due_date: null",
        "p_note: note",
        "button.onclick = () => void saveProblem(button)",
        "button.disabled = false",
    ), INTEGRATION.name, errors)

    for forbidden in (
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "fetch(",
        "sendBeacon",
        "XMLHttpRequest",
        "WebSocket",
        "prompt(",
        "MutationObserver",
    ):
        if forbidden in integration:
            errors.append(f"{INTEGRATION.name}: forbidden marker {forbidden!r}")

    if integration.count("rpc('nav_v2_update_document_workflow'") != 1:
        errors.append("Document problem integration must use exactly one existing mutation RPC")
    if integration.index("clearActionDialogDraft(button)") > integration.index("catch (error)"):
        errors.append("Document draft must clear only in the successful mutation path")

    hook = HOOK.read_text(encoding="utf-8")
    require(hook, (
        "import { applyDealCardDocumentProblemDialog } from './deal-card-document-problem-dialog-v2.js?v=20260715-01';",
        "applyDealCardDocumentWorkflow(cardData);",
        "applyDealCardDocumentProblemDialog(cardData);",
    ), HOOK.name, errors)
    if hook.index("applyDealCardDocumentProblemDialog(cardData);") < hook.index("applyDealCardDocumentWorkflow(cardData);"):
        errors.append("Document problem dialog must bind after the existing document workflow")

    base = BASE.read_text(encoding="utf-8")
    require(base, (
        "prompt('Что не так с документом? Это увидят СПН и юрист.')",
        "nav_v2_update_document_workflow",
        "p_status: btn.dataset.docStatus",
        "p_note: note || null",
    ), BASE.name, errors)

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        '"./deal-card-recheck-alert-v2.js?v=20260715-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-20"',
        '"./action-dialog-model-v2.js?v=20260715-01": "./assets/js/nav-v2/action-dialog-model-v2.js?v=20260715-02"',
        '"./action-dialog-v2.js?v=20260715-01": "./assets/js/nav-v2/action-dialog-v2.js?v=20260715-02"',
    ), PAGE.name, errors)
    if '<script type="module" src="./assets/js/nav-v2/deal-card-document-problem-dialog-v2.js' in page:
        errors.append("Document problem dialog must not increase the page entry-module budget")

    browser = BROWSER.read_text(encoding="utf-8")
    require(browser, (
        "Escape keeps draft without mutation",
        "required document reason stays inside dialog until corrected",
        "server error preserves document reason for a repeat attempt",
        "successful document problem uses the existing RPC payload",
        "demo document dialog includes explicit test-data context",
        "aria-invalid",
        "aria-errormessage",
        "toBeFocused",
    ), BROWSER.name, errors)

    fixture = FIXTURE.read_text(encoding="utf-8")
    require(fixture, (
        'id="app"',
        'id="pageStatus"',
        'id="documentProblem"',
        'data-doc-status="problem"',
        "applyDealCardDocumentProblemDialog(data)",
    ), FIXTURE.name, errors)

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "node scripts/check-nav-v2-action-dialog.mjs",
        "python3 scripts/check_nav_v2_document_problem_dialog.py",
        "python3 scripts/check_nav_v2_action_dialog.py",
        "tests/e2e/document-problem-dialog.spec.js",
        "chromium-desktop",
        "chromium-mobile",
    ), WORKFLOW.name, errors)

    combined = "\n".join((runtime, integration, fixture, browser))
    if re.search(r'tabindex=["\'][1-9]', combined, flags=re.IGNORECASE):
        errors.append("Positive tabindex is forbidden in document problem dialog files")

    if errors:
        print("Navigator v2 document problem dialog errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 document problem dialog passed: required reason, memory-only recovery, exact existing RPC payload, "
        "cancel safety and focus return"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
