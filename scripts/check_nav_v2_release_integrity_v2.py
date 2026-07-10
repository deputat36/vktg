from pathlib import Path
import re
import sys
import tomllib

root = Path(__file__).resolve().parents[1]
errors = []

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
versions = {}
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

required = (
    "20260710134911_harden_postgres_public_default_privileges.sql",
    "20260710134932_revoke_postgres_default_table_maintain.sql",
    "20260710155703_nav_v2_revoke_authenticated_jsonb_has.sql",
    "20260710173438_nav_v2_revoke_active_spn_manager_guard.sql",
    "20260710175128_nav_v2_private_schema_move_spn_manager_guard.sql",
)
for name in required:
    if not (root / "supabase/migrations" / name).exists():
        errors.append(f"Missing migration: {name}")

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

if legacy_count:
    print(f"WARNING: {legacy_count} legacy migration filenames are outside the current convention")
if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"Release integrity passed: {len(versions)} standard migrations checked")
