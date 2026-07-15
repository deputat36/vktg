from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'model': ROOT / 'assets/js/nav-v2/sensitive-free-text-model-v2.js',
    'guard': ROOT / 'assets/js/nav-v2/sensitive-free-text-guard-v2.js',
    'spn_helper': ROOT / 'assets/js/nav-v2/spn-party-names-adaptive-v2.js',
    'spn_page': ROOT / 'spn-v2.html',
    'deal_hook': ROOT / 'assets/js/nav-v2/deal-card-recheck-alert-v2.js',
    'semantic': ROOT / 'scripts/check-nav-v2-sensitive-free-text.mjs',
    'fixture': ROOT / 'tests/fixtures/nav-v2-sensitive-free-text-guard.html',
    'browser': ROOT / 'tests/e2e/sensitive-free-text-guard.spec.js',
    'workflow': ROOT / '.github/workflows/nav-v2-sensitive-free-text-guard.yml',
}
errors = []
texts = {}
for name, path in FILES.items():
    if not path.exists():
        errors.append(f'missing {path.relative_to(ROOT)}')
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name, markers):
    for marker in markers:
        if marker not in texts.get(name, ''):
            errors.append(f'{FILES[name].name}: missing {marker}')


if not errors:
    require('model', (
        'detectSensitiveFreeText',
        'sensitiveFreeTextMessage',
        'hasSensitiveFreeText',
        'luhnValid',
        'EMAIL_RE',
        'PHONE_RE',
        'PASSPORT_RE',
        'SNILS_RE',
        'CARD_CANDIDATE_RE',
    ))
    for forbidden in ('document.', 'window.', 'localStorage', 'sessionStorage', 'rpc(', 'fetch('):
        if forbidden in texts['model']:
            errors.append(f'sensitive model must remain pure: {forbidden}')
    if 'values.join' in texts['model'] or 'match[0]' in texts['model'].split('sensitiveFreeTextMessage', 1)[-1]:
        errors.append('user-visible warning must not echo detected sensitive values')

    require('guard', (
        'installSensitiveFreeTextGuard',
        'validateSensitiveFreeTextControl',
        'validateSensitiveFreeTextScope',
        'data-allow-sensitive',
        "target.addEventListener('submit', onSubmit, true)",
        "target.addEventListener('pointerup', onPointerAction, true)",
        "target.addEventListener('click', onPointerAction, true)",
        'event.stopImmediatePropagation()',
        'aria-errormessage',
        'data-sensitive-free-text-error',
    ))
    for forbidden in ('rpc(', 'fetch(', 'localStorage', 'sessionStorage', 'navigator.sendBeacon'):
        if forbidden in texts['guard']:
            errors.append(f'sensitive guard must remain local-only: {forbidden}')

    require('spn_helper', (
        "sensitive-free-text-guard-v2.js?v=20260715-01",
        'installSensitiveFreeTextGuard();',
    ))
    helper_pos = texts['spn_page'].find('spn-party-names-adaptive-v2.js?v=20260715-01')
    core_pos = texts['spn_page'].find('spn-smart-v4.js?v=20260627-0345')
    if helper_pos < 0 or core_pos < 0 or helper_pos > core_pos:
        errors.append('SPN privacy guard must load before core wizard action handlers')

    require('deal_hook', (
        "sensitive-free-text-guard-v2.js?v=20260715-01",
        'installSensitiveFreeTextGuard();',
        'function applyCardEnhancements()',
    ))
    if '<script type="module" src="./assets/js/nav-v2/sensitive-free-text-guard-v2.js' in texts['spn_page']:
        errors.append('privacy guard must use an existing entry module and not increase page-module budget')

    require('semantic', (
        'client@example.ru',
        '+7 (903) 857-67-10',
        '1234 567890',
        '123-456-789 01',
        '4111 1111 1111 1111',
        'Цена сделки 4 500 000 рублей',
        'semantic regression passed',
    ))
    require('fixture', (
        'id="addComment"',
        'id="decisionForm"',
        'data-action="draft"',
        'data-action="save"',
        'data-allow-sensitive',
        'installSensitiveFreeTextGuard',
    ))
    require('browser', (
        'comment save is blocked for phone and allowed after correction',
        'dialog form preserves text and blocks passport, SNILS and email',
        'wizard draft and final save are blocked for a valid bank-card number',
        'amounts, dates and object references do not trigger false positives',
        'explicitly allowed field is not inspected',
    ))
    require('workflow', (
        'check_nav_v2_sensitive_free_text_guard.py',
        'check-nav-v2-sensitive-free-text.mjs',
        'sensitive-free-text-guard.spec.js',
        'chromium-desktop',
        'chromium-mobile',
    ))

if errors:
    print('Navigator v2 sensitive free-text guard errors:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print('Navigator v2 sensitive free-text guard checks passed')
