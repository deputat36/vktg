from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-deals-list-dto-contract.json"
PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_get_deals_list_explicit_dto.sql"
CURRENT = ROOT / "supabase/migrations/20260625095500_navigator_deals_list_add_lawyer_broker_names.sql"
DOC = ROOT / "docs/NAV_V2_DEALS_LIST_DTO_PROTOTYPE_2026-07-16.md"
SPN_PAGE = ROOT / "spn-v2.html"
DEALS_PAGE = ROOT / "deals-v2.html"
CONSUMERS = {
    "dashboard_v2": [ROOT / "assets/js/nav-v2/dashboard-v2.js"],
    "deals_v2": [
        ROOT / "assets/js/nav-v2/deals-v2.js",
        ROOT / "assets/js/nav-v2/deals-work-modes-v2.js",
        ROOT / "assets/js/nav-v2/dashboard-priority-v2.js",
    ],
    "spn_priority_hints": [ROOT / "assets/js/nav-v2/deals-spn-priority-hints-v2.js"],
    "spn_save_recovery": [ROOT / "assets/js/nav-v2/spn-save-idempotency-guard-v2.js"],
    "responsibility_and_handoff": [
        ROOT / "assets/js/nav-v2/deals-responsible-spn-v2.js",
        ROOT / "assets/js/nav-v2/deals-handoff-summary-v2.js",
        ROOT / "assets/js/nav-v2/deals-spn-recency-v2.js",
    ],
}


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def sql_block(text: str, start: str, end: str) -> str:
    first = text.find(start)
    if first < 0:
        return ""
    last = text.find(end, first + len(start))
    return text[first:] if last < 0 else text[first:last]


def json_keys(text: str) -> set[str]:
    return set(re.findall(r"(?m)^\s{4}'([a-z][a-z0-9_]*)'\s*,", text, flags=re.I))


def requirement_present(requirement: str, paths: list[Path]) -> bool:
    field = requirement.split(".")[-1]
    return any(field in path.read_text(encoding="utf-8") for path in paths)


def main() -> int:
    errors: list[str] = []
    required_paths = [CONTRACT, PROTOTYPE, CURRENT, DOC, SPN_PAGE, DEALS_PAGE]
    for paths in CONSUMERS.values():
        required_paths.extend(paths)
    for path in required_paths:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    sql = PROTOTYPE.read_text(encoding="utf-8")
    lowered = sql.lower()

    if contract.get("status") != "repository_only_prototype":
        errors.append("prototype status drifted")
    if contract.get("production_applied") is not False:
        errors.append("prototype must remain non-production")
    if contract.get("prototype_path") != PROTOTYPE.relative_to(ROOT).as_posix():
        errors.append("prototype path drifted")
    if "Authenticated" not in str(contract.get("production_gate", "")):
        errors.append("authenticated regression gate is missing")

    require(sql, (
        "REPOSITORY-ONLY PROTOTYPE",
        "create or replace function public.nav_v2_get_deals_list(p_limit integer default 50)",
        "v_role in ('admin', 'owner')",
        "or (v_role = 'lawyer' and d.lawyer_needed is true)",
        "or (v_role = 'broker' and d.broker_needed is true)",
        "nav_v2_private.nav_v2_list_reference",
        "nav_v2_private.nav_v2_list_mask_address",
        "nav_v2_private.nav_v2_list_next_action_label",
        "'created_by_current_user', d.created_by = v_uid",
        "'has_recorded_next_action', nullif(trim(d.next_action), '') is not null",
        "'dto_version', 1",
        "Existing EXECUTE grants, ownership, public signature and production function are intentionally not changed",
    ), PROTOTYPE.name, errors)

    for token in contract.get("forbidden_serialization_patterns") or []:
        if str(token).lower() in lowered:
            errors.append(f"prototype contains forbidden serialization pattern {token!r}")

    if "'title', d.title" in sql:
        errors.append("prototype returns legacy title")
    if "'address', d.address" in sql:
        errors.append("prototype returns unmasked address")
    if "'next_action', d.next_action" in sql:
        errors.append("prototype returns raw next_action")

    blocks = {
        "profile_allowed_keys": sql_block(
            sql,
            "select jsonb_build_object(\n    'id', p.id",
            "), p.role\n  into v_profile",
        ),
        "item_allowed_keys": sql_block(
            sql,
            "select coalesce(jsonb_agg(jsonb_build_object(\n    'id', d.id",
            ") order by d.updated_at desc), '[]'::jsonb)\n  into v_items",
        ),
        "top_level_keys": sql_block(sql, "return jsonb_build_object(", "end;\n$$;"),
    }
    for name, text in blocks.items():
        if not text:
            errors.append(f"could not locate {name} SQL block")
            continue
        expected = set(contract.get(name) or [])
        actual = json_keys(text)
        if expected != actual:
            errors.append(f"{name}: expected={sorted(expected)} actual={sorted(actual)}")

    actual_item_keys = json_keys(blocks.get("item_allowed_keys", ""))
    forbidden_item_keys = set(contract.get("forbidden_item_keys") or [])
    leaked = sorted(actual_item_keys & forbidden_item_keys)
    if leaked:
        errors.append(f"forbidden item keys returned: {leaked}")

    if PROTOTYPE.parent.name != "prototypes" or "migrations" in PROTOTYPE.parts:
        errors.append("prototype must remain outside migrations")

    current = CURRENT.read_text(encoding="utf-8")
    require(current, (
        "pg_get_functiondef('public.nav_v2_get_deals_list(integer)'::regprocedure)",
        "'lawyer', lp.full_name",
        "'broker', brp.full_name",
    ), CURRENT.name, errors)

    requirements = contract.get("consumer_requirements") or {}
    for consumer, fields in requirements.items():
        paths = CONSUMERS.get(consumer)
        if not paths:
            errors.append(f"unknown consumer group {consumer!r}")
            continue
        for requirement in fields:
            if not requirement_present(requirement, paths):
                names = ", ".join(path.name for path in paths)
                errors.append(f"{consumer} ({names}): field {requirement!r} is not observed")

    recovery = (ROOT / "assets/js/nav-v2/spn-save-idempotency-guard-v2.js").read_text(encoding="utf-8")
    require(recovery, (
        "created_by_current_user",
        "preparation_mode",
        "matchesCreatedDeal",
        "Новый минимальный DTO",
    ), "spn-save-idempotency-guard-v2.js", errors)

    handoff = (ROOT / "assets/js/nav-v2/deals-handoff-summary-v2.js").read_text(encoding="utf-8")
    for forbidden in ("deal && deal.seller_name", "deal && deal.seller_phone", "deal && deal.buyer_name", "deal && deal.buyer_phone"):
        if forbidden in handoff:
            errors.append(f"handoff summary still depends on client identifier: {forbidden}")
    require(handoff, (
        "ФИО и телефоны клиентов",
        "Ответственные / юрист",
        "безопасным полям списка",
    ), "deals-handoff-summary-v2.js", errors)

    spn_page = SPN_PAGE.read_text(encoding="utf-8")
    deals_page = DEALS_PAGE.read_text(encoding="utf-8")
    require(spn_page, ("spn-save-idempotency-guard-v2.js?v=20260716-01",), SPN_PAGE.name, errors)
    require(deals_page, (
        "deals-handoff-summary-v2.js?v=20260716-01",
        '"./deals-handoff-summary-v2.js?v=20260625-1035": "./assets/js/nav-v2/deals-handoff-summary-v2.js?v=20260716-01"',
    ), DEALS_PAGE.name, errors)

    doc = DOC.read_text(encoding="utf-8")
    require(doc, (
        "repository-only",
        "nav_v2_get_deals_list",
        "Consumer matrix",
        "created_by_current_user",
        "Маткапитал",
        "authenticated-smoke",
        "Rollback",
        "без production deploy",
    ), DOC.name, errors)

    if errors:
        print("Navigator v2 deals-list DTO prototype errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 deals-list DTO prototype passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
