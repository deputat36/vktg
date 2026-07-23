#!/usr/bin/env python3
"""Validate the offline-only Navigator v2 password-reset test contract."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-auth-password-reset-tests-v1.json"
TEST = ROOT / "tests/unit/nav-v2-auth-password-reset.test.mjs"
RUNTIME = ROOT / "assets/js/nav-v2/supabase-v2.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-auth-password-reset-tests-v1.yml"
DOC = ROOT / "docs/NAV_V2_AUTH_PASSWORD_RESET_TESTS_V1_2026-07-23.md"

EXPECTED_STATUS = "repository_only_auth_password_reset_test_contract_no_live_accounts"
EXPECTED_DECISION = "auth_password_reset_paths_covered_offline"
EXPECTED_SOURCE_MAIN = "ee0a5847a7e2c8d687baf324f2041d08436450e7"
EXPECTED_SCENARIOS = {
    "blank_email_stops_before_network",
    "successful_reset_uses_accept_invite_redirect",
    "reset_transport_failure_preserves_state",
    "reset_timeout_preserves_state",
    "reset_rate_limit_preserves_state",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    for path in (CONFIG, TEST, RUNTIME, WORKFLOW, DOC):
        require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")

    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    test_source = TEST.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
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
    require(isinstance(scenarios, list) and len(scenarios) == 5, "exactly five scenarios required")
    require({item.get("id") for item in scenarios} == EXPECTED_SCENARIOS, "scenario matrix drift")

    boundary = data.get("test_boundary", {})
    for flag in ("network_calls_mocked", "storage_in_memory", "window_location_mocked"):
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
        "blank_email_stops_before_network",
        "email_is_trimmed_before_request",
        "redirect_targets_nav_accept_invite_v2",
        "remembered_email_updates_only_after_success",
        "active_session_is_preserved_on_success",
        "active_profile_cache_is_preserved_on_success",
        "network_failure_preserves_session_and_profile",
        "timeout_uses_twelve_second_message",
        "timeout_preserves_session",
        "rate_limit_surfaces_status_and_code",
        "rate_limit_preserves_session_and_profile",
        "existing_auth_recovery_suites_still_pass",
    ):
        require(acceptance.get(flag) is True, f"missing acceptance flag: {flag}")

    result = data.get("result", {})
    for flag in (
        "authenticated_role_e2e_completed",
        "real_password_reset_email_sent",
        "real_recovery_link_completed",
        "real_rate_limit_completed",
        "preview_branch_ready",
        "production_auth_change_ready",
    ):
        require(result.get(flag) is False, f"result boundary must remain false: {flag}")

    forbidden_actions = set(data.get("forbidden_actions", []))
    for action in (
        "call_production_supabase",
        "send_real_password_reset_email",
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

    # Runtime contract under observation must remain present.
    for marker in (
        "function accessPageUrl()",
        "new URL('./nav-accept-invite-v2.html', window.location.href).href",
        "export async function requestPasswordReset(email)",
        "const cleanEmail = String(email || '').trim();",
        "if (!cleanEmail) throw new Error('Введите email, для которого нужно восстановить пароль.');",
        "/auth/v1/recover?redirect_to=${encodeURIComponent(accessPageUrl())}",
        "body: JSON.stringify({ email: cleanEmail })",
        "rememberEmail(cleanEmail);",
    ):
        require(marker in runtime, f"runtime marker missing: {marker}")

    # New test must explicitly cover local validation, success, network, timeout and rate limit.
    for marker in (
        "blank reset input must not call network",
        "https://example.test/app/nav-accept-invite-v2.html",
        "password reset must not replace the active session",
        "synthetic password reset offline",
        "Supabase не ответил за 12 сек",
        "Too many reset requests",
        "over_request_rate_limit",
        "previous-login@example.test",
        "timeout-previous@example.test",
        "rate-previous@example.test",
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
        "python3 scripts/check_nav_v2_auth_password_reset_tests_v1.py" in workflow,
        "workflow must execute source checker",
    )
    require(
        "node tests/unit/nav-v2-auth-password-reset.test.mjs" in workflow,
        "workflow must execute new test",
    )

    require(EXPECTED_DECISION in docs, "documentation decision drift")
    require("не является authenticated role e2e" in docs_lower, "documentation must preserve E2E boundary")
    require("runtime-код не меняется" in docs_lower, "documentation must preserve runtime boundary")
    require("production supabase не изменён" in docs_lower, "documentation must preserve production boundary")

    print("Navigator v2 Auth password-reset test contract passed")


if __name__ == "__main__":
    main()
