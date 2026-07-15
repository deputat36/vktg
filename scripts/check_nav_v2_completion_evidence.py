from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "deal-card-v2.html"
LIFECYCLE = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-completion-evidence-v2.js"
MODEL = ROOT / "assets/js/nav-v2/deal-card-completion-evidence-model-v2.js"
CSS = ROOT / "assets/css/nav-v2-completion-evidence.css"
SEMANTIC = ROOT / "scripts/check-nav-v2-completion-evidence.mjs"
WORKFLOW = ROOT / ".github/workflows/nav-v2-completion-evidence.yml"


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, LIFECYCLE, HOOK, MODEL, CSS, SEMANTIC, WORKFLOW):
        if not path.exists():
            errors.append(f"missing completion evidence file: {path.relative_to(ROOT)}")

    if errors:
        print("Navigator v2 completion evidence errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    page = PAGE.read_text(encoding="utf-8")
    lifecycle = LIFECYCLE.read_text(encoding="utf-8")
    hook = HOOK.read_text(encoding="utf-8")
    model = MODEL.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")

    for marker in (
        "nav-v2-completion-evidence.css?v=20260715-01",
        "deal-card-recheck-alert-v2.js?v=20260715-15",
    ):
        if marker not in page:
            errors.append(f"deal-card-v2.html: missing {marker!r}")

    lifecycle_markers = (
        "import { applyDealCardCompletionEvidence } from './deal-card-completion-evidence-v2.js?v=20260715-01';",
        "applyDealCardActionFocus(cardData, profileData);",
        "applyDealCardCompletionEvidence(cardData, profileData);",
        "queueMicrotask(applyCardEnhancements);",
    )
    for marker in lifecycle_markers:
        if marker not in lifecycle:
            errors.append(f"deal-card lifecycle: missing {marker!r}")
    if lifecycle.find("applyDealCardCompletionEvidence(cardData, profileData);") < lifecycle.find("applyDealCardActionFocus(cardData, profileData);"):
        errors.append("completion evidence hook must run after the action focus has selected the next step")

    for marker in (
        "export function applyDealCardCompletionEvidence(data, profile)",
        "buildDealCompletionEvidence(data, profile || data?.profile || null)",
        'id="${PANEL_ID}"',
        "Результат подтверждён сервером",
        "Кто зафиксировал",
        "Следующее действие выбрано автоматически",
        "data-completion-next-tab",
        "actionFocus.insertAdjacentHTML('beforebegin', html)",
    ):
        if marker not in hook:
            errors.append(f"completion evidence hook: missing {marker!r}")
    for marker in ("rpc(", "nav_v2_get_", "nav_v2_update_", "localStorage", "sessionStorage", "new MutationObserver"):
        if marker in hook:
            errors.append(f"completion evidence hook contains forbidden read/mutation/bootstrap marker {marker!r}")

    for marker in (
        "export function buildDealCompletionEvidence",
        "buildDealActionFocus(data, currentProfile, now)",
        "task_status_changed",
        "document_workflow_updated",
        "risk_resolved",
        "status_changed",
        "DEFAULT_MAX_AGE_DAYS = 7",
        "entity?.status === 'done'",
        "serverFact",
        "actorLabel",
    ):
        if marker not in model:
            errors.append(f"completion evidence model: missing {marker!r}")
    for marker in ("document.", "window.", "rpc(", "localStorage", "sessionStorage"):
        if marker in model:
            errors.append(f"completion evidence model must remain pure: {marker!r}")

    for marker in (
        ".deal-completion-evidence",
        ".deal-completion-meta",
        ".deal-completion-next",
        '[data-nav-completion-evidence="document"] .lawyer-document-confirmation',
        "@media(max-width:860px)",
    ):
        if marker not in css:
            errors.append(f"completion evidence CSS: missing {marker!r}")

    if errors:
        print("Navigator v2 completion evidence errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 completion evidence contract passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
