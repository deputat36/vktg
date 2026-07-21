#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-bounded-consolidated-candidate-v1.json"
ASSEMBLER = ROOT / "scripts/assemble-nav-v2-bounded-consolidated-candidate-v1.mjs"
ARTIFACT_CHECKER = ROOT / "scripts/check-nav-v2-bounded-consolidated-candidate-v1.mjs"
RUNNER = ROOT / "scripts/run-nav-v2-bounded-consolidated-candidate-v1.sh"
WORKFLOW = ROOT / ".github/workflows/nav-v2-bounded-consolidated-candidate-v1.yml"
DOC = ROOT / "docs/NAV_V2_BOUNDED_CONSOLIDATED_CANDIDATE_V1_2026-07-21.md"
ACTOR_SQL = ROOT / "supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql"
SCHEMA_SETUP = ROOT / "tests/sql/nav_v2_bounded_consolidated_candidate_setup.sql"
MIGRATIONS = ROOT / "supabase/migrations"

EXPECTED_FORWARD = [
    "supabase/prototypes/nav_v2_bounded_task_contract.sql",
    "supabase/prototypes/nav_v2_bounded_task_mutations.sql",
    "supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql",
    "supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql",
    "supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql",
]
EXPECTED_ROLLBACK = [
    "tests/sql/nav_v2_deal_card_lite_bounded_rollback.sql",
    "tests/sql/nav_v2_bounded_task_actor_aware_rollback.sql",
    "tests/sql/nav_v2_bounded_task_mutation_rollback.sql",
    "tests/sql/nav_v2_bounded_task_base_rollback.sql",
]
EXPECTED_SETUP = [
    "tests/sql/nav_v2_bounded_task_mutation_setup.sql",
    "tests/sql/nav_v2_bounded_consolidated_candidate_setup.sql",
]
EXPECTED_ASSERTIONS = [
    "tests/sql/nav_v2_bounded_task_mutation_assertions.sql",
    "tests/sql/nav_v2_bounded_task_actor_aware_assertions.sql",
    "tests/sql/nav_v2_deal_card_lite_bounded_assertions.sql",
    "tests/sql/nav_v2_bounded_consolidated_candidate_assertions.sql",
]
EXPECTED_POST_ROLLBACK = [
    "tests/sql/nav_v2_bounded_consolidated_candidate_post_rollback_assertions.sql",
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    for path in [CONFIG, ASSEMBLER, ARTIFACT_CHECKER, RUNNER, WORKFLOW, DOC, ACTOR_SQL, SCHEMA_SETUP]:
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    assembler = ASSEMBLER.read_text(encoding="utf-8")
    artifact_checker = ARTIFACT_CHECKER.read_text(encoding="utf-8")
    runner = RUNNER.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    actor_sql = " ".join(ACTOR_SQL.read_text(encoding="utf-8").lower().split())
    schema_setup = SCHEMA_SETUP.read_text(encoding="utf-8").lower()

    require(config["schema_version"] == 1, "unexpected candidate version")
    require(config["status"] == "repository_only_consolidated_candidate_not_executable", "candidate escaped repository-only state")
    require(config["source_main_sha"] == "e6e31bd7d39d8b1eb89a23de0bd866879c5d7f92", "source main SHA drifted")
    require(config["production_project_ref"] == "ofewxuqfjhamgerwzull", "production project ref drifted")
    for key in [
        "production_applied", "preview_branch_created", "cloud_execution_allowed",
        "preview_apply_allowed", "writes_to_supabase_migrations_allowed",
        "deployment_bundle_ready", "production_rollback_bundle_ready",
    ]:
        require(config[key] is False, f"{key} must remain false")
    require(config["artifacts_are_temporary_review_candidates"] is True, "candidate artifacts are not marked temporary")
    require(config["output_directory_policy"] == "caller_supplied_temporary_directory_only", "output policy drifted")
    require(config["forward_file"] == "01-bounded-consolidated-forward.sql", "forward filename drifted")
    require(config["rollback_file"] == "01-bounded-consolidated-rollback.sql", "rollback filename drifted")
    require(config["index_file"] == "bounded-consolidated-index.json", "index filename drifted")

    require(config["forward_sources"] == EXPECTED_FORWARD, "exact forward source order drifted")
    require(config["rollback_sources"] == EXPECTED_ROLLBACK, "exact rollback source order drifted")
    require(config["postgres_setup"] == EXPECTED_SETUP, "PostgreSQL setup order drifted")
    require(config["post_apply_assertions"] == EXPECTED_ASSERTIONS, "post-apply assertion order drifted")
    require(config["post_rollback_assertions"] == EXPECTED_POST_ROLLBACK, "post-rollback assertion order drifted")
    require(len(set(config["forward_sources"])) == len(config["forward_sources"]), "duplicate forward path")
    require(len(set(config["rollback_sources"])) == len(config["rollback_sources"]), "duplicate rollback path")

    fixture_policy = config.get("fixture_policy") or {}
    require(fixture_policy.get("schema_and_fixture_data_separated") is True, "schema/fixture separation is not explicit")
    require(fixture_policy.get("documents_inserted_before_mutation_assertions") == 0, "document fixture contaminates mutation assertions")
    require(fixture_policy.get("risks_inserted_before_mutation_assertions") == 0, "risk fixture contaminates mutation assertions")
    for forbidden_sql in [
        "insert into public.nav_deal_documents_v2",
        "insert into public.nav_deal_risks_v2",
    ]:
        require(forbidden_sql not in schema_setup, f"schema-only setup contains fixture data: {forbidden_sql}")
    for required_marker in [
        "alter table public.nav_deal_documents_v2",
        "alter table public.nav_deal_risks_v2",
        "create or replace function public.nav_v2_can_change_document_status",
        "create or replace function public.nav_v2_can_change_task_status",
    ]:
        require(required_marker in schema_setup, f"schema-only setup marker missing: {required_marker}")

    for relative in (
        config["forward_sources"] + config["rollback_sources"] + config["postgres_setup"]
        + config["post_apply_assertions"] + config["post_rollback_assertions"]
    ):
        require((ROOT / relative).is_file(), f"declared source missing: {relative}")

    required_checks = set(config["required_checks"])
    for check in [
        "all_declared_sources_exist", "exact_forward_source_order", "exact_rollback_source_order",
        "no_duplicate_forward_source_paths", "artifact_sha256_matches_index",
        "no_unexpected_exact_function_redefinitions", "postgres_17_apply_assert_rollback",
        "actor_aware_overloads_service_role_only", "explicit_lite_dto_survives_overlay",
        "legacy_task_survives_rollback", "no_output_under_supabase_migrations",
    ]:
        require(check in required_checks, f"required check missing: {check}")

    for marker in [
        "--output-dir is required", "candidate output must be outside the repository",
        "candidate output cannot target supabase/migrations", "duplicate forward source path",
        "unexpected exact function redefinitions", "deployment_bundle_ready: false",
        "production_rollback_bundle_ready: false",
    ]:
        require(marker in assembler, f"assembler marker missing: {marker}")
    for forbidden in ["Supabase.", "confirm_cost", "create_branch", "apply_migration", "deploy_edge_function", "Deno.env"]:
        require(forbidden not in assembler, f"assembler contains cloud/deploy marker: {forbidden}")

    for marker in [
        "--candidate-dir", "bounded-consolidated-index.json", "exact forward source order",
        "exact rollback source order", "artifact sha256", "service_role",
        "deployment_bundle_ready", "bounded-consolidated-report.json",
    ]:
        require(marker in artifact_checker, f"artifact checker marker missing: {marker}")

    for marker in [
        "ALWAYS ROLLBACK", "nav_v2_bounded_task_mutation_setup.sql",
        "nav_v2_bounded_consolidated_candidate_setup.sql",
        "nav_v2_bounded_task_actor_aware_assertions.sql",
        "nav_v2_deal_card_lite_bounded_assertions.sql",
        "nav_v2_bounded_consolidated_candidate_post_rollback_assertions.sql",
    ]:
        require(marker in runner, f"runner marker missing: {marker}")
    require("nav_v2_deal_card_lite_bounded_setup.sql" not in runner, "fixture-bearing DTO setup leaked into consolidated runner")
    require("set -uo pipefail" in runner, "runner fail-closed shell mode missing")

    for marker in [
        "postgres:17", "assemble-nav-v2-bounded-consolidated-candidate-v1.mjs",
        "run-nav-v2-bounded-consolidated-candidate-v1.sh",
        "actions/upload-artifact@v4",
    ]:
        require(marker in workflow, f"workflow marker missing: {marker}")
    for forbidden in [
        "supabase db push", "supabase functions deploy", "confirm_cost",
        "create_branch", "apply_migration", "deploy_edge_function",
    ]:
        require(forbidden not in workflow.lower(), f"workflow contains forbidden cloud action: {forbidden}")

    for marker in [
        "Consolidated order", "PostgreSQL 17 lifecycle", "Service-role boundary",
        "Fixture isolation", "Active stops", "Rollback", "Production remains unchanged",
    ]:
        require(marker in doc, f"documentation marker missing: {marker}")

    actor_signatures = [
        "public.nav_v2_create_bounded_tasks(uuid, jsonb, uuid, uuid)",
        "public.nav_v2_start_bounded_task(uuid, uuid, uuid)",
        "public.nav_v2_complete_bounded_task(uuid, uuid, uuid, uuid)",
        "public.nav_v2_set_bounded_task_active_outcome(uuid, text, text, date, uuid, uuid)",
        "public.nav_v2_propose_bounded_task_terminal_outcome(uuid, text, text, uuid, uuid, uuid)",
        "public.nav_v2_decide_bounded_task_terminal_outcome(uuid, text, uuid, uuid)",
    ]
    for signature in actor_signatures:
        compact = " ".join(signature.lower().split())
        require(f"revoke execute on function {compact} from public, anon, authenticated;" in actor_sql, f"actor revoke missing: {signature}")
        require(f"grant execute on function {compact} to service_role;" in actor_sql, f"service_role grant missing: {signature}")
        require(f"grant execute on function {compact} to authenticated;" not in actor_sql, f"authenticated actor grant found: {signature}")

    leaked = [path.name for path in MIGRATIONS.glob("*bounded*consolidated*candidate*")]
    require(not leaked, f"candidate leaked into migrations: {leaked}")
    print("Navigator v2 consolidated bounded candidate v1 source contract passed")


if __name__ == "__main__":
    main()
