import { rpc } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let permissions = new Map();
let loaded = false;
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
    await loadPermissions();
  }, 900);
}

async function loadPermissions() {
  if (!dealId) return;
  try {
    const card = await rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 12000);
    permissions = new Map((card.tasks || []).map((task) => [task.id, task]));
    loaded = true;
    applyTaskPermissions();
  } catch (_) {
    loaded = false;
  }
}

const app = document.getElementById('app');
if (app) {
  new MutationObserver(queueApply).observe(app, { childList: true, subtree: true });
  app.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-task-id][data-task-status]');
    if (button && !button.disabled) queueReloadPermissions();
  }, true);
}

loadPermissions();
window.addEventListener('hashchange', queueApply);
