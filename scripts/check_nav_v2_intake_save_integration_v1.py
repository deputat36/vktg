from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "config/nav-v2-intake-contract-v1.json"
CONTRACT = ROOT / "config/nav-v2-intake-save-integration-v1.json"
ADAPTER = ROOT / "supabase/prototypes/nav_v2_intake_save_adapter_v1.sql"
INTEGRATION = ROOT / "supabase/prototypes/nav_v2_intake_save_integration_v1.sql"
PRODUCTION_MIGRATION = ROOT / "supabase/migrations/20260715224500_nav_v2_minimize_client_identifiers.sql"
SETUP = ROOT / "tests/sql/nav_v2_intake_save_integration_harness_setup.sql"
ASSERTIONS = ROOT / "tests/sql/nav_v2_intake_save_integration_harness_assertions.sql"
ROLLBACK = ROOT / "tests/sql/nav_v2_intake_save_integration_harness_rollback.sql"
SEMANTIC = ROOT / "scripts/check-nav-v2-intake-save-integration-v1.mjs"
DOC = ROOT / "docs/NAV_V2_INTAKE_SAVE_INTEGRATION_V1_2026-07-18.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-intake-save-integration-v1.yml"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def function_snapshot(text: str) -> str:
    marker = "create or replace function nav_v2_private.nav_v2_sanitize_client_deal_json(p_deal jsonb)"
    start = text.find(marker)
    if start < 0:
        return ""
    end = text.find("$function$;", start)
    if end < 0:
        return ""
    return text[start : end + len("$function$;")].strip()


def main() -> int:
    errors: list[str] = []
    paths = (
        CATALOG, CONTRACT, ADAPTER, INTEGRATION, PRODUCTION_MIGRATION, SETUP,
        ASSERTIONS, ROLLBACK, SEMANTIC, DOC, WORKFLOW, STATIC_WORKFLOW,
    )
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    integration = INTEGRATION.read_text(encoding="utf-8")
    production_migration = PRODUCTION_MIGRATION.read_text(encoding="utf-8")
    setup = SETUP.read_text(encoding="utf-8")
    assertions = ASSERTIONS.read_text(encoding="utf-8")
    rollback = ROLLBACK.read_text(encoding="utf-8")
    semantic = SEMANTIC.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")

    if contract.get("contract_version") != 1:
        errors.append("integration contract version must remain 1")
    if contract.get("status") != "repository_only_prototype" or contract.get("production_applied") is not False:
        errors.append("integration contract must remain repository-only and non-production")
    if contract.get("production_call_allowed") is not False or contract.get("write_boundary") != "harness_mock_only":
        errors.append("production call must remain hard-disabled and writes must remain harness-only")
    if (contract.get("request_id") or {}).get("production_ledger_present") is not False:
        errors.append("contract must not claim a production request ledger")

    canonical_rules = {rule.get("id") for rule in catalog.get("rules", [])}
    supported = set((contract.get("legacy_rule_projection") or {}).get("supported") or [])
    unsupported = set((contract.get("legacy_rule_projection") or {}).get("unsupported") or [])
    if supported & unsupported or supported | unsupported != canonical_rules:
        errors.append("supported and unsupported legacy rule inventories must partition all canonical rules")

    production_snapshot = function_snapshot(production_migration)
    harness_snapshot = function_snapshot(setup)
    if not production_snapshot or harness_snapshot != production_snapshot:
        errors.append("PG17 harness sanitizer must exactly match the production migration snapshot")

    require(integration, (
        "Repository-only integration preview",
        "nav_v2_private.nav_v2_prepare_intake_save_v1(p_result)",
        "p_client_request_id uuid",
        "p_server_context jsonb",
        "Trusted server context contains an unknown key",
        "v_prepared_deal->'intake_draft'",
        "nav_v2_private.nav_v2_sanitize_client_deal_json(v_legacy_deal)",
        "'client_request_id', p_client_request_id::text",
        "'fingerprint_scope', 'trusted_context_and_legacy_payload'",
        "'creation_state', 'preview_only'",
        "v_mock_call_allowed := coalesce((v_adapter->>'allowed')::boolean, false)",
        "and v_owner_resolution_complete",
        "and v_rule_parity",
        "and v_document_scope_parity",
        "and v_actor_assignment_parity",
        "'execute', false",
        "'production_call', jsonb_build_object('allowed', false",
        "'production_request_ledger_missing'",
        "'legacy_creates_generic_document_rows'",
        "'legacy_assigns_current_actor'",
        "'writes_performed', false",
        "from public, anon, authenticated",
        "to service_role",
    ), INTEGRATION.name, errors)

    mutating_sql = re.compile(
        r"^\s*(insert\s+into|update\s+|delete\s+from|merge\s+into|truncate\s+|create\s+table|alter\s+table|drop\s+table)",
        re.IGNORECASE | re.MULTILINE,
    )
    if mutating_sql.search(integration):
        errors.append("pure integration preview contains table DDL or mutating DML")
    for forbidden in ("apply_migration", "supabase db push", "supabase migration", "ofewxuqfjhamgerwzull"):
        if forbidden.lower() in integration.lower() or forbidden.lower() in workflow.lower():
            errors.append(f"integration artifacts contain production/deploy marker: {forbidden}")

    require(setup, (
        "BEGIN EXACT PRODUCTION SANITIZER SNAPSHOT 2026-07-18",
        "create table harness.nav_v2_intake_mock_save_calls",
        "client_request_id uuid not null unique",
        "create table harness.nav_v2_intake_mock_request_ledger",
        "create or replace function harness.mock_legacy_save_v1",
        "client_request_id already belongs to another actor or payload",
        "business_writes",
    ), SETUP.name, errors)
    require(assertions, (
        "PostgreSQL 17 assertions passed",
        "client owner_id survived allowlist",
        "client identifier survived sanitizer",
        "mortgage broker was not resolved from trusted context",
        "missing broker assignment passed owner gate",
        "matcap leaked into broker owner resolution",
        "unsupported encumbrance parity gap is missing",
        "seller-only legacy document scope passed",
        "different lead SPN passed legacy actor parity",
        "exact replay crossed business write boundary twice",
        "same request ID accepted another verified actor",
        "same request ID accepted another payload",
        "catalog mismatch reached integration preview",
        "unknown trusted-context key was accepted",
        "null request ID was accepted",
        "integration preview changed deal marker",
    ), ASSERTIONS.name, errors)
    require(rollback, (
        "rollback found unexpected mock writes",
        "drop function if exists nav_v2_private.nav_v2_prepare_intake_legacy_save_v1",
        "integration preview survived rollback",
        "sanitizer snapshot survived rollback",
        "intake save integration rollback passed",
    ), ROLLBACK.name, errors)
    require(semantic, (
        "legacy rule parity inventory must cover all canonical rules",
        "['military_mortgage', 'mortgage']",
        "hard production STOP",
    ), SEMANTIC.name, errors)

    workflow_commands = (
        "python3 scripts/check_nav_v2_intake_save_integration_v1.py",
        "node scripts/check-nav-v2-intake-save-integration-v1.mjs",
        "node scripts/render-nav-v2-intake-server-adapter-v1.mjs --output /tmp/nav_v2_intake_save_adapter_v1.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_adapter_harness_setup.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_save_integration_harness_setup.sql",
        "psql -v ON_ERROR_STOP=1 -f /tmp/nav_v2_intake_save_adapter_v1.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_adapter_harness_assertions.sql",
        "psql -v ON_ERROR_STOP=1 -f supabase/prototypes/nav_v2_intake_save_integration_v1.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_save_integration_harness_assertions.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_save_integration_harness_rollback.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_adapter_harness_rollback.sql",
    )
    positions = []
    for command in workflow_commands:
        position = workflow.find(command)
        positions.append(position)
        if position < 0:
            errors.append(f"{WORKFLOW.name}: missing {command}")
    if all(position >= 0 for position in positions) and positions != sorted(positions):
        errors.append("PG17 workflow must run source, setup, adapter, integration, assertions and rollback in order")
    require(workflow, ("image: postgres:17", "permissions:\n  contents: read", "if: always()"), WORKFLOW.name, errors)

    for command in (
        "python3 scripts/check_nav_v2_intake_save_integration_v1.py",
        "node scripts/check-nav-v2-intake-save-integration-v1.mjs",
    ):
        if command not in static_workflow:
            errors.append(f"{STATIC_WORKFLOW.name}: missing {command}")

    require(doc, (
        "repository-only",
        "Production snapshot",
        "recompute → allowlist → sanitize → legacy save mock",
        "client_request_id",
        "Owner-resolution gate",
        "13 правил",
        "12 правил",
        "PostgreSQL 17",
        "Production STOP",
        "Rollback",
        "Production Supabase не изменён",
    ), DOC.name, errors)

    if errors:
        print("Navigator v2 intake save integration v1 errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 intake save integration v1 passed: exact sanitizer snapshot, request-ID replay, "
        "trusted owner resolution, explicit legacy parity gaps, harness-only write boundary and production STOP"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
