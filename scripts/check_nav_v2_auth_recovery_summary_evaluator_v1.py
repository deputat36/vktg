#!/usr/bin/env python3
"""Validate the offline redacted Auth recovery summary evaluator and its boundaries."""

from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-auth-recovery-summary-evaluator-v1.json"
EVALUATOR = ROOT / "scripts/evaluate_nav_v2_auth_recovery_summary_v1.py"
WORKFLOW = ROOT / ".github/workflows/nav-v2-auth-recovery-summary-evaluator-v1.yml"
DOC = ROOT / "docs/NAV_V2_AUTH_RECOVERY_SUMMARY_EVALUATOR_V1_2026-07-22.md"

EXPECTED_CONTRACT_DECISION = "redacted_auth_summary_evaluator_prepared_offline_no_live_execution"
SUCCESS_DECISION = "redacted_auth_recovery_summary_valid_not_authenticated_role_e2e"
REGRESSION_DECISION = "redacted_auth_recovery_regression_observed_manual_investigation_required"
PRIVACY_DECISION = "redacted_auth_summary_invalid_privacy_violation"
INVALID_DECISION = "redacted_auth_summary_invalid_contract_capture_required"
INPUT_DECISION = "redacted_auth_summary_input_error"

FORBIDDEN_WORKFLOW_MARKERS = (
    "curl ",
    "wget ",
    "psql ",
    "supabase ",
    "execute_sql",
    "apply_migration",
    "confirm_cost",
    "create_branch",
    "deploy_edge_function",
)


def require(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def privacy_flags() -> dict[str, bool]:
    return {
        "user_ids_retained": False,
        "names_retained": False,
        "emails_retained": False,
        "ip_addresses_retained": False,
        "user_agents_retained": False,
        "request_ids_retained": False,
        "tokens_retained": False,
        "headers_retained": False,
        "payloads_retained": False,
        "business_rows_retained": False,
        "query_text_retained": False,
        "raw_event_messages_retained": False,
        "direct_identifiers_retained": False,
    }


def valid_summary() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "capture_mode": "redacted_summary_only",
        "raw_logs_included": False,
        "capture_window": {
            "start_utc": "2026-07-22T04:00:00Z",
            "end_utc": "2026-07-22T12:00:00Z",
        },
        "privacy": privacy_flags(),
        "recovery_sequences": [
            {
                "steps": [
                    "authenticated_rpc_401",
                    "refresh_endpoint_200",
                    "same_rpc_retry_200",
                ],
                "duration_ms": 1400,
            }
        ],
        "fresh_invalid_refresh_events": 0,
        "unauthenticated_boundary": {
            "authenticated_rpc_401_count": 3,
            "private_helper_404_count": 2,
            "unexpected_success_count": 0,
        },
        "claims": {
            "authenticated_role_e2e_completed": False,
            "authenticated_visual_e2e_completed": False,
            "all_roles_verified": False,
            "mobile_and_desktop_verified": False,
            "preview_branch_gate_satisfied": False,
            "production_change_authorized": False,
        },
    }


def run_case(temp: Path, name: str, payload: Any, expected_exit: int, expected_decision: str) -> dict[str, Any]:
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
    require(completed.returncode == expected_exit, f"{name}: expected exit {expected_exit}, got {completed.returncode}: {completed.stderr}")
    require(output_path.is_file(), f"{name}: report missing")
    report = json.loads(output_path.read_text(encoding="utf-8"))
    require(report.get("decision") == expected_decision, f"{name}: decision drift")
    require(report.get("authenticated_role_e2e_ready") is False, f"{name}: must not claim E2E readiness")
    require(report.get("production_change_ready") is False, f"{name}: must not authorize production changes")
    report_raw = output_path.read_text(encoding="utf-8")
    require("@" not in report_raw, f"{name}: report echoed email-like material")
    require("Bearer " not in report_raw, f"{name}: report echoed authorization-like material")
    return report


def main() -> None:
    for path in (CONFIG, EVALUATOR, WORKFLOW, DOC):
        require(path.is_file(), f"missing {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    evaluator = EVALUATOR.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config.get("schema_version") == 1, "schema version drift")
    require(config.get("production_applied") is False, "production_applied must remain false")
    require(config.get("production_auth_changed") is False, "production Auth must remain unchanged")
    require(config.get("cloud_execution_allowed") is False, "cloud execution must remain blocked")
    require(config.get("raw_logs_allowed") is False, "raw logs must remain forbidden")
    require(config.get("result", {}).get("decision") == EXPECTED_CONTRACT_DECISION, "contract decision drift")
    require(len(config.get("self_test_cases", [])) == 7, "seven self-test cases required")

    for token in (
        "EXIT_INPUT_ERROR = 2",
        "EXIT_INVALID_SUMMARY = 3",
        "EXIT_SECURITY_REGRESSION = 4",
        "redacted_auth_summary_invalid_privacy_violation",
        "redacted_auth_recovery_regression_observed_manual_investigation_required",
        "redacted_auth_recovery_summary_valid_not_authenticated_role_e2e",
        "find_sensitive_material",
        "EXPECTED_SEQUENCE",
    ):
        require(token in evaluator, f"evaluator contract missing: {token}")

    workflow_lower = workflow.lower()
    for marker in FORBIDDEN_WORKFLOW_MARKERS:
        require(marker not in workflow_lower, f"workflow must remain offline-only: {marker.strip()}")
    require("permissions:\n  contents: read" in workflow, "workflow permissions must remain read-only")
    require("python3 scripts/check_nav_v2_auth_recovery_summary_evaluator_v1.py" in workflow, "checker is not executed")

    with tempfile.TemporaryDirectory(prefix="nav-v2-auth-summary-") as temp_dir:
        temp = Path(temp_dir)

        valid_report = run_case(temp, "valid", valid_summary(), 0, SUCCESS_DECISION)
        require(valid_report.get("valid_contract") is True, "valid case must pass contract")
        require(valid_report.get("privacy_safe") is True, "valid case must be privacy safe")
        require(valid_report.get("security_regression_observed") is False, "valid case must not claim regression")

        invalid_refresh = valid_summary()
        invalid_refresh["fresh_invalid_refresh_events"] = 1
        report = run_case(temp, "invalid-refresh", invalid_refresh, 4, REGRESSION_DECISION)
        require(report.get("security_regression_observed") is True, "invalid refresh must be a regression")

        unexpected_success = valid_summary()
        unexpected_success["unauthenticated_boundary"]["unexpected_success_count"] = 1
        report = run_case(temp, "unexpected-success", unexpected_success, 4, REGRESSION_DECISION)
        require(report.get("security_regression_observed") is True, "unexpected unauthenticated success must be a regression")

        privacy_violation = valid_summary()
        privacy_violation["email"] = "person@example.test"
        report = run_case(temp, "privacy", privacy_violation, 3, PRIVACY_DECISION)
        require(report.get("privacy_safe") is False, "privacy violation must fail closed")

        incomplete_sequence = valid_summary()
        incomplete_sequence["recovery_sequences"][0]["steps"] = [
            "authenticated_rpc_401",
            "refresh_endpoint_200",
        ]
        run_case(temp, "incomplete-sequence", incomplete_sequence, 3, INVALID_DECISION)

        forbidden_claim = valid_summary()
        forbidden_claim["claims"]["authenticated_role_e2e_completed"] = True
        run_case(temp, "forbidden-claim", forbidden_claim, 3, INVALID_DECISION)

        run_case(temp, "malformed", "{not-json", 2, INPUT_DECISION)

    require(EXPECTED_CONTRACT_DECISION in doc, "contract decision missing from docs")
    require(SUCCESS_DECISION in doc, "success decision missing from docs")
    require(REGRESSION_DECISION in doc, "regression decision missing from docs")
    require("сырые логи" in doc.lower(), "raw-log boundary missing from docs")
    require("не заменяет authenticated role E2E" in doc, "E2E boundary missing from docs")

    print("Navigator v2 redacted Auth recovery summary evaluator self-tests passed")


if __name__ == "__main__":
    main()
