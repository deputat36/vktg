#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "config/nav-v2-preview-candidate-package-v2.json"
ATTESTATION = ROOT / "config/nav-v2-preview-readonly-attestation-v1.json"
PACKAGE_V1 = ROOT / "config/nav-v2-preview-candidate-package-v1.json"
PREVIEW_ASSEMBLER = ROOT / "config/nav-v2-preview-bundle-assembler-v1.json"
BOUNDED = ROOT / "config/nav-v2-bounded-consolidated-candidate-v1.json"
GRANTS = ROOT / "config/nav-v2-preview-minimal-grants-candidate-v1.json"
RELEASE = ROOT / "config/nav-v2-release-baseline.json"
PREFLIGHT = ROOT / "tests/sql/nav_v2_preview_readonly_preflight_v1.sql"
ASSEMBLER = ROOT / "scripts/assemble-nav-v2-preview-candidate-package-v2.mjs"
NODE_CHECKER = ROOT / "scripts/check-nav-v2-preview-candidate-package-v2.mjs"
WORKFLOW = ROOT / ".github/workflows/nav-v2-preview-candidate-package-v2.yml"
DOC = ROOT / "docs/NAV_V2_PREVIEW_CANDIDATE_PACKAGE_V2_2026-07-21.md"
EDGE_CANDIDATE = ROOT / "supabase/functions/nav-v2-deal-api/index.ts"
EDGE_SNAPSHOT = ROOT / "supabase/functions/nav-v2-deal-api/index.production-v4.ts"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def executable_sql(text: str) -> str:
    return "\n".join(
        line for line in text.splitlines()
        if not line.strip().startswith("--")
    )


def main() -> None:
    required_paths = [
        PACKAGE, ATTESTATION, PACKAGE_V1, PREVIEW_ASSEMBLER, BOUNDED,
        GRANTS, RELEASE, PREFLIGHT, ASSEMBLER, NODE_CHECKER, WORKFLOW,
        DOC, EDGE_CANDIDATE, EDGE_SNAPSHOT,
    ]
    for path in required_paths:
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    package = load(PACKAGE)
    attestation = load(ATTESTATION)
    package_v1 = load(PACKAGE_V1)
    preview = load(PREVIEW_ASSEMBLER)
    bounded = load(BOUNDED)
    grants = load(GRANTS)
    release = load(RELEASE)
    preflight = PREFLIGHT.read_text(encoding="utf-8")
    assembler = ASSEMBLER.read_text(encoding="utf-8")
    node_checker = NODE_CHECKER.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    edge_candidate = EDGE_CANDIDATE.read_text(encoding="utf-8")
    edge_snapshot = EDGE_SNAPSHOT.read_text(encoding="utf-8")

    require(package["schema_version"] == 2, "unexpected package v2 schema")
    require(
        package["status"] == "repository_only_preview_candidate_package_v2_not_executable",
        "package v2 escaped repository-only status",
    )
    require(
        package["source_main_sha"] == "7741346264646e31917c64f64d8eeca91217e855",
        "package v2 source main drifted",
    )
    require(package["production_project_ref"] == "ofewxuqfjhamgerwzull", "production project ref drifted")
    require(package["review_candidate_ready"] is True, "package v2 is not review-ready")
    require(
        package["execution_model"] == "quality_bounded_intake_review_inventory_with_consolidated_bounded_artifacts",
        "package v2 execution model drifted",
    )
    for key in [
        "production_applied", "preview_branch_created", "cloud_execution_allowed",
        "cost_confirmation_performed", "preview_apply_allowed", "edge_deploy_allowed",
        "technical_accounts_allowed", "deployment_bundle_ready",
        "production_rollback_bundle_ready", "authenticated_e2e_proven",
    ]:
        require(package[key] is False, f"{key} must remain false")

    expected_paths = {
        "source_package_v1": PACKAGE_V1,
        "preview_bundle_assembler": PREVIEW_ASSEMBLER,
        "consolidated_bounded_candidate": BOUNDED,
        "minimal_grants_candidate": GRANTS,
        "release_baseline": RELEASE,
        "readonly_attestation": ATTESTATION,
        "readonly_preflight_sql": PREFLIGHT,
    }
    for key, path in expected_paths.items():
        require(package[key] == path.relative_to(ROOT).as_posix(), f"{key} path drifted")

    require(package_v1["status"] == "repository_only_review_candidate_not_executable", "package v1 status drifted")
    require(preview["status"] == "repository_only_ci_assembler_not_deployable", "preview assembler status drifted")
    require(bounded["status"] == "repository_only_consolidated_candidate_not_executable", "bounded candidate status drifted")
    require(bounded["fixture_policy"]["schema_and_fixture_data_separated"] is True, "bounded fixture isolation missing")
    require(bounded["fixture_policy"]["documents_inserted_before_mutation_assertions"] == 0, "bounded document baseline is not zero")
    require(bounded["fixture_policy"]["risks_inserted_before_mutation_assertions"] == 0, "bounded risk baseline is not zero")
    require(grants["status"] == "repository_only_minimal_grants_candidate_not_applied", "minimal grants status drifted")
    require(grants["grant_change_allowed"] is False, "minimal grants were enabled")

    components = package["components"]
    require([item["order"] for item in components] == [1, 2, 3, 4], "package component order drifted")
    require(
        [item["id"] for item in components] == ["quality", "bounded_consolidated", "intake", "edge_candidate"],
        "package component IDs drifted",
    )
    for component in components[:3]:
        require(component["sequential_preview_apply_proven"] is False, f"{component['id']} claims sequential apply proof")
        require(component["can_apply_in_preview"] is False, f"{component['id']} permits preview apply")
    require(components[1]["duplicate_forward_sources"] == 0, "bounded component still reports duplicate sources")
    require(components[1]["forward_artifact"] == bounded["forward_file"], "bounded forward artifact drifted")
    require(components[1]["rollback_artifact"] == bounded["rollback_file"], "bounded rollback artifact drifted")

    edge = components[3]
    require(edge["entrypoint"] == EDGE_CANDIDATE.relative_to(ROOT).as_posix(), "Edge candidate path drifted")
    require(edge["production_snapshot"] == EDGE_SNAPSHOT.relative_to(ROOT).as_posix(), "Edge snapshot path drifted")
    require(edge["feature_flag_default"] is False and edge["deployed"] is False and edge["can_deploy"] is False, "Edge candidate escaped disabled state")
    require(edge["verify_jwt_required"] is True, "Edge candidate lost JWT requirement")
    require("const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;" in edge_candidate, "Edge candidate flag is not false")
    require("routeBoundedTaskEdgeActionV2" in edge_candidate, "Edge candidate route missing")
    require("routeBoundedTaskEdgeActionV2" not in edge_snapshot, "production Edge snapshot contains candidate route")
    for relative in edge["support_files"]:
        require((ROOT / relative).is_file(), f"Edge support file missing: {relative}")

    require(
        attestation["status"] == "captured_read_only_production_attestation_not_execution_approval",
        "attestation status drifted",
    )
    require(attestation["production_project_ref"] == package["production_project_ref"], "attestation project ref drifted")
    require(attestation["project_status"] == "ACTIVE_HEALTHY", "production project is not attested healthy")
    require(attestation["postgres_major"] == 17, "PostgreSQL major attestation drifted")
    require(attestation["data_mutated"] is False and attestation["ddl_executed"] is False, "attestation claims mutation")
    require(attestation["branches"]["preview"] == 0, "preview branch unexpectedly attested")
    require(attestation["technical_identity_absence"]["auth_users"] == 0, "technical Auth users unexpectedly attested")
    require(attestation["technical_identity_absence"]["profiles"] == 0, "technical profiles unexpectedly attested")
    require(attestation["candidate_database_absence"]["candidate_objects_present"] == 0, "candidate DB objects unexpectedly attested")
    require(attestation["migration_boundary"]["latest_navigator_migration"] == "20260716063401", "Navigator migration boundary drifted")
    require(attestation["migration_boundary"]["latest_remote_migration"] == "20260720201701", "overall remote migration snapshot drifted")
    require(attestation["edge_function"]["version"] == 4, "Edge live version drifted")
    require(attestation["edge_function"]["verify_jwt"] is True, "Edge JWT attestation drifted")
    require(
        attestation["edge_function"]["ezbr_sha256"] == "b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095",
        "Edge live bundle hash drifted",
    )

    migration = package["migration_boundary"]
    require(migration["navigator_boundary_verified"] is True, "Navigator boundary is not verified")
    require(migration["latest_navigator_migration"] == "20260716063401", "package Navigator boundary drifted")
    require(migration["latest_remote_migration"] == "20260720201701", "package remote boundary drifted")
    require(release["latest_live_migration"] == "20260715203158", "release baseline changed without reconciliation")
    require(migration["release_baseline_latest_live_migration"] == release["latest_live_migration"], "release baseline snapshot mismatch")
    require(migration["release_baseline_drift_detected"] is True, "release baseline drift is not explicit")
    require(migration["later_remote_migrations_are_non_navigator"] is True, "later remote migration scope is not explicit")
    require(migration["release_baseline_refresh_allowed"] is False, "release baseline refresh was allowed")

    sql = executable_sql(preflight)
    require("begin transaction read only;" in sql.lower(), "read-only transaction marker missing")
    require("rollback;" in sql.lower(), "read-only rollback marker missing")
    require("aggregate_only" in sql, "aggregate-only marker missing")
    forbidden_sql = re.compile(r"\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|comment|copy|call|do)\b", re.I)
    require(not forbidden_sql.search(sql), "read-only preflight contains DDL or DML")
    for marker in [
        "latest_navigator_migration", "nav_v2_intake_save_requests_v1",
        "nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)", "nav-e2e",
        "task_status_counts", "data_mutated",
    ]:
        require(marker in preflight, f"preflight marker missing: {marker}")

    required_checks = set(package["required_checks"])
    for check in [
        "all_declared_sources_exist", "readonly_preflight_has_no_ddl_or_dml",
        "readonly_attestation_matches_expected_project", "navigator_migration_boundary_matches_live_snapshot",
        "release_baseline_drift_is_explicit", "preview_bundle_index_valid",
        "bounded_consolidated_index_valid", "exact_component_artifact_sha256",
        "exact_component_source_order", "package_index_is_byte_deterministic",
        "edge_candidate_file_set_hashed", "edge_candidate_feature_flag_false",
        "production_edge_snapshot_unchanged", "no_output_under_supabase_migrations",
    ]:
        require(check in required_checks, f"required check missing: {check}")

    active_stops = set(package["active_stops"])
    for stop in [
        "release_baseline_migration_drift_unreconciled",
        "cross_component_sequential_apply_not_proven",
        "preview_branch_missing", "explicit_cost_approval_missing",
        "technical_accounts_missing", "authenticated_role_matrix_not_run",
        "edge_runtime_feature_flag_disabled", "edge_not_deployed",
        "preview_apply_not_approved", "production_deployment_not_approved",
    ]:
        require(stop in active_stops, f"active stop missing: {stop}")

    forbidden_actions = set(package["forbidden_actions"])
    for action in [
        "treat_review_index_as_executable_migration",
        "apply_components_sequentially_without_combined_lifecycle_proof",
        "write_generated_sql_to_supabase_migrations",
        "create_supabase_branch_without_explicit_cost_approval",
        "perform_cost_confirmation", "create_technical_accounts",
        "apply_database_changes", "deploy_edge_function",
        "change_auth_rls_or_grants", "copy_production_data",
        "modify_or_reconcile_leader_migrations", "mutate_or_cleanup_production_rows",
        "claim_preview_or_production_readiness",
    ]:
        require(action in forbidden_actions, f"forbidden action missing: {action}")

    for marker in [
        "--preview-bundle-dir", "--bounded-dir", "--output-dir",
        "preview-candidate-package-v2-index.json", "package output must be outside the repository",
        "package output cannot target supabase/migrations", "deployment_bundle_ready: false",
    ]:
        require(marker in assembler, f"assembler marker missing: {marker}")
    for marker in [
        "--package-dir", "--preview-bundle-dir", "--bounded-dir", "--report",
        "exact source order", "release baseline drift", "read-only preflight contains DDL or DML",
    ]:
        require(marker.lower() in node_checker.lower(), f"semantic checker marker missing: {marker}")

    for marker in [
        "assemble-nav-v2-preview-candidate-package-v2.mjs",
        "check-nav-v2-preview-candidate-package-v2.mjs",
        "nav-v2-preview-candidate-package-v2",
        "actions/upload-artifact@v4",
    ]:
        require(marker in workflow, f"workflow marker missing: {marker}")
    for forbidden_marker in [
        "supabase db push", "supabase functions deploy", "confirm_cost",
        "create_branch", "apply_migration", "deploy_edge_function",
    ]:
        require(forbidden_marker not in workflow.lower(), f"workflow contains forbidden cloud action: {forbidden_marker}")

    for marker in [
        "Package v2", "Read-only preflight", "Migration boundary drift",
        "Consolidated bounded link", "Temporary package index",
        "Active stops", "Rollback", "Production remains unchanged",
    ]:
        require(marker in doc, f"documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*preview*candidate*package*v2*")]
    require(not leaked, f"package v2 leaked into migrations: {leaked}")

    print("Navigator v2 preview candidate package v2 source contract passed")


if __name__ == "__main__":
    main()
