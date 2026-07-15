from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'model': ROOT / 'assets/js/nav-v2/client-data-minimization-model-v2.js',
    'wizard': ROOT / 'assets/js/nav-v2/spn-party-names-adaptive-v2.js',
    'idempotency': ROOT / 'assets/js/nav-v2/spn-save-idempotency-model-v2.js',
    'summary': ROOT / 'assets/js/nav-v2/party-summary-v2.js',
    'page': ROOT / 'spn-v2.html',
    'migration': ROOT / 'supabase/migrations/20260715224500_nav_v2_minimize_client_identifiers.sql',
    'policy': ROOT / 'config/nav-v2-data-minimization.json',
    'semantic': ROOT / 'scripts/check-nav-v2-client-data-minimization.mjs',
    'fixture': ROOT / 'tests/fixtures/nav-v2-client-data-minimization.html',
    'browser': ROOT / 'tests/e2e/client-data-minimization.spec.js',
    'workflow': ROOT / '.github/workflows/nav-v2-client-data-minimization.yml',
}
errors = []
texts = {}
for name, path in FILES.items():
    if not path.exists(): errors.append(f'missing {path.relative_to(ROOT)}')
    else: texts[name] = path.read_text(encoding='utf-8')

def require(name, markers):
    for marker in markers:
        if marker not in texts.get(name, ''):
            errors.append(f'{FILES[name].name}: missing {marker}')

if not errors:
    require('model', ('FORBIDDEN_DIRECT_KEYS', 'sanitizeClientDeal', 'sanitizeWizardResult', 'neutralDealTitle', 'hasDirectClientIdentifiers'))
    for forbidden in ('document.', 'window.', 'localStorage', 'sessionStorage', 'rpc(', 'fetch('):
        if forbidden in texts['model']: errors.append(f'minimization model must remain pure: {forbidden}')

    require('wizard', ('sanitizeStoredDraft', 'removeIdentifierFields', 'data-client-minimization-notice', 'location.reload()', 'MutationObserver'))
    if 'rpc(' in texts['wizard'] or 'fetch(' in texts['wizard']:
        errors.append('wizard privacy helper must remain local-only')

    require('idempotency', ('sanitizeClientDeal', 'deal: stable(sanitizeClientDeal'))
    require('page', ('spn-party-names-adaptive-v2.js?v=20260715-01', '[data-field="buyerPhone"]', '[data-field="sellerName"]'))

    require('summary', ('neutralDealTitle', 'Навигатор хранит роли и ход подготовки', 'p_seller_name:null', 'p_buyer_phone:null'))
    for forbidden in ('deal.seller_name', 'deal.buyer_name', 'deal.seller_phone', 'deal.buyer_phone', 'ФИО продавца', 'Телефон покупателя'):
        if forbidden in texts['summary']: errors.append(f'party summary exposes retired client identifier: {forbidden}')

    require('migration', (
        'nav_v2_sanitize_client_deal_json',
        'nav_v2_guard_client_identifiers',
        "if tg_op = 'INSERT' then",
        'new.seller_name is distinct from old.seller_name',
        'new.wizard_snapshot is distinct from old.wizard_snapshot',
        'unrelated edits do not silently clean history',
        'nav_v2_deals_guard_client_identifiers',
        'before insert or update of seller_name, buyer_name, seller_phone, buyer_phone, wizard_snapshot, deal_summary',
        "execute 'alter function public.nav_v2_save_wizard_result(jsonb) set schema nav_v2_private'",
        'nav_v2_save_wizard_result_legacy_20260715',
        'create or replace function public.nav_v2_save_wizard_result',
        "'client_identifiers_minimized', true",
        'create or replace function public.nav_v2_update_deal_parties',
        'direct client identity arguments are ignored',
    ))
    trigger_line = 'before insert or update of seller_name, buyer_name, seller_phone, buyer_phone, wizard_snapshot, deal_summary'
    if trigger_line not in texts['migration']:
        errors.append('identity trigger must exclude address/object_type to preserve unrelated historical edits')
    if 'update public.nav_deals_v2\n  set seller_name = null' in texts['migration']:
        errors.append('migration must not bulk-clean historical rows')

    policy = json.loads(texts['policy'])
    categories = set(policy.get('classes', {}).get('forbidden_new_categories', []))
    if 'client_names_and_contacts' not in categories:
        errors.append('data minimization policy must forbid new client names and contacts')
    if policy.get('historical_data', {}).get('automatic_cleanup_allowed') is not False:
        errors.append('historical cleanup must remain decision-gated')

    require('semantic', ('fingerprintA', 'fingerprintB', 'assert.equal(fingerprintA, fingerprintB)', 'semantic regression passed'))
    require('fixture', ('nav_deal_draft_v2', 'data-field="buyerName"', 'spn-party-names-adaptive-v2.js?v=20260715-01'))
    require('browser', ('legacy browser draft is reloaded without direct client identifiers', 'manually injected retired field is removed', 'privacy guard remains stable'))
    require('workflow', ('check_nav_v2_client_data_minimization.py', 'check-nav-v2-client-data-minimization.mjs', 'client-data-minimization.spec.js', 'chromium-desktop', 'chromium-mobile'))

if errors:
    print('Navigator v2 client data minimization errors:')
    for error in errors: print(f'- {error}')
    sys.exit(1)
print('Navigator v2 client data minimization checks passed')
