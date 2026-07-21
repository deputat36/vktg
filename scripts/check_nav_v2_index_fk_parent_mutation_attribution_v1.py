#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-index-fk-parent-mutation-attribution-v1.json"
CANONICAL_CONFIG = ROOT / "config/nav-v2-index-fk-parent-mutation-evidence-v1.json"
CANONICAL_SQL = ROOT / "tests/sql/nav_v2_index_fk_parent_mutation_harness_v1.sql"
SQL = ROOT / "tests/sql/nav_v2_index_fk_parent_mutation_attribution_harness_v1.sql"
WORKFLOW = ROOT / ".github/workflows/nav-v2-index-query-plan-harness-v1.yml"
DOC = ROOT / "docs/NAV_V2_INDEX_FK_PARENT_MUTATION_ATTRIBUTION_V1_2026-07-21.md"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def uncommented_sql(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.strip().startswith("--"))


def main() -> None:
    for path in (CONFIG, CANONICAL_CONFIG, CANONICAL_SQL, SQL, WORKFLOW, DOC):
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    canonical = json.loads(CANONICAL_CONFIG.read_text(encoding="utf-8"))
    sql_text = SQL.read_text(encoding="utf-8")
    sql = uncommented_sql(sql_text)
    lower = sql.lower()
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "unexpected attribution schema version")
    require(
        config["status"] == "repository_only_synthetic_fk_parent_mutation_attribution_not_ddl_approval",
        "attribution escaped repository-only boundary",
    )
    require(config["project_ref"] == "ofewxuqfjhamgerwzull", "project ref drifted")
    require(config["captured_on"] == "2026-07-21", "capture date drifted")
    require(config["source_main_sha"] == "1076b70a23c89d0058beee29847f092cdc5dabb9", "source main drifted")
    for key in (
        "production_applied",
        "production_ddl_authorized",
        "index_drop_authorized",
        "cloud_execution_allowed",
    ):
        require(config[key] is False, f"authorization flag must remain false: {key}")

    source = config["source_evidence"]
    require(
        source["canonical_fk_mutation_contract"] == CANONICAL_CONFIG.relative_to(ROOT).as_posix(),
        "canonical config source drifted",
    )
    require(
        source["canonical_fk_mutation_harness"] == CANONICAL_SQL.relative_to(ROOT).as_posix(),
        "canonical harness source drifted",
    )
    require(source["attribution_harness"] == SQL.relative_to(ROOT).as_posix(), "attribution harness path drifted")
    require(source["postgres_harness_major"] == 17, "PostgreSQL major drifted")

    scope = config["scope"]
    require(scope["single_column_index"] == "nav_deal_answers_v2_deal_idx", "single index drifted")
    require(scope["composite_unique_index"] == "nav_deal_answers_v2_deal_id_question_key_key", "composite index drifted")
    require(scope["foreign_key"] == "nav_deal_answers_v2_deal_id_fkey", "foreign key drifted")
    require(scope["delete_action"] == "CASCADE" and scope["update_action"] == "NO ACTION", "FK actions drifted")
    require(
        scope["comparison_modes"] == ["single_and_composite_indexes", "composite_unique_index_only"],
        "comparison modes drifted",
    )

    synthetic = config["synthetic_contract"]
    require(synthetic["production_schema_used"] is False, "synthetic harness uses production schema")
    require(synthetic["production_data_copied"] is False, "synthetic harness copied production data")
    require(synthetic["synthetic_deals_before_mutation"] == 5002, "synthetic parent count drifted")
    require(synthetic["synthetic_answers_before_mutation"] == 100000, "synthetic child count drifted")
    require(synthetic["answers_per_referenced_deal"] == 20, "answers-per-deal drifted")
    require(synthetic["parent_delete_cases"] == 2, "delete case count drifted")
    require(synthetic["unreferenced_parent_update_cases"] == 2, "unreferenced update case count drifted")
    require(synthetic["referenced_parent_update_rejection_cases"] == 2, "blocked update case count drifted")
    require(synthetic["isolated_backend_index_stats"] == "pg_stat_user_indexes", "scan attribution source drifted")
    require(synthetic["statistics_snapshot_reset_between_reads"] is True, "statistics snapshot reset missing")
    require(synthetic["statistics_flush_requested_after_mutation"] is True, "statistics flush request missing")
    for key in (
        "synthetic_index_sizes_captured",
        "structural_composite_prefix_plan_required",
        "full_transaction_rollback",
        "post_rollback_schema_absence_required",
    ):
        require(synthetic[key] is True, f"synthetic contract missing: {key}")
    require(synthetic["latency_superiority_asserted"] is False, "synthetic latency became a production claim")

    required = set(config["required_evidence"])
    for marker in (
        "both-index parent delete uses at least one child index",
        "both-index unreferenced parent update uses at least one child index",
        "composite-only parent delete increments the composite index scan counter",
        "composite-only unreferenced parent update increments the composite index scan counter",
        "referenced parent update is rejected with SQLSTATE 23503 in both modes",
        "single-column index is absent in composite-only evidence",
        "synthetic index sizes are captured without production extrapolation",
        "all generated rows and schema are rolled back",
    ):
        require(marker in required, f"required evidence missing: {marker}")

    policy = config["result_policy"]
    require(
        policy["canonical_decision_preserved"] == "synthetic_fk_parent_mutation_gap_closed_production_drop_not_ready",
        "canonical decision drifted",
    )
    require(policy["candidate_decision_preserved"] == "review_possible_redundancy_only", "candidate decision drifted")
    require(policy["production_index_removal_ready"] is False, "attribution claims production removal readiness")
    require(policy["synthetic_latency_is_production_latency"] is False, "synthetic latency was promoted")

    require(
        canonical["result"]["decision"] == policy["canonical_decision_preserved"],
        "canonical evidence no longer matches the attribution policy",
    )
    require(canonical["index_drop_authorized"] is False, "canonical evidence authorizes index drop")

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
        "copy_production_data_to_harness",
        "create_supabase_branch",
        "change_production_rls",
        "change_leader_schema",
    ):
        require(marker in forbidden, f"forbidden action missing: {marker}")

    require("begin;" in lower and "rollback;" in lower, "transaction rollback boundary missing")
    require("create schema harness" in lower, "isolated harness schema missing")
    require("public." not in lower, "executable SQL references production public schema")
    require("generate_series(1, 5002)" in sql, "synthetic parent generator drifted")
    require("generate_series(1, 5000)" in sql, "synthetic referenced parent generator drifted")
    require("generate_series(1, 20)" in sql, "synthetic child generator drifted")
    require("pg_stat_user_indexes" in lower, "isolated backend index attribution missing")
    require("pg_stat_xact_user_indexes" not in lower, "nonexistent transaction index view remains")
    require("pg_stat_force_next_flush" in lower, "statistics flush request missing")
    require("pg_stat_clear_snapshot" in lower, "statistics snapshot reset missing")
    require("pg_relation_size" in lower, "synthetic index size capture missing")
    require("drop index harness.nav_deal_answers_v2_deal_idx" in lower, "synthetic single index removal missing")
    require("set local enable_seqscan = off" in lower, "structural prefix plan control missing")
    require("sqlstate = '23503'" in lower, "blocked referenced update assertion missing")
    for case_id in (
        "delete_cascade_with_both_indexes",
        "update_unreferenced_with_both_indexes",
        "update_referenced_blocked_with_both_indexes",
        "delete_cascade_composite_only",
        "update_unreferenced_composite_only",
        "update_referenced_blocked_composite_only",
    ):
        require(case_id in sql, f"attribution case missing: {case_id}")
    require("latency_superiority_asserted', false" in lower, "no-latency-claim evidence missing")
    require("to_regnamespace('harness')" in lower, "post-rollback assertion missing")

    for marker in (
        "check_nav_v2_index_fk_parent_mutation_attribution_v1.py",
        "nav_v2_index_fk_parent_mutation_attribution_harness_v1.sql",
        "postgres-17-fk-parent-mutation-attribution",
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
        "FK parent mutation attribution",
        "Canonical evidence extended, not duplicated",
        "Isolated-backend index scan deltas",
        "Synthetic index sizes",
        "Referenced parent update rejection",
        "Composite-only result",
        "Decision remains review-only",
        "No production DDL",
        "Production remains unchanged",
    ):
        require(marker in doc, f"documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*fk*parent*mutation*attribution*")]
    require(not leaked, f"attribution evidence leaked into migrations: {leaked}")

    print(
        "Navigator v2 FK parent-mutation attribution source contract passed: "
        "isolated scan deltas, synthetic sizes and blocked updates only; production decision remains review-only."
    )


if __name__ == "__main__":
    main()
