#!/usr/bin/env python3
"""Validate the offline-only concurrent Auth refresh test contract."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-auth-concurrent-refresh-tests-v1.json"
TEST = ROOT / "tests/unit/nav-v2-auth-concurrent-refresh.test.mjs"
EXISTING_TEST = ROOT / "tests/unit/nav-v2-auth-session-recovery.test.mjs"
RUNTIME = ROOT / "assets/js/nav-v2/supabase-v2.js"
HELPER = ROOT / "assets/js/nav-v2/auth-session-recovery-v2.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-auth-concurrent-refresh-tests-v1.yml"
DOC = ROOT / "docs/NAV_V2_AUTH_CONCURRENT_REFRESH_TESTS_V1_2026-07-22.md"

EXPECTED_DECISION = "concurrent_auth_refresh_fan_in_covered_by_offline_unit_tests"


def require(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def main() -> None:
    for path in (CONFIG, TEST, EXISTING_TEST, RUNTIME, HELPER, WORKFLOW, DOC):
        require(path.is_file(), f"missing {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    test = TEST.read_text(encoding="utf-8")
    existing = EXISTING_TEST.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    helper = HELPER.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config.get("schema_version") == 1, "schema version drift")
    require(config.get("production_applied") is False, "production_applied must be false")
    require(config.get("production_auth_changed") is False, "production auth must remain unchanged")
    require(config.get("cloud_execution_allowed") is False, "cloud execution must remain blocked")
    require(config.get("runtime_code_changed") is False, "this slice must not claim runtime code changes")
    require(config.get("result", {}).get("decision") == EXPECTED_DECISION, "decision drift")

    scenarios = config.get("scenarios", [])
    require(len(scenarios) == 2, "exactly two concurrency scenarios required")
    valid = scenarios[0]
    invalid = scenarios[1]
    require(valid.get("expected_refresh_count") == 1, "valid fan-in must refresh once")
    require(valid.get("expected_retry_count") == 2, "valid fan-in must retry both RPCs")
    require(invalid.get("expected_refresh_count") == 1, "invalid fan-in must refresh once")
    require(invalid.get("expected_retry_count") == 0, "invalid fan-in must not retry RPCs")

    boundary = config.get("test_boundary", {})
    for key in (
        "network_calls_mocked",
        "browser_lock_mocked",
        "storage_in_memory",
    ):
        require(boundary.get(key) is True, f"{key} must be true")
    for key in (
        "supabase_management_api_called",
        "production_api_called",
        "real_accounts_used",
        "technical_accounts_created",
        "real_tokens_used",
        "real_user_data_used",
    ):
        require(boundary.get(key) is False, f"{key} must be false")
    require(boundary.get("fixture_email_domain") == "example.test", "fixture domain must remain reserved")

    result = config.get("result", {})
    for key in (
        "authenticated_role_e2e_completed",
        "live_multi_tab_browser_e2e_completed",
        "preview_branch_ready",
        "production_auth_change_ready",
    ):
        require(result.get(key) is False, f"{key} must remain false")

    for snippet in (
        "Promise.all([",
        "Promise.allSettled([",
        "parallel RPC failures must fan in to one refresh request",
        "invalid parallel refresh must still call the token endpoint once",
        "retryRpcCalls, 0",
        "NAV_AUTH_REFRESH_LOCK_NAME",
        "NAV_AUTH_SESSION_EXPIRED",
        "globalThis.fetch = async",
        "MemoryStorage",
    ):
        require(snippet in test, f"concurrency test missing: {snippet}")

    emails = re.findall(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+)", test)
    require(emails, "synthetic email fixtures expected")
    require(all(domain == "example.test" for domain in emails), "only example.test email fixtures allowed")
    require("ofewxuqfjhamgerwzull" not in test, "production project ref must not enter unit test")
    require("supabase.co" not in test, "production Supabase hostname must not enter unit test")
    require("fetch(" not in test.replace("globalThis.fetch", ""), "test must not call an unmocked fetch function")

    require("let refreshRequest = null" in runtime, "runtime shared refresh promise missing")
    require("if (refreshRequest)" in runtime, "runtime fan-in guard missing")
    require("return refreshRequest" in runtime, "runtime shared refresh return missing")
    require("NAV_AUTH_REFRESH_LOCK_NAME" in runtime, "runtime lock integration missing")
    require("refresh_token_not_found" in helper, "invalid refresh classification missing")

    require("valid refresh must retry the RPC exactly once" in existing, "existing valid recovery assertion missing")
    require("invalid refresh flow must stop before a second RPC retry" in existing, "existing invalid recovery assertion missing")

    for prohibited in (
        "curl ",
        "wget ",
        "psql ",
        "supabase ",
        "confirm_cost",
        "create_branch",
        "apply_migration",
        "deploy_edge_function",
    ):
        require(prohibited not in workflow.lower(), f"workflow contains prohibited token: {prohibited}")
    require("node tests/unit/nav-v2-auth-concurrent-refresh.test.mjs" in workflow, "new concurrency test not executed")
    require("node tests/unit/nav-v2-auth-session-recovery.test.mjs" in workflow, "existing recovery suite not executed")
    require("python3 scripts/check_nav_v2_auth_concurrent_refresh_tests_v1.py" in workflow, "source checker not executed")

    require(EXPECTED_DECISION in doc, "documentation decision drift")
    require("не является live multi-tab browser E2E" in doc, "documentation must retain browser E2E boundary")

    print("Navigator v2 concurrent Auth refresh test contract passed")


if __name__ == "__main__":
    main()
