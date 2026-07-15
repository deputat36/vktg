import { rpc } from './supabase-v2.js?v=20260625-1320';
import { applyPageActionFeedback } from './page-action-feedback-v2.js?v=20260715-01';

const dealId = new URLSearchParams(location.search).get('id');
let permissions = new Map();
let loaded = false;
let loading = null;
let applyQueued = false;
let replayTaskId = '';
const mutations = new Set();

function boolValue(value) {
  return value === true || value === 'true';
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

function canChangeTask(task) {
  return boolValue(task?.can_change_status);
}

function taskButtons(taskId) {
  const escaped = globalThis.CSS?.escape ? CSS.escape(String(taskId || '')) : String(taskId || '').replace(/["\\]/g, '\\$&');
  return [...document.querySelectorAll(`button[data-task-id="${escaped}"][data-task-status]`)];
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

async function saveTaskStatus(button) {
  const taskId = String(button.dataset.taskId || '');
  const taskStatus = String(button.dataset.taskStatus || '');
  const task = permissions.get(taskId);

  if (!task || !canChangeTask(task)) {
    applyTaskPermissions();
    applyPageActionFeedback(permissionText(task), 'error');
    return;
  }
  if (!taskStatus || mutations.has(taskId)) return;
  if (!confirmDemoTaskAction()) return;

  mutations.add(taskId);
  setTaskBusy(taskId, true);
  applyPageActionFeedback('Обновляю статус задачи...', 'busy');
  let succeeded = false;
  try {
    await rpc('nav_v2_update_task_status', {
      p_task_id: taskId,
      p_status: taskStatus
    });
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
  const allowed = canChangeTask(task);
  button.disabled = !allowed;
  button.setAttribute('aria-disabled', allowed ? 'false' : 'true');
  if (!allowed) {
    button.onclick = null;
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
  button.removeAttribute('title');
  clearHint(button.closest('.list-item'));
  button.dataset.taskActionGuard = 'ready';
  button.onclick = () => void saveTaskStatus(button);
}

function applyTaskPermissions() {
  if (!loaded) return;
  document.querySelectorAll('button[data-task-id][data-task-status]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const task = permissions.get(button.dataset.taskId);
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
      permissions = new Map((card.tasks || []).map((task) => [String(task.id), task]));
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

async function ensureLoadedBeforeAction(event) {
  const button = event.target.closest('button[data-task-id][data-task-status]');
  if (!(button instanceof HTMLButtonElement)) return;

  const taskId = String(button.dataset.taskId || '');
  if (replayTaskId === taskId) {
    replayTaskId = '';
    return;
  }
  if (loaded) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  applyPageActionFeedback('Проверяю права на изменение задачи...', 'busy');
  const ok = await loadPermissions();
  if (!ok) {
    applyPageActionFeedback('Не удалось проверить права по задаче. Обновите карточку и повторите действие.', 'error');
    return;
  }

  const task = permissions.get(taskId);
  applyTaskPermissions();
  if (!task || !canChangeTask(task)) {
    applyPageActionFeedback(permissionText(task), 'error');
    return;
  }

  applyPageActionFeedback('Права проверены. Выполняю действие по задаче...', 'success');
  replayTaskId = taskId;
  button.click();
}

const app = document.getElementById('app');
if (app) {
  new MutationObserver(queueApply).observe(app, { childList: true, subtree: true });
  app.addEventListener('click', ensureLoadedBeforeAction, true);
  void loadPermissions();
}

window.addEventListener('hashchange', queueApply);
