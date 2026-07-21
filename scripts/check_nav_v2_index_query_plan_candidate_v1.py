#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-index-query-plan-candidate-v1.json"
PERFORMANCE = ROOT / "config/nav-v2-performance-advisor-attestation-v1.json"
SQL = ROOT / "tests/sql/nav_v2_index_query_plan_harness_v1.sql"
WORKFLOW = ROOT / ".github/workflows/nav-v2-index-query-plan-harness-v1.yml"
DOC = ROOT / "docs/NAV_V2_INDEX_QUERY_PLAN_CANDIDATE_V1_2026-07-21.md"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def uncommented_sql(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.strip().startswith("--"))


def main() -> None:
    for path in (CONFIG, PERFORMANCE, SQL, WORKFLOW, DOC):
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    performance = json.loads(PERFORMANCE.read_text(encoding="utf-8"))
    sql_text = SQL.read_text(encoding="utf-8")
    sql = uncommented_sql(sql_text)
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "unexpected index plan candidate schema")
    require(
        config["status"] == "repository_only_index_query_plan_candidate_not_ddl_approval",
        "index plan candidate escaped repository-only boundary",
    )
    require(config["project_ref"] == "ofewxuqfjhamgerwzull", "project ref drifted")
    require(config["captured_at"] == "2026-07-21T13:53:02.40865+00:00", "capture timestamp drifted")
    require(config["source_main_sha"] == "e5679000678fa6081a7a84fcf094f73b085970f1", "source main drifted")
    for key in (
        "production_applied",
        "production_ddl_authorized",
        "index_drop_authorized",
        "index_create_authorized",
        "rls_change_authorized",
        "cloud_execution_allowed",
    ):
        require(config[key] is False, f"authorization flag must remain false: {key}")

    source = config["source_evidence"]
    require(source["performance_attestation"] == PERFORMANCE.relative_to(ROOT).as_posix(), "performance source path drifted")
    require(source["synthetic_harness"] == SQL.relative_to(ROOT).as_posix(), "harness path drifted")
    require(source["live_capture_mode"] == "aggregate_and_function_signature_only_read_only_transaction", "live capture mode drifted")
    require(source["postgres_harness_major"] == 17, "harness PostgreSQL major drifted")

    inventory = config["live_consumer_inventory"]
    roles = inventory["role_consumers"]
    answers = inventory["answers_consumers"]
    require(inventory["role_consumer_count"] == 24 == len(roles), "role consumer count drifted")
    require(inventory["answers_consumer_count"] == 2 == len(answers), "answers consumer count drifted")
    require(roles == sorted(roles), "role consumers must be sorted")
    require(answers == sorted(answers), "answers consumers must be sorted")
    require(len(roles) == len(set(roles)), "role consumers contain duplicates")
    require(len(answers) == len(set(answers)), "answers consumers contain duplicates")
    for marker in (
        "nav_v2_get_access_audit()",
        "nav_v2_get_operational_readiness_preview(integer)",
        "nav_v2_get_team_profile_quality_health()",
        "nav_v2_list_users()",
    ):
        require(marker in roles, f"role consumer evidence missing: {marker}")
    require(answers == [
        "nav_v2_clear_demo_data_unchecked_20260622()",
        "nav_v2_seed_demo_data_unchecked_20260622()",
    ], "answers consumer inventory drifted")
    require(inventory["pii_returned"] is False, "consumer capture claims PII")
    require(inventory["data_mutated"] is False and inventory["ddl_executed"] is False, "consumer capture claims mutation")

    candidates = config["candidates"]
    require([item["id"] for item in candidates] == ["profile_role_index", "answers_deal_prefix_index"], "candidate order drifted")
    role = candidates[0]
    require(role["index"] == "nav_user_profiles_role_idx", "role index name drifted")
    require(role["live_idx_scan"] == 0 and role["live_index_bytes"] == 16384, "role live snapshot drifted")
    require(role["supports_foreign_key"] is False, "role index incorrectly marked FK-backed")
    require(role["direct_role_consumer_count"] == 24, "role candidate consumer count drifted")
    require(role["decision"] == "retain", "role index was not retained")

    answers_candidate = candidates[1]
    require(answers_candidate["index"] == "nav_deal_answers_v2_deal_idx", "answers single index drifted")
    require(answers_candidate["overlapping_index"] == "nav_deal_answers_v2_deal_id_question_key_key", "answers composite index drifted")
    require(answers_candidate["deal_id_is_leading_prefix"] is True, "answers leading-prefix proof missing")
    require(answers_candidate["direct_rpc_consumer_count"] == 2, "answers consumer count drifted")
    require(answers_candidate["decision"] == "review_possible_redundancy_only", "answers candidate escaped review-only state")

    harness = config["synthetic_harness_contract"]
    require(harness["production_schema_used"] is False, "harness uses production schema")
    require(harness["production_data_copied"] is False, "harness copied production data")
    require(harness["synthetic_profiles"] == 120000, "synthetic profile count drifted")
    require(harness["synthetic_deals"] == 5000, "synthetic deal count drifted")
    require(harness["synthetic_answers_per_deal"] == 20, "synthetic answers-per-deal drifted")
    require(harness["synthetic_answers"] == 100000, "synthetic answer count drifted")
    for key in (
        "analyze_data",
        "forced_index_applicability_check",
        "natural_plan_captured",
        "result_equivalence_checked",
        "rollback_required",
        "post_rollback_schema_absence_required",
    ):
        require(harness[key] is True, f"harness contract missing: {key}")
    require(harness["explain_format"] == "json", "EXPLAIN format drifted")

    evidence = set(config["required_before_any_production_index_removal"])
    for marker in (
        "known production statistics observation start",
        "representative authenticated workload window",
        "production query consumer inventory reviewed",
        "EXPLAIN ANALYZE on representative non-PII fixtures",
        "foreign-key parent update/delete benchmark",
        "authenticated regression suite",
        "exact forward and rollback migration",
        "separate owner approval for production DDL",
    ):
        require(marker in evidence, f"production removal evidence missing: {marker}")

    stops = set(config["active_stops"])
    for stop in (
        "production_statistics_window_missing",
        "authenticated_workload_missing",
        "production_explain_analyze_missing",
        "fk_parent_mutation_benchmark_missing",
        "write_cost_benefit_missing",
        "production_migration_missing",
        "owner_ddl_approval_missing",
    ):
        require(stop in stops, f"active stop missing: {stop}")

    forbidden = set(config["forbidden_actions"])
    for action in (
        "drop_production_index",
        "create_production_index",
        "apply_production_migration",
        "change_production_rls",
        "copy_production_data_to_harness",
        "treat_synthetic_plan_as_production_benchmark",
        "claim_index_removal_ready",
    ):
        require(action in forbidden, f"forbidden action missing: {action}")

    require(performance["status"] == "repository_only_performance_advisor_attestation_not_ddl_approval", "performance source status drifted")
    require(performance["summary"]["zero_scan_nonconstraint_indexes"] == 13, "performance zero-scan source drifted")
    require(performance["decision_policy"]["never_auto_drop_index_from_idx_scan_zero"] is True, "no-auto-drop source policy missing")

    require("begin;" in sql.lower(), "harness transaction begin missing")
    require("rollback;" in sql.lower(), "harness rollback missing")
    require("create schema harness" in sql.lower(), "synthetic harness schema missing")
    require("public." not in sql.lower(), "harness executable SQL references public production schema")
    require("generate_series(1, 120000)" in sql, "synthetic profile generator drifted")
    require("generate_series(1, 5000)" in sql, "synthetic deal generator drifted")
    require("generate_series(1, 20)" in sql, "synthetic answer generator drifted")
    require("explain (format json" in sql.lower(), "JSON EXPLAIN helper missing")
    require("set local enable_seqscan = off" in sql.lower(), "structural index applicability control missing")
    require("drop index harness.nav_user_profiles_role_idx" in sql.lower(), "synthetic role index removal missing")
    require("drop index harness.nav_deal_answers_v2_deal_idx" in sql.lower(), "synthetic answers index removal missing")
    require("nav_deal_answers_v2_deal_id_question_key_key" in sql, "composite prefix index evidence missing")
    require("profile_role_structural_with_index" in sql, "role structural evidence missing")
    require("answers_deal_structural_composite_prefix" in sql, "answers prefix evidence missing")
    require("answers_fk_lookup_structural_composite_prefix" in sql, "synthetic FK lookup evidence missing")
    require("result_equivalence" in sql, "result equivalence evidence missing")
    require("to_regnamespace('harness')" in sql, "post-rollback schema assertion missing")
    require("alter index harness.nav_deal_answers_v2_deal_id_question_key_key" not in sql.lower(), "redundant same-name index rename remains")

    for marker in (
        "postgres:17",
        "check_nav_v2_index_query_plan_candidate_v1.py",
        "nav_v2_index_query_plan_harness_v1.sql",
        "actions/upload-artifact@v4",
    ):
        require(marker in workflow, f"workflow marker missing: {marker}")
    for cloud_marker in (
        "supabase db push",
        "supabase functions deploy",
        "apply_migration",
        "create_branch",
        "confirm_cost",
    ):
        require(cloud_marker not in workflow.lower(), f"workflow contains cloud action marker: {cloud_marker}")

    for marker in (
        "Index query-plan candidate",
        "Live consumer inventory",
        "Synthetic PostgreSQL 17 harness",
        "Role index result",
        "Answers prefix result",
        "No production DDL",
        "Active stops",
        "Production remains unchanged",
    ):
        require(marker in doc, f"documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*index*query*plan*")]
    require(not leaked, f"index query-plan candidate leaked into migrations: {leaked}")

    print(
        "Navigator v2 index query-plan candidate source contract passed: "
        "24 role consumers retain nav_user_profiles_role_idx; "
        "nav_deal_answers_v2_deal_idx remains review-only pending production evidence."
    )


if __name__ == "__main__":
    main()
