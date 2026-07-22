#!/usr/bin/env python3
"""Validate the offline-only Auth lock/timeout/post-refresh test contract."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-auth-lock-timeout-post-refresh-tests-v1.json"
TEST = ROOT / "tests/unit/nav-v2-auth-lock-timeout-post-refresh.test.mjs"
RUNTIME = ROOT / "assets/js/nav-v2/supabase-v2.js"
HELPER = ROOT / "assets/js/nav-v2/auth-session-recovery-v2.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-auth-lock-timeout-post-refresh-tests-v1.yml"
DOC = ROOT / "docs/NAV_V2_AUTH_LOCK_TIMEOUT_POST_REFRESH_TESTS_V1_2026-07-22.md"

EXPECTED_STATUS = "repository_only_auth_lock_timeout_post_refresh_test_contract_no_live_accounts"
EXPECTED_DECISION = "auth_lock_timeout_and_post_refresh_failures_covered_offline"
EXPECTED_SOURCE_MAIN = "f0597e42641d5c20ef3701290b819d0701232735"
EXPECTED_SCENARIOS = {
    "web_locks_acquisition_failure_then_later_recovery",
    "refresh_abort_timeout_then_later_recovery",
    "post_refresh_rpc_returns_401",
    "post_refresh_rpc_returns_403",
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
        "lock_acquisition_failure_stops_before_token_endpoint",
        "lock_acquisition_failure_preserves_session_and_profile_cache",
        "rejected_lock_refresh_promise_is_cleared",
        "refresh_abort_timeout_preserves_session_and_profile_cache",
        "refresh_abort_timeout_stops_before_rpc_retry",
        "rejected_timeout_refresh_promise_is_cleared",
        "post_refresh_401_does_not_start_second_refresh",
        "post_refresh_403_does_not_start_second_refresh",
        "replacement_session_is_retained_after_post_refresh_error",
        "existing_auth_recovery_suites_still_pass",
    ):
        require(acceptance.get(flag) is True, f"missing acceptance flag: {flag}")

    result = data.get("result", {})
    for flag in (
        "authenticated_role_e2e_completed",
        "live_multi_tab_browser_e2e_completed",
        "real_lock_manager_failure_completed",
        "real_network_timeout_completed",
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

    # The runtime contract being observed must remain present.
    for marker in (
        "async function safeFetch",
        "error.name === 'AbortError'",
        "async function withAuthRefreshLock",
        "lockManager.request(NAV_AUTH_REFRESH_LOCK_NAME",
        "refreshRequest = withAuthRefreshLock",
        ").finally(() => { refreshRequest = null; });",
        "if (response.status === 401 || response.status === 403)",
    ):
        require(marker in runtime, f"runtime marker missing: {marker}")
    require("NAV_AUTH_REFRESH_LOCK_NAME" in helper, "Auth refresh lock helper contract missing")

    # New test must explicitly cover all four fail-closed scenarios.
    for marker in (
        "synthetic Web Locks acquisition failure",
        "token endpoint must not run when Web Locks acquisition fails",
        "recovered-after-lock-failure",
        "error.name = 'AbortError'",
        "Supabase не ответил за 12 сек",
        "recovered-after-refresh-timeout",
        "for (const postRefreshStatus of [401, 403])",
        "must not start a second refresh",
        "replacement session",
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
        "python3 scripts/check_nav_v2_auth_lock_timeout_post_refresh_tests_v1.py" in workflow,
        "workflow must execute source checker",
    )
    require(
        "node tests/unit/nav-v2-auth-lock-timeout-post-refresh.test.mjs" in workflow,
        "workflow must execute new test",
    )

    require(EXPECTED_DECISION in docs, "documentation decision drift")
    require("не является authenticated role e2e" in docs_lower, "documentation must preserve E2E boundary")
    require("runtime-код не меняется" in docs_lower, "documentation must preserve runtime boundary")

    print("Navigator v2 Auth lock/timeout/post-refresh test contract passed")


if __name__ == "__main__":
    main()
