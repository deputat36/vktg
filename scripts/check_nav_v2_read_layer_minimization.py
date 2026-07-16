from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "assets/js/nav-v2/read-layer-minimization-model-v2.js"
CLIENT = ROOT / "assets/js/nav-v2/supabase-v2.js"
SEMANTIC = ROOT / "scripts/check-nav-v2-read-layer-minimization.mjs"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    for path in (MODEL, CLIENT, SEMANTIC):
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    model = MODEL.read_text(encoding="utf-8")
    require(
        model,
        (
            "import { clientDirectIdentifierKeys }",
            "...clientDirectIdentifierKeys()",
            "export function maskDealAddress",
            "export function neutralDealReference",
            "export function minimizeNavigatorReadPayload",
            "export function containsDirectClientIdentifiers",
            "seller_full_name",
            "buyer_full_name",
            "seller_passport",
            "buyer_passport",
            "seller_snils",
            "buyer_snils",
            "deal_title",
            "dealTitle",
            "handoff_text",
            "Квартира в МКД",
            "Сделка ·",
            "ДЕМО:",
        ),
        MODEL.name,
        errors,
    )

    forbidden = (
        "fetch(",
        "localStorage",
        "sessionStorage",
        "navigator.sendBeacon",
        "XMLHttpRequest",
        "SUPABASE_URL",
    )
    for marker in forbidden:
        if marker in model:
            errors.append(f"{MODEL.name}: pure model contains forbidden side effect {marker!r}")

    client = CLIENT.read_text(encoding="utf-8")
    minimize_call = "let data = minimizeNavigatorReadPayload(await parse(response));"
    recovery_call = "if (name === 'nav_v2_get_deals_list') data = recoverNewDealsOnly(data);"
    require(
        client,
        (
            "import { minimizeNavigatorReadPayload } from './read-layer-minimization-model-v2.js?v=20260716-01';",
            minimize_call,
            "if (name === 'nav_v2_get_my_profile') saveCachedProfile",
            recovery_call,
        ),
        CLIENT.name,
        errors,
    )
    if minimize_call in client and recovery_call in client and client.index(minimize_call) > client.index(recovery_call):
        errors.append("supabase-v2.js: minimization must happen before deal-list recovery and caching")

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(
        semantic,
        (
            "employee phone must remain available",
            "task title must not be replaced",
            "manager queue title must be neutral",
            "non-deal mutation result must not be rewritten",
            "apartment must be removed from address",
            "demo prefix must survive minimization",
        ),
        SEMANTIC.name,
        errors,
    )

    if errors:
        print("Navigator v2 read-layer minimization contract errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Navigator v2 read-layer minimization contract passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
