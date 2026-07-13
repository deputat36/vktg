from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPN_PAGE = ROOT / "spn-v2.html"
CARD_PAGE = ROOT / "deal-card-v2.html"
GUARD = ROOT / "assets/js/nav-v2/spn-save-readiness-guard-v2.js"
CONFIRMATION = ROOT / "assets/js/nav-v2/deal-card-spn-save-confirmation-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (SPN_PAGE, CARD_PAGE, GUARD, CONFIRMATION, HOOK, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    spn_page = SPN_PAGE.read_text(encoding="utf-8")
    require(spn_page, (
        "spn-save-readiness-guard-v2.js?v=20260713-12",
        "spn-smart-v4.js?v=20260627-0345",
    ), SPN_PAGE.name, errors)
    if spn_page.index("spn-save-readiness-guard-v2.js") > spn_page.index("spn-smart-v4.js"):
        errors.append("SPN save observer must load before the wizard RPC module")

    guard = GUARD.read_text(encoding="utf-8")
    require(guard, (
        "nav_spn_saved_deal_handoff_v2",
        "/rest/v1/rpc/nav_v2_save_wizard_result",
        "response.clone().json()",
        "sessionStorage.setItem(SAVED_HANDOFF_KEY",
        "saved_at: Date.now()",
        "observeSuccessfulWizardSave();",
    ), GUARD.name, errors)
    if "preventDefault" in guard.split("function observeSuccessfulWizardSave", 1)[-1]:
        errors.append("save observer must not block or replace the existing save flow")
    if "service_role" in guard:
        errors.append("save observer must not contain service-role material")

    confirmation = CONFIRMATION.read_text(encoding="utf-8")
    require(confirmation, (
        "Кому передано",
        "Что произойдёт дальше",
        "Ответственный",
        "Контрольный срок",
        "Срок пока не назначен",
        "nav_v2_get_deal_responsibility_snapshot",
        "nav_spn_saved_deal_handoff_v2",
        "MARKER_TTL_MS",
        "data-spn-save-open=\"tasks\"",
        "data-spn-save-open=\"docs\"",
        "sessionStorage.removeItem(SAVED_HANDOFF_KEY)",
    ), CONFIRMATION.name, errors)
    if confirmation.count("rpc(") != 1:
        errors.append(f"SPN confirmation must use exactly one existing read RPC, got {confirmation.count('rpc(')}")
    for marker in ("nav_v2_update_", "nav_v2_add_", "nav_v2_save_", ".from('nav_", '.from("nav_'):
        if marker in confirmation:
            errors.append(f"SPN confirmation must remain read-only; found {marker!r}")

    hook = HOOK.read_text(encoding="utf-8")
    require(hook, (
        "deal-card-spn-save-confirmation-v2.js?v=20260713-11",
        "void applySpnSaveConfirmation(cardData);",
    ), HOOK.name, errors)

    card_page = CARD_PAGE.read_text(encoding="utf-8")
    if "deal-card-recheck-alert-v2.js?v=20260713-11" not in card_page:
        errors.append("deal-card importmap does not publish the SPN handoff lifecycle version")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_spn_save_handoff.py" not in workflow:
        errors.append("static workflow does not run SPN save handoff regression")

    if errors:
        print("Navigator v2 SPN save handoff errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 SPN save handoff passed: saved deal marker, responsibility, owner and due date are read-only")
    return 0


if __name__ == "__main__":
    sys.exit(main())
