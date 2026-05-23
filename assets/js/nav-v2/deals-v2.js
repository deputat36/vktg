import { setupTop, getCachedUser, renderAuthBox, rpc, esc, riskPill, statusText } from './supabase-v2.js';

let allDeals = [];
let profile = null;
let currentFilter = 'all';
let searchQuery = '';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

function shortId(id) {
  return String(id || '').slice(0, 8).toUpperCase();
}

function needsAttention(deal) {
  return deal.risk_level === 'red' || deal.has_children || !deal.expenses_agreed || !deal.settlements_agreed || Number(deal.red_risks_count || 0) > 0;
}

function filterDeal(deal) {
  if (currentFilter === 'attention' && !needsAttention(deal)) return false;
  if (currentFilter === 'lawyer' && !deal.lawyer_needed) return false;
  if (currentFilter === 'broker' && !deal.broker_needed) return false;
  if (currentFilter === 'deposit' && Number(deal.readiness_deposit || 0) < 80) return false;
  if (currentFilter === 'deal' && Number(deal.readiness_deal || 0) < 80) return false;
  if (searchQuery.trim()) {
    const text = [deal.id, deal.title, deal.address, deal.object_type, deal.next_action].join(' ').toLowerCase();
    return text.includes(searchQuery.trim().toLowerCase());
  }
  return true;
}

function renderKpi() {
  const attention = allDeals.filter(needsAttention).length;
  const lawyer = allDeals.filter((deal) => deal.lawyer_needed).length;
  const broker = allDeals.filter((deal) => deal.broker_needed).length;
  return `<div class="kpi-row">
    <div class="metric"><span>Всего</span><b>${allDeals.length}</b></div>
    <div class="metric red"><span>На контроле</span><b>${attention}</b></div>
    <div class="metric yellow"><span>Юрист</span><b>${lawyer}</b></div>
    <div class="metric"><span>Брокер</span><b>${broker}</b></div>
  </div>`;
}

function renderDealCard(deal, index) {
  const href = './deal-card-v2.html?id=' + encodeURIComponent(deal.id);
  return `<article class="deal-card">
    <div class="deal-head">
      <div>
        <div class="small">№ ${index + 1} · ID ${shortId(deal.id)} · создана ${formatDate(deal.created_at)}</div>
        <div class="deal-title">${esc(deal.title)}</div>
        <div class="small">${esc(deal.address || 'Адрес не указан')}</div>
      </div>
      ${riskPill(deal.risk_level)}
    </div>
    <div class="deal-meta">
      <div><span class="small">К задатку</span><b>${deal.readiness_deposit || 0}%</b></div>
      <div><span class="small">К сделке</span><b>${deal.readiness_deal || 0}%</b></div>
      <div><span class="small">Задачи</span><b>${deal.open_tasks_count || 0}</b></div>
    </div>
    <p><b>Следующий шаг:</b><br>${esc(deal.next_action || 'Проверить карточку')}</p>
    <div style="margin-bottom:12px">
      ${deal.has_children ? '<span class="pill red">дети</span> ' : ''}
      ${deal.lawyer_needed ? '<span class="pill yellow">юрист</span> ' : ''}
      ${deal.broker_needed ? '<span class="pill blue">брокер</span> ' : ''}
      ${!deal.expenses_agreed ? '<span class="pill yellow">расходы</span> ' : ''}
      ${!deal.settlements_agreed ? '<span class="pill yellow">расчеты</span> ' : ''}
      <span class="pill">${statusText(deal.status)}</span>
    </div>
    <div class="actions" style="margin-top:8px"><a class="btn primary" href="${href}">Открыть карточку</a></div>
  </article>`;
}

function render() {
  const items = allDeals.filter(filterDeal);
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Сделки v2</h1><p>Здесь отображаются все доступные сделки. У каждой карточки свой ID, дата создания и отдельная кнопка открытия.</p></section>
    ${renderKpi()}
    <section class="card">
      <div class="section-title"><div><h2>Все сделки</h2><p class="muted">${esc(profile?.full_name || 'Пользователь')} / ${esc(profile?.role || 'роль не определена')}</p></div><a class="btn primary" href="./spn-v2.html">Новая сделка</a></div>
      <div class="filters"><input id="dealSearch" placeholder="Поиск по адресу, действию или ID" value="${esc(searchQuery)}"><select id="dealFilter"><option value="all">Все сделки</option><option value="attention">На контроле</option><option value="lawyer">Юристу</option><option value="broker">Брокеру</option><option value="deposit">Готовы к задатку 80%+</option><option value="deal">Готовы к сделке 80%+</option></select><button id="reloadDeals" class="btn light" type="button">Обновить</button></div>
      <div class="status ok">Показано сделок: ${items.length} из ${allDeals.length}</div>
      <div class="deal-list">${items.map(renderDealCard).join('') || '<div class="empty">Сделки не найдены. Создайте первую сделку через мастер.</div>'}</div>
    </section>
  </main>`;
  document.getElementById('dealFilter').value = currentFilter;
  document.getElementById('dealFilter').onchange = (event) => { currentFilter = event.target.value; render(); };
  document.getElementById('dealSearch').oninput = (event) => { searchQuery = event.target.value; render(); };
  document.getElementById('reloadDeals').onclick = loadDeals;
}

async function loadDeals() {
  document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю сделки...</div></main>';
  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 80 });
    profile = data.profile;
    allDeals = data.items || [];
    render();
  } catch (error) {
    document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error">Ошибка загрузки: ${esc(error.message)}</div></main>`;
  }
}

async function init() {
  setupTop('deals');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  await loadDeals();
}

init();