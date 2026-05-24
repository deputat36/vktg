import { setupTop, getCachedUser, renderAuthBox, rpc, esc, riskPill, statusText } from './supabase-v2.js';

let data = null;

function shortId(id) {
  return String(id || '').slice(0, 8).toUpperCase();
}

function dateText(value) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

function metric(label, value, cls = '') {
  return `<div class="metric ${cls}"><span>${label}</span><b>${value ?? 0}</b></div>`;
}

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true
    || deal?.wizard_snapshot?.demo === true
    || String(deal?.title || '').startsWith('ДЕМО:');
}

function demoBadge(deal) {
  return isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span> ' : '';
}

function activeTasksForDeal(dealId) {
  return (data?.tasks || []).filter((task) => task.deal_id === dealId && ['open', 'in_progress'].includes(task.status));
}

function hasRoleTask(deal, role) {
  return activeTasksForDeal(deal.id).some((task) => task.assigned_role === role);
}

function needsLawyerQueue(deal) {
  if (!deal.lawyer_needed) return false;
  return deal.status === 'need_lawyer'
    || deal.status === 'need_documents'
    || deal.has_children
    || deal.risk_level === 'red'
    || Number(deal.red_risks_count || 0) > 0
    || hasRoleTask(deal, 'lawyer');
}

function needsBrokerQueue(deal) {
  if (!deal.broker_needed) return false;
  return deal.status === 'need_broker'
    || deal.status === 'need_documents'
    || hasRoleTask(deal, 'broker');
}

function queueBadges(deal) {
  return `${needsLawyerQueue(deal) ? '<span class="pill yellow">юристу</span> ' : ''}${needsBrokerQueue(deal) ? '<span class="pill blue">брокеру</span> ' : ''}`;
}

function dealCard(deal) {
  return `<a class="deal-card ${isDemoDeal(deal) ? 'demo-card' : ''}" href="./deal-card-v2.html?id=${encodeURIComponent(deal.id)}">
    <div class="deal-head">
      <div>
        <div class="small">ID ${shortId(deal.id)} · ${dateText(deal.created_at)}</div>
        <div class="deal-title">${demoBadge(deal)}${esc(deal.title)}</div>
        <div class="small">${esc(deal.address || 'Адрес не указан')}</div>
      </div>
      ${riskPill(deal.risk_level)}
    </div>
    <div class="deal-meta">
      <div><span class="small">Задаток</span><b>${deal.readiness_deposit || 0}%</b></div>
      <div><span class="small">Сделка</span><b>${deal.readiness_deal || 0}%</b></div>
      <div><span class="small">Задачи</span><b>${deal.open_tasks_count || 0}</b></div>
    </div>
    <p><b>Следующее действие:</b><br>${esc(deal.next_action || 'Проверить карточку')}</p>
    <div>${demoBadge(deal)}${deal.has_children ? '<span class="pill red">дети</span> ' : ''}${queueBadges(deal)}${!deal.expenses_agreed ? '<span class="pill yellow">расходы</span> ' : ''}${!deal.settlements_agreed ? '<span class="pill yellow">расчеты</span> ' : ''}<span class="pill">${statusText(deal.status)}</span></div>
  </a>`;
}

function taskItem(task) {
  const isDemoTask = String(task.deal_title || '').startsWith('ДЕМО:');
  return `<div class="list-item">
    <div>${isDemoTask ? '<span class="pill blue">ДЕМО</span> ' : ''}<span class="pill ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'yellow' : 'blue'}">${esc(task.priority)}</span> <span class="pill">${esc(task.assigned_role || 'роль')}</span></div>
    <b>${esc(task.title)}</b>
    <p class="muted">${esc(task.description || '')}</p>
    <a class="btn light" href="./deal-card-v2.html?id=${encodeURIComponent(task.deal_id)}">Открыть сделку</a>
  </div>`;
}

function queue(title, items, emptyText) {
  return `<section class="card"><div class="section-title"><h2>${title}</h2><span class="pill blue">${items.length}</span></div><div class="deal-list">${items.map(dealCard).join('') || `<div class="empty">${emptyText}</div>`}</div></section>`;
}

function render() {
  const summary = data.summary || {};
  const deals = data.deals || [];
  const tasks = data.tasks || [];
  const attention = deals.filter(d => d.risk_level === 'red' || d.has_children || !d.expenses_agreed || !d.settlements_agreed || Number(d.red_risks_count || 0) > 0);
  const lawyer = deals.filter(needsLawyerQueue);
  const broker = deals.filter(needsBrokerQueue);
  const readyDeposit = deals.filter(d => Number(d.readiness_deposit || 0) >= 80);
  const noExpenses = deals.filter(d => !d.expenses_agreed);
  const noSettlements = deals.filter(d => !d.settlements_agreed);
  const demoDeals = deals.filter(isDemoDeal);
  const realDeals = deals.filter(d => !isDemoDeal(d));

  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Рабочий стол</h1><p>Главный экран контроля: что требует внимания, что передать юристу или брокеру, где не согласованы расходы и расчеты.</p></section>
    <div class="status ok">Демо-сделки помечаются бейджем «ДЕМО». Очереди «Юристу» и «Брокеру» считаются по активным задачам, статусу сделки и стоп-факторам.</div>
    <div class="kpi-row">
      ${metric('Всего сделок', summary.total)}
      ${metric('На контроле', attention.length, 'red')}
      ${metric('Юристу', lawyer.length, 'yellow')}
      ${metric('Брокеру', broker.length)}
      ${metric('Демо', demoDeals.length)}
      ${metric('Рабочие', realDeals.length)}
    </div>
    <div class="kpi-row">
      ${metric('Готовы к задатку', summary.ready_for_deposit, 'green')}
      ${metric('Готовы к сделке', summary.ready_for_deal, 'green')}
      ${metric('Не согласованы расходы', noExpenses.length, 'yellow')}
      ${metric('Не согласованы расчеты', noSettlements.length, 'yellow')}
    </div>
    <section class="grid">
      <div class="card"><h2>Профиль</h2><div class="list"><div class="list-item"><b>${esc(data.profile?.full_name || 'Пользователь')}</b><span class="small">${esc(data.profile?.email || '')}</span></div><div class="list-item"><b>Роль</b>${esc(data.profile?.role || '—')}</div></div></div>
      <div class="card"><h2>Быстрые действия</h2><div class="actions" style="justify-content:flex-start"><a class="btn primary" href="./spn-v2.html">Создать сделку</a><a class="btn light" href="./deals-v2.html">Все сделки</a><a class="btn light" href="./deals-v2.html">Фильтр демо</a><button id="reloadDashboard" class="btn light" type="button">Обновить</button></div></div>
    </section>
    ${queue('На контроле', attention, 'Критичных сделок сейчас нет.')}
    ${queue('Передать юристу', lawyer, 'Очередь юриста пустая.')}
    ${queue('Передать брокеру', broker, 'Очередь брокера пустая.')}
    ${queue('Не согласованы расходы', noExpenses, 'Расходы согласованы во всех видимых сделках.')}
    ${queue('Не согласованы расчеты', noSettlements, 'Расчеты согласованы во всех видимых сделках.')}
    ${queue('Готовы к задатку', readyDeposit, 'Пока нет сделок с готовностью к задатку 80%+.')}
    <section class="card"><div class="section-title"><h2>Открытые задачи</h2><span class="pill blue">${tasks.length}</span></div><div class="list">${tasks.map(taskItem).join('') || '<div class="empty">Открытых задач нет.</div>'}</div></section>
  </main>`;
  document.getElementById('reloadDashboard').onclick = load;
}

async function load() {
  document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю рабочий стол...</div></main>';
  try {
    data = await rpc('nav_v2_get_dashboard', {});
    render();
  } catch (error) {
    document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error">Ошибка загрузки: ${esc(error.message)}</div></main>`;
  }
}

async function init() {
  setupTop('dashboard');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  await load();
}

init();
