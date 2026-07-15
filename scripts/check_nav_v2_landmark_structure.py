from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

MODEL = ROOT / "assets/js/nav-v2/landmark-structure-model-v2.js"
RUNTIME = ROOT / "assets/js/nav-v2/landmark-structure-v2.js"
MOBILE = ROOT / "assets/js/nav-v2/mobile-first-screen-v2.js"
NODE_CHECK = ROOT / "scripts/check-nav-v2-landmark-structure.mjs"
BROWSER = ROOT / "tests/e2e/landmark-structure.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-landmark-structure.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-landmark-structure.yml"
PAGES = tuple(ROOT / name for name in ("dashboard-v2.html", "deals-v2.html", "deal-card-v2.html", "manager-v2.html"))

for path in (MODEL, RUNTIME, MOBILE, NODE_CHECK, BROWSER, FIXTURE, WORKFLOW, *PAGES):
    if not path.exists():
        ERRORS.append(f"Missing landmark structure file: {path.relative_to(ROOT)}")

if not ERRORS:
    model = MODEL.read_text(encoding="utf-8")
    runtime = RUNTIME.read_text(encoding="utf-8")
    mobile = MOBILE.read_text(encoding="utf-8")
    node_check = NODE_CHECK.read_text(encoding="utf-8")
    browser = BROWSER.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    for marker in (
        "export function normalizeLandmarkSurface",
        "export function landmarkStructurePolicy",
        "export function stableLandmarkId",
        "export function virtualHeadingPolicy",
        "oneMainPerSurface: true",
        "oneH1PerSurface: true",
        "statusAndAlertAreNotPromotedToRegions: true",
        "storageAllowed: false",
    ):
        if marker not in model:
            ERRORS.append(f"Landmark pure model missing marker: {marker}")

    for forbidden in ("document.", "window.", "localStorage", "sessionStorage", "indexedDB", "fetch(", "rpc("):
        if forbidden in model:
            ERRORS.append(f"Landmark pure model must remain DOM/network/storage-free: {forbidden}")

    for marker in (
        "export function applyLandmarkStructure",
        "main.setAttribute('aria-labelledby'",
        "container.setAttribute('aria-labelledby'",
        "heading.setAttribute('role', policy.role)",
        "heading.setAttribute('aria-level', policy.ariaLevel)",
        "status.removeAttribute('aria-labelledby')",
        "data.navHeadingSequence",
        "role=\"status\"",
        "role=\"alert\"",
    ):
        if marker not in runtime:
            ERRORS.append(f"Landmark runtime missing marker: {marker}")

    for forbidden in (
        "MutationObserver",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "document.cookie",
        "fetch(",
        "sendBeacon",
        "XMLHttpRequest",
        "WebSocket",
        "rpc(",
        "supabase",
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
    ):
        if forbidden in runtime:
            ERRORS.append(f"Landmark runtime must remain DOM-only and read-only: {forbidden}")

    for marker in (
        "import { applyLandmarkStructure }",
        "applyLandmarkStructure(root)",
        "applyLandmarkStructure(document)",
    ):
        if marker not in mobile:
            ERRORS.append(f"Shared lifecycle missing landmark marker: {marker}")

    remap = '"./mobile-first-screen-v2.js?v=20260715-01": "./assets/js/nav-v2/mobile-first-screen-v2.js?v=20260715-04"'
    direct_entry = '<script type="module" src="./assets/js/nav-v2/landmark-structure-v2.js'
    for page in PAGES:
        text = page.read_text(encoding="utf-8")
        if text.count(remap) != 1:
            ERRORS.append(f"{page.name} must publish landmark lifecycle cache-bust exactly once")
        if direct_entry in text:
            ERRORS.append(f"{page.name} must not increase entry-module budget")

    for marker in (
        "Navigator v2 landmark and heading structure semantic checks passed",
        "landmarkStructurePolicy",
        "stableLandmarkId",
        "virtualHeadingPolicy",
    ):
        if marker not in node_check:
            ERRORS.append(f"Landmark semantic check missing marker: {marker}")

    for marker in (
        "dashboard exposes one named main and ordered regions",
        "deals expose named workspace and deal article headings",
        "deal card names action-first regions without promoting live status",
        "manager exposes named decision and confirmed result structure",
        "toHaveAccessibleName",
        "data-nav-heading-sequence",
        "chromium-mobile",
    ):
        if marker not in browser:
            ERRORS.append(f"Landmark browser regression missing marker: {marker}")

    for marker in (
        "mobile-first-screen-dashboard",
        "mobile-first-screen-deals",
        "mobile-first-screen-card",
        "mobile-first-screen-manager",
        "applyMobileFirstScreenDisclosure(document)",
        "role=\"status\"",
        "role=\"alert\"",
    ):
        if marker not in fixture:
            ERRORS.append(f"Landmark fixture missing marker: {marker}")

    for marker in (
        "node scripts/check-nav-v2-landmark-structure.mjs",
        "python3 scripts/check_nav_v2_landmark_structure.py",
        "tests/e2e/landmark-structure.spec.js",
        "chromium-desktop",
        "chromium-mobile",
        "npx playwright install --with-deps chromium",
    ):
        if marker not in workflow:
            ERRORS.append(f"Landmark workflow missing marker: {marker}")

if ERRORS:
    print("Navigator v2 landmark structure errors:")
    for error in ERRORS:
        print(f"- {error}")
    sys.exit(1)

print(
    "Navigator v2 landmark structure contract passed: one named main/h1, named action-first regions, "
    "level-3 item headings, live status boundaries preserved, no layout/network/storage changes"
)
