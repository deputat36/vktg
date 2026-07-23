from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/nav-v2-release-drift.yml"
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


def main() -> int:
    errors: list[str] = []
    for path in (
        WORKFLOW,
        BASELINE,
        ALIASES,
        SHARED_CONTRACT,
        REPORTER,
        ALIAS_REPORTER,
        SHARED_REPORTER,
        SHARED_TEST,
        DOC,
        SHARED_DOC,
    ):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "workflow_dispatch:",
        "environment: navigator-production-readonly",
        "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}",
        "SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}",
        "supabase/setup-cli@v3.0.0",
        "version: 2.110.0-beta.26",
        "supabase migration list > artifacts/migration-list.txt",
        "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/functions",
        "python3 scripts/check_nav_v2_release_drift.py --self-test",
        "python3 scripts/check_nav_v2_release_drift_aliases.py --self-test",
        "python3 scripts/check_nav_v2_release_drift_aliases.py --baseline-only",
        "python3 scripts/check_nav_v2_release_drift_shared_project.py --self-test",
        "python3 scripts/check_nav_v2_release_drift_shared_project.py --baseline-only",
        "python3 -m unittest tests/unit/test_nav_v2_release_drift_shared_project_v1.py",
        "python3 scripts/check_nav_v2_release_drift_shared_project.py \\",
        "actions/upload-artifact@v4",
        "Fail when drift is detected",
    ), WORKFLOW.name, errors)

    forbidden = (
        "supabase db push",
        "supabase functions deploy",
        "supabase migration repair",
        "supabase secrets set",
        "curl --request post",
        "curl -x post",
    )
    lowered = workflow.lower()
    for marker in forbidden:
        if marker in lowered:
            errors.append(f"{WORKFLOW.name}: read-only workflow contains forbidden mutation command {marker!r}")

    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    if baseline.get("project_ref") != "ofewxuqfjhamgerwzull":
        errors.append("release baseline project_ref drifted")
    if baseline.get("environment") != "navigator-production-readonly":
        errors.append("release baseline environment drifted")
    if baseline.get("latest_live_migration") != "20260716063401":
        errors.append("release baseline latest Navigator migration drifted")
    if set((baseline.get("edge_functions") or {}).keys()) != {"nav-invite-user", "nav-v2-deal-api"}:
        errors.append("release baseline function set drifted")

    aliases = json.loads(ALIASES.read_text(encoding="utf-8"))
    if aliases.get("project_ref") != baseline.get("project_ref"):
        errors.append("migration alias project_ref differs from release baseline")
    if set((aliases.get("live_aliases") or {})) != {
        "20260712143253", "20260712163919", "20260712200429", "20260712205117",
        "20260713091921", "20260713160355", "20260713160446", "20260713160524",
        "20260713164757", "20260713170608", "20260713173156", "20260713180701",
        "20260713184344", "20260713195749", "20260713195810", "20260714064311",
        "20260714102956", "20260714125054", "20260715195732", "20260715203158",
        "20260716063401",
    }:
        errors.append("approved live migration alias set drifted")
    if set((aliases.get("approved_repository_only") or {})) != {
        "20260712160000", "20260712162609", "20260712190000", "20260712203000",
        "20260713090856", "20260713172000", "20260713193000", "20260713193500",
        "20260713203000", "20260713213000", "20260713223000", "20260713233000",
        "20260713234500", "20260714001500", "20260714001600", "20260714013000",
        "20260714103000", "20260714130000", "20260715213000", "20260715224500",
        "20260716064500",
    }:
        errors.append("approved repository-only migration set drifted")

    expected = {
        "20260713195749": ("20260714001500", "298c5093419e7cf3837b3255df170f32f60498c9"),
        "20260713195810": ("20260714001600", "d92aaf30482f0fc8802f947e796ca9307cc3479f"),
        "20260714064311": ("20260714013000", "2fde357c95d838645927a466053e551dff11941a"),
        "20260714102956": ("20260714103000", "6aab0d57fa1cc33ffbbcc27444300db8da2df5dd"),
        "20260714125054": ("20260714130000", "cd6c0962b7f3bfcce5bc3b51fe717fbfca100a14"),
        "20260715195732": ("20260715213000", "fdce76deac3451015e97ad11437bcdcf4cd7de7d"),
        "20260715203158": ("20260715224500", "87adddbf9e66e9366dd47343a4af673a5036dcf8"),
        "20260716063401": ("20260716064500", "93687e0aed8d88d604e31a730ba8c9f8c806b94e"),
    }
    for live_version, (canonical_version, blob_sha) in expected.items():
        live_entry = (aliases.get("live_aliases") or {}).get(live_version) or {}
        if live_entry.get("canonical_migrations") != [canonical_version]:
            errors.append(f"reviewed live migration mapping drifted for {live_version}")
        canonical_entry = (aliases.get("approved_repository_only") or {}).get(canonical_version) or {}
        if canonical_entry.get("represented_by_live") != [live_version]:
            errors.append(f"reviewed canonical reverse mapping drifted for {canonical_version}")
        if canonical_entry.get("source_blob_sha") != blob_sha:
            errors.append(f"reviewed canonical blob drifted for {canonical_version}")

    shared_contract = json.loads(SHARED_CONTRACT.read_text(encoding="utf-8"))
    if shared_contract.get("project_ref") != baseline.get("project_ref"):
        errors.append("shared-project contract project_ref differs from release baseline")
    if shared_contract.get("navigator_baseline_semantics") != "required_present_not_global_latest":
        errors.append("shared-project baseline semantics drifted")
    if shared_contract.get("current_navigator_live_migration") != baseline.get("latest_live_migration"):
        errors.append("shared-project contract migration differs from release baseline")
    if shared_contract.get("canonical_repository_migration") != "20260716064500":
        errors.append("shared-project canonical migration drifted")
    if shared_contract.get("canonical_repository_blob_sha") != "93687e0aed8d88d604e31a730ba8c9f8c806b94e":
        errors.append("shared-project canonical migration blob drifted")

    reporter = REPORTER.read_text(encoding="utf-8")
    require(reporter, (
        "def parse_migration_list", "def normalize_functions", "def build_report", "def markdown_report",
        "--baseline-only", "--self-test", "repository migrations missing in production",
        "production migrations missing in repository", "unregistered live Navigator Edge Functions",
    ), REPORTER.name, errors)

    alias_reporter = ALIAS_REPORTER.read_text(encoding="utf-8")
    require(alias_reporter, (
        "def validate_aliases", "def classify_migrations", "approved_repository_only",
        "represented_remote_aliases", "unrepresented_remote_only",
        "Any migration outside these explicit mappings still fails the workflow.", "--allow-drift",
    ), ALIAS_REPORTER.name, errors)

    shared_reporter = SHARED_REPORTER.read_text(encoding="utf-8")
    require(shared_reporter, (
        "def validate_contract", "def apply_shared_project_semantics", "def build_report",
        "required_present_not_global_latest", "approved Navigator baseline migration is absent from production",
        "later_remote_migrations", "unknown remote migrations", "--allow-drift",
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
        "navigator-production-readonly", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD",
        "без автоматического deploy", "config/nav-v2-release-baseline.json",
        "release-drift.json", "release-drift.md",
    ), DOC.name, errors)

    shared_doc = SHARED_DOC.read_text(encoding="utf-8")
    require(shared_doc, (
        "required_present_not_global_latest", "20260716063401", "20260716064500",
        "93687e0aed8d88d604e31a730ba8c9f8c806b94e", "unknown remote migrations",
        "shared_project_release_drift_false_positive_removed_repository_only",
    ), SHARED_DOC.name, errors)

    if errors:
        print("Navigator v2 release drift workflow errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 release drift workflow passed: read-only gate, alias-aware migration history, "
        "shared-project baseline semantics and Edge baseline checked"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
