from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import check_nav_v2_release_drift_shared_project as shared


class SharedProjectReleaseDriftTests(unittest.TestCase):
    def setUp(self) -> None:
        self.baseline = {"latest_live_migration": "20260716063401"}

    def test_later_repository_known_migration_does_not_invalidate_navigator_baseline(self) -> None:
        report = {
            "problems": [
                "latest live migration differs from baseline: 20260721122333 != 20260716063401"
            ],
            "ok": False,
            "latest_remote_migration": "20260721122333",
        }
        migration_text = """
          LOCAL          | REMOTE         | TIME (UTC)
          20260716064500 | 20260716063401 | 2026-07-16
          20260721122333 | 20260721122333 | 2026-07-21
        """

        result = shared.apply_shared_project_semantics(report, self.baseline, migration_text)

        self.assertTrue(result["ok"])
        self.assertTrue(result["approved_navigator_baseline_present"])
        self.assertEqual(result["later_remote_migrations"], ["20260721122333"])
        self.assertEqual(result["problems"], [])

    def test_missing_navigator_baseline_remains_blocking(self) -> None:
        report = {
            "problems": [
                "latest live migration differs from baseline: 20260721122333 != 20260716063401"
            ],
            "ok": False,
            "latest_remote_migration": "20260721122333",
        }
        migration_text = """
          LOCAL          | REMOTE         | TIME (UTC)
          20260721122333 | 20260721122333 | 2026-07-21
        """

        result = shared.apply_shared_project_semantics(report, self.baseline, migration_text)

        self.assertFalse(result["ok"])
        self.assertFalse(result["approved_navigator_baseline_present"])
        self.assertEqual(
            result["problems"],
            ["approved Navigator baseline migration is absent from production: 20260716063401"],
        )

    def test_unknown_remote_drift_is_preserved(self) -> None:
        report = {
            "problems": [
                "latest live migration differs from baseline: 20260721122333 != 20260716063401",
                "production migrations have no repository source or approved alias: 20260722000000",
            ],
            "ok": False,
            "latest_remote_migration": "20260721122333",
        }
        migration_text = """
          LOCAL          | REMOTE         | TIME (UTC)
          20260716064500 | 20260716063401 | 2026-07-16
          20260721122333 | 20260721122333 | 2026-07-21
        """

        result = shared.apply_shared_project_semantics(report, self.baseline, migration_text)

        self.assertFalse(result["ok"])
        self.assertEqual(
            result["problems"],
            ["production migrations have no repository source or approved alias: 20260722000000"],
        )

    def test_repository_contract_matches_baseline_and_aliases(self) -> None:
        contract = shared.load_json(ROOT / "config/nav-v2-release-drift-shared-project-v1.json")
        baseline = shared.load_json(ROOT / "config/nav-v2-release-baseline.json")
        aliases = shared.load_json(ROOT / "config/nav-v2-release-migration-aliases.json")

        self.assertEqual(shared.validate_contract(contract, baseline, aliases), [])


if __name__ == "__main__":
    unittest.main()
