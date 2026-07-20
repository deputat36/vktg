#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-intake-semantics-wave2-integration-v1.json"
SQL = ROOT / "supabase/prototypes/nav_v2_intake_semantics_wave2_integration_v1.sql"
WAVE1_CONFIG = ROOT / "config/nav-v2-intake-semantics-wave1-integration-v1.json"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    wave1 = json.loads(WAVE1_CONFIG.read_text(encoding="utf-8"))
    sql = SQL.read_text(encoding="utf-8")
    lower = sql.lower()

    require(config["status"] == "repository_only_integration_rehearsal", "wave2 integration escaped repository-only status")
    require(config["production_applied"] is False, "production_applied must remain false")
    require(config["production_ready"] is False, "production_ready must remain false")
    require(config["base_effective_supported_count"] == 17, "wave1 effective support baseline changed")
    require(config["base_effective_unsupported_count"] == 8, "wave1 effective unsupported baseline changed")
    require(config["effective_supported_count"] == 21, "effective support count differs from 21")
    require(config["effective_unsupported_count"] == 4, "effective unsupported count differs from 4")
    require(len(config["effective_supported_rules"]) == 21, "effective supported inventory length changed")
    require(len(config["effective_unsupported_rules"]) == 4, "effective unsupported inventory length changed")
    require(wave1["effective_supported_rules"] == config["effective_supported_rules"][:17], "wave1 17 support inventory drifted")
    require(
        [rule for rule in wave1["effective_unsupported_rules"] if rule in config["qualified_wave2_rules"]]
        == config["qualified_wave2_rules"],
        "qualified wave2 order differs from wave1 unsupported inventory",
    )
    require(
        [rule for rule in wave1["effective_unsupported_rules"] if rule not in config["qualified_wave2_rules"]]
        == config["effective_unsupported_rules"],
        "remaining special inventory differs from wave1 unsupported inventory",
    )

    required_sql = [
        "nav_v2_prepare_intake_legacy_save_wave2_v1",
        "nav_v2_build_governed_intake_write_plan_wave2_v1",
        "nav_v2_map_governed_intake_to_production_wave2_v1",
        "wave2_effective_rule_projection_incomplete",
        "wave2_qualification",
        "effective_supported_count",
        "effective_unsupported_count",
        "Wave2 rule is not backed by qualification evidence",
        "Wave2 risk row differs from qualified catalog contract",
        "Wave2 lawyer task differs from qualified catalog contract",
        "Wave2 document row differs from qualified catalog contract",
        "'production_ready',false",
        "'writes_performed',false",
        "'task_type','legal_blocker'",
        "'source','intake_v1:'",
        "'effective_supported_count',21",
        "'effective_unsupported_count',4",
    ]
    for marker in required_sql:
        require(marker in sql, f"wave2 integration SQL marker missing: {marker}")

    for rule in config["qualified_wave2_rules"]:
        require(rule in sql, f"qualified rule missing from SQL: {rule}")
    for rule in config["effective_unsupported_rules"]:
        require(rule not in config["qualified_wave2_rules"], f"unsupported rule overlaps wave2: {rule}")

    for marker in ["insert into public.", "update public.", "delete from public.", "truncate public."]:
        require(marker not in lower, f"integration overlay contains business DML: {marker}")
    require("to service_role" in lower, "service-role execute grants missing")
    require("from public, anon, authenticated" in lower, "public/auth revocations missing")
    require("production_execute',false" in sql, "production execute gate missing")

    leaked = [path.name for path in MIGRATIONS.glob("*intake*semantics*wave2*integration*")]
    require(not leaked, f"wave2 integration leaked into migrations: {leaked}")

    print("Navigator v2 intake semantics wave2 integration source contract passed")


if __name__ == "__main__":
    main()
