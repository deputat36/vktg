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

if legacy_count:
    print(f"WARNING: {legacy_count} legacy migration filenames are outside the current convention")
if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"Release integrity passed: {len(versions)} standard migrations checked")
