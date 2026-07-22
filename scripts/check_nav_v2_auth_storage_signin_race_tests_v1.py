#!/usr/bin/env python3
"""Validate the offline-only Auth malformed-storage and sign-in race test contract."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-auth-storage-signin-race-tests-v1.json"
TEST = ROOT / "tests/unit/nav-v2-auth-storage-signin-race.test.mjs"
RUNTIME = ROOT / "assets/js/nav-v2/supabase-v2.js"
HELPER = ROOT / "assets/js/nav-v2/auth-session-recovery-v2.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-auth-storage-signin-race-tests-v1.yml"
DOC = ROOT / "docs/NAV_V2_AUTH_STORAGE_SIGNIN_RACE_TESTS_V1_2026-07-22.md"

EXPECTED_STATUS = "repository_only_auth_storage_signin_race_test_contract_no_live_accounts"
EXPECTED_DECISION = "auth_malformed_storage_and_signin_refresh_races_covered_offline"
EXPECTED_SOURCE_MAIN = "07f33386555e5f9b8d6053c5a791e524b1c5d8e3"
EXPECTED_SCENARIOS = {
    "malformed_session_and_profile_storage_then_clean_signin",
    "same_user_signin_wins_over_pending_old_refresh",
    "different_user_signin_wins_over_pending_old_refresh",
    "failed_signin_prevents_old_refresh_resurrection",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    for path in (CONFIG, TEST, RUNTIME, HELPER, WORKFLOW, DOC):
        require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")

    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    test_source = TEST.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    helper = HELPER.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    docs = DOC.read_text(encoding="utf-8")
    docs_lower = docs.lower()

    require(data.get("schema_version") == 1, "schema_version must be 1")
    require(data.get("status") == EXPECTED_STATUS, "unexpected status")
    require(data.get("source_main_sha") == EXPECTED_SOURCE_MAIN, "source main SHA drift")
    require(data.get("result", {}).get("decision") == EXPECTED_DECISION, "unexpected decision")

    for flag in (
        "production_applied",
        "production_auth_changed",
        "runtime_code_changed",
        "cloud_execution_allowed",
    ):
        require(data.get(flag) is False, f"{flag} must remain false")

    scenarios = data.get("scenarios", [])
    require(isinstance(scenarios, list) and len(scenarios) == 4, "exactly four scenarios required")
    require({item.get("id") for item in scenarios} == EXPECTED_SCENARIOS, "scenario matrix drift")

    boundary = data.get("test_boundary", {})
    require(boundary.get("network_calls_mocked") is True, "network must be mocked")
    require(boundary.get("web_lock_api_mocked") is True, "Web Locks must be mocked")
    require(boundary.get("storage_in_memory") is True, "storage must be in memory")
    require(boundary.get("fixture_email_domain") == "example.test", "reserved fixture domain required")
    for flag in (
        "supabase_management_api_called",
        "production_api_called",
        "real_accounts_used",
        "technical_accounts_created",
        "real_tokens_used",
        "real_user_data_used",
        "raw_logs_used",
    ):
        require(boundary.get(flag) is False, f"boundary flag must remain false: {flag}")

    acceptance = data.get("acceptance", {})
    for flag in (
        "malformed_session_json_is_treated_as_absent",
        "malformed_profile_json_is_treated_as_absent",
        "require_user_fails_before_network_for_malformed_session",
        "clean_signin_clears_stale_profile_cache",
        "same_user_signin_session_wins_over_delayed_refresh",
        "different_user_signin_session_wins_over_delayed_refresh",
        "old_rpc_retries_at_most_once_with_replacement_session",
        "failed_signin_does_not_allow_old_session_resurrection",
        "existing_auth_recovery_suites_still_pass",
    ):
        require(acceptance.get(flag) is True, f"missing acceptance flag: {flag}")

    result = data.get("result", {})
    for flag in (
        "authenticated_role_e2e_completed",
        "live_multi_tab_browser_e2e_completed",
        "real_browser_storage_corruption_completed",
        "real_concurrent_signin_completed",
        "preview_branch_ready",
        "production_auth_change_ready",
    ):
        require(result.get(flag) is False, f"result boundary must remain false: {flag}")

    forbidden_actions = set(data.get("forbidden_actions", []))
    for action in (
        "call_production_supabase",
        "use_real_accounts_or_tokens",
        "commit_raw_auth_logs",
        "create_supabase_branch",
        "confirm_cost",
        "change_auth_settings",
        "change_rls_or_grants",
        "deploy_edge_function",
        "apply_production_migration",
        "change_leader_schema",
    ):
        require(action in forbidden_actions, f"missing forbidden action: {action}")

    for marker in (
        "function readSession()",
        "JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')",
        "export function getCachedProfile()",
        "export async function signIn(email, password)",
        "writeSession(null);",
        "if (isReplacementAuthSession(currentSession, session))",
        "if (!isSameAuthSession(currentSession, session))",
        ").finally(() => { refreshRequest = null; });",
    ):
        require(marker in runtime, f"runtime marker missing: {marker}")
    for marker in ("isReplacementAuthSession", "isSameAuthSession", "NAV_AUTH_SESSION_EXPIRED"):
        require(marker in helper, f"helper marker missing: {marker}")

    for marker in (
        "malformed session JSON must not create a cached user",
        "requireUser must fail before network when session JSON is malformed",
        "same-user-signin-won",
        "delayed refresh must not overwrite newer sign-in",
        "replacement user",
        "different-signin-access",
        "failed sign-in must leave no stored session",
        "delayed old refresh must not resurrect a session after failed sign-in",
    ):
        require(marker in test_source, f"test coverage marker missing: {marker}")

    require("example.test" in test_source, "reserved fixture domain missing")
    require("ofewxuqfjhamgerwzull" not in test_source, "production project ref found in test")
    require("supabase.co" not in test_source, "Supabase host found in test")

    workflow_lower = workflow.lower()
    for prohibited in (
        "curl ",
        "wget ",
        "psql ",
        "supabase ",
        "execute_sql",
        "apply_migration",
        "confirm_cost",
        "create_branch",
        "deploy_edge_function",
    ):
        require(prohibited not in workflow_lower, f"workflow contains prohibited token: {prohibited.strip()}")
    require("permissions:\n  contents: read" in workflow, "workflow permissions must remain read-only")
    require(
        "python3 scripts/check_nav_v2_auth_storage_signin_race_tests_v1.py" in workflow,
        "workflow must execute source checker",
    )
    require(
        "node tests/unit/nav-v2-auth-storage-signin-race.test.mjs" in workflow,
        "workflow must execute new test",
    )

    require(EXPECTED_DECISION in docs, "documentation decision drift")
    require("не является authenticated role e2e" in docs_lower, "documentation must preserve E2E boundary")
    require("runtime-код не меняется" in docs_lower, "documentation must preserve runtime boundary")
    require("malformed storage" in docs_lower, "documentation must describe malformed storage")

    print("Navigator v2 Auth storage/sign-in race test contract passed")


if __name__ == "__main__":
    main()
