#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-intake-semantics-wave2-qualification.json"
SQL = ROOT / "supabase/prototypes/nav_v2_intake_semantics_wave2_qualification.sql"
MAPPER = ROOT / "supabase/prototypes/nav_v2_intake_production_schema_mapping_v1.sql"
BASE_INTEGRATION = ROOT / "supabase/prototypes/nav_v2_intake_save_integration_v1.sql"
WAVE1_INTEGRATION = ROOT / "supabase/prototypes/nav_v2_intake_semantics_wave1_integration_v1.sql"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    sql = SQL.read_text(encoding="utf-8")
    mapper = MAPPER.read_text(encoding="utf-8")
    base_integration = BASE_INTEGRATION.read_text(encoding="utf-8")
    wave1_integration = WAVE1_INTEGRATION.read_text(encoding="utf-8")
    lower = sql.lower()

    rule_ids = ["bankruptcy_risk", "redevelopment", "after_registration", "certificate"]
    require(config["status"] == "repository_only_qualification", "qualification escaped repository-only status")
    require(config["production_applied"] is False, "production_applied must remain false")
    require(config["production_ready"] is False, "production_ready must remain false")
    require(config["changes_supported_inventory"] is False, "qualification claims support promotion")
    require(config["base_effective_supported_count"] == 17, "effective supported baseline changed")
    require(config["base_effective_unsupported_count"] == 8, "effective unsupported baseline changed")
    require([rule["id"] for rule in config["candidate_rules"]] == rule_ids, "wave2 rule order changed")
    require(len(config["qualification_requirements"]) == 10, "qualification requirement inventory changed")

    for rule in config["candidate_rules"]:
        require(rule["owner"] == "lawyer", f"{rule['id']} escaped lawyer ownership")
        for marker in [
            rule["id"], rule["owner"], rule["risk_level"], rule["lawyer_request_type"],
            rule["expected_decision"], *rule["documents"]
        ]:
            require(marker in sql, f"SQL spec missing catalog marker: {marker}")

    required_sql = [
        "nav_v2_intake_semantics_wave2_spec_v1",
        "nav_v2_qualify_intake_semantics_wave2_v1",
        "fact_evidence_source_missing",
        "risk_flag_contract_mismatch",
        "lawyer_task_contract_mismatch",
        "document_contract_mismatch:",
        "lawyer_owner_unresolved",
        "lawyer_handoff_not_ready",
        "broker_scope_expansion",
        "'changes_supported_inventory',false",
        "'base_effective_supported_count',17",
        "'base_effective_unsupported_inventory',8",
        "'production_ready',false",
        "'writes_performed',false",
    ]
    for marker in required_sql:
        require(marker in sql, f"qualification SQL marker missing: {marker}")

    for marker in ["insert into public.", "update public.", "delete from public.", "truncate public."]:
        require(marker not in lower, f"qualification contains business DML: {marker}")

    require("to service_role" in lower, "service-only grant is missing")
    require("from public, anon, authenticated" in lower, "public/auth revocation is missing")

    base_mapper_supported = mapper.split("v_supported text[] := array[", 1)[1].split("];", 1)[0]
    base_preview_supported = base_integration.split("where rule_id <> all(array[", 1)[1].split("]);", 1)[0]
    wave1_ids = wave1_integration.split("v_wave_ids text[] := array[", 1)[1].split("];", 1)[0]
    for rule_id in rule_ids:
        require(f"'{rule_id}'" not in base_mapper_supported, f"{rule_id} silently entered base mapper support")
        require(f"'{rule_id}'" not in base_preview_supported, f"{rule_id} silently entered base preview support")
        require(f"'{rule_id}'" not in wave1_ids, f"{rule_id} silently entered wave1 effective support")

    leaked = [path.name for path in MIGRATIONS.glob("*semantics*wave2*")]
    require(not leaked, f"wave2 qualification leaked into migrations: {leaked}")

    print("Navigator v2 intake semantics wave2 qualification source contract passed")


if __name__ == "__main__":
    main()
