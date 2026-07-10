from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUDGET_PATH = ROOT / "config/nav-v2-module-budget.json"
CSP_RE = re.compile(
    r'<meta\s+http-equiv=["\']Content-Security-Policy["\']\s+content="([^"]+)"\s*/?>',
    re.IGNORECASE,
)
REQUIRED_DIRECTIVES = {
    "default-src": {"'self'"},
    "connect-src": {
        "'self'",
        "https://ofewxuqfjhamgerwzull.supabase.co",
        "wss://ofewxuqfjhamgerwzull.supabase.co",
    },
    "script-src": {"'self'", "'unsafe-inline'"},
    "style-src": {"'self'", "'unsafe-inline'"},
    "img-src": {"'self'", "data:", "blob:", "https:"},
    "font-src": {"'self'", "data:"},
    "object-src": {"'none'"},
    "base-uri": {"'self'"},
    "form-action": {"'self'"},
}


def parse_policy(raw: str) -> dict[str, set[str]]:
    directives: dict[str, set[str]] = {}
    for part in raw.split(";"):
        tokens = part.strip().split()
        if not tokens:
            continue
        directives[tokens[0].lower()] = set(tokens[1:])
    return directives


def main() -> int:
    errors: list[str] = []
    if not BUDGET_PATH.exists():
        print("Missing config/nav-v2-module-budget.json")
        return 1

    config = json.loads(BUDGET_PATH.read_text(encoding="utf-8"))
    pages = sorted((config.get("pages") or {}).keys())

    for page_name in pages:
        page_path = ROOT / page_name
        if not page_path.exists():
            errors.append(f"Missing CSP page: {page_name}")
            continue
        source = page_path.read_text(encoding="utf-8")
        matches = CSP_RE.findall(source)
        if len(matches) != 1:
            errors.append(f"{page_name}: expected exactly one Content-Security-Policy meta tag")
            continue

        directives = parse_policy(matches[0])
        for name, required_values in REQUIRED_DIRECTIVES.items():
            actual = directives.get(name)
            if actual is None:
                errors.append(f"{page_name}: missing CSP directive {name}")
                continue
            missing = required_values - actual
            if missing:
                errors.append(f"{page_name}: {name} missing values {sorted(missing)}")

        for name in ("script-src", "connect-src"):
            if "*" in directives.get(name, set()):
                errors.append(f"{page_name}: wildcard is forbidden in {name}")

        if "upgrade-insecure-requests" not in directives:
            errors.append(f"{page_name}: missing upgrade-insecure-requests")

    if errors:
        print("CSP errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Navigator v2 CSP passed: {len(pages)} pages checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
