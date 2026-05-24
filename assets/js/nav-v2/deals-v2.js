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

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true
    || deal?.wizard_snapshot?.demo === true
    || String(deal?.title || '').startsWith('ДЕМО:');
}

function demoBadge(deal) {
  return isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span> ' : '';
}

function needsAttention(deal) {
  return deal.risk_level === 'red'
    || deal.has_children
    || !deal.expenses_agreed
    || !deal.settlements_agreed
    || Number(deal.red_risks_count || 0) > 0;
}

function needsLawyerQueue(deal) {
  if (!deal.lawyer_needed) return false;
  return deal.status === 'need_lawyer'
    || deal.status === 'need_documents'
    || deal.has_children
    || deal.risk_level === 'red'
    || Number(deal.red_risks_count || 0) > 0;
}

function needsBrokerQueue(deal) {
  if (!deal.broker_needed) return false;
  return deal.status === 'need_broker'
    || deal.status === 'need_documents'
    || Number(deal.open_tasks_count || 0) > 0;
}

function queueBadges(deal) {
  return `${needsLawyerQueue(deal) ? '<span class="pill yellow">юристу</span> ' : ''}${needsBrokerQueue(deal) ? '<span class="pill blue">брокеру</span> ' : ''}`;
}

function filterDeal(deal) {
  if (currentFilter === 'attention' && !needsAttention(deal)) return false;
  if (currentFilter === 'lawyer' && !needsLawyerQueue(deal)) return false;
  if (currentFilter === 'broker' && !needsBrokerQueue(deal)) return false;
  if (currentFilter === 'demo' && !isDemoDeal(deal)) return false;
  if (currentFilter === 'real' && isDemoDeal(deal)) return false;
  if (currentFilter === 'deposit' && Number(deal.readiness_deposit || 0) < 80) return false;
  if (currentFilter === 'deal' && Number(deal.readiness_deal || 0) < 80) return false;
  if (searchQuery.trim()) {
    const text = [deal.id, deal.title, deal.address, deal.object_type, deal.next_action, statusText(deal.status), isDemoDeal(deal) ? 'демо demo' : 'рабочая реальная'].join(' ').toLowerCase();
    return text.includes(searchQuery.trim().toLowerCase());
  }
  return true;
}

function renderKpi() {
  const attention = allDeals.filter(needsAttention).length;
  const lawyer = allDeals.filter(needsLawyerQueue).length;
  const broker = allDeals.filter(needsBrokerQueue).length;
  const demo = allDeals.filter(isDemoDeal).length;
  const real = allDeals.length - demo;
  return `<div class="kpi-row">
    <div class="metric"><span>Всего</span><b>${allDeals.length}</b></div>
    <div class="metric red"><span>На контроле</span><b>${attention}</b></div>
    <div class="metric yellow"><span>Юристу</span><b>${lawyer}</b></div>
    <div class="metric"><span>Брокеру</span><b>${broker}</b></div>
    <div class="metric"><span>Демо</span><b>${demo}</b></div>
    <div class="metric"><span>Рабочие</span><b>${real}</b></div>
  </div>`;
}

function renderDealCard(deal, index) {
  const href = './deal-card-v2.html?id=' + encodeURIComponent(deal.id);
  return `<article class="deal-card ${isDemoDeal(deal) ? 'demo-card' : ''}">
    <div class="deal-head">
      <div>
        <div class="small">№ ${index + 1} · ID ${shortId(deal.id)} · создана ${formatDate(deal.created_at)}</div>
        <div class="deal-title">${demoBadge(deal)}${esc(deal.title)}</div>
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
      ${demoBadge(deal)}
      ${deal.has_children ? '<span class="pill red">дети</span> ' : ''}
      ${queueBadges(deal)}
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
    <section class="hero"><h1>Сделки v2</h1><p>Здесь отображаются все доступные сделки. Демо-сделки помечены отдельным бейджем и доступны через фильтр.</p></section>
    <div class="status ok">Фильтры «Юристу» и «Брокеру» учитывают статус сделки, стоп-факторы, красные риски и активность по задачам, а не только флаги lawyer_needed / broker_needed.</div>
    ${renderKpi()}
    <section class="card">
      <div class="section-title"><div><h2>Все сделки</h2><p class="muted">${esc(profile?.full_name || 'Пользователь')} / ${esc(profile?.role || 'роль не определена')}</p></div><a class="btn primary" href="./spn-v2.html">Новая сделка</a></div>
      <div class="filters"><input id="dealSearch" placeholder="Поиск по адресу, действию, статусу, ДЕМО или ID" value="${esc(searchQuery)}"><select id="dealFilter"><option value="all">Все сделки</option><option value="real">Только рабочие</option><option value="demo">Только демо</option><option value="attention">На контроле</option><option value="lawyer">Юристу</option><option value="broker">Брокеру</option><option value="deposit">Готовы к задатку 80%+</option><option value="deal">Готовы к сделке 80%+</option></select><button id="reloadDeals" class="btn light" type="button">Обновить</button></div>
      <div class="status">Показано сделок: ${items.length} из ${allDeals.length}</div>
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
