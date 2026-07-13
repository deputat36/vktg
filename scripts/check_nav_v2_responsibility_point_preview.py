from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / "supabase/migrations/20260714001500_nav_v2_responsibility_point_preview.sql"
GUARD = ROOT / "supabase/migrations/20260714001600_nav_v2_responsibility_point_preview_guard.sql"
PAGE = ROOT / "manager-source-remediation-v2.html"
MODULE = ROOT / "assets/js/nav-v2/manager-source-remediation-server-preview-v2.js"
REGISTRY = ROOT / "config/nav-v2-rpc-surface.json"
ADVISOR = ROOT / "config/nav-v2-advisor-scope.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-manager-source-remediation.yml"
STATIC = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def forbid_dml(text: str, label: str, errors: list[str]) -> None:
    lowered = text.lower()
    for marker in (
        "update public.nav_deals_v2",
        "update public.nav_user_profiles",
        "insert into public.nav_deals_v2",
        "insert into public.nav_user_profiles",
        "delete from public.nav_deals_v2",
        "delete from public.nav_user_profiles",
    ):
        if marker in lowered:
            errors.append(f"{label}: point preview must remain read-only: {marker}")


def main() -> int:
    errors: list[str] = []
    for path in (CORE, GUARD, PAGE, MODULE, REGISTRY, ADVISOR, WORKFLOW, STATIC):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    core = CORE.read_text(encoding="utf-8")
    require(core, (
        "create or replace function public.nav_v2_preview_responsibility_point_correction(",
        "security definer",
        "nav_v2_private.nav_v2_is_owner_or_admin(v_uid)",
        "v_operation_type not in ('deal_spn', 'profile_manager')",
        "v_field not in ('seller_spn_id', 'buyer_spn_id')",
        "v_field <> 'manager_id'",
        "'stale_current_value'",
        "'proposed_profile_not_active_spn'",
        "'proposed_profile_not_manager_candidate'",
        "nav_v2_responsibility_point_preview_v1",
        "'operation_fingerprint', v_fingerprint",
        "interval '15 minutes'",
        "'mutation_available', false",
        "'execution_rpc_available', false",
        "'requires_revalidation', true",
        "nav_v2_get_rpc_grant_health",
        "nav_v2_get_frontend_rpc_coverage_health",
    ), CORE.name, errors)
    forbid_dml(core, CORE.name, errors)

    guard = GUARD.read_text(encoding="utf-8")
    require(guard, (
        "rename to nav_v2_preview_responsibility_point_correction_unchecked_20260714",
        "set schema nav_v2_private",
        "revoke all on function nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(jsonb)",
        "from public, anon, authenticated",
        "grant execute on function nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(jsonb)",
        "create or replace function public.nav_v2_preview_responsibility_point_correction(",
        "nav_v2_private.nav_v2_is_owner_or_admin(v_uid)",
        "if not (p_operation ? 'expected_current_id')",
        "'missing_expected_current'",
        "'missing_field'",
        "return nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(p_operation)",
        "Responsibility point preview implementation must remain private",
    ), GUARD.name, errors)
    forbid_dml(guard, GUARD.name, errors)

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "manager-source-remediation-server-preview-v2.js?v=20260714-01",
        "manager-source-remediation-validation-v2.js?v=20260713-01",
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "rpc('nav_v2_get_my_profile'",
        "rpc('nav_v2_preview_responsibility_point_correction'",
        "ownerAdminAllowed",
        "localPointReady",
        "operations.length === 1",
        "Получить серверный preview",
        "operation_fingerprint",
        "navigator_v2_responsibility_point_server_preview",
        "mutation_available: false",
        "execution_rpc_available: false",
        "requires_revalidation: true",
    ), MODULE.name, errors)
    if module.count("rpc('nav_v2_preview_responsibility_point_correction'") != 1:
        errors.append("server preview module must call preview RPC exactly once")
    for forbidden in ("nav_v2_update_", "nav_v2_add_", "nav_v2_save_", ".from('nav_", '.from("nav_'):
        if forbidden in module:
            errors.append(f"server preview module contains forbidden mutation surface {forbidden}")

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    public_name = "nav_v2_preview_responsibility_point_correction"
    private_name = "nav_v2_preview_responsibility_point_correction_unchecked_20260714"
    if registry.get("admin_api", []).count(public_name) != 1:
        errors.append("public point preview must be registered once in admin_api")
    for category in ("frontend_api", "demo_api", "internal_only"):
        if public_name in registry.get(category, []):
            errors.append(f"public point preview leaked into {category}")
    if registry.get("internal_only", []).count(private_name) != 1:
        errors.append("private point preview implementation must be registered once in internal_only")
    for category in ("frontend_api", "admin_api", "demo_api"):
        if private_name in registry.get(category, []):
            errors.append(f"private point preview leaked into {category}")

    advisor = json.loads(ADVISOR.read_text(encoding="utf-8"))
    external = sum(len(registry.get(category, [])) for category in ("frontend_api", "admin_api", "demo_api"))
    exceptions = len(advisor["authenticated_security_definer"]["security_invoker_exceptions"])
    if advisor["authenticated_security_definer"]["expected_warning_count"] != external - exceptions:
        errors.append("Advisor warning count drifted after point preview registration")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "20260714001500_nav_v2_responsibility_point_preview.sql",
        "20260714001600_nav_v2_responsibility_point_preview_guard.sql",
        "scripts/check_nav_v2_responsibility_point_preview.py",
        "Check responsibility point preview private wrapper",
    ), WORKFLOW.name, errors)

    static = STATIC.read_text(encoding="utf-8")
    require(static, (
        "scripts/check_nav_v2_responsibility_point_preview.py",
        "Check responsibility point preview",
    ), STATIC.name, errors)

    if errors:
        print("Navigator v2 responsibility point preview errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 responsibility point preview passed: owner/admin wrapper, private implementation, "
        "explicit expected current value, fingerprint, health registration and no mutation"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
