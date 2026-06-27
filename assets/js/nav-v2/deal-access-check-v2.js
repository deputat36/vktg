import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
let form = {
  email: params.get('email') || params.get('p_email') || '',
  dealId: params.get('deal_id') || params.get('dealId') || params.get('id') || ''
};
let result = null;
let errorText = '';
let infoText = '';
let busy = false;

function pill(value, yes = 'да', no = 'нет') {
  if (value === true) return `<span class="pill green">${yes}</span>`;
  if (value === false) return `<span class="pill red">${no}</span>`;
  return '<span class="pill yellow">нет данных</span>';
}

function readForm() {
  form = {
    email: document.getElementById('diagEmail')?.value.trim() || '',
    dealId: document.getElementById('diagDealId')?.value.trim() || ''
  };
  return form;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
}

function smokeRows(smoke = {}) {
  return [
    ['Профиль', smoke.profile_ok],
    ['Список сделок', smoke.deals_list_ok],
    ['Сделка в списке', smoke.deals_list_contains_deal],
    ['Lite-карточка', smoke.lite_card_ok],
    ['Full-карточка', smoke.full_card_ok]
  ].map(([label, ok]) => `<div class="metric ${ok ? 'green' : 'red'}"><span>${label}</span><b>${ok ? 'OK' : 'FAIL'}</b></div>`).join('');
}

function signalRows(signals = {}) {
  const labels = {
    is_active_profile: 'Профиль активен',
    created_by_user: 'Создатель сделки',
    seller_spn: 'СПН продавца',
    buyer_spn: 'СПН покупателя',
    manager: 'Менеджер сделки',
    lawyer: 'Юрист сделки',
    broker: 'Брокер сделки',
    participant_can_view: 'Участник может смотреть',
    participant_can_edit: 'Участник может редактировать',
    manager_of_assigned_spn: 'Менеджер назначенного СПН'
  };
  return Object.entries(labels).map(([key, title]) => `<div class="list-item"><b>${title}</b>${pill(signals[key])}</div>`).join('');
}

function participantRows(items = []) {
  return items.map((item) => `<div class="list-item">
    <b>${esc(item.full_name || item.email || item.user_id || 'Участник')}</b>
    <span class="small">${esc(item.email || '')} · ${esc(item.role || '')} · ${esc(item.role_in_deal || '')}</span>
    <div style="margin-top:8px">${pill(item.can_view, 'can_view', 'no view')} ${pill(item.can_edit, 'can_edit', 'no edit')} ${pill(item.can_manage_tasks, 'tasks', 'no tasks')} ${pill(item.can_view_finance, 'finance', 'no finance')}</div>
  </div>`).join('');
}

function diagnosticUrl(values = form) {
  const url = new URL('./deal-access-check-v2.html', location.href);
  if (values.email) url.searchParams.set('email', values.email);
  if (values.dealId) url.searchParams.set('deal_id', values.dealId);
  url.searchParams.set('auto', '1');
  return url.href;
}

function updateAutoLink() {
  const link = document.getElementById('autoDiagLink');
  if (link) link.href = diagnosticUrl(readForm());
}

async function copyDiagnosticUrl() {
  const url = diagnosticUrl(readForm());
  infoText = '';
  errorText = '';
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(url);
    infoText = 'Ссылка диагностики скопирована.';
  } catch (_) {
    infoText = 'Ссылка для копирования: ' + url;
  }
  draw();
}

function resultView() {
  if (!result) return '';
  const target = result.target || null;
  const deal = result.deal || null;
  const participants = Array.isArray(result.participants) ? result.participants : [];
  const smoke = result.rpc_smoke || {};
  return `<section class="card">
    <div class="section-title">
      <div><h2>Результат проверки</h2><p class="muted">Проверка выполнена серверным owner/admin RPC от имени выбранного пользователя.</p></div>
      <span class="pill ${result.ok ? 'green' : 'red'}">${result.ok ? 'доступ есть' : 'есть проблема'}</span>
    </div>
    <div class="kpi-row">${smokeRows(smoke)}</div>
    <div class="grid">
      <div>
        <h3>Сигналы доступа</h3>
        <div class="list">${signalRows(result.access_signals || {})}</div>
      </div>
      <div>
        <h3>Пользователь и сделка</h3>
        <div class="list">
          <div class="list-item"><b>${esc(target?.full_name || target?.email || 'Пользователь не найден')}</b><span class="small">${esc(target?.email || form.email || '')} · ${esc(target?.role || 'роль не определена')}</span>${target ? pill(target.is_active === true, 'активен', 'выключен') : '<span class="pill yellow">профиль не найден</span>'}</div>
          <div class="list-item"><b>${esc(deal?.title || 'Сделка не найдена')}</b><span class="small">${esc(deal?.id || form.dealId || '')}</span>${deal ? `<span class="pill blue">${esc(statusText(deal.status))}</span>` : '<span class="pill yellow">сделка не найдена</span>'}${deal?.id ? `<div class="actions" style="justify-content:flex-start;margin-top:8px"><a class="btn light" href="./deal-card-v2.html?id=${encodeURIComponent(deal.id)}">Открыть карточку</a><a class="btn light" href="./deal-card-check-v2.html?id=${encodeURIComponent(deal.id)}">Проверка карточки</a><a class="btn light" id="resultAutoDiagLink" href="${esc(diagnosticUrl())}">Ссылка на эту проверку</a></div>` : ''}</div>
        </div>
        <h3>Участники</h3>
        <div class="list">${participantRows(participants) || '<div class="empty">Участники сделки не найдены.</div>'}</div>
      </div>
    </div>
  </section>`;
}

function draw() {
  const status = errorText
    ? `<div class="status error">${esc(errorText)}</div>`
    : infoText
      ? `<div class="status ok">${esc(infoText)}</div>`
      : result
        ? `<div class="status ${result.ok ? 'ok' : 'warn'}">${result.ok ? 'Доступ подтвержден.' : 'Нужна проверка профиля, сделки или прав.'}</div>`
        : '<div class="status">Заполните email и id сделки. Для автозапуска используйте параметр auto=1.</div>';

  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Диагностика доступа</h1><p>Owner/admin проверка доступа пользователя к конкретной сделке без ручного SQL.</p></section>
    <section class="card">
      <div class="grid">
        <div class="field"><label>Email сотрудника</label><input id="diagEmail" value="${esc(form.email)}" placeholder="user@example.ru" autocomplete="email"></div>
        <div class="field"><label>ID сделки</label><input id="diagDealId" value="${esc(form.dealId)}" placeholder="uuid сделки" autocomplete="off"></div>
      </div>
      ${status}
      <div class="actions" style="justify-content:flex-start">
        <button id="runDiag" class="btn primary" type="button" ${busy ? 'disabled' : ''}>${busy ? 'Проверяю...' : 'Проверить доступ'}</button>
        <a id="autoDiagLink" class="btn light" href="${esc(diagnosticUrl())}">Ссылка с автопроверкой</a>
        <button id="copyDiagLink" class="btn light" type="button">Скопировать ссылку</button>
        <a class="btn light" href="./admin-v2.html#deal-access-diagnostic-box">Админка</a>
        <a class="btn light" href="./deals-v2.html">Сделки</a>
      </div>
    </section>
    ${resultView()}
  </main>`;

  document.getElementById('runDiag').onclick = runDiagnostic;
  document.getElementById('copyDiagLink').onclick = copyDiagnosticUrl;
  document.getElementById('diagEmail').addEventListener('input', updateAutoLink);
  document.getElementById('diagDealId').addEventListener('input', updateAutoLink);
}

async function runDiagnostic() {
  if (busy) return;
  readForm();
  result = null;
  errorText = '';
  infoText = '';
  if (!form.email || !form.dealId) {
    errorText = 'Укажите email сотрудника и id сделки.';
    draw();
    return;
  }
  if (!isUuid(form.dealId)) {
    errorText = 'ID сделки должен быть UUID.';
    draw();
    return;
  }
  busy = true;
  draw();
  try {
    result = await rpc('nav_v2_check_deal_access', { p_email: form.email, p_deal_id: form.dealId }, 20000);
  } catch (error) {
    errorText = 'Ошибка диагностики: ' + (error.message || error);
  } finally {
    busy = false;
    draw();
  }
}

async function init() {
  setupTop('admin');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  try {
    const data = await rpc('nav_v2_get_my_profile', {}, 12000);
    const profile = data?.profile || null;
    if (!['owner', 'admin'].includes(profile?.role)) {
      app.innerHTML = `<main class="nav-v2-shell"><section class="hero"><h1>Нет доступа</h1><p>Диагностика доступна только owner/admin.</p></section><section class="card"><div class="status warn">${esc(profile?.email || 'Пользователь')} · роль: ${esc(profile?.role || 'не определена')}</div><a class="btn primary" href="./dashboard-v2.html">Рабочий стол</a></section></main>`;
      return;
    }
    draw();
    if (params.get('auto') === '1' && form.email && form.dealId) await runDiagnostic();
  } catch (error) {
    app.innerHTML = `<main class="nav-v2-shell"><section class="card"><div class="status error">Ошибка проверки профиля: ${esc(error.message || error)}</div></section></main>`;
  }
}

init();
