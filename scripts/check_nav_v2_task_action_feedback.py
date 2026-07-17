from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / 'assets/js/nav-v2/task-action-guard-v2.js'
ROUTER = ROOT / 'assets/js/nav-v2/task-action-router-v2.js'
HELPER = ROOT / 'assets/js/nav-v2/page-action-feedback-v2.js'
BASE = ROOT / 'assets/js/nav-v2/deal-card-v2.js'
PAGE = ROOT / 'deal-card-v2.html'
FIXTURE = ROOT / 'tests/fixtures/nav-v2-task-action-feedback.html'
BROWSER = ROOT / 'tests/e2e/task-action-feedback.spec.js'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-action-feedback.yml'

errors = []
for path in (TASK, ROUTER, HELPER, BASE, PAGE, FIXTURE, BROWSER, WORKFLOW):
    if not path.exists():
        errors.append(f'missing {path.relative_to(ROOT)}')


def require(text, markers, label):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker}')


if not errors:
    task = TASK.read_text(encoding='utf-8')
    router = ROUTER.read_text(encoding='utf-8')
    helper = HELPER.read_text(encoding='utf-8')
    base = BASE.read_text(encoding='utf-8')
    page = PAGE.read_text(encoding='utf-8')
    fixture = FIXTURE.read_text(encoding='utf-8')
    browser = BROWSER.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    require(task, (
        "import { applyPageActionFeedback } from './page-action-feedback-v2.js?v=20260715-01';",
        "import { taskActionControlModel, taskActionRoutePreview } from './task-action-router-v2.js?v=20260716-01';",
        'const BOUNDED_TRANSPORT_ENABLED = false;',
        "rpc('nav_v2_get_deal_card_lite'",
        'await rpc(route.rpc_preview.name, route.rpc_preview.args)',
        "applyPageActionFeedback('Проверяю права на изменение задачи...', 'busy')",
        "applyPageActionFeedback('Обновляю статус задачи...', 'busy')",
        "applyPageActionFeedback('Статус задачи сохранён. Обновляю карточку...', 'success')",
        'Действие bounded-задачи распознано, но сохранение ещё не включено',
        'event.stopImmediatePropagation()',
        "app.addEventListener('click', handleTaskAction, true)",
        'button.onclick = null',
        'taskActionRoutePreview({ task, action, input: taskActionInput(button) })',
        'data-task-action',
        'data-task-status',
        'setTimeout(() => location.reload(), 250)',
        'can_change_status',
        'can_complete',
        'aria-disabled',
        'aria-busy'
    ), TASK.name)

    if task.count('rpc(') != 2:
        errors.append(f'{TASK.name}: expected exactly one permission read and one routed legacy mutation RPC, got {task.count("rpc(")}')
    if task.count('new MutationObserver') > 1:
        errors.append(f'{TASK.name}: must not add another observer')
    for forbidden in ('localStorage', 'sessionStorage', 'fetch(', 'sendBeacon', 'collector', 'telemetry', 'nav_v2_add_', 'nav_v2_save_'):
        if forbidden in task:
            errors.append(f'{TASK.name}: forbidden {forbidden}')

    require(router, (
        'taskActionControlModel',
        'taskActionRoutePreview',
        "name: 'nav_v2_update_task_status'",
        'Завершённая bounded-задача неизменяема'
    ), ROUTER.name)
    require(helper, ('applyPageActionFeedback', "'busy'", "'success'", "'error'"), HELPER.name)

    # The base source is still present in this slice, but the capture handler owns the click
    # and clears onclick before any routed mutation. Source deletion remains a separate cleanup.
    require(base, (
        "rpc('nav_v2_update_task_status'",
        'document.querySelectorAll(\'[data-task-id]\')'
    ), BASE.name)
    require(page, ('task-action-guard-v2.js?v=20260715-01',), PAGE.name)
    if '<script type="module" src="./assets/js/nav-v2/page-action-feedback-v2.js' in page:
        errors.append('page action feedback helper must not increase the HTML entry-module budget')

    require(fixture, (
        'id="pageStatus"',
        'data-task-status="in_progress"',
        'data-task-status="done"',
        'data-task-status="open"',
        'data-task-action="complete"',
        'data-task-action="reopen"',
        'data-evidence-reference-id=',
        '__baseTaskHandlerCalls',
        'task-action-guard-v2.js?v=20260717-01'
    ), FIXTURE.name)

    require(browser, (
        'cold first click checks permission and authoritative handler performs one legacy mutation',
        'permission denial explains the responsible role and never mutates the task',
        'permission lookup failure is assertive and leaves the task visible',
        'legacy mutation error restores controls and keeps the exact existing payload',
        'legacy completion and reopen use the same RPC while base onclick stays dormant',
        'bounded completion is routed by authoritative handler but transport remains disabled',
        "{ p_task_id: 'task-1', p_status: 'done' }",
        "{ p_task_id: 'task-1', p_status: 'open' }",
        'calls.mutationCalls).toHaveLength(0)',
        '__baseTaskHandlerCalls'
    ), BROWSER.name)

    require(workflow, (
        'check_nav_v2_task_action_feedback.py',
        'task-action-feedback.spec.js',
        'chromium-desktop',
        'chromium-mobile'
    ), WORKFLOW.name)

    combined = '\n'.join((task, fixture, browser))
    if re.search(r'tabindex=["\'][1-9]', combined, re.I):
        errors.append('positive tabindex is forbidden')

if errors:
    print('Navigator v2 task action feedback errors:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)
print('Navigator v2 task action feedback passed: authoritative capture handler routes legacy actions, bounded transport stays disabled and the dormant base onclick never executes')
