#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-index-write-storage-measurement-v1.json"
MAPPING = ROOT / "config/nav-v2-query-to-index-mapping-v1.json"
FK_EVIDENCE = ROOT / "config/nav-v2-index-fk-parent-mutation-evidence-v1.json"
SQL = ROOT / "tests/sql/nav_v2_index_write_storage_measurement_harness_v1.sql"
WORKFLOW = ROOT / ".github/workflows/nav-v2-index-write-storage-measurement-v1.yml"
DOC = ROOT / "docs/NAV_V2_INDEX_WRITE_STORAGE_MEASUREMENT_V1_2026-07-22.md"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def uncommented_sql(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.strip().startswith("--"))


def main() -> None:
    for path in (CONFIG, MAPPING, FK_EVIDENCE, SQL, WORKFLOW, DOC):
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    fk_evidence = json.loads(FK_EVIDENCE.read_text(encoding="utf-8"))
    sql_text = SQL.read_text(encoding="utf-8")
    sql = uncommented_sql(sql_text)
    lower = sql.lower()
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "unexpected measurement schema version")
    require(
        config["status"] == "repository_only_synthetic_write_storage_measurement_not_ddl_approval",
        "measurement escaped repository-only boundary",
    )
    require(config["project_ref"] == "ofewxuqfjhamgerwzull", "project ref drifted")
    require(config["captured_at"] == "2026-07-22T04:51:36.605125+00:00", "live capture timestamp drifted")
    require(config["source_main_sha"] == "ca9b0c2f9e60d5198a234be6f429f2f9c022168d", "source main drifted")

    for key in (
        "production_applied",
        "production_ddl_authorized",
        "index_drop_authorized",
        "index_create_authorized",
        "cloud_execution_allowed",
    ):
        require(config[key] is False, f"authorization boundary drifted: {key}")

    source = config["source_evidence"]
    require(source["query_to_index_mapping"] == MAPPING.relative_to(ROOT).as_posix(), "mapping source path drifted")
    require(source["canonical_fk_evidence"] == FK_EVIDENCE.relative_to(ROOT).as_posix(), "FK source path drifted")
    require(source["synthetic_harness"] == SQL.relative_to(ROOT).as_posix(), "harness path drifted")
    require(
        source["live_capture_mode"] == "aggregate_catalog_and_statistics_only_read_only_transaction",
        "live capture mode drifted",
    )
    require(source["postgres_harness_major"] == 17, "PostgreSQL harness major drifted")

    candidate = config["candidate"]
    require(candidate["table"] == "public.nav_deal_answers_v2", "candidate table drifted")
    require(candidate["single_column_index"] == "nav_deal_answers_v2_deal_idx", "single index drifted")
    require(
        candidate["composite_unique_index"] == "nav_deal_answers_v2_deal_id_question_key_key",
        "composite index drifted",
    )
    require(candidate["leading_prefix"] == "deal_id", "leading prefix drifted")
    require(candidate["decision_before_measurement"] == "review_possible_redundancy_only", "pre-measurement decision drifted")
    require(candidate["decision_after_measurement"] == "review_possible_redundancy_only", "measurement overclaimed readiness")

    live = config["live_read_only_snapshot"]
    table = live["table"]
    require(table["heap_bytes"] == 8192 and table["total_bytes"] == 81920, "live table size snapshot drifted")
    require(table["seq_scan"] == 4 and table["idx_scan"] == 0, "live scan snapshot drifted")
    require(
        [table[key] for key in ("n_tup_ins", "n_tup_upd", "n_tup_del", "n_live_tup", "n_dead_tup")] == [0, 0, 0, 0, 0],
        "live table statistics snapshot drifted",
    )
    for key in ("last_vacuum", "last_autovacuum", "last_analyze", "last_autoanalyze"):
        require(table[key] is None, f"live maintenance timestamp unexpectedly present: {key}")

    indexes = live["indexes"]
    require([item["name"] for item in indexes] == [
        "nav_deal_answers_v2_deal_id_question_key_key",
        "nav_deal_answers_v2_deal_idx",
    ], "live index order or names drifted")
    for index in indexes:
        require(index["size_bytes"] == 16384, f"live index size drifted: {index['name']}")
        require(index["idx_scan"] == 0 and index["idx_tup_read"] == 0 and index["idx_tup_fetch"] == 0, f"live index stats drifted: {index['name']}")
    require(live["database_stats_reset"] is None, "database statistics window unexpectedly claimed")
    require(live["global_wal_snapshot"]["attributable_to_candidate"] is False, "global WAL incorrectly attributed")
    require(live["production_statistics_representative"] is False, "stale production statistics promoted to representative")
    for key in ("pii_returned", "business_rows_returned", "data_mutated", "ddl_executed"):
        require(live[key] is False, f"live capture boundary drifted: {key}")

    synthetic = config["synthetic_harness_contract"]
    require(synthetic["production_schema_used"] is False, "harness uses production schema")
    require(synthetic["production_data_copied"] is False, "harness copied production data")
    require(synthetic["comparison_modes"] == [
        "single_and_composite_indexes",
        "composite_unique_index_only",
    ], "comparison modes drifted")
    require(synthetic["synthetic_parent_rows"] == 6000, "synthetic parent count drifted")
    require(synthetic["synthetic_referenced_deals"] == 5000, "synthetic referenced deal count drifted")
    require(synthetic["synthetic_answers_per_deal"] == 20, "answers-per-deal drifted")
    require(synthetic["insert_rows_per_mode"] == 100000, "insert workload drifted")
    require(synthetic["indexed_update_rows_per_mode"] == 10000, "update workload drifted")
    require(synthetic["delete_rows_per_mode"] == 10000, "delete workload drifted")
    require(synthetic["final_rows_per_mode"] == 90000, "final row contract drifted")
    for key in (
        "explain_analyze",
        "buffers",
        "wal",
        "storage_capture_after_each_stage",
        "semantic_equivalence_required",
        "full_transaction_rollback",
        "post_rollback_schema_absence_required",
    ):
        require(synthetic[key] is True, f"synthetic contract marker missing: {key}")
    require(synthetic["explain_format"] == "json", "EXPLAIN format drifted")
    require(synthetic["timing"] is False, "per-node timing must remain disabled")

    policy = config["measurement_policy"]
    for key in (
        "wal_bytes_are_statement_local_ci_diagnostics",
        "relation_sizes_are_synthetic_only",
        "execution_time_is_not_a_production_latency_estimate",
        "no_ratio_threshold_for_index_removal",
        "no_automatic_ddl_decision",
        "production_benefit_requires_representative_authenticated_workload",
    ):
        require(policy[key] is True, f"measurement safety policy missing: {key}")

    result = config["result"]
    require(
        result["decision"] == "synthetic_write_storage_measurement_completed_production_drop_not_ready",
        "result escaped production-not-ready boundary",
    )
    require(result["single_column_index_removed_in_production"] is False, "result claims production index removal")
    require(result["synthetic_write_measurement_completed"] is True, "synthetic write measurement marker missing")
    require(result["synthetic_storage_measurement_completed"] is True, "synthetic storage measurement marker missing")
    for key in ("production_write_savings_proven", "production_storage_savings_proven", "latency_superiority_proven"):
        require(result[key] is False, f"result overclaims production evidence: {key}")

    require(mapping["status"] == "repository_only_exact_non_pii_query_to_index_mapping_not_ddl_approval", "mapping source status drifted")
    require(mapping["answers_index_mapping"]["decision"] == "review_possible_redundancy_only", "mapping decision drifted")
    require(mapping["answers_index_mapping"]["insert_only_consumer_count"] == 1, "insert-only consumer evidence drifted")
    require(fk_evidence["status"] == "repository_only_synthetic_fk_parent_mutation_evidence_not_ddl_approval", "FK source status drifted")
    require(
        fk_evidence["result"]["decision"] == "synthetic_fk_parent_mutation_gap_hardened_production_drop_not_ready",
        "canonical FK decision drifted",
    )

    stops = set(config["active_stops"])
    for marker in (
        "production_statistics_window_missing",
        "authenticated_workload_missing",
        "production_explain_analyze_missing",
        "production_scale_fk_parent_mutation_benchmark_missing",
        "production_write_storage_benefit_missing",
        "production_migration_missing",
        "owner_ddl_approval_missing",
    ):
        require(marker in stops, f"active stop missing: {marker}")

    forbidden_claims = set(config["forbidden_claims"])
    for marker in (
        "production_index_removal_ready",
        "single_column_index_is_safe_to_drop",
        "synthetic_wal_is_production_wal",
        "synthetic_storage_is_production_storage",
        "synthetic_latency_is_production_latency",
        "production_ddl_approved",
    ):
        require(marker in forbidden_claims, f"forbidden claim missing: {marker}")

    forbidden_actions = set(config["forbidden_actions"])
    for marker in (
        "drop_production_index",
        "create_production_index",
        "apply_production_migration",
        "change_production_rls",
        "copy_production_data_to_harness",
        "create_supabase_branch",
        "change_leader_schema",
    ):
        require(marker in forbidden_actions, f"forbidden action missing: {marker}")

    require("begin;" in lower and "rollback;" in lower, "transaction rollback boundary missing")
    require("create schema harness" in lower, "isolated harness schema missing")
    require("public." not in lower, "executable harness SQL references production public schema")
    require("generate_series(1, 6000)" in sql, "synthetic parent generator drifted")
    require("generate_series(1, 5000)" in sql, "synthetic deal generator drifted")
    require("generate_series(1, 20)" in sql, "synthetic answer generator drifted")
    require("explain (analyze true, buffers true, wal true, timing false, summary true, format json)" in lower, "EXPLAIN write evidence missing")
    require("answers_both_deal_idx" in sql, "single-column comparison index missing")
    require("answers_both_deal_question_key_key" in sql, "both-mode composite index missing")
    require("answers_composite_deal_question_key_key" in sql, "composite-only index missing")
    for case_id in (
        "insert_100k_both_indexes",
        "insert_100k_composite_only",
        "update_10k_deal_id_both_indexes",
        "update_10k_deal_id_composite_only",
        "delete_10k_both_indexes",
        "delete_10k_composite_only",
    ):
        require(case_id in sql, f"write evidence case missing: {case_id}")
    require("$.**.\"WAL Bytes\"" in sql, "statement-local WAL byte extraction missing")
    require("pg_relation_size" in lower and "pg_total_relation_size" in lower, "relation size capture missing")
    require("final synthetic result hashes differ" in sql, "result equivalence assertion missing")
    require("no_ratio_threshold_for_index_removal" not in lower, "config-only policy leaked into executable SQL")
    require("to_regnamespace('harness')" in lower, "post-rollback schema assertion missing")

    for marker in (
        "postgres:17",
        "check_nav_v2_index_write_storage_measurement_v1.py",
        "nav_v2_index_write_storage_measurement_harness_v1.sql",
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
        "Write amplification and storage measurement",
        "Live read-only snapshot",
        "Synthetic PostgreSQL 17 workload",
        "Statement-local WAL and buffers",
        "Synthetic storage evidence",
        "No performance threshold",
        "Production index removal remains blocked",
        "Production remains unchanged",
    ):
        require(marker in doc, f"documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*write*storage*measurement*")]
    require(not leaked, f"measurement contract leaked into migrations: {leaked}")

    print(
        "Navigator v2 index write/storage measurement source contract passed: "
        "100k insert, 10k indexed update and 10k delete per mode; production DDL remains blocked."
    )


if __name__ == "__main__":
    main()
