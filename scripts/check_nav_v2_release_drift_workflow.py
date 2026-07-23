from __future__ import annotations

import json
import sys
from pathlib import Path

import check_nav_v2_release_drift as base
import check_nav_v2_release_drift_aliases as alias_checker
import check_nav_v2_release_drift_shared_project as shared_checker

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/nav-v2-release-drift.yml"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-release-alias-static.yml"
BASELINE = ROOT / "config/nav-v2-release-baseline.json"
ALIASES = ROOT / "config/nav-v2-release-migration-aliases.json"
SHARED_CONTRACT = ROOT / "config/nav-v2-release-drift-shared-project-v1.json"
REPORTER = ROOT / "scripts/check_nav_v2_release_drift.py"
ALIAS_REPORTER = ROOT / "scripts/check_nav_v2_release_drift_aliases.py"
SHARED_REPORTER = ROOT / "scripts/check_nav_v2_release_drift_shared_project.py"
SHARED_TEST = ROOT / "tests/unit/test_nav_v2_release_drift_shared_project_v1.py"
DOC = ROOT / "docs/NAV_V2_RELEASE_DRIFT.md"
SHARED_DOC = ROOT / "docs/NAV_V2_RELEASE_DRIFT_SHARED_PROJECT_V1_2026-07-23.md"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    errors: list[str] = []
    required_paths = (
        WORKFLOW,
        STATIC_WORKFLOW,
        BASELINE,
        ALIASES,
        SHARED_CONTRACT,
        REPORTER,
        ALIAS_REPORTER,
        SHARED_REPORTER,
        SHARED_TEST,
        DOC,
        SHARED_DOC,
    )
    for path in required_paths:
        if not path.is_file():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    baseline = load(BASELINE)
    aliases = load(ALIASES)
    shared_contract = load(SHARED_CONTRACT)
    errors.extend(base.validate_baseline(baseline, check_sources=True))
    errors.extend(alias_checker.validate_aliases(aliases))
    errors.extend(shared_checker.validate_contract(shared_contract, baseline, aliases))

    if baseline.get("project_ref") != "ofewxuqfjhamgerwzull":
        errors.append("release baseline project_ref drifted")
    if baseline.get("environment") != "navigator-production-readonly":
        errors.append("release baseline environment drifted")
    if baseline.get("latest_live_migration") != "20260716063401":
        errors.append("release baseline latest Navigator migration drifted")
    if set((baseline.get("edge_functions") or {}).keys()) != {"nav-invite-user", "nav-v2-deal-api"}:
        errors.append("release baseline function set drifted")

    live_entry = (aliases.get("live_aliases") or {}).get("20260716063401") or {}
    canonical_entry = (aliases.get("approved_repository_only") or {}).get("20260716064500") or {}
    if live_entry.get("canonical_migrations") != ["20260716064500"]:
        errors.append("mortgage broker live migration alias drifted")
    if canonical_entry.get("represented_by_live") != ["20260716063401"]:
        errors.append("mortgage broker canonical reverse mapping drifted")
    if canonical_entry.get("source_blob_sha") != "93687e0aed8d88d604e31a730ba8c9f8c806b94e":
        errors.append("mortgage broker canonical source blob drifted")

    client_entry = (aliases.get("approved_repository_only") or {}).get("20260715224500") or {}
    if client_entry.get("represented_by_live") != ["20260715203158"]:
        errors.append("client minimization canonical reverse mapping drifted")
    if client_entry.get("source_blob_sha") != "a99c3dbe1cb97a45ccb40dad4841087602aafd80":
        errors.append("client minimization canonical source blob drifted")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "workflow_dispatch:",
        "environment: navigator-production-readonly",
        "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}",
        "SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}",
        "supabase/setup-cli@v3.0.0",
        "supabase migration list > artifacts/migration-list.txt",
        "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/functions",
        "python3 scripts/check_nav_v2_release_drift_shared_project.py --self-test",
        "python3 scripts/check_nav_v2_release_drift_shared_project.py --baseline-only",
        "python3 -m unittest tests/unit/test_nav_v2_release_drift_shared_project_v1.py",
        "python3 scripts/check_nav_v2_release_drift_shared_project.py \\",
        "actions/upload-artifact@v4",
        "Fail when drift is detected",
    ), WORKFLOW.name, errors)

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    require(static_workflow, (
        "config/nav-v2-release-drift-shared-project-v1.json",
        "scripts/check_nav_v2_release_drift_shared_project.py",
        "tests/unit/test_nav_v2_release_drift_shared_project_v1.py",
        "python3 scripts/check_nav_v2_release_drift_workflow.py",
    ), STATIC_WORKFLOW.name, errors)

    forbidden = (
        "supabase db push",
        "supabase functions deploy",
        "supabase migration repair",
        "supabase secrets set",
        "curl --request post",
        "curl -x post",
        "contents: write",
    )
    lowered = workflow.lower()
    for marker in forbidden:
        if marker in lowered:
            errors.append(f"{WORKFLOW.name}: read-only workflow contains forbidden mutation command {marker!r}")

    shared_reporter = SHARED_REPORTER.read_text(encoding="utf-8")
    require(shared_reporter, (
        "def validate_contract",
        "def apply_shared_project_semantics",
        "required_present_not_global_latest",
        "approved Navigator baseline migration is absent from production",
        "later_remote_migrations",
        "--allow-drift",
    ), SHARED_REPORTER.name, errors)

    shared_test = SHARED_TEST.read_text(encoding="utf-8")
    require(shared_test, (
        "test_later_repository_known_migration_does_not_invalidate_navigator_baseline",
        "test_missing_navigator_baseline_remains_blocking",
        "test_unknown_remote_drift_is_preserved",
        "test_repository_contract_matches_baseline_and_aliases",
    ), SHARED_TEST.name, errors)

    doc = DOC.read_text(encoding="utf-8")
    require(doc, (
        "navigator-production-readonly",
        "без автоматического deploy",
        "required_present_not_global_latest",
        "config/nav-v2-release-drift-shared-project-v1.json",
        "release-drift.json",
        "release-drift.md",
    ), DOC.name, errors)

    shared_doc = SHARED_DOC.read_text(encoding="utf-8")
    require(shared_doc, (
        "required_present_not_global_latest",
        "20260716063401",
        "20260716064500",
        "93687e0aed8d88d604e31a730ba8c9f8c806b94e",
        "неизвестные remote-only migrations",
        "shared_project_release_drift_false_positive_removed_repository_only",
    ), SHARED_DOC.name, errors)

    if errors:
        print("Navigator v2 release drift workflow errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 release drift workflow passed: read-only gate, source-backed aliases, "
        "shared-project baseline semantics and Edge baseline checked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
