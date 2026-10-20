"""Compare the published preparation helper with this checkout using public GETs."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://deputat36.github.io/vktg/"
FILES = (
    "preparation.html",
    "preparation-rules.html",
    "assets/css/preparation.css",
    "assets/js/preparation/app.js",
    "assets/js/preparation/model.js",
    "assets/js/preparation/editor.js",
    "config/preparation-catalog.json",
)


def compare(path):
    expected = (ROOT / path).read_bytes()
    result = {"path": path, "expected_sha256": sha256(expected).hexdigest()}
    try:
        request = Request(BASE_URL + path, headers={"Cache-Control": "no-cache"})
        with urlopen(request, timeout=30) as response:
            actual = response.read()
            result.update(
                http_status=response.status,
                actual_sha256=sha256(actual).hexdigest(),
                bytes=len(actual),
            )
        result["matches"] = result["http_status"] == 200 and actual == expected
    except Exception as error:
        result.update(matches=False, error=str(error))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-path", required=True)
    args = parser.parse_args()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(compare, FILES))
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "public_base_url": BASE_URL,
        "status": "passed" if all(item["matches"] for item in results) else "failed",
        "authenticated_requests": False,
        "production_mutation": False,
        "files": results,
    }
    output = Path(args.report_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    for result in results:
        print(f"{'PASS' if result['matches'] else 'FAIL'} {result['path']}")
    raise SystemExit(0 if report["status"] == "passed" else 1)


if __name__ == "__main__":
    main()
