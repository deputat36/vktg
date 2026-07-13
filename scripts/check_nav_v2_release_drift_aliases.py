from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import check_nav_v2_release_drift as base

ROOT = Path(__file__).resolve().parents[1]
ALIASES_PATH = ROOT / "config/nav-v2-release-migration-aliases.json"
VERSION_RE = re.compile(r"^\d{14}$")
MIGRATION_RE = re.compile(r"^(\d{14})_[a-z0-9_]+\.sql$")


def migration_paths() -> dict[str, Path]:
    result: dict[str, Path] = {}
    for path in (ROOT / "supabase/migrations").glob("*.sql"):
        match = MIGRATION_RE.match(path.name)
        if match:
            result[match.group(1)] = path
    return result


def validate_aliases(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    paths = migration_paths()
    if config.get("schema_version") != 1:
        errors.append("migration alias schema_version must be 1")
    if config.get("project_ref") != "ofewxuqfjhamgerwzull":
        errors.append("migration alias project_ref drifted")

    live_aliases = config.get("live_aliases") or {}
    approved = config.get("approved_repository_only") or {}
    if not isinstance(live_aliases, dict) or not isinstance(approved, dict):
        errors.append("migration aliases must contain object maps")
        return errors

    for live_version, item in live_aliases.items():
        if not VERSION_RE.fullmatch(live_version):
            errors.append(f"invalid live alias version: {live_version}")
            continue
        canonical = item.get("canonical_migrations") or []
        if not canonical:
            errors.append(f"{live_version}: canonical_migrations is empty")
        for version in canonical:
            if version not in paths:
                errors.append(f"{live_version}: canonical migration {version} is missing")
        if not str(item.get("reason") or "").strip():
            errors.append(f"{live_version}: alias reason is missing")

    for repo_version, item in approved.items():
        if repo_version not in paths:
            errors.append(f"approved repository-only migration {repo_version} is missing")
            continue
        represented = item.get("represented_by_live") or []
        if not represented:
            errors.append(f"{repo_version}: represented_by_live is empty")
        for version in represented:
            if not VERSION_RE.fullmatch(str(version)):
                errors.append(f"{repo_version}: invalid represented live version {version}")
        expected_blob = str(item.get("source_blob_sha") or "")
        actual_blob = base.git_blob_sha(paths[repo_version])
        if expected_blob != actual_blob:
            errors.append(
                f"{repo_version}: canonical source blob drifted ({actual_blob} != {expected_blob})"
            )
        if not str(item.get("reason") or "").strip():
            errors.append(f"{repo_version}: approval reason is missing")

    overlap = set(live_aliases) & set(approved)
    if overlap:
        errors.append(f"versions cannot be both live aliases and repository-only: {sorted(overlap)}")
    return errors


def classify_migrations(
    repo_versions: set[str],
    remote_versions: set[str],
    config: dict[str, Any],
) -> dict[str, list[str]]:
    live_aliases = set((config.get("live_aliases") or {}).keys())
    approved_repo = set((config.get("approved_repository_only") or {}).keys())
    return {
        "unapproved_repository_only": sorted(repo_versions - remote_versions - approved_repo),
        "approved_repository_only": sorted((repo_versions - remote_versions) & approved_repo),
        "unrepresented_remote_only": sorted(remote_versions - repo_versions - live_aliases),
        "represented_remote_aliases": sorted((remote_versions - repo_versions) & live_aliases),
    }


def build_report(
    baseline: dict[str, Any],
    alias_config: dict[str, Any],
    migration_text: str,
    functions_payload: Any,
) -> dict[str, Any]:
    report = base.build_report(baseline, migration_text, functions_payload)
    repo_versions = base.repository_migrations()
    _, remote_versions = base.parse_migration_list(migration_text)
    classified = classify_migrations(repo_versions, remote_versions, alias_config)

    migration_prefixes = (
        "repository migrations missing in production:",
        "production migrations missing in repository:",
        "latest live migration differs from baseline:",
    )
    problems = [
        problem for problem in report["problems"]
        if not problem.startswith(migration_prefixes)
    ]
    if not remote_versions:
        problems.append("Supabase migration list did not contain remote migration versions")
    if classified["unapproved_repository_only"]:
        problems.append(
            "unapproved repository migrations missing in production: "
            + ", ".join(classified["unapproved_repository_only"])
        )
    if classified["unrepresented_remote_only"]:
        problems.append(
            "production migrations have no repository source or approved alias: "
            + ", ".join(classified["unrepresented_remote_only"])
        )

    latest_remote = max(remote_versions) if remote_versions else None
    expected_latest = str(baseline.get("latest_live_migration") or "")
    if latest_remote and latest_remote != expected_latest:
        problems.append(f"latest live migration differs from baseline: {latest_remote} != {expected_latest}")

    live_aliases = alias_config.get("live_aliases") or {}
    approved_repo = alias_config.get("approved_repository_only") or {}
    for version in classified["represented_remote_aliases"]:
        canonical = live_aliases[version].get("canonical_migrations") or []
        if not all(item in repo_versions for item in canonical):
            problems.append(f"live alias {version} has missing canonical source")
    for version in classified["approved_repository_only"]:
        represented = set(approved_repo[version].get("represented_by_live") or [])
        if not represented.issubset(remote_versions):
            missing = sorted(represented - remote_versions)
            problems.append(f"repository-only migration {version} references absent live versions: {missing}")

    report.update(classified)
    report["latest_repository_migration"] = max(repo_versions) if repo_versions else None
    report["latest_remote_migration"] = latest_remote
    report["baseline_latest_live_migration"] = expected_latest
    report["repository_only_migrations"] = classified["unapproved_repository_only"]
    report["remote_only_migrations"] = classified["unrepresented_remote_only"]
    report["problems"] = problems
    report["ok"] = not problems
    return report


def markdown_report(report: dict[str, Any]) -> str:
    text = base.markdown_report(report).rstrip()
    lines = [text, "", "## Approved migration history mappings", ""]
    aliases = report.get("represented_remote_aliases") or []
    approved = report.get("approved_repository_only") or []
    lines.append(
        "- Live split-deploy aliases: " + (", ".join(f"`{item}`" for item in aliases) if aliases else "none")
    )
    lines.append(
        "- Approved repository-only canonical versions: "
        + (", ".join(f"`{item}`" for item in approved) if approved else "none")
    )
    lines.append("- Any migration outside these explicit mappings still fails the workflow.")
    lines.append("")
    return "\n".join(lines)


def self_test() -> None:
    config = {
        "live_aliases": {"20260713160355": {"canonical_migrations": ["20260713193000"]}},
        "approved_repository_only": {
            "20260713193000": {"represented_by_live": ["20260713160355"]}
        },
    }
    result = classify_migrations(
        {"20260713151053", "20260713193000"},
        {"20260713151053", "20260713160355"},
        config,
    )
    assert result["represented_remote_aliases"] == ["20260713160355"]
    assert result["approved_repository_only"] == ["20260713193000"]
    assert not result["unapproved_repository_only"]
    assert not result["unrepresented_remote_only"]
    print("Navigator v2 migration alias classifier self-test passed")


def main() -> int:
    parser = argparse.ArgumentParser()
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

    baseline = base.load_json(ROOT / args.baseline)
    aliases = base.load_json(ROOT / args.aliases)
    errors = base.validate_baseline(baseline, check_sources=True) + validate_aliases(aliases)
    if errors:
        print("Navigator v2 release alias baseline errors:")
        for error in errors:
            print(f"- {error}")
        return 1
    if args.baseline_only:
        print("Navigator v2 release baseline and migration aliases passed")
        return 0
    if not args.migration_list or not args.functions_json:
        parser.error("--migration-list and --functions-json are required for live drift mode")

    report = build_report(
        baseline,
        aliases,
        (ROOT / args.migration_list).read_text(encoding="utf-8"),
        base.load_json(ROOT / args.functions_json),
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
