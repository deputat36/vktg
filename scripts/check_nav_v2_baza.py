from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []

JSON_PATH = ROOT / "assets/data/nav-v2/baza-hints.json"
HELPER_PATH = ROOT / "assets/js/nav-v2/deal-card-baza-hints-v2.js"
LIFECYCLE_PATH = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
PAGE_PATH = ROOT / "deal-card-v2.html"

REQUIRED_FIELDS = {
    "id", "title", "role", "reason", "body",
    "material_url", "priority", "is_active", "signals",
}
ALLOWED_ROLES = {"spn", "lawyer", "broker", "manager", "owner", "admin", "all"}
ALLOWED_PRIORITIES = {"low", "normal", "high"}
FORBIDDEN_KEYS = {
    "full_name", "fio", "phone", "address", "passport", "passport_data",
    "bank_details", "contract_number", "personal_comment", "employee_comment",
}


def check_files() -> None:
    for path in (JSON_PATH, HELPER_PATH, LIFECYCLE_PATH, PAGE_PATH):
        if not path.exists():
            ERRORS.append(f"Missing required BAZA file: {path.relative_to(ROOT)}")


def check_json() -> None:
    if not JSON_PATH.exists():
        return
    try:
        hints = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        ERRORS.append(f"Invalid BAZA hints JSON: {exc}")
        return

    if not isinstance(hints, list) or not hints:
        ERRORS.append("BAZA hints JSON must be a non-empty list")
        return

    seen_ids: set[str] = set()
    for index, hint in enumerate(hints, start=1):
        label = f"BAZA hint #{index}"
        if not isinstance(hint, dict):
            ERRORS.append(f"{label}: item must be an object")
            continue

        missing = sorted(REQUIRED_FIELDS - set(hint))
        if missing:
            ERRORS.append(f"{label}: missing fields {missing}")

        forbidden = sorted(FORBIDDEN_KEYS & set(hint))
        if forbidden:
            ERRORS.append(f"{label}: forbidden keys {forbidden}")

        hint_id = hint.get("id")
        if not isinstance(hint_id, str) or not hint_id.strip():
            ERRORS.append(f"{label}: id must be a non-empty string")
        elif hint_id in seen_ids:
            ERRORS.append(f"{label}: duplicate id {hint_id!r}")
        else:
            seen_ids.add(hint_id)

        if hint.get("role") not in ALLOWED_ROLES:
            ERRORS.append(f"{label}: unsupported role {hint.get('role')!r}")
        if hint.get("priority") not in ALLOWED_PRIORITIES:
            ERRORS.append(f"{label}: unsupported priority {hint.get('priority')!r}")
        if not isinstance(hint.get("is_active"), bool):
            ERRORS.append(f"{label}: is_active must be boolean")

        signals = hint.get("signals")
        valid_signals = isinstance(signals, list) and bool(signals) and all(
            isinstance(item, str) and bool(item.strip()) for item in signals
        )
        if not valid_signals:
            ERRORS.append(f"{label}: signals must be a non-empty string list")


def check_helper() -> None:
    if not HELPER_PATH.exists():
        return
    text = HELPER_PATH.read_text(encoding="utf-8")
    for marker in (
        "assets/data/nav-v2/baza-hints.json",
        "Подсказки по сделке",
        "slice(0, 5)",
        "export async function applyDealCardBazaHints(card, profile)",
    ):
        if marker not in text:
            ERRORS.append(f"BAZA helper missing marker {marker!r}")

    forbidden = (
        "rpc(",
        "getCachedUser",
        "new MutationObserver",
        "nav_v2_get_my_profile",
        "nav_v2_get_deal_card",
    )
    for marker in forbidden:
        if marker in text:
            ERRORS.append(f"BAZA helper must use supplied lifecycle data; forbidden marker: {marker}")

    rpc_calls = set(re.findall(r"rpc\('([^']+)'", text))
    if rpc_calls:
        ERRORS.append(f"BAZA helper must be read-only and RPC-free; found: {sorted(rpc_calls)}")


def check_lifecycle() -> None:
    if not LIFECYCLE_PATH.exists():
        return
    text = LIFECYCLE_PATH.read_text(encoding="utf-8")
    for marker in (
        "import { applyDealCardBazaHints } from './deal-card-baza-hints-v2.js?v=20260711-03';",
        "void applyDealCardBazaHints(cardData, profileData);",
        "queueMicrotask(applyCardEnhancements);",
    ):
        if marker not in text:
            ERRORS.append(f"deal-card lifecycle missing BAZA marker {marker!r}")


def check_page() -> None:
    if not PAGE_PATH.exists():
        return
    page = PAGE_PATH.read_text(encoding="utf-8")
    if '<script type="module" src="./assets/js/nav-v2/deal-card-baza-hints-v2.js' in page:
        ERRORS.append("BAZA helper must not remain a standalone HTML entry module")
    cache_mapping = '"./deal-card-recheck-alert-v2.js?v=20260711-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260711-03"'
    if cache_mapping not in page:
        ERRORS.append("deal-card page must cache-bust the consolidated enhancement hook")


def main() -> int:
    check_files()
    check_json()
    check_helper()
    check_lifecycle()
    check_page()
    if ERRORS:
        print("\n".join(ERRORS))
        return 1
    print("Navigator v2 BAZA checks passed: hints use explicit card data and no duplicate RPC")
    return 0


if __name__ == "__main__":
    sys.exit(main())
