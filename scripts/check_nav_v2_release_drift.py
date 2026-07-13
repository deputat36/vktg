from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_RE = re.compile(r"^(\d{14})_[a-z0-9_]+\.sql$")
VERSION_RE = re.compile(r"\b\d{14}\b")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def git_blob_sha(path: Path) -> str:
    completed = subprocess.run(
        ["git", "hash-object", str(path)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    return completed.stdout.strip()


def repository_migrations() -> set[str]:
    result: set[str] = set()
    for path in (ROOT / "supabase" / "migrations").glob("*.sql"):
        match = MIGRATION_RE.match(path.name)
        if match:
            result.add(match.group(1))
    return result


def parse_migration_list(text: str) -> tuple[set[str], set[str]]:
    local: set[str] = set()
    remote: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or "|" not in line:
            continue
        columns = [column.strip() for column in line.split("|")]
        if len(columns) < 2:
            continue
        local_match = VERSION_RE.search(columns[0])
        remote_match = VERSION_RE.search(columns[1])
        if local_match:
            local.add(local_match.group(0))
        if remote_match:
            remote.add(remote_match.group(0))
    return local, remote


def normalize_functions(payload: Any) -> dict[str, dict[str, Any]]:
    if isinstance(payload, dict):
        for key in ("functions", "result", "data"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
    if not isinstance(payload, list):
        raise ValueError("Edge Functions response must be a JSON array or contain a list field")

    normalized: dict[str, dict[str, Any]] = {}
    for item in payload:
        if not isinstance(item, dict):
            continue
        slug = str(item.get("slug") or item.get("name") or "").strip()
        if not slug:
            continue
        normalized[slug] = {
            "version": int(item.get("version") or 0),
            "status": str(item.get("status") or "").upper(),
            "verify_jwt": bool(item.get("verify_jwt")),
            "ezbr_sha256": str(item.get("ezbr_sha256") or "").lower(),
        }
    return normalized


def validate_baseline(baseline: dict[str, Any], check_sources: bool = True) -> list[str]:
    errors: list[str] = []
    if baseline.get("schema_version") != 1:
        errors.append("release baseline schema_version must be 1")
    if baseline.get("project_ref") != "ofewxuqfjhamgerwzull":
        errors.append("release baseline project_ref drifted")
    if baseline.get("environment") != "navigator-production-readonly":
        errors.append("release baseline environment must be navigator-production-readonly")
    if not re.fullmatch(r"\d{14}", str(baseline.get("latest_live_migration") or "")):
        errors.append("latest_live_migration must be a 14-digit version")

    functions = baseline.get("edge_functions")
    required = {"nav-invite-user", "nav-v2-deal-api"}
    if not isinstance(functions, dict) or set(functions) != required:
        errors.append("release baseline must contain exactly the two Navigator Edge Functions")
        return errors

    for slug in sorted(required):
        item = functions.get(slug) or {}
        source_path = ROOT / str(item.get("source_path") or "")
        if not source_path.is_file():
            errors.append(f"{slug}: source file is missing")
            continue
        if item.get("verify_jwt") is not True:
            errors.append(f"{slug}: baseline verify_jwt must be true")
        if str(item.get("status") or "").upper() != "ACTIVE":
            errors.append(f"{slug}: baseline status must be ACTIVE")
        if int(item.get("version") or 0) < 1:
            errors.append(f"{slug}: baseline version must be positive")
        if not re.fullmatch(r"[0-9a-f]{64}", str(item.get("ezbr_sha256") or "")):
            errors.append(f"{slug}: invalid live bundle SHA-256")
        if not re.fullmatch(r"[0-9a-f]{40}", str(item.get("source_blob_sha") or "")):
            errors.append(f"{slug}: invalid source Git blob SHA")
        elif check_sources:
            actual_blob = git_blob_sha(source_path)
            if actual_blob != item["source_blob_sha"]:
                errors.append(
                    f"{slug}: repository source differs from approved release baseline "
                    f"({actual_blob} != {item['source_blob_sha']})"
                )
    return errors


def build_report(
    baseline: dict[str, Any],
    migration_text: str,
    functions_payload: Any,
) -> dict[str, Any]:
    repo_versions = repository_migrations()
    cli_local, remote_versions = parse_migration_list(migration_text)
    live_functions = normalize_functions(functions_payload)
    problems: list[str] = []

    if not remote_versions:
        problems.append("Supabase migration list did not contain remote migration versions")
    if cli_local and cli_local != repo_versions:
        problems.append("CLI local migration set differs from repository migrations")

    repo_only = sorted(repo_versions - remote_versions)
    remote_only = sorted(remote_versions - repo_versions)
    if repo_only:
        problems.append(f"repository migrations missing in production: {', '.join(repo_only)}")
    if remote_only:
        problems.append(f"production migrations missing in repository: {', '.join(remote_only)}")

    latest_repo = max(repo_versions) if repo_versions else None
    latest_remote = max(remote_versions) if remote_versions else None
    expected_latest = str(baseline.get("latest_live_migration") or "")
    if latest_remote and latest_remote != expected_latest:
        problems.append(f"latest live migration differs from baseline: {latest_remote} != {expected_latest}")

    edge_items: list[dict[str, Any]] = []
    expected_functions = baseline["edge_functions"]
    for slug, expected in expected_functions.items():
        live = live_functions.get(slug)
        source_path = ROOT / expected["source_path"]
        source_blob = git_blob_sha(source_path)
        item_problems: list[str] = []
        if not live:
            item_problems.append("function is absent from live response")
        else:
            for key in ("version", "status", "verify_jwt", "ezbr_sha256"):
                expected_value = expected[key]
                live_value = live[key]
                if live_value != expected_value:
                    item_problems.append(f"{key}: live={live_value!r}, baseline={expected_value!r}")
        if source_blob != expected["source_blob_sha"]:
            item_problems.append(
                f"repository source blob={source_blob}, baseline={expected['source_blob_sha']}"
            )
        if item_problems:
            problems.extend(f"{slug}: {problem}" for problem in item_problems)
        edge_items.append(
            {
                "slug": slug,
                "source_path": expected["source_path"],
                "source_blob_sha": source_blob,
                "baseline": expected,
                "live": live,
                "ok": not item_problems,
                "problems": item_problems,
            }
        )

    extra_nav_functions = sorted(
        slug for slug in live_functions
        if (slug.startswith("nav-") or slug.startswith("nav-v2-")) and slug not in expected_functions
    )
    if extra_nav_functions:
        problems.append(f"unregistered live Navigator Edge Functions: {', '.join(extra_nav_functions)}")

    return {
        "ok": not problems,
        "project_ref": baseline["project_ref"],
        "latest_repository_migration": latest_repo,
        "latest_remote_migration": latest_remote,
        "baseline_latest_live_migration": expected_latest,
        "repository_only_migrations": repo_only,
        "remote_only_migrations": remote_only,
        "edge_functions": edge_items,
        "extra_navigator_edge_functions": extra_nav_functions,
        "problems": problems,
    }


def markdown_report(report: dict[str, Any]) -> str:
    state = "PASS" if report["ok"] else "DRIFT"
    lines = [
        f"# Navigator v2 release drift report — {state}",
        "",
        f"- Project: `{report['project_ref']}`",
        f"- Repository migration: `{report['latest_repository_migration'] or 'n/a'}`",
        f"- Live migration: `{report['latest_remote_migration'] or 'n/a'}`",
        f"- Approved live migration baseline: `{report['baseline_latest_live_migration']}`",
        "",
        "## Edge Functions",
        "",
        "| Function | Live version | JWT | Status | Bundle hash | Source baseline | Result |",
        "|---|---:|---|---|---|---|---|",
    ]
    for item in report["edge_functions"]:
        live = item.get("live") or {}
        baseline = item["baseline"]
        lines.append(
            "| `{slug}` | {version} | {jwt} | {status} | `{bundle}` | `{source}` | {result} |".format(
                slug=item["slug"],
                version=live.get("version", "missing"),
                jwt=str(live.get("verify_jwt", "missing")).lower(),
                status=live.get("status", "missing"),
                bundle=str(live.get("ezbr_sha256") or "missing")[:12],
                source=str(baseline.get("source_blob_sha") or "missing")[:12],
                result="PASS" if item["ok"] else "DRIFT",
            )
        )

    lines.extend(["", "## Result", ""])
    if report["problems"]:
        lines.extend(f"- {problem}" for problem in report["problems"])
    else:
        lines.append("- Repository migrations, live migration history and both Navigator Edge Functions match the approved baseline.")
    lines.append("")
    return "\n".join(lines)


def self_test() -> None:
    migration_text = """
      LOCAL          | REMOTE         | TIME (UTC)
      20260712143253 | 20260712143253 | 2026-07-12
      20260713091921 | 20260713091921 | 2026-07-13
                     | 20260713093000 | 2026-07-13
    """
    local, remote = parse_migration_list(migration_text)
    assert local == {"20260712143253", "20260713091921"}
    assert remote == {"20260712143253", "20260713091921", "20260713093000"}

    normalized = normalize_functions({"functions": [{
        "slug": "nav-invite-user",
        "version": 10,
        "status": "active",
        "verify_jwt": True,
        "ezbr_sha256": "a" * 64,
    }]})
    assert normalized["nav-invite-user"]["status"] == "ACTIVE"
    assert normalized["nav-invite-user"]["version"] == 10
    print("Navigator v2 release drift parser self-test passed")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", default="config/nav-v2-release-baseline.json")
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

    baseline_path = ROOT / args.baseline
    baseline = load_json(baseline_path)
    baseline_errors = validate_baseline(baseline, check_sources=True)
    if baseline_errors:
        print("Navigator v2 release baseline errors:")
        for error in baseline_errors:
            print(f"- {error}")
        return 1
    if args.baseline_only:
        print("Navigator v2 release baseline passed")
        return 0

    if not args.migration_list or not args.functions_json:
        parser.error("--migration-list and --functions-json are required for live drift mode")

    report = build_report(
        baseline,
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
