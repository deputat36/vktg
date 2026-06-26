import { rpc } from './supabase-v2.js?v=20260625-1320';

const dealId = new URLSearchParams(location.search).get('id');
let permissions = new Map();
let loaded = false;
let loading = null;
let applyQueued = false;
let reloadQueued = false;

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

function setInlineStatus(text, type = 'warn') {
  const target = document.querySelector('#pageStatus') || document.querySelector('#app .status');
  if (!target) return;
  target.className = 'status ' + type;
  target.textContent = text;
}

function ensureHint(container, task) {
  if (!container || container.querySelector('[data-task-permission-hint]')) return;
  const role = roleLabel(task?.assigned_role);
  const hint = document.createElement('div');
  hint.dataset.taskPermissionHint = 'true';
  hint.className = 'status warn';
  hint.textContent = `Статус этой задачи меняет ${role}. СПН видит задачу для контроля и понимания следующего шага.`;
  container.appendChild(hint);
}

function applyTaskPermissions() {
  if (!loaded) return;
  document.querySelectorAll('button[data-task-id][data-task-status]').forEach((button) => {
    const task = permissions.get(button.dataset.taskId);
    if (!task) return;
    const allowed = canChangeTask(task);
    button.disabled = !allowed;
    button.setAttribute('aria-disabled', allowed ? 'false' : 'true');
    if (!allowed) {
      button.classList.add('disabled');
      button.style.opacity = '.45';
      button.style.cursor = 'not-allowed';
      button.title = 'Это действие доступно ответственному специалисту по задаче';
      ensureHint(button.closest('.list-item'), task);
    } else {
      button.classList.remove('disabled');
      button.style.opacity = '';
      button.style.cursor = '';
      button.removeAttribute('title');
    }
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

function queueReloadPermissions() {
  if (reloadQueued) return;
  reloadQueued = true;
  setTimeout(async () => {
    reloadQueued = false;
    await loadPermissions(true);
  }, 900);
}

async function loadPermissions(force = false) {
  if (!dealId) return false;
  if (loaded && !force) return true;
  if (loading) return loading;
  loading = rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 12000)
    .then((card) => {
      permissions = new Map((card.tasks || []).map((task) => [task.id, task]));
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
  if (!button) return;
  if (loaded) {
    if (!button.disabled) queueReloadPermissions();
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  setInlineStatus('Проверяю права на изменение задачи...');
  const ok = await loadPermissions();
  if (ok) setInlineStatus('Права проверены. Повторите действие по задаче.', 'ok');
  else setInlineStatus('Не удалось проверить права по задаче. Попробуйте обновить карточку.', 'error');
}

const app = document.getElementById('app');
if (app) {
  new MutationObserver(queueApply).observe(app, { childList: true, subtree: true });
  app.addEventListener('click', ensureLoadedBeforeAction, true);
}

window.addEventListener('hashchange', queueApply);
