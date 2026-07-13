from pathlib import Path
import re
import sys
import tomllib

root = Path(__file__).resolve().parents[1]
errors: list[str] = []

config_path = root / "supabase/config.toml"
if not config_path.exists():
    errors.append("Missing supabase/config.toml")
else:
    config = tomllib.loads(config_path.read_text(encoding="utf-8"))
    functions = config.get("functions", {})
    for name in ("nav-invite-user", "nav-v2-deal-api"):
        if functions.get(name, {}).get("verify_jwt") is not True:
            errors.append(f"{name}: verify_jwt must be true")

pattern = re.compile(r"^(\d{14})_[a-z0-9_]+\.sql$")
versions: dict[str, str] = {}
legacy_count = 0
for file_path in sorted((root / "supabase/migrations").glob("*.sql")):
    match = pattern.match(file_path.name)
    if not match:
        legacy_count += 1
        continue
    version = match.group(1)
    if version in versions:
        errors.append(f"Duplicate migration version: {version}")
    versions[version] = file_path.name

migration_markers = {
    "20260710134911_harden_postgres_public_default_privileges.sql": (),
    "20260710134932_revoke_postgres_default_table_maintain.sql": (),
    "20260710155703_nav_v2_revoke_authenticated_jsonb_has.sql": (),
    "20260710173438_nav_v2_revoke_active_spn_manager_guard.sql": (),
    "20260710175128_nav_v2_private_schema_move_spn_manager_guard.sql": (),
    "20260710181623_nav_v2_private_active_user_and_rpc_health.sql": (
        "alter function public.nav_v2_is_active_user(uuid) set schema nav_v2_private",
        "nav_v2_private.nav_v2_is_active_user((select auth.uid()))",
        "'scope', 'browser_callable_only'",
        "revoke all on function nav_v2_private.nav_v2_is_active_user(uuid) from public, anon, authenticated",
        "grant execute on function nav_v2_private.nav_v2_is_active_user(uuid) to authenticated, service_role",
    ),
    "20260710182320_nav_v2_private_my_role_helper.sql": (
        "alter function public.nav_v2_my_role(uuid) set schema nav_v2_private",
        "replace(r.definition, 'public.nav_v2_my_role', 'nav_v2_private.nav_v2_my_role')",
        "Expected 2 policies using private my_role helper",
        "grant execute on function nav_v2_private.nav_v2_my_role(uuid) to authenticated, service_role",
    ),
    "20260710182808_nav_v2_private_owner_admin_helper.sql": (
        "alter function public.nav_v2_is_owner_or_admin(uuid) set schema nav_v2_private",
        "'public.nav_v2_is_owner_or_admin',",
        "'nav_v2_private.nav_v2_is_owner_or_admin'",
        "Expected 3 policies using private owner/admin helper",
        "grant execute on function nav_v2_private.nav_v2_is_owner_or_admin(uuid) to authenticated, service_role",
    ),
    "20260710183428_nav_v2_private_can_view_deal_helper.sql": (
        "alter function public.nav_v2_can_view_deal(uuid,uuid) set schema nav_v2_private",
        "replace(r.definition,'public.nav_v2_can_view_deal','nav_v2_private.nav_v2_can_view_deal')",
        "Expected 12 private can_view policies",
        "grant execute on function nav_v2_private.nav_v2_can_view_deal(uuid,uuid) to authenticated, service_role",
    ),
    "20260710183524_nav_v2_private_can_edit_deal_helper.sql": (
        "alter function public.nav_v2_can_edit_deal(uuid,uuid) set schema nav_v2_private",
        "replace(r.definition,'public.nav_v2_can_edit_deal','nav_v2_private.nav_v2_can_edit_deal')",
        "Expected 16 private can_edit policies",
        "grant execute on function nav_v2_private.nav_v2_can_edit_deal(uuid,uuid) to authenticated, service_role",
    ),
    "20260710184255_nav_v2_private_helper_lockdown_health.sql": (
        "'private_problem_count', v_private_problem_count",
        "'private_items_count', jsonb_array_length(v_private_items)",
        "'private_schema_ok', v_private_schema_ok",
        "'nav_v2_private.nav_v2_can_view_deal(uuid, uuid)'",
        "'nav_v2_private.nav_v2_can_edit_deal(uuid, uuid)'",
        "'trigger_helper', false",
        "'rls_helper', true",
    ),
    "20260713172000_nav_v2_task_contract_preview.sql": (
        "add column if not exists task_type text",
        "add column if not exists sla_days integer",
        "nav_deal_tasks_v2_task_type_check",
        "nav_deal_tasks_v2_sla_days_check",
        "task_type is null",
        "sla_days is null or sla_days between 1 and 365",
        "persisted_task_type",
        "inferred_task_type",
        "contract_state",
        "missing_contracts",
        "'contract_version', 1",
        "Task contract preview definition drifted",
    ),
    "20260713193000_nav_v2_operational_adoption_report.sql": (
        "create or replace function public.nav_v2_get_operational_adoption_report(",
        "v_role not in ('owner', 'admin', 'manager')",
        "activity_without_result",
        "confirmed_results",
        "missing_manager",
        "'preview_only', true",
        "revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon",
        "nav_v2_get_operational_adoption_report'),",
        "Operational adoption report definition drifted",
    ),
}

for name, markers in migration_markers.items():
    path = root / "supabase/migrations" / name
    if not path.exists():
        errors.append(f"Missing migration: {name}")
        continue
    if not markers:
        continue
    sql = path.read_text(encoding="utf-8")
    for marker in markers:
        if marker not in sql:
            errors.append(f"{name}: missing integrity marker: {marker}")

invite_path = root / "supabase/functions/nav-invite-user/index.ts"
if not invite_path.exists():
    errors.append("Missing nav-invite-user source")
else:
    source = invite_path.read_text(encoding="utf-8")
    for marker in (
        'const ACTIONS = new Set(["access_link", "invite_email", "dry_run"])',
        'if (role === "spn" && !managerId)',
        'if (!["owner", "admin"].includes(profile.role))',
    ):
        if marker not in source:
            errors.append(f"Invite source missing required marker: {marker}")

smoke_workflow_path = root / ".github/workflows/nav-v2-live-pages.yml"
if not smoke_workflow_path.exists():
    errors.append("Missing Navigator v2 live production smoke workflow")
else:
    smoke_workflow = smoke_workflow_path.read_text(encoding="utf-8")
    for marker in (
        "workflow_dispatch:",
        "schedule:",
        "pull_request:",
        "push:",
        "python3 scripts/check_nav_v2_live_pages.py",
        "python3 scripts/check_nav_v2_edge_auth.py",
        "python3 scripts/check_nav_v2_rpc_auth.py",
    ):
        if marker not in smoke_workflow:
            errors.append(f"Live production smoke workflow missing marker: {marker}")

edge_smoke_path = root / "scripts/check_nav_v2_edge_auth.py"
if not edge_smoke_path.exists():
    errors.append("Missing Navigator v2 Edge auth smoke script")
else:
    edge_smoke = edge_smoke_path.read_text(encoding="utf-8")
    for marker in (
        'FUNCTIONS = ("nav-invite-user", "nav-v2-deal-api")',
        "if status != 401:",
        'method="POST"',
    ):
        if marker not in edge_smoke:
            errors.append(f"Edge auth smoke missing marker: {marker}")

pages_smoke_path = root / "scripts/check_nav_v2_live_pages.py"
if not pages_smoke_path.exists():
    errors.append("Missing Navigator v2 live Pages smoke script")

build_config_path = root / "config/nav-v2-build.json"
build_check_path = root / "scripts/check_nav_v2_build_version.py"
deal_card_hook_check_path = root / "scripts/check_nav_v2_deal_card_hooks.py"
e2e_contract_check_path = root / "scripts/check_nav_v2_e2e_contract.py"
e2e_workflow_path = root / ".github/workflows/nav-v2-authenticated-e2e.yml"
static_workflow_path = root / ".github/workflows/nav-v2-static.yml"
task_contract_check_path = root / "scripts/check_nav_v2_task_contract.py"
adoption_check_path = root / "scripts/check_nav_v2_operational_adoption.py"
advisor_check_path = root / "scripts/check_nav_v2_advisor_scope.py"
if not build_config_path.exists():
    errors.append("Missing Navigator v2 build version config")
if not build_check_path.exists():
    errors.append("Missing Navigator v2 build version check")
if not deal_card_hook_check_path.exists():
    errors.append("Missing Navigator v2 deal-card hook check")
if not e2e_contract_check_path.exists():
    errors.append("Missing Navigator v2 authenticated E2E contract check")
if not e2e_workflow_path.exists():
    errors.append("Missing Navigator v2 authenticated E2E workflow")
if not task_contract_check_path.exists():
    errors.append("Missing Navigator v2 persisted task contract check")
if not adoption_check_path.exists():
    errors.append("Missing Navigator v2 operational adoption check")
if not advisor_check_path.exists():
    errors.append("Missing Navigator v2 Advisor scope check")
if not static_workflow_path.exists():
    errors.append("Missing Navigator v2 static workflow")
else:
    static_workflow = static_workflow_path.read_text(encoding="utf-8")
    for marker, label in (
        ("python3 scripts/check_nav_v2_build_version.py", "build version"),
        ("python3 scripts/check_nav_v2_deal_card_hooks.py", "deal-card hook"),
        ("python3 scripts/check_nav_v2_e2e_contract.py", "authenticated E2E contract"),
        ("python3 scripts/check_nav_v2_task_contract.py", "persisted task contract"),
        ("python3 scripts/check_nav_v2_operational_adoption.py", "operational adoption"),
        ("python3 scripts/check_nav_v2_advisor_scope.py --self-test", "Advisor scope"),
    ):
        if marker not in static_workflow:
            errors.append(f"Navigator v2 static workflow does not run {label} check")

rpc_auth_smoke_path = root / "scripts/check_nav_v2_rpc_auth.py"
if not rpc_auth_smoke_path.exists():
    errors.append("Missing Navigator v2 RPC auth smoke script")
else:
    rpc_auth_smoke = rpc_auth_smoke_path.read_text(encoding="utf-8")
    for marker in (
        "PUBLIC_RPC_CASES",
        "PRIVATE_HELPER_CASES",
        "if status != 401",
        "if status != 404",
        'body.get("code") != "42501"',
        'body.get("code") != "PGRST202"',
    ):
        if marker not in rpc_auth_smoke:
            errors.append(f"RPC auth smoke missing marker: {marker}")

release_baseline_path = root / "config/nav-v2-release-baseline.json"
release_drift_path = root / "scripts/check_nav_v2_release_drift.py"
release_drift_contract_path = root / "scripts/check_nav_v2_release_drift_workflow.py"
release_drift_workflow_path = root / ".github/workflows/nav-v2-release-drift.yml"
release_drift_doc_path = root / "docs/NAV_V2_RELEASE_DRIFT.md"
for required_path in (
    release_baseline_path,
    release_drift_path,
    release_drift_contract_path,
    release_drift_workflow_path,
    release_drift_doc_path,
):
    if not required_path.exists():
        errors.append(f"Missing Navigator release drift artifact: {required_path.relative_to(root)}")

if release_drift_workflow_path.exists():
    release_workflow = release_drift_workflow_path.read_text(encoding="utf-8")
    for marker in (
        "environment: navigator-production-readonly",
        "supabase migration list > artifacts/migration-list.txt",
        "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/functions",
        "python3 scripts/check_nav_v2_release_drift.py",
        "Fail when drift is detected",
    ):
        if marker not in release_workflow:
            errors.append(f"Release drift workflow missing marker: {marker}")
    for forbidden in ("supabase db push", "supabase functions deploy", "supabase migration repair"):
        if forbidden in release_workflow.lower():
            errors.append(f"Release drift workflow must remain read-only: {forbidden}")

if static_workflow_path.exists():
    static_workflow = static_workflow_path.read_text(encoding="utf-8")
    for marker in (
        "python3 scripts/check_nav_v2_release_drift.py --self-test",
        "python3 scripts/check_nav_v2_release_drift.py --baseline-only",
        "python3 scripts/check_nav_v2_release_drift_workflow.py",
        "python3 scripts/check_nav_v2_task_contract.py",
        "python3 scripts/check_nav_v2_operational_adoption.py",
        "python3 scripts/check_nav_v2_advisor_scope.py --self-test",
    ):
        if marker not in static_workflow:
            errors.append(f"Static workflow missing release/product check: {marker}")

if legacy_count:
    print(f"WARNING: {legacy_count} legacy migration filenames are outside the current convention")
if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"Release integrity passed: {len(versions)} standard migrations checked")
