from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config/nav-v2-build.json"
IMPORTMAP_RE = re.compile(
    r'<script\s+type=["\']importmap["\']\s*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


def main() -> int:
    errors: list[str] = []

    if not CONFIG_PATH.exists():
        print("Missing config/nav-v2-build.json")
        return 1

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if config.get("schema_version") != 1:
        errors.append("nav-v2-build.json: schema_version must be 1")

    build_id = str(config.get("build_id") or "").strip()
    if not re.fullmatch(r"\d{8}-\d{2}", build_id):
        errors.append("nav-v2-build.json: build_id must match YYYYMMDD-NN")

    shared_rel = str(config.get("shared_module") or "")
    shared_path = ROOT / shared_rel
    if not shared_path.exists():
        errors.append(f"Shared Navigator module is missing: {shared_rel}")
    else:
        shared_source = shared_path.read_text(encoding="utf-8")
        marker = f"export const NAV_V2_BUILD_ID = '{build_id}';"
        if marker not in shared_source:
            errors.append(f"{shared_rel}: missing canonical build marker {marker!r}")
        if "document.documentElement.dataset.navV2Build = NAV_V2_BUILD_ID" not in shared_source:
            errors.append(f"{shared_rel}: build marker is not exposed on documentElement")
        guard_query = f"./auth-storage-guard-v2.js?v={build_id}"
        if guard_query not in shared_source:
            errors.append(f"{shared_rel}: missing storage guard cache-bust {guard_query}")

    target = f"./{shared_rel}?v={build_id}"
    short_specifiers = ["./supabase-v2.js", *(config.get("legacy_specifiers") or [])]
    required_specifiers: list[str] = []
    for specifier in short_specifiers:
        required_specifiers.append(specifier)
        required_specifiers.append(
            f"./assets/js/nav-v2/{str(specifier).removeprefix('./')}"
        )

    checked_pages = 0
    for page_path in sorted(ROOT.glob("*-v2.html")):
        source = page_path.read_text(encoding="utf-8")
        if '"./supabase-v2.js"' not in source:
            continue
        checked_pages += 1
        match = IMPORTMAP_RE.search(source)
        if not match:
            errors.append(f"{page_path.name}: missing importmap")
            continue
        try:
            importmap = json.loads(match.group(1))
        except json.JSONDecodeError as error:
            errors.append(f"{page_path.name}: invalid importmap JSON: {error}")
            continue
        imports = (importmap.get("scopes") or {}).get("./assets/js/nav-v2/", {})
        for specifier in required_specifiers:
            if imports.get(specifier) != target:
                errors.append(
                    f"{page_path.name}: {specifier} must resolve to {target}, "
                    f"got {imports.get(specifier)!r}"
                )

    minimum_pages = int(config.get("minimum_importmap_pages") or 0)
    if checked_pages < minimum_pages:
        errors.append(
            f"Only {checked_pages} Navigator importmap pages found; expected at least {minimum_pages}"
        )

    diagnostic_page = ROOT / str(config.get("diagnostic_page") or "")
    diagnostic_module = ROOT / str(config.get("diagnostic_module") or "")
    if not diagnostic_page.exists() or not diagnostic_module.exists():
        errors.append("Navigator diagnostic page/module configured for build marker is missing")
    else:
        page_source = diagnostic_page.read_text(encoding="utf-8")
        module_source = diagnostic_module.read_text(encoding="utf-8")
        module_query = f"nav-system-check-v2.js?v={build_id}"
        if module_query not in page_source:
            errors.append(f"{diagnostic_page.name}: missing diagnostic cache-bust {module_query}")
        if "NAV_V2_BUILD_ID" not in module_source or "Сборка Navigator v2" not in module_source:
            errors.append(f"{diagnostic_module.name}: build id is not included in diagnostics")

    if errors:
        print("Navigator v2 build version errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        f"Navigator v2 build version passed: {checked_pages} pages use build {build_id} "
        f"with {len(required_specifiers)} scoped mappings"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
