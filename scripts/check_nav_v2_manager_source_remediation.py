from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REMEDIATION_MIGRATION = ROOT / "supabase/migrations/20260713223000_nav_v2_manager_source_remediation_plan.sql"
EVIDENCE_MIGRATION = ROOT / "supabase/migrations/20260713233000_nav_v2_responsibility_evidence_candidates.sql"
CONFIRMATION_MIGRATION = ROOT / "supabase/migrations/20260713234500_nav_v2_responsibility_confirmation_context.sql"
POINT_PREVIEW_MIGRATION = ROOT / "supabase/migrations/20260714001500_nav_v2_responsibility_point_preview.sql"
PAGE = ROOT / "manager-source-remediation-v2.html"
MODULE = ROOT / "assets/js/nav-v2/manager-source-remediation-v2.js"
VALIDATION_MODULE = ROOT / "assets/js/nav-v2/manager-source-remediation-validation-v2.js"
SERVER_PREVIEW_MODULE = ROOT / "assets/js/nav-v2/manager-source-remediation-server-preview-v2.js"
MENU = ROOT / "assets/js/nav-v2/role-menu-v2.js"
MODULE_BUDGET = ROOT / "config/nav-v2-module-budget.json"
ROLE_CONTRACT = ROOT / "config/nav-v2-role-contract.json"
RPC_REGISTRY = ROOT / "config/nav-v2-rpc-surface.json"
ADVISOR_SCOPE = ROOT / "config/nav-v2-advisor-scope.json"
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


def assert_browser_read_only(text: str, label: str, errors: list[str]) -> None:
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
        if forbidden in text:
            errors.append(f"{label} must remain server read-only: {forbidden}")


def main() -> int:
    errors: list[str] = []
    required = (
        REMEDIATION_MIGRATION,
        EVIDENCE_MIGRATION,
        CONFIRMATION_MIGRATION,
        POINT_PREVIEW_MIGRATION,
        PAGE,
        MODULE,
        VALIDATION_MODULE,
        SERVER_PREVIEW_MODULE,
        MENU,
        MODULE_BUDGET,
        ROLE_CONTRACT,
        RPC_REGISTRY,
        ADVISOR_SCOPE,
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
        "Responsibility evidence implementation must remain private",
    ), EVIDENCE_MIGRATION.name, errors)

    confirmation_sql = CONFIRMATION_MIGRATION.read_text(encoding="utf-8")
    require(confirmation_sql, (
        "nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(",
        "security definer",
        "set search_path = public, pg_temp",
        "v_role is null or v_role not in ('owner', 'admin', 'manager')",
        "profile.role = 'spn'::public.nav_v2_user_role",
        "'active_spn_options'",
        "'manager_options'",
        "'local_storage_only', true",
        "'server_selection_available', false",
        "'server_mutation_available', false",
        "'report_version', 6",
        "'responsibility_confirmation_context', v_confirmation_context",
        "Responsibility confirmation context implementation must remain private",
    ), CONFIRMATION_MIGRATION.name, errors)

    preview_sql = POINT_PREVIEW_MIGRATION.read_text(encoding="utf-8")
    require(preview_sql, (
        "create or replace function public.nav_v2_preview_responsibility_point_correction(",
        "security definer",
        "set search_path = public, pg_temp",
        "nav_v2_private.nav_v2_is_owner_or_admin(v_uid)",
        "v_operation_type not in ('deal_spn', 'profile_manager')",
        "v_field not in ('seller_spn_id', 'buyer_spn_id')",
        "v_field <> 'manager_id'",
        "char_length(v_note) < 10",
        "'stale_current_value'",
        "'proposed_profile_not_active_spn'",
        "'proposed_profile_not_manager_candidate'",
        "nav_v2_responsibility_point_preview_v1",
        "'operation_fingerprint', v_fingerprint",
        "interval '15 minutes'",
        "'mutation_available', false",
        "'execution_rpc_available', false",
        "'requires_revalidation', true",
        "revoke execute on function public.nav_v2_preview_responsibility_point_correction(jsonb) from anon",
        "grant execute on function public.nav_v2_preview_responsibility_point_correction(jsonb) to authenticated, service_role",
        "nav_v2_get_rpc_grant_health",
        "nav_v2_get_frontend_rpc_coverage_health",
        "Responsibility point preview health registration drifted",
    ), POINT_PREVIEW_MIGRATION.name, errors)

    for label, sql in (
        (REMEDIATION_MIGRATION.name, remediation_sql),
        (EVIDENCE_MIGRATION.name, evidence_sql),
        (CONFIRMATION_MIGRATION.name, confirmation_sql),
        (POINT_PREVIEW_MIGRATION.name, preview_sql),
    ):
        assert_read_only(sql, label, errors)

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        'aria-live="polite"',
        "manager-source-remediation-v2.js?v=20260713-03",
        "manager-source-remediation-validation-v2.js?v=20260713-01",
        "manager-source-remediation-server-preview-v2.js?v=20260714-01",
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
        "navigator_v2_responsibility_confirmation_draft",
        "Скачать JSON",
        "Скачать CSV",
        "Подтверждающие действия активных СПН",
        "Evidence-only candidates",
        "Серверный выбор и запись отключены",
    ), MODULE.name, errors)
    if module.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("remediation UI must use exactly one adoption report RPC call")
    assert_browser_read_only(module, MODULE.name, errors)

    validation_module = VALIDATION_MODULE.read_text(encoding="utf-8")
    require(validation_module, (
        "MAX_FILE_BYTES = 2 * 1024 * 1024",
        "navigator_v2_responsibility_confirmation_draft",
        "navigator_v2_responsibility_confirmation_validation",
        "requires_separate_audited_point_operation",
        "server_mutation_available: false",
        "current_seller_spn_id",
        "current_buyer_spn_id",
        "current_manager_id",
        "point_operation_ready",
        "summary.ready === 1",
        "summary.stale === 0",
        "summary.invalid === 0",
        "summary.not_ready === 0",
        "Выбрать JSON для проверки",
        "Скачать отчёт проверки",
        "Копировать готовую операцию",
        "rpc('nav_v2_get_operational_adoption_report'",
    ), VALIDATION_MODULE.name, errors)
    if validation_module.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("package validator must use exactly one adoption report RPC call")
    assert_browser_read_only(validation_module, VALIDATION_MODULE.name, errors)

    server_preview_module = SERVER_PREVIEW_MODULE.read_text(encoding="utf-8")
    require(server_preview_module, (
        "rpc('nav_v2_get_my_profile'",
        "rpc('nav_v2_preview_responsibility_point_correction'",
        "ownerAdminAllowed",
        "localPointReady",
        "extractOperations",
        "operations.length === 1",
        "Серверный preview одной операции",
        "Получить серверный preview",
        "operation_fingerprint",
        "navigator_v2_responsibility_point_server_preview",
        "mutation_available: false",
        "execution_rpc_available: false",
        "requires_revalidation: true",
        "Fingerprint не является исполнением",
    ), SERVER_PREVIEW_MODULE.name, errors)
    if server_preview_module.count("rpc('nav_v2_preview_responsibility_point_correction'") != 1:
        errors.append("server preview UI must call the point preview RPC exactly once")
    if server_preview_module.count("rpc('nav_v2_get_my_profile'") != 1:
        errors.append("server preview UI must load the current profile exactly once")
    assert_browser_read_only(server_preview_module, SERVER_PREVIEW_MODULE.name, errors)

    budget = json.loads(MODULE_BUDGET.read_text(encoding="utf-8"))
    if budget.get("pages", {}).get("manager-source-remediation-v2.html", {}).get("max_modules") != 5:
        errors.append("manager source remediation module budget must be exactly 5")

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

    adoption_rpc = "nav_v2_get_operational_adoption_report"
    preview_rpc = "nav_v2_preview_responsibility_point_correction"
    if registry.get("frontend_api", []).count(adoption_rpc) != 1:
        errors.append("adoption report RPC must remain registered exactly once in frontend_api")
    if registry.get("admin_api", []).count(preview_rpc) != 1:
        errors.append("point preview RPC must be registered exactly once in admin_api")
    for category in ("frontend_api", "demo_api", "internal_only"):
        if preview_rpc in registry.get(category, []):
            errors.append(f"point preview RPC leaked into {category}")

    advisor = json.loads(ADVISOR_SCOPE.read_text(encoding="utf-8"))
    external = sum(len(registry.get(category, [])) for category in ("frontend_api", "admin_api", "demo_api"))
    exceptions = len(advisor["authenticated_security_definer"]["security_invoker_exceptions"])
    if advisor["authenticated_security_definer"]["expected_warning_count"] != external - exceptions:
        errors.append("Advisor expected warning count does not match registered external SECURITY DEFINER RPCs")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "assets/js/nav-v2/manager-source-remediation-validation-v2.js",
        "assets/js/nav-v2/manager-source-remediation-server-preview-v2.js",
        "config/nav-v2-module-budget.json",
        "config/nav-v2-advisor-scope.json",
        "20260713234500_nav_v2_responsibility_confirmation_context.sql",
        "20260714001500_nav_v2_responsibility_point_preview.sql",
        "Check grouped remediation, evidence, confirmation, package validation and server preview",
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
        "Navigator v2 manager source remediation passed: grouped manual actions, evidence, local confirmation, "
        "package freshness validation, owner/admin server preview fingerprint, health registration and no mutation"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
