from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "consultation-v2.html"
MODEL = ROOT / "assets/js/nav-v2/consultation-intake-model-v2.js"
UI = ROOT / "assets/js/nav-v2/consultation-v2.js"
STYLE = ROOT / "assets/css/nav-v2-consultation.css"
FIXTURES = ROOT / "fixtures/nav-v2-consultation-intake-scenarios.json"
SEMANTIC = ROOT / "scripts/check-nav-v2-consultation-intake.mjs"
DOC = ROOT / "docs/NAV_V2_FAST_CONSULTATION_INTAKE_2026-07-16.md"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-consultation-intake.yml"
ROLE_MENU = ROOT / "assets/js/nav-v2/role-menu-v2.js"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (PAGE, MODEL, UI, STYLE, FIXTURES, SEMANTIC, DOC, BUDGET, WORKFLOW, ROLE_MENU)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    model = MODEL.read_text(encoding="utf-8")
    ui = UI.read_text(encoding="utf-8")
    style = STYLE.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    role_menu = ROLE_MENU.read_text(encoding="utf-8")
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    budget = json.loads(BUDGET.read_text(encoding="utf-8"))

    require(page, (
        "Быстрая консультация юриста",
        "Repository-only preview",
        "assets/css/nav-v2-consultation.css?v=20260716-02",
        "assets/js/nav-v2/consultation-v2.js?v=20260716-02",
        "Сделка, задачи, документы и риски автоматически не создаются",
    ), PAGE.name, errors)

    if (budget.get("pages") or {}).get(PAGE.name) != {"max_modules": 1}:
        errors.append("consultation-v2.html must have a one-module budget")

    require(model, (
        "CONSULTATION_ALLOWED_ROLES",
        "'owner', 'admin', 'manager', 'spn', 'lawyer'",
        "consultationPrivacyFindings",
        "consultationRouting",
        "buildConsultationHandoff",
        "consultationToWizardDraft",
        "broker_needed: mortgage",
        "СПН и юрист ведут маткапитал/сертификат",
        "Это предварительная маршрутизация, а не юридическое заключение",
        "unit_level_address",
        "cadastral_number",
        "possible_full_name",
    ), MODEL.name, errors)
    for forbidden in ("document.", "window.", "localStorage", "sessionStorage", "rpc(", "fetch(", ".from("):
        if forbidden in model:
            errors.append(f"consultation model must remain pure: {forbidden}")

    require(ui, (
        "getMyProfile",
        "consultationRoleAllowed",
        "Сформировать передачу",
        "Скопировать текст",
        "Перенести в полный мастер",
        "WIZARD_DRAFT_KEY = 'nav_deal_draft_v2'",
        "const merged = { ...result.draft, ...existing }",
        "ничего не создаёт в Supabase",
    ), UI.name, errors)
    for forbidden in ("rpc(", "fetch(", ".from('nav_", '.from("nav_', "nav_v2_add_", "nav_v2_save_", "nav_v2_update_"):
        if forbidden in ui:
            errors.append(f"consultation preview must not call server mutation/data surfaces: {forbidden}")

    if "consultation-v2.html" in role_menu:
        errors.append("repository-only consultation preview must not be placed in the production role menu")

    require(style, (
        ".consultation-grid",
        ".consultation-output",
        "@media(max-width:640px)",
    ), STYLE.name, errors)

    if fixtures.get("synthetic_only") is not True:
        errors.append("consultation fixtures must remain synthetic-only")
    cases = fixtures.get("cases") or []
    if len(cases) < 12:
        errors.append("consultation scenario matrix must contain at least 12 cases")
    case_ids = {case.get("id") for case in cases}
    for required in (
        "matcap_without_mortgage",
        "certificate_without_mortgage",
        "mortgage_consultation",
        "mortgage_and_matcap",
        "phone_rejected",
        "unit_number_rejected",
        "cadastral_rejected",
    ):
        if required not in case_ids:
            errors.append(f"missing required consultation scenario {required}")

    require(doc, (
        "repository-only preview",
        "не сохраняет консультацию в Supabase",
        "маткапитал",
        "сертификат",
        "ипотечный брокер",
        "answer",
        "need_info",
        "convert_to_preparation",
        "Rollback",
    ), DOC.name, errors)

    require(workflow, (
        "python3 scripts/check_nav_v2_consultation_intake.py",
        "node scripts/check-nav-v2-consultation-intake.mjs",
        "node --check assets/js/nav-v2/consultation-intake-model-v2.js",
        "node --check assets/js/nav-v2/consultation-v2.js",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 consultation intake errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 consultation intake passed: privacy, role boundary, broker scope, synthetic scenarios and no server mutation")
    return 0


if __name__ == "__main__":
    sys.exit(main())
