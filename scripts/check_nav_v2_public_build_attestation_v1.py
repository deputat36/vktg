#!/usr/bin/env python3
"""Validate the repository-only public build attestation contract."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-public-build-attestation-v1.json"
BUILD_CONFIG = ROOT / "config/nav-v2-build.json"
RUNNER = ROOT / "scripts/attest_nav_v2_public_build_v1.py"
TEST = ROOT / "tests/unit/test_nav_v2_public_build_attestation_v1.py"
WORKFLOW = ROOT / ".github/workflows/nav-v2-public-build-attestation-v1.yml"
DOC = ROOT / "docs/NAV_V2_PUBLIC_BUILD_ATTESTATION_V1_2026-07-23.md"

ALLOWED_DECISIONS = {
    "public_build_attestation_contract_prepared_requires_successful_live_ci",
    "public_build_20260723_01_attested_read_only_via_github_pages_ci",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    for path in (CONFIG, BUILD_CONFIG, RUNNER, TEST, WORKFLOW, DOC):
        require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")

    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    build = json.loads(BUILD_CONFIG.read_text(encoding="utf-8"))
    runner = RUNNER.read_text(encoding="utf-8")
    test_source = TEST.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    docs = DOC.read_text(encoding="utf-8")
    workflow_lower = workflow.lower()
    docs_lower = docs.lower()

    require(data.get("schema_version") == 1, "schema_version must be 1")
    require(data.get("created_on") == "2026-07-23", "unexpected created_on")
    require(
        data.get("status") == "repository_only_public_build_attestation_contract",
        "unexpected contract status",
    )
    require(
        data.get("public_base_url") == "https://deputat36.github.io/vktg/",
        "unexpected public base URL",
    )
    require(
        data.get("expected_build_source") == "config/nav-v2-build.json",
        "canonical build source must remain config/nav-v2-build.json",
    )
    require(build.get("build_id") == "20260723-01", "unexpected canonical build id")

    acceptance = data.get("acceptance") or {}
    for flag in (
        "all_repository_importmap_pages_match_canonical_build",
        "diagnostic_module_cache_bust_matches_canonical_build",
        "shared_runtime_sha256_matches_repository",
        "storage_guard_sha256_matches_repository",
        "public_requests_use_cache_busting",
        "failure_report_is_written",
    ):
        require(acceptance.get(flag) is True, f"missing acceptance flag: {flag}")

    boundaries = data.get("boundaries") or {}
    require(boundaries.get("public_assets_only") is True, "public_assets_only must be true")
    for flag in (
        "credentials_used",
        "authenticated_requests",
        "real_accounts_used",
        "technical_accounts_created",
        "supabase_management_api_called",
        "production_api_mutation",
        "production_auth_changed",
        "production_schema_changed",
        "production_data_changed",
        "edge_function_changed",
        "leader_schema_changed",
    ):
        require(boundaries.get(flag) is False, f"boundary must remain false: {flag}")

    result = data.get("result") or {}
    decision = result.get("decision")
    require(decision in ALLOWED_DECISIONS, f"unexpected decision: {decision}")
    require(result.get("authenticated_role_e2e_completed") is False, "authenticated E2E must remain false")
    require(result.get("live_browser_storage_failure_verified") is False, "live storage failure claim is forbidden")

    if decision == "public_build_attestation_contract_prepared_requires_successful_live_ci":
        require(result.get("live_public_build_verified") is False, "pending contract cannot claim live verification")
        require(result.get("runtime_rollout_completed") is False, "pending contract cannot claim rollout")
        require(result.get("evidence_run_id") is None, "pending contract must not include run id")
        require(result.get("evidence_commit_sha") is None, "pending contract must not include commit sha")
    else:
        require(result.get("live_public_build_verified") is True, "passed attestation must claim public build only")
        require(result.get("runtime_rollout_completed") is True, "passed attestation must mark public rollout")
        require(isinstance(result.get("evidence_run_id"), int), "passed attestation requires numeric run id")
        require(
            isinstance(result.get("evidence_commit_sha"), str)
            and len(result.get("evidence_commit_sha")) == 40,
            "passed attestation requires full evidence commit SHA",
        )

    forbidden_actions = set(data.get("forbidden_actions") or [])
    for action in (
        "use_real_accounts_or_tokens",
        "read_authenticated_business_data",
        "create_supabase_branch",
        "confirm_cost",
        "change_auth_settings",
        "change_rls_or_grants",
        "deploy_edge_function",
        "apply_production_migration",
        "change_production_data",
        "change_leader_schema",
    ):
        require(action in forbidden_actions, f"missing forbidden action: {action}")

    for marker in (
        "config/nav-v2-build.json",
        "config/nav-v2-public-build-attestation-v1.json",
        "public_build_matches_repository_read_only",
        "NAV_V2_BASE_URL",
        "sha256_bytes",
        "inspect_importmap",
        "nav_build_attestation",
        "authenticated_requests\": False",
        "credentials_used\": False",
        "production_mutation\": False",
    ):
        require(marker in runner, f"runner marker missing: {marker}")

    for marker in (
        "test_matching_importmap_is_accepted",
        "test_mixed_build_is_rejected",
        "test_missing_importmap_is_rejected",
        "test_cache_bust_preserves_existing_build_query",
        "test_public_base_url_requires_https",
    ):
        require(marker in test_source, f"offline test marker missing: {marker}")

    require("permissions:\n  contents: read" in workflow, "workflow permissions must be read-only")
    require("python3 scripts/check_nav_v2_public_build_attestation_v1.py" in workflow, "workflow must run contract checker")
    require("python3 -m unittest tests/unit/test_nav_v2_public_build_attestation_v1.py" in workflow, "workflow must run offline tests")
    require("python3 scripts/attest_nav_v2_public_build_v1.py" in workflow, "workflow must run live attestation")
    require("actions/upload-artifact@v4" in workflow, "workflow must preserve public evidence artifact")

    for prohibited in (
        "secrets.",
        "nav_e2e_email",
        "nav_e2e_password",
        "service_role",
        "authorization:",
        "supabase.co",
        "execute_sql",
        "apply_migration",
        "confirm_cost",
        "create_branch",
        "deploy_edge_function",
        "curl ",
        "wget ",
        "psql ",
    ):
        require(prohibited not in workflow_lower, f"workflow contains prohibited token: {prohibited.strip()}")

    require("не является authenticated role e2e" in docs_lower, "docs must preserve authenticated E2E boundary")
    require("только публичные html/js assets" in docs_lower, "docs must preserve public-only boundary")
    require("supabase не изменяется" in docs_lower, "docs must preserve Supabase boundary")
    require("реальные ошибки browser storage" in docs_lower, "docs must reject live storage-error claim")
    require(decision in docs, "documentation decision drift")

    print("Navigator v2 public build attestation contract passed")


if __name__ == "__main__":
    main()
