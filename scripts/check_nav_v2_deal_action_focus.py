from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "deal-card-v2.html"
LIFECYCLE = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
HOOK = ROOT / "assets/js/nav-v2/deal-card-action-focus-v2.js"
MODEL = ROOT / "assets/js/nav-v2/deal-card-action-focus-model-v2.js"
CSS = ROOT / "assets/css/nav-v2-deal-action-focus.css"
SEMANTIC = ROOT / "scripts/check-nav-v2-deal-action-focus.mjs"


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, LIFECYCLE, HOOK, MODEL, CSS, SEMANTIC):
        if not path.exists():
            errors.append(f"missing deal action-focus file: {path.relative_to(ROOT)}")

    if errors:
        print("Navigator v2 deal action-focus errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    page = PAGE.read_text(encoding="utf-8")
    lifecycle = LIFECYCLE.read_text(encoding="utf-8")
    hook = HOOK.read_text(encoding="utf-8")
    model = MODEL.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")

    for marker in (
        "nav-v2-deal-action-focus.css?v=20260714-01",
        "deal-card-recheck-alert-v2.js?v=20260715-15",
    ):
        if marker not in page:
            errors.append(f"deal-card-v2.html: missing {marker!r}")

    lifecycle_markers = (
        "import { applyDealCardActionFocus } from './deal-card-action-focus-v2.js?v=20260714-12';",
        "applyDealCardSpnRework(cardData, profileData);",
        "applyDealCardActionFocus(cardData, profileData);",
        "queueMicrotask(applyCardEnhancements);",
    )
    for marker in lifecycle_markers:
        if marker not in lifecycle:
            errors.append(f"deal-card recheck lifecycle: missing {marker!r}")
    if lifecycle.find("applyDealCardActionFocus(cardData, profileData);") < lifecycle.find("applyDealCardSpnRework(cardData, profileData);"):
        errors.append("deal action focus must run after the SPN rework workflow")

    hook_markers = (
        "export function applyDealCardActionFocus(data, profile)",
        "buildDealActionFocus(data, profile || data?.profile || null)",
        "id=\"dealActionFocus\"",
        "Главное действие сейчас",
        "Ответственный",
        "Как понять, что готово",
        "data-action-focus-tab",
        "Режим наблюдения",
    )
    for marker in hook_markers:
        if marker not in hook:
            errors.append(f"deal-card-action-focus-v2.js: missing {marker!r}")

    for marker in (
        "rpc(",
        "localStorage",
        "sessionStorage",
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        "new MutationObserver",
    ):
        if marker in hook:
            errors.append(f"deal-card-action-focus-v2.js: forbidden RPC/mutation/storage marker {marker!r}")

    model_markers = (
        "export function buildDealActionFocus",
        "pickPrimaryTask",
        "deadlineState",
        "taskResultCriteria",
        "fallbackAction",
        "overdueTasks",
        "missingDocuments",
        "readOnly",
    )
    for marker in model_markers:
        if marker not in model:
            errors.append(f"deal-card-action-focus-model-v2.js: missing {marker!r}")
    for marker in ("document.", "window.", "rpc(", "localStorage", "sessionStorage"):
        if marker in model:
            errors.append(f"deal-card-action-focus-model-v2.js: pure model contains {marker!r}")

    for marker in (
        ".deal-action-focus",
        ".deal-action-focus-grid",
        ".deal-action-focus-result",
        ".deal-action-focus-actions",
        "@media(max-width:860px)",
    ):
        if marker not in css:
            errors.append(f"nav-v2-deal-action-focus.css: missing {marker!r}")

    if errors:
        print("Navigator v2 deal action-focus errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 deal action-focus contract passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
