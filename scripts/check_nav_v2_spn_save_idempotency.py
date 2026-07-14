from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "spn-v2.html"
GUARD = ROOT / "assets/js/nav-v2/spn-save-idempotency-guard-v2.js"
MODEL = ROOT / "assets/js/nav-v2/spn-save-idempotency-model-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-spn-save-idempotency.mjs"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"
DEDICATED_WORKFLOW = ROOT / ".github/workflows/nav-v2-spn-save-idempotency.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, GUARD, MODEL, SEMANTIC, BUDGET, STATIC_WORKFLOW, DEDICATED_WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "spn-duplicate-deal-guard-v2.js?v=20260624-0740",
        "spn-save-idempotency-guard-v2.js?v=20260714-01",
        "spn-smart-v4.js?v=20260627-0345",
    ), PAGE.name, errors)
    duplicate_at = page.find("spn-duplicate-deal-guard-v2.js")
    idempotency_at = page.find("spn-save-idempotency-guard-v2.js")
    smart_at = page.find("spn-smart-v4.js")
    if not (0 <= duplicate_at < idempotency_at < smart_at):
        errors.append("spn-v2.html: duplicate guard, idempotency guard and smart wizard must load in that order")

    guard = GUARD.read_text(encoding="utf-8")
    require(guard, (
        "wizardSubmissionFingerprint",
        "tryClaimWizardSaveLease",
        "currentWizardSaveReceipt",
        "storeWizardSaveReceipt",
        "navigator.locks?.request",
        "ifAvailable: true",
        "nav-v2-wizard-save:",
        "nav_v2_get_deals_list",
        "localStorage.getItem(DRAFT_KEY)",
        "Повторная идентичная отправка",
        "Идентичная заявка уже была сохранена недавно",
        "stopImmediatePropagation",
        "bypassFingerprint",
        "releaseWizardSaveLease",
    ), GUARD.name, errors)
    if guard.count("rpc('nav_v2_get_deals_list'") != 1:
        errors.append("idempotency guard must use exactly one read-only deals-list RPC call site")
    for forbidden in (
        "nav_v2_save_wizard_result",
        "nav_v2_update_",
        "nav_v2_add_",
        ".from('nav_",
        '.from("nav_',
    ):
        if forbidden in guard:
            errors.append(f"idempotency guard must not call mutation surface directly: {forbidden}")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function wizardSubmissionFingerprint",
        "export function tryClaimWizardSaveLease",
        "export function releaseWizardSaveLease",
        "export function storeWizardSaveReceipt",
        "export function currentWizardSaveReceipt",
        "LEASE_TTL_MS = 120_000",
        "RECEIPT_TTL_MS = 10 * 60_000",
        "nav_spn_save_lease_v2:",
        "nav_spn_save_receipt_v2:",
    ), MODEL.name, errors)
    for forbidden in ("document.", "window.", "navigator.", "localStorage", "sessionStorage", "rpc(", "fetch("):
        if forbidden in model:
            errors.append(f"idempotency model must remain pure and offline: {forbidden}")

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, (
        "assert.equal(firstClaim.acquired, true)",
        "assert.equal(competingClaim.acquired, false)",
        "assert.equal(afterExpiry.acquired, true)",
        "currentWizardSaveReceipt",
        "semantic regression passed",
    ), SEMANTIC.name, errors)

    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    if (budget.get("pages") or {}).get(PAGE.name) != {"max_modules": 18}:
        errors.append("spn-v2.html must have an 18-module budget after the idempotency guard")

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    dedicated_workflow = DEDICATED_WORKFLOW.read_text(encoding="utf-8")
    python_command = "python3 scripts/check_nav_v2_spn_save_idempotency.py"
    node_command = "node scripts/check-nav-v2-spn-save-idempotency.mjs"
    for workflow, label in ((static_workflow, STATIC_WORKFLOW.name), (dedicated_workflow, DEDICATED_WORKFLOW.name)):
        if python_command not in workflow:
            errors.append(f"{label}: missing SPN save idempotency static regression")
        if node_command not in workflow:
            errors.append(f"{label}: missing SPN save idempotency semantic regression")

    if errors:
        print("Navigator v2 SPN save idempotency errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 SPN save idempotency passed: deterministic payload fingerprint, cross-tab lock, "
        "recent receipt, safe module order, one read-only lookup and no direct mutation call"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
