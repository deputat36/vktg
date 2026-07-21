#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-index-fk-parent-mutation-evidence-v1.json"
BASE_CANDIDATE = ROOT / "config/nav-v2-index-query-plan-candidate-v1.json"
SQL = ROOT / "tests/sql/nav_v2_index_fk_parent_mutation_harness_v1.sql"
WORKFLOW = ROOT / ".github/workflows/nav-v2-index-query-plan-harness-v1.yml"
DOC = ROOT / "docs/NAV_V2_INDEX_FK_PARENT_MUTATION_EVIDENCE_V1_2026-07-21.md"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def uncommented_sql(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.strip().startswith("--"))


def main() -> None:
    for path in (CONFIG, BASE_CANDIDATE, SQL, WORKFLOW, DOC):
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    base = json.loads(BASE_CANDIDATE.read_text(encoding="utf-8"))
    sql_text = SQL.read_text(encoding="utf-8")
    sql = uncommented_sql(sql_text)
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "unexpected FK mutation evidence schema")
    require(
        config["status"] == "repository_only_synthetic_fk_parent_mutation_evidence_not_ddl_approval",
        "FK mutation evidence escaped repository-only boundary",
    )
    require(config["project_ref"] == "ofewxuqfjhamgerwzull", "project ref drifted")
    require(config["captured_on"] == "2026-07-21", "capture date drifted")
    require(config["source_main_sha"] == "27a051d75f36e380715104339f5e9837dfde995e", "source main drifted")

    for key in (
        "production_applied",
        "production_ddl_authorized",
        "index_drop_authorized",
        "index_create_authorized",
        "cloud_execution_allowed",
    ):
        require(config[key] is False, f"authorization flag must remain false: {key}")

    source = config["source_evidence"]
    require(
        source["index_query_plan_candidate"] == BASE_CANDIDATE.relative_to(ROOT).as_posix(),
        "base candidate path drifted",
    )
    require(
        source["synthetic_parent_mutation_harness"] == SQL.relative_to(ROOT).as_posix(),
        "FK mutation harness path drifted",
    )
    require(source["live_capture_mode"] == "aggregate_catalog_only_read_only_transaction", "live capture mode drifted")
    require(source["postgres_harness_major"] == 17, "PostgreSQL harness major drifted")

    live = config["live_fk_contract"]
    require(live["child_table"] == "public.nav_deal_answers_v2", "live child table drifted")
    require(live["parent_table"] == "public.nav_deals_v2", "live parent table drifted")
    require(live["constraint"] == "nav_deal_answers_v2_deal_id_fkey", "live FK name drifted")
    require(live["update_action"] == "NO ACTION", "live FK update action drifted")
    require(live["delete_action"] == "CASCADE", "live FK delete action drifted")
    require("ON DELETE CASCADE" in live["definition"], "live FK definition lost cascade action")

    single = live["single_column_index"]
    prefix = live["composite_prefix_index"]
    require(single["name"] == "nav_deal_answers_v2_deal_idx", "single-column index drifted")
    require(single["idx_scan"] == 0 and single["size_bytes"] == 16384, "single-column live snapshot drifted")
    require(prefix["name"] == "nav_deal_answers_v2_deal_id_question_key_key", "composite index drifted")
    require(prefix["idx_scan"] == 0 and prefix["size_bytes"] == 16384, "composite live snapshot drifted")
    require(prefix["deal_id_is_leading_prefix"] is True, "deal_id leading-prefix evidence missing")
    require(live["row_estimates"] == {"deals": 23, "answers": 7}, "aggregate row estimate snapshot drifted")
    require(live["statistics_reset"] is None, "statistics reset unexpectedly claimed")
    require(live["pii_returned"] is False, "live capture claims PII")
    require(live["data_mutated"] is False and live["ddl_executed"] is False, "live capture claims mutation")

    harness = config["synthetic_harness_contract"]
    require(harness["production_schema_used"] is False, "harness uses production schema")
    require(harness["production_data_copied"] is False, "harness copied production data")
    require(harness["synthetic_modes"] == ["both_indexes", "composite_prefix_only"], "synthetic modes drifted")
    require(harness["synthetic_deals_per_mode_before_mutation"] == 5001, "synthetic parent count drifted")
    require(harness["synthetic_answers_per_deal"] == 20, "synthetic answers per deal drifted")
    require(harness["synthetic_answers_per_mode_before_mutation"] == 100000, "synthetic answer count drifted")
    require(harness["delete_action_mirrored"] == "CASCADE", "synthetic delete action drifted")
    require(harness["update_action_mirrored"] == "NO ACTION", "synthetic update action drifted")
    for key in (
        "actual_parent_delete_explain_analyze",
        "actual_parent_update_explain_analyze",
        "trigger_evidence_required",
        "mutation_semantics_equivalence_required",
        "unaffected_result_equivalence_required",
        "rollback_required",
        "post_rollback_schema_absence_required",
    ):
        require(harness[key] is True, f"synthetic harness contract missing: {key}")

    result = config["result"]
    require(result["single_column_index_removed_in_production"] is False, "result claims production index removal")
    require(result["synthetic_parent_mutations_supported_with_both_indexes"] is True, "both-index result missing")
    require(result["synthetic_parent_mutations_supported_with_composite_prefix_only"] is True, "prefix-only result missing")
    require(result["delete_cascade_semantics_equal"] is True, "delete semantics equivalence missing")
    require(result["update_no_action_semantics_equal"] is True, "update semantics equivalence missing")
    require(
        result["decision"] == "synthetic_fk_parent_mutation_gap_closed_production_drop_not_ready",
        "result escaped production-not-ready decision",
    )

    remaining = set(config["remaining_before_any_production_index_removal"])
    for marker in (
        "known production statistics observation start",
        "representative authenticated workload window",
        "production EXPLAIN ANALYZE on representative non-PII fixtures",
        "production-scale foreign-key parent update/delete benchmark",
        "write amplification and storage benefit estimate",
        "authenticated regression suite",
        "exact forward and rollback migration",
        "separate owner approval for production DDL",
    ):
        require(marker in remaining, f"remaining production evidence missing: {marker}")

    stops = set(config["active_stops"])
    for marker in (
        "production_statistics_window_missing",
        "authenticated_workload_missing",
        "production_explain_analyze_missing",
        "production_scale_fk_parent_mutation_benchmark_missing",
        "write_cost_benefit_missing",
        "production_migration_missing",
        "owner_ddl_approval_missing",
    ):
        require(marker in stops, f"active stop missing: {marker}")

    forbidden = set(config["forbidden_actions"])
    for marker in (
        "drop_production_index",
        "create_production_index",
        "apply_production_migration",
        "change_production_rls",
        "copy_production_data_to_harness",
        "treat_ci_timing_as_production_performance",
        "claim_index_removal_ready",
    ):
        require(marker in forbidden, f"forbidden action missing: {marker}")

    require(base["status"] == "repository_only_index_query_plan_candidate_not_ddl_approval", "base candidate status drifted")
    require(base["index_drop_authorized"] is False, "base candidate authorizes index drop")
    require(base["candidates"][1]["decision"] == "review_possible_redundancy_only", "base candidate decision drifted")

    require("begin;" in sql.lower(), "harness transaction begin missing")
    require("rollback;" in sql.lower(), "harness rollback missing")
    require("create schema harness" in sql.lower(), "harness schema missing")
    require("public." not in sql.lower(), "executable harness SQL references production public schema")
    require("generate_series(1, 5000)" in sql, "synthetic deal generator drifted")
    require("generate_series(1, 20)" in sql, "synthetic answer generator drifted")
    require("explain (analyze, format json" in sql.lower(), "actual mutation EXPLAIN ANALYZE helper missing")
    require("on update no action" in sql.lower(), "NO ACTION FK shape missing")
    require("on delete cascade" in sql.lower(), "CASCADE FK shape missing")
    require("nav_deal_answers_both_deal_idx" in sql, "both-index mode missing")
    require("nav_deal_answers_prefix_deal_question_key_key" in sql, "composite prefix-only mode missing")
    require("delete_cascade_both_indexes" in sql, "both-index delete evidence missing")
    require("update_no_action_both_indexes" in sql, "both-index update evidence missing")
    require("delete_cascade_prefix_only" in sql, "prefix-only delete evidence missing")
    require("update_no_action_prefix_only" in sql, "prefix-only update evidence missing")
    require("trigger_count" in sql, "trigger evidence missing")
    require("unaffected_deal_3000" in sql, "unaffected result equivalence missing")
    require("to_regnamespace('harness')" in sql, "post-rollback schema assertion missing")

    for marker in (
        "check_nav_v2_index_fk_parent_mutation_evidence_v1.py",
        "nav_v2_index_fk_parent_mutation_harness_v1.sql",
        "postgres-17-fk-parent-mutation",
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
        "FK parent mutation evidence",
        "Live read-only FK contract",
        "Synthetic PostgreSQL 17 mutation harness",
        "DELETE CASCADE result",
        "UPDATE NO ACTION result",
        "CI timing is not production performance",
        "Production index drop remains blocked",
        "Production remains unchanged",
    ):
        require(marker in doc, f"documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*fk*parent*mutation*")]
    require(not leaked, f"FK parent mutation evidence leaked into migrations: {leaked}")

    print(
        "Navigator v2 FK parent mutation evidence contract passed: "
        "DELETE CASCADE and UPDATE NO ACTION are tested with both indexes and composite prefix only; "
        "production index removal remains blocked."
    )


if __name__ == "__main__":
    main()
