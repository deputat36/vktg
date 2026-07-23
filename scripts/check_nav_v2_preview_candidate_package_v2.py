#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(relative: str) -> dict:
    path = ROOT / relative
    if not path.is_file():
        raise SystemExit(f"FAIL: missing source: {relative}")
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    package = load("config/nav-v2-preview-candidate-package-v2.json")
    attestation = load("config/nav-v2-preview-readonly-attestation-v1.json")
    release = load("config/nav-v2-release-baseline.json")
    shared = load("config/nav-v2-release-drift-shared-project-v1.json")

    require(package["schema_version"] == 2, "unexpected package v2 schema")
    require(package["status"] == "repository_only_preview_candidate_package_v2_not_executable", "package v2 status drifted")
    require(package["production_project_ref"] == "ofewxuqfjhamgerwzull", "project ref drifted")
    require(package["review_candidate_ready"] is True, "package v2 is not review-ready")

    for key in (
        "production_applied", "preview_branch_created", "cloud_execution_allowed",
        "cost_confirmation_performed", "preview_apply_allowed", "edge_deploy_allowed",
        "technical_accounts_allowed", "deployment_bundle_ready",
        "production_rollback_bundle_ready", "authenticated_e2e_proven",
    ):
        require(package[key] is False, f"package v2 {key} must remain false")

    require(
        [item["id"] for item in package["components"]] ==
        ["quality", "bounded_consolidated", "intake", "edge_candidate"],
        "component inventory drifted",
    )
    edge = package["components"][3]
    require(edge["feature_flag_default"] is False, "Edge feature flag is not false")
    require(edge["deployed"] is False and edge["can_deploy"] is False, "Edge candidate escaped disabled state")
    require(edge["verify_jwt_required"] is True, "Edge JWT requirement drifted")

    candidate = (ROOT / edge["entrypoint"]).read_text(encoding="utf-8")
    snapshot = (ROOT / edge["production_snapshot"]).read_text(encoding="utf-8")
    require("const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;" in candidate, "candidate Edge flag drifted")
    require("routeBoundedTaskEdgeActionV2" in candidate, "candidate Edge route missing")
    require("routeBoundedTaskEdgeActionV2" not in snapshot, "production Edge snapshot contains candidate route")

    require(attestation["status"] == "captured_read_only_production_attestation_not_execution_approval", "attestation status drifted")
    require(attestation["data_mutated"] is False and attestation["ddl_executed"] is False, "attestation claims mutation")
    require(attestation["branches"]["preview"] == 0, "preview branch unexpectedly attested")
    require(attestation["technical_identity_absence"]["auth_users"] == 0, "technical Auth users unexpectedly attested")
    require(attestation["technical_identity_absence"]["profiles"] == 0, "technical profiles unexpectedly attested")
    require(attestation["migration_boundary"]["latest_navigator_migration"] == "20260716063401", "Navigator migration snapshot drifted")
    require(attestation["migration_boundary"]["latest_remote_migration"] == "20260721122333", "overall migration snapshot drifted")
    require(attestation["migration_boundary"]["navigator_may_modify_leader_history"] is False, "leader history boundary drifted")

    historical = package["migration_boundary"]
    require(historical["release_baseline_latest_live_migration"] == "20260715203158", "historical baseline snapshot drifted")
    require(historical["release_baseline_drift_detected"] is True, "historical drift evidence was rewritten")
    require(historical["release_baseline_refresh_allowed"] is False, "historical package allowed automatic baseline refresh")

    require(release["latest_live_migration"] == "20260716063401", "current release baseline is not reconciled")
    require(shared["current_navigator_live_migration"] == release["latest_live_migration"], "shared release contract differs from baseline")
    require(shared["navigator_baseline_semantics"] == "required_present_not_global_latest", "shared release semantics drifted")
    require(shared["result"]["production_mutation"] is False, "release reconciliation claims production mutation")

    preflight = (ROOT / package["readonly_preflight_sql"]).read_text(encoding="utf-8")
    executable = "\n".join(line for line in preflight.splitlines() if not line.strip().startswith("--"))
    require("begin transaction read only;" in executable.lower(), "read-only transaction marker missing")
    require("rollback;" in executable.lower(), "read-only rollback marker missing")
    require("aggregate_only" in preflight, "aggregate-only marker missing")
    require(
        not re.search(r"\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|comment|copy|call|do)\b", executable, re.I),
        "read-only preflight contains DDL or DML",
    )

    stops = set(package["active_stops"])
    for stop in (
        "preview_branch_missing", "explicit_cost_approval_missing",
        "technical_accounts_missing", "authenticated_role_matrix_not_run",
        "edge_not_deployed", "preview_apply_not_approved",
        "production_deployment_not_approved",
    ):
        require(stop in stops, f"package v2 stop missing: {stop}")

    forbidden = set(package["forbidden_actions"])
    for action in (
        "create_supabase_branch_without_explicit_cost_approval",
        "perform_cost_confirmation", "create_technical_accounts",
        "apply_database_changes", "deploy_edge_function",
        "change_auth_rls_or_grants", "copy_production_data",
        "modify_or_reconcile_leader_migrations",
        "claim_preview_or_production_readiness",
    ):
        require(action in forbidden, f"forbidden action missing: {action}")

    leaked = list((ROOT / "supabase/migrations").glob("*preview*candidate*package*v2*"))
    require(not leaked, "package v2 leaked into migrations")
    print("Navigator v2 preview candidate package v2 source contract passed: historical evidence preserved, current baseline reconciled")


if __name__ == "__main__":
    main()
