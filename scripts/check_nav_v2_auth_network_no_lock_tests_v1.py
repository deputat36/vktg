#!/usr/bin/env python3
"""Validate the offline-only Auth network/no-Web-Locks test contract."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-auth-network-no-lock-tests-v1.json"
TEST = ROOT / "tests/unit/nav-v2-auth-network-no-lock.test.mjs"
RUNTIME = ROOT / "assets/js/nav-v2/supabase-v2.js"
HELPER = ROOT / "assets/js/nav-v2/auth-session-recovery-v2.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-auth-network-no-lock-tests-v1.yml"
DOC = ROOT / "docs/NAV_V2_AUTH_NETWORK_NO_LOCK_TESTS_V1_2026-07-22.md"
EXISTING_RECOVERY = ROOT / "tests/unit/nav-v2-auth-session-recovery.test.mjs"
EXISTING_CONCURRENT = ROOT / "tests/unit/nav-v2-auth-concurrent-refresh.test.mjs"

EXPECTED_DECISION = "auth_refresh_no_lock_and_transient_network_recovery_covered_offline"
FORBIDDEN_SOURCE_MARKERS = (
    "ofewxuqfjhamgerwzull",
    ".supabase.co",
    "borisoglebsk.etagi.com",
    "@gmail.com",
    "service_role",
)
FORBIDDEN_WORKFLOW_MARKERS = (
    "curl ",
    "wget ",
    "supabase ",
    "psql ",
    "apply_migration",
    "execute_sql",
    "confirm_cost",
)


def require(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def main() -> None:
    paths = (
        CONFIG,
        TEST,
        RUNTIME,
        HELPER,
        WORKFLOW,
        DOC,
        EXISTING_RECOVERY,
        EXISTING_CONCURRENT,
    )
    for path in paths:
        require(path.is_file(), f"missing {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    test = TEST.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    helper = HELPER.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config.get("schema_version") == 1, "schema version drift")
    require(config.get("production_applied") is False, "production_applied must remain false")
    require(config.get("production_auth_changed") is False, "production Auth must remain unchanged")
    require(config.get("runtime_code_changed") is False, "this slice must not claim runtime code changes")
    require(config.get("cloud_execution_allowed") is False, "cloud execution must remain blocked")
    require(config.get("result", {}).get("decision") == EXPECTED_DECISION, "decision drift")

    boundary = config.get("test_boundary", {})
    require(boundary.get("network_calls_mocked") is True, "network must be mocked")
    require(boundary.get("web_lock_api_absent") is True, "suite must cover absent Web Locks")
    require(boundary.get("storage_in_memory") is True, "storage must be in memory")
    for key in (
        "supabase_management_api_called",
        "production_api_called",
        "real_accounts_used",
        "technical_accounts_created",
        "real_tokens_used",
        "real_user_data_used",
        "raw_logs_used",
    ):
        require(boundary.get(key) is False, f"{key} must remain false")
    require(boundary.get("fixture_email_domain") == "example.test", "fixture domain drift")

    scenarios = config.get("scenarios", [])
    require(len(scenarios) == 2, "exactly two scenarios required")
    no_lock, network = scenarios
    require(no_lock.get("web_locks_available") is False, "no-lock scenario drift")
    require(no_lock.get("expected_refresh_count") == 1, "no-lock fan-in must refresh once")
    require(no_lock.get("expected_retry_count") == 2, "no-lock fan-in must retry both RPCs")
    require(network.get("outage_expected_refresh_count") == 1, "outage fan-in must refresh once")
    require(network.get("outage_expected_retry_count") == 0, "outage must not retry RPCs")
    require(network.get("outage_expected_session_invalidated") is False, "transient outage must preserve session")
    require(network.get("outage_expected_profile_cache_cleared") is False, "transient outage must preserve profile cache")
    require(network.get("recovery_expected_refresh_count") == 1, "later recovery must start a fresh refresh")
    require(network.get("recovery_expected_retry_count") == 1, "later recovery must retry one RPC")

    acceptance = config.get("acceptance", {})
    required_acceptance = (
        "no_web_locks_parallel_refresh_fans_in_to_one_request",
        "each_original_rpc_retries_exactly_once_after_valid_refresh",
        "transient_network_failure_does_not_invalidate_session",
        "transient_network_failure_does_not_clear_profile_cache",
        "transient_network_failure_does_not_retry_rpc",
        "rejected_shared_refresh_promise_is_cleared",
        "later_rpc_can_refresh_and_recover",
        "existing_auth_recovery_suites_still_pass",
    )
    for key in required_acceptance:
        require(acceptance.get(key) is True, f"missing acceptance {key}")

    for marker in FORBIDDEN_SOURCE_MARKERS:
        require(marker not in test, f"forbidden production marker in test: {marker}")
    require("example.test" in test, "reserved fixture domain missing")
    require("value: {}" in test, "navigator without locks must be explicit")
    require("navigator?.locks" in test, "no-Web-Locks assertion missing")
    require("Promise.all([" in test, "parallel valid no-lock scenario missing")
    require("Promise.allSettled([" in test, "parallel outage scenario missing")
    require("synthetic offline refresh" in test, "synthetic network failure missing")
    require("transient network failure must not invalidate the stored session" in test, "session preservation assertion missing")
    require("transient network failure must not clear the profile cache" in test, "profile cache preservation assertion missing")
    require("refreshRequest must be cleared after rejection" in test, "recovery-after-rejection assertion missing")

    require("let refreshRequest = null;" in runtime, "runtime refresh promise marker missing")
    require("if (refreshRequest)" in runtime, "runtime refresh fan-in guard missing")
    require("return callback();" in runtime, "runtime no-Web-Locks fallback missing")
    require("finally(() => { refreshRequest = null; })" in runtime, "runtime rejected refresh cleanup missing")
    require("shouldInvalidateSessionAfterRefreshFailure" in runtime, "runtime invalid-refresh policy missing")
    require("return classifyAuthSessionError(error) === 'invalid_refresh_token';" in helper, "helper transient-error policy drift")

    workflow_lower = workflow.lower()
    for marker in FORBIDDEN_WORKFLOW_MARKERS:
        require(marker not in workflow_lower, f"workflow must remain offline-only: {marker.strip()}")
    require("node tests/unit/nav-v2-auth-network-no-lock.test.mjs" in workflow, "new test is not executed")
    require("node tests/unit/nav-v2-auth-session-recovery.test.mjs" in workflow, "existing recovery suite is not executed")
    require("node tests/unit/nav-v2-auth-concurrent-refresh.test.mjs" in workflow, "existing concurrency suite is not executed")
    require("permissions:\n  contents: read" in workflow, "workflow permissions must remain read-only")

    require(EXPECTED_DECISION in doc, "decision missing from documentation")
    require("без Web Locks" in doc, "no-Web-Locks boundary missing from documentation")
    require("временный сетевой сбой" in doc, "network boundary missing from documentation")
    require("не является live browser E2E" in doc, "live E2E limitation missing")

    print("Navigator v2 Auth network/no-lock test contract passed")


if __name__ == "__main__":
    main()
