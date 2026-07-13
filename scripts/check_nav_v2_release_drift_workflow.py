from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/nav-v2-release-drift.yml"
BASELINE = ROOT / "config/nav-v2-release-baseline.json"
ALIASES = ROOT / "config/nav-v2-release-migration-aliases.json"
REPORTER = ROOT / "scripts/check_nav_v2_release_drift.py"
ALIAS_REPORTER = ROOT / "scripts/check_nav_v2_release_drift_aliases.py"
DOC = ROOT / "docs/NAV_V2_RELEASE_DRIFT.md"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (WORKFLOW, BASELINE, ALIASES, REPORTER, ALIAS_REPORTER, DOC):
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
        "python3 scripts/check_nav_v2_release_drift_aliases.py \\",
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
    if baseline.get("latest_live_migration") != "20260713164757":
        errors.append("release baseline latest migration drifted")
    if set((baseline.get("edge_functions") or {}).keys()) != {"nav-invite-user", "nav-v2-deal-api"}:
        errors.append("release baseline function set drifted")

    aliases = json.loads(ALIASES.read_text(encoding="utf-8"))
    if aliases.get("project_ref") != baseline.get("project_ref"):
        errors.append("migration alias project_ref differs from release baseline")
    if set((aliases.get("live_aliases") or {})) != {
        "20260712143253",
        "20260712163919",
        "20260712200429",
        "20260712205117",
        "20260713091921",
        "20260713160355",
        "20260713160446",
        "20260713160524",
        "20260713164757",
    }:
        errors.append("approved live migration alias set drifted")
    if set((aliases.get("approved_repository_only") or {})) != {
        "20260712160000",
        "20260712162609",
        "20260712190000",
        "20260712203000",
        "20260713090856",
        "20260713172000",
        "20260713193000",
        "20260713193500",
        "20260713203000",
    }:
        errors.append("approved repository-only migration set drifted")

    reporter = REPORTER.read_text(encoding="utf-8")
    require(reporter, (
        "def parse_migration_list",
        "def normalize_functions",
        "def build_report",
        "def markdown_report",
        "--baseline-only",
        "--self-test",
        "repository migrations missing in production",
        "production migrations missing in repository",
        "unregistered live Navigator Edge Functions",
    ), REPORTER.name, errors)

    alias_reporter = ALIAS_REPORTER.read_text(encoding="utf-8")
    require(alias_reporter, (
        "def validate_aliases",
        "def classify_migrations",
        "approved_repository_only",
        "represented_remote_aliases",
        "unrepresented_remote_only",
        "Any migration outside these explicit mappings still fails the workflow.",
        "--allow-drift",
    ), ALIAS_REPORTER.name, errors)

    doc = DOC.read_text(encoding="utf-8")
    require(doc, (
        "navigator-production-readonly",
        "SUPABASE_ACCESS_TOKEN",
        "SUPABASE_DB_PASSWORD",
        "без автоматического deploy",
        "config/nav-v2-release-baseline.json",
        "release-drift.json",
        "release-drift.md",
    ), DOC.name, errors)

    if errors:
        print("Navigator v2 release drift workflow errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 release drift workflow passed: read-only gate, alias-aware migration history and Edge baseline checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
