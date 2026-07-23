from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "deal-card-v2.html"
RECHECK = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
POLICY = ROOT / "assets/js/nav-v2/task-process-policy-v1.js"
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
    paths = (PAGE, RECHECK, POLICY, MODEL, RENDERER, FIXTURE, TEST, CONTRACT, WORKFLOW, DOC)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if contract.get("decision") != "crm_handoff_task_policy_preview_added_no_backfill":
        errors.append("contract: unexpected decision")
    boundaries = contract.get("boundaries") or {}
    for key in (
        "automatic_crm_write",
        "navigator_database_write",
        "network_request",
        "browser_storage",
        "production_supabase_change",
        "production_data_change",
        "production_task_backfill",
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
        "exclude_assigned_person_identifiers",
        "use_process_state_only",
    ):
        if privacy.get(key) is not True:
            errors.append(f"contract: {key} must be true")
    task_policy_contract = contract.get("task_policy") or {}
    for key in (
        "preview_only",
        "use_explicit_task_type_first",
        "infer_legacy_null_task_type_from_source",
        "use_explicit_assigned_role_first",
        "hide_assigned_person_identity",
        "infer_default_owner_from_task_type",
        "use_explicit_due_date_first",
        "infer_control_due_date_from_created_at_and_sla",
    ):
        if task_policy_contract.get(key) is not True:
            errors.append(f"contract task_policy: {key} must be true")
    for key in ("production_task_backfill", "automatic_assignment"):
        if task_policy_contract.get(key) is not False:
            errors.append(f"contract task_policy: {key} must be false")

    policy = POLICY.read_text(encoding="utf-8")
    require(policy, (
        "export function classifyTaskForProcess(task = {}, nowValue = Date.now())",
        "task_type_source: explicitType ? 'explicit_task_type' : 'inferred_from_source'",
        "owner_source:",
        "deadline_source:",
        "preview_only: true",
        "assigned_person: 'назначенный сотрудник'",
        "legal_blocker: 'lawyer'",
        "broker_task: 'broker'",
        "system_recommendation: 'manager'",
        "quality_warning: 3",
        "legal_blocker: 1",
        "broker_task: 2",
        "system_recommendation: 5",
    ), POLICY.name, errors)
    for forbidden in (
        "document.", "window.", "localStorage", "sessionStorage", "fetch(", "rpc(",
        ".from('nav_", '.from("nav_', "nav_v2_update_", "nav_v2_add_", "nav_v2_save_",
        "full_name", "email", "phone", "passport",
    ):
        if forbidden in policy:
            errors.append(f"task policy must stay pure, read-only and identifier-free: {forbidden}")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "from './task-process-policy-v1.js?v=20260723-01'",
        "classifyTaskForProcess(task, nowValue)",
        "export function buildDealCardCrmHandoffModel(data, profile = null, nowValue = Date.now())",
        "{ key: 'stage', label: 'Текущий этап'",
        "{ key: 'result', label: 'Результат'",
        "{ key: 'obstacle', label: 'Риск или препятствие'",
        "{ key: 'agreement', label: 'Договорённость'",
        "{ key: 'missing', label: 'Не хватает'",
        "{ key: 'next', label: 'Следующее действие'",
        "inferred_task_types:",
        "inferred_task_deadlines:",
        "task_type_source:",
        "owner_source:",
        "deadline_source:",
        "preview_only: true",
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
        "from './deal-card-crm-handoff-model-v1.js?v=20260723-02'",
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
        '"./deal-card-crm-handoff-v1.js?v=20260723-01": "./assets/js/nav-v2/deal-card-crm-handoff-v1.js?v=20260723-02"',
    ), PAGE.name, errors)
    if '<script type="module" src="./assets/js/nav-v2/deal-card-crm-handoff-v1.js' in page:
        errors.append("CRM handoff must remain inside the consolidated deal-card enhancement hook")

    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    scenarios = fixture.get("scenarios") or []
    if len(scenarios) < 6:
        errors.append("fixture: at least six scenarios required")
    if not any((item.get("expect") or {}).get("forbidden") for item in scenarios):
        errors.append("fixture: privacy-negative scenario required")
    if not any(
        any(task.get("task_type") is None for task in ((item.get("data") or {}).get("tasks") or []))
        and "inferred_task_types" in (item.get("expect") or {})
        for item in scenarios
    ):
        errors.append("fixture: legacy null task_type inference scenario required")
    if not any(
        any(task.get("assigned_to") for task in ((item.get("data") or {}).get("tasks") or []))
        and (item.get("expect") or {}).get("owner") == "назначенный сотрудник"
        for item in scenarios
    ):
        errors.append("fixture: assigned person identity minimization scenario required")

    test = TEST.read_text(encoding="utf-8")
    require(test, (
        "buildDealCardCrmHandoffModel",
        "classifyTaskForProcess",
        "inferred_task_types",
        "inferred_task_deadlines",
        "task_type_source",
        "owner_source",
        "deadline_source",
        "forbidden client identifier",
        "taxonomy-derived owner/deadline preview",
        "pure task policy classifies legacy null task_type without mutation",
    ), TEST.name, errors)

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "assets/js/nav-v2/task-process-policy-v1.js",
        "python3 scripts/check_nav_v2_deal_card_crm_handoff_v1.py",
        "node tests/unit/nav-v2-deal-card-crm-handoff.test.mjs",
        "node --check assets/js/nav-v2/task-process-policy-v1.js",
        "node --check assets/js/nav-v2/deal-card-crm-handoff-model-v1.js",
        "node --check assets/js/nav-v2/deal-card-crm-handoff-v1.js",
        "node --check assets/js/nav-v2/deal-card-recheck-alert-v2.js",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 CRM handoff errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 CRM handoff passed: read-only taxonomy-derived owner/deadline preview, no PII copy, mutation or backfill")
    return 0


if __name__ == "__main__":
    sys.exit(main())
