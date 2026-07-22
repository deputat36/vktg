#!/usr/bin/env python3
"""Fail-closed source validator for the redacted Navigator v2 Auth recovery attestation."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config/nav-v2-auth-recovery-live-attestation-v1.json"
RUNTIME_PATH = ROOT / "assets/js/nav-v2/auth-session-recovery-v2.js"
TEST_PATH = ROOT / "tests/unit/nav-v2-auth-session-recovery.test.mjs"
WORKFLOW_PATH = ROOT / ".github/workflows/nav-v2-auth-recovery-live-attestation-v1.yml"
DOC_PATH = ROOT / "docs/NAV_V2_AUTH_RECOVERY_LIVE_ATTESTATION_V1_2026-07-22.md"

EXPECTED_STATUS = "repository_only_redacted_live_auth_recovery_attestation_not_authenticated_role_e2e"
EXPECTED_DECISION = "live_auth_refresh_recovery_observed_redacted_not_authenticated_role_e2e"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    for path in (CONFIG_PATH, RUNTIME_PATH, TEST_PATH, WORKFLOW_PATH, DOC_PATH):
        require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")

    data = load_json(CONFIG_PATH)
    raw = CONFIG_PATH.read_text(encoding="utf-8")
    runtime = RUNTIME_PATH.read_text(encoding="utf-8")
    tests = TEST_PATH.read_text(encoding="utf-8")
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    docs = DOC_PATH.read_text(encoding="utf-8")

    require(data.get("schema_version") == 1, "schema_version must be 1")
    require(data.get("status") == EXPECTED_STATUS, "unexpected status")
    require(data.get("result", {}).get("decision") == EXPECTED_DECISION, "unexpected decision")

    for flag in (
        "production_applied",
        "production_ddl_authorized",
        "production_dml_authorized",
        "auth_settings_change_authorized",
        "cloud_execution_allowed",
    ):
        require(data.get(flag) is False, f"{flag} must remain false")

    evidence = data.get("source_evidence", {})
    require(evidence.get("capture_mode") == "management_api_read_only_last_24_hours_redacted_summary", "capture must be read-only and redacted")
    require(evidence.get("raw_logs_committed") is False, "raw logs must not be committed")
    require(evidence.get("runtime_helper") == str(RUNTIME_PATH.relative_to(ROOT)), "runtime path drift")
    require(evidence.get("unit_test") == str(TEST_PATH.relative_to(ROOT)), "unit test path drift")

    scope = data.get("observation_scope", {})
    require(scope.get("observed_recovery_sequences") == 2, "expected exactly two summarized recovery sequences")
    require(scope.get("sequence_signature") == [
        "authenticated_rpc_returns_401_for_expired_access_token",
        "refresh_token_endpoint_returns_200",
        "same_rpc_family_retry_returns_200",
    ], "recovery sequence signature drift")
    require(scope.get("fresh_auth_sample_contains_refresh_token_not_found") is False, "fresh sample regression flag must be false")
    require(scope.get("successful_refresh_login_events_observed") is True, "successful refresh/login evidence missing")

    smoke = data.get("unauthenticated_smoke_observation", {})
    require(smoke.get("public_authenticated_rpc_without_auth", {}).get("expected_http_status") == 401, "authenticated RPC must reject unauthenticated calls")
    require(smoke.get("internal_or_private_helper_via_data_api", {}).get("expected_http_status") == 404, "private helper must not be exposed")
    require(smoke.get("unexpected_unauthenticated_success_observed") is False, "unexpected unauthenticated success must remain false")

    privacy = data.get("privacy", {})
    require(privacy, "privacy contract missing")
    require(all(value is False for value in privacy.values()), "all retained-identifier flags must be false")

    interpretation = data.get("interpretation", {})
    require(interpretation.get("valid_refresh_recovery_observed") is True, "valid recovery observation missing")
    require(interpretation.get("fresh_invalid_refresh_loop_observed") is False, "fresh invalid refresh loop must not be claimed")
    for flag in (
        "authenticated_role_matrix_completed",
        "authenticated_visual_e2e_completed",
        "all_roles_verified",
        "mobile_and_desktop_verified",
        "leaked_password_protection_ready_to_enable",
        "preview_branch_gate_satisfied",
        "production_release_gate_satisfied",
    ):
        require(interpretation.get(flag) is False, f"{flag} must remain false")

    result = data.get("result", {})
    require(result.get("live_recovery_shape_observed") is True, "live recovery result missing")
    require(result.get("authenticated_role_e2e_ready") is False, "attestation must not claim E2E readiness")
    require(result.get("production_change_ready") is False, "attestation must not authorize production changes")

    forbidden_actions = set(data.get("forbidden_actions", []))
    for action in (
        "commit_raw_supabase_logs",
        "create_supabase_branch",
        "confirm_cost",
        "create_real_or_technical_accounts",
        "change_auth_settings",
        "apply_production_migration",
        "change_leader_schema",
    ):
        require(action in forbidden_actions, f"missing forbidden action: {action}")

    # No copied identity or network detail may enter the repository evidence.
    require("@" not in raw, "email-like value found in attestation")
    require(not re.search(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", raw), "IP-like value found in attestation")
    require("remote_addr" not in raw and "actor_username" not in raw and "user_id\"" not in raw, "raw log identity field found")
    require("authorization" not in raw.lower(), "authorization header material must not be stored")

    # Existing runtime and unit tests must still cover both valid and invalid refresh paths.
    for token in (
        "refresh_token_not_found",
        "refresh_token_already_used",
        "NAV_AUTH_REFRESH_LOCK_NAME",
        "hasSessionAdvancedSinceRequest",
    ):
        require(token in runtime, f"runtime recovery contract missing: {token}")

    for snippet in (
        "valid refresh must retry the RPC exactly once",
        "invalid refresh flow must stop before a second RPC retry",
        "replacement-won-race",
        "logout during refresh must stop before RPC retry",
    ):
        require(snippet in tests, f"unit recovery coverage missing: {snippet}")

    # Dedicated workflow must stay repository-only and source-only.
    for prohibited in (
        "supabase execute",
        "supabase db",
        "psql ",
        "curl ",
        "wget ",
        "confirm_cost",
        "create_branch",
        "apply_migration",
        "deploy_edge_function",
    ):
        require(prohibited not in workflow.lower(), f"workflow contains prohibited execution token: {prohibited}")
    require("python3 scripts/check_nav_v2_auth_recovery_live_attestation_v1.py" in workflow, "workflow must execute validator")

    require(EXPECTED_DECISION in docs, "documentation decision drift")
    require("не является authenticated role E2E" in docs, "documentation must preserve E2E boundary")
    require("сырые логи" in docs.lower(), "documentation must explain raw-log boundary")

    print("Navigator v2 live Auth recovery attestation contract passed")


if __name__ == "__main__":
    main()
