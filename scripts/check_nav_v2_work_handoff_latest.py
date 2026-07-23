#!/usr/bin/env python3
"""Validate that the canonical Navigator v2 handoff matches repository evidence."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HANDOFF = ROOT / "docs/NAV_V2_WORK_HANDOFF_LATEST.md"
BUILD_CONFIG = ROOT / "config/nav-v2-build.json"
PUBLIC_ATTESTATION = ROOT / "config/nav-v2-public-build-attestation-v1.json"
BROWSER_RUNTIME = ROOT / "config/nav-v2-live-public-browser-runtime-v1.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_marker(source: str, marker: str, label: str) -> None:
    require(marker in source, f"handoff missing {label}: {marker}")


def main() -> None:
    for path in (HANDOFF, BUILD_CONFIG, PUBLIC_ATTESTATION, BROWSER_RUNTIME):
        require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")

    handoff = HANDOFF.read_text(encoding="utf-8")
    handoff_lower = handoff.lower()
    build = json.loads(BUILD_CONFIG.read_text(encoding="utf-8"))
    public = json.loads(PUBLIC_ATTESTATION.read_text(encoding="utf-8"))
    browser = json.loads(BROWSER_RUNTIME.read_text(encoding="utf-8"))

    build_id = str(build.get("build_id") or "").strip()
    require(build_id, "canonical build id is empty")
    public_result = public.get("result") or {}
    browser_result = browser.get("result") or {}
    public_decision = str(public_result.get("decision") or "")
    browser_decision = str(browser_result.get("decision") or "")
    public_url = str(public.get("public_base_url") or "")

    required_markers = {
        "canonical build": f"Shared frontend build: `{build_id}`",
        "public URL": f"Public GitHub Pages: `{public_url}`",
        "public decision": f"`{public_decision}`",
        "browser decision": f"`{browser_decision}`",
        "authenticated E2E boundary": "`authenticated_role_e2e_completed=false`",
        "storage failure boundary": "`live_browser_storage_failure_verified=false`",
        "project ref": "Supabase project: `ofewxuqfjhamgerwzull`",
        "Navigator migration": "`20260716063401_nav_v2_correct_mortgage_broker_scope`",
        "overall migration": "`20260721122333_revoke_anon_execute_leader_internal_rpcs`",
        "Edge version": "Edge `nav-v2-deal-api`: v4, `ACTIVE`, `verify_jwt=true`",
        "Edge hash": "`b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`",
        "public config": "`config/nav-v2-public-build-attestation-v1.json`",
        "browser config": "`config/nav-v2-live-public-browser-runtime-v1.json`",
        "build bumper": "`scripts/bump_nav_v2_shared_build.py`",
        "cost gate": "не вызывать cost confirmation",
        "branch gate": "не создавать Supabase branch/accounts/secrets",
        "production gate": "не менять production DDL/DML/RLS/Auth/Edge",
        "leader gate": "не трогать `leader_*`",
    }
    for label, marker in required_markers.items():
        require_marker(handoff, marker, label)

    pending_public = public_decision == "public_build_attestation_contract_prepared_requires_successful_live_ci"
    if pending_public:
        require(public.get("pending_build_id") == build_id, "pending public build mismatch")
        require(public_result.get("live_public_build_verified") is False, "pending build cannot be live verified")
        require(public_result.get("runtime_rollout_completed") is False, "pending build cannot claim rollout")
        require_marker(handoff, "`live_public_build_verified=false`", "pending public state")
        require_marker(handoff, "`runtime_rollout_completed=false`", "pending rollout state")
        previous = public.get("previous_successful_attestation") or {}
        previous_result = previous.get("result") or {}
        previous_evidence = previous.get("evidence") or {}
        require(previous_result.get("live_public_build_verified") is True, "historical public evidence missing")
        for value in (
            previous_result.get("decision"),
            previous_result.get("evidence_run_id"),
            previous_result.get("evidence_commit_sha"),
            previous_evidence.get("expected_build_id"),
        ):
            require(value is not None and str(value) in handoff, f"handoff missing historical evidence: {value}")
    else:
        require(public_result.get("live_public_build_verified") is True, "passed build must be verified")
        require(public_result.get("runtime_rollout_completed") is True, "passed build must mark rollout")
        require_marker(handoff, "`live_public_build_verified=true`", "public verified state")
        require_marker(handoff, "`runtime_rollout_completed=true`", "rollout state")
        evidence = public.get("evidence") or {}
        for value in (
            public_result.get("evidence_run_id"),
            public_result.get("evidence_commit_sha"),
            evidence.get("expected_build_id"),
            evidence.get("artifact_id"),
            evidence.get("artifact_digest"),
        ):
            require(value is not None and str(value) in handoff, f"handoff missing live evidence: {value}")

    require(browser_result.get("authenticated_role_e2e_completed") is False, "authenticated browser gate drift")
    require(browser_result.get("live_browser_storage_failure_verified") is False, "storage failure gate drift")

    for claim in (
        "authenticated_role_e2e_completed=true",
        "live_browser_storage_failure_verified=true",
        "production_ready=true",
        "production_applied=true",
        "branch_creation_allowed=true",
        "explicit_owner_cost_approval=true",
    ):
        require(claim not in handoff, f"handoff contains forbidden claim: {claim}")

    for phrase in (
        "generic `продолжай`, `работай по плану`, `действуй автономно` не являются approval",
        "успешная offline validation формы не является execution authorization",
        "без этих решений cloud execution запрещено",
    ):
        require(phrase in handoff_lower, f"handoff missing execution boundary: {phrase}")

    require(handoff.startswith("# Navigator v2 — актуальный handoff"), "unexpected handoff title")
    print(
        "Navigator v2 handoff consistency passed: "
        f"build {build_id}, public={public_decision}, browser={browser_decision}, gates preserved"
    )


if __name__ == "__main__":
    main()
