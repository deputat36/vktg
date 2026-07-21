#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "config/nav-v2-preview-candidate-package-v3.json"
PACKAGE_V2 = ROOT / "config/nav-v2-preview-candidate-package-v2.json"
COMBINED = ROOT / "config/nav-v2-combined-preview-lifecycle-v1.json"
INTAKE_ROLLBACK = ROOT / "config/nav-v2-combined-preview-intake-rollback-v1.json"
GRANTS = ROOT / "config/nav-v2-preview-minimal-grants-candidate-v1.json"
ACCOUNTS = ROOT / "config/nav-v2-preview-technical-account-lifecycle-v1.json"
RUNBOOK = ROOT / "config/nav-v2-preview-execution-runbook-v1.json"
AUTH_READINESS = ROOT / "config/nav-v2-auth-e2e-readiness.json"
ATTESTATION = ROOT / "config/nav-v2-preview-readonly-attestation-v1.json"
WORKFLOW = ROOT / ".github/workflows/nav-v2-preview-execution-package-v3.yml"
DOC = ROOT / "docs/NAV_V2_PREVIEW_EXECUTION_PACKAGE_V3_2026-07-21.md"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def load(path: Path) -> dict:
    require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    package = load(PACKAGE)
    package_v2 = load(PACKAGE_V2)
    combined = load(COMBINED)
    intake_rollback = load(INTAKE_ROLLBACK)
    grants = load(GRANTS)
    accounts = load(ACCOUNTS)
    runbook = load(RUNBOOK)
    auth_readiness = load(AUTH_READINESS)
    attestation = load(ATTESTATION)
    require(WORKFLOW.is_file(), f"missing source: {WORKFLOW.relative_to(ROOT)}")
    require(DOC.is_file(), f"missing source: {DOC.relative_to(ROOT)}")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(package["schema_version"] == 3, "unexpected package v3 schema")
    require(
        package["status"] == "repository_only_preview_execution_candidate_v3_not_authorized",
        "package v3 escaped repository-only authorization boundary",
    )
    require(package["source_main_sha"] == "00125d63601b2064164bf01828d7244acf6ca773", "package v3 source main drifted")
    require(package["production_project_ref"] == "ofewxuqfjhamgerwzull", "production project ref drifted")
    require(package["repository_review_package_ready"] is True, "package v3 is not review-ready")
    for key in [
        "production_applied", "preview_branch_created", "execution_authorized",
        "cloud_execution_allowed", "cost_confirmation_performed",
        "technical_accounts_created", "edge_deployed", "frontend_transport_enabled",
        "authenticated_e2e_proven", "preview_apply_allowed", "production_ready",
        "deployment_bundle_ready", "production_rollback_bundle_ready",
    ]:
        require(package[key] is False, f"package v3 {key} must remain false")
    for key in [
        "combined_apply_proven", "combined_rollback_proven",
        "exact_preview_rollback_inventory_complete",
        "preview_execution_runbook_ready",
        "technical_account_lifecycle_plan_ready",
    ]:
        require(package[key] is True, f"package v3 evidence missing: {key}")

    expected_paths = {
        "package_v2": PACKAGE_V2,
        "combined_lifecycle": COMBINED,
        "combined_intake_rollback": INTAKE_ROLLBACK,
        "minimal_grants_candidate": GRANTS,
        "technical_account_lifecycle": ACCOUNTS,
        "execution_runbook": RUNBOOK,
        "auth_e2e_readiness": AUTH_READINESS,
        "readonly_attestation": ATTESTATION,
    }
    for key, path in expected_paths.items():
        require(package[key] == path.relative_to(ROOT).as_posix(), f"package v3 path drifted: {key}")

    require(package_v2["status"] == "repository_only_preview_candidate_package_v2_not_executable", "package v2 status drifted")
    require(package_v2["review_candidate_ready"] is True, "package v2 is not review-ready")
    require(package_v2["preview_apply_allowed"] is False, "package v2 unexpectedly allows apply")

    require(combined["status"] == "repository_only_combined_preview_lifecycle_proven_not_executable", "combined proof status drifted")
    require(combined["combined_apply_proven"] is True, "combined apply proof missing")
    require(combined["combined_rollback_proven"] is True, "combined rollback proof missing")
    require(combined["proof"]["workflow_run_id"] == 29831435000, "combined proof run drifted")
    require(combined["proof"]["postgres_major"] == 17, "combined proof PostgreSQL drifted")
    require(combined["proof"]["cloud_calls_performed"] is False, "combined proof claims cloud calls")

    require(intake_rollback["status"] == "repository_only_combined_intake_rollback_not_executable", "combined intake rollback status drifted")
    require(len(intake_rollback["rollback_sources"]) == 11, "combined intake rollback source count drifted")
    require(intake_rollback["replaced_standalone_source"] not in intake_rollback["rollback_sources"], "standalone schema-owning intake rollback remains active")
    require(intake_rollback["marker_facade"]["real_tables_restored_by_oid_preserving_rename"] is True, "marker facade restoration proof missing")

    require(grants["status"] == "repository_only_minimal_grants_candidate_not_applied", "minimal grants status drifted")
    require(grants["grant_change_allowed"] is False, "minimal grants unexpectedly allow change")
    require(grants["production_applied"] is False, "minimal grants claim production apply")

    require(accounts["status"] == "repository_only_technical_account_lifecycle_not_executed", "technical account lifecycle status drifted")
    for key in [
        "production_accounts_allowed", "preview_accounts_created", "real_employee_accounts_allowed",
        "production_data_copy_allowed", "credentials_committed_allowed", "account_creation_allowed",
    ]:
        require(accounts[key] is False, f"technical account lifecycle {key} must remain false")
    require(accounts["account_deletion_required"] is True, "technical account deletion is not required")
    require(accounts["identity_policy"]["synthetic_only"] is True, "technical account policy is not synthetic-only")
    require(accounts["identity_policy"]["password_source"] == "execution_time_secret_not_repository", "credential source drifted")
    roles = accounts["role_matrix"]
    require(len(roles) == 8, "technical role matrix count drifted")
    require(sum(1 for item in roles if item["required"]) == 7, "required technical role count drifted")
    require(any(item["role"] == "owner" and item["required"] is False for item in roles), "owner opt-in boundary missing")
    require(any(item["role"] == "viewer" and item["profile_active"] is False for item in roles), "viewer retirement negative account missing")

    require(runbook["status"] == "repository_only_preview_execution_runbook_not_authorized", "runbook authorization status drifted")
    for key in [
        "execution_authorized", "cost_confirmation_performed", "preview_branch_created",
        "database_applied", "edge_deployed", "technical_accounts_created",
        "authenticated_e2e_run", "production_applied",
    ]:
        require(runbook[key] is False, f"runbook {key} must remain false")
    require(runbook["maximum_branch_lifetime_hours"] == 6, "branch lifetime ceiling drifted")
    require(runbook["data_policy"] == "synthetic_only_no_production_copy", "runbook data policy drifted")
    phases = runbook["ordered_phases"]
    require([item["order"] for item in phases] == list(range(7)), "runbook phase order drifted")
    require(
        [item["id"] for item in phases] == [
            "execution_time_preflight", "create_preview_branch", "database_apply",
            "edge_deploy_disabled", "technical_accounts", "authenticated_e2e",
            "cleanup_and_attestation",
        ],
        "runbook phase IDs drifted",
    )
    database_phase = phases[2]
    require(database_phase["forward_order"] == ["privacy_aligned_quality", "bounded_consolidated", "governed_intake_25_rule"], "runbook database forward order drifted")
    require(database_phase["rollback_order"] == ["combined_safe_intake", "bounded_consolidated", "quality_exact_restore"], "runbook database rollback order drifted")
    edge_phase = phases[3]
    require("bounded_task_edge_identity_enabled_false" in edge_phase["required"], "disabled Edge feature gate missing")
    cleanup_phase = phases[6]
    require("preview_branch_deleted_before_deadline" in cleanup_phase["required"], "branch cleanup deadline proof missing")
    require(runbook["production_decision_separate"] is True, "production decision is not separate")

    require(auth_readiness["production_applied"] is False, "auth readiness claims production apply")
    require(attestation["data_mutated"] is False and attestation["ddl_executed"] is False, "read-only attestation claims mutation")
    require(attestation["branches"]["preview"] == 0, "read-only attestation unexpectedly contains preview branch")
    require(attestation["technical_identity_absence"]["auth_users"] == 0, "technical Auth users unexpectedly exist")
    require(attestation["technical_identity_absence"]["profiles"] == 0, "technical profiles unexpectedly exist")

    require([item["order"] for item in package["database_forward_order"]] == [1, 2, 3], "package v3 forward order drifted")
    require([item["id"] for item in package["database_forward_order"]] == ["privacy_aligned_quality", "bounded_consolidated", "governed_intake_25_rule"], "package v3 forward IDs drifted")
    require([item["order"] for item in package["database_rollback_order"]] == [1, 2, 3], "package v3 rollback order drifted")
    require([item["id"] for item in package["database_rollback_order"]] == ["combined_safe_intake", "bounded_consolidated", "quality_exact_restore"], "package v3 rollback IDs drifted")

    closed = set(package["closed_repository_blockers"])
    for blocker in [
        "bounded_full_candidate_not_consolidated",
        "cross_component_sequential_apply_not_proven",
        "exact_preview_rollback_inventory_missing",
        "preview_execution_runbook_missing",
        "technical_account_lifecycle_plan_missing",
    ]:
        require(blocker in closed, f"closed repository blocker missing: {blocker}")

    stops = set(package["active_stops"])
    for stop in [
        "execution_not_authorized", "explicit_cost_approval_missing",
        "cost_confirmation_id_missing", "preview_branch_missing",
        "fresh_execution_time_attestation_missing", "technical_accounts_missing",
        "authenticated_role_matrix_not_run", "edge_not_deployed",
        "frontend_bounded_transport_disabled", "production_deployment_not_approved",
    ]:
        require(stop in stops, f"active stop missing: {stop}")

    forbidden = set(package["forbidden_actions"])
    for action in [
        "create_supabase_branch_without_explicit_cost_approval",
        "perform_cost_confirmation_without_owner_approval",
        "apply_database_changes_to_production", "deploy_edge_to_production",
        "create_accounts_in_production", "create_or_reuse_real_employee_accounts",
        "copy_production_data", "enable_frontend_transport",
        "change_production_auth_rls_or_grants", "modify_or_reconcile_leader_migrations",
        "mutate_or_cleanup_production_rows", "claim_preview_or_production_readiness",
    ]:
        require(action in forbidden, f"forbidden package v3 action missing: {action}")

    for marker in [
        "nav-v2-preview-candidate-package-v3.json",
        "nav-v2-preview-execution-runbook-v1.json",
        "nav-v2-preview-technical-account-lifecycle-v1.json",
        "check_nav_v2_preview_execution_package_v3.py",
        "actions/upload-artifact@v4",
    ]:
        require(marker in workflow, f"workflow marker missing: {marker}")
    for cloud_marker in [
        "supabase db push", "supabase functions deploy", "confirm_cost",
        "create_branch", "apply_migration", "deploy_edge_function",
    ]:
        require(cloud_marker not in workflow.lower(), f"workflow contains forbidden cloud action: {cloud_marker}")

    for marker in [
        "Package v3", "Combined proof", "Execution runbook",
        "Technical accounts", "Exact rollback", "Active stops",
        "Production remains unchanged", "Next gated action",
    ]:
        require(marker in doc, f"documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*preview*execution*package*v3*")]
    require(not leaked, f"package v3 leaked into migrations: {leaked}")

    print("Navigator v2 preview execution package v3 source contract passed")


if __name__ == "__main__":
    main()
