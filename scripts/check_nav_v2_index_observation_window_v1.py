#!/usr/bin/env python3
"""Validate the Navigator v2 index observation-window source contract."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config/nav-v2-index-observation-window-v1.json"
SQL_PATH = ROOT / "tests/sql/nav_v2_index_observation_window_readonly_capture_v1.sql"
WORKFLOW_PATH = ROOT / ".github/workflows/nav-v2-index-observation-window-v1.yml"
DOC_PATH = ROOT / "docs/NAV_V2_INDEX_OBSERVATION_WINDOW_V1_2026-07-22.md"


def fail(message: str) -> None:
    raise SystemExit(f"observation-window contract failed: {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing file: {path.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")


def require_file(path: Path) -> None:
    require(path.is_file(), f"missing file: {path.relative_to(ROOT)}")


def main() -> None:
    for path in (CONFIG_PATH, SQL_PATH, WORKFLOW_PATH, DOC_PATH):
        require_file(path)

    config = load_json(CONFIG_PATH)

    require(config.get("schema_version") == 1, "unexpected schema_version")
    require(
        config.get("status")
        == "repository_only_index_observation_window_started_not_index_drop_approval",
        "unexpected status",
    )
    require(config.get("project_ref") == "ofewxuqfjhamgerwzull", "wrong project_ref")
    require(
        config.get("source_main_sha")
        == "f62c5cc82f30275c0275bb70fd487a32cd0367e5",
        "wrong source_main_sha",
    )

    false_flags = (
        "production_applied",
        "production_ddl_authorized",
        "production_dml_authorized",
        "cloud_execution_allowed",
        "statistics_settings_change_authorized",
        "statistics_reset_authorized",
    )
    for key in false_flags:
        require(config.get(key) is False, f"{key} must remain false")

    sources = config.get("source_evidence", {})
    required_sources = {
        "performance_advisor_attestation": "config/nav-v2-performance-advisor-attestation-v1.json",
        "query_to_index_mapping": "config/nav-v2-query-to-index-mapping-v1.json",
        "synthetic_fk_evidence": "config/nav-v2-index-fk-parent-mutation-evidence-v1.json",
        "synthetic_write_storage_evidence": "config/nav-v2-index-write-storage-measurement-v1.json",
        "production_scale_benchmark_plan": "config/nav-v2-production-scale-fk-benchmark-plan-v1.json",
        "readonly_capture_template": "tests/sql/nav_v2_index_observation_window_readonly_capture_v1.sql",
    }
    require(sources == required_sources, "source_evidence must be exact")
    for relative_path in required_sources.values():
        require_file(ROOT / relative_path)

    candidate = config.get("candidate", {})
    require(candidate.get("table") == "public.nav_deal_answers_v2", "wrong candidate table")
    require(
        candidate.get("single_column_index") == "nav_deal_answers_v2_deal_idx",
        "wrong single-column index",
    )
    require(
        candidate.get("composite_unique_index")
        == "nav_deal_answers_v2_deal_id_question_key_key",
        "wrong composite index",
    )
    require(candidate.get("leading_prefix") == "deal_id", "wrong leading prefix")
    require(
        candidate.get("decision_before_window") == "review_possible_redundancy_only"
        and candidate.get("decision_after_baseline") == "review_possible_redundancy_only",
        "baseline must not change the index decision",
    )

    baseline = config.get("live_baseline", {})
    require(
        baseline.get("capture_mode")
        == "aggregate_catalog_statistics_only_read_only_transaction",
        "wrong capture mode",
    )
    require(baseline.get("transaction_read_only") is True, "baseline must be read-only")
    require(baseline.get("server_version_num") == 170006, "unexpected server version")
    require(baseline.get("track_counts") is True, "track_counts must be true")
    require(baseline.get("business_rows_returned") is False, "business rows must not be returned")
    require(baseline.get("pii_returned") is False, "PII must not be returned")
    require(baseline.get("data_mutated") is False, "baseline must not mutate data")
    require(baseline.get("ddl_executed") is False, "baseline must not execute DDL")
    require(
        baseline.get("statistics_reset_performed") is False,
        "baseline must not reset statistics",
    )

    database = baseline.get("database", {})
    require(database.get("database_oid") == 5, "unexpected database OID")
    require(database.get("stats_reset") is None, "database stats_reset must remain recorded as null")

    wal = baseline.get("wal", {})
    require(wal.get("attributable_to_candidate") is False, "global WAL must not be attributed")
    require(bool(wal.get("stats_reset")), "WAL stats_reset must be recorded")

    table = baseline.get("table", {})
    require(table.get("table_oid") == 19392, "unexpected table OID")
    require(table.get("heap_bytes") == 8192, "unexpected baseline heap size")
    require(table.get("total_bytes") == 81920, "unexpected baseline total size")

    indexes = baseline.get("indexes", [])
    require(len(indexes) == 2, "exactly two candidate indexes must be captured")
    by_name = {item.get("index_name"): item for item in indexes}
    require(
        set(by_name)
        == {
            "nav_deal_answers_v2_deal_idx",
            "nav_deal_answers_v2_deal_id_question_key_key",
        },
        "candidate index inventory mismatch",
    )
    for name, item in by_name.items():
        require(item.get("is_valid") is True, f"{name} must be valid")
        require(item.get("is_ready") is True, f"{name} must be ready")
        require(item.get("size_bytes") == 16384, f"unexpected baseline size for {name}")
    require(by_name["nav_deal_answers_v2_deal_idx"].get("is_unique") is False, "single index uniqueness drift")
    require(
        by_name["nav_deal_answers_v2_deal_id_question_key_key"].get("is_unique") is True,
        "composite uniqueness drift",
    )

    extensions = baseline.get("extensions", {})
    require(extensions.get("pg_stat_statements_installed") is True, "pg_stat_statements presence must be recorded")
    require(
        extensions.get("query_text_or_user_data_captured") is False,
        "query text or user data must not be captured",
    )

    window = config.get("observation_window", {})
    require(
        window.get("status") == "started_baseline_captured_representativeness_unproven",
        "wrong observation-window status",
    )
    require(window.get("baseline_capture_count") == 1, "baseline capture count must be one")
    require(window.get("minimum_capture_count") == 2, "at least two captures are required")
    require(window.get("end_capture") is None, "end capture must be unresolved")
    require(window.get("completed") is False, "window must remain incomplete")
    require(
        window.get("representative_authenticated_workload_proven") is False,
        "representative workload must remain unproven",
    )
    require(window.get("index_removal_ready") is False, "index removal must not be ready")

    epoch = config.get("epoch_identity", {})
    require(epoch.get("same_epoch_required_for_delta") is True, "same epoch must be required")
    require(epoch.get("database_oid") == database.get("database_oid"), "database epoch mismatch")
    require(epoch.get("table_oid") == table.get("table_oid"), "table epoch mismatch")
    require(
        epoch.get("postmaster_started_at") == baseline.get("postmaster_started_at"),
        "postmaster epoch mismatch",
    )
    require(epoch.get("database_stats_reset") == database.get("stats_reset"), "database reset mismatch")
    require(epoch.get("wal_stats_reset") == wal.get("stats_reset"), "WAL reset mismatch")

    capture_policy = config.get("capture_policy", {})
    require(capture_policy.get("automatic_capture_enabled") is False, "automatic capture must be disabled")
    require(capture_policy.get("selected_cadence") is None, "capture cadence must remain unresolved")
    require(capture_policy.get("cadence_may_not_be_guessed") is True, "cadence must not be guessed")
    for key in (
        "exact_business_row_counts_forbidden",
        "business_rows_forbidden",
        "pii_forbidden",
        "query_text_capture_forbidden",
        "statistics_reset_forbidden",
        "statistics_settings_change_forbidden",
        "synthetic_workload_on_production_forbidden",
    ):
        require(capture_policy.get(key) is True, f"{key} must remain true")

    thresholds = config.get("completion_thresholds", {})
    unresolved_thresholds = (
        "approved_minimum_calendar_days",
        "approved_minimum_authenticated_sessions",
        "approved_minimum_candidate_index_reads",
        "approved_minimum_candidate_table_writes",
        "approved_minimum_parent_mutations",
    )
    for key in unresolved_thresholds:
        require(thresholds.get(key) is None, f"{key} must remain unresolved")
    require(thresholds.get("thresholds_may_not_be_guessed") is True, "thresholds must not be guessed")
    require(
        thresholds.get("owner_or_release_manager_approval_required") is True,
        "threshold approval must remain required",
    )

    required_delta_rules = {
        "same_database_oid",
        "same_postmaster_started_at",
        "same_database_stats_reset_value",
        "same_wal_stats_reset_value",
        "same_table_oid",
        "same_candidate_index_oids",
        "same_candidate_index_definitions",
        "all_monotonic_counters_non_decreasing",
        "no_candidate_schema_or_index_ddl_during_window",
        "no_statistics_reset_or_settings_change_during_window",
    }
    require(set(config.get("delta_validity_rules", [])) == required_delta_rules, "delta validity rules mismatch")

    required_invalidations = {
        "postmaster_restart",
        "database_stats_reset_value_changed",
        "wal_stats_reset_value_changed",
        "any_candidate_counter_decreased",
        "candidate_table_or_index_oid_changed",
        "candidate_index_definition_changed",
        "candidate_index_validity_or_readiness_changed",
        "candidate_schema_migration_detected",
        "capture_contains_business_rows_pii_or_query_text",
    }
    require(
        set(config.get("window_invalidation_rules", [])) == required_invalidations,
        "window invalidation rules mismatch",
    )

    decision = config.get("decision_policy", {})
    for key in (
        "idx_scan_zero_never_proves_redundancy",
        "positive_idx_scan_never_proves_latency_necessity",
        "global_wal_delta_not_attributable_to_candidate",
        "observation_window_alone_cannot_authorize_drop",
        "production_explain_analyze_still_required",
        "authenticated_regression_still_required",
        "production_scale_benchmark_still_required",
        "exact_forward_and_rollback_migration_still_required",
        "separate_owner_production_ddl_approval_still_required",
    ):
        require(decision.get(key) is True, f"decision policy {key} must remain true")

    result = config.get("result", {})
    require(
        result.get("decision")
        == "observation_window_baseline_started_evidence_not_yet_representative",
        "wrong result decision",
    )
    require(result.get("baseline_captured") is True, "baseline must be captured")
    require(result.get("window_completed") is False, "window must not be completed")
    require(result.get("production_index_removal_ready") is False, "removal must not be ready")
    require(result.get("production_ddl_approved") is False, "DDL must not be approved")

    required_stops = {
        "observation_cadence_not_selected",
        "completion_thresholds_not_approved",
        "end_capture_missing",
        "representative_authenticated_workload_missing",
        "production_explain_analyze_missing",
        "production_scale_benchmark_execution_missing",
        "authenticated_regression_missing",
        "production_migration_missing",
        "owner_ddl_approval_missing",
    }
    require(set(config.get("active_stops", [])) == required_stops, "active stops mismatch")

    sql = SQL_PATH.read_text(encoding="utf-8")
    sql_lower = sql.lower()
    required_sql_fragments = (
        "begin transaction read only",
        "rollback;",
        "pg_postmaster_start_time()",
        "pg_stat_database",
        "pg_stat_wal",
        "pg_stat_all_tables",
        "pg_stat_all_indexes",
        "pg_get_indexdef",
        "nav_deal_answers_v2_deal_idx",
        "nav_deal_answers_v2_deal_id_question_key_key",
        "business_rows_returned",
        "pii_returned",
        "statistics_reset_performed",
    )
    for fragment in required_sql_fragments:
        require(fragment in sql_lower, f"SQL missing required fragment: {fragment}")

    forbidden_statement = re.compile(
        r"(?mi)^\s*(insert|update|delete|merge|alter|drop|create|truncate|vacuum|analyze|reindex|cluster|grant|revoke|call|do|set)\b"
    )
    match = forbidden_statement.search(sql)
    require(match is None, f"SQL contains forbidden statement: {match.group(1) if match else ''}")
    for forbidden_fragment in (
        "pg_stat_reset",
        "pg_stat_statements_reset",
        "from public.nav_deal_answers_v2",
        "join public.nav_deal_answers_v2",
        "count(*)",
        "pg_stat_statements p",
        "queryid",
        "userid",
        "query text",
    ):
        require(forbidden_fragment not in sql_lower, f"SQL contains forbidden fragment: {forbidden_fragment}")

    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    workflow_lower = workflow.lower()
    require("permissions:\n  contents: read" in workflow_lower, "workflow permissions must be read-only")
    require(
        "python3 scripts/check_nav_v2_index_observation_window_v1.py" in workflow,
        "workflow must run the validator",
    )
    for forbidden_fragment in (
        "psql ",
        "supabase ",
        "execute_sql",
        "apply_migration",
        "confirm_cost",
        "docker ",
        "curl ",
        "gh ",
    ):
        require(forbidden_fragment not in workflow_lower, f"workflow executes forbidden action: {forbidden_fragment}")

    doc = DOC_PATH.read_text(encoding="utf-8")
    for required_doc_fragment in (
        "observation_window_baseline_started_evidence_not_yet_representative",
        "statistics_reset_authorized=false",
        "selected_cadence=null",
        "production_index_removal_ready=false",
        "production database",
        "read only",
    ):
        require(required_doc_fragment.lower() in doc.lower(), f"documentation missing: {required_doc_fragment}")

    print("Navigator v2 index observation-window source contract passed")


if __name__ == "__main__":
    main()
