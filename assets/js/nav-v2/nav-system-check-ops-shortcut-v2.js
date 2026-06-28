import { rpc } from './supabase-v2.js';

const OPERATIONS_URL = './operations-health-check-v2.html';
const SHORTCUT_ATTR = 'data-nav-operations-shortcut';
const ADMIN_ROLES = new Set(['owner', 'admin']);
let accessState = 'pending';

function cardTitle(card) {
  return (card?.querySelector('h2')?.textContent || '').trim();
}

function createShortcutLink() {
  const link = document.createElement('a');
  link.className = 'btn primary';
  link.href = OPERATIONS_URL;
  link.setAttribute(SHORTCUT_ATTR, 'true');
  link.textContent = 'Обзор операций';
  return link;
}

function removeShortcuts(app) {
  app.querySelectorAll(`[${SHORTCUT_ATTR}]`).forEach((node) => node.remove());
}

function addQuickAction(app) {
  const quickCard = Array.from(app.querySelectorAll('.card')).find((card) => cardTitle(card) === 'Быстрые действия');
  const actions = quickCard?.querySelector('.actions');
  if (!actions || actions.querySelector(`[${SHORTCUT_ATTR}]`)) return;
  actions.prepend(createShortcutLink());
}

function addStaticCheckHint(app) {
  const autoCard = Array.from(app.querySelectorAll('.card')).find((card) => cardTitle(card) === 'Что проверяется автоматически');
  const list = autoCard?.querySelector('.list');
  if (!list || list.querySelector(`[${SHORTCUT_ATTR}]`)) return;

  const item = document.createElement('div');
  item.className = 'list-item';
  item.setAttribute(SHORTCUT_ATTR, 'true');
  item.innerHTML = '<b>Operations overview</b><p class="muted">Для owner/admin доступен единый обзор security, RPC, качества данных, качества профилей и frontend coverage.</p>';
  list.appendChild(item);
}

function injectOperationsShortcut() {
  const app = document.getElementById('app');
  if (!app) return;
  if (accessState !== 'allowed') {
    removeShortcuts(app);
    return;
  }
  addQuickAction(app);
  addStaticCheckHint(app);
}

async function resolveAccess() {
  try {
    const data = await rpc('nav_v2_get_my_profile', {}, 8000);
    accessState = ADMIN_ROLES.has(data?.profile?.role) ? 'allowed' : 'denied';
  } catch (_) {
    accessState = 'denied';
  }
  injectOperationsShortcut();
}

const app = document.getElementById('app');
if (app) {
  const observer = new MutationObserver(() => injectOperationsShortcut());
  observer.observe(app, { childList: true, subtree: true });
}

resolveAccess();
