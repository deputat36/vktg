#!/usr/bin/env python3
"""Validate the Navigator v2 observation delta evaluator source contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config/nav-v2-index-observation-delta-evaluator-v1.json"
EVALUATOR_PATH = ROOT / "scripts/evaluate_nav_v2_index_observation_delta_v1.py"
WORKFLOW_PATH = ROOT / ".github/workflows/nav-v2-index-observation-delta-evaluator-v1.yml"
DOC_PATH = ROOT / "docs/NAV_V2_INDEX_OBSERVATION_DELTA_EVALUATOR_V1_2026-07-22.md"


def fail(message: str) -> None:
    raise SystemExit(f"observation delta evaluator contract failed: {message}")


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


def main() -> None:
    for path in (CONFIG_PATH, EVALUATOR_PATH, WORKFLOW_PATH, DOC_PATH):
        require(path.is_file(), f"missing file: {path.relative_to(ROOT)}")

    config = load_json(CONFIG_PATH)
    require(config.get("schema_version") == 1, "unexpected schema_version")
    require(
        config.get("status")
        == "repository_only_observation_delta_evaluator_not_automatic_index_decision",
        "unexpected status",
    )
    require(config.get("project_ref") == "ofewxuqfjhamgerwzull", "wrong project_ref")
    require(
        config.get("source_main_sha")
        == "f361c1ce3e0a454b9ddddb78e25b974ed34553a5",
        "wrong source_main_sha",
    )

    for key in (
        "production_applied",
        "production_ddl_authorized",
        "production_dml_authorized",
        "cloud_execution_allowed",
    ):
        require(config.get(key) is False, f"{key} must remain false")

    required_sources = {
        "observation_window": "config/nav-v2-index-observation-window-v1.json",
        "capacity_input_form": "config/nav-v2-index-capacity-input-decision-v1.json",
        "evaluator": "scripts/evaluate_nav_v2_index_observation_delta_v1.py",
    }
    require(config.get("source_evidence") == required_sources, "source evidence mismatch")
    for relative_path in required_sources.values():
        require((ROOT / relative_path).is_file(), f"missing source: {relative_path}")

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
        candidate.get("decision_before_evaluator") == "review_possible_redundancy_only"
        and candidate.get("decision_after_evaluator") == "review_possible_redundancy_only",
        "evaluator must not change the candidate decision",
    )

    input_contract = config.get("input_contract", {})
    require(input_contract.get("baseline_json_required") is True, "baseline must be required")
    require(input_contract.get("current_json_required") is True, "current must be required")
    for key in ("business_rows_allowed", "pii_allowed", "query_text_allowed"):
        require(input_contract.get(key) is False, f"{key} must remain false")
    require(
        input_contract.get("production_query_execution_performed_by_evaluator") is False,
        "evaluator must remain offline",
    )

    required_epoch_checks = {
        "same_database_oid",
        "same_postmaster_started_at",
        "same_database_stats_reset_value",
        "same_wal_stats_reset_value",
        "same_table_oid",
        "same_candidate_index_oids",
        "same_candidate_index_definitions",
        "candidate_indexes_valid_and_ready",
    }
    require(set(config.get("epoch_checks", [])) == required_epoch_checks, "epoch checks mismatch")

    valid = config.get("valid_report_contract", {})
    require(
        valid.get("decision") == "delta_valid_same_epoch_evidence_not_representative",
        "valid decision drift",
    )
    require(valid.get("window_valid") is True, "valid window flag drift")
    for key in (
        "representative_authenticated_workload_proven",
        "production_index_removal_ready",
        "global_wal_attributable_to_candidate",
        "automatic_ddl_decision",
    ):
        require(valid.get(key) is False, f"valid report {key} must remain false")

    invalid = config.get("invalid_report_contract", {})
    require(
        invalid.get("decision")
        == "observation_window_invalidated_restart_capture_required",
        "invalid decision drift",
    )
    require(invalid.get("window_valid") is False, "invalid window flag drift")
    require(invalid.get("deltas_trusted") is False, "invalid deltas must not be trusted")
    require(invalid.get("production_index_removal_ready") is False, "invalid report cannot approve removal")

    require(len(config.get("self_test_matrix", [])) == 11, "self-test matrix must contain 11 cases")

    decision = config.get("decision_policy", {})
    for key in (
        "positive_single_index_scan_delta_does_not_prove_latency_necessity",
        "zero_single_index_scan_delta_does_not_prove_redundancy",
        "global_wal_delta_not_attributable_to_candidate",
        "table_write_deltas_are_not_candidate_index_write_cost",
        "valid_delta_does_not_prove_representative_workload",
        "valid_delta_does_not_authorize_benchmark",
        "valid_delta_does_not_authorize_index_drop",
        "separate_explain_benchmark_regression_migration_and_owner_approval_required",
    ):
        require(decision.get(key) is True, f"decision policy {key} must remain true")

    result = config.get("result", {})
    require(
        result.get("decision") == "observation_delta_evaluator_prepared_offline_only",
        "wrong result decision",
    )
    require(result.get("evaluator_prepared") is True, "evaluator must be prepared")
    for key in (
        "production_capture_executed",
        "observation_window_completed",
        "production_index_removal_ready",
    ):
        require(result.get(key) is False, f"result {key} must remain false")

    evaluator = EVALUATOR_PATH.read_text(encoding="utf-8")
    evaluator_lower = evaluator.lower()
    for required_fragment in (
        "delta_valid_same_epoch_evidence_not_representative",
        "observation_window_invalidated_restart_capture_required",
        "postmaster_restart",
        "database_stats_reset_changed",
        "wal_stats_reset_changed",
        "candidate_index_oid_changed",
        "candidate_index_definition_changed",
        "counter_decreased",
        "query_text_or_user_data_captured",
        "--self-test",
    ):
        require(required_fragment in evaluator, f"evaluator missing: {required_fragment}")
    for forbidden_fragment in (
        "import requests",
        "import psycopg",
        "import supabase",
        "urllib.request",
        "subprocess",
        "socket",
        "http://",
        "https://",
    ):
        require(forbidden_fragment not in evaluator_lower, f"evaluator contains network/action dependency: {forbidden_fragment}")

    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    workflow_lower = workflow.lower()
    require("permissions:\n  contents: read" in workflow_lower, "workflow permissions must be read-only")
    for required_fragment in (
        "python3 scripts/check_nav_v2_index_observation_delta_evaluator_v1.py",
        "python3 scripts/evaluate_nav_v2_index_observation_delta_v1.py --self-test",
    ):
        require(required_fragment in workflow, f"workflow missing: {required_fragment}")
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
        "observation_delta_evaluator_prepared_offline_only",
        "delta_valid_same_epoch_evidence_not_representative",
        "observation_window_invalidated_restart_capture_required",
        "production_index_removal_ready=false",
        "offline",
        "exit code",
    ):
        require(required_fragment.lower() in doc.lower(), f"documentation missing: {required_fragment}")

    print("Navigator v2 observation delta evaluator source contract passed")


if __name__ == "__main__":
    main()
