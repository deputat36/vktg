import { rpc } from './supabase-v2.js?v=20260625-1320';
import { applyPageActionFeedback } from './page-action-feedback-v2.js?v=20260715-01';
import { taskActionControlModel, taskActionRoutePreview } from './task-action-router-v2.js?v=20260716-01';
import {
  buildTaskCompletionComment,
  taskLifecyclePhase,
  taskLifecycleView
} from './task-lifecycle-closure-model-v1.js?v=20260724-01';

const dealId = new URLSearchParams(location.search).get('id');
const BOUNDED_TRANSPORT_ENABLED = false;
const LEGACY_ACTION_BY_STATUS = Object.freeze({ in_progress: 'start', done: 'complete', open: 'reopen' });
let permissions = new Map();
let loaded = false;
let loading = null;
let applyQueued = false;
const mutations = new Set();
const completionEvidence = new Map();

function boolValue(value) {
  return value === true || value === 'true';
}

function normalizedTask(task = {}) {
  return {
    ...task,
    can_change_status: boolValue(task.can_change_status),
    can_start: boolValue(task.can_start),
    can_complete: boolValue(task.can_complete),
    can_set_active_outcome: boolValue(task.can_set_active_outcome),
    can_propose_terminal_outcome: boolValue(task.can_propose_terminal_outcome),
    can_decide_terminal_outcome: boolValue(task.can_decide_terminal_outcome)
  };
}

function roleLabel(role) {
  return ({
    owner: 'владелец',
    admin: 'администратор',
    manager: 'менеджер',
    spn: 'СПН',
    lawyer: 'юрист',
    broker: 'брокер',
    viewer: 'наблюдатель'
  })[role] || 'ответственный специалист';
}

function taskButtonSelector() {
  return 'button[data-task-id][data-task-action],button[data-task-id][data-task-status]';
}

function actionFromButton(button) {
  const explicit = String(button.dataset.taskAction || '').trim();
  if (explicit) return explicit;
  return LEGACY_ACTION_BY_STATUS[String(button.dataset.taskStatus || '').trim()] || '';
}

function taskButtons(taskId) {
  const escaped = globalThis.CSS?.escape ? CSS.escape(String(taskId || '')) : String(taskId || '').replace(/["\\]/g, '\\$&');
  return [...document.querySelectorAll(`button[data-task-id="${escaped}"][data-task-action],button[data-task-id="${escaped}"][data-task-status]`)];
}

function taskContainer(taskId) {
  return taskButtons(taskId)[0]?.closest('.list-item') || null;
}

function isDemoCard() {
  return [...document.querySelectorAll('.pill.blue')].some((node) => node.textContent.trim() === 'ДЕМО')
    || document.body.textContent.includes('Тестовая карточка');
}

function confirmDemoTaskAction() {
  if (!isDemoCard()) return true;
  return window.confirm('Это демо-сделка. Подтвердите тестовое действие: изменить статус задачи. Реальные сделки не будут затронуты.');
}

function permissionText(task) {
  return `Статус этой задачи меняет ${roleLabel(task?.assigned_role)}. Вы видите задачу для контроля, но действие доступно ответственному специалисту.`;
}

function boundedTransportText() {
  return 'Действие bounded-задачи распознано, но сохранение ещё не включено. Дождитесь отдельного deployment database RPC и Edge actions.';
}

function ensureHint(container, task) {
  if (!container) return;
  let hint = container.querySelector('[data-task-permission-hint]');
  if (!hint) {
    hint = document.createElement('div');
    hint.dataset.taskPermissionHint = 'true';
    hint.className = 'status warn';
    container.appendChild(hint);
  }
  hint.textContent = permissionText(task);
}

function clearHint(container) {
  container?.querySelector('[data-task-permission-hint]')?.remove();
}

function lifecycleInstruction(container, task) {
  if (!container || Number(task?.task_contract_version) === 2) return;
  const view = taskLifecycleView(task, task?.can_change_status === true);
  let instruction = container.querySelector('[data-task-lifecycle-instruction]');
  if (!instruction) {
    instruction = document.createElement('div');
    instruction.dataset.taskLifecycleInstruction = 'true';
    instruction.className = 'status';
    const actions = container.querySelector('.actions');
    if (actions) actions.insertAdjacentElement('beforebegin', instruction);
    else container.appendChild(instruction);
  }
  instruction.className = `status ${view.phase === 'done' ? 'ok' : view.phase === 'cancelled' ? '' : 'warn'}`;
  instruction.innerHTML = `<b>${view.phase === 'open' ? 'Шаг 1 из 2.' : view.phase === 'in_progress' ? 'Шаг 2 из 2.' : view.phase === 'done' ? 'Результат подтверждён.' : 'Задача отменена.'}</b> ${view.instruction}`;
}

function ensureCompletionEditor(container, task) {
  if (!container || Number(task?.task_contract_version) === 2) return;
  const phase = taskLifecyclePhase(task);
  const existing = container.querySelector('[data-task-completion-editor]');
  if (phase !== 'in_progress' || task?.can_change_status !== true) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const taskId = String(task?.id || '');
  const wrapper = document.createElement('div');
  wrapper.dataset.taskCompletionEditor = 'true';
  wrapper.className = 'field';
  const inputId = `taskCompletionResult-${taskId}`;
  wrapper.innerHTML = `<label for="${inputId}">Результат выполнения</label>
    <textarea id="${inputId}" data-task-completion-result="${taskId}" rows="3" maxlength="1200" placeholder="Что сделано, какой документ получен, что согласовано или какой результат достигнут"></textarea>
    <span class="small">Минимум 10 символов. Результат сохранится в командных комментариях до перевода задачи в «Готово».</span>`;
  const actions = container.querySelector('.actions');
  if (actions) actions.insertAdjacentElement('beforebegin', wrapper);
  else container.appendChild(wrapper);
}

function completionInput(taskId) {
  return taskContainer(taskId)?.querySelector(`[data-task-completion-result="${taskId}"]`) || null;
}

function setTaskBusy(taskId, busy) {
  taskButtons(taskId).forEach((button) => {
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (busy) button.disabled = true;
  });
  const input = completionInput(taskId);
  if (input) input.disabled = busy;
}

function taskActionInput(button) {
  return {
    client_request_id: button.dataset.clientRequestId || '',
    evidence_reference_id: button.dataset.evidenceReferenceId || completionEvidence.get(String(button.dataset.taskId || '')) || '',
    reason_code: button.dataset.reasonCode || '',
    review_date: button.dataset.reviewDate || '',
    replacement_task_id: button.dataset.replacementTaskId || ''
  };
}

function lifecycleActionAllowed(task, action) {
  if (Number(task?.task_contract_version) === 2) return true;
  const phase = taskLifecyclePhase(task);
  if (phase === 'open') return action === 'start';
  if (phase === 'in_progress') return action === 'complete';
  if (phase === 'done') return action === 'reopen';
  return false;
}

function actionAllowed(task, action) {
  if (!task || !action || !lifecycleActionAllowed(task, action)) return false;
  return taskActionControlModel(task).actions.includes(action);
}

function actionLabel(action) {
  return ({
    start: 'Начать работу',
    complete: 'Сохранить результат и завершить',
    reopen: 'Вернуть в работу'
  })[action] || '';
}

async function ensureLegacyCompletionEvidence(taskId, task) {
  const existingReference = completionEvidence.get(taskId);
  if (existingReference) return existingReference;

  const input = completionInput(taskId);
  const prepared = buildTaskCompletionComment(task, input?.value || '');
  if (!prepared.ok) {
    applyPageActionFeedback(prepared.error, 'error');
    input?.focus();
    throw Object.assign(new Error(prepared.error), { code: 'TASK_RESULT_VALIDATION' });
  }

  applyPageActionFeedback('Сохраняю результат задачи в комментариях...', 'busy');
  const saved = await rpc('nav_v2_add_comment', {
    p_deal_id: dealId,
    p_body: prepared.comment,
    p_visibility: 'team'
  });
  const reference = String(saved?.comment_id || 'comment-saved');
  completionEvidence.set(taskId, reference);
  return reference;
}

async function executeTaskAction(button) {
  const taskId = String(button.dataset.taskId || '');
  const action = actionFromButton(button);
  const task = permissions.get(taskId);

  if (!task || !actionAllowed(task, action)) {
    applyTaskPermissions();
    applyPageActionFeedback(permissionText(task), 'error');
    return;
  }
  if (mutations.has(taskId)) return;

  const route = taskActionRoutePreview({ task, action, input: taskActionInput(button) });
  if (!route.ok || !route.rpc_preview) {
    applyPageActionFeedback(route.errors?.[0] || 'Действие по задаче недоступно.', 'error');
    return;
  }

  if (route.mode === 'bounded') {
    if (!BOUNDED_TRANSPORT_ENABLED) {
      applyPageActionFeedback(boundedTransportText(), 'idle');
      return;
    }
    applyPageActionFeedback('Bounded transport ещё не разрешён deployment gate.', 'error');
    return;
  }

  if (!confirmDemoTaskAction()) return;
  mutations.add(taskId);
  setTaskBusy(taskId, true);
  let succeeded = false;
  let evidenceSaved = false;
  try {
    if (action === 'complete') {
      await ensureLegacyCompletionEvidence(taskId, task);
      evidenceSaved = true;
      applyPageActionFeedback('Результат сохранён. Завершаю задачу...', 'busy');
    } else {
      applyPageActionFeedback(action === 'start' ? 'Перевожу задачу в работу...' : 'Возвращаю задачу в работу...', 'busy');
    }

    await rpc(route.rpc_preview.name, route.rpc_preview.args);
    succeeded = true;
    completionEvidence.delete(taskId);
    applyPageActionFeedback(
      action === 'complete'
        ? 'Результат сохранён, задача завершена. Обновляю карточку...'
        : action === 'start'
          ? 'Задача принята в работу. Обновляю карточку...'
          : 'Задача возвращена в работу. Обновляю карточку...',
      'success'
    );
    setTimeout(() => location.reload(), 250);
  } catch (error) {
    if (error?.code === 'TASK_RESULT_VALIDATION') return;
    if (action === 'complete' && evidenceSaved) {
      applyPageActionFeedback(`Результат сохранён в комментариях, но статус задачи не изменён: ${error.message}. Повторите завершение — комментарий не будет продублирован.`, 'error');
    } else if (action === 'complete') {
      applyPageActionFeedback(`Не удалось сохранить результат задачи: ${error.message}. Статус не изменён.`, 'error');
    } else {
      applyPageActionFeedback(`Ошибка задачи: ${error.message}`, 'error');
    }
  } finally {
    mutations.delete(taskId);
    taskButtons(taskId).forEach((taskButton) => taskButton.setAttribute('aria-busy', 'false'));
    const input = completionInput(taskId);
    if (input) input.disabled = false;
    if (!succeeded) applyTaskPermissions();
  }
}

function installTaskHandler(button, task) {
  const action = actionFromButton(button);
  const relevant = lifecycleActionAllowed(task, action);
  const allowed = actionAllowed(task, action);
  const container = button.closest('.list-item');

  if (Number(task?.task_contract_version) !== 2) {
    button.hidden = !relevant;
    if (relevant && actionLabel(action)) button.textContent = actionLabel(action);
  }

  if (!relevant) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
    button.onclick = null;
    return;
  }

  button.disabled = !allowed;
  button.setAttribute('aria-disabled', allowed ? 'false' : 'true');
  button.onclick = null;

  if (!allowed) {
    button.classList.add('disabled');
    button.style.opacity = '.45';
    button.style.cursor = 'not-allowed';
    button.title = 'Это действие доступно ответственному специалисту по задаче';
    ensureHint(container, task);
    return;
  }

  button.classList.remove('disabled');
  button.style.opacity = '';
  button.style.cursor = '';
  button.title = Number(task.task_contract_version) === 2 && !BOUNDED_TRANSPORT_ENABLED
    ? 'Bounded-действие подготовлено, но сохранение пока выключено'
    : '';
  clearHint(container);
  button.dataset.taskActionGuard = 'ready';
}

function applyTaskPermissions() {
  if (!loaded) return;
  const preparedContainers = new Set();
  document.querySelectorAll(taskButtonSelector()).forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const taskId = String(button.dataset.taskId || '');
    const task = permissions.get(taskId);
    const container = button.closest('.list-item');
    if (!task) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      ensureHint(container, null);
      return;
    }
    if (!preparedContainers.has(taskId)) {
      lifecycleInstruction(container, task);
      ensureCompletionEditor(container, task);
      preparedContainers.add(taskId);
    }
    installTaskHandler(button, task);
  });
}

function queueApply() {
  if (applyQueued) return;
  applyQueued = true;
  setTimeout(() => {
    applyQueued = false;
    applyTaskPermissions();
  }, 50);
}

async function loadPermissions(force = false) {
  if (!dealId) return false;
  if (loaded && !force) return true;
  if (loading) return loading;
  loading = rpc('nav_v2_get_deal_card_lite', { p_deal_id: dealId }, 12000)
    .then((card) => {
      permissions = new Map((card.tasks || []).map((task) => {
        const normalized = normalizedTask(task);
        return [String(normalized.id), normalized];
      }));
      loaded = true;
      applyTaskPermissions();
      return true;
    })
    .catch(() => {
      loaded = false;
      return false;
    })
    .finally(() => { loading = null; });
  return loading;
}

async function handleTaskAction(event) {
  const button = event.target.closest(taskButtonSelector());
  if (!(button instanceof HTMLButtonElement)) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (!loaded) {
    applyPageActionFeedback('Проверяю права на изменение задачи...', 'busy');
    const ok = await loadPermissions();
    if (!ok) {
      applyPageActionFeedback('Не удалось проверить права по задаче. Обновите карточку и повторите действие.', 'error');
      return;
    }
  }

  applyTaskPermissions();
  await executeTaskAction(button);
}

const app = document.getElementById('app');
if (app) {
  new MutationObserver(queueApply).observe(app, { childList: true, subtree: true });
  app.addEventListener('click', handleTaskAction, true);
  void loadPermissions();
}

window.addEventListener('hashchange', queueApply);
