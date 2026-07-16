from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "supabase/prototypes/nav_v2_consultation_entity.sql"
CONTRACT = ROOT / "config/nav-v2-consultation-entity-contract.json"
FIXTURES = ROOT / "fixtures/nav-v2-consultation-entity-scenarios.json"
SCENARIOS = ROOT / "scripts/check_nav_v2_consultation_entity_scenarios.py"
DOC = ROOT / "docs/NAV_V2_CONSULTATION_ENTITY_PROTOTYPE_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-consultation-entity-prototype.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def function_segment(sql: str, start: str, end: str) -> str:
    begin = sql.find(start)
    finish = sql.find(end, begin + len(start)) if begin >= 0 else -1
    if begin < 0:
        return ""
    return sql[begin:] if finish < 0 else sql[begin:finish]


def main() -> int:
    errors: list[str] = []
    for path in (SQL, CONTRACT, FIXTURES, SCENARIOS, DOC, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    sql = SQL.read_text(encoding="utf-8")
    lowered = sql.lower()
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    if contract.get("status") != "repository_only_prototype":
        errors.append("contract status must remain repository_only_prototype")
    if contract.get("production_applied") is not False:
        errors.append("consultation entity prototype must remain non-production")
    if contract.get("prototype_path") != SQL.relative_to(ROOT).as_posix():
        errors.append("prototype path drifted")
    if fixtures.get("synthetic_only") is not True:
        errors.append("fixtures must remain synthetic-only")
    if SQL.parent.name != "prototypes" or "migrations" in SQL.parts:
        errors.append("consultation SQL must remain outside migrations")

    require(sql, (
        "REPOSITORY-ONLY PROTOTYPE",
        "create table if not exists public.nav_consultations_v2",
        "create table if not exists public.nav_consultation_messages_v2",
        "create table if not exists public.nav_consultation_events_v2",
        "status in ('new', 'need_info', 'answered', 'converted', 'closed')",
        "broker_scope_needed boolean generated always as",
        "funding_codes && array['mortgage', 'military_mortgage']",
        "alter table public.nav_consultations_v2 enable row level security",
        "No direct policies are added intentionally",
        "create or replace function nav_v2_private.nav_v2_consultation_text_is_safe",
        "create or replace function nav_v2_private.nav_v2_can_view_consultation",
        "create or replace function public.nav_v2_create_consultation",
        "create or replace function public.nav_v2_get_consultations_list",
        "create or replace function public.nav_v2_get_consultation_card",
        "create or replace function public.nav_v2_decide_consultation",
        "create or replace function public.nav_v2_reply_consultation",
        "create or replace function public.nav_v2_request_consultation_conversion",
        "create or replace function public.nav_v2_bind_consultation_conversion",
        "create or replace function public.nav_v2_close_consultation",
        "'creates_deal', false",
        "'creates_backlog', false",
        "status = 'converted'",
        "converted_deal_id = p_deal_id",
        "revoke execute on function public.nav_v2_create_consultation",
        "No GRANT statements by design",
    ), SQL.name, errors)

    for table in contract.get("tables") or []:
        if f"create table if not exists {table}" not in lowered:
            errors.append(f"table missing from SQL: {table}")

    for rpc in contract.get("rpc_surface") or []:
        name = rpc["name"]
        if f"create or replace function public.{name}" not in lowered:
            errors.append(f"RPC missing from SQL: {name}")
        if f"revoke execute on function public.{name}" not in lowered:
            errors.append(f"RPC lacks repository-only revoke: {name}")
        if rpc.get("production_execute_granted") is not False:
            errors.append(f"RPC unexpectedly marked granted: {name}")

    grant_lines = [
        line for line in sql.splitlines()
        if re.match(r"^\s*grant\s", line, flags=re.IGNORECASE)
    ]
    if grant_lines:
        errors.append(f"prototype must not add GRANT statements: {grant_lines}")

    for forbidden_insert in (
        "insert into public.nav_deals_v2",
        "insert into public.nav_deal_tasks_v2",
        "insert into public.nav_deal_documents_v2",
        "insert into public.nav_deal_risks_v2",
    ):
        if forbidden_insert in lowered:
            errors.append(f"consultation prototype creates forbidden backlog/data: {forbidden_insert}")

    list_segment = function_segment(
        lowered,
        "create or replace function public.nav_v2_get_consultations_list",
        "create or replace function public.nav_v2_get_consultation_card",
    )
    card_segment = function_segment(
        lowered,
        "create or replace function public.nav_v2_get_consultation_card",
        "create or replace function public.nav_v2_decide_consultation",
    )
    if not list_segment or not card_segment:
        errors.append("could not isolate list/card RPC source")
    else:
        for forbidden in contract.get("forbidden_client_keys") or []:
            if f"'{forbidden}'" in list_segment or f"'{forbidden}'" in card_segment:
                errors.append(f"client identifier key exposed in consultation DTO: {forbidden}")
        for sensitive_list_key in ("'answer_text'", "'documents_url'", "'known_facts'"):
            if sensitive_list_key in list_segment:
                errors.append(f"list DTO exposes card-only field {sensitive_list_key}")
        for required_card_key in ("'answer_text'", "'documents_url'", "'known_facts'"):
            if required_card_key not in card_segment:
                errors.append(f"card DTO missing reviewed field {required_card_key}")

    for key in contract.get("list_dto_keys") or []:
        if f"'{key}'" not in list_segment:
            errors.append(f"list DTO key missing from SQL: {key}")
    for key in contract.get("card_dto_keys") or []:
        if f"'{key}'" not in card_segment:
            errors.append(f"card DTO key missing from SQL: {key}")

    create_segment = function_segment(
        lowered,
        "create or replace function public.nav_v2_create_consultation",
        "create or replace function public.nav_v2_get_consultations_list",
    )
    require(create_segment, (
        "client_request_id обязателен",
        "on conflict (created_by, client_request_id) do nothing",
        "intake содержит недопустимые поля",
        "nav_v2_consultation_text_is_safe",
        "planned_date должна быть датой yyyy-mm-dd",
        "ссылка на документы должна быть безопасной https-ссылкой",
    ), "create RPC", errors)

    decide_segment = function_segment(
        lowered,
        "create or replace function public.nav_v2_decide_consultation",
        "create or replace function public.nav_v2_reply_consultation",
    )
    require(decide_segment, (
        "p_decision not in ('answer', 'need_info', 'convert_to_preparation')",
        "решение по консультации принимает юрист или owner/admin",
        "консультация назначена другому юристу",
        "message_type, body",
        "'lawyer_decision'",
    ), "decision RPC", errors)

    conversion_segment = function_segment(
        lowered,
        "create or replace function public.nav_v2_request_consultation_conversion",
        "create or replace function public.nav_v2_bind_consultation_conversion",
    )
    require(conversion_segment, (
        "юрист ещё не подтвердил преобразование в подготовку",
        "'creates_deal', false",
        "'creates_backlog', false",
        "'wizard_draft'",
        "'sourceconsultationid'",
    ), "conversion request RPC", errors)

    require(doc.lower(), (
        "repository-only prototype",
        "не применён к production",
        "маткапитал",
        "сертификат",
        "ипотечный брокер",
        "need_info",
        "convert_to_preparation",
        "deny-by-default",
        "rollback",
    ), DOC.name, errors)

    require(workflow, (
        "python3 scripts/check_nav_v2_consultation_entity_prototype.py",
        "python3 scripts/check_nav_v2_consultation_entity_scenarios.py",
        "python3 -m py_compile",
        "nav-v2-consultation-entity-prototype",
    ), WORKFLOW.name, errors)

    if "authenticated role/mutation e2e" not in str(contract.get("production_gate", "")).lower():
        errors.append("production gate must require authenticated role/mutation E2E")

    if errors:
        print("Navigator v2 consultation entity prototype errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 consultation entity prototype passed: RPC-only access, explicit DTO, "
        "broker boundary, idempotency, safe conversion and no production grants/backlog"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
