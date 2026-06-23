import { rpc } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let options = new Map();
let loaded = false;
let applyQueued = false;
let reloadQueued = false;

function boolValue(value) {
  return value === true || value === 'true';
}

function allowed(status) {
  const item = options.get(status);
  return !item || boolValue(item.allowed);
}

function ensureStatusHint(container) {
  if (!container || container.querySelector('[data-status-permission-hint]')) return;
  const hint = document.createElement('div');
  hint.dataset.statusPermissionHint = 'true';
  hint.className = 'status warn';
  hint.textContent = 'Финальные статусы сделки фиксирует руководитель или ответственный управленец. СПН управляет рабочей подготовкой сделки.';
  container.appendChild(hint);
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
  if (!loaded) return;
  applySelectOptions(document.getElementById('dealStatus'));
  applyQuickButtons();
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

loadOptions();
window.addEventListener('hashchange', queueApply);
