from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

MODEL = ROOT / "assets/js/nav-v2/action-dialog-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/action-dialog-v2.js"
RISK = ROOT / "assets/js/nav-v2/deal-card-risk-resolution-v2.js"
DOCUMENT = ROOT / "assets/js/nav-v2/deal-card-document-problem-dialog-v2.js"
HANDOFF = ROOT / "assets/js/nav-v2/deal-card-lawyer-handoff-dialog-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
PAGE = ROOT / "deal-card-v2.html"
DEAL_CARD = ROOT / "assets/js/nav-v2/deal-card-v2.js"
REWORK = ROOT / "assets/js/nav-v2/deal-card-spn-rework-v2.js"
LAWYER_DOCUMENT = ROOT / "assets/js/nav-v2/deal-card-lawyer-document-cycle-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-action-dialog.mjs"
BROWSER = ROOT / "tests/e2e/action-dialog.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-action-dialog.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-action-dialog.yml"

PATHS = (MODEL, RUNTIME, RISK, DOCUMENT, HANDOFF, HOOK, PAGE, DEAL_CARD, REWORK, LAWYER_DOCUMENT, SEMANTIC, BROWSER, FIXTURE, WORKFLOW)
for path in PATHS:
    if not path.exists():
        ERRORS.append(f"Missing action dialog file: {path.relative_to(ROOT)}")


def require(text: str, markers: tuple[str, ...], label: str) -> None:
    for marker in markers:
        if marker not in text:
            ERRORS.append(f"{label} missing marker: {marker}")


if not ERRORS:
    model = MODEL.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    risk = RISK.read_text(encoding="utf-8")
    document = DOCUMENT.read_text(encoding="utf-8")
    handoff = HANDOFF.read_text(encoding="utf-8")
    hook = HOOK.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")
    deal_card = DEAL_CARD.read_text(encoding="utf-8")
    rework = REWORK.read_text(encoding="utf-8")
    lawyer_document = LAWYER_DOCUMENT.read_text(encoding="utf-8")
    semantic = SEMANTIC.read_text(encoding="utf-8")
    browser = BROWSER.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    require(model, (
        "export function nativeDialogInventory",
        "export function nativeDialogDecision",
        "export function buildRiskResolutionDialog",
        "export function buildDocumentProblemDialog",
        "export function buildLawyerHandoffDialog",
        "export function actionDialogContract",
        "deal-document-problem",
        "deal-lawyer-handoff",
        "risk-resolution",
        "decision: 'replace_now'",
        "decision: 'keep_native'",
        "fallbackConfirm: false",
        "inputDraftMemoryOnly: true",
        "draftPreservedOnCancel: true",
        "draftPreservedOnServerError: true",
        "draftClearedOnlyAfterSuccess: true",
        "positiveTabindexAllowed: false",
        "storageAllowed: false",
        "networkAllowed: false",
        "rpcAllowed: false",
    ), "Action dialog model")

    for forbidden in ("document.", "window.", "localStorage", "sessionStorage", "indexedDB", "fetch(", "rpc("):
        if forbidden in model:
            ERRORS.append(f"Action dialog model must remain pure: {forbidden}")

    require(runtime, (
        "const DRAFTS = new WeakMap()",
        "document.createElement('dialog')",
        "dialog.setAttribute('aria-labelledby'",
        "dialog.setAttribute('aria-describedby'",
        "dialog.setAttribute('aria-modal', 'true')",
        "dialog.addEventListener('cancel'",
        "dialog.addEventListener('close'",
        "dialog.showModal()",
        "focusTrigger(trigger)",
        "field.setAttribute('aria-invalid', 'true')",
        "field.setAttribute('aria-errormessage'",
        "config.fallbackConfirm !== false",
        "export function requestActionDialog",
        "export function clearActionDialogDraft",
        "window.confirm",
        "window.prompt",
    ), "Action dialog runtime")

    for forbidden in ("MutationObserver", "localStorage", "sessionStorage", "indexedDB", "document.cookie", "fetch(", "sendBeacon", "XMLHttpRequest", "WebSocket", "rpc(", "supabase", "service_role", "crypto.randomUUID", "innerHTML"):
        if forbidden in runtime:
            ERRORS.append(f"Action dialog runtime must stay DOM-only and memory-only: {forbidden}")

    require(risk, (
        "buildRiskResolutionDialog", "requestActionDialog", "clearActionDialogDraft(button)",
        "nav_v2_update_risk_resolution", "p_risk_id: risk.id", "p_is_resolved: nextState", "p_note: note || null",
        "if (!decision.confirmed) return;", "button.disabled = false;",
    ), "Risk integration")
    for forbidden in ("confirm(", "prompt(", "localStorage", "sessionStorage", "fetch(", "sendBeacon"):
        if forbidden in risk:
            ERRORS.append(f"Risk resolution must use controlled dialog: {forbidden}")

    require(document, (
        "buildDocumentProblemDialog", "requestActionDialog(config, button)", "clearActionDialogDraft(button)",
        "[data-doc-id][data-doc-status=\"problem\"]", "nav_v2_update_document_workflow",
        "p_document_id: button.dataset.docId", "p_status: 'problem'", "p_assigned_to: null",
        "p_responsible_role: null", "p_due_date: null", "p_note: note",
        "if (!decision.confirmed) return;", "button.disabled = false;",
    ), "Document problem integration")

    require(handoff, (
        "buildLawyerHandoffDialog", "requestActionDialog(config, button)",
        "[data-quick-status=\"need_lawyer\"]", "handoffIssues()", "if (!issues.length) return;",
        "nav_v2_update_deal_status", "p_deal_id: dealId", "p_status: 'need_lawyer'",
        "if (!decision.confirmed) return;", "button.disabled = false;",
    ), "Lawyer handoff integration")
    for forbidden in ("localStorage", "sessionStorage", "fetch(", "sendBeacon", "prompt(", "confirm("):
        if forbidden in handoff:
            ERRORS.append(f"Lawyer handoff enhancement must stay bounded: {forbidden}")
    if handoff.count("rpc('nav_v2_update_deal_status'") != 1:
        ERRORS.append("Lawyer handoff must use exactly one existing status RPC")

    require(hook, (
        "import { applyDealCardRiskResolution } from './deal-card-risk-resolution-v2.js?v=20260715-01';",
        "import { applyDealCardDocumentProblemDialog } from './deal-card-document-problem-dialog-v2.js?v=20260715-01';",
        "import { applyDealCardLawyerHandoffDialog } from './deal-card-lawyer-handoff-dialog-v2.js?v=20260715-01';",
        "applyDealCardRiskResolution(cardData, profileData);",
        "applyDealCardDocumentProblemDialog(cardData);",
        "applyDealCardLawyerHandoffDialog(cardData);",
    ), "Deal card hook")

    require(page, (
        '"./deal-card-recheck-alert-v2.js?v=20260715-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-21"',
        '"./deal-card-recheck-alert-v2.js?v=20260711-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-15"',
        '"./action-dialog-model-v2.js?v=20260715-01": "./assets/js/nav-v2/action-dialog-model-v2.js?v=20260715-03"',
        '"./action-dialog-model-v2.js?v=20260715-02": "./assets/js/nav-v2/action-dialog-model-v2.js?v=20260715-03"',
    ), "Deal card page")
    if '<script type="module" src="./assets/js/nav-v2/action-dialog-v2.js' in page:
        ERRORS.append("Action dialog must not increase the deal-card entry-module budget")

    source_markers = {
        deal_card: ("confirmDemoAction", "confirmLawyerHandoff", "prompt('Что не так с документом?"),
        rework: ("confirm(`По текущим данным", "Это демо-сделка", "Вернуть карточку СПН"),
        lawyer_document: ("Это демо-сделка", "if (!confirm(`${button.textContent.trim()}"),
    }
    for source, markers in source_markers.items():
        for marker in markers:
            if marker not in source:
                ERRORS.append(f"Native fallback source drift: {marker}")

    require(semantic, (
        "Navigator v2 action dialog semantic checks passed",
        "nativeDialogInventory", "buildRiskResolutionDialog", "buildDocumentProblemDialog",
        "buildLawyerHandoffDialog", "actionDialogContract", "replace_now", "keep_native",
    ), "Action dialog semantic check")

    require(browser, (
        "risk dialog exposes action context and restores focus after Escape",
        "risk note survives server-error simulation and clears only after success",
        "required input stays in dialog with a linked error until corrected",
        "reopen action has its own stable title and no positive tabindex",
        "page.keyboard.press('Escape')", "toHaveAccessibleDescription", "aria-invalid", "aria-errormessage", "toBeFocused",
    ), "Action dialog browser regression")

    require(fixture, (
        'id="app"', 'id="simulateSuccess"', 'id="resolveRisk"', 'id="reopenRisk"', 'id="requiredReason"',
        "buildRiskResolutionDialog", "requestActionDialog", "clearActionDialogDraft",
    ), "Action dialog fixture")

    require(workflow, (
        "node scripts/check-nav-v2-action-dialog.mjs", "python3 scripts/check_nav_v2_action_dialog.py",
        "tests/e2e/action-dialog.spec.js", "chromium-desktop", "chromium-mobile", "npx playwright install --with-deps chromium",
    ), "Action dialog workflow")

    combined = "\n".join((runtime, fixture, browser))
    if re.search(r'tabindex=["\'][1-9]', combined, flags=re.IGNORECASE):
        ERRORS.append("Positive tabindex is forbidden in action dialog files")

if ERRORS:
    print("Navigator v2 action dialog errors:")
    for error in ERRORS:
        print(f"- {error}")
    sys.exit(1)

print(
    "Navigator v2 action dialog contract passed: risk, document-problem and lawyer-handoff actions use one named dialog, "
    "focus returns and existing mutation contracts stay unchanged"
)
