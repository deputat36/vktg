from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "operational-pilot-responsible-acknowledgement-v2.html"
UI = ROOT / "assets/js/nav-v2/operational-pilot-responsible-acknowledgement-v2.js"
MODEL = ROOT / "assets/js/nav-v2/operational-pilot-responsible-acknowledgement-model-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-operational-pilot-responsible-acknowledgement.mjs"
SOURCE_PAGE = ROOT / "operational-pilot-start-confirmation-v2.html"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"
DEDICATED_WORKFLOW = ROOT / ".github/workflows/nav-v2-operational-pilot-responsible-acknowledgement.yml"
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
        "assets/js/nav-v2/operational-pilot-responsible-acknowledgement-v2.js?v=20260714-01",
        "assets/js/nav-v2/role-menu-v2.js?v=20260713-01",
        "assets/js/nav-v2/nav-base-menu-cleanup-v2.js?v=20260707-1210",
    ), PAGE.name, errors)

    ui = UI.read_text(encoding="utf-8")
    require(ui, (
        "validateOwnerStartConfirmation",
        "createResponsibleAcknowledgementState",
        "summarizeResponsibleAcknowledgement",
        "buildResponsibleAcknowledgementPackage",
        "MAX_FILE_BYTES = 2 * 1024 * 1024",
        "['owner', 'admin'].includes(profile().role)",
        "navigator_v2_operational_pilot_owner_start_confirmation",
        "navigator-v2-operational-pilot-responsible-acknowledgement-",
        "rpc('nav_v2_get_operational_adoption_report'",
        "URL.createObjectURL",
        "не является authenticated self-acknowledgement",
    ), UI.name, errors)
    if ui.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("pilot responsible acknowledgement UI must use exactly one adoption report RPC call")
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
            errors.append(f"pilot responsible acknowledgement UI must remain browser-local and read-only: {forbidden}")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function validateOwnerStartConfirmation",
        "export function acknowledgementChannelOptions",
        "export function createResponsibleAcknowledgementState",
        "export function updateResponsibleAcknowledgementState",
        "export function summarizeResponsibleAcknowledgement",
        "export function buildResponsibleAcknowledgementPackage",
        "navigator_v2_operational_pilot_owner_start_confirmation_validation",
        "navigator_v2_operational_pilot_responsible_acknowledgement_evidence",
        "authorized_ready_for_acknowledgement",
        "acknowledgement_package_ready",
        "authenticated_self_acknowledgements: 0",
        "server_mutation_available: false",
        "automatic_execution_available: false",
        "acknowledgement_is_authenticated_self_action: false",
        "execution_authorized: false",
        "pilot_started: false",
        "requires_authenticated_responsible_confirmation_or_explicit_owner_exception: true",
        "requires_execution_receipt: true",
        "requires_result_evidence: true",
    ), MODEL.name, errors)
    for forbidden in ("rpc(", ".from(", "fetch(", "localStorage", "sessionStorage"):
        if forbidden in model:
            errors.append(f"pilot responsible acknowledgement model must remain pure and offline: {forbidden}")

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, (
        "acknowledgement_package_ready, true",
        "execution_authorized, false",
        "identityMismatchState",
        "futureState",
        "expiredValidation",
        "staleValidation",
        "tamperedValidation",
        "duplicateValidation",
        "rejectedValidation",
        "semantic regression passed",
    ), SEMANTIC.name, errors)

    source_page = SOURCE_PAGE.read_text(encoding="utf-8")
    if "operational-pilot-responsible-acknowledgement-v2.html" not in source_page:
        errors.append("owner start confirmation page must link to responsible acknowledgement evidence")

    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    if (budget.get("pages") or {}).get(PAGE.name) != {"max_modules": 3}:
        errors.append("pilot responsible acknowledgement page must have a three-module budget")

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    dedicated_workflow = DEDICATED_WORKFLOW.read_text(encoding="utf-8")
    python_command = "python3 scripts/check_nav_v2_operational_pilot_responsible_acknowledgement.py"
    node_command = "node scripts/check-nav-v2-operational-pilot-responsible-acknowledgement.mjs"
    for workflow, label in ((static_workflow, STATIC_WORKFLOW.name), (dedicated_workflow, DEDICATED_WORKFLOW.name)):
        if python_command not in workflow:
            errors.append(f"{label}: missing pilot responsible acknowledgement static regression")
        if node_command not in workflow:
            errors.append(f"{label}: missing pilot responsible acknowledgement semantic regression")

    public_smoke = PUBLIC_SMOKE.read_text(encoding="utf-8")
    if "'/operational-pilot-responsible-acknowledgement-v2.html'" not in public_smoke:
        errors.append("public smoke must include operational-pilot-responsible-acknowledgement-v2.html guest gate")

    if errors:
        print("Navigator v2 operational pilot responsible acknowledgement errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 operational pilot responsible acknowledgement passed: owner-start import, fresh comparison, "
        "external evidence capture, identity/time checks, explicit non-self-acknowledgement boundary, one read-only RPC and no mutation"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
