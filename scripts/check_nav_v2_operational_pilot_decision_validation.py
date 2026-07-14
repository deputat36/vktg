from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "operational-pilot-decision-validation-v2.html"
DECISION_PAGE = ROOT / "operational-pilot-decision-v2.html"
UI = ROOT / "assets/js/nav-v2/operational-pilot-decision-validation-v2.js"
MODEL = ROOT / "assets/js/nav-v2/operational-pilot-decision-validation-model-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-operational-pilot-decision-validation.mjs"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"
DEDICATED_WORKFLOW = ROOT / ".github/workflows/nav-v2-operational-pilot-decision-validation.yml"
PUBLIC_SMOKE = ROOT / "tests/e2e/public-smoke.spec.js"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, DECISION_PAGE, UI, MODEL, SEMANTIC, BUDGET, STATIC_WORKFLOW, DEDICATED_WORKFLOW, PUBLIC_SMOKE):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        'aria-live="polite"',
        "assets/js/nav-v2/operational-pilot-decision-validation-v2.js?v=20260714-01",
        "assets/js/nav-v2/role-menu-v2.js?v=20260713-01",
        "assets/js/nav-v2/nav-base-menu-cleanup-v2.js?v=20260707-1210",
    ), PAGE.name, errors)

    decision_page = DECISION_PAGE.read_text(encoding="utf-8")
    require(decision_page, (
        "operational-pilot-decision-validation-v2.html",
        "Проверить скачанный JSON",
        "assets/js/nav-v2/operational-pilot-decision-v2.js?v=20260714-01",
    ), DECISION_PAGE.name, errors)

    ui = UI.read_text(encoding="utf-8")
    require(ui, (
        "validatePilotOwnerDecisionPackage",
        "buildPilotMeasurementBaseline",
        "MAX_FILE_BYTES = 2 * 1024 * 1024",
        "['owner', 'admin'].includes(profile().role)",
        "Проверка owner decision package доступна только владельцу и администратору.",
        "navigator_v2_operational_pilot_owner_decision",
        "navigator-v2-operational-pilot-owner-decision-validation-",
        "navigator-v2-operational-pilot-measurement-baseline-",
        "Fresh read-only revalidation",
        "Measurement baseline",
        "Файл остаётся локально",
        "pilot start по-прежнему не разрешён",
        "rpc('nav_v2_get_operational_adoption_report'",
        "URL.createObjectURL",
    ), UI.name, errors)
    if ui.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("pilot decision validation UI must use exactly one adoption report RPC call")
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
            errors.append(f"pilot decision validation UI must remain browser-local and read-only: {forbidden}")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function validatePilotOwnerDecisionPackage",
        "export function buildPilotMeasurementBaseline",
        "navigator_v2_operational_pilot_owner_decision_validation",
        "navigator_v2_operational_pilot_measurement_baseline",
        "decision_package_valid",
        "fresh_revalidation_passed",
        "measurement_baseline_ready",
        "confirmed_ready_for_baseline",
        "rejected_verified",
        "server_mutation_available: false",
        "pilot_started: false",
        "pilot_start_authorized: false",
        "automatic_task_creation_available: false",
        "automatic_assignment_available: false",
        "automatic_status_change_available: false",
        "requires_result_evidence: true",
        "overdue_required_documents",
        "snapshotChanges",
        "shortlist_key",
    ), MODEL.name, errors)
    for forbidden in ("rpc(", ".from(", "fetch(", "localStorage", "sessionStorage"):
        if forbidden in model:
            errors.append(f"pilot decision validation model must remain pure and offline: {forbidden}")

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, (
        "measurement_baseline_ready, true",
        "fresh_revalidation_passed, false",
        "overdue_required_documents",
        "pilot_start_authorized, false",
        "automatic_task_creation_available, false",
        "role: 'manager'",
        "allRejectedValidation",
        "semantic regression passed",
    ), SEMANTIC.name, errors)

    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    if (budget.get("pages") or {}).get(PAGE.name) != {"max_modules": 3}:
        errors.append("pilot decision validation page must have a three-module budget")

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    dedicated_workflow = DEDICATED_WORKFLOW.read_text(encoding="utf-8")
    python_command = "python3 scripts/check_nav_v2_operational_pilot_decision_validation.py"
    node_command = "node scripts/check-nav-v2-operational-pilot-decision-validation.mjs"
    for workflow, label in ((static_workflow, STATIC_WORKFLOW.name), (dedicated_workflow, DEDICATED_WORKFLOW.name)):
        if python_command not in workflow:
            errors.append(f"{label}: missing pilot decision validation static regression")
        if node_command not in workflow:
            errors.append(f"{label}: missing pilot decision validation semantic regression")

    public_smoke = PUBLIC_SMOKE.read_text(encoding="utf-8")
    if "'/operational-pilot-decision-validation-v2.html'" not in public_smoke:
        errors.append("public smoke must include operational-pilot-decision-validation-v2.html guest gate")

    if errors:
        print("Navigator v2 operational pilot decision validation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 operational pilot decision validation passed: local owner package import, exact fresh shortlist comparison, "
        "stale detection, confirmed-only measurement baseline, one read-only RPC and no mutation"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
