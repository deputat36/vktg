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

function statusAllowed(doc, status) {
  if (!doc) return true;
  if (status === 'received') return boolValue(doc.can_mark_received);
  if (status === 'checked') return boolValue(doc.can_mark_checked);
  if (status === 'problem') return boolValue(doc.can_mark_problem);
  if (status === 'needed') return boolValue(doc.can_change_status) || boolValue(doc.can_mark_received);
  return boolValue(doc.can_change_status);
}

function ensureHint(container, doc) {
  if (!container || container.querySelector('[data-doc-permission-hint]')) return;
  const role = roleLabel(doc?.responsible_role);
  const hint = document.createElement('div');
  hint.dataset.docPermissionHint = 'true';
  hint.className = 'status warn';
  hint.textContent = `Проверку и проблемные замечания по этому документу фиксирует ${role}. СПН может отметить получение документа.`;
  container.appendChild(hint);
}

function applyDocumentPermissions() {
  if (!loaded) return;
  document.querySelectorAll('button[data-doc-id][data-doc-status]').forEach((button) => {
    const doc = permissions.get(button.dataset.docId);
    if (!doc) return;
    const allowed = statusAllowed(doc, button.dataset.docStatus);
    button.disabled = !allowed;
    button.setAttribute('aria-disabled', allowed ? 'false' : 'true');
    if (!allowed) {
      button.classList.add('disabled');
      button.style.opacity = '.45';
      button.style.cursor = 'not-allowed';
      button.title = 'Это действие доступно ответственному специалисту по документу';
      ensureHint(button.closest('.list-item'), doc);
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
    applyDocumentPermissions();
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
    permissions = new Map((card.documents || []).map((doc) => [doc.id, doc]));
    loaded = true;
    applyDocumentPermissions();
  } catch (_) {
    loaded = false;
  }
}

const app = document.getElementById('app');
if (app) {
  new MutationObserver(queueApply).observe(app, { childList: true, subtree: true });
  app.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-doc-id][data-doc-status]');
    if (button && !button.disabled) queueReloadPermissions();
  }, true);
}

loadPermissions();
window.addEventListener('hashchange', queueApply);
