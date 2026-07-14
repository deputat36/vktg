from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "config/nav-v2-rpc-surface.json"
POLICY_PATH = ROOT / "config/nav-v2-advisor-scope.json"
ATTESTATION_PATH = ROOT / "config/nav-v2-advisor-live-attestation.json"
EXTERNAL_CATEGORIES = ("frontend_api", "admin_api", "demo_api")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def main() -> int:
    errors: list[str] = []

    for path in (REGISTRY_PATH, POLICY_PATH, ATTESTATION_PATH):
        if not path.exists():
            fail(errors, f"Missing required file: {path.relative_to(ROOT)}")

    if errors:
        for error in errors:
            print(error)
        return 1

    registry = load_json(REGISTRY_PATH)
    policy = load_json(POLICY_PATH)
    attestation = load_json(ATTESTATION_PATH)

    if attestation.get("schema_version") != 1:
        fail(errors, "Advisor live attestation schema_version must be 1")
    if attestation.get("project_ref") != "ofewxuqfjhamgerwzull":
        fail(errors, "Advisor live attestation project_ref drifted")

    source = attestation.get("source")
    if not isinstance(source, dict):
        fail(errors, "Advisor live attestation source must be an object")
        source = {}
    if source.get("lint_name") != "authenticated_security_definer_function_executable":
        fail(errors, "Advisor live attestation lint_name drifted")
    if source.get("lint_code") != "0029":
        fail(errors, "Advisor live attestation lint_code must be 0029")

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

    leaked = attestation.get("auth_leaked_password_protection")
    if not isinstance(leaked, dict):
        fail(errors, "auth_leaked_password_protection must be an object")
        leaked = {}
    if leaked.get("advisor_warning_present") is not True:
        fail(errors, "Live attestation must record the current leaked-password warning")
    if leaked.get("status") != policy.get("leaked_password_protection", {}).get("status"):
        fail(errors, "Leaked-password attestation status drifted from policy")

    limitations = attestation.get("limitations")
    required_limitations = (
        "does_not_replace_authenticated_e2e",
        "does_not_authorize_grant_changes",
        "does_not_mark_unrelated_shared_project_warnings_fixed",
        "refresh_after_rpc_registry_or_grant_change",
    )
    if not isinstance(limitations, dict):
        fail(errors, "Advisor live attestation limitations must be an object")
        limitations = {}
    for key in required_limitations:
        if limitations.get(key) is not True:
            fail(errors, f"Advisor live attestation limitation must remain true: {key}")

    if errors:
        print("Navigator v2 Advisor live attestation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 Advisor live attestation passed: "
        f"{len(observed)} observed SECURITY DEFINER warnings match the curated registry; "
        "leaked-password protection remains explicitly blocked."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
