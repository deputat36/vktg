from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "operational-pilot-action-checklist-v2.html"
UI = ROOT / "assets/js/nav-v2/operational-pilot-action-checklist-v2.js"
MODEL = ROOT / "assets/js/nav-v2/operational-pilot-action-checklist-model-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-operational-pilot-action-checklist.mjs"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"
DEDICATED_WORKFLOW = ROOT / ".github/workflows/nav-v2-operational-pilot-action-checklist.yml"
PUBLIC_SMOKE = ROOT / "tests/e2e/public-smoke.spec.js"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, UI, MODEL, SEMANTIC, BUDGET, STATIC_WORKFLOW, DEDICATED_WORKFLOW, PUBLIC_SMOKE):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        'aria-live="polite"',
        "assets/js/nav-v2/operational-pilot-action-checklist-v2.js?v=20260714-01",
        "assets/js/nav-v2/role-menu-v2.js?v=20260713-01",
        "assets/js/nav-v2/nav-base-menu-cleanup-v2.js?v=20260707-1210",
    ), PAGE.name, errors)

    ui = UI.read_text(encoding="utf-8")
    require(ui, (
        "validatePilotMeasurementBaseline",
        "createPilotActionState",
        "summarizePilotActionChecklist",
        "buildPilotActionChecklistPackage",
        "MAX_FILE_BYTES = 2 * 1024 * 1024",
        "['owner', 'admin'].includes(profile().role)",
        "navigator_v2_operational_pilot_measurement_baseline",
        "navigator-v2-operational-pilot-action-checklist-",
        "rpc('nav_v2_get_operational_adoption_report'",
        "URL.createObjectURL",
    ), UI.name, errors)
    if ui.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("pilot action checklist UI must use exactly one adoption report RPC call")
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
            errors.append(f"pilot action checklist UI must remain browser-local and read-only: {forbidden}")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function validatePilotMeasurementBaseline",
        "export function createPilotActionState",
        "export function updatePilotActionState",
        "export function summarizePilotActionChecklist",
        "export function buildPilotActionChecklistPackage",
        "navigator_v2_operational_pilot_measurement_baseline_validation",
        "navigator_v2_operational_pilot_action_checklist",
        "fresh_ready_for_action",
        "checklist_ready",
        "server_mutation_available: false",
        "automatic_task_creation_available: false",
        "automatic_assignment_available: false",
        "automatic_status_change_available: false",
        "checklist_is_execution_authorization: false",
        "pilot_started: false",
        "pilot_start_authorized: false",
        "requires_separate_owner_start_confirmation: true",
        "requires_result_evidence: true",
    ), MODEL.name, errors)
    for forbidden in ("rpc(", ".from(", "fetch(", "localStorage", "sessionStorage"):
        if forbidden in model:
            errors.append(f"pilot action checklist model must remain pure and offline: {forbidden}")

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, (
        "checklist_ready, true",
        "fresh_revalidation_passed, false",
        "duplicateBaseline",
        "pastSummary",
        "semantic regression passed",
    ), SEMANTIC.name, errors)

    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    if (budget.get("pages") or {}).get(PAGE.name) != {"max_modules": 3}:
        errors.append("pilot action checklist page must have a three-module budget")

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    dedicated_workflow = DEDICATED_WORKFLOW.read_text(encoding="utf-8")
    python_command = "python3 scripts/check_nav_v2_operational_pilot_action_checklist.py"
    node_command = "node scripts/check-nav-v2-operational-pilot-action-checklist.mjs"
    for workflow, label in ((static_workflow, STATIC_WORKFLOW.name), (dedicated_workflow, DEDICATED_WORKFLOW.name)):
        if python_command not in workflow:
            errors.append(f"{label}: missing pilot action checklist static regression")
        if node_command not in workflow:
            errors.append(f"{label}: missing pilot action checklist semantic regression")

    public_smoke = PUBLIC_SMOKE.read_text(encoding="utf-8")
    if "'/operational-pilot-action-checklist-v2.html'" not in public_smoke:
        errors.append("public smoke must include operational-pilot-action-checklist-v2.html guest gate")

    if errors:
        print("Navigator v2 operational pilot action checklist errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 operational pilot action checklist passed: local measurement baseline import, fresh comparison, "
        "one manual action per confirmed deal, responsible/deadline/evidence/next-step contract, one read-only RPC and no mutation"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
