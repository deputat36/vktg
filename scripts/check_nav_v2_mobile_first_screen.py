from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []

pages = {
    "dashboard-v2.html": "dashboard-v2.js?v=20260715-01",
    "deals-v2.html": "deals-v2.js?v=20260715-01",
    "deal-card-v2.html": "deal-card-v2.js?v=20260715-02",
    "manager-v2.html": "manager-v2.js?v=20260715-02",
}
for page, module_marker in pages.items():
    source = (ROOT / page).read_text(encoding="utf-8")
    for marker in ["nav-v2-mobile-first-screen.css?v=20260715-01", module_marker]:
        if marker not in source:
            errors.append(f"{page} missing marker: {marker}")

model = (ROOT / "assets/js/nav-v2/mobile-first-screen-model-v2.js").read_text(encoding="utf-8")
required_model = [
    "export function mobileFirstScreenPolicy",
    "export function buildMobileFirstScreenPlan",
    "dashboard:",
    "deals:",
    "'deal-card':",
    "manager:",
    "maxVisibleActions: 2",
    "maxVisibleActions: 3",
]
for marker in required_model:
    if marker not in model:
        errors.append(f"mobile-first-screen model missing marker: {marker}")
for forbidden in ["rpc(", "localStorage", "sessionStorage", "nav_v2_update_", "nav_v2_save_"]:
    if forbidden in model:
        errors.append(f"mobile-first-screen model must remain pure/read-only: {forbidden}")

disclosure = (ROOT / "assets/js/nav-v2/mobile-first-screen-v2.js").read_text(encoding="utf-8")
for marker in [
    "export function applyMobileFirstScreenDisclosure",
    "window.matchMedia('(max-width: 430px)')",
    "details.open = !compact",
    "addEventListener('change'",
]:
    if marker not in disclosure:
        errors.append(f"mobile first-screen disclosure hook missing marker: {marker}")
for forbidden in ["MutationObserver", "rpc(", "localStorage", "sessionStorage"]:
    if forbidden in disclosure:
        errors.append(f"mobile disclosure hook must stay DOM-only and read-only: {forbidden}")

sources = {
    "dashboard": (ROOT / "assets/js/nav-v2/dashboard-v2.js").read_text(encoding="utf-8"),
    "deals": (ROOT / "assets/js/nav-v2/deals-v2.js").read_text(encoding="utf-8"),
    "deal-card": (ROOT / "assets/js/nav-v2/deal-card-v2.js").read_text(encoding="utf-8"),
    "manager": (ROOT / "assets/js/nav-v2/manager-v2.js").read_text(encoding="utf-8"),
}
required_sources = {
    "dashboard": ["buildMobileFirstScreenPlan('dashboard'", "mobile-first-screen-dashboard", "role-home-priority-more"],
    "deals": ["buildMobileFirstScreenPlan('deals'", "mobile-first-screen-deals", "deals-quick-modes-panel", "deals-more"],
    "deal-card": ["mobile-first-screen-card", "deal-card-recheck-alert-v2.js?v=20260715-02"],
    "manager": ["buildMobileFirstScreenPlan('manager'", "mobile-first-screen-manager", "manager-filter-panel", "manager-more-decisions"],
}
for name, markers in required_sources.items():
    for marker in markers:
        if marker not in sources[name]:
            errors.append(f"{name} first-screen source missing marker: {marker}")

action_focus = (ROOT / "assets/js/nav-v2/deal-card-action-focus-v2.js").read_text(encoding="utf-8")
completion = (ROOT / "assets/js/nav-v2/deal-card-completion-evidence-v2.js").read_text(encoding="utf-8")
rework = (ROOT / "assets/js/nav-v2/deal-card-spn-rework-v2.js").read_text(encoding="utf-8")
for source, markers in [
    (action_focus, ["buildMobileFirstScreenPlan('deal-card'", "deal-action-focus-details", "mobile-first-screen-primary-action"]),
    (completion, ["deal-completion-meta-details", "mobile-first-screen-primary-action"]),
    (rework, ["spn-rework-remarks", "mobile-first-screen-primary-action"]),
]:
    for marker in markers:
        if marker not in source:
            errors.append(f"deal-card mobile lifecycle missing marker: {marker}")

css = (ROOT / "assets/css/nav-v2-mobile-first-screen.css").read_text(encoding="utf-8")
for marker in [
    "@media (max-width: 430px)",
    ".mobile-first-screen-primary-action",
    ".mobile-first-screen-more:not([open])",
    ".mobile-first-screen-details:not([open])",
    ".mobile-first-screen-dashboard > .role-home-focus { order: 1; }",
    ".mobile-first-screen-deals > .deals-workspace { order: 1; }",
    ".mobile-first-screen-manager > .manager-queue { order: 1;",
    ".mobile-first-screen-card > #dealActionFocus { order: 1; }",
    "@media (min-width: 431px)",
    "display: contents",
]:
    if marker not in css:
        errors.append(f"mobile first-screen CSS missing marker: {marker}")

public_smoke = (ROOT / "tests/e2e/public-smoke.spec.js").read_text(encoding="utf-8")
for marker in [
    "mobile operational first screen keeps the primary action before secondary data",
    "viewportWidth <= 430",
    "mobile-first-screen-primary-action",
    "toBeLessThan",
    "applyMobileFirstScreenDisclosure(document)",
]:
    if marker not in public_smoke:
        errors.append(f"public mobile regression missing marker: {marker}")

if errors:
    print("Navigator v2 mobile first-screen errors:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("Navigator v2 mobile first-screen static checks passed")
