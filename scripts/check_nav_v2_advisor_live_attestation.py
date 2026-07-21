from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "config/nav-v2-rpc-surface.json"
POLICY_PATH = ROOT / "config/nav-v2-advisor-scope.json"
ATTESTATION_PATH = ROOT / "config/nav-v2-advisor-live-attestation.json"
PREFLIGHT_PATH = ROOT / "tests/sql/nav_v2_advisor_readonly_preflight_v1.sql"
EXTERNAL_CATEGORIES = ("frontend_api", "admin_api", "demo_api")
EXPECTED_PROJECT_REF = "ofewxuqfjhamgerwzull"
EXPECTED_SOURCE_MAIN = "746a806aaa2f6be572754e076fcfd359288f2abf"
EXPECTED_NAVIGATOR_MIGRATION = "20260716063401"
EXPECTED_REMOTE_MIGRATION = "20260721122333"
EXPECTED_EDGE_HASH = "b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def executable_sql(text: str) -> str:
    return "\n".join(
        line for line in text.splitlines()
        if not line.strip().startswith("--")
    )


def main() -> int:
    errors: list[str] = []

    for path in (REGISTRY_PATH, POLICY_PATH, ATTESTATION_PATH, PREFLIGHT_PATH):
        if not path.exists():
            fail(errors, f"Missing required file: {path.relative_to(ROOT)}")

    if errors:
        for error in errors:
            print(error)
        return 1

    registry = load_json(REGISTRY_PATH)
    policy = load_json(POLICY_PATH)
    attestation = load_json(ATTESTATION_PATH)
    preflight = PREFLIGHT_PATH.read_text(encoding="utf-8")

    if attestation.get("schema_version") != 2:
        fail(errors, "Advisor live attestation schema_version must be 2")
    if attestation.get("status") != "captured_read_only_navigator_advisor_attestation_not_change_approval":
        fail(errors, "Advisor live attestation status escaped the read-only boundary")
    if attestation.get("project_ref") != EXPECTED_PROJECT_REF:
        fail(errors, "Advisor live attestation project_ref drifted")
    if attestation.get("source_main_sha") != EXPECTED_SOURCE_MAIN:
        fail(errors, "Advisor live attestation source main drifted")
    if attestation.get("observed_at") != "2026-07-21T13:19:29.070311+00:00":
        fail(errors, "Advisor live attestation capture timestamp drifted")

    source = attestation.get("source")
    if not isinstance(source, dict):
        fail(errors, "Advisor live attestation source must be an object")
        source = {}
    if source.get("lint_name") != "authenticated_security_definer_function_executable":
        fail(errors, "Advisor live attestation lint_name drifted")
    if source.get("lint_code") != "0029":
        fail(errors, "Advisor live attestation lint_code must be 0029")
    if source.get("readonly_preflight_sql") != PREFLIGHT_PATH.relative_to(ROOT).as_posix():
        fail(errors, "Advisor live attestation preflight source drifted")
    management_checks = source.get("management_checks")
    if not isinstance(management_checks, list):
        fail(errors, "Advisor live attestation management_checks must be a list")
        management_checks = []
    for marker in (
        "Supabase.get_project",
        "Supabase.list_branches",
        "Supabase.list_migrations",
        "Supabase.list_edge_functions",
        "Supabase.get_advisors security",
        "Supabase.execute_sql read-only aggregate preflight",
    ):
        if marker not in management_checks:
            fail(errors, f"Advisor live evidence source missing: {marker}")

    external: set[str] = set()
    seen: dict[str, str] = {}
    for category in EXTERNAL_CATEGORIES:
        values = registry.get(category)
        if not isinstance(values, list):
            fail(errors, f"RPC registry category {category} must be a list")
            continue
        for name in values:
            if not isinstance(name, str) or not name.startswith("nav_v2_"):
                fail(errors, f"Invalid RPC name in {category}: {name!r}")
                continue
            previous = seen.get(name)
            if previous:
                fail(errors, f"RPC {name} classified twice: {previous}, {category}")
                continue
            seen[name] = category
            external.add(name)

    internal = registry.get("internal_only")
    if not isinstance(internal, list):
        fail(errors, "RPC registry internal_only must be a list")
        internal = []
    overlap = sorted(external.intersection(internal))
    if overlap:
        fail(errors, "External RPCs leaked into internal_only: " + ", ".join(overlap))

    rule = policy.get("authenticated_security_definer")
    if not isinstance(rule, dict):
        fail(errors, "Advisor policy authenticated_security_definer must be an object")
        rule = {}

    exceptions_raw = rule.get("security_invoker_exceptions")
    if not isinstance(exceptions_raw, list):
        fail(errors, "security_invoker_exceptions must be a list")
        exceptions_raw = []

    exceptions: set[str] = set()
    for item in exceptions_raw:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            fail(errors, f"Invalid SECURITY INVOKER exception: {item!r}")
            continue
        if not item.get("reason"):
            fail(errors, f"SECURITY INVOKER exception lacks reason: {item!r}")
        exceptions.add(item["name"])

    expected = external - exceptions
    result = attestation.get("result")
    if not isinstance(result, dict):
        fail(errors, "Advisor live attestation result must be an object")
        result = {}

    functions = result.get("functions")
    if not isinstance(functions, list) or any(not isinstance(name, str) for name in functions):
        fail(errors, "Advisor live attestation functions must be a string list")
        functions = []

    observed_list = list(functions)
    observed = set(observed_list)
    if observed_list != sorted(observed_list):
        fail(errors, "Advisor live attestation functions must be sorted")
    if len(observed_list) != len(observed):
        fail(errors, "Advisor live attestation functions contain duplicates")

    missing = sorted(expected - observed)
    unexpected = sorted(observed - expected)

    if result.get("status") != "match":
        fail(errors, "Advisor live attestation status must be match")
    if result.get("expected_count") != len(expected):
        fail(errors, f"Attested expected_count drifted: {result.get('expected_count')!r} != {len(expected)}")
    if result.get("observed_count") != len(observed):
        fail(errors, f"Attested observed_count drifted: {result.get('observed_count')!r} != {len(observed)}")
    if rule.get("expected_warning_count") != len(expected):
        fail(errors, "Advisor policy expected_warning_count drifted from RPC registry")
    if result.get("missing") != [] or missing:
        fail(errors, "Advisor live attestation is missing expected functions: " + ", ".join(missing))
    if result.get("unexpected") != [] or unexpected:
        fail(errors, "Advisor live attestation has unexpected functions: " + ", ".join(unexpected))

    environment = attestation.get("environment")
    if not isinstance(environment, dict):
        fail(errors, "Advisor environment evidence must be an object")
        environment = {}
    if environment.get("project_status") != "ACTIVE_HEALTHY":
        fail(errors, "Advisor environment is not attested ACTIVE_HEALTHY")
    if environment.get("region") != "eu-west-1":
        fail(errors, "Advisor environment region drifted")
    if environment.get("postgres_major") != 17:
        fail(errors, "Advisor environment PostgreSQL major drifted")
    if environment.get("branch_total") != 1 or environment.get("preview_branch_count") != 0:
        fail(errors, "Advisor environment branch baseline drifted")
    edge = environment.get("edge_function")
    if not isinstance(edge, dict):
        fail(errors, "Advisor Edge evidence must be an object")
        edge = {}
    if edge.get("slug") != "nav-v2-deal-api" or edge.get("version") != 4:
        fail(errors, "Advisor Edge version baseline drifted")
    if edge.get("status") != "ACTIVE" or edge.get("verify_jwt") is not True:
        fail(errors, "Advisor Edge active/JWT baseline drifted")
    if edge.get("ezbr_sha256") != EXPECTED_EDGE_HASH:
        fail(errors, "Advisor Edge bundle hash drifted")

    migration = attestation.get("migration_boundary")
    if not isinstance(migration, dict):
        fail(errors, "Advisor migration boundary must be an object")
        migration = {}
    if migration.get("latest_navigator_version") != EXPECTED_NAVIGATOR_MIGRATION:
        fail(errors, "Advisor Navigator migration boundary drifted")
    if migration.get("latest_remote_version") != EXPECTED_REMOTE_MIGRATION:
        fail(errors, "Advisor overall remote migration boundary drifted")
    if migration.get("latest_remote_name") != "revoke_anon_execute_leader_internal_rpcs":
        fail(errors, "Advisor latest remote migration name drifted")
    if migration.get("latest_navigator_name") != "nav_v2_correct_mortgage_broker_scope":
        fail(errors, "Advisor latest Navigator migration name drifted")
    if migration.get("navigator_boundary_changed") is not False:
        fail(errors, "Advisor attestation incorrectly claims Navigator migration change")
    if migration.get("later_remote_migration_is_non_navigator") is not True:
        fail(errors, "Advisor attestation lost non-Navigator migration boundary")
    if migration.get("navigator_may_modify_leader_history") is not False:
        fail(errors, "Advisor attestation allowed Navigator to modify leader history")

    candidate = attestation.get("candidate_database_absence")
    if not isinstance(candidate, dict):
        fail(errors, "candidate_database_absence must be an object")
        candidate = {}
    for key in (
        "task_contract_version_column",
        "mutation_events_table",
        "bounded_create_rpc",
        "intake_ledger",
        "intake_mapper",
    ):
        if candidate.get(key) is not False:
            fail(errors, f"Candidate database object unexpectedly present: {key}")
    if candidate.get("candidate_objects_present") != 0:
        fail(errors, "Candidate database object count must remain zero")

    identities = attestation.get("technical_identity_absence")
    if not isinstance(identities, dict):
        fail(errors, "technical_identity_absence must be an object")
        identities = {}
    if identities.get("auth_users") != 0 or identities.get("profiles") != 0:
        fail(errors, "Technical nav-e2e identities unexpectedly exist")

    leaked = attestation.get("auth_leaked_password_protection")
    if not isinstance(leaked, dict):
        fail(errors, "auth_leaked_password_protection must be an object")
        leaked = {}
    if leaked.get("advisor_warning_present") is not True:
        fail(errors, "Live attestation must record the current leaked-password warning")
    if leaked.get("status") != policy.get("leaked_password_protection", {}).get("status"):
        fail(errors, "Leaked-password attestation status drifted from policy")
    blocked_by = set(leaked.get("blocked_by_issues", []))
    if not {16, 159, 282}.issubset(blocked_by):
        fail(errors, "Leaked-password blocker lost invite, authenticated E2E or cost gate")
    if leaked.get("production_setting_changed") is not False:
        fail(errors, "Leaked-password production setting was marked changed")

    safety = attestation.get("safety")
    if not isinstance(safety, dict):
        fail(errors, "Advisor safety evidence must be an object")
        safety = {}
    if safety.get("transaction_read_only") is not True or safety.get("aggregate_only") is not True:
        fail(errors, "Advisor capture was not read-only aggregate-only")
    for key in (
        "data_mutated",
        "ddl_executed",
        "grants_changed",
        "auth_changed",
        "edge_deployed",
        "branch_created",
        "cost_confirmation_performed",
    ):
        if safety.get(key) is not False:
            fail(errors, f"Advisor safety flag must remain false: {key}")

    limitations = attestation.get("limitations")
    required_limitations = (
        "does_not_replace_authenticated_e2e",
        "does_not_authorize_grant_changes",
        "does_not_authorize_auth_changes",
        "does_not_mark_unrelated_shared_project_warnings_fixed",
        "refresh_after_rpc_registry_or_grant_change",
        "refresh_after_remote_migration_or_edge_change",
    )
    if not isinstance(limitations, dict):
        fail(errors, "Advisor live attestation limitations must be an object")
        limitations = {}
    for key in required_limitations:
        if limitations.get(key) is not True:
            fail(errors, f"Advisor live attestation limitation must remain true: {key}")

    sql = executable_sql(preflight)
    if "begin transaction read only;" not in sql.lower():
        fail(errors, "Advisor preflight lacks read-only transaction")
    if "rollback;" not in sql.lower():
        fail(errors, "Advisor preflight lacks rollback")
    forbidden_sql = re.compile(
        r"\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|comment|copy|call|do)\b",
        re.I,
    )
    if forbidden_sql.search(sql):
        fail(errors, "Advisor read-only preflight contains DDL or DML")
    for marker in (
        "authenticated_security_definer_function_executable",
        "has_function_privilege('authenticated'",
        "latest_remote_version",
        "latest_navigator_version",
        "nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)",
        "nav-e2e",
        "transaction_read_only",
        "aggregate_only",
        "data_mutated",
        "ddl_executed",
    ):
        if marker not in preflight:
            fail(errors, f"Advisor preflight marker missing: {marker}")

    if errors:
        print("Navigator v2 Advisor live attestation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 Advisor drift attestation passed: "
        f"{len(observed)} observed SECURITY DEFINER warnings match the curated registry; "
        f"Navigator migration {EXPECTED_NAVIGATOR_MIGRATION} and Edge v4 remain unchanged; "
        f"remote migration {EXPECTED_REMOTE_MIGRATION} is explicitly outside Navigator scope; "
        "no preview branch, candidate objects, technical identities or production mutations were observed."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
