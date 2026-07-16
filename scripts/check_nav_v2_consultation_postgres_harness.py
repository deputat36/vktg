from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETUP = ROOT / "tests/sql/nav_v2_consultation_harness_setup.sql"
ASSERTIONS = ROOT / "tests/sql/nav_v2_consultation_harness_assertions.sql"
ROLLBACK = ROOT / "tests/sql/nav_v2_consultation_harness_rollback.sql"
BASE = ROOT / "supabase/prototypes/nav_v2_consultation_lifecycle.sql"
HARDENING = ROOT / "supabase/prototypes/nav_v2_consultation_lifecycle_hardening.sql"
WORKFLOW = ROOT / ".github/workflows/nav-v2-consultation-postgres-harness.yml"
DOC = ROOT / "docs/NAV_V2_CONSULTATION_POSTGRES_HARNESS_2026-07-16.md"
CONTRACT = ROOT / "config/nav-v2-consultation-lifecycle-contract.json"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (SETUP, ASSERTIONS, ROLLBACK, BASE, HARDENING, WORKFLOW, DOC, CONTRACT):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    setup = SETUP.read_text(encoding="utf-8")
    assertions = ASSERTIONS.read_text(encoding="utf-8")
    rollback = ROLLBACK.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(setup, (
        "create role anon nologin",
        "create role authenticated nologin",
        "create role service_role nologin bypassrls",
        "create schema auth",
        "create schema nav_v2_private",
        "create or replace function auth.uid()",
        "create type public.nav_v2_user_role as enum",
        "create table public.nav_user_profiles",
        "create table public.nav_deals_v2",
        "create table public.nav_deal_tasks_v2",
        "create table public.nav_deal_documents_v2",
        "create table public.nav_deal_risks_v2",
        "Broker Synthetic",
        "Viewer Synthetic",
    ), SETUP.name, errors)

    require(assertions, (
        "client_request_id column is missing",
        "conversion_mode column is missing",
        "legacy three-argument decide RPC still exists",
        "authenticated unexpectedly has create RPC EXECUTE",
        "service_role lacks create RPC EXECUTE",
        "matcap without mortgage routed to broker",
        "repeat create must be idempotent",
        "unknown payload key was not rejected",
        "possible full name was not rejected",
        "unit-level address was not rejected",
        "mortgage did not create parallel broker scope",
        "SPN A queue contains another employee consultation",
        "Manager A received another team consultation",
        "broker accessed legal consultation queue",
        "viewer accessed consultation queue",
        "clarification did not return consultation to new",
        "unassigned lawyer opened an answered historical consultation",
        "conversion without deposit/deal mode was accepted",
        "conversion_mode was accepted for ordinary answer",
        "conversion draft claims a deal was created",
        "conversion draft claims backlog was created",
        "consultation lifecycle created a task",
        "consultation lifecycle created a document",
        "consultation lifecycle created a risk",
        "PostgreSQL consultation harness assertions passed",
    ), ASSERTIONS.name, errors)

    require(rollback, (
        "drop function if exists public.nav_v2_decide_consultation(uuid, text, text, text)",
        "drop table if exists public.nav_consultation_messages_v2",
        "drop table if exists public.nav_consultations_v2",
        "consultations table survived rollback",
        "create RPC survived rollback",
        "rollback altered marker deals",
        "PostgreSQL consultation harness rollback passed",
    ), ROLLBACK.name, errors)

    sql_paths = (
        "tests/sql/nav_v2_consultation_harness_setup.sql",
        "supabase/prototypes/nav_v2_consultation_lifecycle.sql",
        "supabase/prototypes/nav_v2_consultation_lifecycle_hardening.sql",
        "tests/sql/nav_v2_consultation_harness_assertions.sql",
        "tests/sql/nav_v2_consultation_harness_rollback.sql",
    )
    require(workflow, (
        "postgres:17",
        "POSTGRES_DB: navigator_harness",
        "sudo apt-get install -y postgresql-client",
        "psql -v ON_ERROR_STOP=1 -f",
        *sql_paths,
        "python3 scripts/check_nav_v2_consultation_postgres_harness.py",
        "nav-v2-consultation-postgres-harness",
    ), WORKFLOW.name, errors)

    positions = [workflow.find(path) for path in sql_paths]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        errors.append("workflow must run setup, base, hardening, assertions and rollback in order")
    if workflow.count("psql -v ON_ERROR_STOP=1 -f") < len(sql_paths):
        errors.append("every SQL step must use fail-fast ON_ERROR_STOP")

    require(doc, (
        "PostgreSQL 17",
        "одноразовой базе",
        "base → hardening",
        "idempotency",
        "broker/viewer",
        "маткапитал",
        "ипотека",
        "не создаёт сделку",
        "Rollback rehearsal",
        "Production gate",
    ), DOC.name, errors)

    for forbidden in (
        "Supabase.apply_migration",
        "supabase db push",
        "supabase migration up",
        "ofewxuqfjhamgerwzull.supabase.co",
    ):
        if forbidden in workflow:
            errors.append(f"harness workflow contains production/deploy marker: {forbidden}")

    if errors:
        print("Navigator v2 consultation PostgreSQL harness errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 consultation PostgreSQL harness passed: executable PG17 order, synthetic roles, "
        "ACL/lifecycle/privacy/no-backlog assertions and rollback rehearsal"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
