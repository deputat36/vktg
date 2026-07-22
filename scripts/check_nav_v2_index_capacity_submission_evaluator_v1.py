#!/usr/bin/env python3
"""Validate the offline capacity submission evaluator and its fail-closed boundaries."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "config/nav-v2-index-capacity-input-decision-v1.json"
CONTRACT = ROOT / "config/nav-v2-index-capacity-submission-evaluator-v1.json"
EVALUATOR = ROOT / "scripts/evaluate_nav_v2_index_capacity_submission_v1.py"
WORKFLOW = ROOT / ".github/workflows/nav-v2-index-capacity-submission-evaluator-v1.yml"
DOC = ROOT / "docs/NAV_V2_INDEX_CAPACITY_SUBMISSION_EVALUATOR_V1_2026-07-22.md"

SUCCESS_DECISION = "capacity_submission_valid_separate_execution_authorization_required"
INPUT_DECISION = "capacity_submission_input_error"
INVALID_DECISION = "capacity_submission_invalid_or_incomplete"
ENVIRONMENT_DECISION = "capacity_submission_environment_or_cost_gate_invalid"
UNAUTHORIZED_DECISION = "capacity_submission_forbidden_authorization_claim"
CONTRACT_DECISION = "capacity_submission_evaluator_prepared_offline_canonical_form_unsubmitted"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def set_input(payload: dict[str, Any], name: str, value: Any) -> None:
    payload["inputs"][name]["value"] = value


def reviewed_submission(canonical: dict[str, Any], environment: str) -> dict[str, Any]:
    payload = copy.deepcopy(canonical)
    payload["decision_form"].update(
        {
            "status": "reviewed",
            "submitted_by": "owner",
            "submitted_at": "2026-07-22T12:00:00Z",
            "reviewed_by": "release_manager",
            "reviewed_at": "2026-07-22T12:10:00Z",
            "owner_approved": True,
            "release_manager_approved": True,
        }
    )

    set_input(payload, "selected_environment", environment)
    set_input(payload, "target_scale_source", "owner_capacity_forecast")
    set_input(payload, "approved_target_deals", 5000)
    set_input(payload, "approved_target_answers", 100000)
    set_input(
        payload,
        "approved_answers_per_deal_distribution",
        {"p50": 15, "p95": 25, "max_bounded": 40},
    )
    set_input(payload, "approved_peak_concurrency", 12)
    set_input(payload, "approved_concurrency_headroom", 4)
    set_input(payload, "approved_max_runtime_minutes", 30)
    set_input(payload, "selected_observation_cadence", "weekly")
    set_input(payload, "approved_minimum_observation_days", 14)
    set_input(payload, "approved_minimum_authenticated_sessions", 20)
    set_input(payload, "approved_minimum_candidate_index_reads", 1)
    set_input(payload, "approved_minimum_candidate_table_writes", 100)
    set_input(payload, "approved_minimum_parent_mutations", 10)
    payload["submission_rationale"] = {"zero_thresholds": {}}

    if environment == "owner_and_cost_approved_disposable_supabase_preview_branch":
        set_input(payload, "approved_branch_compute_class", "Micro")
        set_input(payload, "approved_max_runtime_minutes", 60)
        payload["preview_cost_gate"].update(
            {
                "cost_rechecked": True,
                "amount": 0.01344,
                "currency": "USD",
                "recurrence": "hourly",
                "shown_to_owner": True,
                "explicit_owner_cost_approval": True,
                "cost_confirmation_id": "synthetic-confirmation-reference",
                "automatic_delete_deadline": "2026-07-22T18:00:00Z",
            }
        )
    else:
        set_input(payload, "approved_branch_compute_class", None)

    payload["result"]["form_submitted"] = True
    payload["result"]["inputs_approved"] = True
    return payload


def run_case(
    temp: Path,
    name: str,
    payload: Any,
    expected_exit: int,
    expected_decision: str,
) -> dict[str, Any]:
    input_path = temp / f"{name}.json"
    output_path = temp / f"{name}.report.json"

    if isinstance(payload, str):
        input_path.write_text(payload, encoding="utf-8")
    else:
        input_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    completed = subprocess.run(
        [sys.executable, str(EVALUATOR), "--input", str(input_path), "--output", str(output_path)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    require(
        completed.returncode == expected_exit,
        f"{name}: expected exit {expected_exit}, got {completed.returncode}: {completed.stderr}",
    )
    require(output_path.is_file(), f"{name}: report missing")
    report = json.loads(output_path.read_text(encoding="utf-8"))
    require(report.get("decision") == expected_decision, f"{name}: decision drift")
    require(report.get("benchmark_execution_ready") is False, f"{name}: benchmark readiness must remain false")
    require(
        report.get("production_index_removal_ready") is False,
        f"{name}: production index readiness must remain false",
    )
    require(report.get("production_ddl_ready") is False, f"{name}: production DDL readiness must remain false")

    report_text = output_path.read_text(encoding="utf-8")
    require("synthetic-confirmation-reference" not in report_text, f"{name}: report echoed cost reference")
    require("release_manager" not in report_text, f"{name}: report echoed reviewer reference")
    require("@" not in report_text, f"{name}: report echoed email-like material")
    return report


def main() -> None:
    for path in (CANONICAL, CONTRACT, EVALUATOR, WORKFLOW, DOC):
        require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")

    canonical = json.loads(CANONICAL.read_text(encoding="utf-8"))
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    evaluator_source = EVALUATOR.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    docs = DOC.read_text(encoding="utf-8")

    # The canonical owner-decision form must remain untouched and unsubmitted.
    require(canonical.get("decision_form", {}).get("status") == "unsubmitted", "canonical form was submitted")
    require(canonical.get("decision_form", {}).get("owner_approved") is False, "canonical owner approval changed")
    require(
        canonical.get("decision_form", {}).get("release_manager_approved") is False,
        "canonical release approval changed",
    )
    require(
        all(item.get("value") is None for item in canonical.get("inputs", {}).values()),
        "canonical capacity values must remain null",
    )
    for flag in (
        "production_applied",
        "production_ddl_authorized",
        "production_dml_authorized",
        "cloud_execution_allowed",
        "benchmark_execution_authorized",
    ):
        require(canonical.get(flag) is False, f"canonical flag changed: {flag}")
    require(
        canonical.get("result", {}).get("benchmark_execution_ready") is False,
        "canonical benchmark readiness changed",
    )
    require(
        canonical.get("result", {}).get("production_index_removal_ready") is False,
        "canonical index readiness changed",
    )

    require(contract.get("schema_version") == 1, "contract schema drift")
    require(
        contract.get("status") == "repository_only_capacity_submission_evaluator_offline_no_values_selected",
        "contract status drift",
    )
    require(contract.get("canonical_form_must_remain_unsubmitted") is True, "canonical gate missing")
    require(contract.get("result", {}).get("decision") == CONTRACT_DECISION, "contract decision drift")
    require(len(contract.get("self_test_cases", [])) == 13, "thirteen self-test cases required")
    for flag in (
        "production_applied",
        "production_ddl_authorized",
        "production_dml_authorized",
        "cloud_execution_allowed",
        "benchmark_execution_authorized",
    ):
        require(contract.get(flag) is False, f"contract flag must remain false: {flag}")

    for marker in (
        "EXIT_INPUT_ERROR = 2",
        "EXIT_INVALID_FORM = 3",
        "EXIT_ENVIRONMENT_GATE_INVALID = 4",
        "EXIT_UNAUTHORIZED_CLAIM = 5",
        SUCCESS_DECISION,
        ENVIRONMENT_DECISION,
        UNAUTHORIZED_DECISION,
        "zero_threshold_rationale_missing",
        "preview_cost_confirmation_id_required",
        "preview_runtime_must_be_between_1_and_360_minutes",
    ):
        require(marker in evaluator_source, f"evaluator marker missing: {marker}")

    for prohibited_import in ("import requests", "import urllib", "import socket", "import supabase"):
        require(prohibited_import not in evaluator_source.lower(), f"evaluator network import found: {prohibited_import}")

    workflow_lower = workflow.lower()
    for prohibited in (
        "curl ",
        "wget ",
        "psql ",
        "supabase ",
        "execute_sql",
        "apply_migration",
        "confirm_cost",
        "create_branch",
        "deploy_edge_function",
        "docker ",
    ):
        require(prohibited not in workflow_lower, f"workflow contains prohibited token: {prohibited.strip()}")
    require("permissions:\n  contents: read" in workflow, "workflow permissions must remain read-only")
    require(
        "python3 scripts/check_nav_v2_index_capacity_submission_evaluator_v1.py" in workflow,
        "workflow must execute evaluator self-test",
    )

    with tempfile.TemporaryDirectory(prefix="nav-v2-capacity-submission-") as temp_dir:
        temp = Path(temp_dir)

        isolated = reviewed_submission(canonical, "isolated_ephemeral_postgresql_17")
        report = run_case(temp, "valid-isolated", isolated, 0, SUCCESS_DECISION)
        require(report.get("valid_form") is True, "isolated form must validate")
        require(report.get("environment_gate_valid") is True, "isolated environment gate must validate")
        require(report.get("completed_input_count") == 14, "isolated form should have 14 non-null values")

        preview = reviewed_submission(
            canonical,
            "owner_and_cost_approved_disposable_supabase_preview_branch",
        )
        report = run_case(temp, "valid-preview", preview, 0, SUCCESS_DECISION)
        require(report.get("valid_form") is True, "preview form must validate")
        require(report.get("environment_gate_valid") is True, "preview environment gate must validate")
        require(report.get("completed_input_count") == 15, "preview form should have 15 non-null values")

        missing = copy.deepcopy(isolated)
        set_input(missing, "approved_target_deals", None)
        run_case(temp, "missing-required", missing, 3, INVALID_DECISION)

        invalid_integer = copy.deepcopy(isolated)
        set_input(invalid_integer, "approved_peak_concurrency", 0)
        run_case(temp, "invalid-positive-integer", invalid_integer, 3, INVALID_DECISION)

        invalid_distribution = copy.deepcopy(isolated)
        set_input(
            invalid_distribution,
            "approved_answers_per_deal_distribution",
            {"p50": 30, "p95": 20, "max_bounded": 40},
        )
        run_case(temp, "invalid-distribution", invalid_distribution, 3, INVALID_DECISION)

        zero_without_rationale = copy.deepcopy(isolated)
        set_input(zero_without_rationale, "approved_minimum_authenticated_sessions", 0)
        run_case(temp, "zero-without-rationale", zero_without_rationale, 3, INVALID_DECISION)

        zero_with_rationale = copy.deepcopy(isolated)
        set_input(zero_with_rationale, "approved_minimum_authenticated_sessions", 0)
        zero_with_rationale["submission_rationale"]["zero_thresholds"][
            "approved_minimum_authenticated_sessions"
        ] = "Synthetic explicit rationale for a zero threshold."
        run_case(temp, "zero-with-rationale", zero_with_rationale, 0, SUCCESS_DECISION)

        preview_cost_missing = reviewed_submission(
            canonical,
            "owner_and_cost_approved_disposable_supabase_preview_branch",
        )
        preview_cost_missing["preview_cost_gate"].update(
            {
                "cost_rechecked": False,
                "amount": None,
                "currency": None,
                "recurrence": None,
                "shown_to_owner": False,
                "explicit_owner_cost_approval": False,
                "cost_confirmation_id": None,
                "automatic_delete_deadline": None,
            }
        )
        run_case(temp, "preview-cost-missing", preview_cost_missing, 4, ENVIRONMENT_DECISION)

        preview_runtime = copy.deepcopy(preview)
        set_input(preview_runtime, "approved_max_runtime_minutes", 361)
        run_case(temp, "preview-runtime-too-long", preview_runtime, 4, ENVIRONMENT_DECISION)

        missing_owner = copy.deepcopy(isolated)
        missing_owner["decision_form"]["owner_approved"] = False
        run_case(temp, "owner-approval-missing", missing_owner, 3, INVALID_DECISION)

        benchmark_claim = copy.deepcopy(isolated)
        benchmark_claim["benchmark_execution_authorized"] = True
        run_case(temp, "benchmark-claim", benchmark_claim, 5, UNAUTHORIZED_DECISION)

        index_claim = copy.deepcopy(isolated)
        index_claim["result"]["production_index_removal_ready"] = True
        run_case(temp, "index-readiness-claim", index_claim, 5, UNAUTHORIZED_DECISION)

        run_case(temp, "malformed", "{not-json", 2, INPUT_DECISION)

    for marker in (
        CONTRACT_DECISION,
        SUCCESS_DECISION,
        "каноническая форма остаётся незаполненной",
        "отдельное разрешение на benchmark",
        "не является разрешением на production ddl",
    ):
        require(marker.lower() in docs.lower(), f"documentation marker missing: {marker}")

    print("Navigator v2 capacity submission evaluator self-tests passed")


if __name__ == "__main__":
    main()
