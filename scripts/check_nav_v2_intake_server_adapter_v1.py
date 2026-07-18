from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "config/nav-v2-intake-contract-v1.json"
RENDERER = ROOT / "scripts/render-nav-v2-intake-server-adapter-v1.mjs"
SEMANTIC = ROOT / "scripts/check-nav-v2-intake-server-adapter-v1.mjs"
PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_intake_save_adapter_v1.sql"
SETUP = ROOT / "tests/sql/nav_v2_intake_adapter_harness_setup.sql"
ASSERTIONS = ROOT / "tests/sql/nav_v2_intake_adapter_harness_assertions.sql"
ROLLBACK = ROOT / "tests/sql/nav_v2_intake_adapter_harness_rollback.sql"
DOC = ROOT / "docs/NAV_V2_INTAKE_SERVER_ADAPTER_V1_2026-07-18.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-intake-server-adapter-v1.yml"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (CATALOG, RENDERER, SEMANTIC, PROTOTYPE, SETUP, ASSERTIONS, ROLLBACK, DOC, WORKFLOW, STATIC_WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    renderer = RENDERER.read_text(encoding="utf-8")
    semantic = SEMANTIC.read_text(encoding="utf-8")
    prototype = PROTOTYPE.read_text(encoding="utf-8")
    setup = SETUP.read_text(encoding="utf-8")
    assertions = ASSERTIONS.read_text(encoding="utf-8")
    rollback = ROLLBACK.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")

    if catalog.get("contract_version") != 1 or len(catalog.get("rules") or []) != 25:
        errors.append("canonical intake catalog must remain contract v1 with all 25 rules")
    broker_rules = sorted(rule.get("id") for rule in catalog.get("rules", []) if rule.get("owner") == "broker")
    if broker_rules != ["military_mortgage", "mortgage"]:
        errors.append("canonical broker scope must remain mortgage-only")

    if "supabase/migrations" in PROTOTYPE.parts:
        errors.append("server adapter prototype must not be stored as a migration")
    if prototype.count("__NAV_V2_INTAKE_CATALOG_JSON__") != 1:
        errors.append("SQL template must have exactly one catalog JSON marker")
    if prototype.count("__NAV_V2_INTAKE_CATALOG_SHA256__") != 1:
        errors.append("SQL template must have exactly one catalog SHA-256 marker")
    require(prototype, (
        "Repository-only template",
        "security invoker",
        "nav_v2_private.nav_v2_prepare_intake_save_v1",
        "nav_v2_intake_contains_forbidden_key_v1",
        "v_deal - 'legal_passport' - 'intake_work_plan'",
        "'ready_tasks', '[]'::jsonb",
        "'assignment_source', 'server_required'",
        "'intake-rule:' || (rule->>'id')",
        "'writes_performed', false",
        "rule->>'id' <> all(array['mortgage', 'military_mortgage'])",
        "revoke all on function nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb) from public, anon, authenticated",
        "grant execute on function nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb) to service_role",
    ), PROTOTYPE.name, errors)

    mutating_sql = re.compile(
        r"^\s*(insert\s+into|update\s+|delete\s+from|merge\s+into|truncate\s+|create\s+table|alter\s+table|drop\s+table)",
        re.IGNORECASE | re.MULTILINE,
    )
    if mutating_sql.search(prototype):
        errors.append("pure server adapter template contains table DDL or mutating DML")
    for forbidden in ("ofewxuqfjhamgerwzull", "apply_migration", "supabase db push", "supabase migration"):
        if forbidden.lower() in prototype.lower():
            errors.append(f"server adapter prototype contains production/deploy marker: {forbidden}")

    require(renderer, (
        "JSON.stringify(catalog)",
        "createHash('sha256')",
        "__NAV_V2_INTAKE_CATALOG_JSON__",
        "__NAV_V2_INTAKE_CATALOG_SHA256__",
        "--output",
    ), RENDERER.name, errors)
    require(semantic, (
        "spawnSync(process.execPath",
        "catalog.rules.length, 25",
        "['military_mortgage', 'mortgage']",
        "rendered catalog is not canonical JSON",
    ), SEMANTIC.name, errors)

    require(setup, (
        "create role service_role nologin bypassrls",
        "revoke all on schema nav_v2_private from public, anon, authenticated",
        "create schema harness",
        "create or replace function harness.assert_true",
        "Marker tables prove that the adapter never creates or changes business rows",
    ), SETUP.name, errors)
    require(assertions, (
        "PostgreSQL 17 assertions passed",
        "simple self-service card was blocked",
        "mortgage broker action was blocked",
        "mortgage + matcap lawyer handoff was blocked",
        "matcap without mortgage routed to broker",
        "partner deal silently assumed a seller side",
        "spoofed client passport enabled broker",
        "confirmed manual lawyer request was ignored",
        "broker action without mortgage was accepted",
        "catalog version mismatch was accepted",
        "unknown draft key was accepted",
        "forbidden phone key was accepted",
        "client document link was accepted",
        "adapter changed deal marker",
        "not has_function_privilege('authenticated'",
        "has_function_privilege('service_role'",
    ), ASSERTIONS.name, errors)
    require(rollback, (
        "rollback preflight found changed deal rows",
        "drop function if exists nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)",
        "server adapter function survived rollback",
        "Navigator v2 intake server adapter rollback passed",
    ), ROLLBACK.name, errors)

    workflow_commands = (
        "python3 scripts/check_nav_v2_intake_server_adapter_v1.py",
        "node scripts/check-nav-v2-intake-server-adapter-v1.mjs",
        "node scripts/render-nav-v2-intake-server-adapter-v1.mjs --output /tmp/nav_v2_intake_save_adapter_v1.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_adapter_harness_setup.sql",
        "psql -v ON_ERROR_STOP=1 -f /tmp/nav_v2_intake_save_adapter_v1.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_adapter_harness_assertions.sql",
        "psql -v ON_ERROR_STOP=1 -f tests/sql/nav_v2_intake_adapter_harness_rollback.sql",
    )
    positions = []
    for command in workflow_commands:
        position = workflow.find(command)
        if position < 0:
            errors.append(f"{WORKFLOW.name}: missing {command}")
        positions.append(position)
    if all(position >= 0 for position in positions) and positions != sorted(positions):
        errors.append("PostgreSQL 17 workflow must run static, render, setup, apply, assertions and rollback in order")
    require(workflow, ("image: postgres:17", "permissions:\n  contents: read", "if: always()"), WORKFLOW.name, errors)
    for forbidden in ("ofewxuqfjhamgerwzull", "SUPABASE_ACCESS_TOKEN", "supabase db push", "apply_migration"):
        if forbidden.lower() in workflow.lower():
            errors.append(f"harness workflow must remain detached from production: {forbidden}")

    static_commands = (
        "python3 scripts/check_nav_v2_intake_server_adapter_v1.py",
        "node scripts/check-nav-v2-intake-server-adapter-v1.mjs",
    )
    for command in static_commands:
        if command not in static_workflow:
            errors.append(f"{STATIC_WORKFLOW.name}: missing {command}")

    require(doc, (
        "repository-only",
        "Trust boundary",
        "prepared_payload",
        "25 правил",
        "PostgreSQL 17",
        "Production gate",
        "Rollback",
        "Production Supabase не изменён",
    ), DOC.name, errors)

    if errors:
        print("Navigator v2 intake server adapter v1 errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 intake server adapter v1 passed: canonical catalog render, server recomputation, "
        "privacy allowlist, mortgage-only routing, PG17 lifecycle and rollback contract"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
