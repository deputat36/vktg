from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "operational-pilot-start-confirmation-v2.html"
UI = ROOT / "assets/js/nav-v2/operational-pilot-start-confirmation-v2.js"
MODEL = ROOT / "assets/js/nav-v2/operational-pilot-start-confirmation-model-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-operational-pilot-start-confirmation.mjs"
SOURCE_PAGE = ROOT / "operational-pilot-action-checklist-v2.html"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"
DEDICATED_WORKFLOW = ROOT / ".github/workflows/nav-v2-operational-pilot-start-confirmation.yml"
PUBLIC_SMOKE = ROOT / "tests/e2e/public-smoke.spec.js"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, UI, MODEL, SEMANTIC, SOURCE_PAGE, BUDGET, STATIC_WORKFLOW, DEDICATED_WORKFLOW, PUBLIC_SMOKE):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        'aria-live="polite"',
        "assets/js/nav-v2/operational-pilot-start-confirmation-v2.js?v=20260714-01",
        "assets/js/nav-v2/role-menu-v2.js?v=20260713-01",
        "assets/js/nav-v2/nav-base-menu-cleanup-v2.js?v=20260707-1210",
    ), PAGE.name, errors)

    ui = UI.read_text(encoding="utf-8")
    require(ui, (
        "validatePilotActionChecklist",
        "createOwnerStartState",
        "summarizeOwnerStartConfirmation",
        "buildOwnerStartConfirmationPackage",
        "MAX_FILE_BYTES = 2 * 1024 * 1024",
        "['owner', 'admin'].includes(profile().role)",
        "navigator_v2_operational_pilot_action_checklist",
        "navigator-v2-operational-pilot-owner-start-confirmation-",
        "rpc('nav_v2_get_operational_adoption_report'",
        "URL.createObjectURL",
    ), UI.name, errors)
    if ui.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("pilot owner start confirmation UI must use exactly one adoption report RPC call")
    for forbidden in (
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        ".from('nav_",
        '.from("nav_',
        "localStorage",
        "sessionStorage",
    ):
        if forbidden in ui:
            errors.append(f"pilot owner start confirmation UI must remain browser-local and read-only: {forbidden}")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function validatePilotActionChecklist",
        "export function createOwnerStartState",
        "export function updateOwnerStartState",
        "export function summarizeOwnerStartConfirmation",
        "export function buildOwnerStartConfirmationPackage",
        "navigator_v2_operational_pilot_action_checklist_validation",
        "navigator_v2_operational_pilot_owner_start_confirmation",
        "fresh_ready_for_owner_start",
        "decision_package_ready",
        "pilot_start_authorized_by_owner",
        "server_mutation_available: false",
        "automatic_task_creation_available: false",
        "automatic_assignment_available: false",
        "automatic_status_change_available: false",
        "owner_confirmation_is_server_execution: false",
        "pilot_started: false",
        "responsible_acknowledgement_recorded: false",
        "requires_manual_responsible_acknowledgement: true",
        "requires_execution_receipt: true",
        "requires_result_evidence: true",
    ), MODEL.name, errors)
    for forbidden in ("rpc(", ".from(", "fetch(", "localStorage", "sessionStorage"):
        if forbidden in model:
            errors.append(f"pilot owner start confirmation model must remain pure and offline: {forbidden}")

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, (
        "decision_package_ready, true",
        "pilot_start_authorized, true",
        "fresh_revalidation_passed, false",
        "duplicateChecklist",
        "pastSummary",
        "tamperedSafety",
        "rejected.pilot_start_authorized, false",
        "semantic regression passed",
    ), SEMANTIC.name, errors)

    source_page = SOURCE_PAGE.read_text(encoding="utf-8")
    if "operational-pilot-start-confirmation-v2.html" not in source_page:
        errors.append("action checklist page must link to the owner start confirmation page")

    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    if (budget.get("pages") or {}).get(PAGE.name) != {"max_modules": 3}:
        errors.append("pilot owner start confirmation page must have a three-module budget")

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    dedicated_workflow = DEDICATED_WORKFLOW.read_text(encoding="utf-8")
    python_command = "python3 scripts/check_nav_v2_operational_pilot_start_confirmation.py"
    node_command = "node scripts/check-nav-v2-operational-pilot-start-confirmation.mjs"
    for workflow, label in ((static_workflow, STATIC_WORKFLOW.name), (dedicated_workflow, DEDICATED_WORKFLOW.name)):
        if python_command not in workflow:
            errors.append(f"{label}: missing pilot owner start confirmation static regression")
        if node_command not in workflow:
            errors.append(f"{label}: missing pilot owner start confirmation semantic regression")

    public_smoke = PUBLIC_SMOKE.read_text(encoding="utf-8")
    if "'/operational-pilot-start-confirmation-v2.html'" not in public_smoke:
        errors.append("public smoke must include operational-pilot-start-confirmation-v2.html guest gate")

    if errors:
        print("Navigator v2 operational pilot owner start confirmation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 operational pilot owner start confirmation passed: local checklist import, fresh comparison, "
        "explicit owner decision per action, bounded authorization, responsible acknowledgement gate, one read-only RPC and no mutation"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
