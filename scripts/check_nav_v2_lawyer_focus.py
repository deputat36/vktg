from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "queue-v2.html"
MODULE = ROOT / "assets/js/nav-v2/queue-v2.js"
STYLE = ROOT / "assets/css/nav-v2-lawyer-focus.css"
MODULE_BUDGET = ROOT / "config/nav-v2-module-budget.json"
AUTH_TEST = ROOT / "tests/e2e/authenticated-smoke.spec.js"
PUBLIC_TEST = ROOT / "tests/e2e/public-smoke.spec.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PAGE, MODULE, STYLE, MODULE_BUDGET, AUTH_TEST, PUBLIC_TEST, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        "assets/css/nav-v2-lawyer-focus.css?v=20260713-01",
        "assets/js/nav-v2/queue-v2.js?v=20260713-01",
        'aria-live="polite"',
    ), PAGE.name, errors)

    module = MODULE.read_text(encoding="utf-8")
    require(module, (
        "Следующая важная сделка",
        "Почему сейчас",
        "Главное действие",
        "data-lawyer-next",
        "lawyer-focus-details",
        "lawyer-secondary-summary",
        "lawyer-full-queue",
        'aria-pressed="${queue === k}"',
        "let focusIndex = 0",
        "function primaryAction",
        "rpc('nav_v2_get_lawyer_queue'",
        "rpc('nav_v2_get_lawyer_review_summary'",
    ), MODULE.name, errors)
    if module.count("rpc(") != 2:
        errors.append(f"queue-v2.js must keep exactly two read RPC calls, got {module.count('rpc(')}")
    for marker in ("nav_v2_update_", "nav_v2_add_", "nav_v2_save_", ".from('nav_", '.from("nav_'):
        if marker in module:
            errors.append(f"lawyer focus must remain read-only; found {marker!r}")

    style = STYLE.read_text(encoding="utf-8")
    require(style, (
        ".lawyer-focus",
        ".lawyer-focus-reason",
        ".lawyer-focus-action",
        ".lawyer-secondary-summary",
        ".lawyer-full-queue",
        "@media(max-width:700px)",
    ), STYLE.name, errors)

    budget = json.loads(MODULE_BUDGET.read_text(encoding="utf-8"))
    if budget.get("pages", {}).get("queue-v2.html", {}).get("max_modules") != 3:
        errors.append("queue-v2.html module budget must remain 3")

    auth_test = AUTH_TEST.read_text(encoding="utf-8")
    require(auth_test, ("role === 'lawyer'", "'/queue-v2.html'", "Следующая важная сделка"), AUTH_TEST.name, errors)

    public_test = PUBLIC_TEST.read_text(encoding="utf-8")
    if "'/queue-v2.html'" not in public_test:
        errors.append("public smoke does not include queue-v2.html guest gate")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_lawyer_focus.py" not in workflow:
        errors.append("static workflow does not run lawyer focus regression")

    if errors:
        print("Navigator v2 lawyer focus errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 lawyer focus passed: one priority deal, one action and progressive disclosure checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
