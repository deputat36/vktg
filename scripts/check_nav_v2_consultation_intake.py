from __future__ import annotations
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATHS = {
    "page": ROOT / "consultation-v2.html",
    "module": ROOT / "assets/js/nav-v2/consultation-v2.js",
    "model": ROOT / "assets/js/nav-v2/consultation-intake-model-v2.js",
    "style": ROOT / "assets/css/nav-v2-consultation.css",
    "fixtures": ROOT / "fixtures/nav-v2-consultation-intake-scenarios.json",
    "semantic": ROOT / "scripts/check-nav-v2-consultation-intake.mjs",
    "doc": ROOT / "docs/NAV_V2_FAST_CONSULTATION_INTAKE_2026-07-16.md",
    "budget": ROOT / "config/nav-v2-module-budget.json",
    "workflow": ROOT / ".github/workflows/nav-v2-consultation-intake.yml",
}

def require(text, markers, label, errors):
    for marker in markers:
        if marker not in text: errors.append(f"{label}: missing {marker!r}")

def main():
    errors=[]
    for name,path in PATHS.items():
        if not path.exists(): errors.append(f"missing {path.relative_to(ROOT)}")
    if errors: print("\n".join(errors)); return 1
    page=PATHS["page"].read_text(); module=PATHS["module"].read_text(); model=PATHS["model"].read_text(); style=PATHS["style"].read_text(); doc=PATHS["doc"].read_text()
    require(page,("Content-Security-Policy","nav-v2-consultation.css?v=20260716-02","consultation-v2.js?v=20260716-02","expired-session-helper-v2.js?v=20260623-1635"),"page",errors)
    if page.count('<script type="module"') != 2: errors.append("page must load exactly two entry modules")
    budget=json.loads(PATHS["budget"].read_text())
    if budget.get("pages",{}).get("consultation-v2.html") != {"max_modules":2}: errors.append("module budget must be 2")
    require(model,("export function validateConsultation","export function routeConsultation","export function buildHandoff","export function buildWizardDraft","MORTGAGE = new Set(['mortgage', 'militaryMortgage'])","LEGAL_FUNDING = new Set(['matcap', 'certificate', 'nominalChild', 'svoChildAccount'])","primaryRole: 'lawyer'","no_auto_backlog_before_route_confirmation","не автоматическое юридическое заключение"),"model",errors)
    for marker in ("document.","window.","localStorage","sessionStorage","rpc(","fetch("):
        if marker in model: errors.append(f"model must remain pure: {marker}")
    for key in ("sellerName:","sellerPhone:","buyerName:","buyerPhone:","clientName:","clientPhone:"):
        if key in model: errors.append(f"model creates forbidden key: {key}")
    require(module,("ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'spn', 'lawyer'])","PREVIEW · без сохранения","не создаст сделку, документы, риски или задачи","Маткапитал и сертификаты — контур СПН и юриста","localStorage.setItem(DRAFT_KEY, JSON.stringify(result.draft))","В Supabase ничего не сохранено","setupTop('consultation')"),"module",errors)
    if module.count("localStorage.setItem(DRAFT_KEY") != 1: errors.append("draft write must have one call site")
    for marker in ("rpc(",".from('nav_",'.from("nav_',"nav_v2_save_","nav_v2_add_","nav_v2_update_","sellerName","sellerPhone","buyerName","buyerPhone"):
        if marker in module: errors.append(f"UI contains forbidden surface: {marker}")
    require(style,(".consult-layout",".consultation-sticky","data-consultation-mode=\"expert\"","@media(max-width:680px)","@media(max-width:420px)"),"style",errors)
    fixtures=json.loads(PATHS["fixtures"].read_text())
    if fixtures.get("status")!="synthetic_only" or fixtures.get("production_applied") is not False or len(fixtures.get("scenarios",[]))!=10: errors.append("fixture contract drifted")
    require(PATHS["semantic"].read_text(),("fixtures.scenarios.length, 10","matcap'] }).brokerNeeded, false","certificate'] }).brokerNeeded, false","['answer', 'need_info', 'convert_to_preparation']","semantic regression passed"),"semantic",errors)
    require(doc,("Быстрый consultation intake","по прямой ссылке","ФИО продавцов и покупателей","Автоматический маршрут не является юридическим заключением","Маткапитал и сертификаты без ипотеки не направляются брокеру","не создаёт консультацию в базе","Production gate","Rollback"),"doc",errors)
    workflow=PATHS["workflow"].read_text()
    require(workflow,("python3 scripts/check_nav_v2_consultation_intake.py","node scripts/check-nav-v2-consultation-intake.mjs","node --check assets/js/nav-v2/consultation-intake-model-v2.js","node --check assets/js/nav-v2/consultation-v2.js","nav-v2-consultation-intake"),"workflow",errors)
    if errors:
        print("Navigator v2 consultation intake errors:")
        for error in errors: print(f"- {error}")
        return 1
    print("Navigator v2 consultation intake passed: direct preview, safe handoff, broker boundary and no mutation RPC")
    return 0

if __name__ == "__main__": sys.exit(main())
