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
SHARED_RELEASE = ROOT / "config/nav-v2-release-drift-shared-project-v1.json"
PREFLIGHT = ROOT / "tests/sql/nav_v2_preview_readonly_preflight_v1.sql"
ASSEMBLER = ROOT / "scripts/assemble-nav-v2-preview-candidate-package-v2.mjs"
NODE_CHECKER = ROOT / "scripts/check-nav-v2-preview-candidate-package-v2.mjs"
WORKFLOW = ROOT / ".github/workflows/nav-v2-preview-candidate-package-v2.yml"
DOC = ROOT / "docs/NAV_V2_PREVIEW_CANDIDATE_PACKAGE_V2_2026-07-21.md"
EDGE_CANDIDATE = ROOT / "supabase/functions/nav-v2-deal-api/index.ts"
EDGE_SNAPSHOT = ROOT / "supabase/functions/nav-v2-deal-api/index.production-v4.ts"
MIGRATIONS = ROOT / "supabase/migrations"

EXPECTED_REMOTE_MIGRATION = "20260721122333"
EXPECTED_REMOTE_MIGRATION_NAME = "revoke_anon_execute_leader_internal_rpcs"
EXPECTED_NAVIGATOR_MIGRATION = "20260716063401"
HISTORICAL_RELEASE_BASELINE = "20260715203158"
CURRENT_RELEASE_BASELINE = "20260716063401"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def load(path: Path) -> dict:
    require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")
    return json.loads(path.read_text(encoding="utf-8"))


def executable_sql(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not line.strip().startswith("--"))


def main() -> None:
    package = load(PACKAGE)
    attestation = load(ATTESTATION)
    package_v1 = load(PACKAGE_V1)
    preview = load(PREVIEW_ASSEMBLER)
    bounded = load(BOUNDED)
    grants = load(GRANTS)
    release = load(RELEASE)
    shared_release = load(SHARED_RELEASE)
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
    require(package["source_main_sha"] == "7741346264646e31917c64f64d8eeca91217e855", "package v2 source main drifted")
    require(package["production_project_ref"] == "ofewxuqfjhamgerwzull", "production project ref drifted")
    require(package["review_candidate_ready"] is True, "package v2 is not review-ready")
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
    require(components[1]["duplicate_forward_sources"] == 0, "bounded component reports duplicate sources")

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

    require(attestation["status"] == "captured_read_only_production_attestation_not_execution_approval", "attestation status drifted")
    require(attestation["production_project_ref"] == package["production_project_ref"], "attestation project ref drifted")
    require(attestation["project_status"] == "ACTIVE_HEALTHY", "production project is not attested healthy")
    require(attestation["postgres_major"] == 17, "PostgreSQL major attestation drifted")
    require(attestation["data_mutated"] is False and attestation["ddl_executed"] is False, "attestation claims mutation")
    require(attestation["branches"]["preview"] == 0, "preview branch unexpectedly attested")
    require(attestation["technical_identity_absence"]["auth_users"] == 0, "technical Auth users unexpectedly attested")
    require(attestation["technical_identity_absence"]["profiles"] == 0, "technical profiles unexpectedly attested")
    require(attestation["candidate_database_absence"]["candidate_objects_present"] == 0, "candidate DB objects unexpectedly attested")
    require(attestation["migration_boundary"]["latest_navigator_migration"] == EXPECTED_NAVIGATOR_MIGRATION, "Navigator migration boundary drifted")
    require(attestation["migration_boundary"]["latest_remote_migration"] == EXPECTED_REMOTE_MIGRATION, "overall remote migration snapshot drifted")
    require(attestation["migration_boundary"]["latest_remote_migration_name"] == EXPECTED_REMOTE_MIGRATION_NAME, "overall remote migration name drifted")
    require(attestation["migration_boundary"]["latest_remote_migration_is_non_navigator"] is True, "overall remote migration scope is not explicit")
    require(attestation["migration_boundary"]["navigator_may_modify_leader_history"] is False, "Navigator was allowed to modify leader history")
    require(attestation["edge_function"]["version"] == 4, "Edge live version drifted")
    require(attestation["edge_function"]["verify_jwt"] is True, "Edge JWT attestation drifted")

    migration = package["migration_boundary"]
    require(migration["navigator_boundary_verified"] is True, "Navigator boundary is not verified")
    require(migration["latest_navigator_migration"] == EXPECTED_NAVIGATOR_MIGRATION, "package Navigator boundary drifted")
    require(migration["latest_remote_migration"] == EXPECTED_REMOTE_MIGRATION, "package remote boundary drifted")
    require(migration["release_baseline_latest_live_migration"] == HISTORICAL_RELEASE_BASELINE, "historical package v2 baseline snapshot drifted")
    require(migration["release_baseline_drift_detected"] is True, "historical package v2 drift evidence was rewritten")
    require(migration["release_baseline_refresh_allowed"] is False, "historical package v2 allowed automatic baseline refresh")
    require(release["latest_live_migration"] == CURRENT_RELEASE_BASELINE, "current release baseline is not reconciled")
    require(shared_release["current_navigator_live_migration"] == CURRENT_RELEASE_BASELINE, "shared-project contract baseline drifted")
    require(shared_release["navigator_baseline_semantics"] == "required_present_not_global_latest", "shared-project baseline semantics drifted")
    require(shared_release["result"]["production_mutation"] is False, "shared-project reconciliation claims production mutation")

    sql = executable_sql(preflight)
    require("begin transaction read only;" in sql.lower(), "read-only transaction marker missing")
    require("rollback;" in sql.lower(), "read-only rollback marker missing")
    require("aggregate_only" in sql, "aggregate-only marker missing")
    forbidden_sql = re.compile(r"\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|comment|copy|call|do)\b", re.I)
    require(not forbidden_sql.search(sql), "read-only preflight contains DDL or DML")

    active_stops = set(package["active_stops"])
    for stop in [
        "release_baseline_migration_drift_unreconciled",
        "cross_component_sequential_apply_not_proven",
        "preview_branch_missing", "explicit_cost_approval_missing",
        "technical_accounts_missing", "authenticated_role_matrix_not_run",
        "edge_runtime_feature_flag_disabled", "edge_not_deployed",
        "preview_apply_not_approved", "production_deployment_not_approved",
    ]:
        require(stop in active_stops, f"historical package v2 stop missing: {stop}")

    forbidden_actions = set(package["forbidden_actions"])
    for action in [
        "create_supabase_branch_without_explicit_cost_approval", "perform_cost_confirmation",
        "create_technical_accounts", "apply_database_changes", "deploy_edge_function",
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
    require("historical_release_baseline_drift_explicit" in node_checker, "Node checker does not preserve historical package evidence")
    require("current_release_baseline_reconciled" in node_checker, "Node checker does not validate current baseline reconciliation")
    for marker in [
        "check_nav_v2_preview_candidate_package_v2.py", "check-nav-v2-preview-candidate-package-v2.mjs",
        "actions/upload-artifact@v4", "postgres:17-alpine",
    ]:
        require(marker in workflow, f"workflow marker missing: {marker}")
    for marker in [
        "Package v2", "Production remains unchanged", "historical snapshot",
        "required_present_not_global_latest", "Active stops", "issue #282",
    ]:
        require(marker in doc, f"documentation marker missing: {marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*preview*candidate*package*v2*")]
    require(not leaked, f"package v2 leaked into migrations: {leaked}")
    print("Navigator v2 preview candidate package v2 source contract passed: historical evidence preserved, current release baseline reconciled")


if __name__ == "__main__":
    main()
