from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260714013000_nav_v2_operational_pilot_shortlist.sql"
PAGE = ROOT / "operational-adoption-v2.html"
MODULE = ROOT / "assets/js/nav-v2/operational-adoption-v2.js"
REGISTRY = ROOT / "config/nav-v2-rpc-surface.json"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"
DEDICATED_WORKFLOW = ROOT / ".github/workflows/nav-v2-operational-pilot-shortlist.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def assert_read_only(text: str, label: str, errors: list[str]) -> None:
    lowered = text.lower()
    for forbidden in (
        "update public.nav_deals_v2",
        "update public.nav_deal_tasks_v2",
        "update public.nav_deal_risks_v2",
        "update public.nav_deal_documents_v2",
        "update public.nav_user_profiles",
        "insert into public.nav_deals_v2",
        "insert into public.nav_deal_tasks_v2",
        "insert into public.nav_deal_risks_v2",
        "insert into public.nav_deal_documents_v2",
        "delete from public.nav_deals_v2",
        "delete from public.nav_deal_tasks_v2",
        "delete from public.nav_deal_risks_v2",
        "delete from public.nav_deal_documents_v2",
    ):
        if forbidden in lowered:
            errors.append(f"{label} must remain read-only: {forbidden}")


def main() -> int:
    errors: list[str] = []
    for path in (MIGRATION, PAGE, MODULE, REGISTRY, STATIC_WORKFLOW, DEDICATED_WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    sql = MIGRATION.read_text(encoding="utf-8")
    require(sql, (
        "nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(",
        "security definer",
        "set search_path = public, pg_temp",
        "v_role is null or v_role not in ('owner', 'admin', 'manager')",
        "nav_v2_get_operational_adoption_report_unchecked_20260713(v_days, 500)",
        "nav_v2_get_responsibility_evidence_unchecked_20260713(500)",
        "'[^0-9a-zа-яё]+'",
        "count(*) over (partition by duplicate_key)",
        "'quick_result'",
        "'responsibility_confirmation'",
        "'document_workflow'",
        "'ranking_is_not_employee_rating', true",
        "'selection_available', false",
        "'mutation_available', false",
        "'owner_decision_required', true",
        "'operational_pilot_shortlist', v_pilot_shortlist",
        "'report_version', 7",
        "revoke execute on function nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer) from anon, authenticated",
        "grant execute on function nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer) to service_role",
        "Operational pilot shortlist implementation must remain private",
    ), MIGRATION.name, errors)
    assert_read_only(sql, MIGRATION.name, errors)

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        'aria-live="polite"',
        "assets/js/nav-v2/operational-adoption-v2.js?v=20260714-01",
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "function pilotShortlist()",
        "function pilotShortlistBlock()",
        "function pilotCard(item)",
        "operational_pilot_shortlist",
        "Кандидаты для операционного пилота",
        "Shortlist не запускает пилот",
        "Быстрый пилотный цикл",
        "Подтверждение ответственности",
        "Документный рабочий цикл",
        "Только ручной выбор",
        "Групп вероятных дублей",
        "Решение владельца",
        "rpc('nav_v2_get_operational_adoption_report'",
    ), MODULE.name, errors)
    if module.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("pilot shortlist UI must reuse exactly one adoption report RPC call")
    for forbidden in (
        "nav_v2_get_operational_pilot_shortlist_unchecked_20260714",
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        ".from('nav_",
        '.from("nav_',
    ):
        if forbidden in module:
            errors.append(f"pilot shortlist UI must remain on the curated read-only RPC surface: {forbidden}")

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    helper = "nav_v2_get_operational_pilot_shortlist_unchecked_20260714"
    if registry.get("internal_only", []).count(helper) != 1:
        errors.append("pilot shortlist helper must be registered exactly once as internal_only")
    for category in ("frontend_api", "admin_api", "demo_api"):
        if helper in registry.get(category, []):
            errors.append(f"pilot shortlist helper leaked into {category}")

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    dedicated_workflow = DEDICATED_WORKFLOW.read_text(encoding="utf-8")
    command = "python3 scripts/check_nav_v2_operational_pilot_shortlist.py"
    if command not in static_workflow:
        errors.append("static workflow does not run pilot shortlist regression")
    if command not in dedicated_workflow:
        errors.append("dedicated workflow does not run pilot shortlist regression")

    if errors:
        print("Navigator v2 operational pilot shortlist errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 operational pilot shortlist passed: three transparent lanes, duplicate avoidance, "
        "private helper, one browser RPC, owner decision and no mutation"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
