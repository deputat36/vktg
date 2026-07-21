#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-fk-parent-mutation-benchmark-v1.json"
SQL = ROOT / "tests/sql/nav_v2_fk_parent_mutation_benchmark_v1.sql"
WORKFLOW = ROOT / ".github/workflows/nav-v2-fk-parent-mutation-benchmark-v1.yml"
DOC = ROOT / "docs/NAV_V2_FK_PARENT_MUTATION_BENCHMARK_V1_2026-07-21.md"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def uncommented_sql(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.strip().startswith("--"))


def main() -> None:
    for path in (CONFIG, SQL, WORKFLOW, DOC):
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    sql_text = SQL.read_text(encoding="utf-8")
    sql = uncommented_sql(sql_text)
    lower = sql.lower()
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "unexpected benchmark schema version")
    require(
        config["status"] == "repository_only_synthetic_fk_parent_mutation_benchmark_not_ddl_approval",
        "benchmark escaped repository-only boundary",
    )
    require(config["project_ref"] == "ofewxuqfjhamgerwzull", "project ref drifted")
    require(config["captured_on"] == "2026-07-21", "capture date drifted")
    require(config["source_main_sha"] == "d55c7646dea7d5d130f1b4571ed15610e2a6395f", "source main drifted")
    for key in (
        "production_applied",
        "production_ddl_authorized",
        "index_drop_authorized",
        "cloud_execution_allowed",
        "production_data_used",
    ):
        require(config[key] is False, f"authorization boundary drifted: {key}")

    candidate = config["candidate"]
    require(candidate["table"] == "public.nav_deal_answers_v2", "candidate table drifted")
    require(candidate["single_column_index"] == "nav_deal_answers_v2_deal_idx", "single index drifted")
    require(
        candidate["composite_unique_index"] == "nav_deal_answers_v2_deal_id_question_key_key",
        "composite index drifted",
    )
    require(candidate["leading_prefix"] == "deal_id", "leading prefix drifted")
    require(candidate["decision_before_benchmark"] == "review_possible_redundancy_only", "pre-benchmark decision drifted")
    require(candidate["decision_after_benchmark"] == "review_possible_redundancy_only", "benchmark overclaimed DDL readiness")

    fk = config["read_only_production_fk_contract"]
    require(fk["constraint_name"] == "nav_deal_answers_v2_deal_id_fkey", "FK name drifted")
    require(
        fk["definition"] == "FOREIGN KEY (deal_id) REFERENCES nav_deals_v2(id) ON DELETE CASCADE",
        "FK definition drifted",
    )
    require(fk["on_delete"] == "cascade" and fk["on_update"] == "no_action", "FK actions drifted")
    require(fk["validated"] is True, "production FK was not captured as validated")
    require(fk["deferrable"] is False and fk["initially_deferred"] is False, "FK deferrability drifted")
    require(fk["pii_returned"] is False, "FK capture claims PII")
    require(fk["data_mutated"] is False and fk["ddl_executed"] is False, "FK capture claims mutation")

    synthetic = config["synthetic_contract"]
    require(synthetic["postgres_major"] == 17, "PostgreSQL major drifted")
    require(synthetic["schema"] == "harness", "synthetic schema drifted")
    require(synthetic["synthetic_deals"] == 5002, "synthetic deal count drifted")
    require(synthetic["answers_per_referenced_deal"] == 20, "answers per deal drifted")
    require(synthetic["synthetic_answers"] == 100000, "synthetic answer count drifted")
    require(
        synthetic["comparison_modes"] == [
            "single_and_composite_indexes",
            "composite_unique_index_only",
        ],
        "comparison modes drifted",
    )
    require(synthetic["parent_delete_cascade_cases"] == 2, "delete case count drifted")
    require(synthetic["unreferenced_parent_update_cases"] == 2, "unreferenced update case count drifted")
    require(synthetic["referenced_parent_update_rejection_cases"] == 2, "blocked update case count drifted")
    for key in (
        "explain_analyze",
        "buffers",
        "wal",
        "pg_stat_get_xact_numscans",
        "result_equivalence_required",
        "full_transaction_rollback",
        "post_rollback_schema_absence_required",
    ):
        require(synthetic[key] is True, f"synthetic contract marker missing: {key}")
    require(synthetic["explain_format"] == "json", "EXPLAIN format drifted")
    require(synthetic["latency_superiority_asserted"] is False, "synthetic latency was promoted to a performance claim")

    assertions = set(config["required_assertions"])
    for marker in (
        "composite index remains structurally usable for deal_id child lookup",
        "composite-only parent delete cascade removes exactly the referenced child rows",
        "composite-only unreferenced parent update succeeds",
        "composite-only referenced parent update remains blocked by the foreign key",
        "composite index receives transaction-local scans during composite-only parent mutation cases",
        "single-column index is absent during composite-only cases",
        "result and constraint semantics remain equivalent",
        "synthetic evidence is rolled back completely",
    ):
        require(marker in assertions, f"required assertion missing: {marker}")

    completed = set(config["repository_evidence_completed"])
    for marker in (
        "synthetic_fk_parent_delete_cascade",
        "synthetic_fk_parent_update_no_child",
        "synthetic_fk_parent_update_rejection",
        "transaction_local_index_scan_attribution",
        "synthetic_index_size_capture",
        "full_rollback",
    ):
        require(marker in completed, f"repository evidence marker missing: {marker}")

    stops = set(config["active_stops"])
    for marker in (
        "production_statistics_window_missing",
        "authenticated_workload_missing",
        "production_explain_analyze_missing",
        "production_fk_parent_mutation_benchmark_missing",
        "production_write_cost_benefit_missing",
        "production_migration_missing",
        "owner_ddl_approval_missing",
    ):
        require(marker in stops, f"active stop missing: {marker}")

    forbidden_claims = set(config["forbidden_claims"])
    for marker in (
        "production_index_removal_ready",
        "composite_index_is_faster_in_production",
        "single_column_index_is_safe_to_drop",
        "synthetic_latency_is_production_latency",
        "production_ddl_approved",
    ):
        require(marker in forbidden_claims, f"forbidden claim missing: {marker}")

    forbidden_actions = set(config["forbidden_actions"])
    for marker in (
        "drop_production_index",
        "apply_production_migration",
        "copy_production_data",
        "create_supabase_branch",
        "change_production_rls",
        "change_leader_schema",
    ):
        require(marker in forbidden_actions, f"forbidden action missing: {marker}")

    require("begin;" in lower and "rollback;" in lower, "transaction rollback boundary missing")
    require("create schema harness" in lower, "isolated harness schema missing")
    require("public." not in lower, "executable benchmark SQL references production public schema")
    require("generate_series(1, 5002)" in sql, "synthetic parent generator drifted")
    require("generate_series(1, 5000)" in sql, "synthetic referenced parent generator drifted")
    require("generate_series(1, 20)" in sql, "synthetic child generator drifted")
    require("on update no action" in lower and "on delete cascade" in lower, "synthetic FK actions missing")
    require("pg_stat_get_xact_numscans" in lower, "transaction-local index scan function missing")
    require("pg_stat_xact_user_indexes" not in lower, "nonexistent transaction-local index view remains")
    require("explain (analyze true, buffers true, wal true, format json)" in lower, "EXPLAIN ANALYZE evidence missing")
    require("drop index harness.nav_deal_answers_v2_deal_idx" in lower, "synthetic single index removal missing")
    require("nav_deal_answers_v2_deal_id_question_key_key" in sql, "composite index evidence missing")
    for case_id in (
        "delete_cascade_with_both_indexes",
        "update_unreferenced_with_both_indexes",
        "update_referenced_blocked_with_both_indexes",
        "delete_cascade_composite_only",
        "update_unreferenced_composite_only",
        "update_referenced_blocked_composite_only",
    ):
        require(case_id in sql, f"benchmark case missing: {case_id}")
    require("sqlstate = '23503'" in lower, "foreign-key violation assertion missing")
    require("latency_superiority_asserted', false" in lower, "no-latency-claim evidence missing")
    require("to_regnamespace('harness')" in lower, "post-rollback schema assertion missing")

    for marker in (
        "postgres:17",
        "check_nav_v2_fk_parent_mutation_benchmark_v1.py",
        "nav_v2_fk_parent_mutation_benchmark_v1.sql",
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
        "FK parent mutation benchmark",
        "Read-only production FK contract",
        "Synthetic comparison modes",
        "Parent delete cascade",
        "Parent update",
        "Transaction-local index attribution",
        "No production DDL",
        "Decision remains review-only",
        "Active production stops",
        "Production remains unchanged",
    ):
        require(marker in doc, f"documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*fk*parent*mutation*")]
    require(not leaked, f"synthetic benchmark leaked into migrations: {leaked}")

    print(
        "Navigator v2 FK parent mutation benchmark source contract passed: "
        "synthetic CASCADE/NO ACTION cases only; production index decision remains review-only."
    )


if __name__ == "__main__":
    main()
