from pathlib import Path
import re

VERSION = "20260526-5"

ROLE_MENU_TAG = f'<script type="module" src="./assets/js/nav-v2/role-menu-v2.js?v={VERSION}"></script>'
ADMIN_GUARD_TAG = f'<script type="module" src="./assets/js/nav-v2/admin-guard-v2.js?v={VERSION}"></script>'

ROLE_MENU_PAGES = [
    "dashboard-v2.html",
    "spn-v2.html",
    "deals-v2.html",
    "deal-card-v2.html",
    "nav-system-check-v2.html",
    "admin-v2.html",
    "admin-invite-v2.html",
    "nav-access-v2.html",
    "nav-access-audit-v2.html",
]

ADMIN_GUARD_PAGES = [
    "admin-v2.html",
    "admin-invite-v2.html",
    "nav-access-v2.html",
    "nav-access-audit-v2.html",
]

SCRIPT_RE_TEMPLATE = r'\n?\s*<script\s+type=["\']module["\']\s+src=["\']\./assets/js/nav-v2/{name}\.js\?v=[^"\']*["\']>\s*</script>'

def main():
    root = Path.cwd()

    target_dir = root / "assets" / "js" / "nav-v2"
    source_dir = Path(__file__).resolve().parent.parent / "assets" / "js" / "nav-v2"
    target_dir.mkdir(parents=True, exist_ok=True)

    for name in ["role-menu-v2.js", "admin-guard-v2.js"]:
        (target_dir / name).write_text((source_dir / name).read_text(encoding="utf-8"), encoding="utf-8")
        print(f"OK: обновлен {target_dir / name}")

    changed = []
    for page in ROLE_MENU_PAGES:
        path = root / page
        if not path.exists():
            print(f"SKIP: нет файла {page}")
            continue

        original = path.read_text(encoding="utf-8")
        updated = original

        updated = re.sub(SCRIPT_RE_TEMPLATE.format(name="role-menu-v2"), "", updated, flags=re.I)
        updated = re.sub(SCRIPT_RE_TEMPLATE.format(name="admin-guard-v2"), "", updated, flags=re.I)

        tags = []
        if page in ADMIN_GUARD_PAGES:
            tags.append(ADMIN_GUARD_TAG)
        tags.append(ROLE_MENU_TAG)

        if "</body>" not in updated:
            print(f"ERROR: не найден </body> в {page}")
            continue

        insert = "\n  " + "\n  ".join(tags)
        updated = updated.replace("</body>", insert + "\n</body>", 1)

        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed.append(page)
            print(f"OK: обновлен {page}")
        else:
            print(f"NOCHANGE: {page}")

    print("\nГотово.")
    print("Измененные HTML:", ", ".join(changed) if changed else "нет")

if __name__ == "__main__":
    main()
