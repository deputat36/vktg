#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config/nav-v2-live-public-browser-runtime-v1.json"
BUILD_PATH = ROOT / "config/nav-v2-build.json"
TEST_PATH = ROOT / "tests/e2e/live-public-runtime.spec.js"
PACKAGE_PATH = ROOT / "package.json"
WORKFLOW_PATH = ROOT / ".github/workflows/nav-v2-live-public-browser-runtime-v1.yml"
DOC_PATH = ROOT / "docs/NAV_V2_LIVE_PUBLIC_BROWSER_RUNTIME_V1_2026-07-23.md"
BUMPER_PATH = ROOT / "scripts/bump_nav_v2_shared_build.py"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    errors: list[str] = []
    required_paths = [
        CONTRACT_PATH,
        BUILD_PATH,
        TEST_PATH,
        PACKAGE_PATH,
        WORKFLOW_PATH,
        DOC_PATH,
        BUMPER_PATH,
    ]
    for path in required_paths:
        if not path.exists():
            errors.append(f"Missing required file: {path.relative_to(ROOT)}")

    if errors:
        print("Navigator v2 live public browser runtime errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    contract = load_json(CONTRACT_PATH)
    build = load_json(BUILD_PATH)
    package = load_json(PACKAGE_PATH)
    test_source = TEST_PATH.read_text(encoding="utf-8")
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    doc = DOC_PATH.read_text(encoding="utf-8")
    bumper = BUMPER_PATH.read_text(encoding="utf-8")

    if contract.get("schema_version") != 1:
        errors.append("contract schema_version must be 1")
    if contract.get("status") != "repository_only_live_public_browser_runtime_contract":
        errors.append("contract status is not repository-only")
    if contract.get("public_base_url") != "https://deputat36.github.io/vktg/":
        errors.append("public_base_url must be the canonical GitHub Pages URL")
    if contract.get("canonical_build_source") != "config/nav-v2-build.json":
        errors.append("canonical_build_source mismatch")
    if contract.get("source_attestation_contract") != "config/nav-v2-public-build-attestation-v1.json":
        errors.append("source attestation contract mismatch")

    build_id = str(build.get("build_id") or "")
    if not re.fullmatch(r"\d{8}-\d{2}", build_id):
        errors.append("canonical build id must match YYYYMMDD-NN")

    pages = contract.get("representative_pages") or []
    required_pages = {
        "/nav-v2.html?clean=1",
        "/dashboard-v2.html",
        "/deals-v2.html",
        "/queue-v2.html",
        "/admin-v2.html",
    }
    if len(pages) < 5 or len(pages) != len(set(pages)):
        errors.append("representative_pages must contain at least five unique pages")
    if not required_pages.issubset(set(pages)):
        errors.append("representative_pages are missing a required role surface")
    for page in pages:
        rel = str(page).split("?", 1)[0].lstrip("/")
        if not rel or not (ROOT / rel).exists():
            errors.append(f"representative page is missing: {page}")

    if set(contract.get("required_login_selectors") or []) != {
        "#navEmail",
        "#navPassword",
        "#navLogin",
    }:
        errors.append("guest login selectors must remain exact")

    assets = contract.get("required_runtime_assets") or []
    expected_assets = {
        "assets/js/nav-v2/supabase-v2.js",
        "assets/js/nav-v2/auth-storage-guard-v2.js",
    }
    if set(assets) != expected_assets:
        errors.append("required runtime assets must remain exact")
    for asset in assets:
        if not (ROOT / asset).exists():
            errors.append(f"required runtime asset is missing: {asset}")

    if set(contract.get("browser_projects") or []) != {
        "chromium-desktop",
        "chromium-mobile",
    }:
        errors.append("desktop and mobile Chromium projects are both required")

    acceptance = contract.get("acceptance") or {}
    for key in [
        "canonical_build_marker_executed",
        "shared_runtime_resource_observed_with_exact_build_query",
        "storage_guard_resource_observed_with_exact_build_query",
        "guest_login_gate_visible",
        "console_errors_absent",
        "page_errors_absent",
        "local_pr_evidence",
        "source_hash_attestation_before_live_execution",
        "post_merge_live_evidence",
        "scheduled_live_evidence",
    ]:
        if acceptance.get(key) is not True:
            errors.append(f"acceptance flag must be true: {key}")

    boundaries = contract.get("boundaries") or {}
    if boundaries.get("public_pages_only") is not True:
        errors.append("public_pages_only must be true")
    for key in [
        "credentials_used",
        "authenticated_requests",
        "real_accounts_used",
        "technical_accounts_created",
        "supabase_management_api_called",
        "production_api_mutation",
        "production_auth_changed",
        "production_schema_changed",
        "production_data_changed",
        "edge_function_changed",
        "leader_schema_changed",
    ]:
        if boundaries.get(key) is not False:
            errors.append(f"boundary flag must be false: {key}")

    result = contract.get("result") or {}
    pending_decision = "live_public_browser_runtime_contract_prepared_requires_successful_ci"
    passed_decision = f"live_public_browser_runtime_{build_id.replace('-', '_')}_verified_read_only"
    decision = str(result.get("decision") or "")
    if decision not in {pending_decision, passed_decision}:
        errors.append(f"unexpected result decision: {decision}")
    if result.get("authenticated_role_e2e_completed") is not False:
        errors.append("authenticated role E2E must remain false")
    if result.get("live_browser_storage_failure_verified") is not False:
        errors.append("live browser storage failure verification must remain false")

    if decision == pending_decision:
        for key in ["local_browser_runtime_verified", "live_browser_runtime_verified"]:
            if result.get(key) is not False:
                errors.append(f"pending contract must keep {key}=false")
        for key in ["evidence_run_id", "evidence_commit_sha"]:
            if result.get(key) is not None:
                errors.append(f"pending contract must keep {key}=null")
        if "evidence" in contract:
            errors.append("pending contract must not contain current evidence")
        required_doc_state = [
            pending_decision,
            "local_browser_runtime_verified=false",
            "live_browser_runtime_verified=false",
        ]
    elif decision == passed_decision:
        if result.get("local_browser_runtime_verified") is not True:
            errors.append("verified contract must mark local browser runtime true")
        if result.get("live_browser_runtime_verified") is not True:
            errors.append("verified contract must mark live browser runtime true")
        if not isinstance(result.get("evidence_run_id"), int):
            errors.append("verified contract requires numeric evidence_run_id")
        if not isinstance(result.get("evidence_commit_sha"), str) or len(result.get("evidence_commit_sha")) != 40:
            errors.append("verified contract requires full evidence commit SHA")
        if not isinstance(result.get("artifact_id"), int):
            errors.append("verified contract requires artifact_id")
        if not str(result.get("artifact_digest") or "").startswith("sha256:"):
            errors.append("verified contract requires artifact digest")

        evidence = contract.get("evidence") or {}
        if evidence.get("expected_build_id") != build_id:
            errors.append("browser evidence build id mismatch")
        if evidence.get("expected") != 10:
            errors.append("browser evidence must contain ten expected cases")
        if evidence.get("unexpected") != 0:
            errors.append("browser evidence contains unexpected cases")
        if evidence.get("flaky") != 0:
            errors.append("browser evidence contains flaky cases")
        for key in [
            "exact_versioned_shared_module_observed",
            "exact_versioned_storage_guard_observed",
            "guest_login_gate_visible",
            "console_errors_absent",
            "page_errors_absent",
        ]:
            if evidence.get(key) is not True:
                errors.append(f"verified browser evidence missing flag: {key}")
        required_doc_state = [
            passed_decision,
            "local_browser_runtime_verified=true",
            "live_browser_runtime_verified=true",
        ]
    else:
        required_doc_state = []

    required_test_tokens = [
        "contract.representative_pages",
        "data-nav-v2-build",
        "performance.getEntriesByType('resource')",
        "required_login_selectors",
        "expectedBuildId",
        "expectedAssets",
        "resource.version === expectedAsset.version",
        "pageUrlWithinBase",
        "resolved_page_url",
        "expectNoRuntimeFailures",
    ]
    for token in required_test_tokens:
        if token not in test_source:
            errors.append(f"browser test is missing token: {token}")

    scripts = package.get("scripts") or {}
    if scripts.get("test:e2e:live-public-runtime") != (
        "playwright test tests/e2e/live-public-runtime.spec.js"
    ):
        errors.append("package live public runtime command mismatch")

    required_workflow_tokens = [
        "schedule:",
        "cron: '07 6 * * *'",
        "python3 scripts/check_nav_v2_build_version.py",
        "python3 scripts/attest_nav_v2_public_build_v1.py",
        "npm run test:e2e:live-public-runtime",
        "NAV_E2E_BASE_URL: https://deputat36.github.io/vktg/",
        "if: github.event_name != 'pull_request'",
        "if: always() && github.event_name == 'pull_request'",
        "actions/upload-artifact@v4",
        "permissions:\n  contents: read",
    ]
    for token in required_workflow_tokens:
        if token not in workflow:
            errors.append(f"workflow is missing token: {token}")
    if workflow.find("python3 scripts/attest_nav_v2_public_build_v1.py") > workflow.find(
        "NAV_E2E_BASE_URL: https://deputat36.github.io/vktg/"
    ):
        errors.append("source hash attestation must run before live browser execution")
    for forbidden in [
        "secrets.",
        "NAV_E2E_EMAIL",
        "NAV_E2E_PASSWORD",
        "service_role",
        "confirm_cost",
        "create_branch",
        "apply_migration",
        "deploy_edge_function",
        "contents: write",
    ]:
        if forbidden in workflow:
            errors.append(f"workflow contains forbidden cloud/auth token: {forbidden}")

    for marker in [
        "minimum_importmap_pages",
        "normalized",
        "pending_build_id",
        "previous_successful_attestation",
    ]:
        if marker not in bumper:
            errors.append(f"build bumper is missing marker: {marker}")

    for marker in [
        *required_doc_state,
        "authenticated_role_e2e_completed=false",
        "live_browser_storage_failure_verified=false",
        "QuotaExceededError",
        "SecurityError",
        build_id,
        "normalized importmap",
    ]:
        if marker not in doc:
            errors.append(f"documentation is missing marker: {marker}")

    if errors:
        print("Navigator v2 live public browser runtime errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        f"Navigator v2 live public browser runtime contract passed: "
        f"{len(pages)} pages, build {build_id}, decision {decision}, public-only"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
