from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "config/nav-v2-rpc-privacy-inventory.json"
CORRECTIONS = ROOT / "config/nav-v2-rpc-privacy-inventory-corrections.json"
REPORT = ROOT / "docs/NAV_V2_RPC_PRIVACY_INVENTORY_2026-07-16.md"
MIGRATIONS = ROOT / "supabase/migrations"

EXPECTED_RPCS = {
    "nav_v2_get_deals_list",
    "nav_v2_get_dashboard",
    "nav_v2_get_deal_card",
    "nav_v2_get_deal_card_lite",
    "nav_v2_get_operational_readiness_preview",
    "nav_v2_get_lawyer_queue",
    "nav_v2_get_lawyer_review_summary",
    "nav_v2_get_broker_queue_preview",
    "nav_v2_get_operational_adoption_report",
    "nav_v2_get_deal_responsibility_snapshot",
    "nav_v2_get_handoff_scores",
}

CORE_CLIENT_KEYS = {"seller_name", "buyer_name", "seller_phone", "buyer_phone"}
SENSITIVE_TEXT_KEYS = {
    "title",
    "display_title",
    "description",
    "body",
    "problem_note",
    "latest_review_body",
    "settlements_comment",
    "next_action",
    "manager_exception_reason",
    "attention_reason",
    "cannot_advance_reason",
    "cannot_advance_deposit_reason",
    "cannot_advance_deal_reason",
    "main_action",
    "handoff_text",
}
REQUIRED_ENTRY_KEYS = {
    "name",
    "signature",
    "latest_source",
    "consumers",
    "risk",
    "server_contract_status",
    "serialization_patterns",
    "observed_client_identifier_keys",
    "observed_sensitive_free_text_keys",
    "employee_identifier_keys",
    "technical_metadata_keys",
    "current_client_mitigation",
    "server_target",
    "rollout_wave",
}


def latest_definition_source(name: str) -> tuple[Path | None, str]:
    pattern = re.compile(rf"create\s+or\s+replace\s+function\s+public\.{re.escape(name)}\s*\(", re.I)
    matches: list[tuple[Path, str, int]] = []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        text = path.read_text(encoding="utf-8")
        found = list(pattern.finditer(text))
        if found:
            matches.append((path, text, found[-1].start()))
    if not matches:
        return None, ""
    path, text, start = matches[-1]
    next_function = re.search(r"\ncreate\s+or\s+replace\s+function\s+", text[start + 1 :], re.I)
    end = len(text) if next_function is None else start + 1 + next_function.start()
    return path, text[start:end]


def detected_client_keys(function_text: str) -> set[str]:
    lowered = function_text.lower()
    return {key for key in CORE_CLIENT_KEYS if re.search(rf"\b{re.escape(key)}\b", lowered)}


def detected_sensitive_keys(function_text: str) -> set[str]:
    lowered = function_text.lower()
    return {key for key in SENSITIVE_TEXT_KEYS if re.search(rf"\b{re.escape(key)}\b", lowered)}


def has_full_deal_row_output(function_text: str) -> bool:
    lowered = re.sub(r"\s+", " ", function_text.lower())
    return "to_jsonb(d)" in lowered


def apply_corrections(entries: list[dict], corrections: dict) -> None:
    by_name = {entry.get("name"): entry for entry in entries}
    for name, patch in corrections.items():
        entry = by_name.get(name)
        if entry is None:
            continue
        if "latest_source" in patch:
            entry["latest_source"] = patch["latest_source"]
        entry["internal_client_dependency_keys"] = list(
            patch.get("internal_client_dependency_keys", entry.get("internal_client_dependency_keys", []))
        )
        extra_text = patch.get("additional_sensitive_free_text_keys", [])
        if extra_text:
            entry["observed_sensitive_free_text_keys"] = sorted(
                set(entry.get("observed_sensitive_free_text_keys", [])) | set(extra_text)
            )


def main() -> int:
    errors: list[str] = []
    for path in (REGISTRY, CORRECTIONS, REPORT):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    correction_payload = json.loads(CORRECTIONS.read_text(encoding="utf-8"))
    if correction_payload.get("schema_version") != 1:
        errors.append("correction overlay schema_version drifted")

    if registry.get("project_ref") != "ofewxuqfjhamgerwzull":
        errors.append("registry project_ref drifted")
    if registry.get("production_mutation") is not False:
        errors.append("inventory slice must explicitly remain non-mutating")

    categories = set((registry.get("categories") or {}).keys())
    expected_categories = {
        "work_fact",
        "employee_identifier",
        "client_identifier",
        "sensitive_free_text",
        "technical_metadata",
    }
    if categories != expected_categories:
        errors.append(f"category set drifted: {sorted(categories)}")

    entries = registry.get("rpcs") or []
    apply_corrections(entries, correction_payload.get("corrections") or {})
    names = [entry.get("name") for entry in entries]
    if len(names) != len(set(names)):
        errors.append("duplicate RPC entries in privacy inventory")
    if set(names) != EXPECTED_RPCS:
        errors.append(f"RPC inventory set drifted: {sorted(set(names))}")

    unknown_corrections = set((correction_payload.get("corrections") or {})) - set(names)
    if unknown_corrections:
        errors.append(f"corrections reference unknown RPCs: {sorted(unknown_corrections)}")

    client_registry_keys = set(registry.get("client_identifier_keys") or [])
    if not CORE_CLIENT_KEYS.issubset(client_registry_keys):
        errors.append("registry is missing core structured client identifier keys")

    for entry in entries:
        name = entry.get("name") or "<missing>"
        missing = REQUIRED_ENTRY_KEYS - set(entry)
        if missing:
            errors.append(f"{name}: missing fields {sorted(missing)}")
            continue
        if entry["risk"] not in {"low", "medium", "high", "critical"}:
            errors.append(f"{name}: invalid risk {entry['risk']!r}")
        if entry["rollout_wave"] not in {1, 2, 3, 4}:
            errors.append(f"{name}: invalid rollout wave")
        if entry["current_client_mitigation"] not in {"central_frontend_read_layer", "not_required"}:
            errors.append(f"{name}: unknown current mitigation")

        source_path, function_text = latest_definition_source(name)
        if source_path is None:
            errors.append(f"{name}: no repository SQL definition found")
            continue
        relative_source = source_path.relative_to(ROOT).as_posix()
        if relative_source != entry["latest_source"]:
            errors.append(
                f"{name}: latest source drifted; registry={entry['latest_source']} actual={relative_source}"
            )

        detected_clients = detected_client_keys(function_text)
        exposed_clients = set(entry.get("observed_client_identifier_keys") or [])
        internal_clients = set(entry.get("internal_client_dependency_keys") or [])
        acknowledged_clients = exposed_clients | internal_clients
        if not detected_clients.issubset(acknowledged_clients):
            errors.append(
                f"{name}: unregistered client-field references {sorted(detected_clients - acknowledged_clients)}"
            )

        detected_text = detected_sensitive_keys(function_text)
        registered_text = set(entry["observed_sensitive_free_text_keys"])
        if not detected_text.issubset(registered_text):
            errors.append(
                f"{name}: unregistered sensitive free-text keys {sorted(detected_text - registered_text)}"
            )

        full_row = has_full_deal_row_output(function_text)
        patterns = set(entry["serialization_patterns"])
        if full_row:
            if entry["risk"] != "critical":
                errors.append(f"{name}: full deal-row output must be critical")
            if entry["server_contract_status"] != "blocker":
                errors.append(f"{name}: full deal-row output must be a blocker")
            if not CORE_CLIENT_KEYS.issubset(exposed_clients):
                errors.append(f"{name}: full deal-row output must register all core client keys")
            if not any("deal_row" in pattern for pattern in patterns):
                errors.append(f"{name}: full deal-row output pattern is not registered")

        if exposed_clients:
            if entry["risk"] != "critical":
                errors.append(f"{name}: exposed client identifiers require critical risk")
            if entry["server_contract_status"] != "blocker":
                errors.append(f"{name}: exposed client identifiers require blocker status")

        if internal_clients and entry["risk"] == "low":
            errors.append(f"{name}: client-dependent policy cannot have low risk")
        if detected_text and entry["risk"] == "low":
            errors.append(f"{name}: sensitive free text cannot have low risk")

    rollout = registry.get("rollout_policy") or {}
    forbidden = set(rollout.get("forbidden_in_inventory_slice") or [])
    expected_forbidden = {
        "production deploy",
        "grant change",
        "RLS change",
        "Auth change",
        "Edge Function change",
        "data cleanup",
    }
    if forbidden != expected_forbidden:
        errors.append("inventory mutation guard set drifted")
    if "authenticated regression" not in str(rollout.get("production_gate", "")):
        errors.append("production gate must retain authenticated regression requirement")

    report = REPORT.read_text(encoding="utf-8")
    for marker in (
        "11 RPC",
        "to_jsonb(d)",
        "Wave 1",
        "без production deploy",
        "authenticated-smoke",
        "nav_v2_get_deals_list",
        "nav_v2_get_deal_card",
        "nav_v2_get_lawyer_queue",
    ):
        if marker not in report:
            errors.append(f"report missing {marker!r}")

    if errors:
        print("Navigator v2 RPC privacy inventory errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 RPC privacy inventory passed: output exposure, internal dependencies, free text and rollout gates are registered")
    return 0


if __name__ == "__main__":
    sys.exit(main())
