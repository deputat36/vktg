#!/usr/bin/env python3
"""Validate the offline-only Auth logout/storage-failure test contract."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-auth-logout-storage-failure-tests-v1.json"
TEST = ROOT / "tests/unit/nav-v2-auth-logout-storage-failure.test.mjs"
RUNTIME = ROOT / "assets/js/nav-v2/supabase-v2.js"
STORAGE_HELPER = ROOT / "assets/js/nav-v2/auth-storage-guard-v2.js"
HELPER = ROOT / "assets/js/nav-v2/auth-session-recovery-v2.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-auth-logout-storage-failure-tests-v1.yml"
DOC = ROOT / "docs/NAV_V2_AUTH_LOGOUT_STORAGE_FAILURE_TESTS_V1_2026-07-23.md"

EXPECTED_STATUS = "repository_only_auth_logout_storage_failure_test_contract_no_live_accounts"
EXPECTED_DECISION = "auth_logout_and_storage_read_failures_covered_offline"
EXPECTED_SOURCE_MAIN = "5fc329be7b9e3acfc07423e1cca8e069f97d2f01"
EXPECTED_SCENARIOS = {
    "logout_during_pending_old_refresh",
    "logout_transport_failure_clears_local_state",
    "logout_without_session_clears_stale_profiles",
    "storage_read_security_error_fails_closed",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    for path in (CONFIG, TEST, RUNTIME, STORAGE_HELPER, HELPER, WORKFLOW, DOC):
        require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")

    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    test_source = TEST.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    storage_helper = STORAGE_HELPER.read_text(encoding="utf-8")
    helper = HELPER.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    docs = DOC.read_text(encoding="utf-8")
    docs_lower = docs.lower()

    require(data.get("schema_version") == 1, "schema_version must be 1")
    require(data.get("status") == EXPECTED_STATUS, "unexpected status")
    require(data.get("created_on") == "2026-07-23", "unexpected created_on")
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
    for flag in (
        "network_calls_mocked",
        "web_lock_api_mocked",
        "storage_in_memory_or_synthetic_denial",
    ):
        require(boundary.get(flag) is True, f"boundary flag must be true: {flag}")
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
        "logout_clears_session_before_delayed_refresh_completion",
        "delayed_refresh_cannot_resurrect_logged_out_session",
        "logout_network_failure_still_clears_local_session",
        "logout_network_failure_still_clears_profile_cache",
        "cleared_session_stops_later_rpc_before_network",
        "logout_without_session_skips_network",
        "logout_without_session_clears_stale_profile_cache",
        "storage_read_security_error_returns_no_cached_user",
        "storage_read_security_error_returns_no_cached_profile",
        "storage_read_security_error_stops_protected_action_before_network",
        "existing_auth_recovery_suites_still_pass",
    ):
        require(acceptance.get(flag) is True, f"missing acceptance flag: {flag}")

    result = data.get("result", {})
    for flag in (
        "authenticated_role_e2e_completed",
        "live_multi_tab_browser_e2e_completed",
        "real_logout_endpoint_failure_completed",
        "real_browser_storage_denial_completed",
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

    # Historical behavior remains covered after the runtime moved behind the
    # fail-closed storage controller.
    for marker in (
        "createAuthStorageController",
        "function readSession()",
        "return authStorage.readSession();",
        "async function refreshSession(failedAccessToken = '')",
        "if (!isSameAuthSession(currentSession, session))",
        "export async function signOut()",
        "if (session?.access_token) await safeFetch(`${SUPABASE_URL}/auth/v1/logout`",
        "finally { writeSession(null); }",
    ):
        require(marker in runtime, f"runtime marker missing: {marker}")
    for marker in (
        "function readSession()",
        "function clearSession({ email = '' } = {})",
        "setSessionBlock(previousValue, previousValueKnown)",
        "clearProfiles();",
    ):
        require(marker in storage_helper, f"storage helper marker missing: {marker}")
    require("NAV_AUTH_SESSION_EXPIRED" in helper, "Auth session-expired helper contract missing")

    for marker in (
        "logout must clear the stored session before delayed refresh completes",
        "delayed refresh must not resurrect a logged-out session",
        "synthetic logout offline",
        "logout network failure must still clear local session",
        "network must not be called without a session",
        "synthetic browser storage read denied",
        "storage SecurityError must be treated as no cached user",
        "network must not be called after storage read denial",
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
        "python3 scripts/check_nav_v2_auth_logout_storage_failure_tests_v1.py" in workflow,
        "workflow must execute source checker",
    )
    require(
        "node tests/unit/nav-v2-auth-logout-storage-failure.test.mjs" in workflow,
        "workflow must execute new test",
    )

    require(EXPECTED_DECISION in docs, "documentation decision drift")
    require("не является authenticated role e2e" in docs_lower, "documentation must preserve E2E boundary")
    require("runtime-код не меняется" in docs_lower, "documentation must preserve original slice boundary")
    require("production supabase не изменён" in docs_lower, "documentation must preserve production boundary")

    print("Navigator v2 Auth logout/storage-failure test contract passed")


if __name__ == "__main__":
    main()
