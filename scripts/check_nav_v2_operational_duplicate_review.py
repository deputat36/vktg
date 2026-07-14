from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260714130000_nav_v2_exact_duplicate_review_pack.sql"
PAGE = ROOT / "operational-duplicate-review-v2.html"
UI = ROOT / "assets/js/nav-v2/operational-duplicate-review-v2.js"
MODEL = ROOT / "assets/js/nav-v2/operational-duplicate-review-model-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-operational-duplicate-review.mjs"
SOURCE_PAGE = ROOT / "operational-adoption-v2.html"
REGISTRY = ROOT / "config/nav-v2-rpc-surface.json"
BUDGET = ROOT / "config/nav-v2-module-budget.json"
STATIC_WORKFLOW = ROOT / ".github/workflows/nav-v2-static.yml"
DEDICATED_WORKFLOW = ROOT / ".github/workflows/nav-v2-operational-duplicate-review.yml"
PUBLIC_SMOKE = ROOT / "tests/e2e/public-smoke.spec.js"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def assert_read_only(text: str, label: str, errors: list[str]) -> None:
    lowered = text.lower()
    for forbidden in (
        "update public.nav_deals_v2",
        "insert into public.nav_deals_v2",
        "delete from public.nav_deals_v2",
        "update public.nav_deal_tasks_v2",
        "insert into public.nav_deal_tasks_v2",
        "delete from public.nav_deal_tasks_v2",
        "update public.nav_deal_risks_v2",
        "insert into public.nav_deal_risks_v2",
        "delete from public.nav_deal_risks_v2",
        "update public.nav_deal_documents_v2",
        "insert into public.nav_deal_documents_v2",
        "delete from public.nav_deal_documents_v2",
    ):
        if forbidden in lowered:
            errors.append(f"{label} must remain read-only: {forbidden}")


def main() -> int:
    errors: list[str] = []
    for path in (
        MIGRATION, PAGE, UI, MODEL, SEMANTIC, SOURCE_PAGE,
        REGISTRY, BUDGET, STATIC_WORKFLOW, DEDICATED_WORKFLOW, PUBLIC_SMOKE,
    ):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    sql = MIGRATION.read_text(encoding="utf-8")
    require(sql, (
        "nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(",
        "security definer",
        "set search_path = public, pg_temp",
        "v_role is null or v_role not in ('owner', 'admin', 'manager')",
        "coalesce(deal.title, '') not ilike 'ДЕМО:%'",
        "array['deal_id','task_id','document_id','risk_id','review_id']",
        "all_semantic_equal",
        "suggested_canonical_deal_id",
        "'suggestion_basis', 'earliest_created_only'",
        "'selection_available', false",
        "'mutation_available', false",
        "'cleanup_execution_available', false",
        "'owner_decision_required', true",
        "'report_version', 8",
        "'exact_duplicate_review_pack', v_duplicate_review",
        "revoke execute on function nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer) from anon, authenticated",
        "grant execute on function nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer) to service_role",
        "Exact duplicate review implementation must remain private",
    ), MIGRATION.name, errors)
    assert_read_only(sql, MIGRATION.name, errors)

    page = PAGE.read_text(encoding="utf-8")
    require(page, (
        "Content-Security-Policy",
        'aria-live="polite"',
        "assets/js/nav-v2/operational-duplicate-review-v2.js?v=20260714-01",
        "assets/js/nav-v2/role-menu-v2.js?v=20260713-01",
        "assets/js/nav-v2/nav-base-menu-cleanup-v2.js?v=20260707-1210",
    ), PAGE.name, errors)

    ui = UI.read_text(encoding="utf-8")
    require(ui, (
        "validateExactDuplicateReviewReport",
        "createExactDuplicateDecisionState",
        "summarizeExactDuplicateOwnerDecision",
        "buildExactDuplicateOwnerDecisionPackage",
        "['owner', 'admin', 'manager'].includes(profile().role)",
        "['owner', 'admin'].includes(profile().role)",
        "exact_duplicate_review_pack",
        "navigator-v2-exact-duplicate-owner-decision-",
        "rpc('nav_v2_get_operational_adoption_report'",
        "Рекомендация не является выбором",
        "cleanup_authorized=false",
        "URL.createObjectURL",
    ), UI.name, errors)
    if ui.count("rpc('nav_v2_get_operational_adoption_report'") != 1:
        errors.append("duplicate review UI must use exactly one adoption report RPC call")
    for forbidden in (
        "nav_v2_update_",
        "nav_v2_add_",
        "nav_v2_save_",
        ".from('nav_",
        '.from("nav_',
        "localStorage",
        "sessionStorage",
    ):
        if forbidden in ui:
            errors.append(f"duplicate review UI must remain browser-local and read-only: {forbidden}")

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function validateExactDuplicateReviewReport",
        "export function duplicateResolutionOptions",
        "export function createExactDuplicateDecisionState",
        "export function updateExactDuplicateDecisionState",
        "export function summarizeExactDuplicateOwnerDecision",
        "export function buildExactDuplicateOwnerDecisionPackage",
        "navigator_v2_exact_duplicate_review_validation",
        "navigator_v2_exact_duplicate_owner_decision",
        "decision_package_ready",
        "cleanup_authorized: false",
        "server_mutation_available: false",
        "automatic_canonical_selection_available: false",
        "automatic_merge_available: false",
        "automatic_archive_available: false",
        "requires_fresh_server_revalidation: true",
        "requires_audit_event: true",
        "requires_one_group_at_a_time: true",
    ), MODEL.name, errors)
    for forbidden in ("rpc(", ".from(", "fetch(", "localStorage", "sessionStorage"):
        if forbidden in model:
            errors.append(f"duplicate review model must remain pure and offline: {forbidden}")

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, (
        "decision_package_ready, true",
        "cleanup_authorized, false",
        "managerValidation",
        "invalidCanonical",
        "missingTransfer",
        "needsReviewState",
        "tamperedValidation",
        "duplicateGroupValidation",
        "duplicateDealValidation",
        "semantic regression passed",
    ), SEMANTIC.name, errors)

    source_page = SOURCE_PAGE.read_text(encoding="utf-8")
    if "operational-duplicate-review-v2.html" not in source_page:
        errors.append("operational adoption page must link to duplicate review")

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    helper = "nav_v2_get_exact_duplicate_review_pack_unchecked_20260714"
    if registry.get("internal_only", []).count(helper) != 1:
        errors.append("duplicate review helper must be registered exactly once as internal_only")
    for category in ("frontend_api", "admin_api", "demo_api"):
        if helper in registry.get(category, []):
            errors.append(f"duplicate review helper leaked into {category}")

    budget = json.loads(BUDGET.read_text(encoding="utf-8"))
    if (budget.get("pages") or {}).get(PAGE.name) != {"max_modules": 3}:
        errors.append("duplicate review page must have a three-module budget")

    static_workflow = STATIC_WORKFLOW.read_text(encoding="utf-8")
    dedicated_workflow = DEDICATED_WORKFLOW.read_text(encoding="utf-8")
    python_command = "python3 scripts/check_nav_v2_operational_duplicate_review.py"
    node_command = "node scripts/check-nav-v2-operational-duplicate-review.mjs"
    for workflow, label in ((static_workflow, STATIC_WORKFLOW.name), (dedicated_workflow, DEDICATED_WORKFLOW.name)):
        if python_command not in workflow:
            errors.append(f"{label}: missing duplicate review static regression")
        if node_command not in workflow:
            errors.append(f"{label}: missing duplicate review semantic regression")

    public_smoke = PUBLIC_SMOKE.read_text(encoding="utf-8")
    if "'/operational-duplicate-review-v2.html'" not in public_smoke:
        errors.append("public smoke must include operational-duplicate-review-v2.html guest gate")

    if errors:
        print("Navigator v2 exact duplicate review errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 exact duplicate review passed: demo exclusion, normalized child comparisons, private helper, "
        "manager read-only view, owner/admin local decision package, one browser RPC and no cleanup mutation"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
