from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "config/nav-v2-intake-contract-v1.json"
MODEL = ROOT / "assets/js/nav-v2/spn-intake-contract-v1.js"
FIXTURES = ROOT / "tests/fixtures/nav-v2-intake-contract-v1.json"
SEMANTIC = ROOT / "scripts/check-nav-v2-intake-contract-v1.mjs"
WORKFLOW = ROOT / ".github/workflows/nav-v2-intake-contract-v1.yml"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (CATALOG, MODEL, FIXTURES, SEMANTIC, WORKFLOW, STATIC_WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    if catalog.get("contract_version") != 1:
        errors.append("catalog contract_version must be 1")
    if [step.get("id") for step in catalog.get("steps", [])] != ["situation", "facts", "review"]:
        errors.append("catalog must expose exactly situation -> facts -> review")
    if catalog.get("tri_state_values") != ["yes", "no", "unknown", "not_applicable"]:
        errors.append("catalog must preserve explicit four-state answers")
    if catalog.get("evidence_sources") != ["document", "client", "unchecked"]:
        errors.append("catalog must preserve document/client/unchecked evidence")

    question_ids = [item.get("id") for item in catalog.get("fact_questions", [])]
    if len(question_ids) != len(set(question_ids)):
        errors.append("fact question ids must be unique")
    if len(question_ids) < 20:
        errors.append("catalog must contain the minimum cross-scenario question set")

    request_ids = {item.get("id") for item in catalog.get("lawyer_request_types", [])}
    document_types = {item.get("id"): item for item in catalog.get("document_types", [])}
    rule_ids: set[str] = set()
    for rule in catalog.get("rules", []):
        rule_id = rule.get("id")
        if not rule_id or rule_id in rule_ids:
            errors.append(f"duplicate or missing rule id: {rule_id!r}")
        rule_ids.add(rule_id)
        if rule.get("owner") == "broker" and rule_id not in {"mortgage", "military_mortgage"}:
            errors.append(f"broker scope must remain mortgage-only: {rule_id}")
        request_type = rule.get("lawyer_request_type")
        if request_type and request_type not in request_ids:
            errors.append(f"rule {rule_id} uses unknown lawyer request type {request_type}")
        for document_type in rule.get("documents", []):
            if document_type not in document_types:
                errors.append(f"rule {rule_id} uses unknown document type {document_type}")
    for document_type, item in document_types.items():
        if item.get("side") not in {"seller", "buyer", "object", "deal"}:
            errors.append(f"document type {document_type} has invalid side {item.get('side')}")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export const NAV_V2_INTAKE_CONTRACT_VERSION = 1",
        "export function activeFactQuestions",
        "export function matchedIntakeRules",
        "export function buildLegalPassport",
        "export function evaluateIntakeGates",
        "export function buildIntakeAssessment",
        "export function adaptLegacyWizardDraft",
        "urgent_incomplete",
        "mortgage_only",
    ), MODEL.name, errors)
    for forbidden in ("rpc(", "fetch(", "localStorage", "sessionStorage", ".from('nav_", '.from("nav_'):
        if forbidden in model:
            errors.append(f"intake model must remain pure and repository-only: {forbidden}")

    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    scenario_ids = {item.get("id") for item in fixtures.get("scenarios", [])}
    required_scenarios = {
        "cash_sale", "mortgage", "mortgage_and_matcap", "matcap_without_mortgage",
        "minor_seller", "minor_buyer", "power_of_attorney", "share_sale", "inheritance",
        "spouse_consent", "seller_absent", "minor_registered",
        "flat_ground", "house_with_land", "encumbrance", "payment_after_registration",
        "partner_deal", "two_spn", "object_not_selected", "urgent_incomplete_lawyer_handoff",
        "draft_without_handoff",
    }
    missing_scenarios = sorted(required_scenarios - scenario_ids)
    if missing_scenarios:
        errors.append(f"missing semantic scenarios: {', '.join(missing_scenarios)}")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    commands = (
        "python3 scripts/check_nav_v2_intake_contract_v1.py",
        "node scripts/check-nav-v2-intake-contract-v1.mjs",
    )
    for command in commands:
        if command not in workflow:
            errors.append(f"{WORKFLOW.name}: missing {command}")
        if command not in static_workflow:
            errors.append(f"{STATIC_WORKFLOW.name}: missing {command}")

    if errors:
        print("Navigator v2 intake contract v1 errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 intake contract v1 passed: three stages, four-state facts, evidence sources, "
        "versioned legal rules, mortgage-only broker scope, repository-only model and semantic fixtures"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
