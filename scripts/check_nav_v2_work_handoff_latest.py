#!/usr/bin/env python3
"""Validate that the canonical Navigator v2 handoff matches repository evidence."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HANDOFF = ROOT / "docs/NAV_V2_WORK_HANDOFF_LATEST.md"
BUILD_CONFIG = ROOT / "config/nav-v2-build.json"
PUBLIC_ATTESTATION = ROOT / "config/nav-v2-public-build-attestation-v1.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_marker(source: str, marker: str, label: str) -> None:
    require(marker in source, f"handoff missing {label}: {marker}")


def main() -> None:
    for path in (HANDOFF, BUILD_CONFIG, PUBLIC_ATTESTATION):
        require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")

    handoff = HANDOFF.read_text(encoding="utf-8")
    handoff_lower = handoff.lower()
    build = json.loads(BUILD_CONFIG.read_text(encoding="utf-8"))
    attestation = json.loads(PUBLIC_ATTESTATION.read_text(encoding="utf-8"))

    require(build.get("schema_version") == 1, "unexpected build schema")
    build_id = str(build.get("build_id") or "").strip()
    require(build_id, "canonical build id is empty")

    result = attestation.get("result") or {}
    evidence = attestation.get("evidence") or {}
    decision = str(result.get("decision") or "").strip()
    public_url = str(attestation.get("public_base_url") or "").strip()

    require(
        decision == "public_build_20260723_01_attested_read_only_via_github_pages_ci",
        f"unexpected public attestation decision: {decision}",
    )
    require(result.get("live_public_build_verified") is True, "public build must be verified")
    require(result.get("runtime_rollout_completed") is True, "runtime rollout must be completed")
    require(result.get("authenticated_role_e2e_completed") is False, "authenticated E2E must remain false")
    require(
        result.get("live_browser_storage_failure_verified") is False,
        "live browser storage failure verification must remain false",
    )

    required_markers = {
        "canonical build": f"Shared frontend build: `{build_id}`",
        "public URL": f"Public GitHub Pages: `{public_url}`",
        "public decision": f"`{decision}`",
        "public verified": "`live_public_build_verified=true`",
        "runtime rollout": "`runtime_rollout_completed=true`",
        "authenticated E2E boundary": "`authenticated_role_e2e_completed=false`",
        "storage failure boundary": "`live_browser_storage_failure_verified=false`",
        "project ref": "Supabase project: `ofewxuqfjhamgerwzull`",
        "Navigator migration": "`20260716063401_nav_v2_correct_mortgage_broker_scope`",
        "overall migration": "`20260721122333_revoke_anon_execute_leader_internal_rpcs`",
        "Edge version": "Edge `nav-v2-deal-api`: v4, `ACTIVE`, `verify_jwt=true`",
        "Edge hash": "`b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`",
        "public config": "`config/nav-v2-public-build-attestation-v1.json`",
        "public runner": "`scripts/attest_nav_v2_public_build_v1.py`",
        "public workflow": "`.github/workflows/nav-v2-public-build-attestation-v1.yml`",
        "cost gate": "не вызывать cost confirmation",
        "branch gate": "не создавать Supabase branch/accounts/secrets",
        "production gate": "не менять production DDL/DML/RLS/Auth/Edge",
        "leader gate": "не трогать `leader_*`",
    }
    for label, marker in required_markers.items():
        require_marker(handoff, marker, label)

    numeric_markers = {
        "evidence run": result.get("evidence_run_id"),
        "evidence commit": result.get("evidence_commit_sha"),
        "page count": evidence.get("matched_page_count"),
        "artifact id": evidence.get("artifact_id"),
        "artifact digest": evidence.get("artifact_digest"),
    }
    for label, value in numeric_markers.items():
        require(value is not None and str(value) in handoff, f"handoff missing {label}: {value}")

    assets = evidence.get("assets") or {}
    for path, metadata in assets.items():
        sha256 = str((metadata or {}).get("sha256") or "")
        require(path in handoff, f"handoff missing attested asset path: {path}")
        require(sha256 and sha256 in handoff, f"handoff missing attested hash for {path}")

    forbidden_true_claims = (
        "authenticated_role_e2e_completed=true",
        "live_browser_storage_failure_verified=true",
        "production_ready=true",
        "production_applied=true",
        "branch_creation_allowed=true",
        "explicit_owner_cost_approval=true",
    )
    for claim in forbidden_true_claims:
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
        f"build {build_id}, public evidence {result.get('evidence_run_id')}, "
        "authenticated/cloud gates preserved"
    )


if __name__ == "__main__":
    main()
