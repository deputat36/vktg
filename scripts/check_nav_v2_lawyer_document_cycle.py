from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "deal-card-v2.html"
LIFECYCLE = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-lawyer-document-cycle-v2.js"
MODEL = ROOT / "assets/js/nav-v2/deal-card-lawyer-document-cycle-model-v2.js"
STYLE = ROOT / "assets/css/nav-v2-lawyer-document-cycle.css"
QUEUE = ROOT / "assets/js/nav-v2/queue-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-lawyer-document-cycle.mjs"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"
DEDICATED_WORKFLOW = ROOT / ".github/workflows/nav-v2-lawyer-document-cycle.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, LIFECYCLE, HOOK, MODEL, STYLE, QUEUE, SEMANTIC, STATIC_WORKFLOW, DEDICATED_WORKFLOW):
        if not path.exists():
            errors.append(f"missing lawyer document cycle file: {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    lifecycle = LIFECYCLE.read_text(encoding="utf-8")
    hook = HOOK.read_text(encoding="utf-8")
    model = MODEL.read_text(encoding="utf-8")
    style = STYLE.read_text(encoding="utf-8")
    queue = QUEUE.read_text(encoding="utf-8")
    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    dedicated_workflow = DEDICATED_WORKFLOW.read_text(encoding="utf-8")

    require(page, (
        "nav-v2-lawyer-document-cycle.css?v=20260715-01",
        "deal-card-recheck-alert-v2.js?v=20260715-15",
    ), PAGE.name, errors)

    require(lifecycle, (
        "import { applyLawyerDocumentCycle } from './deal-card-lawyer-document-cycle-v2.js?v=20260715-01';",
        "applyLawyerDocumentCycle(cardData, profileData);",
        "applyDealCardActionFocus(cardData, profileData);",
    ), LIFECYCLE.name, errors)
    if lifecycle.find("applyLawyerDocumentCycle(cardData, profileData);") > lifecycle.find("applyDealCardActionFocus(cardData, profileData);"):
        errors.append("lawyer document cycle must render before the general action focus")

    require(hook, (
        "export function applyLawyerDocumentCycle(data, profile)",
        "buildLawyerDocumentCycle(cardData, profileData",
        "const PANEL_ID = 'lawyerDocumentCycleV2';",
        "Главный документ сейчас",
        "Ответственный",
        "Контрольный срок",
        "Последнее изменение",
        "Проблема или комментарий",
        "Следующее действие",
        "Последнее подтверждённое действие",
        "nav_v2_update_document_workflow",
        "data-lawyer-document-action",
        "data-lawyer-document-select",
        "location.hash === `#${PANEL_ID}`",
    ), HOOK.name, errors)
    for marker in ("nav_v2_get_deal_card", "nav_v2_get_my_profile", "new MutationObserver", "localStorage", "sessionStorage"):
        if marker in hook:
            errors.append(f"lawyer document hook contains duplicate load/storage marker {marker!r}")
    if hook.count("rpc(") != 1:
        errors.append(f"lawyer document hook must contain one existing mutation RPC, got {hook.count('rpc(')}")

    require(model, (
        "export function buildLawyerDocumentCycle",
        "needed: [action('requested'",
        "requested: [action('received'",
        "received: [action('checked'",
        "problem: [action('requested'",
        "document_workflow_updated",
        "lastChangedAt",
        "blocking",
        "owner",
        "nextAction",
    ), MODEL.name, errors)
    for marker in ("document.", "window.", "rpc(", "localStorage", "sessionStorage"):
        if marker in model:
            errors.append(f"lawyer document model must remain pure: {marker!r}")

    require(queue, (
        "anchor: 'lawyerDocumentCycleV2'",
        "Разобрать проблемный документ",
        "Проверить документы",
    ), QUEUE.name, errors)

    require(style, (
        ".lawyer-document-cycle",
        ".lawyer-document-progress",
        ".lawyer-document-meta",
        ".lawyer-document-confirmation",
        ".lawyer-document-list",
        '@media(max-width:700px)',
    ), STYLE.name, errors)

    require(static_workflow, (
        "scripts/check_nav_v2_lawyer_document_cycle.py",
        "scripts/check-nav-v2-lawyer-document-cycle.mjs",
        ".github/workflows/nav-v2-lawyer-document-cycle.yml",
    ), STATIC_WORKFLOW.name, errors)
    require(dedicated_workflow, (
        "node --check assets/js/nav-v2/deal-card-lawyer-document-cycle-model-v2.js",
        "node --check assets/js/nav-v2/deal-card-lawyer-document-cycle-v2.js",
        "python3 scripts/check_nav_v2_lawyer_document_cycle.py",
        "node scripts/check-nav-v2-lawyer-document-cycle.mjs",
    ), DEDICATED_WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 lawyer document cycle errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 lawyer document cycle contract passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
