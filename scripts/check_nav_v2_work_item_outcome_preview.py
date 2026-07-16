from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "deal-card-v2.html"
MODEL = ROOT / "assets/js/nav-v2/work-item-outcome-model-v2.js"
PREVIEW = ROOT / "assets/js/nav-v2/work-item-outcome-preview-v2.js"
STYLE = ROOT / "assets/css/nav-v2-outcome-preview.css"
SEMANTIC = ROOT / "scripts/check-nav-v2-work-item-outcome-preview.mjs"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
CONTRACT = ROOT / "config/nav-v2-work-item-outcome-contract.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-work-item-outcome-preview.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, MODEL, PREVIEW, STYLE, SEMANTIC, BUDGET, CONTRACT, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "assets/css/nav-v2-outcome-preview.css?v=20260716-01",
        "assets/js/nav-v2/work-item-outcome-preview-v2.js?v=20260716-01",
    ), PAGE.name, errors)

    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    if (budget.get("pages") or {}).get(PAGE.name) != {"max_modules": 20}:
        errors.append("deal-card-v2.html must have a 20-module budget after outcome preview")

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if contract.get("status") != "repository_only_prototype" or contract.get("production_applied") is not False:
        errors.append("outcome preview must be based on a non-production contract")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "DOCUMENT_OUTCOME_OPTIONS",
        "RISK_RESOLUTION_OPTIONS",
        "export function canConfirmDocumentOutcome",
        "export function canConfirmRiskResolution",
        "export function validateDocumentOutcome",
        "export function validateRiskResolution",
        "export function documentOutcomePreview",
        "export function riskResolutionPreview",
        "role === 'broker') return responsibleRole === 'broker'",
        "role === 'broker') return assignedRole === 'broker'",
        "Предложение не изменит готовность",
        "Предложение не снимет блокировку риска",
    ), MODEL.name, errors)
    for forbidden in ("document.", "window.", "localStorage", "sessionStorage", "rpc(", "fetch("):
        if forbidden in model:
            errors.append(f"outcome model must remain pure: {forbidden}")

    preview = PREVIEW.read_text(encoding="utf-8")
    require(preview, (
        "rpc('nav_v2_get_deal_card'",
        "rpc('nav_v2_get_my_profile'",
        "Без сохранения.",
        "не вызывает mutation RPC",
        "Предложить другой исход",
        "Предложить решение",
        "external_wait",
        "deferred",
        "replaced",
        "superseded",
        "dialog.showModal()",
        "new MutationObserver(schedule)",
    ), PREVIEW.name, errors)
    if preview.count("rpc('") != 2:
        errors.append("outcome preview must use exactly two existing read RPC call sites")
    for forbidden in (
        "nav_v2_propose_document_outcome",
        "nav_v2_decide_document_outcome",
        "nav_v2_propose_risk_resolution",
        "nav_v2_decide_risk_resolution",
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        ".from('nav_",
        '.from("nav_',
    ):
        if forbidden in preview:
            errors.append(f"preview must not call mutation or table surface: {forbidden}")

    style = STYLE.read_text(encoding="utf-8")
    require(style, (
        ".outcome-preview-dialog",
        ".outcome-preview-dialog::backdrop",
        "@media (max-width: 640px)",
    ), STYLE.name, errors)

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, (
        "canConfirmDocumentOutcome('spn', 'lawyer'",
        "canConfirmDocumentOutcome('broker', 'broker'",
        "canConfirmRiskResolution('manager', 'lawyer'",
        "validateDocumentOutcome({ code: 'external_wait'",
        "validateDocumentOutcome({ code: 'deferred'",
        "validateDocumentOutcome({ code: 'replaced'",
        "validateRiskResolution({ code: 'superseded'",
        "work-item outcome preview semantic regression passed",
    ), SEMANTIC.name, errors)

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "python3 scripts/check_nav_v2_work_item_outcome_preview.py",
        "node scripts/check-nav-v2-work-item-outcome-preview.mjs",
        "node --check assets/js/nav-v2/work-item-outcome-model-v2.js",
        "node --check assets/js/nav-v2/work-item-outcome-preview-v2.js",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 work-item outcome preview errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 work-item outcome preview passed: role copy, validation, readiness semantics and no mutation surface")
    return 0


if __name__ == "__main__":
    sys.exit(main())
