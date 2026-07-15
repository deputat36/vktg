from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / 'assets/js/nav-v2/task-action-guard-v2.js'
HELPER = ROOT / 'assets/js/nav-v2/page-action-feedback-v2.js'
BASE = ROOT / 'assets/js/nav-v2/deal-card-v2.js'
PAGE = ROOT / 'deal-card-v2.html'
FIXTURE = ROOT / 'tests/fixtures/nav-v2-task-action-feedback.html'
BROWSER = ROOT / 'tests/e2e/task-action-feedback.spec.js'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-action-feedback.yml'

errors = []
for path in (TASK, HELPER, BASE, PAGE, FIXTURE, BROWSER, WORKFLOW):
    if not path.exists():
        errors.append(f'missing {path.relative_to(ROOT)}')


def require(text, markers, label):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker}')


if not errors:
    task = TASK.read_text(encoding='utf-8')
    helper = HELPER.read_text(encoding='utf-8')
    base = BASE.read_text(encoding='utf-8')
    page = PAGE.read_text(encoding='utf-8')
    fixture = FIXTURE.read_text(encoding='utf-8')
    browser = BROWSER.read_text(encoding='utf-8')
    workflow = WORKFLOW.read_text(encoding='utf-8')

    require(task, (
        "import { applyPageActionFeedback } from './page-action-feedback-v2.js?v=20260715-01';",
        "rpc('nav_v2_get_deal_card_lite'",
        "rpc('nav_v2_update_task_status'",
        'p_task_id: taskId',
        'p_status: taskStatus',
        "applyPageActionFeedback('Проверяю права на изменение задачи...', 'busy')",
        "applyPageActionFeedback('Обновляю статус задачи...', 'busy')",
        "applyPageActionFeedback('Статус задачи сохранён. Обновляю карточку...', 'success')",
        "applyPageActionFeedback(`Ошибка задачи: ${error.message}`, 'error')",
        'event.stopImmediatePropagation()',
        'replayTaskId = taskId',
        'button.onclick = () => void saveTaskStatus(button)',
        'setTimeout(() => location.reload(), 250)',
        'can_change_status',
        'aria-disabled',
        'aria-busy'
    ), TASK.name)

    if task.count('rpc(') != 2:
        errors.append(f'{TASK.name}: expected exactly one permission read and one task mutation RPC, got {task.count("rpc(")}')
    if task.count('new MutationObserver') > 1:
        errors.append(f'{TASK.name}: must not add another observer')
    for forbidden in ('localStorage', 'sessionStorage', 'fetch(', 'sendBeacon', 'collector', 'telemetry', 'nav_v2_add_', 'nav_v2_save_'):
        if forbidden in task:
            errors.append(f'{TASK.name}: forbidden {forbidden}')

    require(helper, ('applyPageActionFeedback', "'busy'", "'success'", "'error'"), HELPER.name)
    require(base, (
        "rpc('nav_v2_update_task_status'",
        'p_task_id: btn.dataset.taskId',
        'p_status: btn.dataset.taskStatus'
    ), BASE.name)
    require(page, ('task-action-guard-v2.js?v=20260715-01',), PAGE.name)
    if '<script type="module" src="./assets/js/nav-v2/page-action-feedback-v2.js' in page:
        errors.append('page action feedback helper must not increase the HTML entry-module budget')

    require(fixture, (
        'id="pageStatus"',
        'data-task-status="in_progress"',
        'data-task-status="done"',
        'data-task-status="open"',
        '__baseTaskHandlerCalls',
        'task-action-guard-v2.js?v=20260715-01'
    ), FIXTURE.name)

    require(browser, (
        'cold first click checks permission and performs one task mutation without a repeat click',
        'permission denial explains the responsible role and never mutates the task',
        'permission lookup failure is assertive and leaves the task visible',
        'task mutation error restores controls and keeps the exact existing payload',
        'completion and reopen use the same existing RPC without duplicate handlers',
        "{ p_task_id: 'task-1', p_status: 'done' }",
        "{ p_task_id: 'task-1', p_status: 'open' }"
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
print('Navigator v2 task action feedback passed')
