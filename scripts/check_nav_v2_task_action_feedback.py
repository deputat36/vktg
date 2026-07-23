from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TASK = ROOT / 'assets/js/nav-v2/task-action-guard-v2.js'
ROUTER = ROOT / 'assets/js/nav-v2/task-action-router-v2.js'
MODEL = ROOT / 'assets/js/nav-v2/task-lifecycle-closure-model-v1.js'
HELPER = ROOT / 'assets/js/nav-v2/page-action-feedback-v2.js'
BASE = ROOT / 'assets/js/nav-v2/deal-card-v2.js'
PAGE = ROOT / 'deal-card-v2.html'
FIXTURE = ROOT / 'tests/fixtures/nav-v2-task-action-feedback.html'
BROWSER = ROOT / 'tests/e2e/task-action-feedback.spec.js'
UNIT = ROOT / 'tests/unit/nav-v2-task-lifecycle-closure.test.mjs'
CONTRACT = ROOT / 'config/nav-v2-task-lifecycle-closure-v1.json'
WORKFLOW = ROOT / '.github/workflows/nav-v2-task-action-feedback.yml'
DOC = ROOT / 'docs/NAV_V2_TASK_LIFECYCLE_CLOSURE_V1_2026-07-24.md'

errors = []
for path in (TASK, ROUTER, MODEL, HELPER, BASE, PAGE, FIXTURE, BROWSER, UNIT, CONTRACT, WORKFLOW, DOC):
    if not path.exists():
        errors.append(f'missing {path.relative_to(ROOT)}')


def require(text, markers, label):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing {marker}')


if not errors:
    task = TASK.read_text(encoding='utf-8')
    router = ROUTER.read_text(encoding='utf-8')
    model = MODEL.read_text(encoding='utf-8')
    helper = HELPER.read_text(encoding='utf-8')
    base = BASE.read_text(encoding='utf-8')
    page = PAGE.read_text(encoding='utf-8')
    fixture = FIXTURE.read_text(encoding='utf-8')
    browser = BROWSER.read_text(encoding='utf-8')
    unit = UNIT.read_text(encoding='utf-8')
    contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    workflow = WORKFLOW.read_text(encoding='utf-8')
    doc = DOC.read_text(encoding='utf-8')

    require(task, (
        "import { applyPageActionFeedback } from './page-action-feedback-v2.js?v=20260715-01';",
        "import { taskActionControlModel, taskActionRoutePreview } from './task-action-router-v2.js?v=20260716-01';",
        "from './task-lifecycle-closure-model-v1.js?v=20260724-01';",
        'const BOUNDED_TRANSPORT_ENABLED = false;',
        'const completionEvidence = new Map();',
        "rpc('nav_v2_get_deal_card_lite'",
        "await rpc('nav_v2_add_comment'",
        'await rpc(route.rpc_preview.name, route.rpc_preview.args)',
        'buildTaskCompletionComment(task, input?.value || \'\')',
        "p_visibility: 'team'",
        "completionEvidence.set(taskId, reference)",
        "completionEvidence.delete(taskId)",
        'Результат сохранён в комментариях, но статус задачи не изменён',
        'комментарий не будет продублирован',
        'Статус не изменён',
        'data-task-completion-result',
        'data-task-lifecycle-instruction',
        'Шаг 1 из 2.',
        'Шаг 2 из 2.',
        'Результат подтверждён.',
        "action === 'start'",
        "action === 'complete'",
        "action === 'reopen'",
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

    if task.count('rpc(') != 3:
        errors.append(f'{TASK.name}: expected permission read, result comment and routed status mutation RPC, got {task.count("rpc(")}')
    if task.count('new MutationObserver') > 1:
        errors.append(f'{TASK.name}: must not add another observer')
    task_without_allowed_comment = task.replace('nav_v2_add_comment', '')
    for forbidden in ('localStorage', 'sessionStorage', 'fetch(', 'sendBeacon', 'collector', 'telemetry', 'nav_v2_add_', 'nav_v2_save_'):
        if forbidden in task_without_allowed_comment:
            errors.append(f'{TASK.name}: forbidden {forbidden}')

    require(model, (
        'export function taskLifecyclePhase(task = {})',
        'export function taskLifecycleView(task = {}, canChange = false)',
        'export function validateTaskCompletionResult(value)',
        'export function buildTaskCompletionComment(task = {}, resultValue = \'\')',
        'MIN_COMPLETION_RESULT_LENGTH = 10',
        'MAX_COMPLETION_RESULT_LENGTH = 1200',
        'result_persisted_before_done: true',
        "result_visibility: 'team'",
        'production_schema_change: false',
        'atomic_server_completion: false'
    ), MODEL.name)
    for forbidden in ('document.', 'window.', 'localStorage', 'sessionStorage', 'fetch(', 'rpc(', '.from(', 'nav_v2_'):
        if forbidden in model:
            errors.append(f'{MODEL.name}: pure lifecycle model contains forbidden {forbidden}')

    require(router, (
        'taskActionControlModel',
        'taskActionRoutePreview',
        "name: 'nav_v2_update_task_status'",
        'Завершённая bounded-задача неизменяема'
    ), ROUTER.name)
    require(helper, ('applyPageActionFeedback', "'busy'", "'success'", "'error'"), HELPER.name)

    require(base, (
        'function taskActions(task)',
        'data-task-status="in_progress"',
        'data-task-status="done"',
        'data-task-status="open"',
        '${taskActions(task)}'
    ), BASE.name)
    for forbidden in (
        "rpc('nav_v2_update_task_status'",
        "document.querySelectorAll('[data-task-id]').forEach((btn) => btn.onclick",
        "setPageStatus('Обновляю задачу...')",
    ):
        if forbidden in base:
            errors.append(f'{BASE.name}: base task mutation source must be absent: {forbidden}')

    require(page, ('task-action-guard-v2.js?v=20260724-01',), PAGE.name)
    if '<script type="module" src="./assets/js/nav-v2/page-action-feedback-v2.js' in page:
        errors.append('page action feedback helper must not increase the HTML entry-module budget')
    if '<script type="module" src="./assets/js/nav-v2/task-lifecycle-closure-model-v1.js' in page:
        errors.append('lifecycle model must stay behind the authoritative task action guard')

    require(fixture, (
        'id="pageStatus"',
        'id="openTaskStart"',
        'id="progressTaskDone"',
        'id="doneTaskReopen"',
        'data-task-status="in_progress"',
        'data-task-status="done"',
        'data-task-status="open"',
        'data-task-action="complete"',
        'data-task-action="reopen"',
        'data-evidence-reference-id=',
        '__baseTaskHandlerCalls',
        'task-action-guard-v2.js?v=20260724-01'
    ), FIXTURE.name)

    require(browser, (
        'legacy controls follow open, in-progress and done lifecycle phases',
        'cold first click checks permission and starts an open task with one status mutation',
        'completion requires a concrete result before any mutation',
        'completion saves team result first and then marks the task done',
        'status failure after saved result is recoverable without duplicate comment',
        'comment failure blocks completion and keeps the task in progress',
        'permission denial explains the responsible role and never mutates the task',
        'permission lookup failure is assertive and leaves the task visible',
        'legacy start mutation error restores the relevant control',
        'done legacy task can be returned to work through the existing status RPC',
        'bounded completion is routed by authoritative handler but transport remains disabled',
        "p_task_id: 'task-progress', p_status: 'done'",
        "p_visibility: 'team'",
        "calls.mutationCalls.filter((call) => call.kind === 'comment')",
        '__baseTaskHandlerCalls'
    ), BROWSER.name)

    require(unit, (
        'taskLifecyclePhase',
        'taskLifecycleView',
        'validateTaskCompletionResult',
        'buildTaskCompletionComment',
        'result_persisted_before_done: true',
        'explicit non-atomic boundary'
    ), UNIT.name)

    if contract.get('decision') != 'legacy_task_lifecycle_closure_frontend_enabled_atomic_server_completion_blocked':
        errors.append('contract: unexpected decision')
    diagnosis = contract.get('diagnosis') or {}
    expected_counts = {
        'all_tasks': 98,
        'open_tasks': 88,
        'in_progress_tasks': 0,
        'done_tasks': 0,
        'cancelled_tasks': 10,
        'non_demo_tasks': 82,
        'non_demo_open_tasks': 78,
        'task_status_changed_events': 0,
        'tasks_with_overdue_explicit_due_date': 98,
        'missing_or_inactive_person_assignees': 0,
    }
    for key, value in expected_counts.items():
        if diagnosis.get(key) != value:
            errors.append(f'contract diagnosis: {key} must equal {value}')
    boundaries = contract.get('boundaries') or {}
    for key in (
        'production_schema_change',
        'production_data_backfill',
        'automatic_task_close',
        'automatic_assignment',
        'bounded_transport_enabled',
        'atomic_server_completion',
        'new_rpc_deployed',
        'leader_scope_change',
    ):
        if boundaries.get(key) is not False:
            errors.append(f'contract boundary: {key} must be false')
    blocked = contract.get('blocked_follow_up') or {}
    if blocked.get('item') != 'atomic_task_completion_rpc' or blocked.get('blocks_frontend_release') is not False:
        errors.append('contract: atomic server follow-up must be explicit and non-blocking for frontend')

    require(workflow, (
        'assets/js/nav-v2/task-lifecycle-closure-model-v1.js',
        'tests/unit/nav-v2-task-lifecycle-closure.test.mjs',
        'config/nav-v2-task-lifecycle-closure-v1.json',
        'docs/NAV_V2_TASK_LIFECYCLE_CLOSURE_V1_2026-07-24.md',
        'node --check assets/js/nav-v2/task-lifecycle-closure-model-v1.js',
        'node tests/unit/nav-v2-task-lifecycle-closure.test.mjs',
        'check_nav_v2_task_action_feedback.py',
        'task-action-feedback.spec.js',
        'chromium-desktop',
        'chromium-mobile'
    ), WORKFLOW.name)

    require(doc, (
        '# Navigator v2 — замыкание lifecycle задач',
        '88 задач остаются открытыми',
        'ни одной задачи `in_progress`',
        'ни одной задачи `done`',
        'task_status_changed',
        'Результат сохраняется раньше статуса',
        'Атомарное завершение на сервере',
        'заблокировано',
        'production Supabase не менялся'
    ), DOC.name)

    combined = '\n'.join((task, fixture, browser))
    if re.search(r'tabindex=["\'][1-9]', combined, re.I):
        errors.append('positive tabindex is forbidden')

if errors:
    print('Navigator v2 task lifecycle closure errors:')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)
print('Navigator v2 task lifecycle closure passed: phased actions, team result before done, retry-safe partial failure, bounded transport and production DDL remain blocked')
