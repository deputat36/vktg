#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAPPING = ROOT / "config/nav-v2-query-to-index-mapping-v1.json"
CANDIDATE = ROOT / "config/nav-v2-index-query-plan-candidate-v1.json"
FK_EVIDENCE = ROOT / "config/nav-v2-index-fk-parent-mutation-evidence-v1.json"
DOC = ROOT / "docs/NAV_V2_QUERY_TO_INDEX_MAPPING_V1_2026-07-21.md"
WORKFLOW = ROOT / ".github/workflows/nav-v2-query-to-index-mapping-v1.yml"
MIGRATIONS = ROOT / "supabase/migrations"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def collect_keys(value: object) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            keys.add(str(key))
            keys.update(collect_keys(child))
    elif isinstance(value, list):
        for child in value:
            keys.update(collect_keys(child))
    return keys


def category(mapping: dict, category_id: str) -> dict:
    matches = [item for item in mapping["role_index_mapping"]["categories"] if item["id"] == category_id]
    require(len(matches) == 1, f"role category must exist exactly once: {category_id}")
    return matches[0]


def main() -> None:
    for path in (MAPPING, CANDIDATE, FK_EVIDENCE, DOC, WORKFLOW):
        require(path.is_file(), f"missing source: {path.relative_to(ROOT)}")

    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    candidate = json.loads(CANDIDATE.read_text(encoding="utf-8"))
    fk_evidence = json.loads(FK_EVIDENCE.read_text(encoding="utf-8"))
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    require(mapping["schema_version"] == 1, "unexpected mapping schema version")
    require(
        mapping["status"] == "repository_only_exact_non_pii_query_to_index_mapping_not_ddl_approval",
        "mapping escaped repository-only boundary",
    )
    require(mapping["project_ref"] == "ofewxuqfjhamgerwzull", "project ref drifted")
    require(mapping["captured_on"] == "2026-07-21", "capture date drifted")
    require(mapping["source_main_sha"] == "a165833adebf0357031223cab8f49d8881d6a4a9", "source main SHA drifted")
    for key in (
        "production_applied",
        "production_ddl_authorized",
        "index_drop_authorized",
        "index_create_authorized",
        "cloud_execution_allowed",
        "business_rows_read",
        "pii_returned",
    ):
        require(mapping[key] is False, f"boundary flag must remain false: {key}")
    require(mapping["function_definitions_read"] is True, "function-definition evidence marker missing")

    source = mapping["source_evidence"]
    require(source["candidate_inventory"] == CANDIDATE.relative_to(ROOT).as_posix(), "candidate source drifted")
    require(source["canonical_fk_evidence"] == FK_EVIDENCE.relative_to(ROOT).as_posix(), "FK evidence source drifted")
    require(source["role_reference_inventory_count"] == 24, "role reference inventory count drifted")
    require(source["answers_function_consumer_count"] == 2, "answers inventory count drifted")

    live_inventory = candidate["live_consumer_inventory"]
    candidate_role_consumers = set(live_inventory["role_consumers"])
    candidate_answer_consumers = set(live_inventory["answers_consumers"])
    require(live_inventory["role_consumer_count"] == 24, "candidate role consumer count drifted")
    require(len(candidate_role_consumers) == 24, "candidate role consumer signatures are not unique")
    require(live_inventory["answers_consumer_count"] == 2, "candidate answers consumer count drifted")
    require(len(candidate_answer_consumers) == 2, "candidate answer consumer signatures are not unique")
    require(live_inventory["pii_returned"] is False, "candidate inventory claims PII")
    require(live_inventory["data_mutated"] is False, "candidate inventory claims data mutation")
    require(live_inventory["ddl_executed"] is False, "candidate inventory claims DDL")

    role = mapping["role_index_mapping"]
    require(role["table"] == "public.nav_user_profiles", "role table drifted")
    require(role["index"] == "nav_user_profiles_role_idx", "role index drifted")
    require(role["column"] == "role", "role column drifted")
    require(role["reference_consumer_count"] == 24, "role mapping count drifted")
    require(role["direct_role_filter_count"] == 2, "direct role filter count drifted")
    require(role["non_demo_direct_role_filter_count"] == 1, "non-demo direct role filter count drifted")
    require(role["decision"] == "retain", "role index decision drifted")
    require(candidate["candidates"][0]["id"] == "profile_role_index", "candidate ordering drifted")
    require(candidate["candidates"][0]["decision"] == role["decision"], "role decision differs from candidate")

    expected_category_counts = {
        "direct_role_filter_runtime": 1,
        "direct_role_filter_demo": 1,
        "whole_table_role_aggregate": 1,
        "role_write_path": 2,
        "profile_pk_lookup_id_join_projection_or_loaded_variable": 19,
    }
    require(len(role["categories"]) == len(expected_category_counts), "role category count drifted")

    classified: list[str] = []
    for category_id, expected_count in expected_category_counts.items():
        item = category(mapping, category_id)
        require(item["count"] == expected_count, f"category declared count drifted: {category_id}")
        require(len(item["consumers"]) == expected_count, f"category consumer count drifted: {category_id}")
        require(len(set(item["consumers"])) == expected_count, f"duplicate signature inside category: {category_id}")
        classified.extend(item["consumers"])

    require(len(classified) == 24, "classified role consumer total drifted")
    require(len(set(classified)) == 24, "a role consumer appears in multiple categories")
    require(set(classified) == candidate_role_consumers, "role category union differs from live inventory")

    require(
        category(mapping, "direct_role_filter_runtime")["consumers"]
        == ["nav_v2_get_team_profile_quality_health()"],
        "runtime role-first consumer drifted",
    )
    require(
        category(mapping, "direct_role_filter_demo")["consumers"]
        == ["nav_v2_seed_demo_data_unchecked_20260622()"],
        "demo role-first consumer drifted",
    )
    require(
        category(mapping, "whole_table_role_aggregate")["consumers"]
        == ["nav_v2_get_access_audit()"],
        "whole-table role aggregate drifted",
    )
    require(
        set(category(mapping, "role_write_path")["consumers"])
        == {
            "nav_v2_link_user_by_email(text,text,nav_v2_user_role,uuid,text)",
            "nav_v2_update_user_profile(uuid,text,nav_v2_user_role,uuid,text,boolean)",
        },
        "role write paths drifted",
    )

    answers = mapping["answers_index_mapping"]
    require(answers["table"] == "public.nav_deal_answers_v2", "answers table drifted")
    require(answers["single_column_index"] == "nav_deal_answers_v2_deal_idx", "answers single index drifted")
    require(
        answers["composite_unique_index"] == "nav_deal_answers_v2_deal_id_question_key_key",
        "answers composite index drifted",
    )
    require(answers["leading_prefix"] == "deal_id", "answers leading prefix drifted")
    require(answers["function_consumer_count"] == 2, "answers mapped consumer count drifted")
    require(answers["direct_filter_or_delete_consumer_count"] == 1, "answers direct filter count drifted")
    require(answers["insert_only_consumer_count"] == 1, "answers insert-only count drifted")
    require(answers["decision"] == "review_possible_redundancy_only", "answers decision drifted")
    require(candidate["candidates"][1]["id"] == "answers_deal_prefix_index", "answers candidate ordering drifted")
    require(candidate["candidates"][1]["decision"] == answers["decision"], "answers decision differs from candidate")

    answer_signatures = [item["signature"] for item in answers["consumers"]]
    require(len(answer_signatures) == 2 and len(set(answer_signatures)) == 2, "answers consumer mapping is not exact")
    require(set(answer_signatures) == candidate_answer_consumers, "answers mapping differs from live inventory")
    answer_by_signature = {item["signature"]: item for item in answers["consumers"]}
    cleanup = answer_by_signature["nav_v2_clear_demo_data_unchecked_20260622()"]
    seed = answer_by_signature["nav_v2_seed_demo_data_unchecked_20260622()"]
    require(cleanup["query_shape"] == "delete_filter_by_deal_id", "demo cleanup query shape drifted")
    require(cleanup["single_index_read_relevance"] is True, "demo cleanup single-index relevance drifted")
    require(cleanup["composite_prefix_read_relevance"] is True, "demo cleanup composite relevance drifted")
    require(cleanup["representative_production_workload"] is False, "demo cleanup promoted to representative workload")
    require(seed["query_shape"] == "insert_only", "demo seed query shape drifted")
    require(seed["single_index_read_relevance"] is False, "insert-only path claims single-index read benefit")
    require(seed["composite_prefix_read_relevance"] is False, "insert-only path claims composite read benefit")
    require(seed["write_maintenance_relevance"] is True, "insert-only path lost write-cost relevance")
    require(seed["representative_production_workload"] is False, "demo seed promoted to representative workload")

    fk = answers["internal_fk_consumer"]
    require(fk["query_shape"] == "parent_fk_child_lookup", "FK query shape drifted")
    require(fk["constraint"] == "nav_deal_answers_v2_deal_id_fkey", "FK constraint drifted")
    require(fk["delete_action"] == "CASCADE" and fk["update_action"] == "NO ACTION", "FK actions drifted")
    require(fk["rpc_consumer"] is False, "internal FK lookup was counted as an RPC")
    require(
        fk["canonical_evidence_status"] == fk_evidence["result"]["decision"],
        "FK evidence decision differs from canonical contract",
    )
    require(fk_evidence["index_drop_authorized"] is False, "canonical FK evidence authorizes index drop")

    corrections = mapping["corrections_to_prior_inventory"]
    require(len(corrections) == 2, "inventory correction count drifted")
    require(any("only 2 contain direct role-first filters" in item["corrected_claim"] for item in corrections), "role correction missing")
    require(any("1 filters/deletes by deal_id and 1 is insert-only" in item["corrected_claim"] for item in corrections), "answers correction missing")

    stops = set(mapping["active_stops"])
    for marker in (
        "production_statistics_window_missing",
        "authenticated_workload_missing",
        "production_explain_analyze_missing",
        "production_scale_fk_parent_mutation_benchmark_missing",
        "write_cost_benefit_missing",
        "production_migration_missing",
        "owner_ddl_approval_missing",
    ):
        require(marker in stops, f"active stop missing: {marker}")

    forbidden = set(mapping["forbidden_actions"])
    for marker in (
        "drop_production_index",
        "create_production_index",
        "apply_production_migration",
        "change_production_rls",
        "copy_production_data_to_harness",
        "create_supabase_branch",
        "change_leader_schema",
        "claim_index_removal_ready",
    ):
        require(marker in forbidden, f"forbidden action missing: {marker}")

    forbidden_data_keys = {
        "source_lines",
        "sample_rows",
        "row_values",
        "row_data",
        "payload",
        "client_data",
        "emails",
        "phone_values",
        "full_names",
        "passport_values",
    }
    require(not (collect_keys(mapping) & forbidden_data_keys), "mapping contains row-level or PII evidence keys")

    for marker in (
        "Exact non-PII query-to-index mapping",
        "Why 24 references are not 24 index consumers",
        "Role index classification",
        "Answers index classification",
        "Corrected decisions",
        "No production rows or PII",
        "Production DDL remains blocked",
        "Production remains unchanged",
    ):
        require(marker in doc, f"documentation marker missing: {marker}")

    for marker in (
        "check_nav_v2_query_to_index_mapping_v1.py",
        "nav-v2-query-to-index-mapping-v1.json",
        "actions/upload-artifact@v4",
    ):
        require(marker in workflow, f"workflow marker missing: {marker}")
    for cloud_marker in (
        "supabase db push",
        "supabase functions deploy",
        "apply_migration",
        "create_branch",
        "confirm_cost",
        "psql",
    ):
        require(cloud_marker not in workflow.lower(), f"workflow contains forbidden cloud/database action: {cloud_marker}")

    leaked = [path.name for path in MIGRATIONS.glob("*query*index*mapping*")]
    require(not leaked, f"mapping leaked into migrations: {leaked}")

    print(
        "Navigator v2 exact query-to-index mapping passed: "
        "24 role references classified as 1 runtime direct filter, 1 demo direct filter, "
        "1 whole-table aggregate, 2 write paths and 19 non-role-first access paths; "
        "answers consumers classified as one delete filter and one insert-only path."
    )


if __name__ == "__main__":
    main()
