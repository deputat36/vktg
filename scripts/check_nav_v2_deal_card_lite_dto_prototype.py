from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config/nav-v2-deal-card-lite-dto-contract.json"
PROTOTYPE = ROOT / "supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql"
CURRENT = ROOT / "supabase/migrations/20260625120500_navigator_deal_card_lite_service_role_bypass.sql"
DOC = ROOT / "docs/NAV_V2_DEAL_CARD_LITE_DTO_PROTOTYPE_2026-07-16.md"
CONSUMERS = {
    "task_action_guard": ROOT / "assets/js/nav-v2/task-action-guard-v2.js",
    "document_action_guard": ROOT / "assets/js/nav-v2/document-action-guard-v2.js",
    "safe_card": ROOT / "assets/js/nav-v2/deal-card-safe-v2.js",
    "timeout_recovery": ROOT / "assets/js/nav-v2/deal-card-timeout-recovery-v2.js",
    "diagnostic_card": ROOT / "assets/js/nav-v2/deal-card-check-v2.js",
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


def keys(text: str) -> set[str]:
    return set(re.findall(r"'([a-z][a-z0-9_]*)'\s*,", text, flags=re.I))


def main() -> int:
    errors: list[str] = []
    for path in (CONTRACT, PROTOTYPE, CURRENT, DOC, *CONSUMERS.values()):
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
    if "authenticated regression" not in str(contract.get("production_gate", "")):
        errors.append("authenticated regression gate is missing")

    require(sql, (
        "REPOSITORY-ONLY PROTOTYPE",
        "create or replace function public.nav_v2_get_deal_card_lite(p_deal_id uuid)",
        "nav_v2_private.nav_v2_can_view_deal(p_deal_id, v_uid)",
        "nav_v2_private.nav_v2_lite_reference",
        "nav_v2_private.nav_v2_lite_mask_address",
        "public.nav_v2_can_change_task_status(t.id, v_uid)",
        "public.nav_v2_can_change_document_status(d.id, null, v_uid)",
        "public.nav_v2_can_change_document_status(d.id, 'received', v_uid)",
        "public.nav_v2_can_change_document_status(d.id, 'checked', v_uid)",
        "public.nav_v2_can_change_document_status(d.id, 'problem', v_uid)",
        "'comments', jsonb_build_array()",
        "'dto_version', 1",
        "Existing EXECUTE grants, ownership and public signature are intentionally not changed",
    ), PROTOTYPE.name, errors)

    forbidden_tokens = set(contract.get("forbidden_deal_keys") or [])
    forbidden_tokens.update(("to_jsonb(", "select d.*", "select * into v_deal", "grant execute", "revoke all", "drop function"))
    for token in forbidden_tokens:
        if str(token).lower() in lowered:
            errors.append(f"prototype contains forbidden token {token!r}")

    blocks = {
        "deal_allowed_keys": sql_block(sql, "select jsonb_build_object(\n    'id', d.id", "into v_deal"),
        "document_allowed_keys": sql_block(sql, "select coalesce(jsonb_agg(jsonb_build_object(\n    'id', d.id", "into v_documents"),
        "task_allowed_keys": sql_block(sql, "select coalesce(jsonb_agg(jsonb_build_object(\n    'id', t.id", "into v_tasks"),
        "risk_allowed_keys": sql_block(sql, "select coalesce(jsonb_agg(jsonb_build_object(\n    'id', r.id", "into v_risks"),
        "top_level_keys": sql_block(sql, "return jsonb_build_object(", "end;\n$$;"),
    }
    for name, text in blocks.items():
        if not text:
            errors.append(f"could not locate {name} SQL block")
            continue
        expected = set(contract.get(name) or [])
        actual = keys(text)
        if expected != actual:
            errors.append(f"{name}: expected={sorted(expected)} actual={sorted(actual)}")

    current = CURRENT.read_text(encoding="utf-8")
    require(current, (
        "select to_jsonb(d) into v_deal",
        "grant execute on function public.nav_v2_get_deal_card_lite(uuid) to authenticated, service_role;",
    ), CURRENT.name, errors)
    if PROTOTYPE.parent.name != "prototypes" or "migrations" in PROTOTYPE.parts:
        errors.append("prototype must remain outside migrations")

    consumer_requirements = contract.get("consumer_requirements") or {}
    for name, path in CONSUMERS.items():
        text = path.read_text(encoding="utf-8")
        for requirement in consumer_requirements.get(name, []):
            field = requirement.split(".")[-1]
            if field not in text:
                errors.append(f"{path.name}: consumer field {field!r} is not observed")

    doc = DOC.read_text(encoding="utf-8")
    require(doc, (
        "repository-only",
        "nav_v2_get_deal_card_lite",
        "to_jsonb(d)",
        "Permission facts",
        "Комментарии",
        "authenticated-smoke",
        "Rollback",
        "без production deploy",
    ), DOC.name, errors)

    if errors:
        print("Navigator v2 deal-card-lite DTO prototype errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 deal-card-lite DTO prototype passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
