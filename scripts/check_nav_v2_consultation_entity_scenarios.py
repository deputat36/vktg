from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixtures/nav-v2-consultation-entity-scenarios.json"
CONTRACT = ROOT / "config/nav-v2-consultation-entity-contract.json"


def can_view(case: dict, profiles: dict) -> bool:
    actor = case["actor"]
    actor_profile = profiles[actor]
    role = actor_profile["role"]
    creator = case["creator"]
    creator_profile = profiles[creator]
    if role in {"owner", "admin"}:
        return True
    if actor == creator:
        return True
    if role == "manager" and creator_profile.get("manager_id") == actor:
        return True
    if case.get("lawyer_id") == actor:
        return True
    if role == "lawyer" and case.get("lawyer_id") is None and case.get("status") in {"new", "need_info"}:
        return True
    if actor in set(case.get("authored") or []):
        return True
    return False


def lifecycle(case: dict) -> tuple[bool, str]:
    current = case.get("from")
    action = case["action"]
    role = case["actor_role"]
    decision = case.get("decision")

    if action == "create":
        allowed = role in {"owner", "admin", "manager", "spn", "lawyer"}
        return allowed, "new" if allowed else current

    if action == "decide":
        allowed = (
            role in {"lawyer", "owner", "admin"}
            and current not in {"converted", "closed"}
            and decision in {"answer", "need_info", "convert_to_preparation"}
            and (decision != "convert_to_preparation" or case.get("conversion_mode") in {"deposit", "deal"})
        )
        if not allowed:
            return False, current
        return True, "need_info" if decision == "need_info" else "answered"

    if action == "reply":
        allowed = role in {"spn", "manager", "owner", "admin"} and current == "need_info" and decision == "need_info"
        return allowed, "new" if allowed else current

    if action == "request_conversion":
        allowed = (
            role in {"spn", "manager", "owner", "admin"}
            and current == "answered"
            and decision == "convert_to_preparation"
            and case.get("conversion_mode") in {"deposit", "deal"}
        )
        return allowed, current

    if action == "bind_conversion":
        allowed = (
            role in {"spn", "manager", "owner", "admin"}
            and current == "answered"
            and decision == "convert_to_preparation"
            and case.get("conversion_requested") is True
            and case.get("deal_bound") is True
        )
        return allowed, "converted" if allowed else current

    if action == "close":
        allowed = role in {"spn", "manager", "lawyer", "owner", "admin"} and current != "converted"
        return allowed, "closed" if allowed else current

    raise AssertionError(f"Unknown lifecycle action: {action}")


def main() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    assert fixture["synthetic_only"] is True

    profiles = fixture["profiles"]
    for case in fixture["access_cases"]:
        actual = can_view(case, profiles)
        assert actual is case["expected"], f"{case['id']}: access expected {case['expected']}, got {actual}"

    for case in fixture["lifecycle_cases"]:
        allowed, status = lifecycle(case)
        assert allowed is case["allowed"], f"{case['id']}: allowed expected {case['allowed']}, got {allowed}"
        assert status == case["expected_status"], f"{case['id']}: status expected {case['expected_status']}, got {status}"
        if case["action"] == "request_conversion" and allowed:
            assert case.get("creates_deal") is False
            assert case.get("creates_backlog") is False

    mortgage_codes = {"mortgage", "military_mortgage"}
    for case in fixture["funding_cases"]:
        actual = bool(mortgage_codes.intersection(case["funding"]))
        assert actual is case["broker_scope_needed"], f"{case['id']}: broker scope mismatch"

    list_keys = set(contract["list_dto_keys"])
    card_keys = set(contract["card_dto_keys"])
    forbidden = set(fixture["dto_forbidden_keys"])
    assert not list_keys.intersection(forbidden), f"Forbidden list DTO keys: {sorted(list_keys.intersection(forbidden))}"
    assert not card_keys.intersection(forbidden), f"Forbidden card DTO keys: {sorted(card_keys.intersection(forbidden))}"
    assert "answer_text" not in list_keys
    assert "documents_url" not in list_keys
    assert "known_facts" not in list_keys
    assert {"answer_text", "documents_url", "known_facts"}.issubset(card_keys)

    assert set(fixture["required_event_types"]) == set(contract["audit_contract"]["event_types"])
    assert contract["broker_scope"]["matcap_without_mortgage"] is False
    assert contract["broker_scope"]["certificate_without_mortgage"] is False
    assert contract["broker_scope"]["legal_queue_access"] is False
    assert contract["conversion_contract"]["request_creates_deal"] is False
    assert contract["conversion_contract"]["request_creates_tasks"] is False
    assert contract["conversion_contract"]["request_creates_documents"] is False
    assert contract["conversion_contract"]["request_creates_risks"] is False

    print(
        "Navigator v2 consultation entity scenarios passed: "
        f"{len(fixture['access_cases'])} access, "
        f"{len(fixture['lifecycle_cases'])} lifecycle, "
        f"{len(fixture['funding_cases'])} funding cases"
    )


if __name__ == "__main__":
    main()
