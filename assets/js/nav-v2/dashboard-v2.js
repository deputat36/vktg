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

function dealCard(deal) {
  return `<a class="deal-card" href="./deal-card-v2.html?id=${encodeURIComponent(deal.id)}">
    <div class="deal-head">
      <div>
        <div class="small">ID ${shortId(deal.id)} · ${dateText(deal.created_at)}</div>
        <div class="deal-title">${esc(deal.title)}</div>
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
    <div>${deal.has_children ? '<span class="pill red">дети</span> ' : ''}${deal.lawyer_needed ? '<span class="pill yellow">юрист</span> ' : ''}${deal.broker_needed ? '<span class="pill blue">брокер</span> ' : ''}${!deal.expenses_agreed ? '<span class="pill yellow">расходы</span> ' : ''}${!deal.settlements_agreed ? '<span class="pill yellow">расчеты</span> ' : ''}<span class="pill">${statusText(deal.status)}</span></div>
  </a>`;
}

function taskItem(task) {
  return `<div class="list-item">
    <div><span class="pill ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'yellow' : 'blue'}">${esc(task.priority)}</span> <span class="pill">${esc(task.assigned_role || 'роль')}</span></div>
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
  const attention = deals.filter(d => d.risk_level === 'red' || d.has_children || !d.expenses_agreed || !d.settlements_agreed);
  const lawyer = deals.filter(d => d.lawyer_needed);
  const broker = deals.filter(d => d.broker_needed);
  const readyDeposit = deals.filter(d => Number(d.readiness_deposit || 0) >= 80);
  const noExpenses = deals.filter(d => !d.expenses_agreed);
  const noSettlements = deals.filter(d => !d.settlements_agreed);

  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Рабочий стол</h1><p>Главный экран контроля: что требует внимания, что передать юристу или брокеру, где не согласованы расходы и расчеты.</p></section>
    <div class="kpi-row">
      ${metric('Всего сделок', summary.total)}
      ${metric('На контроле', summary.attention, 'red')}
      ${metric('Юристу', summary.lawyer, 'yellow')}
      ${metric('Брокеру', summary.broker)}
    </div>
    <div class="kpi-row">
      ${metric('Готовы к задатку', summary.ready_for_deposit, 'green')}
      ${metric('Готовы к сделке', summary.ready_for_deal, 'green')}
      ${metric('Не согласованы расходы', summary.expenses_not_agreed, 'yellow')}
      ${metric('Не согласованы расчеты', summary.settlements_not_agreed, 'yellow')}
    </div>
    <section class="grid">
      <div class="card"><h2>Профиль</h2><div class="list"><div class="list-item"><b>${esc(data.profile?.full_name || 'Пользователь')}</b><span class="small">${esc(data.profile?.email || '')}</span></div><div class="list-item"><b>Роль</b>${esc(data.profile?.role || '—')}</div></div></div>
      <div class="card"><h2>Быстрые действия</h2><div class="actions" style="justify-content:flex-start"><a class="btn primary" href="./spn-v2.html">Создать сделку</a><a class="btn light" href="./deals-v2.html">Все сделки</a><button id="reloadDashboard" class="btn light" type="button">Обновить</button></div></div>
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
