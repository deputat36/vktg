#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-combined-preview-lifecycle-v1.json"
INTAKE_ROLLBACK = ROOT / "config/nav-v2-combined-preview-intake-rollback-v1.json"
RUNNER = ROOT / "scripts/run-nav-v2-combined-preview-lifecycle-v1.sh"
ARTIFACT_CHECKER = ROOT / "scripts/check-nav-v2-combined-preview-artifacts-v1.mjs"
WORKFLOW = ROOT / ".github/workflows/nav-v2-combined-preview-lifecycle-v1.yml"
DOC = ROOT / "docs/NAV_V2_COMBINED_PREVIEW_LIFECYCLE_V1_2026-07-21.md"
MIGRATIONS = ROOT / "supabase/migrations"

EXPECTED_INTAKE_ROLLBACK = [
    "tests/sql/nav_v2_intake_special_semantics_integration_rollback.sql",
    "tests/sql/nav_v2_intake_special_semantics_rollback.sql",
    "tests/sql/nav_v2_intake_semantics_wave2_integration_rollback.sql",
    "tests/sql/nav_v2_intake_semantics_wave2_rollback.sql",
    "tests/sql/nav_v2_intake_semantics_wave2_governed_cleanup_for_base_rollback.sql",
    "tests/sql/nav_v2_intake_semantics_wave1_integration_rollback.sql",
    "tests/sql/nav_v2_intake_semantics_wave1_rollback.sql",
    "tests/sql/nav_v2_governed_intake_save_rollback.sql",
    "tests/sql/nav_v2_intake_save_integration_harness_rollback.sql",
    "tests/sql/nav_v2_preview_bundle_intake_mapper_cleanup.sql",
    "tests/sql/nav_v2_combined_preview_intake_adapter_rollback_v1.sql",
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    for path in [CONFIG, INTAKE_ROLLBACK, RUNNER, ARTIFACT_CHECKER, WORKFLOW, DOC]:
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    intake_rollback = json.loads(INTAKE_ROLLBACK.read_text(encoding="utf-8"))
    runner = RUNNER.read_text(encoding="utf-8")
    checker = ARTIFACT_CHECKER.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "unexpected combined lifecycle version")
    require(
        config["status"] == "repository_only_combined_preview_lifecycle_not_executable",
        "combined lifecycle escaped repository-only state",
    )
    require(
        config["source_main_sha"] == "e88b1c3ceb356a9d083c9bc4545b29c93b7ee41a",
        "combined lifecycle source main drifted",
    )
    require(config["production_project_ref"] == "ofewxuqfjhamgerwzull", "production project ref drifted")
    for key in [
        "production_applied", "preview_branch_created", "cloud_execution_allowed",
        "cost_confirmation_performed", "preview_apply_allowed", "edge_deployed",
        "deployment_bundle_ready", "production_rollback_bundle_ready",
        "combined_apply_proven", "combined_rollback_proven",
    ]:
        require(config[key] is False, f"{key} must remain false")

    require([item["order"] for item in config["forward_order"]] == [1, 2, 3], "forward order drifted")
    require(
        [item["id"] for item in config["forward_order"]] == ["quality", "bounded_consolidated", "intake"],
        "forward component IDs drifted",
    )
    require([item["order"] for item in config["rollback_order"]] == [1, 2, 3], "rollback order drifted")
    require(
        [item["id"] for item in config["rollback_order"]] == ["intake", "bounded_consolidated", "quality"],
        "rollback component IDs drifted",
    )

    declared = list(config["shared_setup"]) + list(config["assertion_order"]) + list(config["post_rollback_assertions"])
    declared += [
        config["preview_bundle_assembler"],
        config["bounded_consolidated_candidate"],
        config["package_v2"],
        INTAKE_ROLLBACK.relative_to(ROOT).as_posix(),
    ]
    for relative in declared:
        require((ROOT / relative).is_file(), f"declared source missing: {relative}")

    conflict = config["conflict_policy"]
    require(conflict["exact_object_inventory_required"] is True, "exact object inventory is not required")
    require(conflict["duplicate_forward_source_paths_allowed"] is False, "duplicate source paths were allowed")
    require(
        conflict["expected_exact_function_redefinitions"] == [
            "nav_v2_private.nav_v2_quality_sync_task_v1",
            "public.nav_v2_get_deal_card_lite",
        ],
        "expected function redefinition drifted",
    )
    require(conflict["unexpected_exact_function_redefinitions_allowed"] is False, "unexpected function redefinitions were allowed")
    require(conflict["shared_schema_created_once"] is True, "shared schema is not single-create")

    require(intake_rollback["schema_version"] == 1, "unexpected combined intake rollback version")
    require(
        intake_rollback["status"] == "repository_only_combined_intake_rollback_not_executable",
        "combined intake rollback escaped repository-only state",
    )
    require(intake_rollback["production_applied"] is False, "combined intake rollback claims production apply")
    require(intake_rollback["preview_branch_created"] is False, "combined intake rollback claims preview branch")
    require(intake_rollback["cloud_execution_allowed"] is False, "combined intake rollback permits cloud execution")
    require(intake_rollback["rollback_sources"] == EXPECTED_INTAKE_ROLLBACK, "combined intake rollback order drifted")
    require(
        intake_rollback["replaced_standalone_source"] == "tests/sql/nav_v2_intake_adapter_harness_rollback.sql",
        "standalone intake rollback replacement drifted",
    )
    require(intake_rollback["replaced_standalone_source"] not in intake_rollback["rollback_sources"], "standalone schema-owning rollback is still included")
    for relative in intake_rollback["rollback_sources"]:
        require((ROOT / relative).is_file(), f"combined intake rollback source missing: {relative}")
        require(relative in runner, f"runner does not execute combined intake rollback source: {relative}")

    replacement = (ROOT / intake_rollback["rollback_sources"][-1]).read_text(encoding="utf-8").lower()
    for forbidden in intake_rollback["forbidden_statements_in_replacement"]:
        require(forbidden not in replacement, f"combined intake replacement contains forbidden ownership statement: {forbidden}")
    for marker in [
        "harness.quality_snapshot",
        "nav_v2_private.nav_v2_quality_sync_task_v1",
        "nav_v2_private.nav_v2_task_contract_catalog",
        "combined-safe intake adapter rollback",
    ]:
        require(marker.lower() in replacement, f"combined intake replacement marker missing: {marker}")

    required_checks = set(config["required_checks"])
    for check in [
        "all_declared_sources_exist", "exact_forward_order", "exact_rollback_order",
        "no_duplicate_forward_source_paths", "no_unexpected_exact_function_redefinitions",
        "shared_setup_is_synthetic_only", "postgres_17_quality_bounded_intake_apply",
        "quality_assertions_pass", "bounded_coexistence_assertions_pass",
        "intake_25_rule_assertions_pass", "cross_component_assertions_pass",
        "always_rollback_runs", "post_rollback_candidate_objects_absent",
        "legacy_quality_snapshot_restored", "legacy_task_survives",
        "no_output_under_supabase_migrations",
    ]:
        require(check in required_checks, f"required check missing: {check}")

    for marker in [
        "set -uo pipefail", "ALWAYS ROLLBACK intake", "ALWAYS ROLLBACK bounded_consolidated",
        "ALWAYS ROLLBACK quality", "nav_v2_privacy_aligned_quality_harness_setup.sql",
        "nav_v2_combined_preview_shared_setup_v1.sql",
        "nav_v2_combined_preview_bounded_coexistence_assertions_v1.sql",
        "nav_v2_preview_bundle_intake_final_composite_assertions.sql",
        "nav_v2_combined_preview_post_rollback_assertions_v1.sql",
        "run_combined_intake_rollback",
        "nav_v2_combined_preview_intake_adapter_rollback_v1.sql",
    ]:
        require(marker in runner, f"runner marker missing: {marker}")

    for marker in [
        "--preview-bundle-dir", "--bounded-dir", "--report",
        "duplicate forward source paths", "unexpected exact function redefinitions",
        "duplicate created objects", "deployment_bundle_ready",
    ]:
        require(marker.lower() in checker.lower(), f"artifact checker marker missing: {marker}")

    for marker in [
        "postgres:17", "run-nav-v2-combined-preview-lifecycle-v1.sh",
        "check_nav_v2_combined_preview_lifecycle_v1.py", "actions/upload-artifact@v4",
    ]:
        require(marker in workflow, f"workflow marker missing: {marker}")
    for forbidden in [
        "supabase db push", "supabase functions deploy", "confirm_cost",
        "create_branch", "apply_migration", "deploy_edge_function",
    ]:
        require(forbidden not in workflow.lower(), f"workflow contains forbidden cloud action: {forbidden}")

    for marker in [
        "Combined lifecycle", "Shared synthetic schema", "Conflict inventory",
        "PostgreSQL 17", "ALWAYS ROLLBACK", "Active stops", "Production remains unchanged",
    ]:
        require(marker in doc, f"documentation marker missing: {marker}")

    forbidden_actions = set(config["forbidden_actions"])
    for action in [
        "write_combined_sql_to_supabase_migrations",
        "create_supabase_branch_without_explicit_cost_approval",
        "perform_cost_confirmation", "create_technical_accounts",
        "apply_database_changes", "deploy_edge_function", "change_auth_rls_or_grants",
        "copy_production_data", "modify_or_reconcile_leader_migrations",
        "mutate_or_cleanup_production_rows", "claim_preview_or_production_readiness",
    ]:
        require(action in forbidden_actions, f"forbidden action missing: {action}")

    leaked = [path.name for path in MIGRATIONS.glob("*combined*preview*lifecycle*")]
    require(not leaked, f"combined lifecycle leaked into migrations: {leaked}")

    print("Navigator v2 combined preview lifecycle v1 source contract passed")


if __name__ == "__main__":
    main()
