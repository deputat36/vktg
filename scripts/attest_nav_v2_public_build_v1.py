#!/usr/bin/env python3
"""Attest the deployed public Navigator v2 build without authentication."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BUILD_CONFIG_PATH = ROOT / "config/nav-v2-build.json"
ATTESTATION_CONFIG_PATH = ROOT / "config/nav-v2-public-build-attestation-v1.json"
IMPORTMAP_RE = re.compile(
    r'<script\b[^>]*\btype=["\']importmap["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)
BUILD_ID_RE = re.compile(r"\d{8}-\d{2}")
USER_AGENT = "Navigator-v2-public-build-attestation/1.0"


class AttestationError(RuntimeError):
    """Raised when the public deployment does not match the repository contract."""


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_base_url(value: str) -> str:
    clean = str(value or "").strip()
    if not clean.startswith("https://"):
        raise AttestationError("public base URL must use https://")
    return clean.rstrip("/") + "/"


def add_cache_bust(url: str, nonce: str) -> str:
    parts = urlsplit(url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    query.append(("nav_build_attestation", nonce))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def fetch_bytes(url: str, attempts: int = 2, delay_seconds: float = 2.0) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        request = Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Cache-Control": "no-cache, no-store, max-age=0",
                "Pragma": "no-cache",
            },
        )
        try:
            with urlopen(request, timeout=25) as response:
                if response.status != 200:
                    raise AttestationError(f"HTTP {response.status} for {url}")
                data = response.read()
                if not data:
                    raise AttestationError(f"empty response for {url}")
                return data
        except (HTTPError, URLError, TimeoutError, AttestationError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(delay_seconds * (attempt + 1))
    raise AttestationError(f"unable to fetch {url}: {last_error}")


def extract_importmap(html: str, page_name: str) -> dict[str, Any]:
    match = IMPORTMAP_RE.search(html)
    if not match:
        raise AttestationError(f"{page_name}: importmap is missing")
    try:
        value = json.loads(match.group(1))
    except json.JSONDecodeError as error:
        raise AttestationError(f"{page_name}: invalid importmap JSON: {error}") from error
    if not isinstance(value, dict):
        raise AttestationError(f"{page_name}: importmap root must be an object")
    return value


def inspect_importmap(
    html: str,
    page_name: str,
    scope_name: str,
    specifiers: list[str],
    expected_target: str,
) -> dict[str, str]:
    importmap = extract_importmap(html, page_name)
    scope = (importmap.get("scopes") or {}).get(scope_name)
    if not isinstance(scope, dict):
        raise AttestationError(f"{page_name}: scope {scope_name!r} is missing")

    observed: dict[str, str] = {}
    for specifier in specifiers:
        value = scope.get(specifier)
        if value != expected_target:
            raise AttestationError(
                f"{page_name}: {specifier} resolves to {value!r}; expected {expected_target!r}"
            )
        observed[specifier] = value
    return observed


def discover_repository_pages(
    build_config: dict[str, Any],
    scope_name: str,
    specifiers: list[str],
    expected_target: str,
) -> list[str]:
    pages: list[str] = []
    for path in sorted(ROOT.glob("*-v2.html")):
        source = path.read_text(encoding="utf-8")
        if '"./supabase-v2.js"' not in source:
            continue
        inspect_importmap(source, path.name, scope_name, specifiers, expected_target)
        pages.append(path.name)

    minimum_pages = int(build_config.get("minimum_importmap_pages") or 0)
    if len(pages) < minimum_pages:
        raise AttestationError(
            f"only {len(pages)} repository importmap pages found; expected at least {minimum_pages}"
        )
    return pages


def attest_once(base_url: str) -> dict[str, Any]:
    build_config = load_json(BUILD_CONFIG_PATH)
    contract = load_json(ATTESTATION_CONFIG_PATH)

    build_id = str(build_config.get("build_id") or "").strip()
    if not BUILD_ID_RE.fullmatch(build_id):
        raise AttestationError("canonical build_id must match YYYYMMDD-NN")

    shared_module = str(build_config.get("shared_module") or "").strip()
    if not shared_module:
        raise AttestationError("shared_module is missing from build config")

    scope_name = str(contract.get("required_scope") or "./assets/js/nav-v2/")
    specifiers = ["./supabase-v2.js", *(build_config.get("legacy_specifiers") or [])]
    expected_target = f"./{shared_module}?v={build_id}"
    pages = discover_repository_pages(
        build_config,
        scope_name,
        specifiers,
        expected_target,
    )

    nonce = str(int(time.time() * 1000))
    page_results: dict[str, Any] = {}
    for page_name in pages:
        page_url = add_cache_bust(urljoin(base_url, page_name), nonce)
        html = fetch_bytes(page_url).decode("utf-8", errors="replace")
        mappings = inspect_importmap(
            html,
            page_name,
            scope_name,
            specifiers,
            expected_target,
        )
        page_results[page_name] = {
            "status": "matched",
            "mapping_count": len(mappings),
        }

    diagnostic_page = str(build_config.get("diagnostic_page") or "").strip()
    diagnostic_module = str(build_config.get("diagnostic_module") or "").strip()
    if not diagnostic_page or not diagnostic_module:
        raise AttestationError("diagnostic page/module is missing from build config")
    diagnostic_url = add_cache_bust(urljoin(base_url, diagnostic_page), nonce)
    diagnostic_html = fetch_bytes(diagnostic_url).decode("utf-8", errors="replace")
    diagnostic_marker = f"{Path(diagnostic_module).name}?v={build_id}"
    if diagnostic_marker not in diagnostic_html:
        raise AttestationError(
            f"{diagnostic_page}: diagnostic module does not use build {build_id}"
        )

    asset_paths = [shared_module, *(contract.get("additional_hashed_assets") or [])]
    asset_results: dict[str, Any] = {}
    for asset_path in asset_paths:
        normalized_path = str(asset_path or "").strip().lstrip("/")
        local_path = ROOT / normalized_path
        if not local_path.is_file():
            raise AttestationError(f"repository asset is missing: {normalized_path}")
        local_bytes = local_path.read_bytes()
        asset_url = urljoin(base_url, f"{normalized_path}?v={build_id}")
        live_bytes = fetch_bytes(add_cache_bust(asset_url, nonce))
        expected_sha = sha256_bytes(local_bytes)
        observed_sha = sha256_bytes(live_bytes)
        if observed_sha != expected_sha:
            raise AttestationError(
                f"{normalized_path}: deployed SHA-256 {observed_sha} does not match repository {expected_sha}"
            )
        asset_results[normalized_path] = {
            "status": "matched",
            "sha256": observed_sha,
            "bytes": len(live_bytes),
        }

    return {
        "schema_version": 1,
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "expected_build_id": build_id,
        "repository_page_count": len(pages),
        "live_pages": page_results,
        "diagnostic": {
            "page": diagnostic_page,
            "module": diagnostic_module,
            "status": "matched",
        },
        "assets": asset_results,
        "boundaries": {
            "public_assets_only": True,
            "authenticated_requests": False,
            "credentials_used": False,
            "supabase_management_api_called": False,
            "production_mutation": False,
        },
        "decision": "public_build_matches_repository_read_only",
    }


def write_report(path_value: str, report: dict[str, Any]) -> None:
    path = Path(path_value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.environ.get("NAV_V2_BASE_URL", ""))
    parser.add_argument("--report-path", default="nav-v2-public-build-attestation-report.json")
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--retry-delay", type=float, default=15.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    contract = load_json(ATTESTATION_CONFIG_PATH)
    base_url = normalize_base_url(args.base_url or contract.get("public_base_url", ""))
    attempts = max(1, int(args.attempts))
    last_error: Exception | None = None

    for attempt in range(attempts):
        try:
            report = attest_once(base_url)
            write_report(args.report_path, report)
            print(
                "Navigator v2 public build attestation passed: "
                f"build {report['expected_build_id']}, "
                f"{report['repository_page_count']} pages, "
                f"{len(report['assets'])} hashed assets at {base_url}"
            )
            return 0
        except (AttestationError, OSError, ValueError, json.JSONDecodeError) as error:
            last_error = error
            if attempt + 1 < attempts:
                print(
                    f"Public build attestation attempt {attempt + 1}/{attempts} pending: {error}",
                    file=sys.stderr,
                )
                time.sleep(max(0.0, float(args.retry_delay)))

    failure_report = {
        "schema_version": 1,
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "decision": "public_build_does_not_match_or_is_not_yet_available",
        "error": str(last_error),
        "boundaries": {
            "public_assets_only": True,
            "authenticated_requests": False,
            "credentials_used": False,
            "supabase_management_api_called": False,
            "production_mutation": False,
        },
    }
    write_report(args.report_path, failure_report)
    print(f"Navigator v2 public build attestation failed: {last_error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
