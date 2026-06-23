import { getMyProfile, esc } from './supabase-v2.js';

const privilegedRoles = new Set(['owner', 'admin', 'manager']);
let profile = null;
let observerStarted = false;

function roleFromTaskItem(item) {
  const pills = Array.from(item.querySelectorAll('.pill'));
  const rolePill = pills
    .map((pill) => pill.textContent.trim().toLowerCase())
    .find((text) => ['spn', 'спн', 'lawyer', 'юрист', 'broker', 'брокер', 'manager', 'менеджер'].includes(text));

  if (rolePill === 'спн') return 'spn';
  if (rolePill === 'юрист') return 'lawyer';
  if (rolePill === 'брокер') return 'broker';
  if (rolePill === 'менеджер') return 'manager';
  return rolePill || '';
}

function roleLabel(role) {
  return ({
    spn: 'СПН',
    lawyer: 'юрист',
    broker: 'брокер',
    manager: 'менеджер',
    owner: 'owner',
    admin: 'admin'
  })[role] || role || 'ответственный';
}

function canChangeTask(taskRole) {
  if (!profile?.role) return false;
  if (privilegedRoles.has(profile.role)) return true;
  return !taskRole || taskRole === profile.role;
}

function decorateTaskItem(item) {
  if (item.dataset.spnTaskGuardApplied === '1') return;
  const buttons = Array.from(item.querySelectorAll('[data-task-id]'));
  if (!buttons.length) return;

  const taskRole = roleFromTaskItem(item);
  const allowed = canChangeTask(taskRole);
  item.dataset.spnTaskGuardApplied = '1';

  if (allowed) {
    item.insertAdjacentHTML('beforeend', `<div class="status ok" style="margin-top:8px">Ваша зона ответственности: статус этой задачи можно менять.</div>`);
    return;
  }

  buttons.forEach((button) => button.remove());
  item.insertAdjacentHTML(
    'beforeend',
    `<div class="status warn" style="margin-top:8px">Ожидаем: ${esc(roleLabel(taskRole))}. Вы видите задачу для контроля, но закрывает ее ответственный специалист.</div>`
  );
}

function applyGuard() {
  if (!profile?.role) return;
  document.querySelectorAll('.list-item').forEach(decorateTaskItem);
}

async function init() {
  try {
    profile = await getMyProfile({ refresh: false, timeout: 8000 });
  } catch (_) {
    profile = null;
  }

  applyGuard();

  if (!observerStarted) {
    observerStarted = true;
    new MutationObserver(() => applyGuard()).observe(document.body, { childList: true, subtree: true });
  }
}

init();
