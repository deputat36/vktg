from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260712190000_nav_v2_task_taxonomy_preview.sql"
PAGE = ROOT / "task-review-v2.html"
MODULE = ROOT / "assets/js/nav-v2/task-review-v2.js"
STYLE = ROOT / "assets/css/nav-v2-task-review.css"
MANAGER = ROOT / "assets/js/nav-v2/manager-v2.js"
MENU = ROOT / "assets/js/nav-v2/role-menu-v2.js"
RPC_SURFACE = ROOT / "config/nav-v2-rpc-surface.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (MIGRATION, PAGE, MODULE, STYLE, MANAGER, MENU, RPC_SURFACE, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    sql = MIGRATION.read_text(encoding="utf-8")
    require(
        sql,
        (
            "nav_v2_get_task_taxonomy_preview",
            "'preview_only', true",
            "'quality_warning'",
            "'operational_task'",
            "'legal_blocker'",
            "'broker_task'",
            "'system_recommendation'",
            "'sla_days'",
            "'assignment_state'",
            "'control_due_date'",
            "'overdue_reason'",
            "v_role not in ('owner', 'admin', 'manager')",
            "coalesce((d.deal_summary ->> 'demo') = 'true', false)",
            "revoke execute on function public.nav_v2_get_task_taxonomy_preview(integer) from anon",
            "grant execute on function public.nav_v2_get_task_taxonomy_preview(integer) to authenticated, service_role",
            "manager task taxonomy preview",
        ),
        MIGRATION.name,
        errors,
    )
    function_body = sql.split("create or replace function public.nav_v2_get_task_taxonomy_preview", 1)[1].split(
        "revoke all on function public.nav_v2_get_task_taxonomy_preview", 1
    )[0].lower()
    for forbidden in (
        "update public.nav_deal_tasks_v2",
        "insert into public.nav_deal_tasks_v2",
        "delete from public.nav_deal_tasks_v2",
        "nav_v2_update_",
    ):
        if forbidden in function_body:
            errors.append(f"task taxonomy preview contains mutation marker: {forbidden}")

    page = PAGE.read_text(encoding="utf-8")
    require(
        page,
        (
            "Content-Security-Policy",
            "assets/css/nav-v2-task-review.css?v=20260712-01",
            "assets/js/nav-v2/task-review-v2.js?v=20260712-01",
            "assets/js/nav-v2/role-menu-v2.js?v=20260712-03",
        ),
        PAGE.name,
        errors,
    )

    module = MODULE.read_text(encoding="utf-8")
    require(
        module,
        (
            "rpc('nav_v2_get_task_taxonomy_preview'",
            "['owner', 'admin', 'manager']",
            "Рабочие задачи отдельно от проверок качества",
            "Только просмотр",
            "Клиентские действия",
            "Проверки качества",
            "Юридические стоп-факторы",
            "Без ответственного",
        ),
        MODULE.name,
        errors,
    )
    for mutation_marker in ("nav_v2_update_", "nav_v2_add_", "nav_v2_save_"):
        if mutation_marker in module:
            errors.append(f"task taxonomy UI unexpectedly calls mutation surface {mutation_marker}")
    if ".from('nav_" in module or '.from("nav_' in module:
        errors.append("task taxonomy UI must not access Navigator tables directly")

    manager = MANAGER.read_text(encoding="utf-8")
    if 'href="./task-review-v2.html">Разобрать задачи</a>' not in manager:
        errors.append("manager-v2.js: missing link to task review")

    menu = MENU.read_text(encoding="utf-8")
    if "path.includes('manager-v2') || path.includes('task-review-v2')" not in menu:
        errors.append("role-menu-v2.js: task review must keep manager navigation active")

    rpc_surface = json.loads(RPC_SURFACE.read_text(encoding="utf-8"))
    if "nav_v2_get_task_taxonomy_preview" not in rpc_surface.get("frontend_api", []):
        errors.append("task taxonomy preview RPC is not classified as frontend_api")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_task_taxonomy.py" not in workflow:
        errors.append("static workflow does not run task taxonomy regression")

    if errors:
        print("Navigator v2 task taxonomy errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 task taxonomy passed: read-only classification, SLA and manager preview checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
