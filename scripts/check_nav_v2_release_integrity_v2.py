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
static_workflow_path = root / ".github/workflows/nav-v2-static.yml"
if not build_config_path.exists():
    errors.append("Missing Navigator v2 build version config")
if not build_check_path.exists():
    errors.append("Missing Navigator v2 build version check")
if not static_workflow_path.exists():
    errors.append("Missing Navigator v2 static workflow")
elif "python3 scripts/check_nav_v2_build_version.py" not in static_workflow_path.read_text(encoding="utf-8"):
    errors.append("Navigator v2 static workflow does not run build version check")

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

if legacy_count:
    print(f"WARNING: {legacy_count} legacy migration filenames are outside the current convention")
if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"Release integrity passed: {len(versions)} standard migrations checked")
