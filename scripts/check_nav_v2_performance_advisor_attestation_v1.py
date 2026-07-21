#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ATTESTATION = ROOT / "config/nav-v2-performance-advisor-attestation-v1.json"
PREFLIGHT = ROOT / "tests/sql/nav_v2_performance_readonly_preflight_v1.sql"
WORKFLOW = ROOT / ".github/workflows/nav-v2-performance-advisor-scope-v1.yml"
DOC = ROOT / "docs/NAV_V2_PERFORMANCE_ADVISOR_SCOPE_V1_2026-07-21.md"
MIGRATIONS = ROOT / "supabase/migrations"

EXPECTED_ZERO_SCAN_INDEXES = [
    "idx_nav_user_profiles_invited_by",
    "nav_deal_answers_v2_created_by_idx",
    "nav_deal_answers_v2_deal_idx",
    "nav_deal_comments_v2_author_id_idx",
    "nav_deal_comments_v2_deal_created_idx",
    "nav_deal_events_v2_actor_id_idx",
    "nav_deal_participants_v2_edit_lookup_idx",
    "nav_deal_participants_v2_view_lookup_idx",
    "nav_deal_reviews_v2_reviewer_id_idx",
    "nav_deal_risks_v2_resolved_by_idx",
    "nav_deal_tasks_v2_created_by_idx",
    "nav_user_profiles_manager_idx",
    "nav_user_profiles_role_idx",
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def executable_sql(text: str) -> str:
    return "\n".join(
        line for line in text.splitlines()
        if not line.strip().startswith("--")
    )


def main() -> None:
    for path in (ATTESTATION, PREFLIGHT, WORKFLOW, DOC):
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    attestation = json.loads(ATTESTATION.read_text(encoding="utf-8"))
    preflight = PREFLIGHT.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(attestation["schema_version"] == 1, "unexpected performance attestation schema")
    require(
        attestation["status"] == "repository_only_performance_advisor_attestation_not_ddl_approval",
        "performance attestation escaped repository-only boundary",
    )
    require(attestation["project_ref"] == "ofewxuqfjhamgerwzull", "performance project ref drifted")
    require(attestation["captured_at"] == "2026-07-21T13:38:36.766318+00:00", "performance capture timestamp drifted")
    require(attestation["source_main_sha"] == "0aee8cac9032e3cea8c6c89b2942d8570a98ad2f", "performance source main drifted")
    require(
        attestation["source"]["readonly_preflight_sql"] == PREFLIGHT.relative_to(ROOT).as_posix(),
        "performance preflight path drifted",
    )
    require(attestation["source"]["capture_mode"] == "aggregate_only_read_only_transaction", "capture mode drifted")

    scope = attestation["scope"]
    require(scope["schema"] == "public", "performance scope schema drifted")
    require(scope["table_count"] == 11, "performance scope table count drifted")
    require(scope["legacy_nav_tables_included"] is False, "legacy nav tables entered v2 performance scope")
    require(set(scope["excluded_prefixes"]) == {"leader_", "parket_", "broker_"}, "excluded subsystem scope drifted")

    summary = attestation["summary"]
    expected_summary = {
        "index_count": 53,
        "foreign_key_count": 29,
        "foreign_keys_without_covering_index": 0,
        "policy_count": 32,
        "policies_with_select_wrapped_auth": 32,
        "policies_with_direct_auth_call": 0,
        "zero_scan_nonconstraint_indexes": 13,
        "zero_scan_fk_support_indexes": 12,
        "zero_scan_non_fk_indexes": 1,
        "zero_scan_total_bytes": 212992,
    }
    for key, value in expected_summary.items():
        require(summary.get(key) == value, f"performance summary drifted: {key}")
    require(summary["database_stats_reset"] is None, "database stats reset unexpectedly attested")
    require(summary["observation_window_proven"] is False, "performance observation window was falsely proven")

    indexes = attestation["zero_scan_indexes"]
    require(len(indexes) == 13, "zero-scan index inventory count drifted")
    names = sorted(item["index"] for item in indexes)
    require(names == EXPECTED_ZERO_SCAN_INDEXES, "zero-scan index inventory drifted")
    require(len(names) == len(set(names)), "zero-scan index inventory contains duplicates")
    require(sum(item["bytes"] for item in indexes) == 212992, "zero-scan index byte total drifted")
    require(sum(1 for item in indexes if item["supports_foreign_key"]) == 12, "zero-scan FK support count drifted")
    non_fk = [item for item in indexes if not item["supports_foreign_key"]]
    require(len(non_fk) == 1, "zero-scan non-FK inventory drifted")
    require(non_fk[0]["index"] == "nav_user_profiles_role_idx", "unexpected non-FK zero-scan index")
    for item in indexes:
        require(item["bytes"] > 0, f"invalid index size: {item['index']}")
        require(item["decision"].startswith(("retain_", "review_only_retain_")), f"index removal was authorized: {item['index']}")

    rls = attestation["rls_policy_evidence"]
    require(rls["all_scope_tables_have_rls"] is True, "scope table lost RLS")
    require(rls["policy_count"] == 32, "RLS policy count drifted")
    require(rls["select_wrapped_auth_count"] == 32, "SELECT-wrapped auth policy count drifted")
    require(rls["direct_auth_call_count"] == 0, "direct per-row auth call appeared")
    require(rls["automatic_policy_rewrite_allowed"] is False, "automatic RLS rewrite was allowed")

    decision = attestation["decision_policy"]
    require(decision["never_auto_drop_index_from_idx_scan_zero"] is True, "zero-scan auto-drop protection missing")
    require(decision["never_auto_rewrite_rls_from_project_wide_advisor"] is True, "RLS auto-rewrite protection missing")
    require(decision["never_treat_other_subsystem_warnings_as_navigator_work"] is True, "shared-project scope boundary missing")
    required_evidence = set(decision["required_before_index_removal"])
    for marker in (
        "known statistics reset timestamp or controlled observation start",
        "representative authenticated workload observation",
        "EXPLAIN ANALYZE before and after on affected queries",
        "foreign-key parent update/delete impact review",
        "authenticated regression test",
        "exact rollback SQL",
        "separate owner approval for production DDL",
    ):
        require(marker in required_evidence, f"index removal evidence missing: {marker}")

    safety = attestation["safety"]
    require(safety["transaction_read_only"] is True and safety["aggregate_only"] is True, "performance capture was not read-only aggregate-only")
    for key in (
        "data_mutated",
        "ddl_executed",
        "index_dropped",
        "policy_changed",
        "rls_changed",
        "production_change_authorized",
    ):
        require(safety[key] is False, f"performance safety flag must remain false: {key}")

    stops = set(attestation["active_stops"])
    for stop in (
        "statistics_reset_timestamp_unknown",
        "representative_workload_window_missing",
        "authenticated_query_plan_evidence_missing",
        "fk_parent_update_delete_benchmark_missing",
        "index_removal_owner_approval_missing",
        "production_ddl_not_approved",
    ):
        require(stop in stops, f"performance active stop missing: {stop}")

    sql = executable_sql(preflight)
    require("begin transaction read only;" in sql.lower(), "performance preflight lacks read-only transaction")
    require("rollback;" in sql.lower(), "performance preflight lacks rollback")
    forbidden_sql = re.compile(
        r"\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|comment|copy|call|do)\b",
        re.I,
    )
    require(not forbidden_sql.search(sql), "performance preflight contains DDL or DML")
    for marker in (
        "pg_stat_user_indexes",
        "pg_relation_size",
        "supports_foreign_key",
        "foreign_keys_without_covering_index",
        "select_wrapped_auth_count",
        "direct_auth_call_count",
        "idx_scan_zero_is_drop_approval",
        "aggregate_only",
        "data_mutated",
        "ddl_executed",
    ):
        require(marker in preflight, f"performance preflight marker missing: {marker}")

    for marker in (
        "check_nav_v2_performance_advisor_attestation_v1.py",
        "nav-v2-performance-advisor-attestation-v1.json",
        "nav-v2-performance-readonly-preflight-v1.sql",
        "actions/upload-artifact@v4",
    ):
        require(marker in workflow, f"performance workflow marker missing: {marker}")
    for forbidden in (
        "supabase db push",
        "supabase functions deploy",
        "apply_migration",
        "create_branch",
        "confirm_cost",
    ):
        require(forbidden not in workflow.lower(), f"performance workflow contains cloud mutation marker: {forbidden}")

    for marker in (
        "Performance Advisor",
        "Read-only evidence",
        "Zero-scan classification",
        "RLS evidence",
        "No automatic DDL",
        "Active stops",
        "Production remains unchanged",
    ):
        require(marker in doc, f"performance documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*performance*advisor*")]
    require(not leaked, f"performance Advisor work leaked into migrations: {leaked}")

    print(
        "Navigator v2 Performance Advisor scope passed: "
        "11 tables, 53 indexes, 29/29 foreign keys covered, 32/32 SELECT-wrapped Auth policies, "
        "13 zero-scan indexes retained pending workload evidence; no DDL authorized."
    )


if __name__ == "__main__":
    main()
