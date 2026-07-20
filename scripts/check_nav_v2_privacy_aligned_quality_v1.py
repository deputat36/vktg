#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-privacy-aligned-quality-completeness-v1.json"
SQL = ROOT / "supabase/prototypes/nav_v2_privacy_aligned_quality_completeness_v1.sql"
AUTHOR_SQL = ROOT / "supabase/prototypes/nav_v2_privacy_aligned_quality_task_author_v1.sql"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    sql = SQL.read_text(encoding="utf-8")
    author_sql = AUTHOR_SQL.read_text(encoding="utf-8")
    lower_sql = sql.lower()

    require(config["status"] == "repository_only_rehearsal", "contract escaped repository-only status")
    require(config["production_applied"] is False, "production_applied must remain false")
    require(config["production_ready"] is False, "production_ready must remain false")
    require(config["no_mass_backfill"] is True, "no-mass-backfill gate is missing")
    require("names or phones" in config["quality_principle"], "privacy quality principle changed")
    require(len(config["managed_sources"]) == 9, "managed source inventory changed")
    require(len(config["obsolete_sources_closed_only_when_deal_is_touched"]) == 4, "legacy source inventory changed")

    for source in config["managed_sources"] + config["obsolete_sources_closed_only_when_deal_is_touched"]:
        require(source in sql, f"SQL source missing: {source}")

    required_markers = [
        "nav_v2_quality_sync_task_v1",
        "quality_contract_version",
        "objectNotSelectedReason",
        "dateUnknown",
        "requested_decision",
        "expected_result",
        "one_spn_both",
        "partner_agency",
        "task_type",
        "sla_days",
        "after insert or update of",
    ]
    for marker in required_markers:
        require(marker in sql, f"required SQL marker missing: {marker}")

    forbidden_field_refs = [
        "d.seller_name",
        "d.buyer_name",
        "d.seller_phone",
        "d.buyer_phone",
    ]
    for marker in forbidden_field_refs:
        require(marker not in lower_sql, f"privacy-forbidden quality dependency returned: {marker}")

    trigger_tail = lower_sql.split("create trigger nav_deals_v2_quality_tasks_aiu", 1)[1]
    require("seller_name" not in trigger_tail and "buyer_name" not in trigger_tail, "trigger still watches client names")
    require("seller_phone" not in trigger_tail and "buyer_phone" not in trigger_tail, "trigger watches client phones")

    forbidden_backfill = [
        "select public.nav_v2_sync_deal_quality_tasks(id)",
        "from public.nav_deals_v2;",
        "update public.nav_deal_tasks_v2\nset status = 'done'\nwhere source",
    ]
    for marker in forbidden_backfill:
        require(marker not in lower_sql, f"prototype contains mass-backfill marker: {marker}")

    require("select created_by into v_created_by" in author_sql, "task author is not resolved from the deal")
    require("v_created_by, p_task_type" in author_sql, "task insert does not preserve deal creator")
    require("p_assigned_to, p_task_type" not in author_sql, "task author still aliases assignment")

    leaked = [path.name for path in MIGRATIONS.glob("*privacy*quality*")]
    require(not leaked, f"quality prototype leaked into migrations: {leaked}")

    print("Navigator v2 privacy-aligned quality source contract passed")


if __name__ == "__main__":
    main()
