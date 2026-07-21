#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-deployment-decision-package-v1.json"
AUTH = ROOT / "config/nav-v2-auth-e2e-readiness.json"
FINAL = ROOT / "config/nav-v2-intake-special-semantics-integration-v1.json"
CLEANUP = ROOT / "config/nav-v2-legacy-quality-cleanup-decision-v1.json"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    auth = json.loads(AUTH.read_text(encoding="utf-8"))
    final = json.loads(FINAL.read_text(encoding="utf-8"))
    cleanup = json.loads(CLEANUP.read_text(encoding="utf-8"))

    require(config["status"] == "repository_only_decision_package", "package escaped repository-only status")
    for key in [
        "production_applied", "production_ready", "deployment_bundle_ready",
        "authenticated_e2e_proven", "branch_cost_rechecked", "branch_creation_allowed",
        "technical_accounts_created",
    ]:
        require(config[key] is False, f"{key} must remain false")
    require(config["selected_deployment_option"] is None, "deployment option selected automatically")
    require(config["selected_cleanup_option"] is None, "cleanup option selected automatically")

    evidence = config["repository_evidence"]
    require(evidence["catalog_supported_count"] == 25, "catalog support count differs from 25")
    require(evidence["catalog_unsupported_count"] == 0, "catalog unsupported count differs from zero")
    require(final["effective_supported_count"] == 25, "final integration contract differs from 25")
    require(final["effective_unsupported_count"] == 0, "final integration contract has unsupported rules")
    require(final["production_ready"] is False, "final integration claims production readiness")
    require(auth["authenticated_e2e_proven"] is False, "auth package unexpectedly claims E2E proof")
    require(auth["supabase_branch_created"] is False, "auth package unexpectedly claims branch creation")
    require(auth["historical_cost_snapshot"]["stale_for_execution"] is True, "historical cost must remain stale")
    require(auth["historical_cost_snapshot"]["must_recheck_before_branch_creation"] is True, "cost recheck gate missing")
    require(cleanup["selected_option"] is None, "legacy cleanup option selected outside owner decision")

    options = config["owner_options"]
    require(len(options) == 3, "owner option count changed")
    require(sum(bool(option.get("recommended_next")) for option in options) == 1, "exactly one next option must be recommended")
    require(options[0]["id"] == "authenticated_e2e_only", "authenticated E2E is no longer the recommended next step")
    require(options[0]["allows_production_merge"] is False, "E2E-only option allows production merge")

    rollout = config["ordered_rollout"]
    require([phase["order"] for phase in rollout] == list(range(10)), "rollout order is not exact 0..9")
    require(rollout[2]["target"] == "non_production_only", "preview branch target changed")
    require(rollout[6]["id"] == "branch_rollback_and_delete", "branch cleanup phase moved")
    require(rollout[7]["id"] == "separate_production_decision", "production decision is not separate")
    require(rollout[9]["id"] == "optional_legacy_cleanup", "cleanup is not last and optional")
    require("selected_cleanup_option" in rollout[9]["required_evidence"], "cleanup owner decision evidence missing")

    required_roles = rollout[4]["required_roles"]
    require(required_roles == ["admin", "manager", "spn", "lawyer", "broker", "viewer"], "authenticated role inventory changed")
    matrix = rollout[5]["required_evidence"]
    for item in ["allowed_deals", "forbidden_deals", "broker_mortgage_only", "viewer_read_only", "cross_actor_replay_rejected", "identity_chain"]:
        require(item in matrix, f"role matrix evidence missing: {item}")

    stops = set(config["mandatory_stops"])
    for stop in [
        "selected_deployment_option_missing", "current_branch_cost_missing",
        "explicit_cost_approval_missing", "deployment_bundle_not_ready",
        "authenticated_e2e_not_proven", "production_deployment_approval_missing",
        "rollback_attestation_missing", "cleanup_option_unselected",
    ]:
        require(stop in stops, f"mandatory stop missing: {stop}")

    for artifact in config["source_artifacts"]:
        require((ROOT / artifact).is_file(), f"source artifact missing: {artifact}")

    leaked = [path.name for path in MIGRATIONS.glob("*deployment*decision*")]
    require(not leaked, f"decision package leaked into migrations: {leaked}")
    print("Navigator v2 deployment decision package source contract passed")


if __name__ == "__main__":
    main()
