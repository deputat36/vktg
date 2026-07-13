from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REMEDIATION_MIGRATION = ROOT / "supabase/migrations/20260713223000_nav_v2_manager_source_remediation_plan.sql"
EVIDENCE_MIGRATION = ROOT / "supabase/migrations/20260713233000_nav_v2_responsibility_evidence_candidates.sql"
CONFIRMATION_MIGRATION = ROOT / "supabase/migrations/20260713234500_nav_v2_responsibility_confirmation_context.sql"
PAGE = ROOT / "manager-source-remediation-v2.html"
MODULE = ROOT / "assets/js/nav-v2/manager-source-remediation-v2.js"
MENU = ROOT / "assets/js/nav-v2/role-menu-v2.js"
ROLE_CONTRACT = ROOT / "config/nav-v2-role-contract.json"
RPC_REGISTRY = ROOT / "config/nav-v2-rpc-surface.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-manager-source-remediation.yml"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def assert_read_only(sql: str, label: str, errors: list[str]) -> None:
    lowered = sql.lower()
    for forbidden in (
        "update public.nav_deals_v2",
        "update public.nav_user_profiles",
        "insert into public.nav_deals_v2",
        "insert into public.nav_user_profiles",
        "delete from public.nav_deals_v2",
        "delete from public.nav_user_profiles",
    ):
        if forbidden in lowered:
            errors.append(f"{label}: read-only workflow contains mutation {forbidden}")


def main() -> int:
    errors: list[str] = []
    required = (
        REMEDIATION_MIGRATION,
        EVIDENCE_MIGRATION,
        CONFIRMATION_MIGRATION,
        PAGE,
        MODULE,
        MENU,
        ROLE_CONTRACT,
        RPC_REGISTRY,
        WORKFLOW,
        STATIC_WORKFLOW,
    )
    for path in required:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    remediation_sql = REMEDIATION_MIGRATION.read_text(encoding="utf-8")
    require(remediation_sql, (
        "nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(",
        "security definer",
        "set search_path = public, pg_temp",
        "v_role is null or v_role not in ('owner', 'admin', 'manager')",
        "'deal_field_points_to_non_spn'",
        "'profile_manager_missing'",
        "'deal_spn_missing'",
        "'execution_order'",
        "'mutation_available', false",
        "'manager_source_remediation_plan', v_remediation_plan",
        "Manager source remediation implementation must remain private",
    ), REMEDIATION_MIGRATION.name, errors)

    evidence_sql = EVIDENCE_MIGRATION.read_text(encoding="utf-8")
    require(evidence_sql, (
        "nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(",
        "security definer",
        "set search_path = public, pg_temp",
        "v_role is null or v_role not in ('owner', 'admin', 'manager')",
        "'deal_creator'::text",
        "'participant'::text",
        "'event_actor'::text",
        "'task_creator'::text",
        "'task_assignee'::text",
        "'task_completer'::text",
        "'document_assignee'::text",
        "'document_checker'::text",
        "'strong_single_evidence'",
        "'no_active_spn_evidence'",
        "'selection_available', false",
        "'mutation_available', false",
        "'report_version', 5",
        "'responsibility_evidence', v_responsibility_evidence",
        "revoke execute on function nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(integer) from anon, authenticated",
        "grant execute on function nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(integer) to service_role",
        "Responsibility evidence implementation must remain private",
    ), EVIDENCE_MIGRATION.name, errors)

    confirmation_sql = CONFIRMATION_MIGRATION.read_text(encoding="utf-8")
    require(confirmation_sql, (
        "nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(",
        "security definer",
        "set search_path = public, pg_temp",
        "v_role is null or v_role not in ('owner', 'admin', 'manager')",
        "profile.role = 'spn'::public.nav_v2_user_role",
        "profile.role in (",
        "'active_spn_options'",
        "'manager_options'",
        "'local_draft_available', true",
        "'local_storage_only', true",
        "'export_available', true",
        "'server_selection_available', false",
        "'server_mutation_available', false",
        "'report_version', 6",
        "'responsibility_confirmation_context', v_confirmation_context",
        "revoke execute on function nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer) from anon, authenticated",
        "grant execute on function nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer) to service_role",
        "Responsibility confirmation context implementation must remain private",
    ), CONFIRMATION_MIGRATION.name, errors)

    for label, sql in (
        (REMEDIATION_MIGRATION.name, remediation_sql),
        (EVIDENCE_MIGRATION.name, evidence_sql),
        (CONFIRMATION_MIGRATION.name, confirmation_sql),
    ):
        assert_read_only(sql, label, errors)

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        'aria-live="polite"',
        "manager-source-remediation-v2.js?v=20260713-03",
        "role-menu-v2.js?v=20260713-02",
        "nav-base-menu-cleanup-v2.js",
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "rpc('nav_v2_get_operational_adoption_report'",
        "manager_source_remediation_plan",
        "responsibility_evidence",
        "responsibility_confirmation_context",
        "Что исправить до назначения менеджера",
        "Группы ручного исправления",
        "Автоматические исправления и массовые назначения отключены",
        "Лист подтверждения ответственности",
        "localStorage",
        "DRAFT_KEY_PREFIX",
        "data-draft-scope",
        "server_mutation_available: false",
        "navigator_v2_responsibility_confirmation_draft",
        "Скачать JSON",
        "Скачать CSV",
        "Копировать сводку",
        "В Supabase ничего не записано",
        "Подтверждающие действия активных СПН",
        "Evidence-only candidates",
        "История действий — не назначение",
        "Серверный выбор и запись отключены",
        "operational-adoption-v2.html",
    ), MODULE.name, errors)
    if module.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("remediation UI must use exactly one existing adoption report RPC call")
    for forbidden in (
        "nav_v2_get_manager_source_remediation_plan_unchecked_20260713",
        "nav_v2_get_responsibility_evidence_unchecked_20260713",
        "nav_v2_get_responsibility_confirmation_context_unchecked_20260713",
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        ".from('nav_",
        '.from("nav_',
    ):
        if forbidden in module:
            errors.append(f"remediation UI must remain server read-only: {forbidden}")

    menu = MENU.read_text(encoding="utf-8")
    require(menu, (
        "path.includes('manager-source-remediation-v2')",
        "makeLink(active, 'remediation', './manager-source-remediation-v2.html', 'Исправить источники')",
        "'dashboard', 'spn', 'deals', 'manager', 'adoption', 'remediation', 'queue'",
    ), MENU.name, errors)

    contract = json.loads(ROLE_CONTRACT.read_text(encoding="utf-8"))
    route = "manager-source-remediation-v2.html"
    for role in ("owner_admin", "manager"):
        if route not in contract["roles"][role]["menu_routes"]:
            errors.append(f"role contract missing remediation route for {role}")
    for role in ("spn", "lawyer", "broker", "viewer"):
        if route in contract["roles"][role]["menu_routes"]:
            errors.append(f"role contract exposes remediation route to {role}")

    registry = json.loads(RPC_REGISTRY.read_text(encoding="utf-8"))
    helpers = (
        "nav_v2_get_manager_source_remediation_plan_unchecked_20260713",
        "nav_v2_get_responsibility_evidence_unchecked_20260713",
        "nav_v2_get_responsibility_confirmation_context_unchecked_20260713",
    )
    for helper in helpers:
        if registry.get("internal_only", []).count(helper) != 1:
            errors.append(f"private helper {helper} must be registered exactly once as internal_only")
        for category in ("frontend_api", "admin_api", "demo_api"):
            if helper in registry.get(category, []):
                errors.append(f"private helper {helper} leaked into {category}")
    if registry.get("frontend_api", []).count("nav_v2_get_operational_adoption_report") != 1:
        errors.append("existing adoption report RPC must remain the only browser endpoint")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "20260713233000_nav_v2_responsibility_evidence_candidates.sql",
        "20260713234500_nav_v2_responsibility_confirmation_context.sql",
        "python3 scripts/check_nav_v2_manager_source_remediation.py",
        "python3 scripts/check_nav_v2_role_contract.py",
        "python3 scripts/check_nav_v2_rpc_surface.py",
        "python3 scripts/check_nav_v2_release_integrity_v2.py",
    ), WORKFLOW.name, errors)

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    require(static_workflow, (
        "scripts/check_nav_v2_manager_source_remediation.py",
        "Check manager source remediation, evidence and confirmation draft",
        "python3 scripts/check_nav_v2_manager_source_remediation.py",
    ), STATIC_WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 manager source remediation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 manager source remediation passed: delivered page, grouped manual actions, "
        "evidence-only candidates, browser-local confirmation export, one existing browser RPC, "
        "role-safe route and server mutation disabled"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
