#!/usr/bin/env python3
"""Validate integrated Auth storage-write hardening and fixed regressions."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-auth-storage-write-gap-v1.json"
TEST = ROOT / "tests/unit/nav-v2-auth-storage-write-gap.test.mjs"
MISSING_STORAGE_TEST = ROOT / "tests/unit/nav-v2-auth-storage-controller-missing-storage.test.mjs"
RUNTIME = ROOT / "assets/js/nav-v2/supabase-v2.js"
HELPER = ROOT / "assets/js/nav-v2/auth-storage-guard-v2.js"
BUILD = ROOT / "config/nav-v2-build.json"
DIAGNOSTIC = ROOT / "nav-system-check-v2.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-auth-storage-write-gap-v1.yml"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    test_source = TEST.read_text(encoding="utf-8")
    missing_storage_test = MISSING_STORAGE_TEST.read_text(encoding="utf-8")
    runtime_source = RUNTIME.read_text(encoding="utf-8")
    helper_source = HELPER.read_text(encoding="utf-8")
    build = json.loads(BUILD.read_text(encoding="utf-8"))
    diagnostic_source = DIAGNOSTIC.read_text(encoding="utf-8")
    workflow_source = WORKFLOW.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "schema version changed")
    require(
        config["status"]
        == "repository_only_auth_storage_write_regression_source_integrated_build_prepared",
        "unexpected integration status",
    )
    require(config["production_applied"] is False, "production_applied must remain false")
    require(config["production_auth_changed"] is False, "production_auth_changed must remain false")
    require(config["runtime_code_changed"] is True, "runtime integration flag missing")
    require(config["cloud_execution_allowed"] is False, "cloud execution must remain blocked")

    require(len(config["resolved_gaps"]) == 6, "expected six fixed storage regressions")
    require(all(item["fixed_in_source"] is True for item in config["resolved_gaps"]), "a gap is not fixed in source")
    require(sum(item["severity"] == "high" for item in config["resolved_gaps"]) == 3, "high severity count changed")

    result = config["result"]
    require(
        result["decision"]
        == "auth_storage_write_failures_fixed_in_source_build_rollout_prepared_not_live_verified",
        "unexpected decision",
    )
    require(result["runtime_hardening_completed"] is True, "runtime hardening flag missing")
    require(result["build_bump_completed"] is True, "build bump flag missing")
    for key in [
        "runtime_rollout_completed",
        "authenticated_role_e2e_completed",
        "live_browser_storage_failure_verified",
        "preview_branch_ready",
        "production_auth_change_ready",
    ]:
        require(result[key] is False, f"{key} must remain false")

    build_id = config["current_build_id"]
    require(build["build_id"] == build_id, "build config differs from integration contract")
    require(config["previous_build_id"] != build_id, "build id was not advanced")
    require(f"export const NAV_V2_BUILD_ID = '{build_id}';" in runtime_source, "runtime build marker missing")
    require(f"nav-system-check-v2.js?v={build_id}" in diagnostic_source, "diagnostic cache-bust missing")

    for marker in [
        "createAuthStorageController",
        "auth-storage-guard-v2.js?v=20260723-01",
        "authStorage.readSession()",
        "authStorage.clearSession({ email: sessionEmail(session) })",
        "authStorage.persistSession(session)",
        "authStorage.readLastEmail()",
        "authStorage.saveProfile(profileCacheKey(), profile)",
    ]:
        require(marker in runtime_source, f"runtime integration marker missing: {marker}")

    for forbidden_marker in [
        "localStorage.removeItem(SESSION_KEY);",
        "localStorage.setItem(SESSION_KEY, JSON.stringify(session));",
        "localStorage.setItem(LAST_EMAIL_KEY, clean);",
        "sessionStorage.setItem(profileCacheKey()",
    ]:
        require(forbidden_marker not in runtime_source, f"direct storage write remains: {forbidden_marker}")

    for marker in [
        "readLastEmail",
        "unavailableStorageCause",
        "persistentClearSucceeded",
        "local.setItem(sessionKey, 'null')",
        "throw createAuthStorageUnavailableError('save', error)",
    ]:
        require(marker in helper_source, f"helper marker missing: {marker}")

    for marker in [
        "Fixed regression 1",
        "Fixed regression 2",
        "Fixed regression 3",
        "Fixed regression 4",
        "Fixed regression 5",
        "Fixed regression 6",
        "NAV_AUTH_STORAGE_UNAVAILABLE",
        "NAV_AUTH_SESSION_EXPIRED",
        "RPC must not retry",
        "example.test",
    ]:
        require(marker in test_source, f"fixed regression marker missing: {marker}")

    for marker in [
        "storage objects themselves remains fail-closed",
        "readLastEmail",
        "persistentClearSucceeded, false",
        "NAV_AUTH_STORAGE_UNAVAILABLE",
    ]:
        require(marker in missing_storage_test, f"missing-storage test marker missing: {marker}")

    combined = (test_source + "\n" + missing_storage_test).lower()
    for marker in [
        "ofewxuqfjhamgerwzull",
        "supabase.co",
        "service_role",
        "sb_secret_",
        "confirm_cost",
        "create_branch",
        "apply_migration",
        "deploy_edge_function",
    ]:
        require(marker.lower() not in combined, f"offline tests contain forbidden marker: {marker}")

    rollout = config["build_rollout"]
    require(rollout["single_squash_merge_required"] is True, "squash merge requirement missing")
    require(rollout["static_build_checker_required"] is True, "build checker requirement missing")
    require(rollout["all_existing_auth_suites_required"] is True, "Auth regression requirement missing")
    require(rollout["production_supabase_change_required"] is False, "Supabase change must not be required")

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
    require("node tests/unit/nav-v2-auth-storage-write-gap.test.mjs" in workflow_source, "fixed regression missing")
    require(
        "node tests/unit/nav-v2-auth-storage-controller-missing-storage.test.mjs" in workflow_source,
        "missing-storage regression missing",
    )
    require("python3 scripts/check_nav_v2_build_version.py" in workflow_source, "build checker missing")

    print("Navigator v2 Auth storage write fixed regression contract passed")


if __name__ == "__main__":
    main()
