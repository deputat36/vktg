#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/nav-v2-preview-bundle-assembler-v1.json"
MANIFEST = ROOT / "config/nav-v2-preview-deployment-bundle-manifest-v1.json"
ASSEMBLER = ROOT / "scripts/assemble-nav-v2-preview-bundle-v1.mjs"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assembler = ASSEMBLER.read_text(encoding="utf-8")

    require(config["schema_version"] == 1, "unexpected assembler version")
    require(config["status"] == "repository_only_ci_assembler_not_deployable", "assembler escaped repository-only status")
    for key in [
        "production_applied", "preview_branch_created", "cloud_execution_allowed",
        "writes_to_supabase_migrations_allowed", "edge_deploy_allowed",
        "deployment_bundle_ready", "production_rollback_bundle_ready",
    ]:
        require(config[key] is False, f"{key} must remain false")
    require(config["artifacts_are_rehearsal_only"] is True, "artifacts are not marked rehearsal-only")
    require(config["output_directory_policy"] == "caller_supplied_temporary_directory_only", "output policy changed")
    require(config["source_manifest"] == "config/nav-v2-preview-deployment-bundle-manifest-v1.json", "source manifest changed")
    require(manifest["repository_source_inventory_complete"] is True, "source manifest is incomplete")
    require(manifest["deployment_bundle_ready"] is False, "source manifest claims deployment readiness")

    segments = config["segments"]
    require([segment["order"] for segment in segments] == [1, 2, 3, 4], "segment order changed")
    require([segment["id"] for segment in segments] == ["quality", "bounded_core", "bounded_dto", "intake"], "segment IDs changed")
    require(len({segment["forward_file"] for segment in segments}) == 4, "forward filenames are not unique")
    require(len({segment["rollback_file"] for segment in segments}) == 4, "rollback filenames are not unique")

    all_sources: list[str] = []
    for segment in segments:
        require(segment["production_executable"] is False, f"{segment['id']} is marked production executable")
        require(segment["forward_sources"], f"{segment['id']} has no forward sources")
        require(segment["rollback_sources"], f"{segment['id']} has no rollback sources")
        require(segment["postgres_setup"], f"{segment['id']} has no PostgreSQL setup")
        require(segment["postgres_assertions"], f"{segment['id']} has no PostgreSQL assertions")
        all_sources.extend(segment["forward_sources"])
        all_sources.extend(segment["rollback_sources"])
        all_sources.extend(segment["postgres_setup"])
        all_sources.extend(segment["postgres_assertions"])
        for generated in segment.get("generated_forward_sources", []):
            all_sources.extend([generated["renderer"], generated["template"], generated["catalog"]])

    for relative in all_sources:
        require((ROOT / relative).is_file(), f"declared assembler source missing: {relative}")

    intake = segments[3]
    require(len(intake.get("generated_forward_sources", [])) == 1, "intake must have exactly one generated source")
    generated = intake["generated_forward_sources"][0]
    require(generated["id"] == "canonical_intake_adapter", "generated intake source changed")
    require(generated["renderer"] == "scripts/render-nav-v2-intake-server-adapter-v1.mjs", "intake renderer changed")
    require(intake["forward_sources"][-1] == "supabase/prototypes/nav_v2_intake_special_semantics_mapping_v1.sql", "final 25-rule mapper is not last")
    require(intake["rollback_sources"][2:5] == [
        "tests/sql/nav_v2_intake_semantics_wave2_integration_rollback.sql",
        "tests/sql/nav_v2_intake_semantics_wave2_rollback.sql",
        "tests/sql/nav_v2_intake_semantics_wave2_governed_cleanup_for_base_rollback.sql",
    ], "wave2 rollback and cleanup order changed")

    bounded_core = segments[1]
    require(bounded_core["forward_sources"] == [
        "supabase/prototypes/nav_v2_bounded_task_contract.sql",
        "supabase/prototypes/nav_v2_bounded_task_mutations.sql",
        "supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql",
    ], "bounded core order changed")
    require(bounded_core["postgres_setup"] == ["tests/sql/nav_v2_bounded_task_mutation_setup.sql"], "bounded core harness changed")
    require(bounded_core["rollback_sources"][-1] == "tests/sql/nav_v2_bounded_task_base_rollback.sql", "bounded core base rollback is not last")

    bounded_dto = segments[2]
    require(bounded_dto["forward_sources"] == [
        "supabase/prototypes/nav_v2_bounded_task_contract.sql",
        "supabase/prototypes/nav_v2_bounded_task_mutations.sql",
        "supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql",
        "supabase/prototypes/nav_v2_get_deal_card_lite_bounded_tasks.sql",
    ], "bounded DTO order changed")
    require(bounded_dto["postgres_setup"] == [
        "tests/sql/nav_v2_bounded_task_mutation_setup.sql",
        "tests/sql/nav_v2_deal_card_lite_bounded_setup.sql",
    ], "bounded DTO harness changed")
    require("supabase/prototypes/nav_v2_bounded_task_actor_aware_mutations.sql" not in bounded_dto["forward_sources"], "DTO segment contains actor overlay")

    quality = segments[0]
    require(quality["forward_sources"] == [
        "supabase/prototypes/nav_v2_privacy_aligned_quality_completeness_v1.sql",
        "supabase/prototypes/nav_v2_privacy_aligned_quality_task_author_v1.sql",
    ], "quality replacement/authorship order changed")

    required_markers = [
        "--output-dir is required",
        "assembler output must be outside the repository",
        "assembler output cannot target supabase/migrations",
        "unresolved intake adapter marker",
        "unexpected exact function redefinitions",
        "deployment_bundle_ready: false",
        "production_rollback_bundle_ready: false",
        "preview_branch_created: false",
        "production_applied: false",
    ]
    for marker in required_markers:
        require(marker in assembler, f"assembler boundary marker missing: {marker}")
    for forbidden in ["Supabase.", "confirm_cost", "create_branch", "apply_migration", "deploy_edge_function", "Deno.env"]:
        require(forbidden not in assembler, f"assembler contains cloud/deploy marker: {forbidden}")

    required_checks = set(config["required_checks"])
    for check in [
        "two_assemblies_are_byte_identical", "all_declared_sources_exist",
        "source_order_matches_contract", "no_unresolved_intake_template_markers",
        "no_output_under_supabase_migrations", "artifact_sha256_matches_index",
        "postgres_17_quality_apply_assert_rollback",
        "postgres_17_bounded_core_apply_assert_rollback",
        "postgres_17_bounded_dto_apply_assert_rollback",
        "postgres_17_intake_apply_assert_rollback",
    ]:
        require(check in required_checks, f"required check missing: {check}")

    leaked = [path.name for path in MIGRATIONS.glob("*preview*bundle*assembler*")]
    require(not leaked, f"assembler leaked into migrations: {leaked}")
    print("Navigator v2 preview bundle assembler source contract passed")


if __name__ == "__main__":
    main()
