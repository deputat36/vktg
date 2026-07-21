#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "config/nav-v2-preview-deployment-bundle-manifest-v1.json"
DECISION = ROOT / "config/nav-v2-deployment-decision-package-v1.json"
AUTH = ROOT / "config/nav-v2-auth-e2e-readiness.json"
FINAL = ROOT / "config/nav-v2-intake-special-semantics-integration-v1.json"
BOUNDED = ROOT / "config/nav-v2-bounded-task-migration-storyboard.json"
IDENTITY = ROOT / "config/nav-v2-task-edge-identity-contract.json"
CLEANUP = ROOT / "config/nav-v2-legacy-quality-cleanup-decision-v1.json"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def all_paths(layer: dict) -> list[str]:
    paths: list[str] = []
    for key in ("source_paths", "rehearsal_paths", "rehearsal_rollback_paths"):
        paths.extend(layer.get(key, []))
    for key in ("storyboard_path", "identity_contract_path"):
        value = layer.get(key)
        if value:
            paths.append(value)
    render = layer.get("render_step") or {}
    if render.get("script"):
        paths.append(render["script"])
    return paths


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    decision = json.loads(DECISION.read_text(encoding="utf-8"))
    auth = json.loads(AUTH.read_text(encoding="utf-8"))
    final = json.loads(FINAL.read_text(encoding="utf-8"))
    bounded = json.loads(BOUNDED.read_text(encoding="utf-8"))
    identity = json.loads(IDENTITY.read_text(encoding="utf-8"))
    cleanup = json.loads(CLEANUP.read_text(encoding="utf-8"))

    require(manifest["schema_version"] == 1, "unexpected manifest version")
    require(manifest["status"] == "repository_only_source_manifest_not_executable", "manifest escaped repository-only status")
    require(manifest["source_baseline_main_sha"] == "dd33b2ab1de6523604386ddbf3aad8d15fd2cdb3", "source baseline changed")
    require(manifest["repository_source_inventory_complete"] is True, "source inventory is incomplete")
    for key in [
        "production_applied", "preview_branch_created", "executable_migrations_created",
        "production_rollback_bundle_ready", "edge_runtime_integrated", "frontend_transport_enabled",
        "authenticated_e2e_proven", "deployment_bundle_ready",
    ]:
        require(manifest[key] is False, f"{key} must remain false")
    require(manifest["selected_deployment_option"] is None, "deployment option selected automatically")
    require(manifest["selected_cleanup_option"] is None, "cleanup option selected automatically")

    cost = manifest["cost_gate"]
    require(cost["amount"] == 0.01344 and cost["recurrence"] == "hourly", "cost snapshot drifted")
    require(abs(cost["six_hour_ceiling"] - cost["amount"] * 6) < 1e-9, "six-hour ceiling drifted")
    require(cost["explicit_owner_cost_approval"] is False, "cost approval was inferred")
    require(cost["cost_confirmation_id"] is None, "cost confirmation exists without approval")
    require(cost["branch_creation_allowed"] is False, "branch creation was enabled")
    require(cost["must_recheck_immediately_before_confirm_cost"] is True, "execution-time recheck missing")

    layers = manifest["layers"]
    require([layer["order"] for layer in layers] == list(range(8)), "layer order is not exact 0..7")
    require([layer["id"] for layer in layers] == [
        "read_only_preflight",
        "privacy_aligned_quality_replacement",
        "bounded_tasks_and_actor_identity",
        "governed_intake_full_25_rule_mapper",
        "edge_identity_and_action_routes",
        "frontend_flagged_transport_pilot",
        "authenticated_preview_e2e",
        "optional_legacy_quality_cleanup",
    ], "layer IDs changed")
    require(all(layer["apply_allowed"] is False for layer in layers), "a layer allows apply")

    for layer in layers:
        for relative in all_paths(layer):
            require((ROOT / relative).is_file(), f"missing bundle source: {relative}")

    privacy = layers[1]
    require(privacy["backfill_allowed"] is False and privacy["legacy_cleanup_allowed"] is False, "privacy layer allows backfill or cleanup")
    require(privacy["production_migration_ready"] is False and privacy["production_rollback_ready"] is False, "privacy layer claims production bundle readiness")

    bounded_layer = layers[2]
    require(bounded["status"] == "repository_only_storyboard_not_a_migration", "bounded storyboard status drifted")
    require(bounded["migration_file_created"] is False and bounded["deployment_ready"] is False, "bounded storyboard claims deployment readiness")
    require(bounded_layer["legacy_rpc_cutover_approved"] is False, "legacy RPC cutover approved unexpectedly")
    require(bounded_layer["final_grant_policy_approved"] is False, "grant policy approved unexpectedly")

    intake = layers[3]
    require(intake["effective_supported_count"] == 25 and intake["effective_unsupported_count"] == 0, "manifest catalog is not 25/0")
    require(final["effective_supported_count"] == 25 and final["effective_unsupported_count"] == 0, "final catalog source is not 25/0")
    require(intake["render_step"]["generated_file_committed"] is False, "generated adapter was committed as executable migration")
    require(intake["production_migration_ready"] is False and intake["production_rollback_ready"] is False, "intake layer claims production bundle readiness")

    edge = layers[4]
    edge_index = (ROOT / "supabase/functions/nav-v2-deal-api/index.ts").read_text(encoding="utf-8")
    require("task-action-edge-identity-v2.js" not in edge_index, "detached identity handler is already imported into Edge runtime")
    require(edge["current_index_imports_identity_handler"] is False, "manifest misstates Edge import status")
    require(edge["edge_deploy_ready"] is False and edge["verified_actor_injection_integrated"] is False, "Edge layer claims readiness")
    require(edge["service_key_exposure_to_browser_allowed"] is False, "service key exposure was allowed")
    require(identity["runtime_integrated"] is False and identity["edge_deployed"] is False, "identity contract claims runtime deployment")

    frontend = layers[5]
    guard = (ROOT / "assets/js/nav-v2/task-action-guard-v2.js").read_text(encoding="utf-8")
    require("const BOUNDED_TRANSPORT_ENABLED = false;" in guard, "bounded transport flag is not false")
    require(frontend["bounded_transport_enabled"] is False and frontend["default_path"] == "legacy_runtime", "frontend transport escaped legacy default")

    e2e = layers[6]
    require(auth["supabase_branch_created"] is False and auth["authenticated_e2e_proven"] is False, "auth package claims cloud execution")
    require(e2e["explicit_cost_approval"] is False and e2e["branch_created"] is False, "E2E layer bypasses cost gate")
    require(e2e["production_data_copy_allowed"] is False, "E2E layer allows production data copy")

    cleanup_layer = layers[7]
    require(cleanup["selected_option"] is None and cleanup_layer["selected_cleanup_option"] is None, "cleanup option selected")
    require(cleanup_layer["cleanup_allowed"] is False and cleanup_layer["privacy_replacement_live"] is False, "cleanup layer claims live replacement")

    for stop in [
        "selected_deployment_option_missing", "explicit_cost_approval_missing", "cost_confirmation_id_missing",
        "preview_branch_missing", "executable_migrations_not_created", "production_rollback_bundle_not_ready",
        "edge_identity_handler_not_integrated", "frontend_bounded_transport_disabled",
        "authenticated_role_matrix_not_run", "production_deployment_approval_missing",
        "pilot_scope_missing", "cleanup_option_unselected",
    ]:
        require(stop in manifest["active_stops"], f"active stop missing: {stop}")

    forbidden = set(manifest["forbidden_actions"])
    for action in [
        "create_supabase_branch_without_explicit_cost_approval",
        "create_or_apply_production_migration",
        "deploy_edge_function",
        "mass_backfill_or_cleanup_legacy_tasks",
        "claim_deployment_readiness",
    ]:
        require(action in forbidden, f"forbidden action missing: {action}")

    leaked = [path.name for path in MIGRATIONS.glob("*preview*deployment*bundle*")]
    require(not leaked, f"bundle manifest leaked into migrations: {leaked}")
    require(decision["deployment_bundle_ready"] is False, "decision package claims deployment bundle readiness")

    print("Navigator v2 preview deployment bundle manifest source contract passed")


if __name__ == "__main__":
    main()
