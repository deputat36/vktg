from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

RUNTIME = ROOT / "assets/js/nav-v2/ux-measurement-v2.js"
MODEL = ROOT / "assets/js/nav-v2/ux-measurement-model-v2.js"
SERVER_MODEL = ROOT / "assets/js/nav-v2/ux-server-measurement-model-v2.js"
DOC = ROOT / "docs/NAV_V2_UX_MEASUREMENT_CONTRACT.md"
NODE_CHECK = ROOT / "scripts/check-nav-v2-ux-measurement.mjs"
BROWSER_SPEC = ROOT / "tests/e2e/ux-measurement.spec.js"
FIXTURE = ROOT / "tests/fixtures/nav-v2-ux-measurement.html"
WORKFLOW = ROOT / ".github/workflows/nav-v2-ux-measurement.yml"
PAGES = (
    ROOT / "dashboard-v2.html",
    ROOT / "deals-v2.html",
    ROOT / "deal-card-v2.html",
    ROOT / "manager-v2.html",
)

REQUIRED = (RUNTIME, MODEL, SERVER_MODEL, DOC, NODE_CHECK, BROWSER_SPEC, FIXTURE, WORKFLOW, *PAGES)
for path in REQUIRED:
    if not path.exists():
        ERRORS.append(f"Missing privacy-safe UX measurement file: {path.relative_to(ROOT)}")

if not ERRORS:
    runtime = RUNTIME.read_text(encoding="utf-8")
    model = MODEL.read_text(encoding="utf-8")
    server_model = SERVER_MODEL.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    for page in PAGES:
        text = page.read_text(encoding="utf-8")
        marker = '<script type="module" src="./assets/js/nav-v2/ux-measurement-v2.js?v=20260715-01"></script>'
        if text.count(marker) != 1:
            ERRORS.append(f"{page.name} must load the UX measurement module exactly once")

    runtime_markers = (
        "nav-v2:ux-measurement",
        "primary_action_opened",
        "secondary_details_opened",
        "mobile-first-screen-primary-action",
        "CustomEvent",
        "event-only-v1",
        "startNavV2UxMeasurement",
    )
    for marker in runtime_markers:
        if marker not in runtime:
            ERRORS.append(f"UX runtime missing marker: {marker}")

    forbidden_runtime = (
        "fetch(",
        "sendBeacon",
        "XMLHttpRequest",
        "WebSocket",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "document.cookie",
        "rpc(",
        "supabase",
        "MutationObserver",
    )
    for marker in forbidden_runtime:
        if marker in runtime:
            ERRORS.append(f"UX runtime must remain event-only and storage/network-free: {marker}")

    model_markers = (
        "UX_MEASUREMENT_SCHEMA_VERSION = 1",
        "buildUxMeasurementEvent",
        "surfaceFromPath",
        "viewportBucket",
        "uiLatencyBucket",
        "workflowDurationBucket",
        "server_result_observed",
        "spn_recheck_observed",
    )
    for marker in model_markers:
        if marker not in model:
            ERRORS.append(f"UX model missing marker: {marker}")

    forbidden_pure = (
        "document.",
        "window.",
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "fetch(",
        "rpc(",
    )
    for marker in forbidden_pure:
        if marker in model:
            ERRORS.append(f"UX schema model must remain pure: {marker}")
        if marker in server_model:
            ERRORS.append(f"UX server measurement model must remain pure: {marker}")

    for marker in (
        "buildDealCompletionEvidence",
        "buildServerUxMeasurements",
        "returned_to_spn_rework",
        "spn_rework_submitted",
        "deal_review_added",
        "workflowDurationBucket",
    ):
        if marker not in server_model:
            ERRORS.append(f"UX server measurement model missing marker: {marker}")

    forbidden_event_fields = (
        "deal_id",
        "task_id",
        "document_id",
        "risk_id",
        "event_id",
        "actor_id",
        "email",
        "phone",
        "address",
        "comment",
        "body",
        "title",
        "timestamp",
    )
    event_builder = model[model.find("export function buildUxMeasurementEvent") :]
    for marker in forbidden_event_fields:
        if marker in event_builder:
            ERRORS.append(f"UX event output contract must not expose field: {marker}")

    for marker in (
        "event-only",
        "CustomEvent",
        "Локальный клик не считается",
        "UUID сделки",
        "Роль пользователя не передаётся браузером",
        "не строить персональные рейтинги",
        "выборкой менее пяти",
        "не является разрешением на создание таблицы telemetry",
    ):
        if marker not in doc:
            ERRORS.append(f"UX measurement contract missing privacy marker: {marker}")

    for marker in (
        "node scripts/check-nav-v2-ux-measurement.mjs",
        "python3 scripts/check_nav_v2_ux_measurement.py",
        "tests/e2e/ux-measurement.spec.js",
        "npx playwright install --with-deps chromium",
    ):
        if marker not in workflow:
            ERRORS.append(f"UX measurement workflow missing marker: {marker}")

if ERRORS:
    print("Navigator v2 privacy-safe UX measurement errors:")
    for error in ERRORS:
        print(f"- {error}")
    sys.exit(1)

print(
    "Navigator v2 privacy-safe UX measurement contract passed: enum-only events, "
    "no identifiers or free text, no network/storage, server-confirmed outcome definitions"
)
