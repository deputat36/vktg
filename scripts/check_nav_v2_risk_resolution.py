from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "assets/js/nav-v2/deal-card-risk-resolution-v2.js"
LIFECYCLE = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
MIGRATION = ROOT / "supabase/migrations/20260712160000_nav_v2_risk_resolution_lifecycle.sql"
REGISTRY = ROOT / "config/nav-v2-rpc-surface.json"
PAGE = ROOT / "deal-card-v2.html"


def main() -> int:
    errors: list[str] = []
    for path in (MODULE, LIFECYCLE, MIGRATION, REGISTRY, PAGE):
        if not path.exists():
            errors.append(f"Missing risk resolution file: {path.relative_to(ROOT)}")

    if not errors:
        module = MODULE.read_text(encoding="utf-8")
        lifecycle = LIFECYCLE.read_text(encoding="utf-8")
        migration = MIGRATION.read_text(encoding="utf-8")
        registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
        page = PAGE.read_text(encoding="utf-8")

        required_module = (
            "export function applyDealCardRiskResolution(data, profile)",
            "await rpc('nav_v2_update_risk_resolution'",
            "button.setAttribute('data-risk-resolution'",
            "if (role === 'viewer') return false;",
            "setTimeout(() => location.reload(), 250);",
        )
        for marker in required_module:
            if marker not in module:
                errors.append(f"Risk resolution module missing marker: {marker}")

        forbidden_module = (
            "new MutationObserver",
            "requestAnimationFrame",
            "window.addEventListener('hashchange'",
            "nav_v2_get_deal_card",
            ".from('nav_",
            '.from("nav_',
            ".from(`nav_",
        )
        for marker in forbidden_module:
            if marker in module:
                errors.append(f"Risk resolution module contains forbidden behavior: {marker}")
        if module.count("rpc(") != 1:
            errors.append(f"Risk resolution module must contain one mutation RPC, got {module.count('rpc(')}")

        required_lifecycle = (
            "import { applyDealCardRiskResolution } from './deal-card-risk-resolution-v2.js?v=20260712-10';",
            "applyDealCardRiskResolution(cardData, profileData);",
        )
        for marker in required_lifecycle:
            if marker not in lifecycle:
                errors.append(f"Deal-card lifecycle missing risk marker: {marker}")

        if '<script type="module" src="./assets/js/nav-v2/deal-card-risk-resolution-v2.js' in page:
            errors.append("Risk resolution must not be a standalone HTML entry module")
        cache_mapping = '"./deal-card-recheck-alert-v2.js?v=20260711-02": "./assets/js/nav-v2/deal-card-recheck-alert-v2.js?v=20260715-14"'
        if cache_mapping not in page:
            errors.append("Deal-card page missing current risk lifecycle cache mapping")

        required_migration = (
            "alter table public.nav_deal_risks_v2",
            "add column if not exists updated_at timestamptz",
            "create or replace function public.nav_v2_update_risk_resolution(",
            "select r.*",
            "for update;",
            "v_risk.is_resolved is not distinct from p_is_resolved",
            "v_event_type := case when p_is_resolved then 'risk_resolved' else 'risk_reopened' end;",
            "nav_v2_private.nav_v2_can_view_deal",
            "nav_v2_private.nav_v2_can_edit_deal",
            "revoke all on function public.nav_v2_update_risk_resolution(uuid, boolean, text) from public;",
            "revoke execute on function public.nav_v2_update_risk_resolution(uuid, boolean, text) from anon;",
            "grant execute on function public.nav_v2_update_risk_resolution(uuid, boolean, text) to authenticated, service_role;",
            "(''frontend_api'', ''nav_v2_update_risk_resolution'')",
            "(''nav_v2_update_risk_resolution'', ''deal-card risk lifecycle'')",
        )
        for marker in required_migration:
            if marker not in migration:
                errors.append(f"Risk resolution migration missing marker: {marker}")

        frontend_api = registry.get("frontend_api") or []
        if frontend_api.count("nav_v2_update_risk_resolution") != 1:
            errors.append("RPC registry must classify nav_v2_update_risk_resolution exactly once as frontend_api")
        for category in ("admin_api", "demo_api", "internal_only"):
            if "nav_v2_update_risk_resolution" in (registry.get(category) or []):
                errors.append(f"Risk resolution RPC must not be classified as {category}")

    if errors:
        print("Navigator v2 risk resolution errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 risk resolution passed: RPC-first, idempotent and explicit-lifecycle contract is present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
