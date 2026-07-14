from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260713203000_nav_v2_operational_adoption_period_comparison.sql"
PAGE = ROOT / "operational-adoption-v2.html"
MODULE = ROOT / "assets/js/nav-v2/operational-adoption-v2.js"
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
        "nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(",
        "security definer",
        "set search_path = public, pg_temp",
        "v_role not in ('owner', 'admin', 'manager')",
        "v_current_start := v_current_end - make_interval(days => v_days)",
        "v_previous_start := v_current_end - make_interval(days => v_days * 2)",
        "event.created_at >= period_deal.period_start",
        "event.created_at < period_deal.period_end",
        "deal.created_at < period.period_end",
        "'current_period', v_current",
        "'previous_period', v_previous",
        "'confirmed_result_rate_points'",
        "'historical_backlog_included', false",
        "'employee_score', false",
        "nav_v2_get_operational_adoption_report_unchecked_20260713(",
        "'report_version', 2",
        "'comparison', v_comparison",
        "revoke execute on function nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(integer) from anon, authenticated",
        "grant execute on function nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(integer) to service_role",
        "revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon",
        "grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer) to authenticated, service_role",
        "Operational adoption comparison implementation must remain private",
    ), MIGRATION.name, errors)

    lowered_sql = sql.lower()
    for forbidden in (
        "update public.nav_deals_v2",
        "update public.nav_deal_tasks_v2",
        "update public.nav_deal_risks_v2",
        "update public.nav_deal_documents_v2",
        "insert into public.nav_deals_v2",
        "insert into public.nav_deal_tasks_v2",
        "insert into public.nav_deal_risks_v2",
        "insert into public.nav_deal_documents_v2",
        "delete from public.nav_deals_v2",
        "delete from public.nav_deal_tasks_v2",
        "delete from public.nav_deal_risks_v2",
        "delete from public.nav_deal_documents_v2",
    ):
        if forbidden in lowered_sql:
            errors.append(f"adoption comparison migration must remain read-only: {forbidden}")

    comparison_body = sql.split(
        "create or replace function nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713",
        1,
    )[1].split("$function$;", 1)[0]
    for forbidden_history in (
        "open_tasks",
        "overdue_tasks",
        "open_risks",
        "overdue_required_documents",
        "missing_manager",
        "missing_spn",
        "missing_next_action",
    ):
        if forbidden_history in comparison_body:
            errors.append(
                "period comparison must not present current backlog as historical: "
                + forbidden_history
            )

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        "aria-live=\"polite\"",
        "assets/js/nav-v2/operational-adoption-v2.js?v=20260714-01",
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "function comparison()",
        "function currentPeriod()",
        "function previousPeriod()",
        "function periodDelta()",
        "function comparisonBlock()",
        "Текущий период и предыдущий равный период",
        "Выборки различаются",
        "confirmed_result_rate_points",
        "Не рейтинг сотрудников",
        "исторический backlog",
        "rpc('nav_v2_get_operational_adoption_report'",
    ), MODULE.name, errors)
    if module.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("comparison UI must reuse exactly one existing adoption RPC call")
    for forbidden in (
        "nav_v2_get_operational_adoption_period_comparison_unchecked_20260713",
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        ".from('nav_",
        '.from("nav_',
    ):
        if forbidden in module:
            errors.append(f"comparison UI must remain on the curated read-only RPC surface: {forbidden}")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_operational_adoption_comparison.py" not in workflow:
        errors.append("static workflow does not run adoption comparison regression")

    if errors:
        print("Navigator v2 operational adoption comparison errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 adoption comparison passed: equal windows, neutral deltas, "
        "no historical backlog guess, private helper and one read-only browser RPC checked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
