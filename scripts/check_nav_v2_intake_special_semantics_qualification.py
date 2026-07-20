#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-intake-special-semantics-qualification.json"
SQL = ROOT / "supabase/prototypes/nav_v2_intake_special_semantics_qualification.sql"
WAVE2 = ROOT / "config/nav-v2-intake-semantics-wave2-integration-v1.json"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    wave2 = json.loads(WAVE2.read_text(encoding="utf-8"))
    sql = SQL.read_text(encoding="utf-8")
    lower = sql.lower()
    rule_ids = ["legal_problem", "partner_agency", "flat_ground", "house_land"]

    require(config["status"] == "repository_only_qualification", "special semantics escaped qualification status")
    require(config["production_applied"] is False, "production_applied must remain false")
    require(config["production_ready"] is False, "production_ready must remain false")
    require(config["changes_supported_inventory"] is False, "qualification claims support promotion")
    require(config["base_effective_supported_count"] == 21, "effective supported baseline changed")
    require(config["base_effective_unsupported_count"] == 4, "effective unsupported baseline changed")
    require([rule["id"] for rule in config["candidate_rules"]] == rule_ids, "special rule inventory changed")
    require(wave2["effective_unsupported_rules"] == rule_ids, "special rules differ from wave2 fail-closed inventory")

    trigger_contract = {
        "legal_problem": ("stage", "legal_problem"),
        "partner_agency": ("representation", "partner_agency"),
        "flat_ground": ("object_type", "flat_ground"),
        "house_land": ("object_type", "house_land"),
    }
    for rule in config["candidate_rules"]:
        require(rule["owner"] == "lawyer", f"{rule['id']} escaped lawyer ownership")
        require((rule["trigger_kind"], rule["trigger_value"]) == trigger_contract[rule["id"]], f"{rule['id']} trigger changed")
        for marker in [rule["id"], rule["trigger_kind"], rule["trigger_value"], rule["risk_level"], rule["lawyer_request_type"], *rule["documents"]]:
            require(marker in sql, f"special SQL spec missing catalog marker: {marker}")

    require(config["candidate_rules"][0]["documents"] == [], "legal_problem must remain no-document")
    for marker in [
        "nav_v2_intake_special_semantics_spec_v1",
        "nav_v2_qualify_intake_special_semantics_v1",
        "trigger_contract_mismatch",
        "risk_flag_contract_mismatch",
        "lawyer_task_contract_mismatch",
        "unexpected_rule_document",
        "document_contract_mismatch:",
        "lawyer_owner_unresolved",
        "lawyer_handoff_not_ready",
        "broker_scope_expansion",
        "structured_legal_decision",
        "structured_document_statuses",
        "'changes_supported_inventory',false",
        "'base_effective_supported_count',21",
        "'base_effective_unsupported_inventory',4",
        "'production_ready',false",
        "'writes_performed',false",
    ]:
        require(marker in sql, f"special qualification SQL marker missing: {marker}")

    for marker in ["insert into public.", "update public.", "delete from public.", "truncate public."]:
        require(marker not in lower, f"special qualification contains business DML: {marker}")
    require("to service_role" in lower, "service-only grant is missing")
    require("from public, anon, authenticated" in lower, "public/auth revocation is missing")

    leaked = [path.name for path in MIGRATIONS.glob("*special*semantics*")]
    require(not leaked, f"special qualification leaked into migrations: {leaked}")
    print("Navigator v2 special semantics qualification source contract passed")


if __name__ == "__main__":
    main()
