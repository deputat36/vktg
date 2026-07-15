from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'admin': ROOT / 'assets/js/nav-v2/admin-profile-editor-ux-v2.js',
    'access': ROOT / 'assets/js/nav-v2/nav-temp-password-v2.js',
    'loader': ROOT / 'assets/js/nav-v2/admin-loader-v2.js',
    'page': ROOT / 'admin-v2.html',
    'edge': ROOT / 'supabase/functions/nav-invite-user/index.ts',
    'migration': ROOT / 'supabase/migrations/20260715213000_nav_v2_retire_viewer_assignment.sql',
    'policy': ROOT / 'config/nav-v2-data-minimization.json',
    'baseline': ROOT / 'docs/NAV_V2_DATA_MINIMIZATION_BASELINE_2026-07-15.md',
    'fixture': ROOT / 'tests/fixtures/nav-v2-retired-viewer-role.html',
    'browser': ROOT / 'tests/e2e/retired-viewer-role.spec.js',
    'workflow': ROOT / '.github/workflows/nav-v2-retired-viewer-role.yml',
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
    require('admin', ("const RETIRED_ROLE = 'viewer'", 'retireViewerOptions', 'blockRetiredRoleAction', 'option.disabled = true', 'option.remove()', "addEventListener('click', blockRetiredRoleAction, true)"))
    for forbidden in ('rpc(', 'fetch(', 'localStorage', 'sessionStorage'):
        if forbidden in texts['admin']:
            errors.append(f'admin helper must remain local-only: {forbidden}')

    require('access', ("ASSIGNABLE_ROLES = new Set(['admin', 'manager', 'spn', 'lawyer', 'broker'])", 'if (!ASSIGNABLE_ROLES.has(payload.role))', 'Роль «Наблюдатель» выведена из использования'))
    if '<option value="viewer">' in texts['access']:
        errors.append('access form must not offer viewer')
    require('loader', ("access: './nav-temp-password-v2.js?v=20260715-01'",))
    require('page', ('admin-profile-editor-ux-v2.js?v=20260715-01',))

    require('edge', ('const ROLES = new Set(["owner", "admin", "manager", "spn", "lawyer", "broker", "viewer"]);', 'if (!ROLES.has(role))'))
    if 'RETIRED_ROLES' in texts['edge']:
        errors.append('Edge source must remain aligned with approved live baseline')

    require('migration', (
        'nav_v2_guard_retired_viewer_role',
        "new.role = 'viewer'::public.nav_v2_user_role and new.is_active = true",
        'nav_v2_profiles_guard_retired_viewer',
        'before insert or update of role, is_active',
        'revoke all on function nav_v2_private.nav_v2_guard_retired_viewer_role() from authenticated',
        'nav_v2_link_user_by_email',
        'nav_v2_update_user_profile',
        "p_role = 'viewer'::public.nav_v2_user_role",
        "v_current_role = 'viewer'::public.nav_v2_user_role and p_is_active = false",
        'table trigger also protects Edge and direct privileged writes',
    ))

    policy = json.loads(texts['policy'])
    viewer = policy.get('retired_roles', {}).get('viewer', {})
    if viewer.get('assignable') is not False or viewer.get('enum_retained_for_compatibility') is not True:
        errors.append('policy viewer retirement contract is incomplete')
    if policy.get('historical_data', {}).get('automatic_cleanup_allowed') is not False:
        errors.append('historical cleanup must remain decision-gated')

    require('baseline', ('агрегированными read-only запросами', 'Телефон продавца повторяется в snapshot', 'Исторические записи автоматически не очищаются', 'профилей с ролью `viewer` в production нет'))
    require('fixture', ('id="newRole"', 'data-role="legacy-viewer"', 'window.fixtureSaveCount'))
    require('browser', ('new profiles no longer offer the viewer role', 'legacy viewer stays visible only long enough to select a working role', 'manual viewer injection is blocked before the profile save handler'))
    require('workflow', ('check_nav_v2_retired_viewer_role.py', 'retired-viewer-role.spec.js', 'chromium-desktop', 'chromium-mobile'))

if errors:
    print('Navigator v2 retired viewer role errors:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)
print('Navigator v2 retired viewer role checks passed')
