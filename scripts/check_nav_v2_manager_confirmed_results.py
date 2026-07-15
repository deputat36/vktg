#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

manager = (ROOT / "assets/js/nav-v2/manager-v2.js").read_text(encoding="utf-8")
model = (ROOT / "assets/js/nav-v2/manager-confirmed-results-model-v2.js").read_text(encoding="utf-8")
html = (ROOT / "manager-v2.html").read_text(encoding="utf-8")
css = (ROOT / "assets/css/nav-v2-manager.css").read_text(encoding="utf-8")
semantic = (ROOT / "scripts/check-nav-v2-manager-confirmed-results.mjs").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/nav-v2-manager-confirmed-results.yml").read_text(encoding="utf-8")

required_manager_markers = [
    "manager-confirmed-results-model-v2.js?v=20260715-01",
    "managerResultCandidate(item, { now, maxAgeDays: 7 })",
    "rpc('nav_v2_get_deal_card', { p_deal_id: item.deal_id }, 20000)",
    "COMPLETION_CONCURRENCY = 4",
    "COMPLETION_LOAD_LIMIT = 40",
    "Подтверждённые результаты",
    "data-confirmed-filter",
    "Серверное подтверждение",
    "Следующий ответственный шаг",
    "Открыть следующий шаг",
]
for marker in required_manager_markers:
    assert marker in manager, f"manager-v2.js marker missing: {marker}"

assert "nav_v2_update_" not in manager, "Manager result control must remain read-only"
assert manager.count("nav_v2_get_operational_readiness_preview") == 1
assert manager.count("nav_v2_get_deal_card") == 1
assert ".filter((item) => managerResultCandidate" in manager
assert ".slice(0, COMPLETION_LOAD_LIMIT)" in manager

required_model_markers = [
    "buildDealCompletionEvidence",
    "DEFAULT_MAX_AGE_DAYS = 7",
    "DEFAULT_TIME_ZONE = 'Europe/Moscow'",
    "window: completedDay && completedDay === today ? 'today' : 'recent'",
    "nextHref",
    "actorKnown",
    "serverEventType",
    "summarizeManagerConfirmedResults",
]
for marker in required_model_markers:
    assert marker in model, f"confirmed results model marker missing: {marker}"

assert "nav-v2-manager.css?v=20260715-01" in html
assert "manager-v2.js?v=20260715-01" in html
for marker in [
    ".manager-confirmed-results",
    ".manager-confirmed-card",
    ".manager-confirmed-meta",
    ".manager-confirmed-next",
    ".manager-confirmed-actions .btn",
]:
    assert marker in css, f"manager CSS marker missing: {marker}"

for marker in [
    "Previous Moscow calendar day must not be shown as today",
    "Assignment-only/no-op event must not masquerade as completed work",
    "sevenDays: 2",
]:
    assert marker in semantic, f"semantic regression marker missing: {marker}"

for marker in [
    "python3 scripts/check_nav_v2_manager_confirmed_results.py",
    "node scripts/check-nav-v2-manager-confirmed-results.mjs",
    "node scripts/check-nav-v2-manager-action-routes.mjs",
    "python3 scripts/check_nav_v2_operational_readiness.py",
    "node --check assets/js/nav-v2/manager-confirmed-results-model-v2.js",
]:
    assert marker in workflow, f"workflow marker missing: {marker}"

print("Navigator v2 manager confirmed results static contract passed")
