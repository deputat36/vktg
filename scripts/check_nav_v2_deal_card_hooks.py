from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_MODULE = ROOT / "assets/js/nav-v2/deal-card-v2.js"
RECHECK_MODULE = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
ACTION_FOCUS_MODULE = ROOT / "assets/js/nav-v2/deal-card-action-focus-v2.js"
ACTION_FOCUS_MODEL = ROOT / "assets/js/nav-v2/deal-card-action-focus-model-v2.js"
COMPLETION_EVIDENCE_MODULE = ROOT / "assets/js/nav-v2/deal-card-completion-evidence-v2.js"
COMPLETION_EVIDENCE_MODEL = ROOT / "assets/js/nav-v2/deal-card-completion-evidence-model-v2.js"
SPN_REWORK_MODULE = ROOT / "assets/js/nav-v2/deal-card-spn-rework-v2.js"
SPN_REWORK_MODEL = ROOT / "assets/js/nav-v2/deal-card-spn-rework-model-v2.js"
LAWYER_DOCUMENT_MODULE = ROOT / "assets/js/nav-v2/deal-card-lawyer-document-cycle-v2.js"
LAWYER_DOCUMENT_MODEL = ROOT / "assets/js/nav-v2/deal-card-lawyer-document-cycle-model-v2.js"
BAZA_MODULE = ROOT / "assets/js/nav-v2/deal-card-baza-hints-v2.js"
SPN_HANDOFF_MODULE = ROOT / "assets/js/nav-v2/deal-card-spn-handoff-v2.js"
SPN_SAVE_CONFIRMATION_MODULE = ROOT / "assets/js/nav-v2/deal-card-spn-save-confirmation-v2.js"
RESPONSIBILITY_MODULE = ROOT / "assets/js/nav-v2/deal-responsibility-snapshot-v2.js"
SPN_RESPONSIBILITY_MODULE = ROOT / "assets/js/nav-v2/deal-card-spn-responsibility-v2.js"
DOC_WORKFLOW_MODULE = ROOT / "assets/js/nav-v2/deal-card-doc-workflow-v2.js"
TASK_DUE_MODULE = ROOT / "assets/js/nav-v2/deal-card-task-due-date-v2.js"
EXPENSE_LABELS_MODULE = ROOT / "assets/js/nav-v2/expense-labels-v2.js"
READABLE_VALUES_MODULE = ROOT / "assets/js/nav-v2/readable-card-values-v2.js"
PAGE = ROOT / "deal-card-v2.html"
BUDGET = ROOT / "config/nav-v2-module-budget.json"


def main() -> int:
    errors: list[str] = []
    paths = (
        BASE_MODULE,
        RECHECK_MODULE,
        ACTION_FOCUS_MODULE,
        ACTION_FOCUS_MODEL,
        COMPLETION_EVIDENCE_MODULE,
        COMPLETION_EVIDENCE_MODEL,
        SPN_REWORK_MODULE,
        SPN_REWORK_MODEL,
        LAWYER_DOCUMENT_MODULE,
        LAWYER_DOCUMENT_MODEL,
        BAZA_MODULE,
        SPN_HANDOFF_MODULE,
        SPN_SAVE_CONFIRMATION_MODULE,
        RESPONSIBILITY_MODULE,
        SPN_RESPONSIBILITY_MODULE,
        DOC_WORKFLOW_MODULE,
        TASK_DUE_MODULE,
        EXPENSE_LABELS_MODULE,
        READABLE_VALUES_MODULE,
        PAGE,
        BUDGET,
    )
    for path in paths:
        if not path.exists():
            errors.append(f"Missing deal-card hook file: {path.relative_to(ROOT)}")

    if not errors:
        base = BASE_MODULE.read_text(encoding="utf-8")
        recheck = RECHECK_MODULE.read_text(encoding="utf-8")
        action_focus = ACTION_FOCUS_MODULE.read_text(encoding="utf-8")
        action_model = ACTION_FOCUS_MODEL.read_text(encoding="utf-8")
        completion_evidence = COMPLETION_EVIDENCE_MODULE.read_text(encoding="utf-8")
        completion_model = COMPLETION_EVIDENCE_MODEL.read_text(encoding="utf-8")
        spn_rework = SPN_REWORK_MODULE.read_text(encoding="utf-8")
        spn_rework_model = SPN_REWORK_MODEL.read_text(encoding="utf-8")
        lawyer_document = LAWYER_DOCUMENT_MODULE.read_text(encoding="utf-8")
        lawyer_document_model = LAWYER_DOCUMENT_MODEL.read_text(encoding="utf-8")
        baza = BAZA_MODULE.read_text(encoding="utf-8")
        spn_handoff = SPN_HANDOFF_MODULE.read_text(encoding="utf-8")
        spn_save_confirmation = SPN_SAVE_CONFIRMATION_MODULE.read_text(encoding="utf-8")
        responsibility = RESPONSIBILITY_MODULE.read_text(encoding="utf-8")
        spn_responsibility = SPN_RESPONSIBILITY_MODULE.read_text(encoding="utf-8")
        doc_workflow = DOC_WORKFLOW_MODULE.read_text(encoding="utf-8")
        task_due = TASK_DUE_MODULE.read_text(encoding="utf-8")
        expense_labels = EXPENSE_LABELS_MODULE.read_text(encoding="utf-8")
        readable_values = READABLE_VALUES_MODULE.read_text(encoding="utf-8")
        page = PAGE.read_text(encoding="utf-8")
        budget = json.loads(BUDGET.read_text(encoding="utf-8"))

        base_markers = (
            "import { applyDealCardRecheckAlert } from './deal-card-recheck-alert-v2.js?v=20260711-02';",
            "renderCard(cardData);",
            "applyDealCardRecheckAlert(cardData, currentProfile);",
        )
        for marker in base_markers:
            if marker not in base:
                errors.append(f"deal-card-v2.js missing explicit hook marker: {marker}")
        if base.find("applyDealCardRecheckAlert(cardData, currentProfile);") < base.find("renderCard(cardData);"):
            errors.append("deal-card-v2.js must run enhancement hook after the card DOM is rendered")

        recheck_markers = (
            "export function applyDealCardRecheckAlert(data, profile)",
            "import { applyDealCardSpnRework } from './deal-card-spn-rework-v2.js?v=20260715-01';",
            "import { applyLawyerDocumentCycle } from './deal-card-lawyer-document-cycle-v2.js?v=20260715-01';",
            "import { applyDealCardActionFocus } from './deal-card-action-focus-v2.js?v=20260714-12';",
            "import { applyDealCardCompletionEvidence } from './deal-card-completion-evidence-v2.js?v=20260715-01';",
            "import { applyDealCardBazaHints } from './deal-card-baza-hints-v2.js?v=20260711-03';",
            "import { applyDealCardSpnHandoff } from './deal-card-spn-handoff-v2.js?v=20260711-04';",
            "import { applyDealResponsibilitySnapshot } from './deal-responsibility-snapshot-v2.js?v=20260711-05';",
            "import { applyDealCardDocumentWorkflow } from './deal-card-doc-workflow-v2.js?v=20260711-06';",
            "import { applyDealCardTaskDueDate } from './deal-card-task-due-date-v2.js?v=20260711-07';",
            "import { applyDealCardExpenseLabels } from './expense-labels-v2.js?v=20260711-08';",
            "import { applyDealCardReadableValues } from './readable-card-values-v2.js?v=20260711-09';",
            "import { applySpnSaveConfirmation } from './deal-card-spn-save-confirmation-v2.js?v=20260713-11';",
            "applyDealCardSpnRework(cardData, profileData);",
            "applyLawyerDocumentCycle(cardData, profileData);",
            "applyDealCardActionFocus(cardData, profileData);",
            "applyDealCardCompletionEvidence(cardData, profileData);",
            "applyDealCardSpnHandoff(cardData);",
            "applyDealCardDocumentWorkflow(cardData);",
            "applyDealCardTaskDueDate(cardData);",
            "applyDealCardExpenseLabels();",
            "applyDealCardReadableValues();",
            "applyDealResponsibilitySnapshot(cardData);",
            "void applySpnSaveConfirmation(cardData);",
            "void applyDealCardBazaHints(cardData, profileData);",
            "queueMicrotask(applyCardEnhancements);",
        )
        for marker in recheck_markers:
            if marker not in recheck:
                errors.append(f"deal-card enhancement lifecycle missing marker: {marker}")
        if recheck.find("applyDealCardActionFocus(cardData, profileData);") < recheck.find("applyDealCardSpnRework(cardData, profileData);"):
            errors.append("deal-card action focus must run after the unified SPN rework workflow")
        if recheck.find("applyDealCardActionFocus(cardData, profileData);") < recheck.find("applyLawyerDocumentCycle(cardData, profileData);"):
            errors.append("deal-card action focus must run after the lawyer document cycle")
        if recheck.find("applyDealCardCompletionEvidence(cardData, profileData);") < recheck.find("applyDealCardActionFocus(cardData, profileData);"):
            errors.append("deal-card completion evidence must reuse the next action selected by action focus")

        forbidden_recheck_markers = (
            "rpc('nav_v2_get_deal_card'",
            "getMyProfile(",
            "new MutationObserver",
            "loadRecheckAlert()",
        )
        for marker in forbidden_recheck_markers:
            if marker in recheck:
                errors.append(f"deal-card recheck helper still contains legacy patch behavior: {marker}")

        action_markers = (
            "export function applyDealCardActionFocus(data, profile)",
            "buildDealActionFocus(data, profile || data?.profile || null)",
            "id=\"dealActionFocus\"",
            "Главное действие сейчас",
            "Как понять, что готово",
            "data-action-focus-tab",
        )
        for marker in action_markers:
            if marker not in action_focus:
                errors.append(f"deal-card action focus missing marker: {marker}")
        for marker in ("rpc(", "new MutationObserver", "localStorage", "sessionStorage", "nav_v2_update_", "nav_v2_add_", "nav_v2_save_"):
            if marker in action_focus:
                errors.append(f"deal-card action focus must remain RPC-free and read-only: {marker}")
        if "export function buildDealActionFocus" not in action_model:
            errors.append("deal-card action focus model must export buildDealActionFocus")
        for marker in ("document.", "window.", "rpc(", "localStorage", "sessionStorage"):
            if marker in action_model:
                errors.append(f"deal-card action focus model must remain pure: {marker}")

        if "export function applyDealCardCompletionEvidence(data, profile)" not in completion_evidence:
            errors.append("deal-card completion evidence must export its explicit lifecycle hook")
        for marker in ("rpc(", "nav_v2_get_", "nav_v2_update_", "new MutationObserver", "localStorage", "sessionStorage"):
            if marker in completion_evidence:
                errors.append(f"deal-card completion evidence must remain read-only and use the loaded payload: {marker}")
        if "export function buildDealCompletionEvidence" not in completion_model:
            errors.append("deal-card completion evidence model must export buildDealCompletionEvidence")
        for marker in ("document.", "window.", "rpc(", "localStorage", "sessionStorage"):
            if marker in completion_model:
                errors.append(f"deal-card completion evidence model must remain pure: {marker}")

        if "export function applyDealCardSpnRework(data, profile)" not in spn_rework:
            errors.append("SPN rework helper must export its explicit lifecycle hook")
        for marker in ("nav_v2_get_deal_card", "nav_v2_get_my_profile", "new MutationObserver", "localStorage", "sessionStorage"):
            if marker in spn_rework:
                errors.append(f"SPN rework helper contains duplicate bootstrap/storage behavior: {marker}")
        if spn_rework.count("rpc(") != 2:
            errors.append(f"SPN rework helper must contain only its two existing mutation RPCs, got {spn_rework.count('rpc(')}")
        if "export function buildSpnReworkModel" not in spn_rework_model:
            errors.append("SPN rework model must export buildSpnReworkModel")
        for marker in ("document.", "window.", "rpc(", "localStorage", "sessionStorage"):
            if marker in spn_rework_model:
                errors.append(f"SPN rework model must remain pure: {marker}")

        if "export function applyLawyerDocumentCycle(data, profile)" not in lawyer_document:
            errors.append("lawyer document cycle must export its explicit lifecycle hook")
        if lawyer_document.count("rpc(") != 1 or "nav_v2_update_document_workflow" not in lawyer_document:
            errors.append("lawyer document cycle must use only the existing document workflow mutation RPC")
        for marker in ("nav_v2_get_deal_card", "nav_v2_get_my_profile", "new MutationObserver", "localStorage", "sessionStorage"):
            if marker in lawyer_document:
                errors.append(f"lawyer document cycle contains duplicate bootstrap/storage behavior: {marker}")
        if "export function buildLawyerDocumentCycle" not in lawyer_document_model:
            errors.append("lawyer document cycle model must export buildLawyerDocumentCycle")
        for marker in ("document.", "window.", "rpc(", "localStorage", "sessionStorage"):
            if marker in lawyer_document_model:
                errors.append(f"lawyer document cycle model must remain pure: {marker}")

        if "export async function applyDealCardBazaHints(card, profile)" not in baza:
            errors.append("deal-card BAZA helper must export its explicit lifecycle hook")
        forbidden_baza_markers = (
            "rpc(",
            "getCachedUser",
            "new MutationObserver",
            "nav_v2_get_my_profile",
            "nav_v2_get_deal_card",
        )
        for marker in forbidden_baza_markers:
            if marker in baza:
                errors.append(f"deal-card BAZA helper still contains duplicate loading behavior: {marker}")

        if "export function applyDealCardSpnHandoff(data)" not in spn_handoff:
            errors.append("deal-card SPN handoff helper must export its explicit lifecycle hook")
        forbidden_handoff_markers = (
            "rpc(",
            "new MutationObserver",
            "loadData()",
            "requestAnimationFrame",
            "window.addEventListener('hashchange'",
            "import './deal-card-spn-responsibility-v2.js'",
        )
        for marker in forbidden_handoff_markers:
            if marker in spn_handoff:
                errors.append(f"deal-card SPN handoff helper still contains duplicate bootstrap behavior: {marker}")

        if "export async function applySpnSaveConfirmation(cardData)" not in spn_save_confirmation:
            errors.append("SPN save confirmation helper must export its explicit lifecycle hook")
        if spn_save_confirmation.count("rpc(") != 1 or "nav_v2_get_deal_responsibility_snapshot" not in spn_save_confirmation:
            errors.append("SPN save confirmation must use exactly one existing responsibility read RPC")
        for marker in ("nav_v2_update_", "nav_v2_add_", "nav_v2_save_", "new MutationObserver"):
            if marker in spn_save_confirmation:
                errors.append(f"SPN save confirmation must remain read-only and explicit-hook based: {marker}")

        responsibility_markers = (
            "export function applyDealResponsibilitySnapshot(cardData)",
            "import { renderDealCardSpnResponsibility } from './deal-card-spn-responsibility-v2.js?v=20260711-05';",
            "rpc('nav_v2_get_deal_responsibility_snapshot'",
            "renderDealCardSpnResponsibility(snapshot);",
            "window.addEventListener('nav-v2:document-workflow-updated'",
        )
        for marker in responsibility_markers:
            if marker not in responsibility:
                errors.append(f"responsibility lifecycle missing marker: {marker}")
        for marker in ("new MutationObserver", "load();", "nav-v2:deal-card-updated"):
            if marker in responsibility:
                errors.append(f"responsibility lifecycle still contains legacy bootstrap behavior: {marker}")

        if "export function renderDealCardSpnResponsibility(snapshot)" not in spn_responsibility:
            errors.append("SPN responsibility helper must export a pure snapshot renderer")
        for marker in ("rpc(", "new MutationObserver", "load();", "window.addEventListener"):
            if marker in spn_responsibility:
                errors.append(f"SPN responsibility helper must remain renderer-only: {marker}")

        snapshot_rpc_count = responsibility.count("nav_v2_get_deal_responsibility_snapshot") + spn_responsibility.count("nav_v2_get_deal_responsibility_snapshot")
        if snapshot_rpc_count != 1:
            errors.append(f"responsibility modules must contain exactly one snapshot RPC call, got {snapshot_rpc_count}")

        doc_workflow_markers = (
            "export function applyDealCardDocumentWorkflow(data)",
            "await rpc('nav_v2_update_document_assignment'",
            "const refreshed = await refreshCardAfterMutation();",
            "cardData = await rpc('nav_v2_get_deal_card'",
            "window.dispatchEvent(new CustomEvent('nav-v2:document-workflow-updated'))",
        )
        for marker in doc_workflow_markers:
            if marker not in doc_workflow:
                errors.append(f"document workflow lifecycle missing marker: {marker}")
        forbidden_doc_workflow_markers = (
            "new MutationObserver",
            "scheduleEnhance",
            "function boot",
            "boot();",
            "observerStarted",
            "requestAnimationFrame",
            "async function loadCard",
        )
        for marker in forbidden_doc_workflow_markers:
            if marker in doc_workflow:
                errors.append(f"document workflow still contains legacy bootstrap behavior: {marker}")
        card_rpc_count = doc_workflow.count("nav_v2_get_deal_card")
        if card_rpc_count != 1:
            errors.append(f"document workflow must contain one post-mutation card refresh RPC, got {card_rpc_count}")
        update_marker = "await rpc('nav_v2_update_document_assignment'"
        refresh_marker = "cardData = await rpc('nav_v2_get_deal_card'"
        if doc_workflow.find(refresh_marker) < doc_workflow.find(update_marker):
            errors.append("document workflow card refresh must remain after the assignment mutation path")

        task_due_markers = (
            "export function applyDealCardTaskDueDate(data)",
            "rpc('nav_v2_update_task_due_date'",
            "if (!(target instanceof Element)) return;",
            "setTimeout(() => location.reload(), 250);",
        )
        for marker in task_due_markers:
            if marker not in task_due:
                errors.append(f"task due-date lifecycle missing marker: {marker}")
        forbidden_task_due_markers = (
            "nav_v2_get_deal_card",
            "ensureCardData",
            "let loading",
            "window.addEventListener('hashchange'",
            "setTimeout(ensureCardData",
            "const dealId",
        )
        for marker in forbidden_task_due_markers:
            if marker in task_due:
                errors.append(f"task due-date helper still contains duplicate loading behavior: {marker}")
        task_due_rpc_count = task_due.count("rpc(")
        if task_due_rpc_count != 1:
            errors.append(f"task due-date helper must contain only its mutation RPC, got {task_due_rpc_count}")

        if "export function applyDealCardExpenseLabels()" not in expense_labels:
            errors.append("expense labels helper must export its explicit lifecycle hook")
        forbidden_expense_markers = (
            "new MutationObserver",
            "requestAnimationFrame",
            "window.addEventListener('hashchange'",
            "const app =",
            "applyExpenseLabels();",
            "rpc(",
        )
        for marker in forbidden_expense_markers:
            if marker in expense_labels:
                errors.append(f"expense labels helper still contains legacy bootstrap behavior: {marker}")

        if "export function applyDealCardReadableValues()" not in readable_values:
            errors.append("readable values helper must export its explicit lifecycle hook")
        forbidden_readable_markers = (
            "new MutationObserver",
            "requestAnimationFrame",
            "window.addEventListener('hashchange'",
            "const app =",
            "applyReadableValues();",
            "rpc(",
        )
        for marker in forbidden_readable_markers:
            if marker in readable_values:
                errors.append(f"readable values helper still contains legacy bootstrap behavior: {marker}")

        if 'deal-card-v2.js?v=20260711-02' not in page:
            errors.append("deal-card-v2.html missing explicit-hook cache-bust")
        standalone_modules = (
            "deal-card-recheck-alert-v2.js",
            "deal-card-action-focus-v2.js",
            "deal-card-action-focus-model-v2.js",
            "deal-card-completion-evidence-v2.js",
            "deal-card-completion-evidence-model-v2.js",
            "deal-card-spn-rework-v2.js",
            "deal-card-spn-rework-model-v2.js",
            "deal-card-lawyer-document-cycle-v2.js",
            "deal-card-lawyer-document-cycle-model-v2.js",
            "deal-card-baza-hints-v2.js",
            "deal-card-spn-handoff-v2.js",
            "deal-card-spn-save-confirmation-v2.js",
            "deal-responsibility-snapshot-v2.js",
            "deal-card-doc-workflow-v2.js",
            "deal-card-task-due-date-v2.js",
            "expense-labels-v2.js",
            "readable-card-values-v2.js",
        )
        for module in standalone_modules:
            marker = f'<script type="module" src="./assets/js/nav-v2/{module}'
            if marker in page:
                errors.append(f"{module} must not remain a standalone HTML entry module")
        cache_mapping = '"./deal-card-recheck-alert-v2.js?v=20260711-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-15"'
        if cache_mapping not in page:
            errors.append("deal-card page must map the core enhancement specifier to the current cache-busted hook")

        max_modules = ((budget.get("pages") or {}).get("deal-card-v2.html") or {}).get("max_modules")
        if max_modules != 19:
            errors.append(f"deal-card module budget must be 19 after rework lifecycle consolidation, got {max_modules!r}")

    if errors:
        print("Navigator v2 deal-card hook errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 deal-card hook passed: shared lifecycle includes rework, action focus, completion evidence and save confirmation")
    return 0


if __name__ == "__main__":
    sys.exit(main())
