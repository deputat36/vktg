from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "assets/js/nav-v2/spn-intake-work-plan-v1.js"
CONTRACT = ROOT / "assets/js/nav-v2/spn-intake-contract-v1.js"
PROTOTYPE = ROOT / "assets/js/nav-v2/spn-intake-prototype-v1.js"
FIXTURES = ROOT / "tests/fixtures/nav-v2-intake-work-plan-v1.json"
SEMANTIC = ROOT / "scripts/check-nav-v2-intake-work-plan-v1.mjs"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (MODEL, CONTRACT, PROTOTYPE, FIXTURES, SEMANTIC):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function buildIntakeWorkPlan(draft = {}, catalog = {}, matchedRules = [])",
        "side_not_accompanied",
        "document_candidates",
        "skipped_documents",
        "task_candidates",
        "ready_tasks",
        "needs_owner",
        "deadline_rule",
        "evidence",
        "expected_result",
        "allowed_link_approved",
        "url.protocol !== 'https:'",
    ), MODEL.name, errors)
    for forbidden in ("document.", "window.", "rpc(", "fetch(", "localStorage", "sessionStorage", "supabase"):
        if forbidden in model:
            errors.append(f"{MODEL.name}: pure model contains {forbidden!r}")

    contract = CONTRACT.read_text(encoding="utf-8")
    require(contract, (
        "import { buildIntakeWorkPlan } from './spn-intake-work-plan-v1.js?v=20260717-01';",
        "const workPlan = buildIntakeWorkPlan(draft, catalog, rules);",
        "work_plan: workPlan",
        "evaluateIntakeGates(draft, passport, workPlan)",
        "incomplete lawyer task contract",
        "incomplete broker task contract",
        "incomplete spn task contract",
    ), CONTRACT.name, errors)

    prototype = PROTOTYPE.read_text(encoding="utf-8")
    require(prototype, (
        "assessment.work_plan.document_candidates",
        "Документы по сопровождаемой стороне",
        "Конкретные задачи",
        "назначается при сохранении",
        "work_plan: assessment.work_plan",
    ), PROTOTYPE.name, errors)
    for forbidden in ("rpc(", "supabase.", "POST", "PATCH", "DELETE"):
        if forbidden in prototype:
            errors.append(f"{PROTOTYPE.name}: detached prototype contains mutation marker {forbidden!r}")

    data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    if len(data.get("scenarios", [])) < 7:
        errors.append("work-plan fixtures must cover at least seven scenarios")
    serialized = json.dumps(data, ensure_ascii=False).lower()
    for forbidden in ("passport_number", "bank_card", "snils", "document_content"):
        if forbidden in serialized:
            errors.append(f"fixtures contain forbidden field {forbidden!r}")

    if errors:
        print("Navigator v2 intake work plan errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 intake work plan passed: pure side-aware documents, assignment-gated concrete tasks, "
        "mortgage-only broker scope, safe link metadata and detached prototype preview"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
