#!/usr/bin/env python3
"""Validate repository-only Auth storage-write gap evidence and build plan."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-auth-storage-write-gap-v1.json"
TEST = ROOT / "tests/unit/nav-v2-auth-storage-write-gap.test.mjs"
RUNTIME = ROOT / "assets/js/nav-v2/supabase-v2.js"
BUILD = ROOT / "config/nav-v2-build.json"
DIAGNOSTIC = ROOT / "nav-system-check-v2.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-auth-storage-write-gap-v1.yml"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    test_source = TEST.read_text(encoding="utf-8")
    runtime_source = RUNTIME.read_text(encoding="utf-8")
    build = json.loads(BUILD.read_text(encoding="utf-8"))
    diagnostic_source = DIAGNOSTIC.read_text(encoding="utf-8")
    workflow_source = WORKFLOW.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "schema version changed")
    require(
        config["status"] == "repository_only_auth_storage_write_gap_evidence_runtime_unchanged",
        "gap evidence escaped repository-only status",
    )
    for key in [
        "production_applied",
        "production_auth_changed",
        "runtime_code_changed",
        "cloud_execution_allowed",
    ]:
        require(config[key] is False, f"{key} must remain false")

    require(len(config["known_gaps"]) == 5, "expected exactly five documented gaps")
    gap_ids = {gap["id"] for gap in config["known_gaps"]}
    require(
        gap_ids
        == {
            "remember_email_failure_interrupts_invalid_session_cleanup",
            "session_remove_failure_interrupts_logout_cleanup",
            "profile_cache_write_failure_breaks_successful_profile_rpc",
            "password_reset_success_breaks_on_convenience_email_write",
            "session_persist_failure_has_raw_browser_error",
        },
        "gap inventory changed",
    )
    require(
        sum(gap["severity"] == "high" for gap in config["known_gaps"]) == 2,
        "high-severity gap count changed",
    )

    result = config["result"]
    require(
        result["decision"]
        == "auth_storage_write_failures_confirmed_repository_only_runtime_hardening_planned",
        "unexpected decision",
    )
    for key in [
        "runtime_hardening_completed",
        "runtime_rollout_completed",
        "build_bump_completed",
        "authenticated_role_e2e_completed",
        "preview_branch_ready",
        "production_auth_change_ready",
    ]:
        require(result[key] is False, f"{key} must remain false")

    require(build["build_id"] == config["current_build_id"], "current build id is not anchored")
    require(config["proposed_runtime_build_id"] != build["build_id"], "proposed build must differ")
    require(
        f"export const NAV_V2_BUILD_ID = '{build['build_id']}';" in runtime_source,
        "runtime build marker differs from current build config",
    )
    require(
        f"nav-system-check-v2.js?v={build['build_id']}" in diagnostic_source,
        "diagnostic cache-bust differs from current build",
    )

    # Anchor the evidence to the exact currently unguarded storage writes. A
    # later hardening PR must intentionally replace these markers and update the
    # contract instead of silently claiming this evidence still represents runtime.
    for marker in [
        "localStorage.removeItem(SESSION_KEY);",
        "localStorage.setItem(SESSION_KEY, JSON.stringify(session));",
        "localStorage.setItem(LAST_EMAIL_KEY, clean);",
        "sessionStorage.setItem(profileCacheKey(), JSON.stringify({ ...profile, cached_at: Date.now() }));",
        "rememberEmail(sessionEmail(session));\n  writeSession(null);",
    ]:
        require(marker in runtime_source, f"runtime gap marker missing: {marker}")

    for marker in [
        "known gap: stale session remains stored",
        "known gap: logout leaves stored session",
        "the server request itself succeeded once",
        "the reset request was accepted before the local write failed",
        "session write failure currently remains fail-closed",
        "QuotaExceededError",
        "SecurityError",
        "example.test",
    ]:
        require(marker in test_source, f"test evidence marker missing: {marker}")

    forbidden_test_markers = [
        "ofewxuqfjhamgerwzull",
        "supabase.co",
        "service_role",
        "sb_secret_",
        "confirm_cost",
        "create_branch",
        "apply_migration",
        "deploy_edge_function",
    ]
    lowered_test = test_source.lower()
    for marker in forbidden_test_markers:
        require(marker.lower() not in lowered_test, f"offline test contains forbidden marker: {marker}")

    plan = config["build_rollout_plan"]
    require(plan["single_atomic_commit_required"] is True, "atomic build update requirement missing")
    require(plan["static_build_checker_required"] is True, "build checker requirement missing")
    require(plan["all_existing_auth_suites_required"] is True, "Auth regression requirement missing")
    require(plan["production_supabase_change_required"] is False, "plan incorrectly requires Supabase change")

    boundary = config["test_boundary"]
    require(boundary["network_calls_mocked"] is True, "network boundary changed")
    require(boundary["storage_in_memory_with_synthetic_failures"] is True, "storage boundary changed")
    for key in [
        "supabase_management_api_called",
        "production_api_called",
        "real_accounts_used",
        "technical_accounts_created",
        "real_tokens_used",
        "real_user_data_used",
        "raw_logs_used",
    ]:
        require(boundary[key] is False, f"boundary flag {key} must remain false")

    require("permissions:\n  contents: read" in workflow_source, "workflow permissions are not read-only")
    require("workflow_dispatch:" in workflow_source, "manual workflow trigger missing")
    require("node tests/unit/nav-v2-auth-storage-write-gap.test.mjs" in workflow_source, "gap test missing from workflow")
    require("python3 scripts/check_nav_v2_build_version.py" in workflow_source, "build checker missing from workflow")

    print("Navigator v2 Auth storage write gap evidence contract passed")


if __name__ == "__main__":
    main()
