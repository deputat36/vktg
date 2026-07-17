import { rpc } from './supabase-v2.js?v=20260625-1320';
import { applyPageActionFeedback } from './page-action-feedback-v2.js?v=20260715-01';
import { taskActionControlModel, taskActionRoutePreview } from './task-action-router-v2.js?v=20260716-01';

const dealId = new URLSearchParams(location.search).get('id');
const BOUNDED_TRANSPORT_ENABLED = false;
const LEGACY_ACTION_BY_STATUS = Object.freeze({ in_progress: 'start', done: 'complete', open: 'reopen' });
let permissions = new Map();
let loaded = false;
let loading = null;
let applyQueued = false;
const mutations = new Set();

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

function setTaskBusy(taskId, busy) {
  taskButtons(taskId).forEach((button) => {
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (busy) button.disabled = true;
  });
}

function taskActionInput(button) {
  return {
    client_request_id: button.dataset.clientRequestId || '',
    evidence_reference_id: button.dataset.evidenceReferenceId || '',
    reason_code: button.dataset.reasonCode || '',
    review_date: button.dataset.reviewDate || '',
    replacement_task_id: button.dataset.replacementTaskId || ''
  };
}

function actionAllowed(task, action) {
  if (!task || !action) return false;
  return taskActionControlModel(task).actions.includes(action);
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
  applyPageActionFeedback('Обновляю статус задачи...', 'busy');
  let succeeded = false;
  try {
    await rpc(route.rpc_preview.name, route.rpc_preview.args);
    succeeded = true;
    applyPageActionFeedback('Статус задачи сохранён. Обновляю карточку...', 'success');
    setTimeout(() => location.reload(), 250);
  } catch (error) {
    applyPageActionFeedback(`Ошибка задачи: ${error.message}`, 'error');
  } finally {
    mutations.delete(taskId);
    taskButtons(taskId).forEach((taskButton) => taskButton.setAttribute('aria-busy', 'false'));
    if (!succeeded) applyTaskPermissions();
  }
}

function installTaskHandler(button, task) {
  const action = actionFromButton(button);
  const allowed = actionAllowed(task, action);
  button.disabled = !allowed;
  button.setAttribute('aria-disabled', allowed ? 'false' : 'true');
  button.onclick = null;

  if (!allowed) {
    button.classList.add('disabled');
    button.style.opacity = '.45';
    button.style.cursor = 'not-allowed';
    button.title = 'Это действие доступно ответственному специалисту по задаче';
    ensureHint(button.closest('.list-item'), task);
    return;
  }

  button.classList.remove('disabled');
  button.style.opacity = '';
  button.style.cursor = '';
  button.title = Number(task.task_contract_version) === 2 && !BOUNDED_TRANSPORT_ENABLED
    ? 'Bounded-действие подготовлено, но сохранение пока выключено'
    : '';
  clearHint(button.closest('.list-item'));
  button.dataset.taskActionGuard = 'ready';
}

function applyTaskPermissions() {
  if (!loaded) return;
  document.querySelectorAll(taskButtonSelector()).forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const task = permissions.get(String(button.dataset.taskId || ''));
    if (!task) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      ensureHint(button.closest('.list-item'), null);
      return;
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
