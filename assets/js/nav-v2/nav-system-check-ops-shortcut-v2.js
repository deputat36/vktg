import { rpc } from './supabase-v2.js';

const OPERATIONS_URL = './operations-health-check-v2.html';
const SHORTCUT_ATTR = 'data-nav-operations-shortcut';
const PAGE_CHECK_ATTR = 'data-nav-operations-page-check';
const PAGE_CHECK_RENDER_ATTR = 'data-nav-operations-page-check-render';
const ADMIN_ROLES = new Set(['owner', 'admin']);
let accessState = 'pending';
let pageCheckStarted = false;
let pageCheck = {
  status: 'info',
  details: 'Проверяю доступность owner/admin страницы Operations overview...',
  meta: OPERATIONS_URL
};

function cardTitle(card) {
  return (card?.querySelector('h2')?.textContent || '').trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function statusClass(status) {
  if (status === 'ok') return 'green';
  if (status === 'warn') return 'yellow';
  if (status === 'error') return 'red';
  return 'blue';
}

function statusText(status) {
  if (status === 'ok') return 'OK';
  if (status === 'warn') return 'Внимание';
  if (status === 'error') return 'Ошибка';
  return 'Проверка';
}

function pageCheckRenderKey() {
  return [pageCheck.status, pageCheck.details, pageCheck.meta].join('|');
}

function createShortcutLink() {
  const link = document.createElement('a');
  link.className = 'btn primary';
  link.href = OPERATIONS_URL;
  link.setAttribute(SHORTCUT_ATTR, 'true');
  link.textContent = 'Обзор операций';
  return link;
}

function removeOperationsAddons(app) {
  app.querySelectorAll(`[${SHORTCUT_ATTR}], [${PAGE_CHECK_ATTR}]`).forEach((node) => node.remove());
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
  item.innerHTML = '<b>Operations overview</b><p class="muted">Для активного owner/admin доступен единый обзор security, RPC, качества данных, качества профилей и frontend coverage.</p>';
  list.appendChild(item);
}

function addOperationsPageCheck(app) {
  const resultsCard = Array.from(app.querySelectorAll('.card')).find((card) => cardTitle(card) === 'Результаты');
  const list = resultsCard?.querySelector('.list');
  if (!list) return;

  let item = list.querySelector(`[${PAGE_CHECK_ATTR}]`);
  if (!item) {
    item = document.createElement('div');
    item.className = 'list-item';
    item.setAttribute(PAGE_CHECK_ATTR, 'true');
    list.appendChild(item);
  }

  const renderKey = pageCheckRenderKey();
  if (item.getAttribute(PAGE_CHECK_RENDER_ATTR) === renderKey) return;
  item.setAttribute(PAGE_CHECK_RENDER_ATTR, renderKey);
  item.innerHTML = `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
    <div>
      <b>Operations overview page</b>
      <p class="muted">${esc(pageCheck.details)}</p>
      <span class="small">${esc(pageCheck.meta)}</span>
    </div>
    <span class="pill ${statusClass(pageCheck.status)}">${statusText(pageCheck.status)}</span>
  </div>`;
}

function injectOperationsShortcut() {
  const app = document.getElementById('app');
  if (!app) return;
  if (accessState !== 'allowed') {
    removeOperationsAddons(app);
    return;
  }
  addQuickAction(app);
  addStaticCheckHint(app);
  addOperationsPageCheck(app);
}

async function checkOperationsPage() {
  if (pageCheckStarted) return;
  pageCheckStarted = true;
  injectOperationsShortcut();
  try {
    const response = await fetch(OPERATIONS_URL, { method: 'GET', cache: 'no-store' });
    if (!response.ok) {
      pageCheck = {
        status: 'warn',
        details: `Operations overview не ответил на статическую проверку: HTTP ${response.status}.`,
        meta: OPERATIONS_URL
      };
    } else {
      pageCheck = {
        status: 'ok',
        details: 'Operations overview доступен как диагностическая страница для активного owner/admin профиля.',
        meta: OPERATIONS_URL
      };
    }
  } catch (error) {
    pageCheck = {
      status: 'warn',
      details: 'Не удалось проверить Operations overview как статическую страницу.',
      meta: error?.message || OPERATIONS_URL
    };
  }
  injectOperationsShortcut();
}

async function resolveAccess() {
  try {
    const data = await rpc('nav_v2_get_my_profile', {}, 8000);
    const profile = data?.profile || {};
    accessState = ADMIN_ROLES.has(profile.role) && profile.is_active === true ? 'allowed' : 'denied';
  } catch (_) {
    accessState = 'denied';
  }
  injectOperationsShortcut();
  if (accessState === 'allowed') await checkOperationsPage();
}

const app = document.getElementById('app');
if (app) {
  const observer = new MutationObserver(() => injectOperationsShortcut());
  observer.observe(app, { childList: true, subtree: true });
}

resolveAccess();
