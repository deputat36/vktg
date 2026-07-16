from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-corporate-document-mutations-contract.json"
FIXTURES = ROOT / "fixtures/nav-v2-corporate-document-mutation-scenarios.json"
BASE = ROOT / "supabase/prototypes/nav_v2_corporate_documents.sql"
AMENDMENT = ROOT / "supabase/prototypes/nav_v2_corporate_documents_index_amendment.sql"
MUTATIONS = ROOT / "supabase/prototypes/nav_v2_corporate_document_mutations.sql"
SETUP = ROOT / "tests/sql/nav_v2_corporate_document_mutation_setup.sql"
ASSERTIONS = ROOT / "tests/sql/nav_v2_corporate_document_mutation_assertions.sql"
ROLLBACK = ROOT / "tests/sql/nav_v2_corporate_document_mutation_rollback.sql"
DOC = ROOT / "docs/NAV_V2_CORPORATE_DOCUMENT_MUTATIONS_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-corporate-document-mutations.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def role_allowed(role: str, action: str) -> bool:
    if action in {"initialize", "update_operational", "propose_exception"}:
        return role in {"spn", "manager", "owner", "admin"}
    if action == "decide_exception":
        return role in {"manager", "owner", "admin"}
    return False


def transition_allowed(source: str, target: str) -> bool:
    allowed = {
        "planned": {"planned", "prepared", "problem"},
        "prepared": {"prepared", "sent_for_signature", "problem"},
        "sent_for_signature": {"sent_for_signature", "signed", "problem"},
        "problem": {"problem", "planned", "prepared", "sent_for_signature"},
        "signed": {"signed"},
        "cancelled": {"cancelled"},
    }
    return target in allowed.get(source, set())


def patch_valid(case: dict) -> bool:
    status = case.get("status")
    template = bool(case.get("template_code") and case.get("template_version"))
    method = case.get("signing_method")
    external = case.get("external_ref") is True
    note = str(case.get("problem_note") or "").strip()
    if status in {"prepared", "sent_for_signature", "signed"} and not template:
        return False
    if status in {"sent_for_signature", "signed"} and method not in {"paper", "online"}:
        return False
    if status == "signed" and not external:
        return False
    if status == "problem" and not note:
        return False
    return True


def outcome_valid(case: dict) -> bool:
    code = case.get("code")
    reason = str(case.get("reason") or "").strip()
    replacement = bool(case.get("replacement"))
    if code not in {"not_applicable", "replaced", "cancelled"}:
        return False
    if not 10 <= len(reason) <= 1000:
        return False
    if code == "replaced" and not replacement:
        return False
    if code != "replaced" and replacement:
        return False
    return True


def main() -> int:
    errors: list[str] = []
    paths = (CONTRACT, FIXTURES, BASE, AMENDMENT, MUTATIONS, SETUP, ASSERTIONS, ROLLBACK, DOC, WORKFLOW)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    mutations = MUTATIONS.read_text(encoding="utf-8")
    setup = SETUP.read_text(encoding="utf-8")
    assertions = ASSERTIONS.read_text(encoding="utf-8")
    rollback = ROLLBACK.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    if contract.get("status") != "repository_only_prototype" or contract.get("production_applied") is not False:
        errors.append("corporate mutation contract must remain repository-only and non-production")
    if fixtures.get("schema_version") != 1 or fixtures.get("synthetic_only") is not True:
        errors.append("corporate mutation fixtures must remain schema v1 synthetic-only")

    require(mutations, (
        "-- REPOSITORY-ONLY PROTOTYPE.",
        "create table if not exists public.nav_deal_corporate_document_events_v2",
        "client_request_id uuid not null unique",
        "create or replace function nav_v2_private.nav_v2_corporate_text_findings",
        "create or replace function nav_v2_private.nav_v2_corporate_replay",
        "client_request_id уже использован другой операцией",
        "create or replace function nav_v2_private.nav_v2_corporate_status_transition_allowed",
        "create or replace function nav_v2_private.nav_v2_can_mutate_corporate_document",
        "create or replace function public.nav_v2_initialize_corporate_documents",
        "create or replace function public.nav_v2_update_corporate_document",
        "create or replace function public.nav_v2_propose_corporate_document_outcome",
        "create or replace function public.nav_v2_decide_corporate_document_outcome",
        "СПН может инициализировать документы только своей стороны",
        "Ответственный СПН должен совпадать с представителем выбранной стороны",
        "Ответственный менеджер должен совпадать с менеджером сделки",
        "Для отмены используйте подтверждённый outcome",
        "Для подготовленного документа нужны код и версия шаблона",
        "Для signed требуется внешнее подтверждение подписи",
        "Только менеджер, owner или admin подтверждает исключение",
        "no authenticated EXECUTE until a separate deployment migration",
    ), MUTATIONS.name, errors)

    if mutations.count("v_before jsonb;") != 3:
        errors.append("mutation SQL must declare v_before exactly once in update/propose/decide functions")
    if re.search(r"p_client_request_id uuid\s*\)\s*\)\s*returns jsonb", mutations):
        errors.append("mutation SQL contains duplicate function closing parenthesis")

    signatures = tuple(contract.get("public_rpcs") or [])
    for signature in signatures:
        qualified = f"public.{signature}"
        if f"revoke execute on function {qualified}" not in mutations:
            errors.append(f"missing mutation RPC revoke: {qualified}")
        if f"grant execute on function {qualified}" not in mutations:
            errors.append(f"missing mutation service-role grant: {qualified}")
    if re.search(r"(?im)^\s*grant\s+execute\s+on\s+function[\s\S]{0,180}\bto\s+authenticated\b", mutations):
        errors.append("repository-only mutation SQL grants EXECUTE to authenticated")

    for forbidden_mutation in (
        r"(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_documents_v2\b",
        r"(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_tasks_v2\b",
        r"(?im)^\s*(insert\s+into|update|delete\s+from)\s+public\.nav_deal_risks_v2\b",
        r"(?im)^\s*update\s+public\.nav_deals_v2\b",
    ):
        if re.search(forbidden_mutation, mutations):
            errors.append(f"corporate mutation crosses protected boundary: {forbidden_mutation}")

    for field in contract.get("initialize_item_allowlist") or []:
        if f"'{field}'" not in mutations:
            errors.append(f"initialize allowlist key missing from SQL: {field}")
    for field in contract.get("update_patch_allowlist") or []:
        if f"'{field}'" not in mutations:
            errors.append(f"update allowlist key missing from SQL: {field}")

    for case in fixtures.get("role_cases") or []:
        if role_allowed(case["role"], case["action"]) != case["allowed"]:
            errors.append(f"role case {case['id']} mismatch")
    for case in fixtures.get("transition_cases") or []:
        if transition_allowed(case["from"], case["to"]) != case["allowed"]:
            errors.append(f"transition case {case['id']} mismatch")
    for case in fixtures.get("patch_cases") or []:
        if patch_valid(case) != case["valid"]:
            errors.append(f"patch case {case['id']} mismatch")
    for case in fixtures.get("outcome_cases") or []:
        if outcome_valid(case) != case["valid"]:
            errors.append(f"outcome case {case['id']} mismatch")
    for case in fixtures.get("separation_cases") or []:
        if case.get("mutated") is not False:
            errors.append(f"separation case {case['id']} must remain non-mutating")

    assignment = contract.get("assignment_rules") or {}
    if assignment.get("cross_team_spn_assignment_allowed") is not False:
        errors.append("cross-team SPN assignment must be forbidden")

    require(setup, (
        "create role authenticated nologin",
        "create role service_role nologin bypassrls",
        "create or replace function auth.uid()",
        "create type public.nav_v2_user_role as enum",
        "create type public.nav_v2_side as enum",
        "create table public.nav_deals_v2",
        "create or replace function nav_v2_private.nav_v2_can_edit_deal",
        "Other SPN Synthetic",
    ), SETUP.name, errors)
    require(assertions, (
        "authenticated unexpectedly has initialize RPC EXECUTE",
        "repeat initialize must replay without duplicate rows",
        "unknown initialize field was not rejected",
        "seller SPN initialized buyer-side corporate document",
        "manager assigned seller corporate document to unrelated SPN",
        "lawyer initialized corporate documents",
        "broker initialized corporate documents",
        "viewer initialized corporate documents",
        "prepared without template evidence was accepted",
        "signed without external evidence was accepted",
        "direct cancelled transition was accepted",
        "phone in problem note was not rejected",
        "SPN confirmed own exception",
        "manager confirmation did not complete corporate exception",
        "corporate mutation created legal/object document",
        "corporate mutation created task",
        "corporate mutation created risk",
        "PostgreSQL corporate document mutation assertions passed",
    ), ASSERTIONS.name, errors)
    require(rollback, (
        "drop function if exists public.nav_v2_initialize_corporate_documents",
        "drop table if exists public.nav_deal_corporate_document_events_v2",
        "base corporate document table was removed by mutation rollback",
        "PostgreSQL corporate document mutation rollback passed",
    ), ROLLBACK.name, errors)

    sql_paths = (
        "tests/sql/nav_v2_corporate_document_mutation_setup.sql",
        "supabase/prototypes/nav_v2_corporate_documents.sql",
        "supabase/prototypes/nav_v2_corporate_documents_index_amendment.sql",
        "supabase/prototypes/nav_v2_corporate_document_mutations.sql",
        "tests/sql/nav_v2_corporate_document_mutation_assertions.sql",
        "tests/sql/nav_v2_corporate_document_mutation_rollback.sql",
    )
    require(workflow, (
        "postgres:17",
        "POSTGRES_DB: navigator_corporate_harness",
        "python3 scripts/check_nav_v2_corporate_document_mutations.py",
        "python3 -m py_compile scripts/check_nav_v2_corporate_document_mutations.py",
        "psql -v ON_ERROR_STOP=1 -f",
        *sql_paths,
        "nav-v2-corporate-document-mutations",
    ), WORKFLOW.name, errors)
    positions = [workflow.find(f"-f {path}") for path in sql_paths]
    if any(pos < 0 for pos in positions) or positions != sorted(positions):
        errors.append("workflow must run setup, base, amendment, mutations, assertions and rollback in order")

    require(doc, (
        "repository-only prototype",
        "client_request_id",
        "Идемпотентность",
        "Явная инициализация",
        "Двухэтапные исключения",
        "PostgreSQL 17",
        "не меняет юридическую готовность",
        "не создаёт задачи",
        "Production gate",
        "Rollback",
    ), DOC.name, errors)

    if errors:
        print("Navigator v2 corporate document mutation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 corporate document mutations passed: explicit initialization, bounded transitions, "
        "evidence, two-stage exceptions, idempotency, role boundaries and executable PostgreSQL 17 order"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
