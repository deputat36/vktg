import { getMyProfile, rpc } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
const RAW_STATUS_ROLES = new Set(['owner', 'admin', 'manager']);
const QUICK_STATUS_ROLES = new Set(['owner', 'admin', 'manager', 'spn']);
let currentRole = '';
let options = new Map();
let loaded = false;
let applyQueued = false;
let reloadQueued = false;
let profileLoading = null;

function boolValue(value) {
  return value === true || value === 'true';
}

function allowed(status) {
  const item = options.get(status);
  return !item || boolValue(item.allowed);
}

function roleName(role) {
  return ({
    owner: 'владелец',
    admin: 'администратор',
    manager: 'менеджер',
    spn: 'СПН',
    lawyer: 'юрист',
    broker: 'брокер',
    viewer: 'наблюдатель'
  })[role] || role || 'пользователь';
}

function canUseRawStatus() {
  return RAW_STATUS_ROLES.has(currentRole);
}

function canUseQuickStatus() {
  return QUICK_STATUS_ROLES.has(currentRole);
}

function ensureStatusHint(container) {
  if (!container || container.querySelector('[data-status-permission-hint]')) return;
  const hint = document.createElement('div');
  hint.dataset.statusPermissionHint = 'true';
  hint.className = 'status warn';
  hint.textContent = 'Финальные статусы сделки фиксирует руководитель или ответственный управленец. Остальные роли работают через свои задачи, документы и комментарии.';
  container.appendChild(hint);
}

function ensureRoleHint(container) {
  if (!container || container.querySelector('[data-role-status-hint]')) return;
  const hint = document.createElement('div');
  hint.dataset.roleStatusHint = 'true';
  hint.className = 'status warn';
  hint.textContent = `Для роли «${roleName(currentRole)}» общие статусы скрыты. Используйте действия своей зоны ответственности в карточке сделки.`;
  container.appendChild(hint);
}

function applyRoleStatusUi() {
  if (!currentRole) return;

  const select = document.getElementById('dealStatus');
  const statusCard = select?.closest('.card');
  if (statusCard && !canUseRawStatus()) {
    statusCard.style.display = 'none';
    ensureRoleHint(statusCard.parentElement || document.querySelector('.nav-v2-shell'));
  }

  if (!canUseQuickStatus()) {
    document.querySelectorAll('button[data-quick-status]').forEach((button) => {
      button.style.display = 'none';
    });
  }
}

function applySelectOptions(select) {
  if (!select) return;
  let hasBlocked = false;
  Array.from(select.options).forEach((option) => {
    const isAllowed = allowed(option.value);
    option.disabled = !isAllowed;
    if (!isAllowed) {
      hasBlocked = true;
      const label = option.textContent.replace(/ \(руководитель\)$/u, '');
      option.textContent = `${label} (руководитель)`;
    }
  });
  if (hasBlocked) ensureStatusHint(select.closest('.card'));
}

function applyQuickButtons() {
  document.querySelectorAll('button[data-quick-status]').forEach((button) => {
    const isAllowed = allowed(button.dataset.quickStatus);
    button.disabled = !isAllowed;
    button.setAttribute('aria-disabled', isAllowed ? 'false' : 'true');
    if (!isAllowed) {
      button.classList.add('disabled');
      button.style.opacity = '.45';
      button.style.cursor = 'not-allowed';
      button.title = 'Этот статус фиксирует руководитель или ответственный управленец';
    } else {
      button.classList.remove('disabled');
      button.style.opacity = '';
      button.style.cursor = '';
      button.removeAttribute('title');
    }
  });
}

function applyStatusPermissions() {
  applyRoleStatusUi();
  if (!loaded) return;
  applySelectOptions(document.getElementById('dealStatus'));
  applyQuickButtons();
  applyRoleStatusUi();
}

function queueApply() {
  if (applyQueued) return;
  applyQueued = true;
  setTimeout(() => {
    applyQueued = false;
    applyStatusPermissions();
  }, 50);
}

function queueReloadOptions() {
  if (reloadQueued) return;
  reloadQueued = true;
  setTimeout(async () => {
    reloadQueued = false;
    await loadOptions();
  }, 900);
}

async function loadProfileRole() {
  if (currentRole) return currentRole;
  if (profileLoading) return profileLoading;
  profileLoading = getMyProfile({ timeout: 8000 })
    .then((profile) => {
      currentRole = profile?.role || '';
      document.body.dataset.navDealStatusRole = currentRole;
      applyStatusPermissions();
      return currentRole;
    })
    .catch(() => '')
    .finally(() => { profileLoading = null; });
  return profileLoading;
}

async function loadOptions() {
  if (!dealId) return;
  try {
    const data = await rpc('nav_v2_get_deal_status_options', { p_deal_id: dealId }, 12000);
    options = new Map((data.statuses || []).map((item) => [item.id, item]));
    loaded = true;
    applyStatusPermissions();
  } catch (_) {
    loaded = false;
  }
}

const app = document.getElementById('app');
if (app) {
  new MutationObserver(queueApply).observe(app, { childList: true, subtree: true });
  app.addEventListener('click', (event) => {
    const button = event.target.closest('#saveStatus, button[data-quick-status]');
    if (button && !button.disabled) queueReloadOptions();
  }, true);
}

loadProfileRole();
loadOptions();
window.addEventListener('hashchange', queueApply);