import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';

const app = document.getElementById('app');
let health = null;
let profile = null;
let errorText = '';
let busy = false;

function n(value) { return Number(value || 0); }
function boolPill(value, yes = 'да', no = 'нет') {
  if (value === true) return `<span class="pill green">${yes}</span>`;
  if (value === false) return `<span class="pill red">${no}</span>`;
  return '<span class="pill yellow">нет данных</span>';
}
function roleName(role) {
  return ({ owner: 'Владелец', admin: 'Администратор', manager: 'Менеджер', spn: 'СПН', lawyer: 'Юрист', broker: 'Брокер', viewer: 'Наблюдатель' })[role] || role || 'не определена';
}
function items() { return Array.isArray(health?.items) ? health.items : []; }
function problemItems() {
  return items().filter((item) => !item.exists_in_db || !item.authenticated_can_execute || item.anon_can_execute || item.public_can_execute);
}
function demoItems() {
  return items().filter((item) => ['public.nav_v2_seed_demo_data()', 'public.nav_v2_clear_demo_data()'].includes(item.signature));
}
function itemStatus(item) {
  if (!item.exists_in_db) return ['red', 'не найдена'];
  if (!item.authenticated_can_execute) return ['red', 'нет authenticated'];
  if (item.anon_can_execute || item.public_can_execute) return ['red', 'открыта лишняя роль'];
  return ['green', 'ok'];
}
function itemRow(item) {
  const [pillClass, label] = itemStatus(item);
  return `<div class="list-item">
    <div class="section-title">
      <div><b>${esc(item.title || item.signature)}</b><span class="small">${esc(item.signature || '')}</span></div>
      <span class="pill ${pillClass}">${esc(label)}</span>
    </div>
    <div class="actions" style="justify-content:flex-start;margin-top:8px">
      ${boolPill(item.exists_in_db, 'exists', 'missing')}
      ${boolPill(item.authenticated_can_execute, 'authenticated', 'no authenticated')}
      ${boolPill(item.anon_can_execute, 'anon open', 'anon closed')}
      ${boolPill(item.public_can_execute, 'PUBLIC open', 'PUBLIC closed')}
    </div>
  </div>`;
}
function reportText() {
  const lines = [
    'CRM Навигатор сделок v2 — RPC grant diagnostics',
    `profile: ${profile?.email || 'unknown'} · ${roleName(profile?.role)}`,
    `ok: ${health?.ok === true}`,
    `items: ${items().length}`,
    `missing_authenticated_count: ${n(health?.missing_authenticated_count)}`,
    `anon_open_count: ${n(health?.anon_open_count)}`,
    `public_open_count: ${n(health?.public_open_count)}`,
    '',
    ...problemItems().map((item) => `${item.signature}: exists=${item.exists_in_db}; authenticated=${item.authenticated_can_execute}; anon=${item.anon_can_execute}; public=${item.public_can_execute}`)
  ];
  return lines.join('\n');
}
async function copyReport() {
  try {
    await navigator.clipboard.writeText(reportText());
    errorText = '';
    draw('Отчет скопирован.');
  } catch (error) {
    draw('Не удалось скопировать отчет: ' + (error.message || error));
  }
}
function metrics() {
  if (!health) return '';
  return `<div class="kpi-row">
    <div class="metric ${health.ok ? 'green' : 'red'}"><span>Итог</span><b>${health.ok ? 'OK' : 'FAIL'}</b></div>
    <div class="metric"><span>RPC проверено</span><b>${items().length}</b></div>
    <div class="metric ${n(health.missing_authenticated_count) ? 'red' : 'green'}"><span>Нет authenticated</span><b>${n(health.missing_authenticated_count)}</b></div>
    <div class="metric ${n(health.anon_open_count) ? 'red' : 'green'}"><span>Открыто anon</span><b>${n(health.anon_open_count)}</b></div>
    <div class="metric ${n(health.public_open_count) ? 'red' : 'green'}"><span>Открыто PUBLIC</span><b>${n(health.public_open_count)}</b></div>
    <div class="metric ${demoItems().length === 2 ? 'green' : 'yellow'}"><span>Demo RPC в health</span><b>${demoItems().length}</b></div>
  </div>`;
}
function healthView() {
  if (!health) return '';
  const problems = problemItems();
  const demos = demoItems();
  return `<section class="card">
    <div class="section-title">
      <div><h2>Сводка RPC grants</h2><p class="muted">Проверяются browser-callable RPC: наличие функции, EXECUTE для authenticated, отсутствие доступа для anon и PUBLIC.</p></div>
      <span class="pill ${health.ok ? 'green' : 'red'}">${health.ok ? 'ok' : 'fail'}</span>
    </div>
    ${metrics()}
    <div class="grid">
      <div>
        <h3>Проблемы</h3>
        <div class="list">${problems.map(itemRow).join('') || '<div class="empty">Проблем не найдено.</div>'}</div>
      </div>
      <div>
        <h3>Demo RPC</h3>
        <div class="list">${demos.map(itemRow).join('') || '<div class="empty">Demo RPC не найдены в health-check.</div>'}</div>
      </div>
    </div>
    <h3>Все RPC</h3>
    <div class="list">${items().map(itemRow).join('')}</div>
  </section>`;
}
function draw(infoText = '') {
  const status = errorText
    ? `<div class="status error">${esc(errorText)}</div>`
    : infoText
      ? `<div class="status ok">${esc(infoText)}</div>`
      : health
        ? `<div class="status ${health.ok ? 'ok' : 'error'}">${health.ok ? 'RPC grants в норме.' : 'Найдены проблемы RPC grants.'}</div>`
        : '<div class="status">Запустите проверку RPC grants.</div>';
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>RPC grants</h1><p>Owner/admin диагностика доступности клиентских RPC и защиты от anon/PUBLIC EXECUTE.</p></section>
    ${status}
    <section class="card">
      <div class="section-title">
        <div><h2>Проверка</h2><p class="muted">Текущий профиль: ${esc(profile?.email || 'не определен')} · ${esc(roleName(profile?.role))}</p></div>
        <div class="actions" style="justify-content:flex-end">
          <button id="copyReport" class="btn light" type="button" ${health ? '' : 'disabled'}>Скопировать отчет</button>
          <button id="runCheck" class="btn primary" type="button" ${busy ? 'disabled' : ''}>${busy ? 'Проверяю...' : 'Запустить проверку'}</button>
        </div>
      </div>
      <div class="actions" style="justify-content:flex-start">
        <a class="btn light" href="./nav-system-check-v2.html">Проверка системы</a>
        <a class="btn light" href="./admin-v2.html">Админка</a>
        <a class="btn light" href="./deal-access-check-v2.html">Диагностика доступа</a>
      </div>
    </section>
    ${healthView()}
  </main>`;
  document.getElementById('runCheck').onclick = runCheck;
  document.getElementById('copyReport').onclick = copyReport;
}
async function runCheck() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    health = await rpc('nav_v2_get_rpc_grant_health', {}, 15000);
  } catch (error) {
    health = null;
    errorText = 'Ошибка RPC grant diagnostics: ' + (error.message || error);
  } finally {
    busy = false;
    draw();
  }
}
async function init() {
  setupTop('check');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  try {
    const data = await rpc('nav_v2_get_my_profile', {}, 12000);
    profile = data?.profile || null;
    if (!['owner', 'admin'].includes(profile?.role)) {
      app.innerHTML = `<main class="nav-v2-shell"><section class="hero"><h1>Нет доступа</h1><p>RPC grant diagnostics доступна только owner/admin.</p></section><section class="card"><div class="status warn">${esc(profile?.email || 'Пользователь')} · ${esc(roleName(profile?.role))}</div><a class="btn primary" href="./dashboard-v2.html">Рабочий стол</a></section></main>`;
      return;
    }
    draw();
    await runCheck();
  } catch (error) {
    errorText = 'Ошибка проверки профиля: ' + (error.message || error);
    draw();
  }
}

init();
