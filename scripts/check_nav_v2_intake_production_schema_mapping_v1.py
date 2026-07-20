#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-intake-production-schema-mapping-v1.json"
SQL = ROOT / "supabase/prototypes/nav_v2_intake_production_schema_mapping_v1.sql"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    sql = SQL.read_text(encoding="utf-8")

    require(config["status"] == "repository_only_rehearsal", "contract must stay repository-only")
    require(config["production_applied"] is False, "production_applied must stay false")
    require(config["production_ready"] is False, "production readiness must stay false")
    require(config["supported_rules_count"] == 13, "supported rule count changed")
    require(config["unsupported_rules_count"] == 12, "unsupported rule count changed")
    require(config["document_side_mapping"] == {
        "seller": "seller", "buyer": "buyer", "object": "both", "deal": "both"
    }, "document side mapping changed")
    require("privacy_quality_task_collision" in config["blocking_findings"], "quality-task blocker missing")

    required_sql = [
        "nav_v2_map_intake_document_side_v1",
        "nav_v2_map_intake_document_status_v1",
        "nav_v2_map_intake_risk_level_v1",
        "nav_v2_map_intake_task_type_v1",
        "nav_v2_map_intake_task_priority_v1",
        "nav_v2_map_governed_intake_to_production_v1",
        "'production_ready', false",
        "'privacy_quality_task_collision'",
        "'intake_v1:'",
        "'object' then 'both'",
        "'deal' then 'both'",
    ]
    for marker in required_sql:
        require(marker in sql, f"SQL marker missing: {marker}")

    forbidden_sql = [
        "create or replace function public.",
        "insert into public.nav_",
        "update public.nav_",
        "delete from public.nav_",
        "service_role key",
        "ofewxuqfjhamgerwzull",
    ]
    lower_sql = sql.lower()
    for marker in forbidden_sql:
        require(marker.lower() not in lower_sql, f"forbidden production marker: {marker}")

    migration_names = [path.name for path in MIGRATIONS.glob("*intake*production*schema*mapping*")]
    require(not migration_names, f"mapping leaked into migrations: {migration_names}")
    print("Navigator v2 intake production schema mapping source contract passed")


if __name__ == "__main__":
    main()
