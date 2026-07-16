from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-task-dual-path-contract.json"
SCENARIOS = ROOT / "fixtures/nav-v2-task-dual-path-scenarios.json"
ROUTER = ROOT / "assets/js/nav-v2/task-action-router-v2.js"
EDGE_CONTRACT = ROOT / "supabase/functions/nav-v2-deal-api/task-action-contract-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-task-dual-path.mjs"
FIXTURE = ROOT / "tests/fixtures/nav-v2-task-action-dual-path.html"
E2E = ROOT / "tests/e2e/task-action-dual-path.spec.js"
DOC = ROOT / "docs/NAV_V2_TASK_DUAL_PATH_CONTRACT_2026-07-16.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-task-dual-path.yml"
DEAL_CARD = ROOT / "assets/js/nav-v2/deal-card-v2.js"
GUARD = ROOT / "assets/js/nav-v2/task-action-guard-v2.js"
EDGE_INDEX = ROOT / "supabase/functions/nav-v2-deal-api/index.ts"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    paths = (CONTRACT, SCENARIOS, ROUTER, EDGE_CONTRACT, SEMANTIC, FIXTURE, E2E, DOC, WORKFLOW, DEAL_CARD, GUARD, EDGE_INDEX)
    for path in paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    scenarios = json.loads(SCENARIOS.read_text(encoding="utf-8"))
    router = ROUTER.read_text(encoding="utf-8")
    edge_contract = EDGE_CONTRACT.read_text(encoding="utf-8")
    semantic = SEMANTIC.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    e2e = E2E.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    runtime_files = {
        DEAL_CARD.relative_to(ROOT).as_posix(): DEAL_CARD.read_text(encoding="utf-8"),
        GUARD.relative_to(ROOT).as_posix(): GUARD.read_text(encoding="utf-8"),
        EDGE_INDEX.relative_to(ROOT).as_posix(): EDGE_INDEX.read_text(encoding="utf-8"),
    }

    if contract.get("status") != "repository_only_dual_path_gate":
        errors.append("dual-path contract status drifted")
    if contract.get("production_changed") is not False:
        errors.append("dual-path contract must remain non-production")
    if contract.get("runtime_integrated") is not False or contract.get("transport_enabled") is not False:
        errors.append("dual-path router must remain detached and transport-free")
    if scenarios.get("synthetic_only") is not True:
        errors.append("dual-path scenarios must remain synthetic-only")
    if len(scenarios.get("cases") or []) < 10:
        errors.append("dual-path route matrix must contain at least ten cases")
    if len(scenarios.get("edge_cases") or []) < 4:
        errors.append("edge action matrix must contain at least four cases")

    require(router, (
        "taskActionControlModel",
        "taskActionRoutePreview",
        "nav_v2_update_task_status",
        "boundedTaskStartRpcPreview",
        "boundedTaskCompleteRpcPreview",
        "boundedTaskActiveOutcomeRpcPreview",
        "boundedTaskTerminalProposalRpcPreview",
        "boundedTaskTerminalDecisionRpcPreview",
        "Завершённая bounded-задача неизменяема",
        "duplicate_handler_allowed: false",
        "runtime_integrated: false",
        "transport_enabled: false",
    ), ROUTER.name, errors)

    for forbidden in ("fetch(", ".rpc(", ".from(", "document.", "window.", "localStorage", "sessionStorage"):
        if forbidden in router:
            errors.append(f"dual-path router must remain pure: {forbidden}")

    require(edge_contract, (
        "validateTaskEdgeAction",
        "legacy_update_task_status",
        "bounded_task_start",
        "bounded_task_complete",
        "bounded_task_active_outcome",
        "bounded_task_terminal_proposal",
        "bounded_task_terminal_decision",
        "Неизвестные поля",
        "Legacy action запрещён для contract-v2 задачи",
        "runtime_integrated: false",
        "transport_enabled: false",
    ), EDGE_CONTRACT.name, errors)

    for forbidden in ("Deno.serve", "fetch(", ".rpc(", "createClient(", "SUPABASE_"):
        if forbidden in edge_contract:
            errors.append(f"edge action contract must remain transport-free: {forbidden}")

    for path, text in runtime_files.items():
        if "task-action-router-v2.js" in text or "task-action-contract-v2.js" in text:
            errors.append(f"repository-only dual-path contract was integrated into runtime: {path}")

    require(semantic, (
        "taskActionRoutePreview",
        "validateTaskEdgeAction",
        "duplicate_handler_allowed",
        "immutable_create_new_audited_task",
        "Navigator v2 task dual-path semantic scenarios passed",
    ), SEMANTIC.name, errors)

    require(fixture, (
        'id="legacyComplete"',
        'id="boundedComplete"',
        'id="boundedReopen"',
        'id="boundedWaiting"',
        'id="boundedDecision"',
        "window.__dualPathRouteCalls",
        "taskActionRoutePreview",
    ), FIXTURE.name, errors)

    require(e2e, (
        "legacy and bounded actions select exactly one transport-free route",
        "nav_v2_update_task_status",
        "nav_v2_complete_bounded_task",
        "nav_v2_set_bounded_task_active_outcome",
        "nav_v2_decide_bounded_task_terminal_outcome",
        "window.__dualPathRouteCalls",
        "networkCalls",
        "toEqual([])",
    ), E2E.name, errors)

    guarantees = contract.get("separation_guarantees") or {}
    if any(value is not False for value in guarantees.values()):
        errors.append("all dual-path separation guarantees must remain false")

    require(doc, (
        "repository-only dual-path gate",
        "authoritative handler",
        "Legacy path",
        "Bounded path",
        "Bounded reopen запрещён",
        "Edge action contract",
        "Synthetic browser regression",
        "Что ещё блокирует deployment",
        "Production gate",
        "Rollback",
    ), DOC.name, errors)

    require(workflow, (
        "python3 scripts/check_nav_v2_task_dual_path.py",
        "node scripts/check-nav-v2-task-dual-path.mjs",
        "node --check assets/js/nav-v2/task-action-router-v2.js",
        "node --check supabase/functions/nav-v2-deal-api/task-action-contract-v2.js",
        "npx playwright test tests/e2e/task-action-dual-path.spec.js",
        "nav-v2-task-dual-path",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 task dual-path contract errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 task dual-path contract passed: one pure router, exact legacy/bounded routes, immutable bounded completion, Edge payload validation and no runtime integration")
    return 0


if __name__ == "__main__":
    sys.exit(main())
