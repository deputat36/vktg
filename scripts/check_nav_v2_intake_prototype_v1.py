from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "spn-intake-prototype-v2.html"
CSS = ROOT / "assets/css/nav-v2-intake-prototype.css"
JS = ROOT / "assets/js/nav-v2/spn-intake-prototype-v1.js"
CONTRACT = ROOT / "assets/js/nav-v2/spn-intake-contract-v1.js"
CATALOG = ROOT / "config/nav-v2-intake-contract-v1.json"
E2E = ROOT / "tests/e2e/intake-prototype.spec.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-intake-prototype-v1.yml"
MODULE_BUDGET = ROOT / "config/nav-v2-module-budget.json"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    files = (HTML, CSS, JS, CONTRACT, CATALOG, E2E, WORKFLOW, MODULE_BUDGET)
    for path in files:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    html = HTML.read_text(encoding="utf-8")
    require(html, (
        "connect-src 'self'",
        "form-action 'self'",
        "nav-v2-intake-prototype.css",
        "spn-intake-prototype-v1.js",
        "noindex,nofollow",
    ), HTML.name, errors)
    for forbidden in ("supabase-v2.js", "role-menu-v2.js", "nav_v2_save_wizard_result"):
        if forbidden in html:
            errors.append(f"{HTML.name}: detached page must not load {forbidden}")

    js = JS.read_text(encoding="utf-8")
    require(js, (
        "buildIntakeAssessment",
        "activeFactQuestions",
        "matchedIntakeRules",
        "nav_v2_intake_prototype_v1",
        "['yes', 'Да']",
        "['no', 'Нет']",
        "['unknown', 'Не знаю']",
        "['not_applicable', 'Не относится']",
        "['document', 'Подтверждено документом']",
        "['client', 'Со слов клиента']",
        "['unchecked', 'Пока не проверено']",
        "data-confirm-lawyer",
        "data-final-action=\"lawyer\"",
        "method: 'GET'",
        "localStorage.setItem",
        "localStorage.getItem",
        "function deferredRender",
        "blur-driven change event",
    ), JS.name, errors)
    for forbidden in (
        "createClient(", "rpc(", ".from(", "method: 'POST'", "method: 'PATCH'",
        "method: 'DELETE'", "service_role", "nav_v2_save_wizard_result",
    ):
        if forbidden in js:
            errors.append(f"{JS.name}: detached prototype contains forbidden runtime marker {forbidden!r}")
    if js.count("['Что происходит', 'Основа черновика']") != 1:
        errors.append("prototype must expose exactly one three-stage navigation definition")

    css = CSS.read_text(encoding="utf-8")
    require(css, ("@media(max-width:430px)", ".intake-action-bar{position:sticky", ".fact-options"), CSS.name, errors)

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    if [step.get("id") for step in catalog.get("steps", [])] != ["situation", "facts", "review"]:
        errors.append("prototype catalog must retain exactly three stages")
    broker_rules = {rule.get("id") for rule in catalog.get("rules", []) if rule.get("owner") == "broker"}
    if broker_rules != {"mortgage", "military_mortgage"}:
        errors.append(f"prototype broker scope changed: {sorted(broker_rules)}")

    e2e = E2E.read_text(encoding="utf-8")
    require(e2e, (
        "mutationRequests",
        "['POST', 'PUT', 'PATCH', 'DELETE']",
        "page.reload()",
        "scrollWidth",
        "guardianship_permission",
        "Документы по сопровождаемой стороне",
        "Конкретные задачи",
        "assessment.work_plan.accompanied_sides",
        "assessment.work_plan.ready_tasks",
        "handoff_lawyer.state",
        "prototype-restored",
    ), E2E.name, errors)

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "python3 scripts/check_nav_v2_intake_prototype_v1.py",
        "python3 scripts/check_nav_v2_intake_work_plan_v1.py",
        "node scripts/check-nav-v2-intake-work-plan-v1.mjs",
        "node --check assets/js/nav-v2/spn-intake-work-plan-v1.js",
        "node --check assets/js/nav-v2/spn-intake-prototype-v1.js",
        "tests/e2e/intake-prototype.spec.js",
        "--project=chromium-desktop --project=chromium-mobile",
    ), WORKFLOW.name, errors)

    budget = json.loads(MODULE_BUDGET.read_text(encoding="utf-8"))
    if budget.get("pages", {}).get(HTML.name, {}).get("max_modules") != 1:
        errors.append(f"{MODULE_BUDGET.name}: {HTML.name} must have one-module budget")

    if errors:
        print("Navigator v2 intake prototype errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 intake prototype passed: detached three-stage presentation, local recovery, "
        "four-state facts, evidence sources, legal handoff confirmation, mortgage-only broker and zero mutations"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
