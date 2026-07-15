from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
ADMIN_HELPER = ROOT / 'assets/js/nav-v2/admin-profile-editor-ux-v2.js'
ACCESS = ROOT / 'assets/js/nav-v2/nav-temp-password-v2.js'
LOADER = ROOT / 'assets/js/nav-v2/admin-loader-v2.js'
ADMIN_PAGE = ROOT / 'admin-v2.html'
EDGE = ROOT / 'supabase/functions/nav-invite-user/index.ts'
MIGRATION = ROOT / 'supabase/migrations/20260715213000_nav_v2_retire_viewer_assignment.sql'
POLICY = ROOT / 'config/nav-v2-data-minimization.json'
BASELINE = ROOT / 'docs/NAV_V2_DATA_MINIMIZATION_BASELINE_2026-07-15.md'
FIXTURE = ROOT / 'tests/fixtures/nav-v2-retired-viewer-role.html'
BROWSER = ROOT / 'tests/e2e/retired-viewer-role.spec.js'
WORKFLOW = ROOT / '.github/workflows/nav-v2-retired-viewer-role.yml'

errors = []
paths = (ADMIN_HELPER, ACCESS, LOADER, ADMIN_PAGE, EDGE, MIGRATION, POLICY, BASELINE, FIXTURE, BROWSER, WORKFLOW)
for path in paths:
    if not path.exists():
        errors.append(f'missing {path.relative_to(ROOT)}')


def require(text, markers, label):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker}')


if not errors:
    admin = ADMIN_HELPER.read_text(encoding='utf-8')
    require(admin, (
        "const RETIRED_ROLE = 'viewer'",
        'function retireViewerOptions()',
        'function blockRetiredRoleAction(event)',
        'option.disabled = true',
        'option.remove()',
        "document.addEventListener('click', blockRetiredRoleAction, true)",
        'Роль «Наблюдатель» больше не назначается'
    ), ADMIN_HELPER.name)
    for forbidden in ('rpc(', 'fetch(', 'localStorage', 'sessionStorage'):
        if forbidden in admin:
            errors.append(f'{ADMIN_HELPER.name}: retired role UI helper must remain local-only: {forbidden}')

    access = ACCESS.read_text(encoding='utf-8')
    require(access, (
        "const ASSIGNABLE_ROLES = new Set(['admin', 'manager', 'spn', 'lawyer', 'broker'])",
        'if (!ASSIGNABLE_ROLES.has(payload.role))',
        'Роль «Наблюдатель» выведена из использования',
        "./nav-temp-password-v2.js?v=20260715-01"
    )[:-1], ACCESS.name)
    if '<option value="viewer">' in access or '<option value="viewer" selected>' in access:
        errors.append(f'{ACCESS.name}: viewer must not be offered in access-link role options')

    loader = LOADER.read_text(encoding='utf-8')
    require(loader, ("access: './nav-temp-password-v2.js?v=20260715-01'",), LOADER.name)

    admin_page = ADMIN_PAGE.read_text(encoding='utf-8')
    require(admin_page, ('admin-profile-editor-ux-v2.js?v=20260715-01',), ADMIN_PAGE.name)

    edge = EDGE.read_text(encoding='utf-8')
    require(edge, (
        'const ROLES = new Set(["owner", "admin", "manager", "spn", "lawyer", "broker"]);',
        'const RETIRED_ROLES = new Set(["viewer"]);',
        'if (RETIRED_ROLES.has(role))',
        'Роль «Наблюдатель» больше не назначается'
    ), EDGE.name)
    if '"broker", "viewer"' in edge:
        errors.append(f'{EDGE.name}: viewer remains in assignable roles')

    migration = MIGRATION.read_text(encoding='utf-8')
    require(migration, (
        'create or replace function public.nav_v2_link_user_by_email',
        'create or replace function public.nav_v2_update_user_profile',
        "p_role = 'viewer'::public.nav_v2_user_role",
        "v_current_role = 'viewer'::public.nav_v2_user_role and p_is_active = false",
        'enum remains for compatibility',
        'Viewer may only be retained for deactivation'
    ), MIGRATION.name)

    try:
        policy = json.loads(POLICY.read_text(encoding='utf-8'))
    except Exception as exc:
        errors.append(f'{POLICY.name}: invalid JSON: {exc}')
        policy = {}
    viewer = policy.get('retired_roles', {}).get('viewer', {})
    if viewer.get('assignable') is not False:
        errors.append(f'{POLICY.name}: viewer.assignable must be false')
    if viewer.get('enum_retained_for_compatibility') is not True:
        errors.append(f'{POLICY.name}: enum compatibility decision missing')
    forbidden_categories = set(policy.get('classes', {}).get('forbidden_new_categories', []))
    for category in ('client_names_and_contacts', 'client_document_files_or_photos', 'personal_data_of_children'):
        if category not in forbidden_categories:
            errors.append(f'{POLICY.name}: missing forbidden category {category}')
    if policy.get('historical_data', {}).get('automatic_cleanup_allowed') is not False:
        errors.append(f'{POLICY.name}: historical automatic cleanup must remain false')

    baseline = BASELINE.read_text(encoding='utf-8')
    require(baseline, (
        'Проверка выполнена агрегированными read-only запросами',
        'Телефон продавца повторяется в snapshot',
        'Исторические записи автоматически не очищаются',
        'активных и неактивных профилей с ролью `viewer` в production нет'
    ), BASELINE.name)

    fixture = FIXTURE.read_text(encoding='utf-8')
    require(fixture, ('id="newRole"', 'data-role="legacy-viewer"', 'window.fixtureSaveCount'), FIXTURE.name)

    browser = BROWSER.read_text(encoding='utf-8')
    require(browser, (
        'new profiles no longer offer the viewer role',
        'legacy viewer stays visible only long enough to select a working role',
        'manual viewer injection is blocked before the profile save handler',
        "option[value=\"viewer\"]"
    ), BROWSER.name)

    workflow = WORKFLOW.read_text(encoding='utf-8')
    require(workflow, (
        'check_nav_v2_retired_viewer_role.py',
        'retired-viewer-role.spec.js',
        'chromium-desktop',
        'chromium-mobile'
    ), WORKFLOW.name)

if errors:
    print('Navigator v2 retired viewer role errors:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print('Navigator v2 retired viewer role checks passed')
