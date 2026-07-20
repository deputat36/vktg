#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-intake-semantics-wave1-qualification.json"
SQL = ROOT / "supabase/prototypes/nav_v2_intake_semantics_wave1_qualification.sql"
MAPPER = ROOT / "supabase/prototypes/nav_v2_intake_production_schema_mapping_v1.sql"
INTEGRATION = ROOT / "supabase/prototypes/nav_v2_intake_save_integration_v1.sql"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    sql = SQL.read_text(encoding="utf-8")
    mapper = MAPPER.read_text(encoding="utf-8")
    integration = INTEGRATION.read_text(encoding="utf-8")
    lower = sql.lower()

    require(config["status"] == "repository_only_qualification", "qualification escaped repository-only status")
    require(config["production_applied"] is False, "production_applied must remain false")
    require(config["production_ready"] is False, "production_ready must remain false")
    require(config["changes_supported_inventory"] is False, "qualification claims support promotion")
    require([rule["id"] for rule in config["candidate_rules"]] == ["spouse","seller_absent","encumbrance","inheritance"], "wave1 rule order changed")
    require(len(config["qualification_requirements"]) == 10, "qualification requirement inventory changed")

    for rule in config["candidate_rules"]:
        for marker in [
            rule["id"], rule["owner"], rule["risk_level"], rule["lawyer_request_type"],
            rule["expected_decision"], *rule["documents"]
        ]:
            require(marker in sql, f"SQL spec missing catalog marker: {marker}")

    required_sql = [
        "nav_v2_intake_semantics_wave1_spec_v1",
        "nav_v2_qualify_intake_semantics_wave1_v1",
        "fact_evidence_source_missing",
        "risk_flag_contract_mismatch",
        "lawyer_task_contract_mismatch",
        "document_contract_mismatch:",
        "lawyer_owner_unresolved",
        "lawyer_handoff_not_ready",
        "broker_scope_expansion",
        "'changes_supported_inventory',false",
        "'base_unsupported_inventory',12",
        "'production_ready',false",
        "'writes_performed',false",
    ]
    for marker in required_sql:
        require(marker in sql, f"qualification SQL marker missing: {marker}")

    for marker in ["insert into public.", "update public.", "delete from public.", "truncate public."]:
        require(marker not in lower, f"qualification contains business DML: {marker}")

    require("to service_role" in lower, "service-only grant is missing")
    require("from public, anon, authenticated" in lower, "public/auth revocation is missing")
    require("spouse" not in mapper.split("v_supported text[] := array[",1)[1].split("];",1)[0], "production mapper was silently expanded")
    require("spouse" not in integration.split("where rule_id <> all(array[",1)[1].split("]);",1)[0], "legacy integration support list was silently expanded")

    leaked = [path.name for path in MIGRATIONS.glob("*semantics*wave1*")]
    require(not leaked, f"wave1 qualification leaked into migrations: {leaked}")

    print("Navigator v2 intake semantics wave1 qualification source contract passed")


if __name__ == "__main__":
    main()
