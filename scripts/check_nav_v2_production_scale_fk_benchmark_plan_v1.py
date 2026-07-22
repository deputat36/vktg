#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-production-scale-fk-benchmark-plan-v1.json"
FK_EVIDENCE = ROOT / "config/nav-v2-index-fk-parent-mutation-evidence-v1.json"
WRITE_STORAGE = ROOT / "config/nav-v2-index-write-storage-measurement-v1.json"
MAPPING = ROOT / "config/nav-v2-query-to-index-mapping-v1.json"
PREFLIGHT = ROOT / "tests/sql/nav_v2_production_scale_fk_benchmark_readonly_preflight_v1.sql"
WORKFLOW = ROOT / ".github/workflows/nav-v2-production-scale-fk-benchmark-plan-v1.yml"
DOC = ROOT / "docs/NAV_V2_PRODUCTION_SCALE_FK_BENCHMARK_PLAN_V1_2026-07-22.md"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def uncommented_sql(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.strip().startswith("--"))


def main() -> None:
    for path in (CONFIG, FK_EVIDENCE, WRITE_STORAGE, MAPPING, PREFLIGHT, WORKFLOW, DOC):
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    fk = json.loads(FK_EVIDENCE.read_text(encoding="utf-8"))
    write_storage = json.loads(WRITE_STORAGE.read_text(encoding="utf-8"))
    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    preflight_text = PREFLIGHT.read_text(encoding="utf-8")
    preflight = uncommented_sql(preflight_text)
    lower = preflight.lower()
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "unexpected plan schema")
    require(
        config["status"] == "repository_only_fail_closed_production_scale_fk_benchmark_plan_not_execution_approval",
        "plan escaped repository-only boundary",
    )
    require(config["project_ref"] == "ofewxuqfjhamgerwzull", "project ref drifted")
    require(config["created_on"] == "2026-07-22", "creation date drifted")
    require(config["source_main_sha"] == "a8921def49627b08336a6dd15efaa490f1a25427", "source main drifted")

    for key in (
        "production_applied",
        "production_ddl_authorized",
        "production_dml_authorized",
        "cloud_execution_allowed",
        "benchmark_execution_authorized",
        "preview_branch_created",
        "cost_rechecked",
        "explicit_owner_cost_approval",
        "technical_accounts_created",
    ):
        require(config[key] is False, f"authorization flag must remain false: {key}")
    require(config["selected_environment"] is None, "environment selected without approval")
    require(config["cost_confirmation_id"] is None, "cost confirmation exists before approval")

    sources = config["source_evidence"]
    require(sources["canonical_fk_evidence"] == FK_EVIDENCE.relative_to(ROOT).as_posix(), "FK source path drifted")
    require(sources["write_storage_measurement"] == WRITE_STORAGE.relative_to(ROOT).as_posix(), "write/storage source path drifted")
    require(sources["query_to_index_mapping"] == MAPPING.relative_to(ROOT).as_posix(), "mapping source path drifted")
    require(sources["readonly_preflight_template"] == PREFLIGHT.relative_to(ROOT).as_posix(), "preflight path drifted")

    candidate = config["candidate"]
    require(candidate["child_table"] == "public.nav_deal_answers_v2", "child table drifted")
    require(candidate["parent_table"] == "public.nav_deals_v2", "parent table drifted")
    require(candidate["foreign_key"] == "nav_deal_answers_v2_deal_id_fkey", "FK name drifted")
    require(candidate["single_column_index"] == "nav_deal_answers_v2_deal_idx", "single index drifted")
    require(candidate["composite_unique_index"] == "nav_deal_answers_v2_deal_id_question_key_key", "composite index drifted")
    require(candidate["leading_prefix"] == "deal_id", "leading prefix drifted")
    require(candidate["delete_action"] == "CASCADE" and candidate["update_action"] == "NO ACTION", "FK actions drifted")
    require(candidate["decision_before_plan"] == "review_possible_redundancy_only", "pre-plan decision drifted")
    require(candidate["decision_after_plan"] == "review_possible_redundancy_only", "plan overclaimed readiness")

    require(config["allowed_execution_environments"] == [
        "owner_and_cost_approved_disposable_supabase_preview_branch",
        "isolated_ephemeral_postgresql_17",
    ], "allowed environments drifted")
    forbidden_envs = set(config["forbidden_execution_environments"])
    for marker in (
        "production_database",
        "shared_non_disposable_database",
        "environment_with_real_employee_accounts",
        "environment_with_copied_production_rows",
    ):
        require(marker in forbidden_envs, f"forbidden environment missing: {marker}")

    dataset = config["dataset_policy"]
    for key in (
        "synthetic_only",
        "deterministic_seed_required",
        "dataset_manifest_required",
        "generated_row_hash_required",
        "cleanup_required",
    ):
        require(dataset[key] is True, f"dataset policy missing: {key}")
    for key in (
        "production_rows_copied",
        "real_client_data_allowed",
        "real_employee_accounts_allowed",
        "direct_identifiers_allowed",
    ):
        require(dataset[key] is False, f"unsafe dataset policy enabled: {key}")

    inputs = config["unresolved_capacity_inputs"]
    require(inputs["planning_horizon_months"] == 12, "planning horizon drifted")
    for key in (
        "approved_target_deals",
        "approved_target_answers",
        "approved_answers_per_deal_distribution",
        "approved_peak_concurrency",
        "approved_branch_compute_class",
        "approved_max_runtime_minutes",
    ):
        require(inputs[key] is None, f"capacity input was guessed: {key}")
    require(inputs["inputs_may_not_be_guessed"] is True, "no-guess policy missing")

    scale = config["scale_resolution_policy"]
    for key in (
        "fresh_readonly_catalog_preflight_required",
        "fresh_statistics_window_start_required",
        "capacity_forecast_owner_approval_required",
        "scale_must_fit_approved_environment",
        "scale_reduction_requires_recorded_reason",
        "unresolved_scale_blocks_execution",
    ):
        require(scale[key] is True, f"scale policy missing: {key}")
    require(scale["baseline_scale_formula"] == "max(fresh_observed_rows, approved_target_rows)", "baseline formula drifted")
    require(scale["stress_scale_formula"] == "2 * baseline_scale", "stress formula drifted")

    modes = config["comparison_modes"]
    require([m["id"] for m in modes] == ["single_and_composite_indexes", "composite_unique_index_only"], "comparison modes drifted")
    require(modes[0]["single_index_present"] is True and modes[1]["single_index_present"] is False, "single-index modes drifted")
    require(all(m["composite_index_present"] is True for m in modes), "composite index must remain in both modes")

    mutation_matrix = set(config["required_mutation_matrix"])
    for marker in (
        "parent_delete_zero_children",
        "parent_delete_one_child",
        "parent_delete_median_children",
        "parent_delete_p95_children",
        "parent_delete_max_bounded_children",
        "parent_update_unreferenced_success",
        "parent_update_referenced_rejected_23503",
        "mixed_delete_and_rejected_update_batch",
    ):
        require(marker in mutation_matrix, f"mutation case missing: {marker}")

    concurrency = config["required_concurrency_matrix"]
    require(concurrency["serial"] == 1, "serial concurrency drifted")
    require(concurrency["approved_peak"] is None and concurrency["approved_peak_plus_headroom"] is None, "concurrency guessed")
    require(concurrency["unresolved_concurrency_blocks_execution"] is True, "unresolved concurrency does not block")

    protocol = config["measurement_protocol"]
    require(protocol["postgres_major"] == 17, "PostgreSQL major drifted")
    require(protocol["warmup_iterations_per_case"] == 5, "warmup count drifted")
    require(protocol["measured_iterations_per_case"] == 20, "measurement count drifted")
    for key in (
        "randomized_case_order",
        "same_dataset_snapshot_for_both_modes",
        "explain_analyze",
        "buffers",
        "wal",
        "lock_timeout_required",
        "statement_timeout_required",
        "deadlock_timeout_recorded",
        "server_settings_manifest_required",
        "index_sizes_captured",
        "table_sizes_captured",
        "row_counts_captured",
        "result_hashes_captured",
        "fk_semantics_asserted",
        "transaction_rollback_required",
    ):
        require(protocol[key] is True, f"measurement protocol missing: {key}")
    require(protocol["cold_cache_claims_allowed"] is False, "cold-cache claims allowed")
    require(protocol["explain_format"] == "json" and protocol["timing"] is False, "EXPLAIN contract drifted")

    acceptance = config["acceptance_policy"]
    for key in (
        "semantic_mismatch_is_failure",
        "unexpected_fk_outcome_is_failure",
        "timeout_or_deadlock_is_recorded_failure",
        "incomplete_cleanup_is_failure",
        "missing_artifact_is_failure",
        "separate_authenticated_regression_required",
        "separate_forward_and_rollback_migration_required",
        "separate_owner_production_ddl_approval_required",
    ):
        require(acceptance[key] is True, f"acceptance policy missing: {key}")
    for key in (
        "fixed_latency_ratio_for_drop_approval",
        "fixed_wal_ratio_for_drop_approval",
        "fixed_storage_ratio_for_drop_approval",
    ):
        require(acceptance[key] is None, f"automatic threshold introduced: {key}")
    require(acceptance["automatic_index_drop_decision"] is False, "automatic DDL decision enabled")

    lifecycle = config["preview_branch_lifecycle_if_selected"]
    require(lifecycle["maximum_lifetime_hours"] == 6, "preview lifetime drifted")
    for key in (
        "automatic_delete_deadline_required",
        "database_first_apply",
        "production_data_import_forbidden",
        "cleanup_before_branch_delete_required",
        "branch_delete_evidence_required",
    ):
        require(lifecycle[key] is True, f"preview lifecycle missing: {key}")
    require(lifecycle["candidate_edge_deploy_required"] is False, "benchmark unnecessarily requires Edge deploy")
    require(lifecycle["technical_accounts_required_for_this_benchmark"] is False, "benchmark unnecessarily requires accounts")

    result = config["result"]
    require(result["decision"] == "production_scale_fk_benchmark_protocol_prepared_execution_blocked", "result boundary drifted")
    for key in (
        "benchmark_executed",
        "production_scale_evidence_completed",
        "production_index_removal_ready",
        "production_write_savings_proven",
        "production_latency_regression_excluded",
    ):
        require(result[key] is False, f"result overclaims completion: {key}")

    require(fk["result"]["decision"] == "synthetic_fk_parent_mutation_gap_hardened_production_drop_not_ready", "FK evidence decision drifted")
    require(write_storage["result"]["decision"] == "synthetic_write_storage_measurement_completed_production_drop_not_ready", "write/storage decision drifted")
    require(mapping["answers_index_mapping"]["decision"] == "review_possible_redundancy_only", "mapping decision drifted")

    stops = set(config["active_stops"])
    for marker in (
        "benchmark_execution_not_authorized",
        "selected_environment_missing",
        "fresh_statistics_window_missing",
        "approved_capacity_forecast_missing",
        "approved_concurrency_missing",
        "approved_runtime_and_compute_missing",
        "preview_cost_approval_missing_if_preview_selected",
        "production_explain_analyze_missing",
        "authenticated_regression_missing",
        "production_migration_missing",
        "owner_ddl_approval_missing",
    ):
        require(marker in stops, f"active stop missing: {marker}")

    forbidden_actions = set(config["forbidden_actions"])
    for marker in (
        "run_benchmark_on_production",
        "insert_synthetic_rows_into_production",
        "update_production_rows_for_benchmark",
        "delete_production_rows_for_benchmark",
        "drop_production_index",
        "apply_production_migration",
        "create_supabase_branch_without_fresh_cost_and_owner_approval",
        "copy_production_data_to_benchmark",
        "create_real_employee_test_accounts",
        "change_leader_schema",
    ):
        require(marker in forbidden_actions, f"forbidden action missing: {marker}")

    require("begin transaction read only;" in lower, "read-only transaction missing")
    require("rollback;" in lower, "preflight rollback missing")
    require("exact_business_row_counts_returned', false" in lower, "exact-count boundary missing")
    require("business_rows_returned', false" in lower and "pii_returned', false" in lower, "privacy boundary missing")
    require("benchmark_executed', false" in lower, "benchmark execution false marker missing")
    for dangerous in (
        "insert into public.",
        "update public.",
        "delete from public.",
        "drop index",
        "create index",
        "alter table",
        "create table",
        "truncate",
    ):
        require(dangerous not in lower, f"read-only preflight contains dangerous SQL: {dangerous}")

    for marker in (
        "check_nav_v2_production_scale_fk_benchmark_plan_v1.py",
        "nav_v2_production_scale_fk_benchmark_readonly_preflight_v1.sql",
    ):
        require(marker in workflow, f"workflow marker missing: {marker}")
    for cloud_marker in (
        "supabase db push",
        "supabase functions deploy",
        "apply_migration",
        "create_branch",
        "confirm_cost",
        "psql -f tests/sql/nav_v2_production_scale_fk_benchmark",
    ):
        require(cloud_marker not in workflow.lower(), f"workflow contains execution marker: {cloud_marker}")

    for marker in (
        "Production-scale FK benchmark plan",
        "Execution remains blocked",
        "Unresolved capacity inputs",
        "Required mutation matrix",
        "Measurement protocol",
        "No automatic threshold",
        "Preview branch gate",
        "Production remains unchanged",
    ):
        require(marker in doc, f"documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*production*scale*fk*benchmark*")]
    require(not leaked, f"benchmark plan leaked into migrations: {leaked}")

    print(
        "Navigator v2 production-scale FK benchmark plan contract passed: "
        "execution remains blocked; production DML/DDL and unapproved cloud resources are forbidden."
    )


if __name__ == "__main__":
    main()
