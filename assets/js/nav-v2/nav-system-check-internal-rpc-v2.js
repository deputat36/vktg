import { rpc, esc } from './supabase-v2.js';

const CHECK_ATTR = 'data-internal-rpc-lockdown-check';
let lastState = null;
let running = false;

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

function resultsList() {
  const runButton = document.getElementById('runCheck');
  const section = runButton?.closest('section.card');
  return section?.querySelector('.list') || null;
}

function rowHtml(state) {
  return `<div class="list-item" ${CHECK_ATTR}="true">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
      <div>
        <b>Внутренние RPC</b>
        <p class="muted">${esc(state.details || '')}</p>
        ${state.meta ? `<span class="small">${esc(state.meta)}</span>` : ''}
      </div>
      <span class="pill ${statusClass(state.status)}">${statusText(state.status)}</span>
    </div>
  </div>`;
}

function renderState() {
  if (!lastState) return;
  const list = resultsList();
  if (!list) return;
  const html = rowHtml(lastState);
  const existing = list.querySelector(`[${CHECK_ATTR}]`);
  if (existing?.outerHTML === html) return;
  if (existing) existing.outerHTML = html;
  else list.insertAdjacentHTML('beforeend', html);
}

function update(status, details, meta = '') {
  lastState = { status, details, meta };
  renderState();
}

function compactFailures(items) {
  return items
    .filter((item) => !item.exists_in_db || item.authenticated_can_execute || item.anon_can_execute || item.public_can_execute)
    .map((item) => item.signature || item.title)
    .slice(0, 8)
    .join('; ');
}

async function runInternalRpcCheck() {
  if (running) return;
  running = true;
  update('info', 'Проверяю, что внутренние helper-функции закрыты для браузерных ролей...');
  try {
    const data = await rpc('nav_v2_get_internal_rpc_lockdown_health', {}, 12000);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (data?.ok === true) {
      update('ok', `Проверено внутренних функций: ${items.length}. authenticated, anon и PUBLIC не имеют EXECUTE.`);
      return;
    }
    update(
      'error',
      `Нарушен lockdown внутренних RPC. Не найдено: ${Number(data?.missing_count || 0)}. Открыто ролям: ${Number(data?.open_count || 0)}.`,
      compactFailures(items)
    );
  } catch (error) {
    const message = String(error?.message || error || '');
    if (message.includes('owner/admin')) {
      update('ok', 'Проверка внутренних RPC доступна только owner/admin. Для текущей роли это корректно.', message);
      return;
    }
    if (/permission denied for function/i.test(message)) {
      update('error', 'Нет EXECUTE на диагностическую функцию внутренних RPC для authenticated.', message);
      return;
    }
    update('error', message || 'Не удалось проверить внутренние RPC.');
  } finally {
    running = false;
  }
}

document.addEventListener('click', (event) => {
  if (event.target?.id === 'runCheck') {
    setTimeout(runInternalRpcCheck, 1200);
  }
}, true);

new MutationObserver(renderState).observe(document.body, { childList: true, subtree: true });
