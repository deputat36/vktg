from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "config/nav-v2-rpc-surface.json"
BROWSER_ROOT = ROOT / "assets/js/nav-v2"
MIGRATIONS_ROOT = ROOT / "supabase/migrations"
SCAN_ROOTS = (
    BROWSER_ROOT,
    ROOT / "supabase/functions/nav-v2-deal-api",
    ROOT / "supabase/functions/nav-invite-user",
)

RPC_PATTERNS = (
    re.compile(r"\brpc\s*\(\s*['\"](nav(?:_v2)?_[a-z0-9_]+)['\"]"),
    re.compile(r"/rest/v1/rpc/(nav(?:_v2)?_[a-z0-9_]+)"),
)
DIRECT_TABLE_PATTERNS = (
    re.compile(r"\.from\s*\(\s*['\"`](nav_[a-z0-9_]+)['\"`]"),
    re.compile(r"/rest/v1/(nav_[a-z0-9_]+)(?:[/?'\"`]|$)"),
)
DB_HEALTH_ENTRY_PATTERN = re.compile(
    r"\('{1,2}(frontend_api|admin_api|demo_api)'{1,2},\s*'{1,2}(nav_v2_[a-z0-9_]+)'{1,2}\)"
)
DB_HEALTH_FUNCTION_MARKER = "create or replace function public.nav_v2_get_rpc_grant_health()"
CATEGORIES = ("frontend_api", "admin_api", "demo_api", "internal_only")
BROWSER_CATEGORIES = ("frontend_api", "admin_api", "demo_api")


def fail(message: str, errors: list[str]) -> None:
    errors.append(message)


def iter_source_files() -> list[Path]:
    files: list[Path] = []
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        files.extend(path for path in root.rglob("*") if path.suffix in {".js", ".ts", ".html"})
    return sorted(set(files))


def iter_browser_files() -> list[Path]:
    if not BROWSER_ROOT.exists():
        return []
    return sorted(path for path in BROWSER_ROOT.rglob("*") if path.suffix in {".js", ".ts", ".html"})


def migration_files() -> list[Path]:
    if not MIGRATIONS_ROOT.exists():
        return []
    return sorted(MIGRATIONS_ROOT.glob("*.sql"))


def latest_db_health_migration() -> Path | None:
    candidates: list[Path] = []
    for path in migration_files():
        text = path.read_text(encoding="utf-8").lower()
        if DB_HEALTH_FUNCTION_MARKER in text:
            candidates.append(path)
    return candidates[-1] if candidates else None


def health_entries_from_base_and_later(base: Path) -> tuple[dict[str, set[str]], list[Path]]:
    entries: dict[str, set[str]] = defaultdict(set)
    sources: list[Path] = []
    include = False
    for path in migration_files():
        if path == base:
            include = True
        if not include:
            continue
        text = path.read_text(encoding="utf-8")
        found = DB_HEALTH_ENTRY_PATTERN.findall(text)
        if not found:
            continue
        sources.append(path)
        for category, name in found:
            entries[category].add(name)
    return entries, sources


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    if not REGISTRY_PATH.exists():
        print(f"Missing RPC registry: {REGISTRY_PATH.relative_to(ROOT)}")
        return 1

    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    if registry.get("schema_version") != 1:
        fail("config/nav-v2-rpc-surface.json: schema_version must be 1", errors)

    classified: dict[str, str] = {}
    for category in CATEGORIES:
        values = registry.get(category)
        if not isinstance(values, list):
            fail(f"RPC registry category {category!r} must be a list", errors)
            continue
        for value in values:
            if not isinstance(value, str) or not re.fullmatch(r"nav_v2_[a-z0-9_]+", value):
                fail(f"Invalid RPC name in {category}: {value!r}", errors)
                continue
            previous = classified.get(value)
            if previous:
                fail(f"RPC {value} is classified twice: {previous} and {category}", errors)
            classified[value] = category

    db_health_migration = latest_db_health_migration()
    health_sources: list[Path] = []
    if db_health_migration is None:
        fail("Missing migration defining nav_v2_get_rpc_grant_health()", errors)
    else:
        health_entries, health_sources = health_entries_from_base_and_later(db_health_migration)

        for category in BROWSER_CATEGORIES:
            registry_names = set(registry.get(category, []))
            health_names = health_entries.get(category, set())
            missing = sorted(registry_names - health_names)
            extra = sorted(health_names - registry_names)
            if missing:
                fail(
                    f"RPC health chain from {db_health_migration.name} is missing {category} entries: "
                    + ", ".join(missing),
                    errors,
                )
            if extra:
                fail(
                    f"RPC health chain from {db_health_migration.name} has unregistered {category} entries: "
                    + ", ".join(extra),
                    errors,
                )

        internal_in_health = sorted(
            set(registry.get("internal_only", []))
            & set().union(*(health_entries.get(category, set()) for category in BROWSER_CATEGORIES))
        )
        if internal_in_health:
            fail(
                "Internal-only RPCs must not appear in browser grant health: "
                + ", ".join(internal_in_health),
                errors,
            )

    calls: dict[str, set[str]] = defaultdict(set)
    for path in iter_source_files():
        text = path.read_text(encoding="utf-8")
        relative = str(path.relative_to(ROOT))
        for pattern in RPC_PATTERNS:
            for match in pattern.finditer(text):
                calls[match.group(1)].add(relative)

    for name, locations in sorted(calls.items()):
        joined = ", ".join(sorted(locations))
        if name.startswith("nav_") and not name.startswith("nav_v2_"):
            fail(f"Legacy RPC {name} is called from Navigator v2 sources: {joined}", errors)
            continue
        category = classified.get(name)
        if category is None:
            fail(f"Unclassified Navigator v2 RPC {name}: {joined}", errors)
        elif category == "internal_only":
            fail(f"Internal-only RPC {name} is called from browser/Edge sources: {joined}", errors)

    direct_tables: dict[str, set[str]] = defaultdict(set)
    for path in iter_browser_files():
        text = path.read_text(encoding="utf-8")
        relative = str(path.relative_to(ROOT))
        for pattern in DIRECT_TABLE_PATTERNS:
            for match in pattern.finditer(text):
                direct_tables[match.group(1)].add(relative)

    for table_name, locations in sorted(direct_tables.items()):
        fail(
            "Browser code must use the curated RPC layer instead of direct table access: "
            f"{table_name} in {', '.join(sorted(locations))}",
            errors,
        )

    used = set(calls)
    for category in BROWSER_CATEGORIES:
        for name in registry.get(category, []):
            if name not in used:
                warnings.append(f"Registered {category} RPC is not found in scanned sources: {name}")

    if warnings:
        print("RPC surface warnings:")
        for warning in warnings:
            print(f"- {warning}")

    if errors:
        print("RPC surface errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    source_label = ", ".join(path.name for path in health_sources) if health_sources else "missing"
    print(
        "Navigator v2 RPC surface passed: "
        f"{len(calls)} calls found, {len(classified)} RPCs classified, "
        f"{len(direct_tables)} direct browser table calls, "
        f"health chain {source_label}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
