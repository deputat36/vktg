#!/usr/bin/env python3
"""Atomically bump the shared Navigator runtime build and normalized importmap keys."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BUILD_CONFIG_PATH = ROOT / "config/nav-v2-build.json"
PUBLIC_ATTESTATION_PATH = ROOT / "config/nav-v2-public-build-attestation-v1.json"
SHARED_MODULE_PATH = ROOT / "assets/js/nav-v2/supabase-v2.js"
IMPORTMAP_RE = re.compile(
    r'(<script\s+type=["\']importmap["\']\s*>)(.*?)(</script>)',
    re.IGNORECASE | re.DOTALL,
)
BUILD_RE = re.compile(r"\d{8}-\d{2}")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def render_importmap_block(prefix: str, value: dict[str, Any], suffix: str) -> str:
    rendered = json.dumps(value, ensure_ascii=False, indent=2)
    body = "\n" + "\n".join(f"    {line}" for line in rendered.splitlines()) + "\n  "
    return prefix + body + suffix


def replace_exact(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one occurrence of {old!r}, found {count}")
    return source.replace(old, new, 1)


def update_page(path: Path, config: dict[str, Any], target: str) -> bool:
    source = path.read_text(encoding="utf-8")
    if '"./supabase-v2.js"' not in source:
        return False

    match = IMPORTMAP_RE.search(source)
    if not match:
        raise RuntimeError(f"{path.name}: missing importmap")
    value = json.loads(match.group(2))
    imports = (value.get("scopes") or {}).get("./assets/js/nav-v2/")
    if not isinstance(imports, dict):
        raise RuntimeError(f"{path.name}: missing Navigator importmap scope")

    specifiers = ["./supabase-v2.js", *(config.get("legacy_specifiers") or [])]
    for specifier in specifiers:
        imports[specifier] = target
        normalized = f"./assets/js/nav-v2/{specifier.removeprefix('./')}"
        imports[normalized] = target

    updated = source[: match.start()] + render_importmap_block(
        match.group(1), value, match.group(3)
    ) + source[match.end() :]
    path.write_text(updated, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-build", required=True)
    parser.add_argument("--to-build", required=True)
    args = parser.parse_args()

    if not BUILD_RE.fullmatch(args.from_build) or not BUILD_RE.fullmatch(args.to_build):
        raise RuntimeError("build IDs must match YYYYMMDD-NN")
    if args.from_build == args.to_build:
        raise RuntimeError("from-build and to-build must differ")

    build = load_json(BUILD_CONFIG_PATH)
    if build.get("build_id") != args.from_build:
        raise RuntimeError(
            f"canonical build mismatch: expected {args.from_build}, got {build.get('build_id')}"
        )

    target = f"./{build['shared_module']}?v={args.to_build}"
    changed_pages: list[str] = []
    for path in sorted(ROOT.glob("*-v2.html")):
        if update_page(path, build, target):
            changed_pages.append(path.name)

    minimum = int(build.get("minimum_importmap_pages") or 0)
    if len(changed_pages) < minimum:
        raise RuntimeError(
            f"only {len(changed_pages)} importmap pages changed; expected at least {minimum}"
        )

    diagnostic_page = ROOT / str(build.get("diagnostic_page") or "")
    diagnostic_source = diagnostic_page.read_text(encoding="utf-8")
    diagnostic_source = replace_exact(
        diagnostic_source,
        f"nav-system-check-v2.js?v={args.from_build}",
        f"nav-system-check-v2.js?v={args.to_build}",
        diagnostic_page.name,
    )
    diagnostic_page.write_text(diagnostic_source, encoding="utf-8")

    shared_source = SHARED_MODULE_PATH.read_text(encoding="utf-8")
    shared_source = replace_exact(
        shared_source,
        f"export const NAV_V2_BUILD_ID = '{args.from_build}';",
        f"export const NAV_V2_BUILD_ID = '{args.to_build}';",
        SHARED_MODULE_PATH.name,
    )
    shared_source = replace_exact(
        shared_source,
        f"./auth-storage-guard-v2.js?v={args.from_build}",
        f"./auth-storage-guard-v2.js?v={args.to_build}",
        SHARED_MODULE_PATH.name,
    )
    SHARED_MODULE_PATH.write_text(shared_source, encoding="utf-8")

    build["build_id"] = args.to_build
    write_json(BUILD_CONFIG_PATH, build)

    attestation = load_json(PUBLIC_ATTESTATION_PATH)
    previous_result = attestation.get("result")
    previous_evidence = attestation.get("evidence")
    if previous_result or previous_evidence:
        attestation["previous_successful_attestation"] = {
            "result": previous_result,
            "evidence": previous_evidence,
        }
    attestation["result"] = {
        "decision": "public_build_attestation_contract_prepared_requires_successful_live_ci",
        "live_public_build_verified": False,
        "runtime_rollout_completed": False,
        "authenticated_role_e2e_completed": False,
        "live_browser_storage_failure_verified": False,
        "evidence_run_id": None,
        "evidence_commit_sha": None,
    }
    attestation.pop("evidence", None)
    attestation["pending_build_id"] = args.to_build
    write_json(PUBLIC_ATTESTATION_PATH, attestation)

    print(
        json.dumps(
            {
                "from_build": args.from_build,
                "to_build": args.to_build,
                "changed_pages": changed_pages,
                "changed_page_count": len(changed_pages),
                "target": target,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"Navigator v2 build bump failed: {error}", file=sys.stderr)
        sys.exit(1)
