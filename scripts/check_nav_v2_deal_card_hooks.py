from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_MODULE = ROOT / "assets/js/nav-v2/deal-card-v2.js"
RECHECK_MODULE = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
PAGE = ROOT / "deal-card-v2.html"
BUDGET = ROOT / "config/nav-v2-module-budget.json"


def main() -> int:
    errors: list[str] = []
    for path in (BASE_MODULE, RECHECK_MODULE, PAGE, BUDGET):
        if not path.exists():
            errors.append(f"Missing deal-card hook file: {path.relative_to(ROOT)}")

    if not errors:
        base = BASE_MODULE.read_text(encoding="utf-8")
        recheck = RECHECK_MODULE.read_text(encoding="utf-8")
        page = PAGE.read_text(encoding="utf-8")
        budget = json.loads(BUDGET.read_text(encoding="utf-8"))

        base_markers = (
            "import { applyDealCardRecheckAlert } from './deal-card-recheck-alert-v2.js?v=20260711-02';",
            "renderCard(cardData);",
            "applyDealCardRecheckAlert(cardData, currentProfile);",
        )
        for marker in base_markers:
            if marker not in base:
                errors.append(f"deal-card-v2.js missing explicit recheck hook marker: {marker}")
        if base.find("applyDealCardRecheckAlert(cardData, currentProfile);") < base.find("renderCard(cardData);"):
            errors.append("deal-card-v2.js must run recheck hook after the card DOM is rendered")

        if "export function applyDealCardRecheckAlert(data, profile)" not in recheck:
            errors.append("deal-card-recheck-alert-v2.js must export the explicit hook")
        forbidden_recheck_markers = (
            "rpc('nav_v2_get_deal_card'",
            "getMyProfile(",
            "new MutationObserver",
            "loadRecheckAlert()",
        )
        for marker in forbidden_recheck_markers:
            if marker in recheck:
                errors.append(f"deal-card-recheck-alert-v2.js still contains legacy patch behavior: {marker}")

        if 'deal-card-v2.js?v=20260711-02' not in page:
            errors.append("deal-card-v2.html missing explicit-hook cache-bust")
        if '<script type="module" src="./assets/js/nav-v2/deal-card-recheck-alert-v2.js' in page:
            errors.append("deal-card recheck helper must not remain a standalone HTML entry module")

        max_modules = ((budget.get("pages") or {}).get("deal-card-v2.html") or {}).get("max_modules")
        if max_modules != 29:
            errors.append(f"deal-card module budget must be 29 after consolidation, got {max_modules!r}")

    if errors:
        print("Navigator v2 deal-card hook errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 deal-card hook passed: recheck alert uses explicit lifecycle integration")
    return 0


if __name__ == "__main__":
    sys.exit(main())
