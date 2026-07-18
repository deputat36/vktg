from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-governed-intake-save-boundary-v1.json"
INTEGRATION_CONTRACT = ROOT / "config/nav-v2-intake-save-integration-v1.json"
PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_governed_intake_save_boundary_v1.sql"
SETUP = ROOT / "tests/sql/nav_v2_governed_intake_save_harness_setup.sql"
ASSERTIONS = ROOT / "tests/sql/nav_v2_governed_intake_save_assertions.sql"
CONCURRENT = ROOT / "tests/sql/nav_v2_governed_intake_save_concurrent.sh"
CONCURRENT_ASSERTIONS = ROOT / "tests/sql/nav_v2_governed_intake_save_concurrent_assertions.sql"
ROLLBACK = ROOT / "tests/sql/nav_v2_governed_intake_save_rollback.sql"
SEMANTIC = ROOT / "scripts/check-nav-v2-governed-intake-save-boundary-v1.mjs"
DOC = ROOT / "docs/NAV_V2_GOVERNED_INTAKE_SAVE_BOUNDARY_V1_2026-07-18.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-governed-intake-save-boundary-v1.yml"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (
        CONTRACT, INTEGRATION_CONTRACT, PROTOTYPE, SETUP, ASSERTIONS,
        CONCURRENT, CONCURRENT_ASSERTIONS, ROLLBACK, SEMANTIC, DOC,
        WORKFLOW, STATIC_WORKFLOW,
    )
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    integration_contract = json.loads(INTEGRATION_CONTRACT.read_text(encoding="utf-8"))
    prototype = PROTOTYPE.read_text(encoding="utf-8")
    setup = SETUP.read_text(encoding="utf-8")
    assertions = ASSERTIONS.read_text(encoding="utf-8")
    concurrent = CONCURRENT.read_text(encoding="utf-8")
    concurrent_assertions = CONCURRENT_ASSERTIONS.read_text(encoding="utf-8")
    rollback = ROLLBACK.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")

    if contract.get("contract_version") != 1:
        errors.append("governed contract version must remain 1")
    if contract.get("status") != "repository_only_prototype" or contract.get("production_applied") is not False:
        errors.append("governed boundary must remain repository-only and non-production")
    if contract.get("production_rpc_exposed") is not False or contract.get("write_boundary") != "single_private_transaction":
        errors.append("governed boundary must expose no production RPC and retain one private transaction")
    ledger = contract.get("request_ledger") or {}
    if ledger.get("stranded_started_commit_allowed") is not False:
        errors.append("request ledger must forbid committing a stranded started state")
    if ledger.get("exact_replay_returns_stored_result") is not True or ledger.get("changed_actor_or_payload_rejected") is not True:
        errors.append("request ledger replay binding changed")
    integration_unsupported = set((integration_contract.get("legacy_rule_projection") or {}).get("unsupported") or [])
    if set(contract.get("unsupported_legacy_rules") or []) != integration_unsupported:
        errors.append("governed boundary must retain all integration semantic gaps")

    require(prototype, (
        "Repository-only governed intake save boundary v1",
        "create table nav_v2_private.nav_v2_intake_save_requests_v1",
        "client_request_id uuid primary key",
        "verified_actor_id uuid not null",
        "payload_fingerprint text not null",
        "state in ('started', 'completed')",
        "enable row level security",
        "pg_advisory_xact_lock",
        "deferrable initially deferred",
        "Governed intake request must complete in the same transaction",
        "nav_v2_private.nav_v2_prepare_intake_legacy_save_v1",
        "'replaces_legacy_document_scope', true",
        "'replaces_legacy_actor_assignment', true",
        "'unsupported_rule_semantics'",
        "client_request_id already belongs to another actor or payload",
        "'execute', false",
        "replay_count = replay_count + 1",
        "from public, anon, authenticated",
        "to service_role",
    ), PROTOTYPE.name, errors)
    if re.search(r"create\s+(or\s+replace\s+)?function\s+public\.", prototype, re.IGNORECASE):
        errors.append("governed prototype must not create a public function")
    if "public.nav_" in prototype or "nav_v2_save_wizard_result_legacy" in prototype:
        errors.append("governed prototype must not write or invoke the production legacy boundary")
    for forbidden in ("apply_migration", "supabase db push", "supabase migration", "ofewxuqfjhamgerwzull"):
        if forbidden.lower() in prototype.lower() or forbidden.lower() in workflow.lower():
            errors.append(f"governed artifacts contain deployment marker: {forbidden}")

    require(setup, (
        "create table harness.nav_v2_governed_deals",
        "create table harness.nav_v2_governed_participants",
        "create table harness.nav_v2_governed_documents",
        "create table harness.nav_v2_governed_risks",
        "create table harness.nav_v2_governed_tasks",
        "create table harness.nav_v2_governed_events",
        "create or replace function harness.mock_governed_intake_save_v1",
        "nav_v2_private.nav_v2_build_governed_intake_write_plan_v1",
        "nav_v2_private.nav_v2_begin_intake_save_request_v1",
        "Injected failure after shadow business rows",
        "nav_v2_private.nav_v2_complete_intake_save_request_v1",
    ), SETUP.name, errors)
    require(assertions, (
        "seller-only governed plan retained the legacy document-scope STOP",
        "owner-aware plan retained the legacy current-actor STOP",
        "unsupported encumbrance semantics reached governed write",
        "mortgage plan accepted an unresolved broker",
        "exact replay crossed the business-write boundary twice",
        "same request UUID accepted another verified actor",
        "same request UUID accepted another payload",
        "failed save left a request-ledger row",
        "stranded started ledger state passed the deferred constraint",
        "governed harness changed production-marker deal rows",
        "PostgreSQL 17 sequential assertions passed",
    ), ASSERTIONS.name, errors)
    require(concurrent, (
        "p_delay_seconds => 2",
        "first_pid=$!",
        "second_pid=$!",
        "wait \"${first_pid}\"",
        "wait \"${second_pid}\"",
        "'\"idempotent\": false'",
        "'\"idempotent\": true'",
    ), CONCURRENT.name, errors)
    require(concurrent_assertions, (
        "concurrent exact replay crossed the business-write boundary twice",
        "state = 'completed'",
        "replay_count = 1",
        "concurrent replay stored another deal result",
        "PostgreSQL 17 concurrent replay assertions passed",
    ), CONCURRENT_ASSERTIONS.name, errors)
    require(rollback, (
        "stranded started request",
        "drop function if exists nav_v2_private.nav_v2_complete_intake_save_request_v1",
        "drop table if exists nav_v2_private.nav_v2_intake_save_requests_v1",
        "governed write plan survived rollback",
        "governed request ledger survived rollback",
        "governed intake save overlay rollback passed",
    ), ROLLBACK.name, errors)

    workflow_commands = (
        "python3 scripts/check_nav_v2_governed_intake_save_boundary_v1.py",
        "node scripts/check-nav-v2-governed-intake-save-boundary-v1.mjs",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_adapter_harness_setup.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_save_integration_harness_setup.sql",
        "psql -v ON_ERROR_STOP=1 -f /tmp/nav_v2_intake_save_adapter_v1.sql",
        "psql -v ON_ERROR_STOP=1 -f supabase/prototypes/nav_v2_intake_save_integration_v1.sql",
        "psql -v ON_ERROR_STOP=1 -f supabase/prototypes/nav_v2_governed_intake_save_boundary_v1.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_governed_intake_save_harness_setup.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_governed_intake_save_assertions.sql",
        "bash tests/sql/nav_v2_governed_intake_save_concurrent.sh",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_governed_intake_save_concurrent_assertions.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_governed_intake_save_rollback.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_save_integration_harness_rollback.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_adapter_harness_rollback.sql",
    )
    positions: list[int] = []
    for command in workflow_commands:
        position = workflow.find(command)
        positions.append(position)
        if position < 0:
            errors.append(f"{WORKFLOW.name}: missing {command}")
    if all(position >= 0 for position in positions) and positions != sorted(positions):
        errors.append("PG17 workflow must run apply, replay, recovery and layered rollback in order")
    require(workflow, ("image: postgres:17", "permissions:\n  contents: read", "if: always()"), WORKFLOW.name, errors)

    for command in (
        "python3 scripts/check_nav_v2_governed_intake_save_boundary_v1.py",
        "node scripts/check-nav-v2-governed-intake-save-boundary-v1.mjs",
    ):
        if command not in static_workflow:
            errors.append(f"{STATIC_WORKFLOW.name}: missing {command}")

    require(doc, (
        "repository-only",
        "Production baseline",
        "single transaction",
        "persistent request ledger",
        "Side-aware",
        "Owner-aware",
        "12 semantic gaps",
        "Concurrent replay",
        "Failure recovery",
        "PostgreSQL 17",
        "Production STOP",
        "Phased migration storyboard",
        "Rollback",
        "Production Supabase не изменён",
    ), DOC.name, errors)

    if errors:
        print("Navigator v2 governed intake save boundary v1 errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 governed intake save boundary v1 passed: private atomic ledger, "
        "owner/side-aware row plan, exact and concurrent replay, failure recovery, rollback and production STOP"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
