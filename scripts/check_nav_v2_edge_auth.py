from __future__ import annotations

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PROJECT_URL = os.environ.get(
    "NAV_V2_SUPABASE_URL",
    "https://ofewxuqfjhamgerwzull.supabase.co",
).rstrip("/")
FUNCTIONS = ("nav-invite-user", "nav-v2-deal-api")


def unauthenticated_status(function_name: str) -> tuple[int, str]:
    url = f"{PROJECT_URL}/functions/v1/{function_name}"
    request = Request(
        url,
        data=json.dumps({"action": "dry_run"}).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Navigator-v2-edge-auth-smoke/1.0",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            body = response.read(500).decode("utf-8", errors="replace")
            return response.status, body
    except HTTPError as error:
        body = error.read(500).decode("utf-8", errors="replace")
        return error.code, body


def main() -> int:
    errors: list[str] = []

    for function_name in FUNCTIONS:
        try:
            status, body = unauthenticated_status(function_name)
        except (URLError, TimeoutError) as error:
            errors.append(f"{function_name}: request failed: {error}")
            continue

        if status != 401:
            errors.append(
                f"{function_name}: expected unauthenticated HTTP 401, got {status}; "
                f"body={body[:200]!r}"
            )

    if errors:
        print("Navigator v2 Edge auth smoke errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 Edge auth smoke passed: "
        f"{len(FUNCTIONS)} functions rejected unauthenticated POST with HTTP 401"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
