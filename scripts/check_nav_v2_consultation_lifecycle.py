from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-consultation-lifecycle-contract.json"
FIXTURES = ROOT / "fixtures/nav-v2-consultation-lifecycle-scenarios.json"
PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_consultation_lifecycle.sql"
HARDENING = ROOT / "supabase/prototypes/nav_v2_consultation_lifecycle_hardening.sql"
DOC = ROOT / "docs/NAV_V2_CONSULTATION_LIFECYCLE_PROTOTYPE_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-consultation-lifecycle.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def function_block(sql: str, start: str, end: str) -> str:
    start_pos = sql.find(start)
    end_pos = sql.find(end, start_pos + 1)
    if start_pos < 0:
        return ""
    return sql[start_pos:] if end_pos < 0 else sql[start_pos:end_pos]


def transition_allowed(case: dict, decision_roles: set[str], requester_roles: set[str]) -> tuple[bool, str | None]:
    role = case["role"]
    source = case.get("from")
    action = case["action"]
    conversion_mode = case.get("conversion_mode")
    if action == "create":
        return role in requester_roles, "new" if role in requester_roles else None
    if action in {"answer", "need_info", "convert_to_preparation"}:
        if source != "new" or role not in decision_roles:
            return False, None
        if action == "convert_to_preparation" and conversion_mode not in {"deposit", "deal"}:
            return False, None
        if action != "convert_to_preparation" and conversion_mode is not None:
            return False, None
        return True, {
            "answer": "answered",
            "need_info": "need_info",
            "convert_to_preparation": "convert_to_preparation",
        }[action]
    if action == "clarify":
        allowed = source == "need_info" and role in {"spn", "owner", "admin"}
        return allowed, "new" if allowed else None
    if action == "close":
        allowed = source in {"answered", "convert_to_preparation"} and role in {
            "spn", "lawyer", "owner", "admin"
        }
        return allowed, "closed" if allowed else None
    if action == "cancel":
        allowed = source in {"new", "need_info"} and role in {"spn", "lawyer", "owner", "admin"}
        return allowed, "cancelled" if allowed else None
    return False, None


def visibility_allowed(case: dict) -> bool:
    role = case["role"]
    relation = case["relation"]
    status = case.get("status")
    if role in {"owner", "admin"}:
        return True
    if role == "spn":
        return relation == "creator"
    if role == "manager":
        return relation in {"requester_manager", "manager_id"}
    if role == "lawyer":
        if relation == "assigned_self":
            return True
        return relation == "unassigned" and status in {"new", "need_info"}
    return False


PRIVACY_PATTERNS: dict[str, re.Pattern[str]] = {
    "email": re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I),
    "phone": re.compile(r"(?:\+7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}"),
    "passport": re.compile(r"\b\d{4}[\s-]+\d{6}\b"),
    "snils": re.compile(r"\b\d{3}-\d{3}-\d{3}[\s-]+\d{2}\b"),
    "cadastral_number": re.compile(r"\b\d{2}:\d{2}:\d{5,9}:\d+\b"),
    "unit_number": re.compile(
        r"(?:^|[^\w])(?:кв(?:артира)?|комн(?:ата)?|офис|пом(?:ещение)?|апарт(?:аменты)?)"
        r"[\s]*[№#-]?[\s]*\d+[а-яa-z]?(?:$|[^\w])",
        re.I,
    ),
    "possible_full_name": re.compile(
        r"(?:^|[^А-ЯЁа-яёA-Za-z])[А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ][а-яё]{2,}"
        r"(?:\s+[А-ЯЁ][а-яё]{2,})?(?:$|[^А-ЯЁа-яёA-Za-z])"
    ),
    "long_payment_number": re.compile(r"(?:\d[ -]?){16,19}"),
}


def privacy_findings(text: str) -> set[str]:
    return {name for name, pattern in PRIVACY_PATTERNS.items() if pattern.search(text)}


def main() -> int:
    errors: list[str] = []
    for path in (CONTRACT, FIXTURES, PROTOTYPE, HARDENING, DOC, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    sql = PROTOTYPE.read_text(encoding="utf-8")
    hardening = HARDENING.read_text(encoding="utf-8")
    effective_sql = f"{sql}\n{hardening}"
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    if contract.get("schema_version") != 2:
        errors.append("consultation lifecycle contract must use schema_version 2 after hardening")
    if contract.get("status") != "repository_only_prototype":
        errors.append("contract status must remain repository_only_prototype")
    if contract.get("production_applied") is not False:
        errors.append("consultation lifecycle must remain non-production")
    if contract.get("prototype_path") != PROTOTYPE.relative_to(ROOT).as_posix():
        errors.append("prototype path drifted")
    if contract.get("hardening_path") != HARDENING.relative_to(ROOT).as_posix():
        errors.append("hardening path drifted")
    expected_order = [PROTOTYPE.relative_to(ROOT).as_posix(), HARDENING.relative_to(ROOT).as_posix()]
    if contract.get("apply_order") != expected_order:
        errors.append("base/hardening apply order drifted")
    if fixtures.get("synthetic_only") is not True:
        errors.append("fixtures must remain synthetic-only")

    require(sql, (
        "-- REPOSITORY-ONLY PROTOTYPE.",
        "create table if not exists public.nav_consultations_v2",
        "create table if not exists public.nav_consultation_messages_v2",
        "alter table public.nav_consultations_v2 enable row level security",
        "alter table public.nav_consultation_messages_v2 enable row level security",
        "create or replace function nav_v2_private.nav_v2_consultation_text_findings",
        "create or replace function nav_v2_private.nav_v2_can_view_consultation",
        "create or replace function nav_v2_private.nav_v2_can_decide_consultation",
        "create or replace function public.nav_v2_create_consultation",
        "create or replace function public.nav_v2_get_consultation_queue",
        "create or replace function public.nav_v2_get_consultation",
        "create or replace function public.nav_v2_add_consultation_clarification",
        "create or replace function public.nav_v2_close_consultation",
        "'deal_created', false",
        "'backlog_created', false",
        "no document URL is persisted",
    ), PROTOTYPE.name, errors)

    require(hardening, (
        "-- REPOSITORY-ONLY HARDENING OVERLAY.",
        "add column if not exists client_request_id uuid",
        "add column if not exists conversion_mode text",
        "nav_consultations_creator_request_unique_idx",
        "'possible_full_name'",
        "c.status in ('new', 'need_info')",
        "'preparation_mode', c.conversion_mode",
        "client_request_id обязателен для защиты от повторного создания",
        "Payload содержит недопустимые поля",
        "on conflict (created_by, client_request_id)",
        "v_role not in ('spn', 'lawyer', 'manager', 'owner', 'admin')",
        "v_role = 'spn' and c.created_by = v_uid",
        "drop function if exists public.nav_v2_decide_consultation(uuid, text, text)",
        "p_conversion_mode text default null",
        "Для полной подготовки выберите deposit или deal",
        "authenticated has no EXECUTE",
    ), HARDENING.name, errors)

    for signature in contract.get("public_rpcs") or []:
        function_name = signature.split("(", 1)[0]
        if f"public.{function_name}" not in effective_sql:
            errors.append(f"public RPC missing from effective SQL: {signature}")

    hardened_signatures = (
        "public.nav_v2_create_consultation(jsonb)",
        "public.nav_v2_get_consultation_queue(integer)",
        "public.nav_v2_get_consultation(uuid)",
        "public.nav_v2_decide_consultation(uuid, text, text, text)",
        "public.nav_v2_add_consultation_clarification(uuid, text)",
        "public.nav_v2_close_consultation(uuid, text, text)",
    )
    for signature in hardened_signatures:
        if f"revoke execute on function {signature} from public, anon, authenticated" not in hardening:
            errors.append(f"hardening missing API-role revoke for {signature}")
        if f"grant execute on function {signature} to service_role" not in hardening:
            errors.append(f"hardening missing service_role-only grant for {signature}")
        if f"grant execute on function {signature} to authenticated" in hardening:
            errors.append(f"hardening must not grant authenticated EXECUTE for {signature}")

    for table_name in contract.get("tables") or []:
        if f"revoke all on table {table_name} from public, anon, authenticated" not in sql:
            errors.append(f"direct table access must be revoked for {table_name}")

    queue = function_block(
        hardening,
        "create or replace function public.nav_v2_get_consultation_queue",
        "-- Replace the three-argument prototype",
    )
    for key in contract.get("queue_item_keys") or []:
        if f"'{key}'" not in queue:
            errors.append(f"queue DTO key missing: {key}")
    for key in contract.get("queue_forbidden_keys") or []:
        if f"'{key}'" in queue:
            errors.append(f"queue DTO exposes forbidden key: {key}")
    if "v_role = 'spn' and c.created_by = v_uid" not in queue:
        errors.append("SPN queue must be restricted to own consultations")

    for forbidden_table in (
        "nav_deals_v2", "nav_deal_tasks_v2", "nav_deal_documents_v2", "nav_deal_risks_v2"
    ):
        if re.search(rf"(?im)^\s*insert\s+into\s+public\.{forbidden_table}\b", effective_sql):
            errors.append(f"consultation prototype creates forbidden backlog row in {forbidden_table}")

    if "document_source_url" in effective_sql:
        errors.append("document source URL must not be persisted before owner retention decision")

    create_contract = contract.get("create_contract") or {}
    if create_contract.get("client_request_id_required") is not True:
        errors.append("client_request_id must be required")
    if create_contract.get("unknown_payload_keys_rejected") is not True:
        errors.append("unknown payload keys must be rejected")
    for key in create_contract.get("payload_allowlist") or []:
        if f"'{key}'" not in hardening:
            errors.append(f"create payload allowlist key missing from hardening SQL: {key}")

    requester_roles = set(contract.get("requester_roles") or [])
    decision_roles = set(contract.get("decision_roles") or [])
    for case in fixtures.get("transition_cases") or []:
        allowed, target = transition_allowed(case, decision_roles, requester_roles)
        if allowed != case["allowed"] or target != case.get("to"):
            errors.append(
                f"transition {case['id']} mismatch: got allowed={allowed}, to={target}; "
                f"expected allowed={case['allowed']}, to={case.get('to')}"
            )

    for case in fixtures.get("visibility_cases") or []:
        allowed = visibility_allowed(case)
        if allowed != case["allowed"]:
            errors.append(f"visibility {case['id']} mismatch: got {allowed}, expected {case['allowed']}")

    for case in fixtures.get("create_cases") or []:
        allowed = bool(case.get("client_request_id")) and not case.get("unknown_keys")
        if allowed != case["allowed"]:
            errors.append(f"create case {case['id']} mismatch")
        if case.get("repeat") and case.get("idempotent") is not True:
            errors.append(f"repeat create case {case['id']} must be idempotent")

    for case in fixtures.get("funding_cases") or []:
        sources = set(case["sources"])
        broker_parallel = bool(sources & {"mortgage", "military_mortgage"})
        if case["lawyer"] is not True or broker_parallel != case["broker_parallel"]:
            errors.append(f"funding route {case['id']} mismatch")
        if sources & {"matcap", "certificate"} and not sources & {"mortgage", "military_mortgage"}:
            if broker_parallel:
                errors.append(f"funding route {case['id']} incorrectly sends non-mortgage case to broker")

    for case in fixtures.get("privacy_cases") or []:
        findings = privacy_findings(case["text"])
        blocked = bool(findings)
        if blocked != case["blocked"]:
            errors.append(f"privacy case {case['id']} mismatch: findings={sorted(findings)}")
        expected = case.get("finding")
        if expected and expected not in findings:
            errors.append(f"privacy case {case['id']} missing finding {expected}")

    no_backlog = contract.get("no_backlog_guarantees") or {}
    expected_no_backlog = {
        "deal_created": False,
        "tasks_created": False,
        "documents_created": False,
        "risks_created": False,
        "conversion_is_draft_only": True,
        "conversion_mode_explicit": True,
    }
    if no_backlog != expected_no_backlog:
        errors.append("no-backlog guarantees drifted")

    source_policy = contract.get("document_source_policy") or {}
    if source_policy.get("persist_url") is not False or source_policy.get("persist_presence_flag_only") is not True:
        errors.append("document-source policy must persist only a presence flag")

    security = contract.get("security_contract") or {}
    if security.get("authenticated_execute_explicitly_granted") is not False:
        errors.append("repository-only effective prototype must not grant authenticated EXECUTE")
    if security.get("service_role_execute_granted") is not True:
        errors.append("service_role execute contract drifted")
    for case in fixtures.get("acl_cases") or []:
        expected = case["role"] == "service_role"
        if case["execute"] is not expected:
            errors.append(f"ACL case {case['role']} mismatch")

    require(doc, (
        "repository-only prototype",
        "new → need_info / answered / convert_to_preparation → closed",
        "не создаёт сделку",
        "маткапитал",
        "сертификат",
        "Ипотечный брокер",
        "document URL",
        "Hardening overlay",
        "client_request_id",
        "conversion_mode",
        "Production gate",
        "Rollback",
    ), DOC.name, errors)
    require(workflow, (
        "nav_v2_consultation_lifecycle_hardening.sql",
        "python3 scripts/check_nav_v2_consultation_lifecycle.py",
        "python3 -m py_compile scripts/check_nav_v2_consultation_lifecycle.py",
        "nav-v2-consultation-lifecycle",
    ), WORKFLOW.name, errors)

    if "authenticated role/mutation" not in str(contract.get("production_gate", "")).lower():
        errors.append("production gate must require authenticated role/mutation E2E")
    if "postgresql 17" not in str(contract.get("production_gate", "")).lower():
        errors.append("production gate must require executable PostgreSQL 17 tests")

    if errors:
        print("Navigator v2 consultation lifecycle errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 consultation lifecycle passed: SPN own list, idempotent create, strict payload, "
        "open-only unassigned lawyer access, explicit conversion mode and deferred authenticated grants"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
