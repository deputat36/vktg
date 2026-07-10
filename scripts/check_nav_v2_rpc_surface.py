from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "config/nav-v2-rpc-surface.json"
SCAN_ROOTS = (
    ROOT / "assets/js/nav-v2",
    ROOT / "supabase/functions/nav-v2-deal-api",
    ROOT / "supabase/functions/nav-invite-user",
)

RPC_PATTERNS = (
    re.compile(r"\brpc\s*\(\s*['\"](nav(?:_v2)?_[a-z0-9_]+)['\"]"),
    re.compile(r"/rest/v1/rpc/(nav(?:_v2)?_[a-z0-9_]+)"),
)
CATEGORIES = ("frontend_api", "admin_api", "demo_api", "internal_only")


def fail(message: str, errors: list[str]) -> None:
    errors.append(message)


def iter_source_files() -> list[Path]:
    files: list[Path] = []
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        files.extend(path for path in root.rglob("*") if path.suffix in {".js", ".ts", ".html"})
    return sorted(set(files))


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

    used = set(calls)
    for category in ("frontend_api", "admin_api", "demo_api"):
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

    print(
        "Navigator v2 RPC surface passed: "
        f"{len(calls)} calls found, {len(classified)} RPCs classified"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
