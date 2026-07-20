#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-legacy-quality-cleanup-decision-v1.json"
SQL = ROOT / "supabase/prototypes/nav_v2_legacy_quality_cleanup_plan_v1.sql"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    sql = SQL.read_text(encoding="utf-8")
    lower = sql.lower()

    require(config["status"] == "repository_only_decision_package", "status escaped decision package")
    require(config["production_applied"] is False, "production_applied must remain false")
    require(config["production_ready"] is False, "production_ready must remain false")
    require(config["writes_allowed"] is False, "writes_allowed must remain false")
    require(config["selected_option"] is None, "owner option was selected automatically")
    require(config["inventory_snapshot"]["total_open_rows"] == 46, "inventory total changed")
    require(config["inventory_snapshot"]["obsolete_privacy_conflict"] == 40, "privacy-conflict total changed")
    require(len(config["owner_options"]) == 3, "owner option inventory changed")
    require(config["owner_options"][0]["id"] == "gradual_on_touch", "safest option is no longer first")

    required = [
        "nav_v2_classify_legacy_quality_task_v1",
        "nav_v2_plan_legacy_quality_cleanup_v1",
        "'writes_performed', false",
        "'production_ready', false",
        "'selected_option', null",
        "obsolete_privacy_conflict",
        "replace_object_context",
        "replace_representation",
        "manual_review",
        "owner_options",
        "mandatory_stops",
    ]
    for marker in required:
        require(marker in sql, f"missing SQL marker: {marker}")

    forbidden_dml = ["insert into public.", "update public.", "delete from public.", "truncate public."]
    for marker in forbidden_dml:
        require(marker not in lower, f"planner contains business DML: {marker}")

    # Legacy source identifiers contain seller_name/buyer_name by design. Block only
    # actual column/JSON-key dependencies, not the source strings being classified.
    forbidden_field_patterns = [
        r"\b(?:d|t)\.(?:seller_name|buyer_name|seller_phone|buyer_phone|email|passport|snils|inn)\b",
        r"->>\s*'(?:seller_name|buyer_name|seller_phone|buyer_phone|email|passport|snils|inn)'",
        r"#>>\s*'\{[^}]*?(?:seller_name|buyer_name|seller_phone|buyer_phone|email|passport|snils|inn)[^}]*\}'",
    ]
    for pattern in forbidden_field_patterns:
        require(re.search(pattern, lower) is None, f"planner depends on PII field pattern: {pattern}")

    require("assigned_to" not in lower and "created_by" not in lower, "planner exposes employee assignment data")
    require("score" not in lower and "performance" not in lower, "planner contains employee evaluation semantics")
    require("grant execute" in lower and "to service_role" in lower, "service-only execute contract missing")

    leaked = [path.name for path in MIGRATIONS.glob("*legacy*quality*cleanup*")]
    require(not leaked, f"cleanup planner leaked into migrations: {leaked}")

    print("Navigator v2 legacy quality cleanup decision source contract passed")


if __name__ == "__main__":
    main()
