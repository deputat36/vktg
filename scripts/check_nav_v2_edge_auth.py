from __future__ import annotations

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

PROJECT_URL = os.environ.get(
    "NAV_V2_SUPABASE_URL",
    "https://ofewxuqfjhamgerwzull.supabase.co",
).rstrip("/")
FUNCTIONS = ("nav-invite-user", "nav-v2-deal-api")
PROBE_NAME = "nav-v2-edge-auth-smoke"


def probe_url(function_name: str, probe_id: str) -> str:
    query = urlencode({"nav_v2_probe": PROBE_NAME, "probe_id": probe_id})
    return f"{PROJECT_URL}/functions/v1/{function_name}?{query}"


def unauthenticated_status(function_name: str) -> tuple[int, str, str]:
    probe_id = uuid4().hex
    request = Request(
        probe_url(function_name, probe_id),
        data=json.dumps({"action": "dry_run", "_probe": PROBE_NAME, "probe_id": probe_id}).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Navigator-v2-edge-auth-smoke/2.0",
            "X-Navigator-Probe": PROBE_NAME,
            "X-Navigator-Probe-Id": probe_id,
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            body = response.read(500).decode("utf-8", errors="replace")
            return response.status, body, probe_id
    except HTTPError as error:
        body = error.read(500).decode("utf-8", errors="replace")
        return error.code, body, probe_id


def main() -> int:
    errors: list[str] = []
    evidence: list[str] = []

    for function_name in FUNCTIONS:
        try:
            status, body, probe_id = unauthenticated_status(function_name)
        except (URLError, TimeoutError) as error:
            errors.append(f"{function_name}: request failed: {error}")
            continue

        evidence.append(f"{function_name}: status={status}, probe_id={probe_id}")
        if status != 401:
            errors.append(
                f"{function_name}: expected unauthenticated HTTP 401, got {status}; "
                f"probe_id={probe_id}; body={body[:200]!r}"
            )

    if errors:
        print("Navigator v2 Edge auth smoke errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 Edge auth smoke passed: "
        f"{len(FUNCTIONS)} functions rejected marked unauthenticated POST with HTTP 401"
    )
    for item in evidence:
        print(f"- {item}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
