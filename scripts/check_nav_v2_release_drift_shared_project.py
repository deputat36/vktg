from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import check_nav_v2_release_drift as base
import check_nav_v2_release_drift_aliases as aliases

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config/nav-v2-release-drift-shared-project-v1.json"
BASELINE_PATH = ROOT / "config/nav-v2-release-baseline.json"
ALIASES_PATH = ROOT / "config/nav-v2-release-migration-aliases.json"

LATEST_MISMATCH_PREFIX = "latest live migration differs from baseline:"
BASELINE_MISSING_PREFIX = "approved Navigator baseline migration is absent from production:"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_contract(
    contract: dict[str, Any],
    baseline: dict[str, Any],
    alias_config: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    if contract.get("schema_version") != 1:
        errors.append("shared-project contract schema_version must be 1")
    if contract.get("status") != "repository_only_shared_supabase_release_drift_contract":
        errors.append("shared-project contract status drifted")
    if contract.get("project_ref") != "ofewxuqfjhamgerwzull":
        errors.append("shared-project contract project_ref drifted")
    if contract.get("shared_supabase_project") is not True:
        errors.append("shared_supabase_project must be true")
    if contract.get("navigator_baseline_semantics") != "required_present_not_global_latest":
        errors.append("Navigator baseline semantics must require presence instead of global latest equality")
    if contract.get("canonical_baseline_path") != "config/nav-v2-release-baseline.json":
        errors.append("canonical baseline path drifted")
    if contract.get("canonical_aliases_path") != "config/nav-v2-release-migration-aliases.json":
        errors.append("canonical aliases path drifted")
    if contract.get("current_navigator_live_migration") != baseline.get("latest_live_migration"):
        errors.append("contract Navigator live migration differs from baseline")

    live_version = str(contract.get("current_navigator_live_migration") or "")
    canonical_version = str(contract.get("canonical_repository_migration") or "")
    live_entry = (alias_config.get("live_aliases") or {}).get(live_version) or {}
    canonical_entry = (alias_config.get("approved_repository_only") or {}).get(canonical_version) or {}
    if live_entry.get("canonical_migrations") != [canonical_version]:
        errors.append("shared-project contract live-to-canonical migration mapping drifted")
    if canonical_entry.get("represented_by_live") != [live_version]:
        errors.append("shared-project contract canonical-to-live migration mapping drifted")
    if canonical_entry.get("source_blob_sha") != contract.get("canonical_repository_blob_sha"):
        errors.append("shared-project contract canonical migration blob drifted")

    if contract.get("later_repository_known_migrations_allowed") is not True:
        errors.append("later repository-known migrations must be allowed")
    if contract.get("unknown_remote_migrations_block") is not True:
        errors.append("unknown remote migrations must remain blocking")
    if contract.get("edge_function_baseline_unchanged") is not True:
        errors.append("Edge Function baseline must remain unchanged")

    boundaries = contract.get("boundaries") or {}
    if boundaries.get("read_only") is not True:
        errors.append("shared-project release drift evaluator must remain read-only")
    for key in (
        "production_schema_changed",
        "production_data_changed",
        "production_auth_changed",
        "edge_function_changed",
        "leader_schema_changed",
        "cost_confirmation_requested",
        "preview_branch_created",
    ):
        if boundaries.get(key) is not False:
            errors.append(f"boundary flag must be false: {key}")
    return errors


def apply_shared_project_semantics(
    report: dict[str, Any],
    baseline: dict[str, Any],
    migration_text: str,
) -> dict[str, Any]:
    _, remote_versions = base.parse_migration_list(migration_text)
    baseline_version = str(baseline.get("latest_live_migration") or "")

    problems = [
        problem
        for problem in report.get("problems") or []
        if not str(problem).startswith(LATEST_MISMATCH_PREFIX)
        and not str(problem).startswith(BASELINE_MISSING_PREFIX)
    ]

    baseline_present = baseline_version in remote_versions
    if remote_versions and not baseline_present:
        problems.append(f"{BASELINE_MISSING_PREFIX} {baseline_version}")

    later_remote = sorted(version for version in remote_versions if version > baseline_version)
    report["approved_navigator_baseline_migration"] = baseline_version
    report["approved_navigator_baseline_present"] = baseline_present
    report["later_remote_migrations"] = later_remote
    report["shared_project_baseline_semantics"] = "required_present_not_global_latest"
    report["problems"] = problems
    report["ok"] = not problems
    return report


def build_report(
    baseline: dict[str, Any],
    alias_config: dict[str, Any],
    migration_text: str,
    functions_payload: Any,
) -> dict[str, Any]:
    report = aliases.build_report(baseline, alias_config, migration_text, functions_payload)
    return apply_shared_project_semantics(report, baseline, migration_text)


def markdown_report(report: dict[str, Any]) -> str:
    text = aliases.markdown_report(report).rstrip()
    later = report.get("later_remote_migrations") or []
    lines = [
        text,
        "",
        "## Shared Supabase project baseline semantics",
        "",
        f"- Approved Navigator migration: `{report.get('approved_navigator_baseline_migration')}`.",
        "- Approved Navigator migration present in production: "
        + str(bool(report.get("approved_navigator_baseline_present"))).lower()
        + ".",
        f"- Global latest remote migration: `{report.get('latest_remote_migration') or 'n/a'}`.",
        "- Later repository-known migrations: "
        + (", ".join(f"`{item}`" for item in later) if later else "none")
        + ".",
        "- Later migrations from the shared project do not invalidate the Navigator baseline merely by being newer.",
        "- Unknown remote migrations, missing repository sources, Edge drift and a missing Navigator baseline remain blocking.",
        "",
    ]
    return "\n".join(lines)


def self_test() -> None:
    baseline = {"latest_live_migration": "20260716063401"}
    report = {
        "problems": [
            "latest live migration differs from baseline: 20260721122333 != 20260716063401"
        ],
        "ok": False,
        "latest_remote_migration": "20260721122333",
    }
    migration_text = """
      LOCAL          | REMOTE         | TIME (UTC)
      20260716064500 | 20260716063401 | 2026-07-16
      20260721122333 | 20260721122333 | 2026-07-21
    """
    adjusted = apply_shared_project_semantics(report, baseline, migration_text)
    assert adjusted["ok"] is True
    assert adjusted["approved_navigator_baseline_present"] is True
    assert adjusted["later_remote_migrations"] == ["20260721122333"]
    assert not adjusted["problems"]

    missing_report = {
        "problems": [
            "latest live migration differs from baseline: 20260721122333 != 20260716063401"
        ],
        "ok": False,
        "latest_remote_migration": "20260721122333",
    }
    missing_text = """
      LOCAL          | REMOTE         | TIME (UTC)
      20260721122333 | 20260721122333 | 2026-07-21
    """
    missing = apply_shared_project_semantics(missing_report, baseline, missing_text)
    assert missing["ok"] is False
    assert missing["approved_navigator_baseline_present"] is False
    assert missing["problems"] == [
        "approved Navigator baseline migration is absent from production: 20260716063401"
    ]

    preserved_report = {
        "problems": [
            "latest live migration differs from baseline: 20260721122333 != 20260716063401",
            "production migrations have no repository source or approved alias: 20260722000000",
        ],
        "ok": False,
        "latest_remote_migration": "20260721122333",
    }
    preserved = apply_shared_project_semantics(preserved_report, baseline, migration_text)
    assert preserved["ok"] is False
    assert preserved["problems"] == [
        "production migrations have no repository source or approved alias: 20260722000000"
    ]
    print("Navigator v2 shared-project release drift self-test passed")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", default="config/nav-v2-release-drift-shared-project-v1.json")
    parser.add_argument("--baseline", default="config/nav-v2-release-baseline.json")
    parser.add_argument("--aliases", default="config/nav-v2-release-migration-aliases.json")
    parser.add_argument("--baseline-only", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--migration-list")
    parser.add_argument("--functions-json")
    parser.add_argument("--json-output")
    parser.add_argument("--markdown-output")
    parser.add_argument("--allow-drift", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    contract = load_json(ROOT / args.contract)
    baseline = load_json(ROOT / args.baseline)
    alias_config = load_json(ROOT / args.aliases)
    errors = (
        base.validate_baseline(baseline, check_sources=True)
        + aliases.validate_aliases(alias_config)
        + validate_contract(contract, baseline, alias_config)
    )
    if errors:
        print("Navigator v2 shared-project release drift contract errors:")
        for error in errors:
            print(f"- {error}")
        return 1
    if args.baseline_only:
        print("Navigator v2 shared-project release drift baseline passed")
        return 0
    if not args.migration_list or not args.functions_json:
        parser.error("--migration-list and --functions-json are required for live drift mode")

    report = build_report(
        baseline,
        alias_config,
        (ROOT / args.migration_list).read_text(encoding="utf-8"),
        load_json(ROOT / args.functions_json),
    )
    markdown = markdown_report(report)
    print(markdown)

    if args.json_output:
        output = ROOT / args.json_output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.markdown_output:
        output = ROOT / args.markdown_output
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(markdown, encoding="utf-8")
    return 0 if report["ok"] or args.allow_drift else 1


if __name__ == "__main__":
    sys.exit(main())
