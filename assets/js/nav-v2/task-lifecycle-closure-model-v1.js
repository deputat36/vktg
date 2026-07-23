const MIN_COMPLETION_RESULT_LENGTH = 10;
const MAX_COMPLETION_RESULT_LENGTH = 1200;

function clean(value) {
  return String(value ?? '').trim();
}

function oneLine(value) {
  return clean(value).replace(/\s+/g, ' ');
}

export function taskLifecyclePhase(task = {}) {
  const status = clean(task.status);
  if (status === 'in_progress') return 'in_progress';
  if (status === 'done') return 'done';
  if (status === 'cancelled') return 'cancelled';
  return 'open';
}

export function taskLifecycleView(task = {}, canChange = false) {
  const phase = taskLifecyclePhase(task);
  const editable = canChange === true;
  const result = {
    phase,
    editable,
    primary_action: null,
    primary_label: '',
    completion_result_required: false,
    show_reopen: false,
    instruction: ''
  };

  if (!editable) {
    result.instruction = 'Статус меняет ответственный сотрудник или руководитель.';
    return result;
  }

  if (phase === 'open') {
    result.primary_action = 'start';
    result.primary_label = 'Начать работу';
    result.instruction = 'Сначала переведите задачу в работу. После выполнения зафиксируйте конкретный результат.';
    return result;
  }

  if (phase === 'in_progress') {
    result.primary_action = 'complete';
    result.primary_label = 'Сохранить результат и завершить';
    result.completion_result_required = true;
    result.instruction = 'Кратко укажите, что сделано или получено. Результат сохранится в командных комментариях до завершения задачи.';
    return result;
  }

  if (phase === 'done') {
    result.show_reopen = true;
    result.instruction = 'Задача завершена. Возвращайте её в работу только если результат оказался неполным или устарел.';
    return result;
  }

  result.instruction = 'Отменённая задача не требует рабочего действия. При необходимости создайте новую актуальную задачу.';
  return result;
}

export function validateTaskCompletionResult(value) {
  const normalized = clean(value);
  if (!normalized) {
    return {
      ok: false,
      value: '',
      error: 'Перед завершением укажите результат задачи.'
    };
  }
  if (normalized.length < MIN_COMPLETION_RESULT_LENGTH) {
    return {
      ok: false,
      value: normalized,
      error: `Опишите результат конкретнее — минимум ${MIN_COMPLETION_RESULT_LENGTH} символов.`
    };
  }
  if (normalized.length > MAX_COMPLETION_RESULT_LENGTH) {
    return {
      ok: false,
      value: normalized,
      error: `Сократите результат до ${MAX_COMPLETION_RESULT_LENGTH} символов.`
    };
  }
  return { ok: true, value: normalized, error: '' };
}

export function buildTaskCompletionComment(task = {}, resultValue = '') {
  const validation = validateTaskCompletionResult(resultValue);
  if (!validation.ok) return { ...validation, comment: '' };
  const title = oneLine(task.title).slice(0, 180) || 'Без названия';
  return {
    ok: true,
    value: validation.value,
    error: '',
    comment: `Результат задачи «${title}»: ${validation.value}`
  };
}

export const TASK_LIFECYCLE_CLOSURE_CONTRACT = Object.freeze({
  min_completion_result_length: MIN_COMPLETION_RESULT_LENGTH,
  max_completion_result_length: MAX_COMPLETION_RESULT_LENGTH,
  result_persisted_before_done: true,
  result_visibility: 'team',
  production_schema_change: false,
  atomic_server_completion: false
});
