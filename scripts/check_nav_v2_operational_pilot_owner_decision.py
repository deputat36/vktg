from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "operational-pilot-decision-v2.html"
REPORT_PAGE = ROOT / "operational-adoption-v2.html"
UI = ROOT / "assets/js/nav-v2/operational-pilot-decision-v2.js"
MODEL = ROOT / "assets/js/nav-v2/operational-adoption-pilot-decision-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-operational-pilot-owner-decision.mjs"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"
DEDICATED_WORKFLOW = ROOT / ".github/workflows/nav-v2-operational-pilot-owner-decision.yml"
PUBLIC_SMOKE = ROOT / "tests/e2e/public-smoke.spec.js"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, REPORT_PAGE, UI, MODEL, SEMANTIC, BUDGET, STATIC_WORKFLOW, DEDICATED_WORKFLOW, PUBLIC_SMOKE):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        'aria-live="polite"',
        "assets/js/nav-v2/operational-pilot-decision-v2.js?v=20260714-01",
        "assets/js/nav-v2/role-menu-v2.js?v=20260713-01",
        "assets/js/nav-v2/nav-base-menu-cleanup-v2.js?v=20260707-1210",
    ), PAGE.name, errors)

    report_page = REPORT_PAGE.read_text(encoding="utf-8")
    require(report_page, (
        "operational-pilot-decision-v2.html",
        "Решение владельца по пилоту",
        "assets/js/nav-v2/operational-adoption-v2.js?v=20260714-01",
    ), REPORT_PAGE.name, errors)

    ui = UI.read_text(encoding="utf-8")
    require(ui, (
        "buildPilotDecisionPackage",
        "createPilotDecisionState",
        "summarizePilotDecisions",
        "updatePilotDecision",
        "['owner', 'admin'].includes(profile().role)",
        "Лист решения по пилоту доступен только владельцу и администратору.",
        "Решение владельца",
        "Пакет решения владельца",
        "decision_package_ready=false",
        "pilot_started=false",
        "pilot_start_authorized=false",
        "requires fresh read-only",
        "rpc('nav_v2_get_operational_adoption_report'",
        "URL.createObjectURL",
        "navigator-v2-operational-pilot-owner-decision-",
    ), UI.name, errors)
    if ui.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("pilot owner decision UI must use exactly one adoption report RPC call")
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
            errors.append(f"pilot owner decision UI must remain browser-local and read-only: {forbidden}")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function createPilotDecisionState",
        "export function reconcilePilotDecisionState",
        "export function updatePilotDecision",
        "export function summarizePilotDecisions",
        "export function buildPilotDecisionPackage",
        "navigator_v2_operational_pilot_owner_decision",
        "decision_package_ready",
        "browser_local_only: true",
        "server_mutation_available: false",
        "automatic_selection_available: false",
        "pilot_started: false",
        "pilot_start_authorized: false",
        "requires_manual_pilot_start: true",
        "requires_fresh_readonly_revalidation: true",
        "requires_separate_measurement_baseline: true",
    ), MODEL.name, errors)
    for forbidden in ("rpc(", ".from(", "fetch(", "localStorage", "sessionStorage"):
        if forbidden in model:
            errors.append(f"pilot decision model must remain pure and offline: {forbidden}")

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, (
        "decision_package_ready, true",
        "pilot_start_authorized, false",
        "requires_separate_measurement_baseline, true",
        "role: 'manager'",
        "decision_status, 'pending'",
        "semantic regression passed",
    ), SEMANTIC.name, errors)

    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    page_budget = (budget.get("pages") or {}).get(PAGE.name)
    if page_budget != {"max_modules": 3}:
        errors.append("pilot owner decision page must have a three-module budget")

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    dedicated_workflow = DEDICATED_WORKFLOW.read_text(encoding="utf-8")
    python_command = "python3 scripts/check_nav_v2_operational_pilot_owner_decision.py"
    node_command = "node scripts/check-nav-v2-operational-pilot-owner-decision.mjs"
    for workflow, label in ((static_workflow, STATIC_WORKFLOW.name), (dedicated_workflow, DEDICATED_WORKFLOW.name)):
        if python_command not in workflow:
            errors.append(f"{label}: missing pilot owner decision static regression")
        if node_command not in workflow:
            errors.append(f"{label}: missing pilot owner decision semantic regression")

    public_smoke = PUBLIC_SMOKE.read_text(encoding="utf-8")
    if "'/operational-pilot-decision-v2.html'" not in public_smoke:
        errors.append("public smoke must include operational-pilot-decision-v2.html guest gate")

    if errors:
        print("Navigator v2 operational pilot owner decision errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 operational pilot owner decision passed: owner/admin-only browser-local decisions, "
        "exact shortlist snapshot, exportable safety package, one read-only RPC and no mutation"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
