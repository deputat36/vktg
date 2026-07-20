#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-intake-special-semantics-integration-v1.json"
PREVIEW_SQL = ROOT / "supabase/prototypes/nav_v2_intake_special_semantics_integration_preview_v1.sql"
MAPPING_SQL = ROOT / "supabase/prototypes/nav_v2_intake_special_semantics_mapping_v1.sql"
WAVE2 = ROOT / "config/nav-v2-intake-semantics-wave2-integration-v1.json"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    wave2 = json.loads(WAVE2.read_text(encoding="utf-8"))
    preview = PREVIEW_SQL.read_text(encoding="utf-8")
    mapping = MAPPING_SQL.read_text(encoding="utf-8")
    combined = (preview + "\n" + mapping).lower()
    special = ["legal_problem", "partner_agency", "flat_ground", "house_land"]

    require(config["status"] == "repository_only_integration_rehearsal", "final integration escaped repository-only status")
    require(config["production_applied"] is False, "production_applied must remain false")
    require(config["production_ready"] is False, "production_ready must remain false")
    require(config["base_effective_supported_count"] == 21, "wave2 supported baseline changed")
    require(config["base_effective_unsupported_count"] == 4, "wave2 unsupported baseline changed")
    require(config["effective_supported_count"] == 25, "effective support differs from 25")
    require(config["effective_unsupported_count"] == 0, "effective unsupported differs from zero")
    require(len(config["effective_supported_rules"]) == 25, "effective supported inventory length changed")
    require(wave2["effective_supported_rules"] == config["effective_supported_rules"][:21], "wave2 21-rule inventory drifted")
    require(wave2["effective_unsupported_rules"] == special, "special inventory differs from wave2 unsupported rules")
    require(config["qualified_special_rules"] == special, "qualified special inventory changed")

    for marker in [
        "nav_v2_prepare_intake_legacy_save_special_v1",
        "nav_v2_build_governed_intake_write_plan_special_v1",
        "nav_v2_map_governed_intake_to_production_special_v1",
        "special_effective_rule_projection_incomplete",
        "special_qualification",
        "Special rule is not backed by qualification evidence",
        "Special no-document rule contains document row",
        "Special risk row differs from qualified catalog contract",
        "Special lawyer task differs from qualified catalog contract",
        "Special document row differs from qualified catalog contract",
        "'effective_supported_count',25",
        "'effective_unsupported_count',0",
        "'production_ready',false",
        "'writes_performed',false",
        "'task_type','legal_blocker'",
        "'source','intake_v1:'",
    ]:
        require(marker in preview + mapping, f"final integration marker missing: {marker}")

    for rule in special:
        require(f"'{rule}'" in preview + mapping, f"special rule missing from final integration: {rule}")
    for marker in ["insert into public.", "update public.", "delete from public.", "truncate public."]:
        require(marker not in combined, f"final integration contains business DML: {marker}")
    require("to service_role" in combined, "service-role grants missing")
    require("from public, anon, authenticated" in combined, "public/auth revocations missing")
    require("production_execute',false" in preview, "production execute gate missing")

    leaked = [path.name for path in MIGRATIONS.glob("*special*semantics*integration*")]
    require(not leaked, f"final integration leaked into migrations: {leaked}")
    print("Navigator v2 final special semantics integration source contract passed")


if __name__ == "__main__":
    main()
