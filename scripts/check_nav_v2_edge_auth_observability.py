from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/check_nav_v2_edge_auth.py"
WORKFLOW = ROOT / ".github/workflows/nav-v2-edge-auth-observability.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (SCRIPT, WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    script = SCRIPT.read_text(encoding="utf-8")
    require(script, (
        'FUNCTIONS = ("nav-invite-user", "nav-v2-deal-api")',
        'PROBE_NAME = "nav-v2-edge-auth-smoke"',
        'urlencode({"nav_v2_probe": PROBE_NAME, "probe_id": probe_id})',
        'probe_id = uuid4().hex',
        '"X-Navigator-Probe": PROBE_NAME',
        '"X-Navigator-Probe-Id": probe_id',
        '"_probe": PROBE_NAME',
        'if status != 401:',
        'marked unauthenticated POST with HTTP 401',
    ), SCRIPT.name, errors)

    forbidden = (
        '"Authorization"',
        "'Authorization'",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEY",
    )
    for marker in forbidden:
        if marker in script:
            errors.append(f"{SCRIPT.name}: unauthenticated probe contains forbidden credential marker {marker!r}")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "pull_request:",
        "scripts/check_nav_v2_edge_auth.py",
        "scripts/check_nav_v2_edge_auth_observability.py",
        "python3 -m py_compile scripts/check_nav_v2_edge_auth.py",
        "python3 scripts/check_nav_v2_edge_auth_observability.py",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 Edge auth observability contract errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 Edge auth observability contract passed: marked no-JWT probes, no credentials and HTTP 401 preserved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
