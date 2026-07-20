#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-intake-semantics-wave1-integration-v1.json"
SQL = ROOT / "supabase/prototypes/nav_v2_intake_semantics_wave1_integration_v1.sql"
BASE_CONFIG = ROOT / "config/nav-v2-intake-save-integration-v1.json"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    base = json.loads(BASE_CONFIG.read_text(encoding="utf-8"))
    sql = SQL.read_text(encoding="utf-8")
    lower = sql.lower()

    require(config["status"] == "repository_only_integration_rehearsal", "wave1 integration escaped repository-only status")
    require(config["production_applied"] is False, "production_applied must remain false")
    require(config["production_ready"] is False, "production_ready must remain false")
    require(config["base_supported_rules"] == 13, "base support count changed")
    require(config["effective_supported_count"] == 17, "effective support count differs from 17")
    require(config["effective_unsupported_count"] == 8, "effective unsupported count differs from 8")
    require(len(config["effective_supported_rules"]) == 17, "effective supported inventory length changed")
    require(len(config["effective_unsupported_rules"]) == 8, "effective unsupported inventory length changed")
    require(base["legacy_rule_projection"]["supported"] == config["effective_supported_rules"][:13], "base 13 support inventory drifted")
    require(base["legacy_rule_projection"]["unsupported"][:4] == config["qualified_wave1_rules"], "qualified wave1 order differs from base unsupported inventory")

    required_sql = [
        "nav_v2_prepare_intake_legacy_save_wave1_v1",
        "nav_v2_build_governed_intake_write_plan_wave1_v1",
        "nav_v2_map_governed_intake_to_production_wave1_v1",
        "effective_rule_projection_incomplete",
        "wave1_qualification",
        "effective_supported_count",
        "effective_unsupported_count",
        "Wave1 rule is not backed by qualification evidence",
        "Wave1 risk row differs from qualified catalog contract",
        "Wave1 lawyer task differs from qualified catalog contract",
        "Wave1 document row differs from qualified catalog contract",
        "'production_ready',false",
        "'writes_performed',false",
        "'task_type','legal_blocker'",
        "'source','intake_v1:'",
    ]
    for marker in required_sql:
        require(marker in sql, f"wave1 integration SQL marker missing: {marker}")

    for rule in config["qualified_wave1_rules"]:
        require(rule in sql, f"qualified rule missing from SQL: {rule}")
    for rule in config["effective_unsupported_rules"]:
        require(rule not in config["qualified_wave1_rules"], f"unsupported rule overlaps wave1: {rule}")

    for marker in ["insert into public.", "update public.", "delete from public.", "truncate public."]:
        require(marker not in lower, f"integration overlay contains business DML: {marker}")
    require("to service_role" in lower, "service-role execute grants missing")
    require("from public, anon, authenticated" in lower, "public/auth revocations missing")
    require("production_execute', false" in sql, "production execute gate missing")

    leaked = [path.name for path in MIGRATIONS.glob("*intake*semantics*wave1*integration*")]
    require(not leaked, f"wave1 integration leaked into migrations: {leaked}")

    print("Navigator v2 intake semantics wave1 integration source contract passed")


if __name__ == "__main__":
    main()
