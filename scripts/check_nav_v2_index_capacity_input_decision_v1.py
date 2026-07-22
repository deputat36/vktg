#!/usr/bin/env python3
"""Validate the Navigator v2 capacity-input decision form contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config/nav-v2-index-capacity-input-decision-v1.json"
WORKFLOW_PATH = ROOT / ".github/workflows/nav-v2-index-capacity-input-decision-v1.yml"
DOC_PATH = ROOT / "docs/NAV_V2_INDEX_CAPACITY_INPUT_DECISION_V1_2026-07-22.md"


def fail(message: str) -> None:
    raise SystemExit(f"capacity-input decision contract failed: {message}")


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
    for path in (CONFIG_PATH, WORKFLOW_PATH, DOC_PATH):
        require_file(path)

    config = load_json(CONFIG_PATH)

    require(config.get("schema_version") == 1, "unexpected schema_version")
    require(
        config.get("status")
        == "repository_only_capacity_input_decision_form_unsubmitted_execution_blocked",
        "unexpected status",
    )
    require(config.get("project_ref") == "ofewxuqfjhamgerwzull", "wrong project_ref")
    require(
        config.get("source_main_sha")
        == "ec73826983207241f1e1d87ff6697757fdacee17",
        "wrong source_main_sha",
    )

    for key in (
        "production_applied",
        "production_ddl_authorized",
        "production_dml_authorized",
        "cloud_execution_allowed",
        "benchmark_execution_authorized",
    ):
        require(config.get(key) is False, f"{key} must remain false")

    required_sources = {
        "benchmark_plan": "config/nav-v2-production-scale-fk-benchmark-plan-v1.json",
        "observation_window": "config/nav-v2-index-observation-window-v1.json",
        "query_to_index_mapping": "config/nav-v2-query-to-index-mapping-v1.json",
        "synthetic_write_storage_evidence": "config/nav-v2-index-write-storage-measurement-v1.json",
    }
    require(config.get("source_evidence") == required_sources, "source_evidence must be exact")
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
    require(
        candidate.get("decision_before_form") == "review_possible_redundancy_only"
        and candidate.get("decision_after_form") == "review_possible_redundancy_only",
        "form must not change the index decision",
    )

    form = config.get("decision_form", {})
    require(form.get("status") == "unsubmitted", "form must remain unsubmitted")
    for key in ("submitted_by", "submitted_at", "reviewed_by", "reviewed_at"):
        require(form.get(key) is None, f"{key} must remain null")
    require(form.get("owner_approved") is False, "owner approval must remain false")
    require(form.get("release_manager_approved") is False, "release manager approval must remain false")
    require(form.get("values_may_not_be_guessed") is True, "values must not be guessed")
    require(
        form.get("partial_submission_authorizes_execution") is False,
        "partial submission must not authorize execution",
    )
    require(
        form.get("completed_form_authorizes_execution") is False,
        "completed form alone must not authorize execution",
    )

    fixed = config.get("fixed_context", {})
    require(fixed.get("planning_horizon_months") == 12, "planning horizon drift")
    require(fixed.get("postgres_major") == 17, "PostgreSQL major drift")
    require(fixed.get("production_database_allowed") is False, "production database must be forbidden")
    require(fixed.get("production_rows_copy_allowed") is False, "production row copy must be forbidden")
    require(fixed.get("real_accounts_allowed") is False, "real accounts must be forbidden")
    require(fixed.get("direct_identifiers_allowed") is False, "direct identifiers must be forbidden")
    require(fixed.get("maximum_preview_branch_lifetime_hours") == 6, "preview lifetime drift")

    inputs = config.get("inputs", {})
    required_input_names = {
        "selected_environment",
        "target_scale_source",
        "approved_target_deals",
        "approved_target_answers",
        "approved_answers_per_deal_distribution",
        "approved_peak_concurrency",
        "approved_concurrency_headroom",
        "approved_branch_compute_class",
        "approved_max_runtime_minutes",
        "selected_observation_cadence",
        "approved_minimum_observation_days",
        "approved_minimum_authenticated_sessions",
        "approved_minimum_candidate_index_reads",
        "approved_minimum_candidate_table_writes",
        "approved_minimum_parent_mutations",
    }
    require(set(inputs) == required_input_names, "input inventory mismatch")
    for name, item in inputs.items():
        require(item.get("value") is None, f"{name} value must remain null")

    require(
        inputs["selected_environment"].get("allowed_values")
        == [
            "isolated_ephemeral_postgresql_17",
            "owner_and_cost_approved_disposable_supabase_preview_branch",
        ],
        "environment options drift",
    )
    require(
        inputs["target_scale_source"].get("allowed_values")
        == [
            "owner_capacity_forecast",
            "approved_non_pii_aggregate_observation",
            "max_of_owner_forecast_and_approved_observation",
        ],
        "scale source options drift",
    )
    require(
        inputs["selected_observation_cadence"].get("allowed_values")
        == ["daily", "weekly", "before_and_after_known_release"],
        "observation cadence options drift",
    )

    distribution = inputs["approved_answers_per_deal_distribution"]
    require(
        distribution.get("required_fields") == ["p50", "p95", "max_bounded"],
        "distribution fields drift",
    )
    require(
        distribution.get("ordering_rule") == "p50_lte_p95_lte_max_bounded",
        "distribution ordering rule drift",
    )

    cost = config.get("preview_cost_gate", {})
    for key in (
        "amount",
        "currency",
        "recurrence",
        "cost_confirmation_id",
        "automatic_delete_deadline",
    ):
        require(cost.get(key) is None, f"cost gate {key} must remain null")
    for key in (
        "cost_rechecked",
        "shown_to_owner",
        "explicit_owner_cost_approval",
    ):
        require(cost.get(key) is False, f"cost gate {key} must remain false")
    require(cost.get("historical_cost_may_not_be_reused") is True, "historical cost reuse must be forbidden")

    submission = config.get("submission_validation", {})
    require(submission, "submission validation is required")
    for key, value in submission.items():
        require(value is False, f"submission validation {key} must remain false")

    decision = config.get("decision_policy", {})
    for key in (
        "form_does_not_select_values",
        "form_does_not_confirm_cost",
        "form_does_not_create_environment",
        "form_does_not_run_benchmark",
        "form_does_not_authorize_production_dml",
        "form_does_not_authorize_production_ddl",
        "zero_thresholds_if_selected_require_explicit_rationale",
        "successful_submission_does_not_imply_index_drop",
    ):
        require(decision.get(key) is True, f"decision policy {key} must remain true")

    result = config.get("result", {})
    require(
        result.get("decision")
        == "capacity_input_decision_form_prepared_unsubmitted_execution_blocked",
        "wrong result decision",
    )
    require(result.get("form_prepared") is True, "form must be prepared")
    for key in (
        "form_submitted",
        "inputs_approved",
        "benchmark_execution_ready",
        "production_index_removal_ready",
    ):
        require(result.get(key) is False, f"result {key} must remain false")

    required_stops = {
        "decision_form_unsubmitted",
        "selected_environment_missing",
        "approved_target_scale_missing",
        "approved_distribution_missing",
        "approved_concurrency_missing",
        "approved_runtime_missing",
        "observation_cadence_missing",
        "observation_completion_thresholds_missing",
        "preview_cost_gate_missing_if_preview_selected",
        "benchmark_execution_not_authorized",
        "authenticated_regression_missing",
        "production_migration_missing",
        "owner_ddl_approval_missing",
    }
    require(set(config.get("active_stops", [])) == required_stops, "active stops mismatch")

    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    workflow_lower = workflow.lower()
    require("permissions:\n  contents: read" in workflow_lower, "workflow permissions must be read-only")
    require(
        "python3 scripts/check_nav_v2_index_capacity_input_decision_v1.py" in workflow,
        "workflow must run the validator",
    )
    for forbidden_fragment in (
        "psql ",
        "supabase ",
        "execute_sql",
        "apply_migration",
        "confirm_cost",
        "create_branch",
        "docker ",
        "curl ",
        "gh ",
    ):
        require(forbidden_fragment not in workflow_lower, f"workflow executes forbidden action: {forbidden_fragment}")

    doc = DOC_PATH.read_text(encoding="utf-8")
    for required_fragment in (
        "capacity_input_decision_form_prepared_unsubmitted_execution_blocked",
        "selected_environment=null",
        "benchmark_execution_authorized=false",
        "production_index_removal_ready=false",
        "values are not selected",
        "fresh cost",
    ):
        require(required_fragment.lower() in doc.lower(), f"documentation missing: {required_fragment}")

    print("Navigator v2 capacity-input decision form source contract passed")


if __name__ == "__main__":
    main()
