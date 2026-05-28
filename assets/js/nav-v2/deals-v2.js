import { setupTop, getCachedUser, renderAuthBox, rpc, esc, riskPill, saveCachedProfile, statusText } from './supabase-v2.js';

let allDeals = [];
let profile = null;
const allowedFilters = new Set(['all', 'real', 'demo', 'attention', 'lawyer', 'broker', 'deposit', 'deal', 'docs', 'red']);
const urlParams = new URLSearchParams(location.search);
let currentFilter = allowedFilters.has(urlParams.get('filter')) ? urlParams.get('filter') : 'all';
let searchQuery = urlParams.get('q') || '';

function formatDate(value) { if (!value) return '—'; return new Date(value).toLocaleString('ru-RU'); }
function shortId(id) { return String(id || '').slice(0, 8).toUpperCase(); }
function roleName(role) { return ({ owner:'Владелец', admin:'Админ', manager:'Менеджер', spn:'СПН', lawyer:'Юрист', broker:'Брокер', viewer:'Наблюдатель' })[role] || role || '—'; }
function missingDocs(deal) { return Number(deal.missing_documents_count || 0); }

function updateUrl() {
  const params = new URLSearchParams();
  if (currentFilter && currentFilter !== 'all') params.set('filter', currentFilter);
  if (searchQuery.trim()) params.set('q', searchQuery.trim());
  const next = params.toString() ? `${location.pathname}?${params.toString()}` : location.pathname;
  history.replaceState(null, '', next);
}

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true || deal?.wizard_snapshot?.demo === true || String(deal?.title || '').startsWith('ДЕМО:');
}
function demoBadge(deal) { return isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span> ' : ''; }

function needsAttention(deal) {
  return deal.risk_level === 'red' || deal.has_children || !deal.expenses_agreed || !deal.settlements_agreed || Number(deal.red_risks_count || 0) > 0;
}
function needsLawyerQueue(deal) {
  if (!deal.lawyer_needed) return false;
  return deal.status === 'need_lawyer' || deal.status === 'need_documents' || deal.has_children || deal.risk_level === 'red' || Number(deal.red_risks_count || 0) > 0 || missingDocs(deal) > 0;
}
function needsBrokerQueue(deal) {
  if (!deal.broker_needed) return false;
  return deal.status === 'need_broker' || deal.status === 'need_documents' || Number(deal.open_tasks_count || 0) > 0;
}
function queueBadges(deal) {
  return `${needsLawyerQueue(deal) ? '<span class="pill yellow">юристу</span> ' : ''}${needsBrokerQueue(deal) ? '<span class="pill blue">брокеру</span> ' : ''}`;
}

function applyDefaultFilterByRole() {
  if (!urlParams.get('filter') && profile?.role === 'lawyer') currentFilter = 'lawyer';
  if (!urlParams.get('filter') && profile?.role === 'broker') currentFilter = 'broker';
}

function filterDeal(deal) {
  if (currentFilter === 'attention' && !needsAttention(deal)) return false;
  if (currentFilter === 'lawyer' && !needsLawyerQueue(deal)) return false;
  if (currentFilter === 'broker' && !needsBrokerQueue(deal)) return false;
  if (currentFilter === 'docs' && missingDocs(deal) <= 0) return false;
  if (currentFilter === 'red' && deal.risk_level !== 'red' && Number(deal.red_risks_count || 0) <= 0) return false;
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
  const docs = allDeals.filter(d => missingDocs(d) > 0).length;
  const red = allDeals.filter(d => d.risk_level === 'red' || Number(d.red_risks_count || 0) > 0).length;
  const demo = allDeals.filter(isDemoDeal).length;
  const real = allDeals.length - demo;
  if (profile?.role === 'lawyer') {
    return `<div class="kpi-row"><div class="metric yellow"><span>Юридическая очередь</span><b>${lawyer}</b></div><div class="metric red"><span>Красные риски</span><b>${red}</b></div><div class="metric yellow"><span>Не хватает документов</span><b>${docs}</b></div><div class="metric"><span>Всего доступно</span><b>${allDeals.length}</b></div></div>`;
  }
  return `<div class="kpi-row"><div class="metric"><span>Всего</span><b>${allDeals.length}</b></div><div class="metric red"><span>На контроле</span><b>${attention}</b></div><div class="metric yellow"><span>Юристу</span><b>${lawyer}</b></div><div class="metric"><span>Брокеру</span><b>${broker}</b></div><div class="metric"><span>Демо</span><b>${demo}</b></div><div class="metric"><span>Рабочие</span><b>${real}</b></div></div>`;
}

function renderDealCard(deal, index) {
  const href = './deal-card-v2.html?id=' + encodeURIComponent(deal.id) + (profile?.role === 'lawyer' ? '#risks' : '');
  const lawyerMeta = profile?.role === 'lawyer' ? `<div><span class="small">Документы</span><b>${missingDocs(deal)}</b></div>` : `<div><span class="small">К сделке</span><b>${deal.readiness_deal || 0}%</b></div>`;
  return `<article class="deal-card ${isDemoDeal(deal) ? 'demo-card' : ''}">
    <div class="deal-head"><div><div class="small">№ ${index + 1} · ID ${shortId(deal.id)} · создана ${formatDate(deal.created_at)}</div><div class="deal-title">${demoBadge(deal)}${esc(deal.title)}</div><div class="small">${esc(deal.address || 'Адрес не указан')}</div></div>${riskPill(deal.risk_level)}</div>
    <div class="deal-meta"><div><span class="small">К задатку</span><b>${deal.readiness_deposit || 0}%</b></div>${lawyerMeta}<div><span class="small">Задачи</span><b>${deal.open_tasks_count || 0}</b></div></div>
    <p><b>${profile?.role === 'lawyer' ? 'Юридический фокус' : 'Следующий шаг'}:</b><br>${esc(deal.next_action || 'Проверить карточку')}</p>
    <div style="margin-bottom:12px">${demoBadge(deal)}${deal.has_children ? '<span class="pill red">дети</span> ' : ''}${missingDocs(deal) ? `<span class="pill yellow">документы: ${missingDocs(deal)}</span> ` : ''}${queueBadges(deal)}${!deal.expenses_agreed ? '<span class="pill yellow">расходы</span> ' : ''}${!deal.settlements_agreed ? '<span class="pill yellow">расчеты</span> ' : ''}<span class="pill">${statusText(deal.status)}</span></div>
    <div class="actions" style="margin-top:8px"><a class="btn primary" href="${href}">${profile?.role === 'lawyer' ? 'Проверить риски' : 'Открыть карточку'}</a></div>
  </article>`;
}

function filterOptions() {
  if (profile?.role === 'lawyer') {
    return `<option value="lawyer">Юридическая очередь</option><option value="red">Красные риски</option><option value="docs">Не хватает документов</option><option value="attention">На контроле</option><option value="all">Все доступные</option><option value="real">Только рабочие</option><option value="demo">Только демо</option>`;
  }
  return `<option value="all">Все сделки</option><option value="real">Только рабочие</option><option value="demo">Только демо</option><option value="attention">На контроле</option><option value="lawyer">Юристу</option><option value="broker">Брокеру</option><option value="deposit">Готовы к задатку 80%+</option><option value="deal">Готовы к сделке 80%+</option>`;
}

function render() {
  const items = allDeals.filter(filterDeal);
  const heroTitle = profile?.role === 'lawyer' ? 'Юридическая очередь' : 'Сделки v2';
  const heroText = profile?.role === 'lawyer'
    ? 'Сделки, где нужно проверить юридические риски, документы, детей, обременения, расчеты и готовность к задатку.'
    : 'Здесь отображаются все доступные сделки. Демо-сделки помечены отдельным бейджем и доступны через фильтр.';
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>${heroTitle}</h1><p>${heroText}</p></section>
    <div class="status ok">${profile?.role === 'lawyer' ? 'Профиль юриста: основной фокус — риски, документы, юридические стоп-факторы и комментарии по сделке.' : 'Фильтры «Юристу» и «Брокеру» учитывают статус сделки, стоп-факторы, красные риски и активность по задачам.'}</div>
    ${renderKpi()}
    <section class="card">
      <div class="section-title"><div><h2>${profile?.role === 'lawyer' ? 'Сделки на юридическую проверку' : 'Все сделки'}</h2><p class="muted">${esc(profile?.full_name || 'Пользователь')} / ${esc(roleName(profile?.role))}</p></div>${['owner','admin','manager','spn'].includes(profile?.role) ? '<a class="btn primary" href="./spn-v2.html">Новая сделка</a>' : ''}</div>
      <div class="filters"><input id="dealSearch" placeholder="Поиск по адресу, действию, статусу, ДЕМО или ID" value="${esc(searchQuery)}"><select id="dealFilter">${filterOptions()}</select><button id="reloadDeals" class="btn light" type="button">Обновить</button></div>
      <div class="status">Показано сделок: ${items.length} из ${allDeals.length}</div>
      <div class="deal-list">${items.map(renderDealCard).join('') || '<div class="empty">Сделки не найдены.</div>'}</div>
    </section>
  </main>`;
  document.getElementById('dealFilter').value = currentFilter;
  document.getElementById('dealFilter').onchange = (event) => { currentFilter = event.target.value; updateUrl(); render(); };
  document.getElementById('dealSearch').oninput = (event) => { searchQuery = event.target.value; updateUrl(); render(); };
  document.getElementById('reloadDeals').onclick = loadDeals;
}

async function loadDeals() {
  document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю сделки...</div></main>';
  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 80 });
    profile = data.profile;
    saveCachedProfile(profile);
    allDeals = data.items || [];
    applyDefaultFilterByRole();
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