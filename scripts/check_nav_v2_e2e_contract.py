from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

TARGET_PLAN = "config/nav-v2-e2e-target-plan.json"
TARGET_RUNBOOK = "docs/NAV_V2_AUTH_E2E_TARGET_RUNBOOK.md"
PRODUCTION_REF = "ofewxuqfjhamgerwzull"

REQUIRED = (
    "package.json",
    "package-lock.json",
    "playwright.config.mjs",
    ".github/workflows/nav-v2-authenticated-e2e.yml",
    "scripts/check-nav-v2-e2e-env.mjs",
    "scripts/prepare-nav-v2-e2e-config.mjs",
    "tests/e2e/helpers.mjs",
    "tests/e2e/public-smoke.spec.js",
    "tests/e2e/authenticated-smoke.spec.js",
    "tests/e2e/README.md",
    TARGET_PLAN,
    TARGET_RUNBOOK,
)

for rel in REQUIRED:
    if not (ROOT / rel).exists():
        ERRORS.append(f"Missing Navigator E2E contract file: {rel}")

if not ERRORS:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    version = (package.get("devDependencies") or {}).get("@playwright/test")
    if version != "1.61.1":
        ERRORS.append(f"@playwright/test must be pinned to 1.61.1, got {version!r}")
    lock_version = (((lock.get("packages") or {}).get("") or {}).get("devDependencies") or {}).get("@playwright/test")
    if lock_version != version:
        ERRORS.append("package-lock root Playwright version must match package.json")

    workflow = (ROOT / ".github/workflows/nav-v2-authenticated-e2e.yml").read_text(encoding="utf-8")
    for marker in (
        "pull_request:",
        "workflow_dispatch:",
        "environment: navigator-e2e",
        "NAV_E2E_SUPABASE_URL",
        "NAV_E2E_SUPABASE_PUBLISHABLE_KEY",
        "NAV_E2E_ADMIN_EMAIL",
        "NAV_E2E_MANAGER_EMAIL",
        "NAV_E2E_SPN_EMAIL",
        "NAV_E2E_LAWYER_EMAIL",
        "NAV_E2E_BROKER_EMAIL",
        "NAV_E2E_VIEWER_EMAIL",
        "npm run test:e2e:public",
        "npm run test:e2e:authenticated",
        TARGET_PLAN,
        TARGET_RUNBOOK,
    ):
        if marker not in workflow:
            ERRORS.append(f"E2E workflow missing contract marker: {marker}")

    preflight = (ROOT / "scripts/check-nav-v2-e2e-env.mjs").read_text(encoding="utf-8")
    if "startsWith('nav-e2e')" not in preflight:
        ERRORS.append("E2E preflight must enforce the nav-e2e account prefix")
    if "Authenticated E2E must not target the production Supabase project" not in preflight:
        ERRORS.append("E2E preflight must reject the production Supabase project")

    config = (ROOT / "playwright.config.mjs").read_text(encoding="utf-8")
    for project in ("chromium-desktop", "chromium-mobile"):
        if project not in config:
            ERRORS.append(f"Playwright config missing project: {project}")

    auth_test = (ROOT / "tests/e2e/authenticated-smoke.spec.js").read_text(encoding="utf-8")
    for marker in (
        "viewer must not see mutation controls",
        "NAV_E2E_SPN_FORBIDDEN_DEAL_ID",
        "Нет доступа к разделу",
        "expectNoRuntimeFailures",
    ):
        if marker not in auth_test:
            ERRORS.append(f"Authenticated E2E test missing evidence marker: {marker}")

    readme = (ROOT / "tests/e2e/README.md").read_text(encoding="utf-8")
    for marker in (
        TARGET_RUNBOOK,
        TARGET_PLAN,
        "0.01344",
        "0.08064",
        "generic-команда «продолжай» не считается подтверждением стоимости",
        "Максимальное плановое время жизни — 6 часов",
    ):
        if marker not in readme:
            ERRORS.append(f"E2E README missing cost-control marker: {marker}")

    runbook = (ROOT / TARGET_RUNBOOK).read_text(encoding="utf-8")
    for marker in (
        "A generic instruction to continue project work is not cost approval.",
        "preview branch usage is not protected by the Supabase Spend Cap",
        "do not merge the branch back to production",
        "branch lifetime reaches 6 hours",
        "final branch-list evidence showing deletion",
        "No paid action is authorized by this document.",
    ):
        if marker not in runbook:
            ERRORS.append(f"E2E target runbook missing safety marker: {marker}")

    plan = json.loads((ROOT / TARGET_PLAN).read_text(encoding="utf-8"))
    if plan.get("schema_version") != 1:
        ERRORS.append("E2E target plan schema_version must be 1")
    if plan.get("status") != "approval_required":
        ERRORS.append("E2E target plan must remain approval_required in repository")
    if plan.get("production_project_ref") != PRODUCTION_REF:
        ERRORS.append("E2E target plan production project ref drifted")

    approval = plan.get("approval") or {}
    if approval.get("explicit_user_confirmation_required") is not True:
        ERRORS.append("E2E target plan must require explicit user cost confirmation")
    if approval.get("confirmed") is not False:
        ERRORS.append("Repository target plan must not claim cost approval")
    if approval.get("branch_creation_allowed") is not False:
        ERRORS.append("Repository target plan must keep branch creation disabled")

    cost = plan.get("cost_snapshot") or {}
    amount = cost.get("amount_usd")
    if not isinstance(amount, (int, float)) or amount <= 0:
        ERRORS.append("E2E target plan must contain a positive hourly cost snapshot")
    if cost.get("recurrence") != "hourly":
        ERRORS.append("E2E target plan cost recurrence must be hourly")
    if not str(cost.get("checked_at") or "").startswith("2026-"):
        ERRORS.append("E2E target plan cost snapshot date is missing")

    branch = plan.get("branch") or {}
    if branch.get("requested_name") != "navigator-e2e":
        ERRORS.append("E2E target branch name drifted")
    if branch.get("with_production_data") is not False:
        ERRORS.append("E2E target must not copy production data")
    if branch.get("persistent") is not False:
        ERRORS.append("E2E target must not be persistent")
    if branch.get("merge_to_production_allowed") is not False:
        ERRORS.append("E2E target must not be mergeable to production")
    if branch.get("delete_immediately_after_evidence_capture") is not True:
        ERRORS.append("E2E target must be deleted after evidence capture")

    max_hours = branch.get("max_lifetime_hours")
    ceiling = branch.get("estimated_compute_ceiling_usd")
    if not isinstance(max_hours, int) or not 1 <= max_hours <= 6:
        ERRORS.append("E2E target max lifetime must be an integer from 1 to 6 hours")
    if isinstance(amount, (int, float)) and isinstance(max_hours, int):
        expected_ceiling = amount * max_hours
        if not isinstance(ceiling, (int, float)) or not math.isclose(ceiling, expected_ceiling, rel_tol=0, abs_tol=1e-9):
            ERRORS.append(
                f"E2E target compute ceiling must equal hourly cost * max hours ({expected_ceiling:.5f})"
            )

    policy = plan.get("data_policy") or {}
    for key in (
        "production_data_copy_allowed",
        "real_client_data_allowed",
        "real_employee_credentials_allowed",
    ):
        if policy.get(key) is not False:
            ERRORS.append(f"E2E data policy must keep {key}=false")
    if policy.get("technical_account_prefix") != "nav-e2e":
        ERRORS.append("E2E technical account prefix drifted")
    if policy.get("technical_full_name_prefix") != "[NAV E2E]":
        ERRORS.append("E2E technical full-name prefix drifted")

    required_roles = set(plan.get("required_roles") or [])
    if required_roles != {"admin", "manager", "spn", "lawyer", "broker", "viewer"}:
        ERRORS.append("E2E required role set drifted")
    if set(plan.get("optional_roles") or []) != {"owner"}:
        ERRORS.append("E2E optional role set must contain owner only")

    controls = plan.get("required_controls") or {}
    for key in (
        "production_ref_rejected_by_preflight",
        "publishable_key_only",
        "service_role_secret_forbidden",
        "manual_workflow_dispatch",
        "browser_artifacts_required",
        "cleanup_verification_required",
    ):
        if controls.get(key) is not True:
            ERRORS.append(f"E2E required control must keep {key}=true")
    if controls.get("workflow_environment") != "navigator-e2e":
        ERRORS.append("E2E workflow environment drifted")

    cleanup = plan.get("cleanup_acceptance") or {}
    if cleanup.get("branch_deleted") is not True:
        ERRORS.append("E2E cleanup must require branch deletion")
    if cleanup.get("technical_auth_users_remaining") != 0:
        ERRORS.append("E2E cleanup must require zero technical Auth users")
    if cleanup.get("active_technical_profiles_remaining") != 0:
        ERRORS.append("E2E cleanup must require zero active technical profiles")
    if cleanup.get("open_follow_up_for_failed_cleanup") is not True:
        ERRORS.append("E2E cleanup failure must require a follow-up issue")

if ERRORS:
    print("Navigator E2E contract errors:")
    for error in ERRORS:
        print(f"- {error}")
    sys.exit(1)

print(
    "Navigator E2E contract passed: pinned Playwright, branch-only credentials, role matrix, "
    "cost approval gate, six-hour lifetime ceiling and verified cleanup evidence"
)
