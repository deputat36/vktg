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
DOC = ROOT / "docs/NAV_V2_CONSULTATION_SERVER_ADAPTER_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-consultation-server-adapter.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (ADAPTER, UI, FIXTURES, SEMANTIC, SERVER_CONTRACT, SERVER_PROTOTYPE, DOC, WORKFLOW):
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
    semantic = SEMANTIC.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    if contract.get("status") != "repository_only_prototype" or contract.get("production_applied") is not False:
        errors.append("server consultation contract must remain repository-only and non-production")
    if "-- REPOSITORY-ONLY PROTOTYPE." not in prototype:
        errors.append("server consultation SQL must remain a prototype")

    require(adapter, (
        "export function consultationServerPayloadPreview",
        "export function minimizeConsultationQueueItem",
        "export function minimizeConsultationQueueResponse",
        "export function minimizeConsultationDetailResponse",
        "export function consultationDecisionPresentation",
        "export function consultationConversionToWizardDraft",
        "request_type: REQUEST_TYPE_BY_STAGE[value.stage] || 'legal_answer'",
        "representation_model: REPRESENTATION_MAP[value.side] || 'unknown'",
        "has_external_documents: Boolean(value.documents_url)",
        "document_url_persisted: false",
        "deal_created: false",
        "backlog_created: false",
        "known_facts_preserved_in_question",
    ), ADAPTER.name, errors)

    for forbidden in (
        "document.", "window.", "localStorage", "sessionStorage", "rpc(", "fetch(", ".from(",
        "nav_v2_create_consultation", "nav_v2_decide_consultation", "nav_v2_close_consultation"
    ):
        if forbidden in adapter:
            errors.append(f"consultation adapter must remain pure and transport-free: {forbidden}")

    payload_start = adapter.find("const payload = {")
    payload_end = adapter.find("\n  };", payload_start)
    payload_block = adapter[payload_start:payload_end] if payload_start >= 0 and payload_end >= 0 else ""
    if not payload_block:
        errors.append("could not locate consultation payload allowlist")
    for forbidden_key in ("documents_url:", "document_source_url:", "known_facts:", "client_name:", "phone:", "email:"):
        if forbidden_key in payload_block:
            errors.append(f"future create payload contains forbidden key: {forbidden_key}")

    queue_keys = set(contract.get("queue_item_keys") or [])
    for key in queue_keys:
        if f"'{key}'" not in adapter:
            errors.append(f"adapter queue allowlist missing server key: {key}")
    for key in contract.get("queue_forbidden_keys") or []:
        if key in {"question", "body", "safe_reference", "document_source_url", "client_name", "phone", "email"}:
            if f"'{key}'" in adapter.split("const QUEUE_ITEM_KEYS", 1)[1].split("]);", 1)[0]:
                errors.append(f"adapter queue allowlist exposes forbidden key: {key}")

    require(ui, (
        "consultationServerPayloadPreview",
        "consultationServerReadiness",
        "renderServerReadiness",
        "Будущий серверный payload готов",
        "Сохранится только признак наличия документов, не сама ссылка",
        "Данные никуда не отправляются",
    ), UI.name, errors)
    for forbidden in (
        "rpc('nav_v2_create_consultation'", 'rpc("nav_v2_create_consultation"',
        "nav_v2_decide_consultation", "nav_v2_add_consultation_clarification",
        "nav_v2_close_consultation", ".from('nav_consultations_v2'", '.from("nav_consultations_v2"'
    ):
        if forbidden in ui:
            errors.append(f"consultation UI must not call undeployed server surface: {forbidden}")

    if fixtures.get("synthetic_only") is not True:
        errors.append("adapter fixtures must remain synthetic-only")
    if len(fixtures.get("payload_cases") or []) < 6:
        errors.append("adapter payload matrix must contain at least six cases")
    payload_ids = {case.get("id") for case in fixtures.get("payload_cases") or []}
    for required in (
        "basic_question", "deposit_partner", "mortgage_matcap", "document_url_stripped",
        "minor_codes_are_lossless_in_text", "spouse_is_preserved_in_text"
    ):
        if required not in payload_ids:
            errors.append(f"missing adapter scenario {required}")

    require(semantic, (
        "consultationServerPayloadPreview",
        "minimizeConsultationQueueResponse",
        "minimizeConsultationDetailResponse",
        "consultationDecisionPresentation",
        "consultationConversionToWizardDraft",
        "document_url_persisted",
        "Navigator v2 consultation server adapter regression passed",
    ), SEMANTIC.name, errors)

    require(doc, (
        "repository-only consumer contract",
        "URL не входит в server payload",
        "известные факты",
        "укрупнённую категорию",
        "queue DTO",
        "detail DTO",
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
        "Navigator v2 consultation server adapter passed: lossless question text, URL stripping, "
        "DTO minimization, decision copy, explicit conversion and no undeployed RPC calls"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
