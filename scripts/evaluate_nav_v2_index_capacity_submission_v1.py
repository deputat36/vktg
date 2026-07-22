#!/usr/bin/env python3
"""Evaluate a completed Navigator v2 index capacity-input form offline.

Exit codes:
- 0: form values and approvals are structurally valid, but execution remains gated;
- 2: unreadable or malformed input;
- 3: form contract, values, approvals, or rationale are incomplete/invalid;
- 4: environment-specific preview cost/lifetime gate is invalid;
- 5: input attempts to authorize benchmark, cloud, production DDL/DML, or index removal.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

EXIT_OK = 0
EXIT_INPUT_ERROR = 2
EXIT_INVALID_FORM = 3
EXIT_ENVIRONMENT_GATE_INVALID = 4
EXIT_UNAUTHORIZED_CLAIM = 5

SUCCESS_DECISION = "capacity_submission_valid_separate_execution_authorization_required"
INPUT_DECISION = "capacity_submission_input_error"
INVALID_DECISION = "capacity_submission_invalid_or_incomplete"
ENVIRONMENT_DECISION = "capacity_submission_environment_or_cost_gate_invalid"
UNAUTHORIZED_DECISION = "capacity_submission_forbidden_authorization_claim"

EXPECTED_PROJECT_REF = "ofewxuqfjhamgerwzull"
EXPECTED_INPUTS = {
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
ENVIRONMENTS = {
    "isolated_ephemeral_postgresql_17",
    "owner_and_cost_approved_disposable_supabase_preview_branch",
}
SCALE_SOURCES = {
    "owner_capacity_forecast",
    "approved_non_pii_aggregate_observation",
    "max_of_owner_forecast_and_approved_observation",
}
OBSERVATION_CADENCES = {"daily", "weekly", "before_and_after_known_release"}
POSITIVE_INTEGER_INPUTS = {
    "approved_target_deals",
    "approved_target_answers",
    "approved_peak_concurrency",
    "approved_concurrency_headroom",
    "approved_max_runtime_minutes",
    "approved_minimum_observation_days",
}
NON_NEGATIVE_INTEGER_INPUTS = {
    "approved_minimum_authenticated_sessions",
    "approved_minimum_candidate_index_reads",
    "approved_minimum_candidate_table_writes",
    "approved_minimum_parent_mutations",
}
ZERO_RATIONALE_INPUTS = NON_NEGATIVE_INTEGER_INPUTS
FORBIDDEN_ROOT_TRUE_FLAGS = {
    "production_applied",
    "production_ddl_authorized",
    "production_dml_authorized",
    "cloud_execution_allowed",
    "benchmark_execution_authorized",
}
FORBIDDEN_RESULT_TRUE_FLAGS = {
    "benchmark_execution_ready",
    "production_index_removal_ready",
}
CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Completed local JSON form copy")
    parser.add_argument("--output", type=Path, help="Optional aggregate JSON report path")
    return parser.parse_args()


def load_input(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"unable_to_read_json:{type(error).__name__}") from error
    if not isinstance(value, dict):
        raise ValueError("input_root_must_be_object")
    return value


def is_non_negative_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def is_positive_integer(value: Any) -> bool:
    return is_non_negative_integer(value) and value >= 1


def is_positive_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0


def is_non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def parse_timestamp(value: Any) -> datetime | None:
    if not is_non_empty_string(value):
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed


def input_value(inputs: dict[str, Any], name: str) -> Any:
    item = inputs.get(name)
    return item.get("value") if isinstance(item, dict) else None


def base_report() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "valid_form": False,
        "environment_gate_valid": False,
        "owner_approval_present": False,
        "release_manager_approval_present": False,
        "required_input_count": len(EXPECTED_INPUTS),
        "completed_input_count": 0,
        "selected_environment": None,
        "decision": INVALID_DECISION,
        "benchmark_execution_ready": False,
        "production_index_removal_ready": False,
        "production_ddl_ready": False,
        "reasons": [],
    }


def evaluate(data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    report = base_report()
    reasons: list[str] = []
    environment_reasons: list[str] = []
    unauthorized_reasons: list[str] = []

    if data.get("schema_version") != 1:
        reasons.append("schema_version_must_be_1")
    if data.get("project_ref") != EXPECTED_PROJECT_REF:
        reasons.append("project_ref_mismatch")

    for flag in FORBIDDEN_ROOT_TRUE_FLAGS:
        if data.get(flag) is not False:
            unauthorized_reasons.append(f"forbidden_root_flag_not_false:{flag}")

    candidate = data.get("candidate")
    if not isinstance(candidate, dict):
        reasons.append("candidate_contract_missing")
    else:
        expected_candidate = {
            "table": "public.nav_deal_answers_v2",
            "single_column_index": "nav_deal_answers_v2_deal_idx",
            "composite_unique_index": "nav_deal_answers_v2_deal_id_question_key_key",
            "decision_before_form": "review_possible_redundancy_only",
            "decision_after_form": "review_possible_redundancy_only",
        }
        for key, expected in expected_candidate.items():
            if candidate.get(key) != expected:
                reasons.append(f"candidate_field_mismatch:{key}")

    fixed = data.get("fixed_context")
    if not isinstance(fixed, dict):
        reasons.append("fixed_context_missing")
        maximum_preview_hours = 6
    else:
        maximum_preview_hours = fixed.get("maximum_preview_branch_lifetime_hours")
        if fixed.get("planning_horizon_months") != 12:
            reasons.append("planning_horizon_must_be_12")
        if fixed.get("postgres_major") != 17:
            reasons.append("postgres_major_must_be_17")
        for flag in (
            "production_database_allowed",
            "production_rows_copy_allowed",
            "real_accounts_allowed",
            "direct_identifiers_allowed",
        ):
            if fixed.get(flag) is not False:
                unauthorized_reasons.append(f"fixed_safety_flag_not_false:{flag}")
        if maximum_preview_hours != 6:
            reasons.append("maximum_preview_branch_lifetime_hours_must_be_6")

    form = data.get("decision_form")
    submitted_at = None
    reviewed_at = None
    if not isinstance(form, dict):
        reasons.append("decision_form_missing")
    else:
        if form.get("status") != "reviewed":
            reasons.append("decision_form_status_must_be_reviewed")
        for field in ("submitted_by", "reviewed_by"):
            value = form.get(field)
            if not is_non_empty_string(value):
                reasons.append(f"decision_form_{field}_missing")
            elif "@" in value:
                reasons.append(f"decision_form_{field}_must_not_be_email")
        submitted_at = parse_timestamp(form.get("submitted_at"))
        reviewed_at = parse_timestamp(form.get("reviewed_at"))
        if submitted_at is None:
            reasons.append("decision_form_submitted_at_invalid")
        if reviewed_at is None:
            reasons.append("decision_form_reviewed_at_invalid")
        if submitted_at and reviewed_at and reviewed_at < submitted_at:
            reasons.append("decision_form_review_before_submission")
        report["owner_approval_present"] = form.get("owner_approved") is True
        report["release_manager_approval_present"] = form.get("release_manager_approved") is True
        if not report["owner_approval_present"]:
            reasons.append("owner_approval_missing")
        if not report["release_manager_approval_present"]:
            reasons.append("release_manager_approval_missing")
        if form.get("values_may_not_be_guessed") is not True:
            reasons.append("values_may_not_be_guessed_must_be_true")
        for flag in ("partial_submission_authorizes_execution", "completed_form_authorizes_execution"):
            if form.get(flag) is not False:
                unauthorized_reasons.append(f"decision_form_authorization_flag_not_false:{flag}")

    inputs = data.get("inputs")
    if not isinstance(inputs, dict):
        reasons.append("inputs_missing")
        inputs = {}
    elif set(inputs) != EXPECTED_INPUTS:
        reasons.append("input_inventory_mismatch")

    completed_count = 0
    for name in EXPECTED_INPUTS:
        item = inputs.get(name)
        if not isinstance(item, dict):
            reasons.append(f"input_item_missing:{name}")
            continue
        if item.get("value") is not None:
            completed_count += 1
    report["completed_input_count"] = completed_count

    environment = input_value(inputs, "selected_environment")
    report["selected_environment"] = environment if environment in ENVIRONMENTS else None
    if environment not in ENVIRONMENTS:
        reasons.append("selected_environment_invalid_or_missing")

    scale_source = input_value(inputs, "target_scale_source")
    if scale_source not in SCALE_SOURCES:
        reasons.append("target_scale_source_invalid_or_missing")

    cadence = input_value(inputs, "selected_observation_cadence")
    if cadence not in OBSERVATION_CADENCES:
        reasons.append("selected_observation_cadence_invalid_or_missing")

    for name in POSITIVE_INTEGER_INPUTS:
        value = input_value(inputs, name)
        if not is_positive_integer(value):
            reasons.append(f"positive_integer_required:{name}")

    for name in NON_NEGATIVE_INTEGER_INPUTS:
        value = input_value(inputs, name)
        if not is_non_negative_integer(value):
            reasons.append(f"non_negative_integer_required:{name}")

    distribution = input_value(inputs, "approved_answers_per_deal_distribution")
    if not isinstance(distribution, dict):
        reasons.append("distribution_object_required")
    else:
        keys = {"p50", "p95", "max_bounded"}
        if set(distribution) != keys:
            reasons.append("distribution_fields_mismatch")
        values = [distribution.get("p50"), distribution.get("p95"), distribution.get("max_bounded")]
        if not all(is_non_negative_integer(value) for value in values):
            reasons.append("distribution_values_must_be_non_negative_integers")
        elif not (values[0] <= values[1] <= values[2]):
            reasons.append("distribution_order_must_be_p50_lte_p95_lte_max")

    rationale = data.get("submission_rationale")
    zero_rationale = rationale.get("zero_thresholds") if isinstance(rationale, dict) else None
    for name in ZERO_RATIONALE_INPUTS:
        if input_value(inputs, name) == 0:
            value = zero_rationale.get(name) if isinstance(zero_rationale, dict) else None
            if not is_non_empty_string(value):
                reasons.append(f"zero_threshold_rationale_missing:{name}")

    compute_class = input_value(inputs, "approved_branch_compute_class")
    runtime_minutes = input_value(inputs, "approved_max_runtime_minutes")
    cost = data.get("preview_cost_gate")
    if not isinstance(cost, dict):
        environment_reasons.append("preview_cost_gate_missing")
        cost = {}

    if cost.get("historical_cost_may_not_be_reused") is not True:
        environment_reasons.append("historical_cost_reuse_must_be_forbidden")

    if environment == "isolated_ephemeral_postgresql_17":
        if compute_class is not None:
            environment_reasons.append("compute_class_must_be_null_for_isolated_environment")
        for flag in ("cost_rechecked", "shown_to_owner", "explicit_owner_cost_approval"):
            if cost.get(flag) is not False:
                environment_reasons.append(f"isolated_environment_cost_flag_must_be_false:{flag}")
        for field in ("amount", "currency", "recurrence", "cost_confirmation_id", "automatic_delete_deadline"):
            if cost.get(field) is not None:
                environment_reasons.append(f"isolated_environment_cost_field_must_be_null:{field}")
    elif environment == "owner_and_cost_approved_disposable_supabase_preview_branch":
        if not is_non_empty_string(compute_class):
            environment_reasons.append("preview_compute_class_required")
        if not is_positive_integer(runtime_minutes) or runtime_minutes > 6 * 60:
            environment_reasons.append("preview_runtime_must_be_between_1_and_360_minutes")
        for flag in ("cost_rechecked", "shown_to_owner", "explicit_owner_cost_approval"):
            if cost.get(flag) is not True:
                environment_reasons.append(f"preview_cost_flag_must_be_true:{flag}")
        if not is_positive_number(cost.get("amount")):
            environment_reasons.append("preview_cost_amount_must_be_positive")
        currency = cost.get("currency")
        if not is_non_empty_string(currency) or not CURRENCY_RE.fullmatch(currency):
            environment_reasons.append("preview_cost_currency_must_be_iso_like_uppercase")
        if cost.get("recurrence") != "hourly":
            environment_reasons.append("preview_cost_recurrence_must_be_hourly")
        if not is_non_empty_string(cost.get("cost_confirmation_id")):
            environment_reasons.append("preview_cost_confirmation_id_required")
        delete_deadline = parse_timestamp(cost.get("automatic_delete_deadline"))
        if delete_deadline is None:
            environment_reasons.append("preview_automatic_delete_deadline_invalid")
        elif reviewed_at and delete_deadline <= reviewed_at:
            environment_reasons.append("preview_delete_deadline_must_be_after_review")

    decision_policy = data.get("decision_policy")
    if not isinstance(decision_policy, dict):
        reasons.append("decision_policy_missing")
    else:
        for flag in (
            "form_does_not_select_values",
            "form_does_not_confirm_cost",
            "form_does_not_create_environment",
            "form_does_not_run_benchmark",
            "form_does_not_authorize_production_dml",
            "form_does_not_authorize_production_ddl",
            "zero_thresholds_if_selected_require_explicit_rationale",
            "successful_submission_does_not_imply_index_drop",
        ):
            if decision_policy.get(flag) is not True:
                unauthorized_reasons.append(f"decision_policy_flag_not_true:{flag}")

    result = data.get("result")
    if not isinstance(result, dict):
        reasons.append("result_contract_missing")
    else:
        for flag in FORBIDDEN_RESULT_TRUE_FLAGS:
            if result.get(flag) is not False:
                unauthorized_reasons.append(f"forbidden_result_flag_not_false:{flag}")

    required_post_gates = {
        "fresh_readonly_schema_and_statistics_preflight",
        "same_epoch_or_explicit_observation_window_restart",
        "separate_benchmark_execution_authorization",
        "disposable_environment_creation_if_selected",
        "synthetic_dataset_manifest_and_hash",
        "benchmark_cleanup_evidence",
        "authenticated_regression",
        "production_explain_analyze_on_approved_non_pii_fixtures",
        "exact_forward_and_rollback_migration",
        "separate_owner_production_ddl_approval",
    }
    if not required_post_gates.issubset(set(data.get("post_submission_gates", []))):
        reasons.append("required_post_submission_gates_missing")

    if unauthorized_reasons:
        report["decision"] = UNAUTHORIZED_DECISION
        report["reasons"] = sorted(set(unauthorized_reasons + reasons + environment_reasons))
        return report, EXIT_UNAUTHORIZED_CLAIM

    if environment_reasons:
        report["decision"] = ENVIRONMENT_DECISION
        report["reasons"] = sorted(set(environment_reasons + reasons))
        return report, EXIT_ENVIRONMENT_GATE_INVALID

    if reasons:
        report["decision"] = INVALID_DECISION
        report["reasons"] = sorted(set(reasons))
        return report, EXIT_INVALID_FORM

    report["valid_form"] = True
    report["environment_gate_valid"] = True
    report["decision"] = SUCCESS_DECISION
    return report, EXIT_OK


def write_report(report: dict[str, Any], output: Path | None) -> None:
    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if output is None:
        sys.stdout.write(payload)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload, encoding="utf-8")


def main() -> int:
    args = parse_args()
    try:
        data = load_input(args.input)
    except ValueError as error:
        report = base_report()
        report["decision"] = INPUT_DECISION
        report["reasons"] = [str(error)]
        write_report(report, args.output)
        return EXIT_INPUT_ERROR

    report, exit_code = evaluate(data)
    write_report(report, args.output)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
