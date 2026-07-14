from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260714103000_nav_v2_exact_wizard_save_guard.sql"
SMOKE = ROOT / "scripts/nav_v2_exact_wizard_save_guard_rollback_smoke.sql"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"
DEDICATED_WORKFLOW = ROOT / ".github/workflows/nav-v2-exact-wizard-save-guard.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (MIGRATION, SMOKE, STATIC_WORKFLOW, DEDICATED_WORKFLOW):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    migration = MIGRATION.read_text(encoding="utf-8")
    require(migration, (
        "create or replace function public.nav_v2_block_exact_recent_wizard_duplicate()",
        "returns trigger",
        "language plpgsql",
        "security definer",
        "set search_path = public",
        "pg_catalog.hashtextextended",
        "pg_catalog.pg_advisory_xact_lock",
        "d.created_by = new.created_by",
        "d.wizard_snapshot = new.wizard_snapshot",
        "interval '2 minutes'",
        "NAV_V2_EXACT_WIZARD_DUPLICATE",
        "existing_deal_id",
        "before insert on public.nav_deals_v2",
        "when (new.wizard_snapshot is not null)",
        "revoke all on function public.nav_v2_block_exact_recent_wizard_duplicate() from public, anon, authenticated",
        "Existing rows are never changed",
    ), MIGRATION.name, errors)
    for forbidden in (
        "delete from public.nav_deals_v2",
        "update public.nav_deals_v2",
        "truncate",
        "grant execute on function public.nav_v2_block_exact_recent_wizard_duplicate() to authenticated",
        "grant execute on function public.nav_v2_block_exact_recent_wizard_duplicate() to anon",
    ):
        if forbidden.lower() in migration.lower():
            errors.append(f"migration must not mutate existing rows or expose trigger function: {forbidden}")

    smoke = SMOKE.read_text(encoding="utf-8")
    require(smoke, (
        "begin;",
        "set local role authenticated",
        "public.nav_v2_save_wizard_result(v_payload)",
        "when sqlstate 'P0001'",
        "NAV_V2_EXACT_WIZARD_DUPLICATE",
        "existing_deal_id",
        "Second exact wizard save was not blocked",
        "Changed payload unexpectedly reused the first deal",
        "rollback_required",
        "rollback;",
    ), SMOKE.name, errors)
    if smoke.lower().count("rollback;") != 1:
        errors.append("rollback smoke must end with exactly one explicit rollback")
    if "commit;" in smoke.lower():
        errors.append("rollback smoke must never commit")

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    dedicated_workflow = DEDICATED_WORKFLOW.read_text(encoding="utf-8")
    command = "python3 scripts/check_nav_v2_exact_wizard_save_guard.py"
    for workflow, label in ((static_workflow, STATIC_WORKFLOW.name), (dedicated_workflow, DEDICATED_WORKFLOW.name)):
        if command not in workflow:
            errors.append(f"{label}: missing exact wizard save guard regression")

    if errors:
        print("Navigator v2 exact wizard save guard errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 exact wizard save guard passed: exact creator/payload scope, advisory transaction lock, "
        "two-minute window, no existing-row cleanup, no direct execute grant and rollback-only smoke"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
