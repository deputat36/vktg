#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "assets/css/nav-v2-mobile-first-screen.css"
POLICY = ROOT / "config/nav-v2-mobile-first-screen.json"
FIXTURE = ROOT / "tests/fixtures/nav-v2-mobile-first-screen.html"
E2E = ROOT / "tests/e2e/mobile-first-screen.spec.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-mobile-first-screen.mjs"
WORKFLOW = ROOT / ".github/workflows/nav-v2-mobile-first-screen.yml"
PACKAGE = ROOT / "package.json"
PAGES = {
    "dashboard-v2.html": ("nav-mobile-dashboard", 'data-mobile-surface="dashboard"'),
    "deals-v2.html": ("nav-mobile-deals", 'data-mobile-surface="deals"'),
    "deal-card-v2.html": ("nav-mobile-deal-card", 'data-mobile-surface="deal-card"'),
    "manager-v2.html": ("nav-mobile-manager", 'data-mobile-surface="manager"'),
}

errors: list[str] = []
required_paths = [CSS, POLICY, FIXTURE, E2E, SEMANTIC, WORKFLOW, PACKAGE]
required_paths.extend(ROOT / page for page in PAGES)
for path in required_paths:
    if not path.exists():
        errors.append(f"missing {path.relative_to(ROOT)}")

if not errors:
    stylesheet = CSS.read_text(encoding="utf-8")
    for marker in (
        "@media (max-width: 430px)",
        ".nav-mobile-dashboard .role-home-priority-card:nth-child(n + 2)",
        ".nav-mobile-dashboard .role-home-quick-actions",
        ".nav-mobile-deals .deals-quick-mode:nth-child(n + 3)",
        ".nav-mobile-deals .deals-workspace > .section-title > .btn.primary",
        ".nav-mobile-deal-card:has(#dealCompletionEvidenceV2) #dealActionFocus",
        ".nav-mobile-deal-card .nav-v2-shell > .kpi-row + .kpi-row",
        ".nav-mobile-manager .manager-tabs .tab:nth-child(n + 3)",
        ".nav-mobile-manager .manager-card-actions .btn:nth-child(n + 4)",
    ):
        if marker not in stylesheet:
            errors.append(f"mobile stylesheet missing marker: {marker}")

    for forbidden in ("display: none !important", "position: fixed", "nav_v2_update_", "supabase"):
        if forbidden in stylesheet:
            errors.append(f"mobile stylesheet contains forbidden marker: {forbidden}")

    for page, markers in PAGES.items():
        text = (ROOT / page).read_text(encoding="utf-8")
        if "nav-v2-mobile-first-screen.css?v=20260715-01" not in text:
            errors.append(f"{page} does not load the mobile first-screen stylesheet")
        if "nav-mobile-first" not in text:
            errors.append(f"{page} does not opt into mobile first-screen mode")
        for marker in markers:
            if marker not in text:
                errors.append(f"{page} missing surface marker: {marker}")

    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    if policy.get("schema_version") != 1:
        errors.append("mobile policy schema_version must be 1")
    if policy.get("min_test_width_px") != 360 or policy.get("max_width_px") != 430:
        errors.append("mobile policy must cover widths 360 through 430")
    if policy.get("first_screen_height_px", 0) < 760:
        errors.append("mobile first-screen height must cover a realistic phone viewport")

    expected = {
        "dashboard": (1, 2),
        "deals": (1, 3),
        "deal-card": (1, 2),
        "manager": (1, 2),
    }
    for surface, (primary, context) in expected.items():
        rules = (policy.get("surfaces") or {}).get(surface) or {}
        if rules.get("required_primary_actions") != primary:
            errors.append(f"{surface} must keep exactly {primary} primary action")
        if rules.get("max_context_actions") != context:
            errors.append(f"{surface} context budget must be {context}")

    fixture = FIXTURE.read_text(encoding="utf-8")
    for surface in expected:
        if f'data-fixture-surface="{surface}"' not in fixture:
            errors.append(f"browser fixture missing surface: {surface}")
    for marker in (
        "data-fixture-primary",
        "data-fixture-context",
        "nav-v2-mobile-first-screen.css",
        "dealCompletionEvidenceV2",
        "manager-decision-card",
    ):
        if marker not in fixture:
            errors.append(f"browser fixture missing marker: {marker}")

    e2e = E2E.read_text(encoding="utf-8")
    for marker in (
        "policy.min_test_width_px",
        "policy.max_width_px",
        "document.documentElement.scrollWidth - window.innerWidth",
        "primary action must be reachable without a long scroll",
        "keeps desktop controls available",
        "#dealActionFocus",
        ".manager-card-actions .btn.light",
    ):
        if marker not in e2e:
            errors.append(f"mobile browser regression missing marker: {marker}")

    semantic = SEMANTIC.read_text(encoding="utf-8")
    for marker in (
        "selectFirstScreenActions",
        "hero-primary-duplicate",
        "action-focus-duplicate",
        "confirmed-result-link",
        "mobile first-screen action-budget semantics passed",
    ):
        if marker not in semantic:
            errors.append(f"mobile semantic regression missing marker: {marker}")

    package = json.loads(PACKAGE.read_text(encoding="utf-8"))
    public_command = (package.get("scripts") or {}).get("test:e2e:public", "")
    if "tests/e2e/mobile-first-screen.spec.js" not in public_command:
        errors.append("public E2E command does not run mobile first-screen regression")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    for marker in (
        "python3 scripts/check_nav_v2_mobile_first_screen.py",
        "node scripts/check-nav-v2-mobile-first-screen.mjs",
        "npm run test:e2e:public",
        "npx playwright install --with-deps chromium",
    ):
        if marker not in workflow:
            errors.append(f"mobile workflow missing marker: {marker}")

if errors:
    print("Navigator v2 mobile first-screen contract errors:")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("Navigator v2 mobile first-screen static contract passed")
