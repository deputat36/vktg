from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/attest_nav_v2_public_build_v1.py"
SPEC = importlib.util.spec_from_file_location("nav_v2_public_build_attestation", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PublicBuildAttestationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scope = "./assets/js/nav-v2/"
        self.specifiers = [
            "./supabase-v2.js",
            "./supabase-v2.js?v=20260625-1230",
            "./supabase-v2.js?v=20260625-1320",
        ]
        self.target = "./assets/js/nav-v2/supabase-v2.js?v=20260723-01"

    def make_html(self, overrides: dict[str, str] | None = None) -> str:
        mappings = {key: self.target for key in self.specifiers}
        mappings.update(overrides or {})
        entries = ",\n".join(
            f'          "{key}": "{value}"' for key, value in mappings.items()
        )
        return f"""<!doctype html>
<html><head>
<script defer type="importmap">
{{
  "scopes": {{
    "{self.scope}": {{
{entries}
    }}
  }}
}}
</script>
</head><body></body></html>"""

    def test_matching_importmap_is_accepted(self) -> None:
        observed = MODULE.inspect_importmap(
            self.make_html(),
            "dashboard-v2.html",
            self.scope,
            self.specifiers,
            self.target,
        )
        self.assertEqual(set(observed), set(self.specifiers))
        self.assertEqual(set(observed.values()), {self.target})

    def test_mixed_build_is_rejected(self) -> None:
        html = self.make_html(
            {"./supabase-v2.js?v=20260625-1320": "./assets/js/nav-v2/supabase-v2.js?v=20260711-01"}
        )
        with self.assertRaisesRegex(MODULE.AttestationError, "expected"):
            MODULE.inspect_importmap(
                html,
                "dashboard-v2.html",
                self.scope,
                self.specifiers,
                self.target,
            )

    def test_missing_importmap_is_rejected(self) -> None:
        with self.assertRaisesRegex(MODULE.AttestationError, "importmap is missing"):
            MODULE.extract_importmap("<html></html>", "nav-v2.html")

    def test_cache_bust_preserves_existing_build_query(self) -> None:
        value = MODULE.add_cache_bust(
            "https://example.test/assets/js/nav-v2/supabase-v2.js?v=20260723-01",
            "123",
        )
        self.assertIn("v=20260723-01", value)
        self.assertIn("nav_build_attestation=123", value)

    def test_public_base_url_requires_https(self) -> None:
        self.assertEqual(
            MODULE.normalize_base_url("https://example.test/nav"),
            "https://example.test/nav/",
        )
        with self.assertRaisesRegex(MODULE.AttestationError, "https"):
            MODULE.normalize_base_url("http://example.test/nav")

    def test_sha256_is_deterministic(self) -> None:
        self.assertEqual(
            MODULE.sha256_bytes(b"navigator-v2"),
            MODULE.sha256_bytes(b"navigator-v2"),
        )
        self.assertNotEqual(
            MODULE.sha256_bytes(b"navigator-v2"),
            MODULE.sha256_bytes(b"navigator-v3"),
        )


if __name__ == "__main__":
    unittest.main()
