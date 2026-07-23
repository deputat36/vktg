from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "deal-card-v2.html"
RECHECK = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
MODEL = ROOT / "assets/js/nav-v2/deal-card-crm-handoff-model-v1.js"
RENDERER = ROOT / "assets/js/nav-v2/deal-card-crm-handoff-v1.js"
FIXTURE = ROOT / "fixtures/nav-v2-deal-card-crm-handoff-scenarios.json"
TEST = ROOT / "tests/unit/nav-v2-deal-card-crm-handoff.test.mjs"
CONTRACT = ROOT / "config/nav-v2-deal-card-crm-handoff-v1.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-deal-card-crm-handoff-v1.yml"
DOC = ROOT / "docs/NAV_V2_CRM_HANDOFF_V1_2026-07-23.md"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (PAGE, RECHECK, MODEL, RENDERER, FIXTURE, TEST, CONTRACT, WORKFLOW, DOC)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if contract.get("decision") != "crm_handoff_summary_added_read_only_no_crm_write":
        errors.append("contract: unexpected decision")
    boundaries = contract.get("boundaries") or {}
    for key in (
        "automatic_crm_write",
        "navigator_database_write",
        "network_request",
        "browser_storage",
        "production_supabase_change",
        "production_data_change",
        "leader_scope_change",
    ):
        if boundaries.get(key) is not False:
            errors.append(f"contract: {key} must be false")
    privacy = contract.get("privacy") or {}
    for key in (
        "exclude_client_names",
        "exclude_address",
        "exclude_phone_email",
        "exclude_document_numbers",
        "exclude_free_text_next_action",
        "use_process_state_only",
    ):
        if privacy.get(key) is not True:
            errors.append(f"contract: {key} must be true")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function buildDealCardCrmHandoffModel(data, profile = null)",
        "{ key: 'stage', label: 'Текущий этап'",
        "{ key: 'result', label: 'Результат'",
        "{ key: 'obstacle', label: 'Риск или препятствие'",
        "{ key: 'agreement', label: 'Договорённость'",
        "{ key: 'missing', label: 'Не хватает'",
        "{ key: 'next', label: 'Следующее действие'",
        "срок требуется уточнить",
        "includes_client_identifiers: false",
        "source: 'already_loaded_process_state'",
    ), MODEL.name, errors)
    for forbidden in (
        "document.", "window.", "localStorage", "sessionStorage", "fetch(", "rpc(",
        "deal?.address", "deal.address", "seller_name", "buyer_name", "phone", "email",
        "passport", "deal?.next_action", "deal.next_action",
    ):
        if forbidden in model:
            errors.append(f"model must stay process-only and pure: {forbidden}")

    renderer = RENDERER.read_text(encoding="utf-8")
    require(renderer, (
        "export function applyDealCardCrmHandoff(data, profile)",
        "Навигатор не создаёт вторую CRM",
        "ничего не сохраняет автоматически",
        "Скопировать запись",
        "Клиентские идентификаторы в сводку не добавляются",
        "role=\"status\"",
        "aria-live=\"polite\"",
        "navigator.clipboard?.writeText",
        "document.execCommand('copy')",
    ), RENDERER.name, errors)
    for forbidden in (
        "fetch(", "rpc(", "localStorage", "sessionStorage", ".from('nav_", '.from("nav_',
        "nav_v2_update_", "nav_v2_add_", "nav_v2_save_",
    ):
        if forbidden in renderer:
            errors.append(f"renderer must not mutate or bootstrap data: {forbidden}")

    recheck = RECHECK.read_text(encoding="utf-8")
    require(recheck, (
        "import { applyDealCardCrmHandoff } from './deal-card-crm-handoff-v1.js?v=20260723-01';",
        "applyDealCardCrmHandoff(cardData, profileData);",
    ), RECHECK.name, errors)
    if recheck.find("applyDealCardCrmHandoff(cardData, profileData);") < recheck.find("applyDealResponsibilitySnapshot(cardData);"):
        errors.append("CRM handoff must run after responsibility snapshot")

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        '"./deal-card-recheck-alert-v2.js?v=20260715-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260723-01"',
    ), PAGE.name, errors)
    if '<script type="module" src="./assets/js/nav-v2/deal-card-crm-handoff-v1.js' in page:
        errors.append("CRM handoff must remain inside the consolidated deal-card enhancement hook")

    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    scenarios = fixture.get("scenarios") or []
    if len(scenarios) < 4:
        errors.append("fixture: at least four scenarios required")
    if not any((item.get("expect") or {}).get("forbidden") for item in scenarios):
        errors.append("fixture: privacy-negative scenario required")

    test = TEST.read_text(encoding="utf-8")
    require(test, (
        "buildDealCardCrmHandoffModel",
        "includes_client_identifiers",
        "forbidden client identifier",
        "process-only copy and explicit owner/deadline",
    ), TEST.name, errors)

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "python3 scripts/check_nav_v2_deal_card_crm_handoff_v1.py",
        "node tests/unit/nav-v2-deal-card-crm-handoff.test.mjs",
        "node --check assets/js/nav-v2/deal-card-crm-handoff-model-v1.js",
        "node --check assets/js/nav-v2/deal-card-crm-handoff-v1.js",
        "node --check assets/js/nav-v2/deal-card-recheck-alert-v2.js",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 CRM handoff errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 CRM handoff passed: read-only process summary, explicit owner/deadline, no PII copy or mutation surface")
    return 0


if __name__ == "__main__":
    sys.exit(main())
