import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';

const app = document.getElementById('app');
let profile = null;
let dashboard = null;
let errorText = '';
let busy = false;
let copied = false;
let showDemo = false;

function n(value) { return Number(value || 0); }
function roleName(role) {
  return ({ owner: 'Владелец', admin: 'Администратор', manager: 'Менеджер', spn: 'СПН', lawyer: 'Юрист', broker: 'Брокер', viewer: 'Наблюдатель' })[role] || role || 'не определена';
}
function isAdmin() { return ['owner', 'admin'].includes(profile?.role); }
function summary() { return dashboard?.summary || {}; }
function items() { return Array.isArray(dashboard?.items) ? dashboard.items : []; }
function sourceCounts() { return Array.isArray(dashboard?.source_counts) ? dashboard.source_counts : []; }
function visibleItems() { return showDemo ? items() : items().filter((item) => !item.is_demo); }
function sourceLabel(source) {
  return ({
    auto_quality_seller_name: 'Продавец',
    auto_quality_buyer_name: 'Покупатель',
    auto_quality_address: 'Адрес объекта',
    auto_quality_responsible_spn: 'Ответственный СПН'
  })[source] || source || 'Проверка качества';
}
function toneByCount(value, warnAt = 1) {
  return n(value) >= warnAt ? 'yellow' : 'green';
}
function fmtDate(value) {
  if (!value) return 'нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU');
}
function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}
function issuePills(item) {
  const pills = [];
  if (item.is_demo) pills.push('<span class="pill blue">demo</span>');
  if (item.missing_seller) pills.push('<span class="pill yellow">нет продавца</span>');
  if (item.missing_buyer) pills.push('<span class="pill yellow">нет покупателя</span>');
  if (item.missing_address) pills.push('<span class="pill yellow">нет адреса</span>');
  if (item.without_spn) pills.push('<span class="pill red">нет СПН</span>');
  if (item.lawyer_unassigned) pills.push('<span class="pill red">нет юриста</span>');
  if (item.broker_unassigned) pills.push('<span class="pill yellow">нет брокера</span>');
  if (n(item.open_quality_tasks_count)) pills.push(`<span class="pill blue">quality: ${n(item.open_quality_tasks_count)}</span>`);
  if (n(item.urgent_quality_tasks_count)) pills.push(`<span class="pill red">urgent: ${n(item.urgent_quality_tasks_count)}</span>`);
  return pills.join(' ') || '<span class="pill green">без явных пробелов</span>';
}
function itemRow(item) {
  const issueCount = n(item.issue_count);
  const title = item.title || 'Сделка';
  const assignee = item.seller_spn || item.buyer_spn || item.manager || 'не назначен';
  return `<div class="list-item">
    <div class="section-title">
      <div>
        <b>${esc(title)}</b>
        <span class="small">${esc(item.address || 'адрес уточняется')} · ${esc(statusText(item.status))} · ${esc(item.risk_level || 'risk n/a')}</span>
      </div>
      <span class="pill ${issueCount >= 5 ? 'red' : issueCount ? 'yellow' : 'green'}">проблем: ${issueCount}</span>
    </div>
    <div style="margin:8px 0">${issuePills(item)}</div>
    <p class="muted">СПН/ответственный: ${esc(assignee)} · менеджер: ${esc(item.manager || 'не назначен')} · обновлено: ${esc(fmtDate(item.updated_at))}</p>
    <div class="actions" style="justify-content:flex-start">
      <a class="btn light" href="./deal-card-v2.html?id=${encodeURIComponent(item.id)}">Карточка</a>
      <a class="btn light" href="./deal-card-v2.html?id=${encodeURIComponent(item.id)}#tasks">Задачи</a>
      <a class="btn light" href="./deal-card-check-v2.html?id=${encodeURIComponent(item.id)}">Диагностика карточки</a>
    </div>
  </div>`;
}
function sourceRow(item) {
  const count = n(item.count);
  return `<div class="list-item">
    <div class="section-title">
      <div><b>${esc(sourceLabel(item.source))}</b><span class="small">${esc(item.source || '')}</span></div>
      <span class="pill ${item.priority === 'urgent' ? 'red' : item.priority === 'high' ? 'yellow' : 'blue'}">${esc(item.priority || 'normal')}</span>
    </div>
    <p class="muted">${count} открытых задач · статус ${esc(item.status || 'open')}</p>
  </div>`;
}
function reportText() {
  const s = summary();
  return [
    'CRM Навигатор сделок v2 — качество данных сделок',
    `profile: ${profile?.email || 'unknown'} · ${roleName(profile?.role)}`,
    `total_deals: ${n(s.total_deals)}`,
    `real_deals: ${n(s.real_deals)}`,
    `demo_deals: ${n(s.demo_deals)}`,
    `deals_with_issues: ${n(s.deals_with_issues)}`,
    `missing_seller: ${n(s.missing_seller)}`,
    `missing_buyer: ${n(s.missing_buyer)}`,
    `missing_address: ${n(s.missing_address)}`,
    `without_spn: ${n(s.without_spn)}`,
    `lawyer_unassigned: ${n(s.lawyer_unassigned)}`,
    `broker_unassigned: ${n(s.broker_unassigned)}`,
    `open_tasks: ${n(s.open_tasks)}`,
    `open_quality_tasks: ${n(s.open_quality_tasks)}`,
    `urgent_quality_tasks: ${n(s.urgent_quality_tasks)}`,
    `source_counts: ${JSON.stringify(sourceCounts())}`,
    '',
    ...visibleItems().slice(0, 20).map((item) => `${item.id}: ${item.title}; issues=${n(item.issue_count)}; quality=${n(item.open_quality_tasks_count)}; urgent=${n(item.urgent_quality_tasks_count)}; demo=${item.is_demo === true}`)
  ].join('\n');
}
async function copyReport() {
  try {
    await navigator.clipboard.writeText(reportText());
    copied = true;
    draw();
    setTimeout(() => { copied = false; draw(); }, 1400);
  } catch (_) {
    copied = false;
  }
}
function statusClass() {
  if (errorText) return 'error';
  if (!dashboard) return isAdmin() ? 'warn' : 'error';
  if (n(summary().urgent_quality_tasks) || n(summary().without_spn)) return 'warn';
  return n(summary().deals_with_issues) ? 'warn' : 'ok';
}
function statusMessage() {
  if (errorText) return errorText;
  if (!dashboard) return isAdmin() ? 'Запустите проверку качества данных.' : 'Проверка доступна только owner/admin.';
  const s = summary();
  if (n(s.deals_with_issues)) return `Найдены пробелы в ${n(s.deals_with_issues)} сделках; открытых quality задач: ${n(s.open_quality_tasks)}.`;
  return 'Качество данных сделок в норме.';
}
function draw() {
  const s = summary();
  const profileText = profile ? `${esc(profile.email || 'без email')} · ${esc(roleName(profile.role))}` : 'профиль не определен';
  const rows = visibleItems();
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Качество данных сделок</h1><p>Owner/admin отчет по пробелам карточек, auto-quality задачам и сделкам, которые нужно довести до понятного рабочего состояния. CRM «Лидер» не используется.</p></section>
    <div class="status ${statusClass()}">${esc(statusMessage())}</div>
    <section class="card">
      <div class="section-title">
        <div><h2>Проверка</h2><p class="muted">Текущий профиль: ${profileText}</p></div>
        <div class="actions" style="justify-content:flex-end">
          <button id="copyReport" class="btn light" type="button" ${dashboard ? '' : 'disabled'}>${copied ? 'Скопировано' : 'Скопировать отчет'}</button>
          <button id="runCheck" class="btn primary" type="button" ${busy || !isAdmin() ? 'disabled' : ''}>${busy ? 'Проверяю...' : 'Запустить проверку'}</button>
        </div>
      </div>
      <div class="actions" style="justify-content:flex-start"><a class="btn light" href="./diagnostics-v2.html">Диагностика</a><a class="btn light" href="./admin-v2.html#data-quality-box">Admin v2</a><a class="btn light" href="./deals-v2.html?filter=attention">Сделки на контроле</a></div>
    </section>
    ${dashboard ? `<section class="kpi-row">
      ${metric('Сделок всего', n(s.total_deals), 'blue')}
      ${metric('Рабочие', n(s.real_deals), 'green')}
      ${metric('Демо', n(s.demo_deals), 'blue')}
      ${metric('С пробелами', n(s.deals_with_issues), toneByCount(s.deals_with_issues))}
      ${metric('Нет продавца', n(s.missing_seller), toneByCount(s.missing_seller))}
      ${metric('Нет покупателя', n(s.missing_buyer), toneByCount(s.missing_buyer))}
      ${metric('Нет адреса', n(s.missing_address), toneByCount(s.missing_address))}
      ${metric('Нет СПН', n(s.without_spn), n(s.without_spn) ? 'red' : 'green')}
      ${metric('Нет юриста', n(s.lawyer_unassigned), toneByCount(s.lawyer_unassigned))}
      ${metric('Нет брокера', n(s.broker_unassigned), toneByCount(s.broker_unassigned))}
      ${metric('Открытых задач', n(s.open_tasks), 'blue')}
      ${metric('Quality задач', n(s.open_quality_tasks), toneByCount(s.open_quality_tasks))}
      ${metric('Срочных quality', n(s.urgent_quality_tasks), n(s.urgent_quality_tasks) ? 'red' : 'green')}
    </section>
    <section class="grid">
      <div class="card"><div class="section-title"><div><h2>Auto-quality задачи</h2><p class="muted">Группировка серверных auto-quality задач по типу и приоритету.</p></div><span class="pill ${n(s.urgent_quality_tasks) ? 'red' : 'yellow'}">${esc(String(n(s.open_quality_tasks)))}</span></div><div class="list">${sourceCounts().map(sourceRow).join('') || '<div class="empty">Auto-quality задач нет.</div>'}</div></div>
      <div class="card"><div class="section-title"><div><h2>Отбор</h2><p class="muted">По умолчанию показываются только рабочие сделки, демо можно включить отдельно.</p></div><span class="pill blue">${esc(String(rows.length))}</span></div><div class="actions" style="justify-content:flex-start"><button id="toggleDemo" class="btn light" type="button">${showDemo ? 'Скрыть демо' : 'Показать демо'}</button></div><div class="list" style="margin-top:12px"><div class="list-item"><b>Порядок исправления</b><p class="muted">1. Срочные quality и сделки без СПН. 2. Продавец/покупатель. 3. Адрес. 4. Юрист/брокер по статусу сделки.</p></div></div></div>
    </section>
    <section class="card"><div class="section-title"><div><h2>Топ сделок для исправления</h2><p class="muted">Сортировка приходит из server RPC. Видны быстрые ссылки на карточку, задачи и диагностику карточки.</p></div><span class="pill ${rows.length ? 'yellow' : 'green'}">${esc(String(rows.length))}</span></div><div class="list">${rows.map(itemRow).join('') || '<div class="empty">Проблемных рабочих сделок не найдено.</div>'}</div></section>` : ''}
  </main>`;
  document.getElementById('runCheck')?.addEventListener('click', runCheck);
  document.getElementById('copyReport')?.addEventListener('click', copyReport);
  document.getElementById('toggleDemo')?.addEventListener('click', () => { showDemo = !showDemo; draw(); });
}
async function runCheck() {
  if (busy || !isAdmin()) return;
  busy = true;
  errorText = '';
  draw();
  try {
    dashboard = await rpc('nav_v2_get_data_quality_dashboard', { p_limit: 30 }, 15000);
  } catch (error) {
    dashboard = null;
    errorText = 'Ошибка проверки качества данных: ' + (error.message || error);
  } finally {
    busy = false;
    draw();
  }
}
async function init() {
  setupTop('diagnostics');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  try {
    const data = await rpc('nav_v2_get_my_profile', {}, 12000);
    profile = data?.profile || null;
  } catch (error) {
    errorText = 'Ошибка проверки профиля: ' + (error.message || error);
  }
  draw();
  if (isAdmin()) await runCheck();
}

init();
