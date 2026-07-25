from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'assets/js/nav-v2/work-route-continuity-v1.js'
SAFE_LINKS = ROOT / 'assets/js/nav-v2/safe-card-links-v2.js'
DASHBOARD = ROOT / 'dashboard-v2.html'
DEALS = ROOT / 'deals-v2.html'
SEMANTIC = ROOT / 'scripts/check-nav-v2-work-route-continuity.mjs'
FIXTURE = ROOT / 'tests/fixtures/nav-v2-work-route-continuity.html'
E2E = ROOT / 'tests/e2e/work-route-continuity.spec.js'
CONFIG = ROOT / 'config/nav-v2-work-route-continuity-v1.json'

errors: list[str] = []
for path in (MODULE, SAFE_LINKS, DASHBOARD, DEALS, SEMANTIC, FIXTURE, E2E, CONFIG):
    if not path.exists():
        errors.append(f'missing work-route file: {path.relative_to(ROOT)}')

if errors:
    print('Navigator v2 work route continuity errors:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

module = MODULE.read_text(encoding='utf-8')
safe_links = SAFE_LINKS.read_text(encoding='utf-8')
dashboard = DASHBOARD.read_text(encoding='utf-8')
deals = DEALS.read_text(encoding='utf-8')
semantic = SEMANTIC.read_text(encoding='utf-8')
fixture = FIXTURE.read_text(encoding='utf-8')
e2e = E2E.read_text(encoding='utf-8')

script_marker = 'work-route-continuity-v1.js?v=20260725-01'
if script_marker not in dashboard:
    errors.append('dashboard-v2.html must load the versioned work-route module')
if script_marker not in safe_links:
    errors.append('safe-card-links-v2.js must integrate the versioned work-route module for deals')
if 'safe-card-links-v2.js?v=20260725-01' not in deals:
    errors.append('deals-v2.html must cache-bust the integrated safe-card link module')
if dashboard.count('type="module"') > 2:
    errors.append('dashboard direct module budget exceeded')
if deals.count('type="module"') > 9:
    errors.append('deals direct module budget exceeded')

required_module_markers = [
    'export function workTargetFromDeal',
    'export function workTargetFromAction',
    'export function hrefWithWorkTab',
    'export function applyWorkRouteContinuity',
    "window.addEventListener(DEALS_LOADED_EVENT, scheduleApply)",
    'new MutationObserver(scheduleApply)',
    'workRouteTab',
    'Открыть задачи',
    'Открыть риски',
    'Открыть документы',
]
for marker in required_module_markers:
    if marker not in module:
        errors.append(f'work route module missing marker: {marker}')

for forbidden in ['rpc(', 'nav_v2_update_', 'nav_v2_add_', 'nav_v2_save_', 'localStorage', 'sessionStorage', 'fetch(']:
    if forbidden in module:
        errors.append(f'work route module must remain read-only: {forbidden}')

if 'if (text(link.textContent) !== label) link.textContent = label;' not in module:
    errors.append('work route label updates must be idempotent')
if '{ childList: true, subtree: true }' not in module:
    errors.append('work route observer must not watch attributes')
if 'workTargetFromDeal(assignedDeal' not in semantic:
    errors.append('semantic check must cover role-aware deal routing')
if 'role-home-priority-card' not in fixture or 'deals-work-card' not in fixture:
    errors.append('browser fixture must cover dashboard and deal list routes')
if '#tasks' not in e2e or '#risks' not in e2e or '#docs' not in e2e:
    errors.append('browser test must cover task, risk and document destinations')

if errors:
    print('Navigator v2 work route continuity errors:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print('Navigator v2 work route continuity static contract passed')
