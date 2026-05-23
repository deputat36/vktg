import { setupTop, getCachedUser, renderAuthBox, rpc, esc, money, riskPill, statusText } from './supabase-v2.js';

function qs(name) { return new URLSearchParams(location.search).get(name); }
function arr(data, key) { return Array.isArray(data?.[key]) ? data[key] : []; }

function metric(label, value, cls = '') {
  return `<div class="metric ${cls}"><span>${label}</span><b>${value}</b></div>`;
}

function renderDocs(items) {
  if (!items.length) return '<div class="empty">Документы пока не сформированы.</div>';
  return `<div class="list">${items.map((doc) => `<div class="list-item doc-status"><div><b>${esc(doc.title)}</b><span class="small">${esc(doc.category)} / ${esc(doc.side)}${doc.description ? ' — ' + esc(doc.description) : ''}</span></div><span class="pill ${doc.status === 'received' ? 'green' : 'yellow'}">${esc(doc.status || 'needed')}</span></div>`).join('')}</div>`;
}

function renderRisks(items) {
  if (!items.length) return '<div class="empty">Риски не обнаружены.</div>';
  return `<div class="list">${items.map((risk) => `<div class="list-item"><div>${riskPill(risk.level)} ${risk.blocks_deposit ? '<span class="pill red">блокирует задаток</span>' : ''} ${risk.blocks_deal ? '<span class="pill red">блокирует сделку</span>' : ''}</div><b>${esc(risk.title)}</b><p class="muted">${esc(risk.description || '')}</p><p><b>Рекомендация:</b> ${esc(risk.recommendation || 'Проверить с ответственным специалистом.')}</p></div>`).join('')}</div>`;
}

function renderExpenses(items) {
  if (!items.length) return '<div class="empty">Расходы пока не рассчитаны.</div>';
  const buyer = items.filter((e) => e.side === 'buyer');
  const seller = items.filter((e) => e.side === 'seller');
  const block = (title, list) => `<div class="card" style="box-shadow:none"><h3>${title}</h3><div class="list">${list.map((e) => `<div class="list-item"><b>${esc(e.title)}</b><span class="small">${esc(e.category)} / плательщик: ${esc(e.payer || 'не указан')}</span><p>${money(e.amount)} ${e.is_agreed ? '<span class="pill green">согласовано</span>' : '<span class="pill yellow">не согласовано</span>'}</p>${e.comment ? `<p class="muted">${esc(e.comment)}</p>` : ''}</div>`).join('') || '<div class="empty">Нет расходов</div>'}</div></div>`;
  return `<div class="side-by-side">${block('Расходы покупателя', buyer)}${block('Расходы продавца', seller)}</div>`;
}

function renderTasks(items) {
  if (!items.length) return '<div class="empty">Задач пока нет.</div>';
  return `<div class="list">${items.map((task) => `<div class="list-item"><div><span class="pill ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'yellow' : 'blue'}">${esc(task.priority)}</span> <span class="pill">${esc(task.status)}</span></div><b>${esc(task.title)}</b><p class="muted">${esc(task.description || '')}</p></div>`).join('')}</div>`;
}

function renderEvents(items) {
  if (!items.length) return '<div class="empty">История пока пустая.</div>';
  return `<div class="timeline">${items.map((event) => `<div class="list-item"><b>${esc(event.event_title)}</b><span class="small">${new Date(event.created_at).toLocaleString('ru-RU')}</span></div>`).join('')}</div>`;
}

function renderCard(data) {
  const deal = data.deal;
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>${esc(deal.title)}</h1><p>${esc(deal.next_action || 'Проверить карточку и определить следующий шаг.')}</p></section>
    <div class="kpi-row">
      ${metric('К задатку', (deal.readiness_deposit || 0) + '%', deal.readiness_deposit >= 80 ? 'green' : 'yellow')}
      ${metric('К сделке', (deal.readiness_deal || 0) + '%', deal.readiness_deal >= 80 ? 'green' : 'yellow')}
      ${metric('Статус', statusText(deal.status))}
      ${metric('Риск', riskPill(deal.risk_level))}
    </div>
    <section class="grid">
      <div class="card"><h2>Суть сделки</h2><div class="list">
        <div class="list-item"><b>Объект</b>${esc(deal.object_type || '—')}</div>
        <div class="list-item"><b>Адрес</b>${esc(deal.address || '—')}</div>
        <div class="list-item"><b>Цена</b>${money(deal.price_total)}</div>
        <div class="list-item"><b>Представительство</b>${esc(deal.representation_model || '—')}</div>
      </div></div>
      <div class="card"><h2>Контроль</h2><div class="list">
        <div class="list-item"><b>Юрист</b>${deal.lawyer_needed ? '<span class="pill yellow">нужен</span>' : '<span class="pill green">не требуется по первичной логике</span>'}</div>
        <div class="list-item"><b>Брокер</b>${deal.broker_needed ? '<span class="pill blue">нужен</span>' : '<span class="pill green">не требуется по первичной логике</span>'}</div>
        <div class="list-item"><b>Расходы</b>${deal.expenses_agreed ? '<span class="pill green">согласованы</span>' : '<span class="pill yellow">не согласованы</span>'}</div>
        <div class="list-item"><b>Расчеты</b>${deal.settlements_agreed ? '<span class="pill green">согласованы</span>' : '<span class="pill yellow">не согласованы</span>'}</div>
      </div></div>
    </section>
    <section class="card"><h2>Риски и рекомендации</h2>${renderRisks(arr(data,'risks'))}</section>
    <section class="card"><h2>Документы</h2>${renderDocs(arr(data,'documents'))}</section>
    <section class="card"><h2>Расходы</h2>${renderExpenses(arr(data,'expenses'))}</section>
    <section class="card"><h2>Задачи</h2>${renderTasks(arr(data,'tasks'))}</section>
    <section class="card"><h2>История</h2>${renderEvents(arr(data,'events'))}</section>
  </main>`;
}

async function load() {
  const id = qs('id');
  if (!id) {
    document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status error">Не указан id сделки.</div></main>';
    return;
  }
  document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю карточку сделки...</div></main>';
  try {
    const data = await rpc('nav_v2_get_deal_card', { p_deal_id: id });
    renderCard(data);
  } catch (error) {
    document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error">Ошибка загрузки: ${esc(error.message)}</div></main>`;
  }
}

async function init() {
  setupTop('deals');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  await load();
}

init();
