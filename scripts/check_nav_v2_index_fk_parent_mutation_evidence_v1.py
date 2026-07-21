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
    sql = uncommented_sql(SQL.read_text(encoding="utf-8"))
    lower = sql.lower()
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config["schema_version"] == 2, "unexpected hardened evidence schema")
    require(
        config["status"] == "repository_only_synthetic_fk_parent_mutation_evidence_not_ddl_approval",
        "evidence escaped repository-only boundary",
    )
    require(config["project_ref"] == "ofewxuqfjhamgerwzull", "project ref drifted")
    require(config["captured_on"] == "2026-07-21", "capture date drifted")
    require(config["source_main_sha"] == "08df8575242397f81b5d46a306afbd4eafaa1fe2", "source main drifted")

    for key in (
        "production_applied",
        "production_ddl_authorized",
        "index_drop_authorized",
        "index_create_authorized",
        "cloud_execution_allowed",
    ):
        require(config[key] is False, f"authorization flag must remain false: {key}")

    source = config["source_evidence"]
    require(source["index_query_plan_candidate"] == BASE_CANDIDATE.relative_to(ROOT).as_posix(), "base candidate path drifted")
    require(source["synthetic_parent_mutation_harness"] == SQL.relative_to(ROOT).as_posix(), "harness path drifted")
    require(source["live_capture_mode"] == "aggregate_catalog_only_read_only_transaction", "live capture mode drifted")
    require(source["postgres_harness_major"] == 17, "PostgreSQL major drifted")
    require(source["transaction_local_scan_function"] == "pg_stat_get_xact_numscans(oid)", "xact scan function drifted")

    live = config["live_fk_contract"]
    require(live["child_table"] == "public.nav_deal_answers_v2", "live child table drifted")
    require(live["parent_table"] == "public.nav_deals_v2", "live parent table drifted")
    require(live["constraint"] == "nav_deal_answers_v2_deal_id_fkey", "live FK name drifted")
    require(live["update_action"] == "NO ACTION" and live["delete_action"] == "CASCADE", "live FK actions drifted")
    require("ON DELETE CASCADE" in live["definition"], "live FK definition lost CASCADE")
    require(live["validated"] is True, "live FK validation state drifted")
    require(live["deferrable"] is False and live["initially_deferred"] is False, "live FK deferrability drifted")

    single = live["single_column_index"]
    prefix = live["composite_prefix_index"]
    require(single["name"] == "nav_deal_answers_v2_deal_idx", "single index drifted")
    require(single["idx_scan"] == 0 and single["size_bytes"] == 16384, "single index snapshot drifted")
    require(prefix["name"] == "nav_deal_answers_v2_deal_id_question_key_key", "composite index drifted")
    require(prefix["idx_scan"] == 0 and prefix["size_bytes"] == 16384, "composite index snapshot drifted")
    require(prefix["deal_id_is_leading_prefix"] is True, "leading-prefix evidence missing")
    require(live["row_estimates"] == {"deals": 23, "answers": 7}, "aggregate row estimate drifted")
    require(live["statistics_reset"] is None, "statistics reset unexpectedly claimed")
    require(live["pii_returned"] is False, "live capture claims PII")
    require(live["data_mutated"] is False and live["ddl_executed"] is False, "live capture claims mutation")

    harness = config["synthetic_harness_contract"]
    require(harness["production_schema_used"] is False and harness["production_data_copied"] is False, "harness crossed production boundary")
    require(harness["synthetic_modes"] == ["single_and_composite_indexes", "composite_unique_index_only"], "modes drifted")
    require(harness["synthetic_deals_before_mutation"] == 5002, "synthetic deal count drifted")
    require(harness["synthetic_answers_per_deal"] == 20, "answers per deal drifted")
    require(harness["synthetic_answers_before_mutation"] == 100000, "synthetic answer count drifted")
    require(harness["parent_delete_cascade_cases"] == 2, "delete case count drifted")
    require(harness["unreferenced_parent_update_cases"] == 2, "successful update count drifted")
    require(harness["referenced_parent_update_rejection_cases"] == 2, "blocked update count drifted")
    require(harness["blocked_update_sqlstate_required"] == "23503", "blocked SQLSTATE drifted")
    require(harness["delete_action_mirrored"] == "CASCADE" and harness["update_action_mirrored"] == "NO ACTION", "synthetic FK actions drifted")
    for key in (
        "actual_parent_delete_explain_analyze",
        "actual_parent_update_explain_analyze",
        "explain_buffers",
        "explain_wal",
        "transaction_local_index_scan_attribution",
        "synthetic_index_size_capture",
        "validated_state_mirrored",
        "deferrable_state_mirrored",
        "mutation_semantics_equivalence_required",
        "rollback_required",
        "post_rollback_schema_absence_required",
    ):
        require(harness[key] is True, f"harness marker missing: {key}")
    require(harness["latency_superiority_asserted"] is False, "synthetic latency promoted to claim")

    result = config["result"]
    require(result["single_column_index_removed_in_production"] is False, "result claims production index removal")
    for key in (
        "synthetic_parent_mutations_supported_with_both_indexes",
        "synthetic_parent_mutations_supported_with_composite_prefix_only",
        "delete_cascade_semantics_equal",
        "unreferenced_update_semantics_equal",
        "referenced_update_rejected_in_both_modes",
        "composite_prefix_transaction_local_scans_observed",
    ):
        require(result[key] is True, f"hardened result missing: {key}")
    require(result["referenced_update_sqlstate"] == "23503", "result SQLSTATE drifted")
    require(
        result["decision"] == "synthetic_fk_parent_mutation_gap_hardened_production_drop_not_ready",
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

    require("begin;" in lower and "rollback;" in lower, "transaction rollback boundary missing")
    require("create schema harness" in lower, "isolated harness schema missing")
    require("public." not in lower, "executable SQL references production public schema")
    require("generate_series(1, 5002)" in sql, "synthetic parent generator drifted")
    require("generate_series(1, 5000)" in sql and "generate_series(1, 20)" in sql, "synthetic child generator drifted")
    require("on update no action" in lower and "on delete cascade" in lower, "synthetic FK actions missing")
    require("pg_stat_get_xact_numscans" in lower, "transaction-local index scan function missing")
    require("pg_stat_xact_user_indexes" not in lower, "nonexistent transaction-local index view remains")
    require("explain (analyze true, buffers true, wal true, format json)" in lower, "BUFFERS/WAL EXPLAIN missing")
    require("drop index harness.nav_deal_answers_v2_deal_idx" in lower, "synthetic single index removal missing")
    for case_id in (
        "delete_cascade_with_both_indexes",
        "update_unreferenced_with_both_indexes",
        "update_referenced_blocked_with_both_indexes",
        "delete_cascade_composite_only",
        "update_unreferenced_composite_only",
        "update_referenced_blocked_composite_only",
    ):
        require(case_id in sql, f"mutation case missing: {case_id}")
    require("sqlstate = '23503'" in lower, "FK rejection assertion missing")
    require("composite_scan_delta > 0" in lower, "composite scan attribution assertion missing")
    require("convalidated and not condeferrable and not condeferred" in lower, "FK state mirror assertion missing")
    require("latency_superiority_asserted', false" in lower, "no-latency-claim evidence missing")
    require("to_regnamespace('harness')" in lower, "post-rollback schema assertion missing")

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
        "Transaction-local index attribution",
        "Referenced parent update rejection",
        "BUFFERS and WAL evidence",
        "Production index drop remains blocked",
        "Production remains unchanged",
    ):
        require(marker in doc, f"documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*fk*parent*mutation*")]
    require(not leaked, f"FK mutation evidence leaked into migrations: {leaked}")

    print(
        "Navigator v2 hardened FK parent mutation evidence passed: six synthetic cases, "
        "transaction-local scan attribution, SQLSTATE 23503, BUFFERS/WAL and full rollback; "
        "production index removal remains blocked."
    )


if __name__ == "__main__":
    main()
