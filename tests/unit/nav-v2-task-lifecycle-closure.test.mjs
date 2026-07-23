import assert from 'node:assert/strict';
import {
  buildTaskCompletionComment,
  TASK_LIFECYCLE_CLOSURE_CONTRACT,
  taskLifecyclePhase,
  taskLifecycleView,
  validateTaskCompletionResult
} from '../../assets/js/nav-v2/task-lifecycle-closure-model-v1.js';

assert.equal(taskLifecyclePhase({ status: 'open' }), 'open');
assert.equal(taskLifecyclePhase({ status: 'in_progress' }), 'in_progress');
assert.equal(taskLifecyclePhase({ status: 'done' }), 'done');
assert.equal(taskLifecyclePhase({ status: 'cancelled' }), 'cancelled');
assert.equal(taskLifecyclePhase({ status: 'unknown' }), 'open');

assert.deepEqual(
  taskLifecycleView({ status: 'open' }, true),
  {
    phase: 'open',
    editable: true,
    primary_action: 'start',
    primary_label: 'Начать работу',
    completion_result_required: false,
    show_reopen: false,
    instruction: 'Сначала переведите задачу в работу. После выполнения зафиксируйте конкретный результат.'
  }
);

const inProgress = taskLifecycleView({ status: 'in_progress' }, true);
assert.equal(inProgress.primary_action, 'complete');
assert.equal(inProgress.completion_result_required, true);
assert.match(inProgress.instruction, /командных комментариях/);

const done = taskLifecycleView({ status: 'done' }, true);
assert.equal(done.primary_action, null);
assert.equal(done.show_reopen, true);

const denied = taskLifecycleView({ status: 'in_progress' }, false);
assert.equal(denied.primary_action, null);
assert.equal(denied.completion_result_required, false);
assert.match(denied.instruction, /ответственный сотрудник/);

assert.equal(validateTaskCompletionResult('').ok, false);
assert.equal(validateTaskCompletionResult('Коротко').ok, false);
assert.equal(validateTaskCompletionResult('Документ получен и проверен.').ok, true);
assert.equal(validateTaskCompletionResult('x'.repeat(1201)).ok, false);

const prepared = buildTaskCompletionComment(
  { title: '  Согласовать   порядок\nрасчётов  ' },
  'Стороны подтвердили аккредитив и срок раскрытия.'
);
assert.equal(prepared.ok, true);
assert.equal(
  prepared.comment,
  'Результат задачи «Согласовать порядок расчётов»: Стороны подтвердили аккредитив и срок раскрытия.'
);
assert.equal(prepared.comment.includes('uuid'), false);

assert.deepEqual(
  TASK_LIFECYCLE_CLOSURE_CONTRACT,
  {
    min_completion_result_length: 10,
    max_completion_result_length: 1200,
    result_persisted_before_done: true,
    result_visibility: 'team',
    production_schema_change: false,
    atomic_server_completion: false
  }
);

console.log('Navigator v2 task lifecycle closure model passed: phased actions, required result, team comment and explicit non-atomic boundary');
