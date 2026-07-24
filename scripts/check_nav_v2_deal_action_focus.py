from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "deal-card-v2.html"
LIFECYCLE = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-action-focus-v2.js"
MODEL = ROOT / "assets/js/nav-v2/deal-card-action-focus-model-v2.js"
CSS = ROOT / "assets/css/nav-v2-deal-action-focus.css"
SEMANTIC = ROOT / "scripts/check-nav-v2-deal-action-focus.mjs"
BROWSER = ROOT / "tests/e2e/actionable-task-route.spec.js"
CONTRACT = ROOT / "config/nav-v2-actionable-task-route-v1.json"
DOC = ROOT / "docs/NAV_V2_ACTIONABLE_TASK_ROUTE_V1_2026-07-24.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-deal-action-focus.yml"


def require(source: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in source:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (PAGE, LIFECYCLE, HOOK, MODEL, CSS, SEMANTIC, BROWSER, CONTRACT, DOC, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f"missing deal action-focus file: {path.relative_to(ROOT)}")

    if errors:
        print("Navigator v2 deal action-focus errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    page = PAGE.read_text(encoding="utf-8")
    lifecycle = LIFECYCLE.read_text(encoding="utf-8")
    hook = HOOK.read_text(encoding="utf-8")
    model = MODEL.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    semantic = SEMANTIC.read_text(encoding="utf-8")
    browser = BROWSER.read_text(encoding="utf-8")
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    require(page, (
        "nav-v2-deal-action-focus.css?v=20260714-01",
        "deal-card-recheck-alert-v2.js?v=20260715-15",
        '"./deal-card-action-focus-v2.js?v=20260715-01": "./assets/js/nav-v2/deal-card-action-focus-v2.js?v=20260724-03"',
        '"./deal-card-action-focus-model-v2.js?v=20260714-01": "./assets/js/nav-v2/deal-card-action-focus-model-v2.js?v=20260724-03"',
    ), PAGE.name, errors)

    require(lifecycle, (
        "import { applyDealCardActionFocus } from './deal-card-action-focus-v2.js?v=20260715-01';",
        "applyDealCardSpnRework(cardData, profileData);",
        "applyDealCardActionFocus(cardData, profileData);",
        "queueMicrotask(applyCardEnhancements);",
    ), LIFECYCLE.name, errors)
    if lifecycle.find("applyDealCardActionFocus(cardData, profileData);") < lifecycle.find("applyDealCardSpnRework(cardData, profileData);"):
        errors.append("deal action focus must run after the SPN rework workflow")

    require(hook, (
        "export function applyDealCardActionFocus(data, profile)",
        "buildDealActionFocus(data, profile || data?.profile || null)",
        'id="dealActionFocus"',
        "Главное действие сейчас",
        "Ответственный",
        "Как понять, что готово",
        "data-action-focus-tab",
        "data-action-focus-task",
        "Начать эту задачу",
        "Продолжить и завершить",
        "задача для контроля",
        "focusTaskTarget",
        'data-task-action-guard="ready"',
        "Режим наблюдения",
    ), HOOK.name, errors)

    for marker in (
        "rpc(",
        "localStorage",
        "sessionStorage",
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        "new MutationObserver",
    ):
        if marker in hook:
            errors.append(f"deal-card-action-focus-v2.js: forbidden RPC/mutation/storage marker {marker!r}")

    require(model, (
        "export function buildDealActionFocus",
        "pickPrimaryTask",
        "isActionableTask",
        "sortOpenTasks",
        "deadlineState",
        "taskResultCriteria",
        "fallbackAction",
        "actionable_for_current_user",
        "control_only",
        "overdueTasks",
        "missingDocuments",
        "readOnly",
    ), MODEL.name, errors)
    for marker in ("document.", "window.", "rpc(", "localStorage", "sessionStorage"):
        if marker in model:
            errors.append(f"deal-card-action-focus-model-v2.js: pure model contains {marker!r}")

    require(semantic, (
        "Actionable task must outrank a more urgent task owned by another role",
        "spnProfile",
        "other-role",
        "my-task",
        "control_only",
    ), SEMANTIC.name, errors)

    require(browser, (
        "main action selects the current user task and routes to its enabled control",
        "task-lawyer-urgent",
        "task-spn-actionable",
        "Начать эту задачу",
        "Начать работу",
        "toBeFocused",
        "nav_v2_update_task_status",
        "p_status: 'in_progress'",
    ), BROWSER.name, errors)

    if contract.get("decision") != "actionable_task_preferred_in_existing_deal_focus_no_new_screen":
        errors.append("actionable task route contract decision drifted")
    diagnosis = contract.get("production_read_only_diagnosis") or {}
    expected_counts = {
        "tasks": 98,
        "open_tasks": 88,
        "in_progress_tasks": 0,
        "done_tasks": 0,
        "task_status_changed_events": 0,
        "spn_deal_profile_pairs_with_open_tasks": 6,
        "spn_pairs_with_actionable_task": 6,
        "spn_pairs_where_previous_primary_belonged_to_other_role": 6,
    }
    for key, value in expected_counts.items():
        if diagnosis.get(key) != value:
            errors.append(f"actionable task route diagnosis: {key} must equal {value}")
    behavior = contract.get("behavior") or {}
    for key in (
        "prefer_server_authorized_open_task",
        "fallback_to_control_task_when_no_actionable_task",
        "route_to_existing_tasks_tab",
        "focus_enabled_task_control",
    ):
        if behavior.get(key) is not True:
            errors.append(f"actionable task route behavior must keep {key}=true")
    if behavior.get("new_task_screen") is not False or behavior.get("client_role_permission_recalculation_added") is not False:
        errors.append("actionable task route must not create a new screen or new client role authorization")
    boundaries = contract.get("boundaries") or {}
    if any(value is not False for value in boundaries.values()):
        errors.append("all actionable task route production boundaries must remain false")

    require(doc, (
        "# Navigator v2 — маршрут к исполнимой задаче",
        "во всех 6 случаях",
        "Начать эту задачу",
        "Продолжить и завершить",
        "существующая вкладка «Задачи»",
        "production Supabase schema/data/Auth/RLS/grants/Edge не меняются",
        "`leader_*` не затрагивается",
    ), DOC.name, errors)

    require(workflow, (
        "tests/e2e/actionable-task-route.spec.js",
        "config/nav-v2-actionable-task-route-v1.json",
        "docs/NAV_V2_ACTIONABLE_TASK_ROUTE_V1_2026-07-24.md",
        "python3 scripts/check_nav_v2_deal_action_focus.py",
        "node scripts/check-nav-v2-deal-action-focus.mjs",
        "npx playwright install --with-deps chromium",
        "actionable-task-route.spec.js",
        "chromium-desktop",
        "chromium-mobile",
    ), WORKFLOW.name, errors)

    for marker in (
        ".deal-action-focus",
        ".deal-action-focus-grid",
        ".deal-action-focus-result",
        ".deal-action-focus-actions",
        "@media(max-width:860px)",
    ):
        if marker not in css:
            errors.append(f"nav-v2-deal-action-focus.css: missing {marker!r}")

    if errors:
        print("Navigator v2 deal action-focus errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 deal action-focus contract passed: current user actionable task is primary, existing task tab receives focus, control fallback remains visible, and production boundaries stay closed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
