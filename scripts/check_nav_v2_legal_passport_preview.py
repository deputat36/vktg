from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "assets/js/nav-v2/deal-card-legal-passport-model-v1.js"
VIEW = ROOT / "assets/js/nav-v2/deal-card-legal-passport-v1.js"
CSS = ROOT / "assets/css/nav-v2-legal-passport.css"
LIFECYCLE = ROOT / "assets/js/nav-v2/deal-card-recheck-alert-v2.js"
PAGE = ROOT / "deal-card-v2.html"
SEMANTIC = ROOT / "scripts/check-nav-v2-legal-passport-preview.mjs"
FIXTURE = ROOT / "tests/fixtures/nav-v2-legal-passport-preview.html"
E2E = ROOT / "tests/e2e/legal-passport-preview.spec.js"
WORKFLOW = ROOT / ".github/workflows/nav-v2-legal-passport-preview.yml"


def require(text: str, markers: tuple[str, ...], label: str, errors: list[str]) -> None:
    for marker in markers:
        if marker not in text:
            errors.append(f"{label}: missing {marker!r}")


def main() -> int:
    errors: list[str] = []
    files = (MODEL, VIEW, CSS, LIFECYCLE, PAGE, SEMANTIC, FIXTURE, E2E, WORKFLOW)
    for path in files:
        if not path.exists():
            errors.append(f"missing {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors))
        return 1

    model = MODEL.read_text(encoding="utf-8")
    require(model, (
        "export function buildLegalPassportCardModel(data = {})",
        "snapshot?.deal?.legal_passport",
        "deal?.deal_summary?.legal_passport",
        "legacy_incomplete",
        "Источник значимых фактов",
        "participantName(data, deal.seller_spn_id)",
        "participantName(data, deal.buyer_spn_id)",
    ), MODEL.name, errors)
    for forbidden in ("document.", "window.", "rpc(", "fetch(", "localStorage", "sessionStorage"):
        if forbidden in model:
            errors.append(f"{MODEL.name}: pure model contains {forbidden!r}")

    view = VIEW.read_text(encoding="utf-8")
    require(view, (
        "export function applyDealCardLegalPassport(data, profile)",
        "profile?.role || data?.profile?.role",
        "Паспорт v1",
        "Старая карточка",
        "Подтверждено документом",
        "Со слов клиента",
        "Пока неизвестно",
        "data-legal-passport-action=\"return_spn\"",
        "data-legal-passport-action=\"need_documents\"",
        "data-legal-passport-action=\"stop_factor\"",
    ), VIEW.name, errors)
    for forbidden in ("rpc(", "fetch(", "localStorage", "sessionStorage", "new MutationObserver"):
        if forbidden in view:
            errors.append(f"{VIEW.name}: read-only view contains {forbidden!r}")

    lifecycle = LIFECYCLE.read_text(encoding="utf-8")
    require(lifecycle, (
        "import { applyDealCardLegalPassport } from './deal-card-legal-passport-v1.js?v=20260717-01';",
        "applyDealCardLegalPassport(cardData, profileData);",
    ), LIFECYCLE.name, errors)
    page = PAGE.read_text(encoding="utf-8")
    require(page, ("nav-v2-legal-passport.css?v=20260717-01",), PAGE.name, errors)
    css = CSS.read_text(encoding="utf-8")
    require(css, ("@media(max-width:430px)", ".legal-passport-actions", ".legal-passport-grid"), CSS.name, errors)

    semantic = SEMANTIC.read_text(encoding="utf-8")
    require(semantic, ("canonical.source", "legacy.source", "unsupported.source", "passport_number"), SEMANTIC.name, errors)
    e2e = E2E.read_text(encoding="utf-8")
    require(e2e, (
        "testInfo.project.name",
        "DOCUMENT_POSITION_FOLLOWING",
        "mutationRequests",
        "Старая карточка",
        "Подтверждённых фактов нет.",
        "scrollWidth",
    ), E2E.name, errors)
    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "python3 scripts/check_nav_v2_legal_passport_preview.py",
        "node scripts/check-nav-v2-legal-passport-preview.mjs",
        "tests/e2e/legal-passport-preview.spec.js",
        "--project=chromium-desktop --project=chromium-mobile",
    ), WORKFLOW.name, errors)

    if errors:
        print("Navigator v2 legal passport preview errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Navigator v2 legal passport preview passed: lawyer-first canonical passport, honest legacy fallback, "
        "loaded-payload-only rendering, existing decision actions, privacy and responsive browser coverage"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
