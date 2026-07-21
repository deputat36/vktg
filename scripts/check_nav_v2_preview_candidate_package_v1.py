#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "config/nav-v2-preview-candidate-package-v1.json"
GRANTS = ROOT / "config/nav-v2-preview-minimal-grants-candidate-v1.json"
ASSEMBLER = ROOT / "config/nav-v2-preview-bundle-assembler-v1.json"
SOURCE_MANIFEST = ROOT / "config/nav-v2-preview-deployment-bundle-manifest-v1.json"
RELEASE_BASELINE = ROOT / "config/nav-v2-release-baseline.json"
EDGE_CANDIDATE = ROOT / "supabase/functions/nav-v2-deal-api/index.ts"
EDGE_SNAPSHOT = ROOT / "supabase/functions/nav-v2-deal-api/index.production-v4.ts"
ACTOR_SQL = ROOT / "supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql"
WORKFLOW = ROOT / ".github/workflows/nav-v2-preview-candidate-package-v1.yml"
DOC = ROOT / "docs/NAV_V2_PREVIEW_CANDIDATE_PACKAGE_V1_2026-07-21.md"
NODE_CHECKER = ROOT / "scripts/check-nav-v2-preview-candidate-package-v1.mjs"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def compact_sql(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def main() -> None:
    for path in [
        PACKAGE, GRANTS, ASSEMBLER, SOURCE_MANIFEST, RELEASE_BASELINE,
        EDGE_CANDIDATE, EDGE_SNAPSHOT, ACTOR_SQL, WORKFLOW, DOC, NODE_CHECKER,
    ]:
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    package = json.loads(PACKAGE.read_text(encoding="utf-8"))
    grants = json.loads(GRANTS.read_text(encoding="utf-8"))
    assembler = json.loads(ASSEMBLER.read_text(encoding="utf-8"))
    source_manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    release = json.loads(RELEASE_BASELINE.read_text(encoding="utf-8"))
    edge_candidate = EDGE_CANDIDATE.read_text(encoding="utf-8")
    edge_snapshot = EDGE_SNAPSHOT.read_text(encoding="utf-8")
    actor_sql = compact_sql(ACTOR_SQL.read_text(encoding="utf-8"))
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    node_checker = NODE_CHECKER.read_text(encoding="utf-8")

    require(package["schema_version"] == 1, "unexpected package version")
    require(package["status"] == "repository_only_review_candidate_not_executable", "package escaped review-only state")
    require(package["source_main_sha"] == "6b0714cb2a713f8413004eff5627c1d83c3e6625", "package source main drifted")
    require(package["production_project_ref"] == "ofewxuqfjhamgerwzull", "production project ref drifted")
    require(package["review_candidate_ready"] is True, "review candidate is not marked ready for review")
    require(package["execution_model"] == "independent_segment_review_not_sequential_deployment", "execution model drifted")
    require(package["artifact_hash_policy"] == "read_exact_sha256_and_source_order_from_deterministic_bundle_index_at_validation", "artifact hash policy drifted")
    for key in [
        "production_applied", "preview_branch_created", "cloud_execution_allowed",
        "preview_apply_allowed", "edge_deploy_allowed", "technical_accounts_allowed",
        "deployment_bundle_ready", "production_rollback_bundle_ready",
    ]:
        require(package[key] is False, f"{key} must remain false")

    require(package["assembler_config"] == ASSEMBLER.relative_to(ROOT).as_posix(), "assembler path drifted")
    require(package["source_manifest"] == SOURCE_MANIFEST.relative_to(ROOT).as_posix(), "source manifest path drifted")
    require(package["minimal_grants_candidate"] == GRANTS.relative_to(ROOT).as_posix(), "minimal grants path drifted")
    require(assembler["status"] == "repository_only_ci_assembler_not_deployable", "assembler status drifted")
    require(assembler["deployment_bundle_ready"] is False, "assembler claims deployment readiness")
    require(source_manifest["edge_runtime_integrated"] is True, "source manifest lost Edge source integration")
    require(source_manifest["edge_runtime_enabled"] is False and source_manifest["edge_deployed"] is False, "source manifest enabled/deployed Edge")
    require(source_manifest["deployment_bundle_ready"] is False, "source manifest claims deployment readiness")

    package_segments = package["segments"]
    assembler_segments = assembler["segments"]
    require([item["order"] for item in package_segments] == [1, 2, 3, 4], "package segment order changed")
    require([item["id"] for item in package_segments] == ["quality", "bounded_core", "bounded_dto", "intake"], "package segment IDs changed")
    require(len(package_segments) == len(assembler_segments), "package/assembler segment count differs")

    for package_segment, assembler_segment in zip(package_segments, assembler_segments):
        require(package_segment["id"] == assembler_segment["id"], f"segment mismatch: {package_segment['id']}")
        require(package_segment["forward_artifact"] == assembler_segment["forward_file"], f"{package_segment['id']} forward artifact drifted")
        require(package_segment["rollback_artifact"] == assembler_segment["rollback_file"], f"{package_segment['id']} rollback artifact drifted")
        require(package_segment["preflight_sources"] == assembler_segment["postgres_setup"], f"{package_segment['id']} preflight drifted")
        require(package_segment["post_apply_assertions"] == assembler_segment["postgres_assertions"], f"{package_segment['id']} assertions drifted")
        require(package_segment["post_rollback_contract"] == assembler_segment["rollback_sources"], f"{package_segment['id']} rollback inventory drifted")
        require(package_segment["can_apply_in_preview"] is False, f"{package_segment['id']} permits preview apply")
        for relative in (
            package_segment["preflight_sources"]
            + package_segment["post_apply_assertions"]
            + package_segment["post_rollback_contract"]
        ):
            require((ROOT / relative).is_file(), f"{package_segment['id']} source missing: {relative}")

    bounded_core = assembler_segments[1]
    bounded_dto = assembler_segments[2]
    actual_shared = [
        item for item in bounded_core["forward_sources"]
        if item in set(bounded_dto["forward_sources"])
    ]
    consolidation = package["bounded_consolidation"]
    require(consolidation["required"] is True, "bounded consolidation is not required")
    require(consolidation["shared_forward_sources"] == actual_shared, "bounded shared source inventory drifted")
    require(consolidation["required_consolidated_forward_order"] == [
        "supabase/prototypes/nav_v2_bounded_task_contract.sql",
        "supabase/prototypes/nav_v2_bounded_task_mutations.sql",
        "supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql",
        "supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql",
        "supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql",
    ], "bounded consolidated forward order drifted")
    require(consolidation["required_consolidated_rollback_order"] == [
        "tests/sql/nav_v2_deal_card_lite_bounded_rollback.sql",
        "tests/sql/nav_v2_bounded_task_actor_aware_rollback.sql",
        "tests/sql/nav_v2_bounded_task_mutation_rollback.sql",
        "tests/sql/nav_v2_bounded_task_base_rollback.sql",
    ], "bounded consolidated rollback order drifted")
    for key in ["consolidated_forward_artifact_created", "consolidated_rollback_artifact_created"]:
        require(consolidation[key] is False, f"{key} must remain false")
    require(consolidation["preview_apply_blocked"] is True, "bounded overlap no longer blocks preview apply")

    require(grants["schema_version"] == 1, "unexpected grants candidate version")
    require(grants["status"] == "repository_only_minimal_grants_candidate_not_applied", "grants candidate escaped repository-only status")
    require(grants["source_path"] == ACTOR_SQL.relative_to(ROOT).as_posix(), "grants source path drifted")
    for key in ["production_applied", "preview_applied", "grant_change_allowed"]:
        require(grants[key] is False, f"grants {key} must remain false")
    rules = grants["security_rules"]
    require(all(value is False for value in rules.values()), "minimal grants security rule was relaxed")

    for helper in grants["private_helpers"]:
        signature = helper["signature"].lower()
        require(helper["allowed_execute_roles"] == [], f"private helper is executable: {signature}")
        require(helper["must_revoke_from"] == ["public", "anon", "authenticated"], f"private helper revoke roles drifted: {signature}")
        marker = f"revoke execute on function {signature} from public, anon, authenticated;"
        require(marker in actor_sql, f"private helper revoke missing: {signature}")

    for rpc in grants["actor_aware_rpcs"]:
        signature = rpc["signature"].lower()
        require(rpc["allowed_execute_roles"] == ["service_role"], f"actor RPC is not service-role-only: {signature}")
        require(rpc["must_revoke_from"] == ["public", "anon", "authenticated"], f"actor RPC revoke roles drifted: {signature}")
        require(f"revoke execute on function {signature} from public, anon, authenticated;" in actor_sql, f"actor RPC revoke missing: {signature}")
        require(f"grant execute on function {signature} to service_role;" in actor_sql, f"actor RPC service grant missing: {signature}")
        require(f"grant execute on function {signature} to authenticated;" not in actor_sql, f"actor RPC authenticated grant found: {signature}")
        require(f"grant execute on function {signature} to anon;" not in actor_sql, f"actor RPC anon grant found: {signature}")

    edge = package["edge_candidate"]
    require(edge["entrypoint"] == EDGE_CANDIDATE.relative_to(ROOT).as_posix(), "Edge candidate path drifted")
    require(edge["production_snapshot"] == EDGE_SNAPSHOT.relative_to(ROOT).as_posix(), "Edge snapshot path drifted")
    require(edge["feature_flag_default"] is False and edge["deployed"] is False and edge["deploy_allowed"] is False, "Edge candidate escaped disabled state")
    require(edge["verify_jwt_required"] is True, "Edge candidate lost JWT requirement")
    for relative in edge["support_files"]:
        require((ROOT / relative).is_file(), f"Edge support file missing: {relative}")
    require('const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;' in edge_candidate, "Edge candidate feature flag is not false")
    require('from "./task-action-edge-runtime-v2.js"' in edge_candidate, "Edge candidate runtime import missing")
    require("routeBoundedTaskEdgeActionV2" not in edge_snapshot, "production Edge snapshot contains candidate route")
    release_edge = release["edge_functions"]["nav-v2-deal-api"]
    require(release_edge["source_path"] == EDGE_SNAPSHOT.relative_to(ROOT).as_posix(), "release baseline does not use immutable production snapshot")
    require(release_edge["version"] == 4 and release_edge["verify_jwt"] is True, "release Edge baseline drifted")

    active_stops = set(package["active_stops"])
    for stop in [
        "bounded_full_forward_not_consolidated", "bounded_full_rollback_not_consolidated",
        "preview_branch_missing", "explicit_cost_approval_missing",
        "technical_account_plan_not_executed", "authenticated_role_matrix_not_run",
        "edge_runtime_feature_flag_disabled", "edge_not_deployed",
        "minimal_grants_not_applied", "preview_apply_not_approved",
        "production_deployment_not_approved", "cleanup_option_unselected",
    ]:
        require(stop in active_stops, f"active stop missing: {stop}")

    forbidden = set(package["forbidden_actions"])
    for action in [
        "apply_rehearsal_artifacts_sequentially_as_deployment",
        "write_generated_sql_to_supabase_migrations",
        "create_supabase_branch_without_explicit_cost_approval",
        "create_technical_accounts", "apply_database_changes", "deploy_edge_function",
        "change_auth_rls_or_grants", "copy_production_data",
        "mutate_or_cleanup_production_rows", "claim_preview_or_production_readiness",
    ]:
        require(action in forbidden, f"forbidden action missing: {action}")

    leaked = [path.name for path in MIGRATIONS.glob("*preview*candidate*package*")]
    require(not leaked, f"preview candidate package leaked into migrations: {leaked}")

    for marker in [
        "check-nav-v2-preview-candidate-package-v1.mjs",
        "nav-v2-preview-candidate-package-v1",
        "actions/upload-artifact@v4",
    ]:
        require(marker in workflow, f"workflow marker missing: {marker}")
    for forbidden_marker in [
        "supabase db push", "supabase functions deploy", "confirm_cost",
        "create_branch", "apply_migration", "deploy_edge_function",
    ]:
        require(forbidden_marker not in workflow.lower(), f"workflow contains forbidden cloud action: {forbidden_marker}")

    for marker in [
        "Review candidate, not executable deployment",
        "Bounded overlap",
        "Minimal grants candidate",
        "Edge file set",
        "Active stops",
        "Rollback",
    ]:
        require(marker in doc, f"documentation marker missing: {marker}")

    for marker in [
        "--bundle-dir", "bundle-index.json", "exact source order",
        "bounded overlap", "deployment_bundle_ready",
        "candidate-package-report.json",
    ]:
        require(marker in node_checker, f"semantic checker marker missing: {marker}")

    print("Navigator v2 preview candidate package v1 source contract passed")


if __name__ == "__main__":
    main()
