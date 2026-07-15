from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []

html = (ROOT / 'dashboard-v2.html').read_text(encoding='utf-8')
dashboard = (ROOT / 'assets/js/nav-v2/dashboard-v2.js').read_text(encoding='utf-8')
model = (ROOT / 'assets/js/nav-v2/dashboard-priority-v2.js').read_text(encoding='utf-8')
css = (ROOT / 'assets/css/nav-v2-role-home.css').read_text(encoding='utf-8')
budget = (ROOT / 'config/nav-v2-module-budget.json').read_text(encoding='utf-8')

required_dashboard_markers = [
    "from './dashboard-priority-v2.js?v=20260714-01'",
    'Что делать сейчас',
    'На что обратить внимание',
    'role-home-priority-list',
    'точных повторов объединено',
    'демо-карточек скрыто',
    'Показаны шесть последних рабочих карточек',
    "rpc('nav_v2_get_deals_list'",
]
for marker in required_dashboard_markers:
    if marker not in dashboard:
        errors.append(f'dashboard-v2.js missing marker: {marker}')

required_model_markers = [
    'export function buildDashboardFocus',
    'export function dashboardDuplicateKey',
    'export function isDashboardDemoDeal',
    'hiddenDuplicateCount',
    'hiddenDemoCount',
    'overdueTasks',
    'redRisks',
]
for marker in required_model_markers:
    if marker not in model:
        errors.append(f'dashboard-priority-v2.js missing marker: {marker}')

for forbidden in ['nav_v2_update_', 'nav_v2_add_', 'nav_v2_save_', 'localStorage', 'sessionStorage']:
    if forbidden in model:
        errors.append(f'dashboard priority model must remain read-only and memory-only: {forbidden}')

required_css_markers = [
    '.role-home-focus',
    '.role-home-priority-card',
    '.role-home-reason.danger',
    '.role-home-profile-details',
]
for marker in required_css_markers:
    if marker not in css:
        errors.append(f'nav-v2-role-home.css missing marker: {marker}')

if 'dashboard-v2.js?v=20260715-01' not in html:
    errors.append('dashboard-v2.html must use the new dashboard cache-bust')
if 'nav-v2-role-home.css?v=20260714-01' not in html:
    errors.append('dashboard-v2.html must use the new role-home CSS cache-bust')
if '"dashboard-v2.html": { "max_modules": 2 }' not in budget:
    errors.append('dashboard module budget must explicitly allow two modules')

rpc_calls = dashboard.count("rpc('") + dashboard.count('rpc("')
if rpc_calls != 1:
    errors.append(f'dashboard must keep exactly one RPC call, found {rpc_calls}')

if errors:
    print('Navigator v2 dashboard priority errors:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print('Navigator v2 dashboard priority static checks passed')
