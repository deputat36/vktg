#!/usr/bin/env python3
"""Validate the integrated repository-only Auth storage guard helper."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-auth-storage-guard-helper-v1.json"
HELPER = ROOT / "assets/js/nav-v2/auth-storage-guard-v2.js"
TEST = ROOT / "tests/unit/nav-v2-auth-storage-guard-helper.test.mjs"
MISSING_STORAGE_TEST = ROOT / "tests/unit/nav-v2-auth-storage-controller-missing-storage.test.mjs"
RUNTIME = ROOT / "assets/js/nav-v2/supabase-v2.js"
BUILD = ROOT / "config/nav-v2-build.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-auth-storage-write-gap-v1.yml"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    helper = HELPER.read_text(encoding="utf-8")
    test = TEST.read_text(encoding="utf-8")
    missing_test = MISSING_STORAGE_TEST.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    build = json.loads(BUILD.read_text(encoding="utf-8"))
    workflow = WORKFLOW.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "schema version changed")
    require(
        config["status"] == "repository_only_auth_storage_guard_helper_integrated_build_prepared",
        "unexpected integrated helper status",
    )
    require(config["production_applied"] is False, "production_applied must remain false")
    require(config["production_auth_changed"] is False, "production_auth_changed must remain false")
    require(config["runtime_source_integrated"] is True, "runtime integration flag missing")
    require(config["runtime_rollout_completed"] is False, "live rollout must remain unverified")
    require(config["build_bump_completed"] is True, "build bump flag missing")
    require(config["cloud_execution_allowed"] is False, "cloud execution must remain blocked")

    result = config["result"]
    require(
        result["decision"]
        == "auth_storage_write_hardening_helper_integrated_in_source_build_prepared_not_live_verified",
        "unexpected decision",
    )
    require(result["helper_unit_contract_proven"] is True, "helper proof flag missing")
    require(result["runtime_hardening_completed"] is True, "runtime hardening flag missing")
    for key in [
        "runtime_rollout_completed",
        "authenticated_role_e2e_completed",
        "live_browser_storage_failure_verified",
        "preview_branch_ready",
        "production_auth_change_ready",
    ]:
        require(result[key] is False, f"{key} must remain false")

    require(build["build_id"] == config["current_build_id"], "current build id drifted")
    require(config["previous_build_id"] != build["build_id"], "build id was not advanced")
    require("auth-storage-guard-v2.js?v=20260723-01" in runtime, "runtime helper import missing")
    require("createAuthStorageController" in runtime, "runtime controller creation missing")

    for marker in [
        "export const NAV_AUTH_STORAGE_UNAVAILABLE",
        "export function createAuthStorageUnavailableError",
        "export function createAuthStorageController",
        "function readLastEmail()",
        "function unavailableStorageCause(storageName)",
        "sessionReadBlocked = true",
        "local.setItem(sessionKey, 'null')",
        "persistentClearSucceeded",
        "clearProfiles();",
        "rememberEmail(email);",
        "throw createAuthStorageUnavailableError('save', error)",
    ]:
        require(marker in helper, f"helper marker missing: {marker}")

    operations = config["exported_contract"]["operations"]
    for operation in operations:
        require(operation in helper, f"exported operation missing: {operation}")

    for marker in [
        "Malformed or denied reads are fail-closed",
        "Remembered email is optional",
        "Optional profile cache writes fail open",
        "removeItem failure falls back",
        "remove and overwrite both fail",
        "Profile cleanup continues",
        "Session persistence failures are normalized",
        "later successful persistence explicitly restores session reads",
        "QuotaExceededError",
        "SecurityError",
        "example.test",
    ]:
        require(marker in test, f"helper test marker missing: {marker}")

    for marker in [
        "storage objects themselves remains fail-closed",
        "readLastEmail",
        "persistentClearSucceeded, false",
        "NAV_AUTH_STORAGE_UNAVAILABLE",
    ]:
        require(marker in missing_test, f"missing-storage test marker missing: {marker}")

    combined = (helper + "\n" + test + "\n" + missing_test).lower()
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
        require(marker.lower() not in combined, f"offline helper package contains forbidden marker: {marker}")

    integration = config["integration_results"]
    for key in [
        "direct_session_reads_replaced",
        "direct_session_writes_replaced",
        "direct_remembered_email_write_replaced",
        "direct_remembered_email_read_replaced",
        "direct_profile_cache_write_replaced",
        "cross_tab_refresh_race_guards_preserved",
        "logout_and_signin_race_guards_preserved",
        "all_scoped_importmaps_updated_in_branch",
        "build_config_updated",
        "diagnostics_cache_bust_updated",
        "gap_evidence_converted_to_fixed_regression",
    ]:
        require(integration[key] is True, f"integration result {key} missing")
    require(integration["production_supabase_change_required"] is False, "integration incorrectly requires Supabase change")

    boundary = config["test_boundary"]
    require(boundary["network_called"] is False, "helper tests must not call network")
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

    require("permissions:\n  contents: read" in workflow, "workflow permissions are not read-only")
    require("node tests/unit/nav-v2-auth-storage-guard-helper.test.mjs" in workflow, "helper test missing")
    require(
        "node tests/unit/nav-v2-auth-storage-controller-missing-storage.test.mjs" in workflow,
        "missing-storage test missing",
    )
    require("node tests/unit/nav-v2-auth-storage-write-gap.test.mjs" in workflow, "fixed regression missing")
    require("python3 scripts/check_nav_v2_build_version.py" in workflow, "build checker missing")

    print("Navigator v2 integrated Auth storage guard helper contract passed")


if __name__ == "__main__":
    main()
