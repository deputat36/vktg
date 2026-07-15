from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
EDGE = ROOT / 'supabase/functions/nav-invite-user/index.ts'
ACCESS = ROOT / 'assets/js/nav-v2/nav-temp-password-v2.js'
ACCEPT = ROOT / 'assets/js/nav-v2/nav-accept-invite-v2.js'
LOADER = ROOT / 'assets/js/nav-v2/admin-loader-v2.js'
SYSTEM = ROOT / 'assets/js/nav-v2/nav-system-check-v2.js'
SYSTEM_PAGE = ROOT / 'nav-system-check-v2.html'
MIGRATION = ROOT / 'supabase/migrations/20260715213000_nav_v2_retire_viewer_assignment.sql'
paths = (EDGE, ACCESS, ACCEPT, LOADER, SYSTEM, SYSTEM_PAGE, MIGRATION)
errors = [f'Missing invite-flow file: {p.relative_to(ROOT)}' for p in paths if not p.exists()]

def check(text, markers, label):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label} missing marker: {marker}')

if not errors:
    edge = EDGE.read_text(encoding='utf-8')
    access = ACCESS.read_text(encoding='utf-8')
    accept = ACCEPT.read_text(encoding='utf-8')
    loader = LOADER.read_text(encoding='utf-8')
    system = SYSTEM.read_text(encoding='utf-8')
    system_page = SYSTEM_PAGE.read_text(encoding='utf-8')
    migration = MIGRATION.read_text(encoding='utf-8')

    check(edge, (
        'const ACTIONS = new Set(["access_link", "invite_email", "dry_run"])',
        'if (!ACTIONS.has(action))',
        'if (role === "spn" && !managerId)',
        'if (!["owner", "admin"].includes(profile.role))',
        'if (!["owner", "admin", "manager"].includes(data.role))',
        'type: "recovery"',
        'redirectTo: REDIRECT',
    ), EDGE.name)

    check(access, (
        "ASSIGNABLE_ROLES = new Set(['admin', 'manager', 'spn', 'lawyer', 'broker'])",
        "action: 'access_link'",
        'if (!ASSIGNABLE_ROLES.has(payload.role))',
        "if (payload.role === 'spn' and not payload.manager_id)",
        'Для СПН обязательно выберите менеджера.',
        'manager.required = required',
        'makeSafeAccessLink',
    ), ACCESS.name)
    if '<option value="viewer">' in access:
        errors.append('nav-temp-password-v2.js must not offer viewer')

    check(migration, (
        'nav_v2_guard_retired_viewer_role',
        "new.role = 'viewer'::public.nav_v2_user_role and new.is_active = true",
        'nav_v2_profiles_guard_retired_viewer',
        'table trigger also protects Edge and direct privileged writes',
    ), MIGRATION.name)

    check(accept, ('token_hash', 'access_token', '/auth/v1/verify', '/auth/v1/user', "method: 'PUT'", 'dashboard-v2.html'), ACCEPT.name)
    if 'SUPABASE_SERVICE_ROLE_KEY' in access or 'SUPABASE_SERVICE_ROLE_KEY' in accept:
        errors.append('Browser invite modules must not reference service role key')
    if "nav-temp-password-v2.js?v=20260715-01" not in loader:
        errors.append('admin-loader-v2.js missing access module cache-bust')
    check(system, ('const managerId = currentProfile?.id || getCachedUser()?.id || null', 'manager_id: managerId', 'dry_run с обязательным менеджером СПН'), SYSTEM.name)
    if 'nav-system-check-v2.js?v=20260711-01' not in system_page:
        errors.append('nav-system-check-v2.html missing dry_run cache-bust')

if errors:
    print('\n'.join(errors))
    sys.exit(1)
print('Navigator v2 invite flow static checks passed')
