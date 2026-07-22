#!/usr/bin/env python3
"""Evaluate a pre-redacted Navigator v2 Auth recovery summary offline.

Exit codes:
- 0: valid redacted summary, no security regression observed;
- 2: unreadable or malformed input;
- 3: privacy/contract/sequence validation failed;
- 4: valid redacted summary reports a security regression requiring review.
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
EXIT_INVALID_SUMMARY = 3
EXIT_SECURITY_REGRESSION = 4

EXPECTED_SEQUENCE = [
    "authenticated_rpc_401",
    "refresh_endpoint_200",
    "same_rpc_retry_200",
]

REQUIRED_PRIVACY_FLAGS = (
    "user_ids_retained",
    "names_retained",
    "emails_retained",
    "ip_addresses_retained",
    "user_agents_retained",
    "request_ids_retained",
    "tokens_retained",
    "headers_retained",
    "payloads_retained",
    "business_rows_retained",
    "query_text_retained",
    "raw_event_messages_retained",
    "direct_identifiers_retained",
)

REQUIRED_FALSE_CLAIMS = (
    "authenticated_role_e2e_completed",
    "authenticated_visual_e2e_completed",
    "all_roles_verified",
    "mobile_and_desktop_verified",
    "preview_branch_gate_satisfied",
    "production_change_authorized",
)

SENSITIVE_KEYS = {
    "user_id",
    "actor_id",
    "actor_name",
    "actor_username",
    "email",
    "remote_addr",
    "ip",
    "ip_address",
    "request_id",
    "authorization",
    "access_token",
    "refresh_token",
    "headers",
    "payload",
    "event_message",
    "user_agent",
}

IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Pre-redacted JSON summary")
    parser.add_argument("--output", type=Path, help="Optional JSON report path")
    return parser.parse_args()


def load_input(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"unable_to_read_json:{type(error).__name__}") from error
    if not isinstance(value, dict):
        raise ValueError("input_root_must_be_object")
    return value


def non_negative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def valid_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def find_sensitive_material(value: Any, path: str = "$", findings: list[str] | None = None) -> list[str]:
    if findings is None:
        findings = []

    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).strip().lower()
            child_path = f"{path}.{key}"
            if normalized in SENSITIVE_KEYS:
                findings.append(f"sensitive_key:{child_path}")
            find_sensitive_material(child, child_path, findings)
        return findings

    if isinstance(value, list):
        for index, child in enumerate(value):
            find_sensitive_material(child, f"{path}[{index}]", findings)
        return findings

    if isinstance(value, str):
        lowered = value.lower()
        if "@" in value:
            findings.append(f"email_like_value:{path}")
        if IPV4_RE.search(value):
            findings.append(f"ip_like_value:{path}")
        if "bearer " in lowered:
            findings.append(f"authorization_like_value:{path}")
        if JWT_RE.search(value):
            findings.append(f"jwt_like_value:{path}")

    return findings


def base_report() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "valid_contract": False,
        "privacy_safe": False,
        "security_regression_observed": False,
        "decision": "redacted_auth_summary_invalid_contract_capture_required",
        "recovery_sequence_count": None,
        "fresh_invalid_refresh_events": None,
        "unauthenticated_boundary": {
            "authenticated_rpc_401_count": None,
            "private_helper_404_count": None,
            "unexpected_success_count": None,
        },
        "authenticated_role_e2e_ready": False,
        "production_change_ready": False,
        "reasons": [],
    }


def evaluate(data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    report = base_report()
    reasons: list[str] = []

    sensitive_findings = find_sensitive_material(data)
    if sensitive_findings:
        report["decision"] = "redacted_auth_summary_invalid_privacy_violation"
        report["reasons"] = sorted(set(sensitive_findings))
        return report, EXIT_INVALID_SUMMARY

    privacy = data.get("privacy")
    if not isinstance(privacy, dict):
        reasons.append("privacy_contract_missing")
    else:
        for flag in REQUIRED_PRIVACY_FLAGS:
            if privacy.get(flag) is not False:
                reasons.append(f"privacy_flag_not_false:{flag}")

    if data.get("schema_version") != 1:
        reasons.append("schema_version_must_be_1")
    if data.get("capture_mode") != "redacted_summary_only":
        reasons.append("capture_mode_must_be_redacted_summary_only")
    if data.get("raw_logs_included") is not False:
        reasons.append("raw_logs_included_must_be_false")

    window = data.get("capture_window")
    if not isinstance(window, dict):
        reasons.append("capture_window_missing")
    else:
        start = window.get("start_utc")
        end = window.get("end_utc")
        if not valid_timestamp(start):
            reasons.append("capture_window_start_invalid")
        if not valid_timestamp(end):
            reasons.append("capture_window_end_invalid")
        if valid_timestamp(start) and valid_timestamp(end):
            if datetime.fromisoformat(start.replace("Z", "+00:00")) > datetime.fromisoformat(end.replace("Z", "+00:00")):
                reasons.append("capture_window_start_after_end")

    sequences = data.get("recovery_sequences")
    if not isinstance(sequences, list) or not sequences:
        reasons.append("at_least_one_recovery_sequence_required")
        sequence_count = 0
    else:
        sequence_count = len(sequences)
        for index, sequence in enumerate(sequences):
            if not isinstance(sequence, dict):
                reasons.append(f"sequence_not_object:{index}")
                continue
            if sequence.get("steps") != EXPECTED_SEQUENCE:
                reasons.append(f"sequence_signature_invalid:{index}")
            duration = sequence.get("duration_ms")
            if duration is not None and not non_negative_int(duration):
                reasons.append(f"sequence_duration_invalid:{index}")

    invalid_refresh_events = data.get("fresh_invalid_refresh_events")
    if not non_negative_int(invalid_refresh_events):
        reasons.append("fresh_invalid_refresh_events_invalid")
        invalid_refresh_events = None

    boundary = data.get("unauthenticated_boundary")
    boundary_values: dict[str, int | None] = {
        "authenticated_rpc_401_count": None,
        "private_helper_404_count": None,
        "unexpected_success_count": None,
    }
    if not isinstance(boundary, dict):
        reasons.append("unauthenticated_boundary_missing")
    else:
        for key in boundary_values:
            value = boundary.get(key)
            if not non_negative_int(value):
                reasons.append(f"boundary_count_invalid:{key}")
            else:
                boundary_values[key] = value

    claims = data.get("claims")
    if not isinstance(claims, dict):
        reasons.append("claims_contract_missing")
    else:
        for flag in REQUIRED_FALSE_CLAIMS:
            if claims.get(flag) is not False:
                reasons.append(f"forbidden_claim_not_false:{flag}")

    report["recovery_sequence_count"] = sequence_count
    report["fresh_invalid_refresh_events"] = invalid_refresh_events
    report["unauthenticated_boundary"] = boundary_values

    if reasons:
        report["privacy_safe"] = not any(reason.startswith("privacy_") for reason in reasons)
        report["reasons"] = sorted(set(reasons))
        return report, EXIT_INVALID_SUMMARY

    report["valid_contract"] = True
    report["privacy_safe"] = True

    unexpected_success = boundary_values["unexpected_success_count"] or 0
    if (invalid_refresh_events or 0) > 0 or unexpected_success > 0:
        report["security_regression_observed"] = True
        report["decision"] = "redacted_auth_recovery_regression_observed_manual_investigation_required"
        if (invalid_refresh_events or 0) > 0:
            report["reasons"].append("fresh_invalid_refresh_events_observed")
        if unexpected_success > 0:
            report["reasons"].append("unexpected_unauthenticated_success_observed")
        return report, EXIT_SECURITY_REGRESSION

    report["decision"] = "redacted_auth_recovery_summary_valid_not_authenticated_role_e2e"
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
        report["decision"] = "redacted_auth_summary_input_error"
        report["reasons"] = [str(error)]
        write_report(report, args.output)
        return EXIT_INPUT_ERROR

    report, exit_code = evaluate(data)
    write_report(report, args.output)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
