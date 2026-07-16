from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "consultation-v2.html"
MODULE = ROOT / "assets/js/nav-v2/consultation-v2.js"
MODEL = ROOT / "assets/js/nav-v2/consultation-intake-model-v2.js"
STYLE = ROOT / "assets/css/nav-v2-consultation.css"
FIXTURES = ROOT / "fixtures/nav-v2-consultation-intake-scenarios.json"
SEMANTIC = ROOT / "scripts/check-nav-v2-consultation-intake.mjs"
DOC = ROOT / "docs/NAV_V2_FAST_CONSULTATION_INTAKE_2026-07-16.md"
MENU = ROOT / "assets/js/nav-v2/role-menu-v2.js"
ROLE_CONTRACT = ROOT / "config/nav-v2-role-contract.json"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-consultation-intake.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, MODULE, MODEL, STYLE, FIXTURES, SEMANTIC, DOC, MENU, ROLE_CONTRACT, BUDGET, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        "assets/css/nav-v2-consultation.css?v=20260716-01",
        "assets/js/nav-v2/consultation-v2.js?v=20260716-01",
        "assets/js/nav-v2/expired-session-helper-v2.js?v=20260623-1635",
        "assets/js/nav-v2/role-menu-v2.js?v=20260716-01",
    ), PAGE.name, errors)
    if page.count('<script type="module"') != 3:
        errors.append("consultation-v2.html must load exactly three entry modules")

    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    if (budget.get("pages") or {}).get(PAGE.name) != {"max_modules": 3}:
        errors.append("consultation-v2.html must have a three-module budget")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "CONSULTATION_REPRESENTATIONS",
        "CONSULTATION_STAGES",
        "CONSULTATION_OBJECT_TYPES",
        "CONSULTATION_PAYMENTS",
        "CONSULTATION_FLAGS",
        "export function validateConsultationIntake",
        "export function routeConsultationIntake",
        "export function consultationCompleteness",
        "export function buildConsultationHandoff",
        "export function buildWizardDraftFromConsultation",
        "export function consultationResponseOptions",
        "MORTGAGE_PAYMENTS = new Set(['mortgage', 'militaryMortgage'])",
        "LEGAL_FUNDING = new Set(['matcap', 'certificate', 'nominalChild', 'svoChildAccount'])",
        "no_auto_backlog_before_route_confirmation",
        "primaryRole: 'lawyer'",
        "не автоматическое юридическое заключение",
        "Полный список документов и задач создаётся только после подтверждения маршрута",
        "consultationSource: true",
    ), MODEL.name, errors)
    for forbidden in ("document.", "window.", "localStorage", "sessionStorage", "rpc(", "fetch("):
        if forbidden in model:
            errors.append(f"consultation model must remain pure: {forbidden}")
    for forbidden_key in (
        "sellerName", "sellerPhone", "buyerName", "buyerPhone", "clientName", "clientPhone",
        "seller_name", "seller_phone", "buyer_name", "buyer_phone", "cadastralNumber",
    ):
        if f"{forbidden_key}:" in model:
            errors.append(f"consultation model creates forbidden client field {forbidden_key}")

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'spn', 'lawyer'])",
        "Без полного мастера",
        "Быстрая консультация юриста",
        "Navigator подготовит понятную передачу, но не создаст сделку, документы, риски или задачи",
        "Маткапитал и сертификаты относятся к СПН и юристу",
        "Скопировать передачу",
        "Перенести в полный мастер",
        "localStorage.setItem(DRAFT_KEY, JSON.stringify(result.draft))",
        "В Supabase ничего не сохранено",
        "getMyProfile({ timeout: 10000 })",
        "setupTop('consultation')",
    ), MODULE.name, errors)
    if module.count("localStorage.setItem(DRAFT_KEY") != 1:
        errors.append("consultation UI must write the full-wizard draft at exactly one call site")
    for forbidden in (
        "rpc(",
        ".from('nav_",
        '.from("nav_',
        "nav_v2_save_",
        "nav_v2_add_",
        "nav_v2_update_",
        "sellerName",
        "sellerPhone",
        "buyerName",
        "buyerPhone",
        "clientName",
        "clientPhone",
    ):
        if forbidden in module:
            errors.append(f"consultation UI contains forbidden server/client surface: {forbidden}")

    style = STYLE.read_text(encoding="utf-8")
    require(style, (
        ".consult-layout",
        ".consultation-sticky",
        "body[data-consultation-mode=\"expert\"]",
        "@media (max-width: 680px)",
        "@media (max-width: 420px)",
    ), STYLE.name, errors)

    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    if fixtures.get("status") != "synthetic_only" or fixtures.get("production_applied") is not False:
        errors.append("consultation fixtures must remain synthetic-only")
    if len(fixtures.get("scenarios") or []) != 12:
        errors.append("consultation fixtures must contain 12 scenarios")

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, (
        "fixtures.scenarios.length, 12",
        "matcap.brokerNeeded, false",
        "certificate.brokerNeeded, false",
        "mortgageMatcap.brokerNeeded, true",
        "no_auto_backlog_before_route_confirmation",
        "['answer', 'need_info', 'convert_to_preparation']",
        "consultation intake semantic regression passed",
    ), SEMANTIC.name, errors)

    menu = MENU.read_text(encoding="utf-8")
    require(menu, (
        "path.includes('consultation-v2')",
        "makeLink(active, 'consultation', './consultation-v2.html', 'Быстрая консультация')",
        "makeLink(active, 'consultation', './consultation-v2.html', 'Шаблон консультации')",
    ), MENU.name, errors)

    role_contract = json.loads(ROLE_CONTRACT.read_text(encoding="utf-8"))
    for role in ("owner_admin", "manager", "spn", "lawyer"):
        if "consultation-v2.html" not in role_contract["roles"][role]["menu_routes"]:
            errors.append(f"role contract does not expose consultation to {role}")
    for role in ("broker", "viewer"):
        if "consultation-v2.html" in role_contract["roles"][role]["menu_routes"]:
            errors.append(f"role contract must not expose consultation to {role}")

    doc = DOC.read_text(encoding="utf-8")
    require(doc, (
        "Быстрый consultation intake",
        "consultation-v2.html",
        "ФИО продавцов и покупателей",
        "Автоматический маршрут не является юридическим заключением",
        "answer",
        "need_info",
        "convert_to_preparation",
        "Маткапитал и сертификаты без ипотеки не направляются брокеру",
        "не создаёт консультацию в базе",
        "Production gate",
        "Rollback",
    ), DOC.name, errors)

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "python3 scripts/check_nav_v2_consultation_intake.py",
        "node scripts/check-nav-v2-consultation-intake.mjs",
        "node --check assets/js/nav-v2/consultation-intake-model-v2.js",
        "node --check assets/js/nav-v2/consultation-v2.js",
        "nav-v2-consultation-intake",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 consultation intake errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 consultation intake passed: one-screen preview, safe handoff, broker boundary, no backlog and no mutation RPC")
    return 0


if __name__ == "__main__":
    sys.exit(main())
