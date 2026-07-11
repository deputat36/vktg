from __future__ import annotations

import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PROJECT_URL = os.environ.get(
    "NAV_V2_SUPABASE_URL",
    "https://ofewxuqfjhamgerwzull.supabase.co",
).rstrip("/")
ZERO_UUID = "00000000-0000-0000-0000-000000000000"

# These RPCs represent the main anonymous attack surface: ordinary role reads,
# deal reads, lawyer reads and owner/admin diagnostics. Without a user JWT they
# must be resolved by PostgREST but rejected by PostgreSQL privileges.
PUBLIC_RPC_CASES = (
    ("nav_v2_get_my_profile", {}),
    ("nav_v2_get_dashboard", {}),
    ("nav_v2_get_deals_list", {"p_limit": 1}),
    ("nav_v2_get_deal_card", {"p_deal_id": ZERO_UUID}),
    ("nav_v2_get_lawyer_queue", {"p_limit": 1}),
    ("nav_v2_list_users", {}),
    ("nav_v2_get_access_audit", {}),
    ("nav_v2_get_rpc_grant_health", {}),
    ("nav_v2_get_internal_rpc_lockdown_health", {}),
)

# These helpers were moved to nav_v2_private. A 401 would mean that a public
# wrapper still exists; the browser-facing schema must not resolve them at all.
PRIVATE_HELPER_CASES = (
    ("nav_v2_is_active_user", {"p_uid": ZERO_UUID}),
    ("nav_v2_my_role", {"p_uid": ZERO_UUID}),
    ("nav_v2_is_owner_or_admin", {"p_uid": ZERO_UUID}),
    ("nav_v2_can_view_deal", {"p_deal_id": ZERO_UUID, "p_uid": ZERO_UUID}),
    ("nav_v2_can_edit_deal", {"p_deal_id": ZERO_UUID, "p_uid": ZERO_UUID}),
    ("nav_v2_guard_active_spn_manager", {}),
)


def publishable_key() -> str:
    configured = os.environ.get("NAV_V2_SUPABASE_PUBLISHABLE_KEY", "").strip()
    if configured:
        return configured

    config_path = Path(__file__).resolve().parents[1] / "config" / "supabase.js"
    source = config_path.read_text(encoding="utf-8")
    match = re.search(r"SUPABASE_PUBLISHABLE_KEY\s*=\s*['\"]([^'\"]+)['\"]", source)
    if not match:
        raise RuntimeError("Supabase publishable key is missing from environment and config/supabase.js")
    return match.group(1)


def rpc_status(function_name: str, payload: dict[str, object], key: str) -> tuple[int, dict[str, object]]:
    request = Request(
        f"{PROJECT_URL}/rest/v1/rpc/{function_name}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "apikey": key,
            "Content-Type": "application/json",
            "User-Agent": "Navigator-v2-rpc-auth-smoke/1.0",
        },
    )
    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read(2000).decode("utf-8", errors="replace")
            status = response.status
    except HTTPError as error:
        raw = error.read(2000).decode("utf-8", errors="replace")
        status = error.code

    try:
        body = json.loads(raw)
    except json.JSONDecodeError:
        body = {"raw": raw[:300]}
    return status, body


def main() -> int:
    errors: list[str] = []
    try:
        key = publishable_key()
    except (OSError, RuntimeError) as error:
        print(f"Navigator v2 RPC auth smoke setup error: {error}")
        return 1

    def check_public(function_name: str, payload: dict[str, object]) -> str | None:
        try:
            status, body = rpc_status(function_name, payload, key)
        except (URLError, TimeoutError) as error:
            return f"{function_name}: request failed: {error}"
        if status != 401 or body.get("code") != "42501":
            return (
                f"{function_name}: expected HTTP 401 / PostgreSQL 42501 without JWT, "
                f"got HTTP {status}, code={body.get('code')!r}"
            )
        return None

    def check_private(function_name: str, payload: dict[str, object]) -> str | None:
        try:
            status, body = rpc_status(function_name, payload, key)
        except (URLError, TimeoutError) as error:
            return f"{function_name}: request failed: {error}"
        if status != 404 or body.get("code") != "PGRST202":
            return (
                f"{function_name}: expected HTTP 404 / PGRST202 outside public RPC schema, "
                f"got HTTP {status}, code={body.get('code')!r}"
            )
        return None

    checks = [
        (check_public, function_name, payload)
        for function_name, payload in PUBLIC_RPC_CASES
    ] + [
        (check_private, function_name, payload)
        for function_name, payload in PRIVATE_HELPER_CASES
    ]
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            executor.submit(check, function_name, payload): function_name
            for check, function_name, payload in checks
        }
        for future in as_completed(futures):
            try:
                error = future.result()
            except Exception as exc:  # Defensive: surface unexpected worker failures.
                error = f"{futures[future]}: unexpected worker error: {exc}"
            if error:
                errors.append(error)

    if errors:
        print("Navigator v2 RPC auth smoke errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 RPC auth smoke passed: "
        f"{len(PUBLIC_RPC_CASES)} public RPCs rejected anonymous calls and "
        f"{len(PRIVATE_HELPER_CASES)} private helpers were absent from public RPC schema"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
