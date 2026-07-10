from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config/nav-v2-module-budget.json"
MODULE_RE = re.compile(
    r"<script\b(?=[^>]*\btype=[\"']module[\"'])(?=[^>]*\bsrc=[\"']([^\"']+)[\"'])[^>]*>",
    re.IGNORECASE,
)


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    if not CONFIG_PATH.exists():
        print(f"Missing module budget: {CONFIG_PATH.relative_to(ROOT)}")
        return 1

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if config.get("schema_version") != 1:
        errors.append("config/nav-v2-module-budget.json: schema_version must be 1")

    pages = config.get("pages")
    policy = config.get("policy", {})
    if not isinstance(pages, dict) or not pages:
        errors.append("Module budget must contain a non-empty pages object")
        pages = {}

    for page_name, page_config in sorted(pages.items()):
        page_path = ROOT / page_name
        if not page_path.exists():
            errors.append(f"Budgeted page is missing: {page_name}")
            continue
        if not isinstance(page_config, dict) or not isinstance(page_config.get("max_modules"), int):
            errors.append(f"Invalid max_modules for {page_name}")
            continue

        source = page_path.read_text(encoding="utf-8")
        module_sources = MODULE_RE.findall(source)
        max_modules = page_config["max_modules"]

        if len(module_sources) > max_modules:
            errors.append(
                f"{page_name}: {len(module_sources)} module scripts exceed budget {max_modules}. "
                "Consolidate modules or update the architecture budget in the same reviewed change."
            )
        elif len(module_sources) < max_modules:
            warnings.append(
                f"{page_name}: module count reduced from budget {max_modules} to {len(module_sources)}; "
                "lower the budget after confirming the consolidation."
            )

        normalized_sources = [urlsplit(src).path for src in module_sources]
        if policy.get("forbid_duplicate_sources", True):
            duplicates = sorted(name for name, count in Counter(normalized_sources).items() if count > 1)
            for duplicate in duplicates:
                errors.append(f"{page_name}: duplicate module source {duplicate}")

        if policy.get("require_cache_bust", True):
            for src in module_sources:
                parsed = urlsplit(src)
                if parsed.path.startswith("./assets/js/nav-v2/") and not parsed.query:
                    errors.append(f"{page_name}: module has no cache-bust query: {src}")

    if warnings:
        print("Module budget warnings:")
        for warning in warnings:
            print(f"- {warning}")

    if errors:
        print("Module budget errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Navigator v2 module budget passed: {len(pages)} pages checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
