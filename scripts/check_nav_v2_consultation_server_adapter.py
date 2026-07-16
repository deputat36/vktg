from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADAPTER = ROOT / "assets/js/nav-v2/consultation-server-adapter-v2.js"
UI = ROOT / "assets/js/nav-v2/consultation-v2.js"
FIXTURES = ROOT / "fixtures/nav-v2-consultation-server-adapter-scenarios.json"
SEMANTIC = ROOT / "scripts/check-nav-v2-consultation-server-adapter.mjs"
SERVER_CONTRACT = ROOT / "config/nav-v2-consultation-lifecycle-contract.json"
SERVER_PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_consultation_lifecycle.sql"
SERVER_HARDENING = ROOT / "supabase/prototypes/nav_v2_consultation_lifecycle_hardening.sql"
DOC = ROOT / "docs/NAV_V2_CONSULTATION_SERVER_ADAPTER_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-consultation-server-adapter.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (
        ADAPTER, UI, FIXTURES, SEMANTIC, SERVER_CONTRACT,
        SERVER_PROTOTYPE, SERVER_HARDENING, DOC, WORKFLOW,
    )
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    adapter = ADAPTER.read_text(encoding="utf-8")
    ui = UI.read_text(encoding="utf-8")
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    contract = json.loads(SERVER_CONTRACT.read_text(encoding="utf-8"))
    prototype = SERVER_PROTOTYPE.read_text(encoding="utf-8")
    hardening = SERVER_HARDENING.read_text(encoding="utf-8")
    semantic = SEMANTIC.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    if contract.get("status") != "repository_only_prototype" or contract.get("production_applied") is not False:
        errors.append("server consultation contract must remain repository-only and non-production")
    if "-- REPOSITORY-ONLY PROTOTYPE." not in prototype:
        errors.append("server consultation SQL must remain a prototype")
    require(hardening, (
        "p_conversion_mode text default null",
        "p_decision = 'convert_to_preparation' and p_conversion_mode not in ('deposit', 'deal')",
        "p_decision <> 'convert_to_preparation' and p_conversion_mode is not null",
        "client_request_id",
    ), SERVER_HARDENING.name, errors)

    require(adapter, (
        "export function consultationClientRequestId",
        "export function consultationServerPayloadPreview",
        "export function minimizeConsultationQueueItem",
        "export function minimizeConsultationQueueResponse",
        "export function minimizeConsultationDetailResponse",
        "export function consultationDecisionPresentation",
        "export function consultationDecisionRpcPreview",
        "export function consultationConversionToWizardDraft",
        "client_request_id: clientRequestId",
        "name: 'nav_v2_create_consultation'",
        "name: 'nav_v2_decide_consultation'",
        "p_conversion_mode: conversionMode",
        "transport_enabled: false",
        "idempotency_key_present",
        "document_url_persisted: false",
        "deal_created: false",
        "backlog_created: false",
        "source.creates_deal === true || source.creates_backlog === true",
        "!['deposit', 'deal'].includes(source.preparation_mode)",
    ), ADAPTER.name, errors)

    for forbidden in (
        "document.", "window.", "localStorage", "sessionStorage", "rpc(", "fetch(", ".from(",
    ):
        if forbidden in adapter:
            errors.append(f"consultation adapter must remain pure and transport-free: {forbidden}")

    payload_start = adapter.find("const payload = validation.ok && adapterErrors.length === 0 ? {")
    payload_end = adapter.find("\n  } : null;", payload_start)
    payload_block = adapter[payload_start:payload_end] if payload_start >= 0 and payload_end >= 0 else ""
    if not payload_block:
        errors.append("could not locate hardened consultation payload allowlist")
    if "client_request_id: clientRequestId" not in payload_block:
        errors.append("future create payload is missing client_request_id")
    for forbidden_key in ("documents_url:", "document_source_url:", "known_facts:", "client_name:", "phone:", "email:"):
        if forbidden_key in payload_block:
            errors.append(f"future create payload contains forbidden key: {forbidden_key}")

    queue_keys = set(contract.get("queue_item_keys") or [])
    for key in queue_keys:
        if f"'{key}'" not in adapter:
            errors.append(f"adapter queue allowlist missing server key: {key}")
    for key in contract.get("queue_forbidden_keys") or []:
        if key in {"question", "body", "safe_reference", "document_source_url", "client_name", "phone", "email"}:
            queue_block = adapter.split("const QUEUE_ITEM_KEYS", 1)[1].split("]);", 1)[0]
            if f"'{key}'" in queue_block:
                errors.append(f"adapter queue allowlist exposes forbidden key: {key}")

    require(ui, (
        "CLIENT_REQUEST_KEY",
        "sessionStorage.getItem(CLIENT_REQUEST_KEY)",
        "sessionStorage.setItem(CLIENT_REQUEST_KEY, clientRequestId)",
        "globalThis.crypto?.randomUUID",
        "rotateClientRequestId()",
        "client_request_id: currentClientRequestId()",
        "consultationServerPayloadPreview(input, { client_request_id: input.client_request_id })",
        "Создан стабильный локальный ключ повтора",
        "Данные никуда не отправляются",
    ), UI.name, errors)
    for forbidden in (
        "rpc('nav_v2_create_consultation'", 'rpc("nav_v2_create_consultation"',
        "rpc('nav_v2_decide_consultation'", 'rpc("nav_v2_decide_consultation"',
        "nav_v2_add_consultation_clarification", "nav_v2_close_consultation",
        ".from('nav_consultations_v2'", '.from("nav_consultations_v2"',
    ):
        if forbidden in ui:
            errors.append(f"consultation UI must not call undeployed server surface: {forbidden}")

    if fixtures.get("schema_version") != 2:
        errors.append("adapter fixtures must use schema version 2")
    if fixtures.get("synthetic_only") is not True:
        errors.append("adapter fixtures must remain synthetic-only")
    if len(fixtures.get("payload_cases") or []) < 6:
        errors.append("adapter payload matrix must contain at least six cases")
    if len(fixtures.get("idempotency_cases") or []) < 4:
        errors.append("adapter idempotency matrix must contain at least four cases")
    if len(fixtures.get("decision_cases") or []) < 8:
        errors.append("adapter decision matrix must contain at least eight cases")
    if len(fixtures.get("conversion_cases") or []) < 4:
        errors.append("adapter conversion matrix must contain at least four cases")

    payload_ids = {case.get("id") for case in fixtures.get("payload_cases") or []}
    for required in (
        "basic_question", "deposit_partner", "mortgage_matcap", "document_url_stripped",
        "minor_codes_are_lossless_in_text", "spouse_is_preserved_in_text",
    ):
        if required not in payload_ids:
            errors.append(f"missing adapter scenario {required}")

    decision_ids = {case.get("id") for case in fixtures.get("decision_cases") or []}
    for required in (
        "answer_valid", "need_info_valid", "convert_deposit", "convert_deal",
        "convert_without_mode", "answer_with_mode", "invalid_consultation_id", "short_body",
    ):
        if required not in decision_ids:
            errors.append(f"missing decision scenario {required}")

    require(semantic, (
        "consultationClientRequestId",
        "consultationServerPayloadPreview",
        "minimizeConsultationQueueResponse",
        "minimizeConsultationDetailResponse",
        "consultationDecisionRpcPreview",
        "consultationConversionToWizardDraft",
        "same client request ID must create the same payload",
        "exact four-argument decisions",
    ), SEMANTIC.name, errors)

    require(doc, (
        "repository-only consumer contract",
        "client_request_id",
        "Идемпотентный",
        "nav_v2_create_consultation",
        "nav_v2_decide_consultation",
        "p_conversion_mode",
        "deposit",
        "deal",
        "URL не входит в server payload",
        "не вызывает RPC",
        "Production gate",
        "Rollback",
    ), DOC.name, errors)

    require(workflow, (
        "python3 scripts/check_nav_v2_consultation_server_adapter.py",
        "node scripts/check-nav-v2-consultation-server-adapter.mjs",
        "node --check assets/js/nav-v2/consultation-server-adapter-v2.js",
        "node --check assets/js/nav-v2/consultation-v2.js",
        "nav-v2-consultation-server-adapter",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 consultation server adapter errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 consultation server adapter passed: idempotent create preview, exact four-argument "
        "decision contract, DTO minimization, safe conversion and no undeployed RPC calls"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
