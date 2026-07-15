from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "assets/js/nav-v2/accessible-dialog-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/accessible-dialog-v2.js"
CSS = ROOT / "assets/css/nav-v2-accessible-dialog.css"
HOOK = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
PAGE = ROOT / "deal-card-v2.html"
SEMANTIC = ROOT / "scripts/check-nav-v2-accessible-dialog.mjs"
BROWSER = ROOT / "tests/e2e/accessible-dialog.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-accessible-dialog.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-accessible-dialog.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (MODEL, RUNTIME, CSS, HOOK, PAGE, SEMANTIC, BROWSER, FIXTURE, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "accessibleDialogPolicy",
        "accessibleDialogValidation",
        "accessibleDialogInventory",
        "lawyer_handoff_blockers",
        "document_problem_reason",
        "risk_resolution_comment",
        "existingRpcPayloadsOnly: true",
        "newRpcAllowed: false",
    ), MODEL.name, errors)

    runtime = RUNTIME.read_text(encoding="utf-8")
    require(runtime, (
        "document.createElement('dialog')",
        "dialog.showModal()",
        "dialog.setAttribute('role', 'dialog')",
        "dialog.addEventListener('cancel'",
        "trapFocus(event, dialog)",
        "trigger.focus({ preventScroll: true })",
        "dialog.setAttribute('aria-busy', 'true')",
        "event.stopImmediatePropagation()",
        "export function applyAccessibleDialogs",
    ), RUNTIME.name, errors)

    allowed_rpcs = {
        "nav_v2_update_deal_status",
        "nav_v2_update_document_workflow",
        "nav_v2_update_risk_resolution",
    }
    runtime_rpcs = set(re.findall(r"rpc\('([^']+)'", runtime))
    if runtime_rpcs != allowed_rpcs:
        errors.append(f"{RUNTIME.name}: RPC inventory drift: {sorted(runtime_rpcs)}")

    require(runtime, (
        "p_deal_id: dealId()",
        "p_status: 'need_lawyer'",
        "p_document_id: control.dataset.docId",
        "p_status: 'problem'",
        "p_assigned_to: null",
        "p_responsible_role: null",
        "p_due_date: null",
        "p_risk_id: control.dataset.riskId",
        "p_is_resolved: resolved",
    ), "existing RPC payloads", errors)

    for forbidden in ("MutationObserver", "localStorage", "sessionStorage", "window.prompt", "window.confirm"):
        if forbidden in runtime:
            errors.append(f"{RUNTIME.name}: forbidden marker {forbidden!r}")

    hook = HOOK.read_text(encoding="utf-8")
    require(hook, (
        "import { applyAccessibleDialogs } from './accessible-dialog-v2.js?v=20260715-01';",
        "applyAccessibleDialogs();",
        "applyAccessibleAsyncFeedback();",
        "applyFormAssociations();",
    ), HOOK.name, errors)

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "nav-v2-accessible-dialog.css?v=20260715-01",
        '"./deal-card-recheck-alert-v2.js?v=20260715-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-19"',
    ), PAGE.name, errors)
    if '<script type="module" src="./assets/js/nav-v2/accessible-dialog-v2.js' in page:
        errors.append("Accessible dialog must not increase entry-module budget")

    css = CSS.read_text(encoding="utf-8")
    require(css, (
        ".nav-accessible-dialog",
        ".nav-accessible-dialog::backdrop",
        ".nav-accessible-dialog.is-fallback",
        "@media (max-width: 430px)",
        "@media (forced-colors: active)",
    ), CSS.name, errors)

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, (
        "Navigator v2 accessible dialog semantic checks passed",
        "accessibleDialogInventory",
        "accessibleDialogValidation",
    ), SEMANTIC.name, errors)

    browser = BROWSER.read_text(encoding="utf-8")
    require(browser, (
        "Escape cancels without mutation",
        "document problem requires a reason",
        "risk dialog keeps optional comment after server error",
        "demo controlled action includes explicit test-data context",
        "dialog keeps keyboard focus inside its controls",
    ), BROWSER.name, errors)

    fixture = FIXTURE.read_text(encoding="utf-8")
    require(fixture, (
        'id="app"',
        'id="pageStatus"',
        'data-quick-status="need_lawyer"',
        'data-doc-status="problem"',
        'data-risk-resolution="resolved"',
    ), FIXTURE.name, errors)

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "node scripts/check-nav-v2-accessible-dialog.mjs",
        "python3 scripts/check_nav_v2_accessible_dialog.py",
        "tests/e2e/accessible-dialog.spec.js",
        "chromium-desktop",
        "chromium-mobile",
    ), WORKFLOW.name, errors)

    combined = "\n".join((runtime, fixture, browser))
    if re.search(r'tabindex=["\'][1-9]', combined, flags=re.IGNORECASE):
        errors.append("Positive tabindex is forbidden")

    if errors:
        print("Navigator v2 accessible dialog errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 accessible dialog contract passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
