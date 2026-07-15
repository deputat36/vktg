from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "deal-card-v2.html"
LIFECYCLE = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
BASE = ROOT / "assets/js/nav-v2/deal-card-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-spn-rework-v2.js"
MODEL = ROOT / "assets/js/nav-v2/deal-card-spn-rework-model-v2.js"
CSS = ROOT / "assets/css/nav-v2-spn-rework.css"
SEMANTIC = ROOT / "scripts/check-nav-v2-spn-rework-cycle.mjs"
BUDGET = ROOT / "config/nav-v2-module-budget.json"


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, LIFECYCLE, BASE, HOOK, MODEL, CSS, SEMANTIC, BUDGET):
        if not path.exists():
            errors.append(f"missing SPN rework cycle file: {path.relative_to(ROOT)}")

    if errors:
        print("Navigator v2 SPN rework cycle errors:")
        print("\n".join(f"- {error}" for error in errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    lifecycle = LIFECYCLE.read_text(encoding="utf-8")
    base = BASE.read_text(encoding="utf-8")
    hook = HOOK.read_text(encoding="utf-8")
    model = MODEL.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    budget = json.loads(BUDGET.read_text(encoding="utf-8"))

    for marker in (
        "nav-v2-spn-rework.css?v=20260715-01",
        "deal-card-recheck-alert-v2.js?v=20260715-14",
    ):
        if marker not in page:
            errors.append(f"deal-card-v2.html missing {marker!r}")

    for legacy in (
        "card-rework-v2.js",
        "spn-return-view-v2.js",
        "deal-card-handoff-text-v2.js",
    ):
        if legacy in page:
            errors.append(f"deal-card-v2.html still loads competing rework entry module {legacy!r}")

    lifecycle_markers = (
        "import { applyDealCardSpnRework } from './deal-card-spn-rework-v2.js?v=20260715-01';",
        "applyDealCardSpnRework(cardData, profileData);",
        "applyDealCardActionFocus(cardData, profileData);",
        "queueMicrotask(applyCardEnhancements);",
    )
    for marker in lifecycle_markers:
        if marker not in lifecycle:
            errors.append(f"deal-card lifecycle missing {marker!r}")
    if lifecycle.find("applyDealCardSpnRework(cardData, profileData);") > lifecycle.find("applyDealCardActionFocus(cardData, profileData);"):
        errors.append("SPN rework workflow must render before the general action focus")

    hook_markers = (
        "export function applyDealCardSpnRework(data, profile)",
        "buildSpnReworkModel(cardData, profileData)",
        "nav_v2_return_spn_rework",
        "nav_v2_submit_spn_rework",
        "Что именно исправлено",
        "Карточка отправлена и принята в работу",
        "Кому передано",
        "Что произойдёт дальше",
        "data-spn-rework-route",
    )
    for marker in hook_markers:
        if marker not in hook:
            errors.append(f"SPN rework DOM hook missing {marker!r}")
    for marker in (
        "nav_v2_get_deal_card",
        "nav_v2_get_my_profile",
        "new MutationObserver",
        "localStorage",
        "sessionStorage",
    ):
        if marker in hook:
            errors.append(f"SPN rework DOM hook contains duplicate bootstrap/storage marker {marker!r}")
    if hook.count("rpc(") != 2:
        errors.append(f"SPN rework hook must contain only the two existing mutation RPCs, got {hook.count('rpc(')}")

    model_markers = (
        "export function buildSpnReworkModel",
        "export function buildSpnReworkReturnComment",
        "returned_to_spn_rework",
        "spn_rework_submitted",
        "readyToSubmit",
        "completionComment",
        "nextOwner",
        "nextDueDate",
    )
    for marker in model_markers:
        if marker not in model:
            errors.append(f"SPN rework pure model missing {marker!r}")
    for marker in ("document.", "window.", "rpc(", "localStorage", "sessionStorage"):
        if marker in model:
            errors.append(f"SPN rework pure model contains browser/RPC marker {marker!r}")

    if "[data-spn-rework-return-form]" not in base or "form.open = true;" not in base:
        errors.append("base deal card must route the lawyer return action into the unified structured form")
    if "rpc('nav_v2_return_spn_rework'" in base:
        errors.append("base deal card must not bypass the unified structured return form")

    for marker in (
        ".spn-rework-workflow",
        ".spn-rework-item",
        ".spn-rework-confirmation",
        ".spn-rework-actions",
        "@media(max-width:860px)",
    ):
        if marker not in css:
            errors.append(f"SPN rework stylesheet missing {marker!r}")

    max_modules = ((budget.get("pages") or {}).get("deal-card-v2.html") or {}).get("max_modules")
    if max_modules != 19:
        errors.append(f"deal-card module budget must be 19 after lifecycle consolidation, got {max_modules!r}")

    if errors:
        print("Navigator v2 SPN rework cycle errors:")
        print("\n".join(f"- {error}" for error in errors))
        return 1

    print("Navigator v2 SPN rework cycle contract passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
