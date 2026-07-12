from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

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

if ERRORS:
    print("Navigator E2E contract errors:")
    for error in ERRORS:
        print(f"- {error}")
    sys.exit(1)

print("Navigator E2E contract passed: pinned Playwright, branch-only credentials, role matrix and evidence")
