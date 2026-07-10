from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config/nav-v2-module-budget.json"
BASE_URL = os.environ.get("NAV_V2_BASE_URL", "https://deputat36.github.io/vktg/").rstrip("/") + "/"
USER_AGENT = "Navigator-v2-live-smoke/1.0"
ASSET_RE = re.compile(r'(?:src|href)=["\'](?:\./)?(assets/(?:js/nav-v2|css)/[^"\'?#]+)')
CSP_MARKER = 'http-equiv="Content-Security-Policy"'


def fetch_text(url: str, attempts: int = 3) -> str:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT, "Cache-Control": "no-cache"})
            with urlopen(request, timeout=20) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                data = response.read()
                if not data:
                    raise RuntimeError("empty response")
                return data.decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError, RuntimeError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{url}: {last_error}")


def main() -> int:
    errors: list[str] = []
    if not CONFIG_PATH.exists():
        print("Missing config/nav-v2-module-budget.json")
        return 1

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    csp_pages = sorted((config.get("pages") or {}).keys())
    availability_pages = csp_pages + ["nav-accept-invite-v2.html", "nav-access-audit-v2.html"]
    assets: set[str] = set()

    try:
        root_html = fetch_text(BASE_URL)
        if "nav-v2.html" not in root_html and "CRM Навигатор сделок v2" not in root_html:
            errors.append("site root does not reference Navigator v2")
    except RuntimeError as error:
        errors.append(str(error))

    for page in availability_pages:
        url = urljoin(BASE_URL, page)
        try:
            html = fetch_text(url)
        except RuntimeError as error:
            errors.append(str(error))
            continue

        if "<title>" not in html.lower():
            errors.append(f"{page}: missing title")
        if page in csp_pages and CSP_MARKER not in html:
            errors.append(f"{page}: missing Content-Security-Policy meta tag")
        assets.update(ASSET_RE.findall(html))

    for asset in sorted(assets):
        try:
            fetch_text(urljoin(BASE_URL, asset), attempts=2)
        except RuntimeError as error:
            errors.append(str(error))

    if errors:
        print("Navigator v2 live smoke errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 live smoke passed: "
        f"{len(availability_pages)} pages and {len(assets)} linked assets checked at {BASE_URL}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
