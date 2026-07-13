from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "config/nav-v2-rpc-surface.json"
POLICY_PATH = ROOT / "config/nav-v2-advisor-scope.json"
EXTERNAL_CATEGORIES = ("frontend_api", "admin_api", "demo_api")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def add_error(errors: list[str], message: str) -> None:
    errors.append(message)


def registered_external_api(registry: dict[str, Any], errors: list[str]) -> set[str]:
    result: set[str] = set()
    seen: dict[str, str] = {}

    if registry.get("schema_version") != 1:
        add_error(errors, "config/nav-v2-rpc-surface.json: schema_version must be 1")

    for category in EXTERNAL_CATEGORIES:
        values = registry.get(category)
        if not isinstance(values, list):
            add_error(errors, f"RPC registry category {category!r} must be a list")
            continue
        for name in values:
            if not isinstance(name, str) or not name.startswith("nav_v2_"):
                add_error(errors, f"Invalid Navigator v2 RPC name in {category}: {name!r}")
                continue
            previous = seen.get(name)
            if previous:
                add_error(errors, f"RPC {name} is classified twice: {previous} and {category}")
            else:
                seen[name] = category
                result.add(name)

    internal = set(registry.get("internal_only", []))
    overlap = sorted(result & internal)
    if overlap:
        add_error(errors, "External and internal RPC categories overlap: " + ", ".join(overlap))

    return result


def validate_policy(
    policy: dict[str, Any],
    registry: dict[str, Any],
) -> tuple[set[str], set[str], list[str]]:
    errors: list[str] = []
    external = registered_external_api(registry, errors)

    if policy.get("schema_version") != 1:
        add_error(errors, "config/nav-v2-advisor-scope.json: schema_version must be 1")
    if policy.get("source_registry") != "config/nav-v2-rpc-surface.json":
        add_error(errors, "Advisor scope must point to config/nav-v2-rpc-surface.json")

    scope = policy.get("shared_project_scope")
    if not isinstance(scope, dict):
        add_error(errors, "shared_project_scope must be an object")
        scope = {}

    included_prefix = scope.get("included_function_prefix")
    if included_prefix != "nav_v2_":
        add_error(errors, "Advisor scope must include only the nav_v2_ function prefix")

    excluded_prefixes = scope.get("excluded_subsystem_prefixes")
    if not isinstance(excluded_prefixes, list) or not excluded_prefixes:
        add_error(errors, "excluded_subsystem_prefixes must be a non-empty list")
        excluded_prefixes = []
    for prefix in excluded_prefixes:
        if not isinstance(prefix, str) or not prefix.endswith("_"):
            add_error(errors, f"Invalid excluded subsystem prefix: {prefix!r}")
        if isinstance(prefix, str) and (
            included_prefix.startswith(prefix) or prefix.startswith(included_prefix)
        ):
            add_error(errors, f"Excluded prefix overlaps Navigator v2 scope: {prefix}")

    rule = policy.get("authenticated_security_definer")
    if not isinstance(rule, dict):
        add_error(errors, "authenticated_security_definer must be an object")
        rule = {}

    categories = rule.get("registry_categories")
    if categories != list(EXTERNAL_CATEGORIES):
        add_error(
            errors,
            "authenticated_security_definer.registry_categories must match "
            + ", ".join(EXTERNAL_CATEGORIES),
        )

    exceptions_raw = rule.get("security_invoker_exceptions")
    if not isinstance(exceptions_raw, list):
        add_error(errors, "security_invoker_exceptions must be a list")
        exceptions_raw = []

    exceptions: set[str] = set()
    for item in exceptions_raw:
        if not isinstance(item, dict):
            add_error(errors, f"Invalid SECURITY INVOKER exception: {item!r}")
            continue
        name = item.get("name")
        reason = item.get("reason")
        if not isinstance(name, str) or not name.startswith("nav_v2_"):
            add_error(errors, f"Invalid SECURITY INVOKER exception name: {name!r}")
            continue
        if name in exceptions:
            add_error(errors, f"Duplicate SECURITY INVOKER exception: {name}")
        exceptions.add(name)
        if name not in external:
            add_error(errors, f"SECURITY INVOKER exception is not a registered external RPC: {name}")
        if not isinstance(reason, str) or len(reason.strip()) < 20:
            add_error(errors, f"SECURITY INVOKER exception requires a meaningful reason: {name}")

    expected = external - exceptions
    expected_count = rule.get("expected_warning_count")
    if expected_count != len(expected):
        add_error(
            errors,
            "expected_warning_count drift: "
            f"config={expected_count!r}, calculated={len(expected)}",
        )

    if rule.get("decision") != "intentional_with_server_gate":
        add_error(errors, "SECURITY DEFINER decision must be intentional_with_server_gate")
    if rule.get("never_auto_revoke") is not True:
        add_error(errors, "never_auto_revoke must remain true")

    evidence = rule.get("required_evidence")
    if not isinstance(evidence, list) or len(evidence) < 5:
        add_error(errors, "required_evidence must document grants and role/data gates")

    password = policy.get("leaked_password_protection")
    if not isinstance(password, dict):
        add_error(errors, "leaked_password_protection must be an object")
    else:
        if password.get("advisor_lint_name") != "auth_leaked_password_protection":
            add_error(errors, "Unexpected leaked-password Advisor lint name")
        if password.get("status") not in {"blocked", "enabled"}:
            add_error(errors, "leaked_password_protection.status must be blocked or enabled")
        blockers = password.get("blocked_by_issues")
        if password.get("status") == "blocked" and (
            not isinstance(blockers, list) or not {16, 159}.issubset(set(blockers))
        ):
            add_error(errors, "Blocked leaked-password protection must reference issues #16 and #159")

    return expected, exceptions, errors


def extract_lints(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        raise ValueError("Advisor JSON must be an object or list")

    if isinstance(payload.get("lints"), list):
        return [item for item in payload["lints"] if isinstance(item, dict)]

    result = payload.get("result")
    if isinstance(result, dict) and isinstance(result.get("lints"), list):
        return [item for item in result["lints"] if isinstance(item, dict)]

    raise ValueError("Advisor JSON does not contain a lints array")


def lint_subject(lint: dict[str, Any]) -> str | None:
    metadata = lint.get("metadata")
    if isinstance(metadata, dict):
        name = metadata.get("name")
        if isinstance(name, str):
            return name
    return None


def evaluate_advisor(
    lints: list[dict[str, Any]],
    policy: dict[str, Any],
    expected: set[str],
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    notes: list[str] = []
    rule = policy["authenticated_security_definer"]
    lint_name = rule["advisor_lint_name"]
    prefix = policy["shared_project_scope"]["included_function_prefix"]

    observed_list = [
        lint_subject(lint)
        for lint in lints
        if lint.get("name") == lint_name
        and isinstance(lint_subject(lint), str)
        and lint_subject(lint).startswith(prefix)
    ]
    observed = set(observed_list)
    duplicate_counts = Counter(observed_list)
    duplicates = sorted(name for name, count in duplicate_counts.items() if count > 1)

    missing = sorted(expected - observed)
    extra = sorted(observed - expected)
    if missing:
        add_error(errors, "Advisor is missing expected Navigator v2 0029 warnings: " + ", ".join(missing))
    if extra:
        add_error(errors, "Advisor has unclassified Navigator v2 0029 warnings: " + ", ".join(extra))
    if duplicates:
        add_error(errors, "Advisor returned duplicate Navigator v2 0029 warnings: " + ", ".join(duplicates))

    unexpected_nav_lints: list[str] = []
    for lint in lints:
        subject = lint_subject(lint)
        name = lint.get("name")
        if isinstance(subject, str) and subject.startswith(prefix) and name != lint_name:
            unexpected_nav_lints.append(f"{name}:{subject}")
    if unexpected_nav_lints:
        add_error(
            errors,
            "Advisor has other unclassified Navigator v2 warnings: "
            + ", ".join(sorted(unexpected_nav_lints)),
        )

    password_lint = policy["leaked_password_protection"]["advisor_lint_name"]
    password_present = any(lint.get("name") == password_lint for lint in lints)
    password_status = policy["leaked_password_protection"]["status"]
    if password_present and password_status == "blocked":
        notes.append("Leaked-password protection remains BLOCKED by documented auth E2E prerequisites.")
    elif password_present and password_status == "enabled":
        add_error(errors, "Leaked-password protection is documented as enabled but Advisor still reports it disabled.")
    elif not password_present and password_status == "blocked":
        notes.append("Advisor no longer reports leaked-password protection; update the policy status after verification.")

    unrelated = sum(
        1
        for lint in lints
        if not (
            isinstance(lint_subject(lint), str)
            and lint_subject(lint).startswith(prefix)
        )
        and lint.get("name") != password_lint
    )
    notes.append(f"Ignored {unrelated} unrelated shared-project Advisor items without marking them fixed.")
    return errors, notes


def self_test(policy: dict[str, Any], expected: set[str]) -> list[str]:
    failures: list[str] = []
    lint_name = policy["authenticated_security_definer"]["advisor_lint_name"]
    password_lint = policy["leaked_password_protection"]["advisor_lint_name"]

    baseline = [
        {"name": lint_name, "metadata": {"name": name, "schema": "public"}}
        for name in sorted(expected)
    ]
    baseline.extend(
        [
            {"name": lint_name, "metadata": {"name": "leader_example", "schema": "public"}},
            {"name": password_lint, "metadata": {"type": "auth", "entity": "Auth"}},
        ]
    )

    errors, _ = evaluate_advisor(baseline, policy, expected)
    if errors:
        failures.append("Valid synthetic Advisor snapshot was rejected: " + "; ".join(errors))

    missing = baseline[1:]
    errors, _ = evaluate_advisor(missing, policy, expected)
    if not any("missing expected" in error.lower() for error in errors):
        failures.append("Self-test did not detect a missing expected warning")

    unexpected = baseline + [
        {"name": lint_name, "metadata": {"name": "nav_v2_unregistered_rpc", "schema": "public"}}
    ]
    errors, _ = evaluate_advisor(unexpected, policy, expected)
    if not any("unclassified" in error.lower() for error in errors):
        failures.append("Self-test did not detect an unexpected Navigator v2 warning")

    return failures


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate the Navigator v2-only Supabase Advisor scope and optional live Advisor JSON."
    )
    parser.add_argument("--advisor-json", type=Path, help="Supabase Advisor JSON export to compare with the policy")
    parser.add_argument("--self-test", action="store_true", help="Run parser and drift-detection self-tests")
    args = parser.parse_args()

    if not REGISTRY_PATH.exists() or not POLICY_PATH.exists():
        print("Missing Navigator v2 RPC registry or Advisor scope config")
        return 1

    registry = load_json(REGISTRY_PATH)
    policy = load_json(POLICY_PATH)
    expected, exceptions, errors = validate_policy(policy, registry)

    if args.self_test and not errors:
        errors.extend(self_test(policy, expected))

    notes: list[str] = []
    if args.advisor_json:
        try:
            lints = extract_lints(load_json(args.advisor_json))
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            errors.append(f"Cannot read Advisor JSON: {exc}")
        else:
            live_errors, live_notes = evaluate_advisor(lints, policy, expected)
            errors.extend(live_errors)
            notes.extend(live_notes)

    if notes:
        print("Navigator v2 Advisor notes:")
        for note in notes:
            print(f"- {note}")

    if errors:
        print("Navigator v2 Advisor scope errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 Advisor scope passed: "
        f"{len(expected)} intentional SECURITY DEFINER warnings, "
        f"{len(exceptions)} SECURITY INVOKER exceptions, "
        f"{sum(len(registry[category]) for category in EXTERNAL_CATEGORIES)} curated public RPCs"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
