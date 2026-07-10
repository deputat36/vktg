from pathlib import Path
import re
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []


def require(path: str) -> Path:
    file_path = ROOT / path
    if not file_path.exists():
        errors.append(f"Missing required file: {path}")
    return file_path


config_path = require("supabase/config.toml")
invite_path = require("supabase/functions/nav-invite-user/index.ts")
deal_api_path = require("supabase/functions/nav-v2-deal-api/index.ts")

if config_path.exists():
    config = tomllib.loads(config_path.read_text(encoding="utf-8"))
    functions = config.get("functions", {})
    for function_name in ("nav-invite-user", "nav-v2-deal-api"):
        settings = functions.get(function_name, {})
        if settings.get("verify_jwt") is not True:
            errors.append(f"{function_name}: verify_jwt must be true")

migration_dir = ROOT / "supabase/migrations"
pattern = re.compile(r"^(\d{14})_[a-z0-9_]+\.sql$")
versions: dict[str, str] = {}
for migration in sorted(migration_dir.glob("*.sql")):
    match = pattern.match(migration.name)
    if not match:
        errors.append(f"Invalid migration filename: {migration.name}")
        continue
    version = match.group(1)
    if version in versions:
        errors.append(f"Duplicate migration version {version}: {versions[version]} and {migration.name}")
    versions[version] = migration.name

for required_migration in (
    "20260710134911_harden_postgres_public_default_privileges.sql",
    "20260710134932_revoke_postgres_default_table_maintain.sql",
):
    require(f"supabase/migrations/{required_migration}")

if invite_path.exists():
    invite = invite_path.read_text(encoding="utf-8")
    for marker in (
        'const ACTIONS = new Set(["access_link", "invite_email", "dry_run"])',
        'if (role === "spn" && !managerId)',
        'if (!["owner", "admin"].includes(profile.role))',
    ):
        if marker not in invite:
            errors.append(f"nav-invite-user missing marker: {marker}")

if deal_api_path.exists() and "Authorization" not in deal_api_path.read_text(encoding="utf-8"):
    errors.append("nav-v2-deal-api must use the Authorization header")

secret_patterns = (
    re.compile(r"sb_secret_[A-Za-z0-9_-]+"),
    re.compile(r"eyJhbGciOiJIUzI1Ni"),
    re.compile(r"SUPABASE_SERVICE_ROLE_KEY\s*=", re.IGNORECASE),
)

browser_files = list((ROOT / "assets/js/nav-v2").glob("*.js"))
browser_files += [ROOT / "config/supabase.js"]
for file_path in browser_files:
    if not file_path.exists():
        continue
    text = file_path.read_text(encoding="utf-8")
    for secret_pattern in secret_patterns:
        if secret_pattern.search(text):
            errors.append(f"Possible secret in browser file: {file_path.relative_to(ROOT)}")

if errors:
    print("\n".join(errors))
    sys.exit(1)

print(f"Navigator v2 release integrity passed: {len(versions)} migrations checked")
