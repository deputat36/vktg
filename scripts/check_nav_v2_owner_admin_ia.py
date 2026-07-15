from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLE_MENU = ROOT / "assets/js/nav-v2/role-menu-v2.js"
CLEANUP = ROOT / "assets/js/nav-v2/nav-base-menu-cleanup-v2.js"
AUTH_TEST = ROOT / "tests/e2e/authenticated-smoke.spec.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (ROLE_MENU, CLEANUP, AUTH_TEST, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    menu = ROLE_MENU.read_text(encoding="utf-8")
    require(menu, (
        "function makeGroup(title, links, isActive = false, isOpen = false)",
        "ensureMenuGroupStyles();",
        "makeGroup('Работа'",
        "makeGroup('Команда и доступы'",
        "makeGroup('Система'",
        "OWNER_WORK_PAGES",
        "OWNER_TEAM_PAGES",
        "OWNER_SYSTEM_PAGES",
        "nav-v2-menu-group-links",
        "data-active=\"${isActive ? 'true' : 'false'}\"",
        "aria-current=\"page\"",
    ), ROLE_MENU.name, errors)
    group_count = menu.count("makeGroup('")
    if group_count != 3:
        errors.append(f"owner/admin menu must contain exactly three purpose groups, got {group_count}")
    for label in ("Рабочий стол", "Новая сделка", "Сделки", "Контроль сделок", "Кабинет юриста", "Команда", "Доступы", "Аудит доступов", "Проверка системы", "Диагностика"):
        if label not in menu:
            errors.append(f"owner/admin grouped menu lost label {label!r}")

    cleanup = CLEANUP.read_text(encoding="utf-8")
    require(cleanup, (
        "function canKeepTechnicalLinks()",
        "['owner', 'admin'].includes",
        "if (!canKeepTechnicalLinks())",
        "function canSeeUxMetrics()",
        "['owner', 'admin', 'manager'].includes",
        "./ux-metrics-v2.html",
        "attributeFilter: ['data-nav-role']",
    ), CLEANUP.name, errors)
    if "querySelectorAll('.nav-v2-menu a[href*=\"nav-system-check-v2.html\"]" not in cleanup:
        errors.append("base menu cleanup must still remove technical links for non-owner/admin roles")

    auth_test = AUTH_TEST.read_text(encoding="utf-8")
    for label in ("Команда", "Доступы", "Аудит доступов", "Проверка системы", "Диагностика"):
        if label not in auth_test:
            errors.append(f"authenticated contract lost owner/admin label {label!r}")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python3 scripts/check_nav_v2_owner_admin_ia.py" not in workflow:
        errors.append("static workflow does not run owner/admin IA regression")

    if errors:
        print("Navigator v2 owner/admin IA errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 owner/admin IA passed: work, team/access, system and privacy-safe metrics remain role-safe")
    return 0


if __name__ == "__main__":
    sys.exit(main())
