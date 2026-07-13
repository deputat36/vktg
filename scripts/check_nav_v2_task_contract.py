from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260713172000_nav_v2_task_contract_preview.sql"
PAGE = ROOT / "task-review-v2.html"
MODULE = ROOT / "assets/js/nav-v2/task-review-v2.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (MIGRATION, PAGE, MODULE, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    sql = MIGRATION.read_text(encoding="utf-8")
    require(sql, (
        "add column if not exists task_type text",
        "add column if not exists sla_days integer",
        "nav_deal_tasks_v2_task_type_check",
        "nav_deal_tasks_v2_sla_days_check",
        "task_type is null",
        "sla_days is null or sla_days between 1 and 365",
        "persisted_task_type",
        "persisted_sla_days",
        "inferred_task_type",
        "inferred_sla_days",
        "matches_inference",
        "overrides_inference",
        "not_persisted",
        "partial",
        "missing_contracts",
        "partial_contracts",
        "override_contracts",
        "'contract_version', 1",
        "'persisted_contract_enabled', true",
        "Task contract preview definition drifted",
        "revoke execute on function public.nav_v2_get_task_taxonomy_preview(integer) from anon",
        "grant execute on function public.nav_v2_get_task_taxonomy_preview(integer) to authenticated, service_role",
    ), MIGRATION.name, errors)

    lowered = sql.lower()
    for forbidden in (
        "update public.nav_deal_tasks_v2",
        "insert into public.nav_deal_tasks_v2",
        "delete from public.nav_deal_tasks_v2",
        "alter column task_type set default",
        "alter column sla_days set default",
        "alter column task_type set not null",
        "alter column sla_days set not null",
    ):
        if forbidden in lowered:
            errors.append(f"task contract migration mutates existing task rows or forces defaults: {forbidden}")

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        "assets/js/nav-v2/task-review-v2.js?v=20260713-02",
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "contract_state",
        "persisted_task_type",
        "persisted_sla_days",
        "inferred_task_type",
        "inferred_sla_days",
        "Контракт не сохранён",
        "Без сохранённого контракта",
        "существующие задачи не изменены",
        "массово нельзя до authenticated E2E",
        "details class=\"task-review-contract\"",
    ), MODULE.name, errors)
    for mutation_marker in (
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        ".from('nav_",
        '.from("nav_',
    ):
        if mutation_marker in module:
            errors.append(f"task contract preview unexpectedly calls mutation/direct table surface {mutation_marker}")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_task_contract.py" not in workflow:
        errors.append("static workflow does not run persisted task contract regression")

    if errors:
        print("Navigator v2 task contract errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 task contract passed: nullable persisted fields, inference comparison and read-only preview checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
