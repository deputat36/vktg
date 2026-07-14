import { setupTop, getCachedUser, renderAuthBox, rpc, esc, riskPill, saveCachedProfile, statusText } from './supabase-v2.js';
import {
  buildDealsWorkspace,
  dealMatchesWorkMode,
  hasMissingResponsibility,
  isOverdueDeal,
  needsWorkAttention
} from './deals-work-modes-v2.js?v=20260714-01';

let allDeals = [];
let profile = null;
let loadInProgress = false;
let loadError = '';
const allowedFilters = new Set([
  'work', 'all', 'real', 'demo', 'attention', 'overdue', 'unassigned',
  'lawyer', 'broker', 'deposit', 'deal', 'docs', 'red', 'rework'
]);
const urlParams = new URLSearchParams(location.search);
const DEALS_LOADED_EVENT = 'nav-v2:deals-loaded';
let currentFilter = allowedFilters.has(urlParams.get('filter')) ? urlParams.get('filter') : 'work';
let searchQuery = urlParams.get('q') || '';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

function shortId(id) {
  return String(id || '').slice(0, 8).toUpperCase();
}

function roleName(role) {
  return ({ owner:'Владелец', admin:'Администратор', manager:'Менеджер', spn:'СПН', lawyer:'Юрист', broker:'Брокер', viewer:'Наблюдатель' })[role] || role || '—';
}

function objectTypeName(type) {
  return ({
    flat_mkd: 'Квартира в МКД',
    flat_ground: 'Квартира на земле',
    room: 'Комната',
    share: 'Доля',
    share_room: 'Доля / комната',
    house_land: 'Дом с участком',
    house: 'Дом',
    land: 'Земельный участок',
    new_building: 'Новостройка',
    commercial: 'Коммерция'
  })[type] || 'Объект';
}

function clean(value) {
  return String(value || '').trim();
}

function isGenericTitle(title) {
  const text = clean(title).toLowerCase();
  return !text
    || text.includes('продавец не указан')
    || text.includes('покупатель не указан')
    || text.includes('адрес не указан');
}

function dealDisplayTitle(deal) {
  const rawTitle = clean(deal?.display_title || deal?.title);
  if (!isGenericTitle(rawTitle)) return rawTitle;
  const object = objectTypeName(deal?.object_type);
  const address = clean(deal?.address);
  if (address) return `${object} — ${address}`;
  return `${object} — адрес уточняется`;
}

function dealPartiesText(deal) {
  const sellerName = clean(deal?.seller_name);
  const buyerName = clean(deal?.buyer_name);
  const sellerSpn = clean(deal?.seller_spn);
  const buyerSpn = clean(deal?.buyer_spn);
  const manager = clean(deal?.manager);
  const parts = [];

  if (sellerName) parts.push(`продавец: ${sellerName}`);
  if (buyerName) parts.push(`покупатель: ${buyerName}`);

  if (!sellerName && !buyerName) {
    if (sellerSpn && buyerSpn && sellerSpn === buyerSpn) parts.push(`СПН: ${sellerSpn}`);
    else {
      if (sellerSpn) parts.push(`СПН продавца: ${sellerSpn}`);
      if (buyerSpn) parts.push(`СПН покупателя: ${buyerSpn}`);
    }
  }

  if (manager) parts.push(`менеджер: ${manager}`);
  return parts.join(' · ') || 'Стороны и ответственные пока не указаны';
}

function dealResponsibleSearchText(deal) {
  const sellerSpn = clean(deal?.seller_spn);
  const buyerSpn = clean(deal?.buyer_spn);
  const manager = clean(deal?.manager);
  const lawyer = clean(deal?.lawyer);
  const broker = clean(deal?.broker);
  const parts = [];

  if (sellerSpn && buyerSpn && sellerSpn === buyerSpn) parts.push(`СПН: ${sellerSpn}`);
  else {
    if (sellerSpn) parts.push(`СПН продавца: ${sellerSpn}`);
    if (buyerSpn) parts.push(`СПН покупателя: ${buyerSpn}`);
  }
  if (manager) parts.push(`менеджер: ${manager}`);
  if (lawyer) parts.push(`юрист: ${lawyer}`);
  if (broker) parts.push(`брокер: ${broker}`);

  return parts.join(' ');
}

function missingDocs(deal) {
  return Number(deal?.missing_documents_count || 0);
}

function isReworkDeal(deal) {
  return deal?.status === 'need_info';
}

function defaultFilterForRole() {
  if (profile?.role === 'lawyer') return 'lawyer';
  if (profile?.role === 'broker') return 'broker';
  return 'work';
}

function updateUrl() {
  const params = new URLSearchParams();
  if (currentFilter && currentFilter !== defaultFilterForRole()) params.set('filter', currentFilter);
  if (searchQuery.trim()) params.set('q', searchQuery.trim());
  const next = params.toString() ? `${location.pathname}?${params.toString()}` : location.pathname;
  history.replaceState(null, '', next);
}

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true
    || deal?.wizard_snapshot?.demo === true
    || String(deal?.title || '').startsWith('ДЕМО:');
}

function demoBadge(deal) {
  return isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span> ' : '';
}

function needsLawyerQueue(deal) {
  return dealMatchesWorkMode(deal, 'lawyer');
}

function needsBrokerQueue(deal) {
  return dealMatchesWorkMode(deal, 'broker');
}

function queueBadges(deal) {
  const badges = [];
  if (needsLawyerQueue(deal)) badges.push('<span class="pill yellow">юристу</span>');
  if (needsBrokerQueue(deal)) badges.push('<span class="pill blue">брокеру</span>');
  return badges.join(' ') + (badges.length ? ' ' : '');
}

function applyDefaultFilterByRole() {
  if (!urlParams.get('filter')) currentFilter = defaultFilterForRole();
}

function publishDealsLoaded() {
  const detail = {
    profile,
    items: Array.isArray(allDeals) ? allDeals.slice() : [],
    filter: currentFilter,
    query: searchQuery
  };
  window.navV2Deals = detail;
  window.dispatchEvent(new CustomEvent(DEALS_LOADED_EVENT, { detail }));
}

function filterDeal(deal) {
  if (!['all', 'real', 'demo'].includes(currentFilter) && !dealMatchesWorkMode(deal, currentFilter)) return false;
  if (currentFilter === 'demo' && !isDemoDeal(deal)) return false;
  if (currentFilter === 'real' && isDemoDeal(deal)) return false;

  if (searchQuery.trim()) {
    const text = [
      deal?.id,
      deal?.title,
      dealDisplayTitle(deal),
      dealPartiesText(deal),
      dealResponsibleSearchText(deal),
      deal?.address,
      objectTypeName(deal?.object_type),
      deal?.next_action,
      statusText(deal?.status),
      isDemoDeal(deal) ? 'демо demo' : 'рабочая реальная',
      isReworkDeal(deal) ? 'доработка need_info нужно дозаполнить' : '',
      isOverdueDeal(deal) ? 'просрочено просроченные задачи' : '',
      hasMissingResponsibility(deal) ? 'без ответственного не назначен' : ''
    ].join(' ').toLocaleLowerCase('ru-RU');
    return text.includes(searchQuery.trim().toLocaleLowerCase('ru-RU'));
  }

  return true;
}

function renderKpi(workspace) {
  const counts = workspace.counts || {};

  if (profile?.role === 'lawyer') {
    return `<div class="kpi-row">
      <div class="metric yellow"><span>Юридическая очередь</span><b>${counts.lawyer || 0}</b></div>
      <div class="metric red"><span>Красные риски</span><b>${counts.red || 0}</b></div>
      <div class="metric red"><span>Просроченные сделки</span><b>${counts.overdue || 0}</b></div>
      <div class="metric yellow"><span>Не хватает документов</span><b>${counts.docs || 0}</b></div>
      <div class="metric"><span>Рабочие сделки</span><b>${workspace.workingDealCount}</b></div>
    </div>`;
  }

  if (profile?.role === 'spn') {
    return `<div class="kpi-row">
      <div class="metric"><span>Мои рабочие сделки</span><b>${workspace.workingDealCount}</b></div>
      <div class="metric red"><span>Требуют внимания</span><b>${counts.attention || 0}</b></div>
      <div class="metric red"><span>Просроченные</span><b>${counts.overdue || 0}</b></div>
      <div class="metric yellow"><span>Документы</span><b>${counts.docs || 0}</b></div>
      <div class="metric green"><span>Готовы к задатку</span><b>${counts.deposit || 0}</b></div>
    </div>`;
  }

  return `<div class="kpi-row">
    <div class="metric"><span>Рабочие сделки</span><b>${workspace.workingDealCount}</b></div>
    <div class="metric red"><span>Требуют внимания</span><b>${counts.attention || 0}</b></div>
    <div class="metric red"><span>Просроченные</span><b>${counts.overdue || 0}</b></div>
    <div class="metric yellow"><span>Без ответственного</span><b>${counts.unassigned || 0}</b></div>
    <div class="metric green"><span>Готовы к задатку</span><b>${counts.deposit || 0}</b></div>
  </div>`;
}

function statusBadges(deal) {
  const badges = [];
  if (isDemoDeal(deal)) badges.push(demoBadge(deal).trim());
  if (isReworkDeal(deal)) badges.push('<span class="pill yellow">доработка СПН</span>');
  if (isOverdueDeal(deal)) badges.push(`<span class="pill red">просрочено: ${Number(deal?.overdue_tasks_count || 0)}</span>`);
  if (hasMissingResponsibility(deal)) badges.push('<span class="pill yellow">нет ответственного</span>');
  if (deal?.has_children) badges.push('<span class="pill red">дети</span>');
  if (missingDocs(deal)) badges.push(`<span class="pill yellow">документы: ${missingDocs(deal)}</span>`);
  if (queueBadges(deal).trim()) badges.push(queueBadges(deal).trim());
  if (!deal?.expenses_agreed) badges.push('<span class="pill yellow">расходы</span>');
  if (!deal?.settlements_agreed) badges.push('<span class="pill yellow">расчеты</span>');
  badges.push(`<span class="pill">${statusText(deal?.status)}</span>`);
  return badges.join(' ');
}

function renderDealCard(deal, index) {
  const href = './deal-card-v2.html?id=' + encodeURIComponent(deal?.id || '') + (profile?.role === 'lawyer' ? '#risks' : '');
  const title = esc(dealDisplayTitle(deal));
  const parties = esc(dealPartiesText(deal));
  const overdue = Number(deal?.overdue_tasks_count || 0);
  const redRisks = Number(deal?.red_risks_count || 0);
  const meta = profile?.role === 'lawyer'
    ? `<div><span class="small">Красные риски</span><b>${redRisks}</b></div>
       <div><span class="small">Просрочено</span><b>${overdue}</b></div>
       <div><span class="small">Документы</span><b>${missingDocs(deal)}</b></div>`
    : `<div><span class="small">К задатку</span><b>${deal?.readiness_deposit || 0}%</b></div>
       <div><span class="small">Просрочено</span><b>${overdue}</b></div>
       <div><span class="small">Документы</span><b>${missingDocs(deal)}</b></div>`;
  const reworkNotice = isReworkDeal(deal)
    ? '<div class="status warn" style="margin:10px 0">Нужно дозаполнить: СПН должен исправить карточку и отправить на повторную проверку.</div>'
    : '';
  const cardClass = `deal-card deals-work-card ${isDemoDeal(deal) ? 'demo-card' : ''}`.trim();
  const cardStyle = isReworkDeal(deal) ? 'border-color:rgba(245,158,11,.55);background:#fffdf7' : '';
  const styleAttr = cardStyle ? ` style="${cardStyle}"` : '';

  return `<article class="${cardClass}"${styleAttr}>
    <div class="deal-head">
      <div>
        <div class="small">№ ${index + 1} · ID ${shortId(deal?.id)} · ${formatDate(deal?.created_at)}</div>
        <div class="deal-title">${demoBadge(deal)}${title}</div>
        <div class="small deals-work-parties">${parties}</div>
      </div>
      ${riskPill(deal?.risk_level)}
    </div>
    ${reworkNotice}
    <div class="deal-meta">${meta}</div>
    <div class="deals-work-next"><span>Следующий шаг</span><b>${esc(deal?.next_action || 'Открыть карточку и определить ближайшее действие')}</b></div>
    <div class="deals-work-badges">${statusBadges(deal)}</div>
    <div class="actions deals-work-actions"><a class="btn primary" href="${href}">${profile?.role === 'lawyer' ? 'Проверить сделку' : 'Продолжить работу'}</a></div>
  </article>`;
}

function safeRenderDealCard(deal, index) {
  try {
    return renderDealCard(deal, index);
  } catch (error) {
    return `<article class="deal-card"><div class="status error">Не удалось отрисовать сделку ${esc(shortId(deal?.id))}: ${esc(error.message)}</div></article>`;
  }
}

function filterOptions() {
  if (profile?.role === 'lawyer') {
    return `<option value="lawyer">Юридическая очередь</option>
      <option value="overdue">Просроченные сделки</option>
      <option value="red">Красные риски</option>
      <option value="docs">Не хватает документов</option>
      <option value="rework">На доработке у СПН</option>
      <option value="work">Все рабочие без повторов</option>
      <option value="all">Все исходные записи</option>
      <option value="demo">Только демо</option>`;
  }

  if (profile?.role === 'spn') {
    return `<option value="work">Рабочие без повторов</option>
      <option value="attention">Требуют внимания</option>
      <option value="overdue">Просроченные</option>
      <option value="docs">Не хватает документов</option>
      <option value="lawyer">Нужен юрист</option>
      <option value="broker">Нужен брокер</option>
      <option value="deposit">Готовы к задатку 80%+</option>
      <option value="deal">Готовы к сделке 80%+</option>
      <option value="rework">Вернули на доработку</option>
      <option value="all">Все исходные записи</option>
      <option value="real">Рабочие, включая повторы</option>
      <option value="demo">Только демо</option>`;
  }

  return `<option value="work">Рабочие без демо и повторов</option>
    <option value="attention">Требуют внимания</option>
    <option value="overdue">Просроченные</option>
    <option value="unassigned">Без ответственного</option>
    <option value="rework">На доработке у СПН</option>
    <option value="lawyer">Юристу</option>
    <option value="broker">Брокеру</option>
    <option value="deposit">Готовы к задатку 80%+</option>
    <option value="deal">Готовы к сделке 80%+</option>
    <option value="docs">Не хватает документов</option>
    <option value="red">Красные риски</option>
    <option value="all">Все исходные записи</option>
    <option value="real">Рабочие, включая повторы</option>
    <option value="demo">Только демо</option>`;
}

function renderQuickModes(workspace) {
  return `<div class="deals-quick-modes" role="group" aria-label="Быстрые режимы списка">
    ${(workspace.quickModes || []).map((mode) => `<button type="button" class="deals-quick-mode ${currentFilter === mode.key ? 'active' : ''}" data-deals-filter="${esc(mode.key)}" aria-pressed="${currentFilter === mode.key ? 'true' : 'false'}"><span>${esc(mode.label)}</span><b>${mode.count}</b></button>`).join('')}
  </div>`;
}

function emptyState() {
  const canCreate = ['owner','admin','manager','spn'].includes(profile?.role);
  const isFiltered = currentFilter !== defaultFilterForRole() || searchQuery.trim();
  return `<div class="empty">
    <b>Сделки не найдены.</b><br>
    ${isFiltered ? 'Сбросьте фильтр или измените поисковый запрос.' : 'Создайте первую сделку из мастера.'}
    <div class="actions" style="justify-content:center;margin-top:14px">
      ${isFiltered ? '<button id="resetDealsFilter" class="btn light" type="button">Вернуться к рабочему списку</button>' : ''}
      ${canCreate ? '<a class="btn primary" href="./spn-v2.html">Новая сделка</a>' : ''}
    </div>
  </div>`;
}

function sourceDealsForFilter(workspace) {
  if (['all', 'real', 'demo'].includes(currentFilter)) return allDeals;
  return workspace.canonicalDeals;
}

function listSummary(workspace, shown) {
  const sourceTotal = ['all', 'real', 'demo'].includes(currentFilter) ? allDeals.length : workspace.workingDealCount;
  const hidden = [];
  if (workspace.hiddenDemoCount) hidden.push(`демо: ${workspace.hiddenDemoCount}`);
  if (workspace.hiddenDuplicateCount) hidden.push(`точных повторов: ${workspace.hiddenDuplicateCount}`);
  const hiddenText = hidden.length ? ` В рабочем режиме скрыто: ${hidden.join(', ')}.` : '';
  return `Показано: ${shown} из ${sourceTotal}.${hiddenText}`;
}

function render() {
  const root = document.getElementById('app');
  try {
    const workspace = buildDealsWorkspace(allDeals, profile?.role);
    const sourceDeals = sourceDealsForFilter(workspace);
    const items = sourceDeals.filter(filterDeal);
    const overdueCount = workspace.counts?.overdue || 0;
    const heroTitle = profile?.role === 'lawyer' ? 'Юридическая очередь' : profile?.role === 'spn' ? 'Мои сделки' : 'Рабочие сделки';
    const heroText = profile?.role === 'lawyer'
      ? 'Сначала откройте просроченные сделки и стоп-факторы. Демо и точные повторы не мешают рабочей очереди.'
      : profile?.role === 'spn'
        ? 'Выберите один режим и доведите ближайшее действие до результата: снять просрочку, собрать документ или приблизить задаток.'
        : 'Быстрые режимы показывают, где требуется решение сегодня. Полный исходный список доступен в расширенном фильтре.';
    const topStatusClass = overdueCount ? 'warn' : 'ok';
    const topStatusText = overdueCount
      ? `Просроченные задачи есть в ${overdueCount} рабочих сделках. Начните с режима «Просрочено».`
      : 'Просроченных задач в рабочем наборе нет. Проверьте сделки без ответственного и готовые к задатку.';
    const newDealButton = ['owner','admin','manager','spn'].includes(profile?.role)
      ? '<a class="btn primary" href="./spn-v2.html">Новая сделка</a>'
      : '';
    const cardsHtml = items.map(safeRenderDealCard).join('') || emptyState();
    const reloadState = loadInProgress ? 'disabled aria-busy="true"' : '';
    const reloadText = loadInProgress ? 'Обновляю...' : 'Обновить';
    const refreshStatus = loadError
      ? `<div class="status error" role="alert">Не удалось обновить список. Ранее загруженные сделки сохранены. ${esc(loadError)} <button id="retryDeals" class="btn light" type="button">Повторить</button></div>`
      : (loadInProgress ? '<div class="status" role="status" aria-live="polite">Обновляю данные, список остаётся доступным.</div>' : '');

    root.innerHTML = `<main class="nav-v2-shell">
      <section class="hero"><h1>${heroTitle}</h1><p>${heroText}</p></section>
      <div class="status ${topStatusClass}">${esc(topStatusText)}</div>
      ${renderKpi(workspace)}
      <section class="card deals-workspace">
        <div class="section-title"><div><h2>${profile?.role === 'lawyer' ? 'Что проверить сейчас' : 'Сделки для работы'}</h2><p class="muted">${esc(profile?.full_name || 'Пользователь')} · ${esc(roleName(profile?.role))}</p></div>${newDealButton}</div>
        ${renderQuickModes(workspace)}
        <details class="deals-advanced-filters" ${['all', 'real', 'demo', 'deal', 'rework'].includes(currentFilter) || searchQuery.trim() ? 'open' : ''}>
          <summary>Поиск и расширенные фильтры</summary>
          <div class="filters"><input id="dealSearch" placeholder="Адрес, объект, клиент, СПН, статус или ID" value="${esc(searchQuery)}"><select id="dealFilter">${filterOptions()}</select><button id="reloadDeals" class="btn light" type="button" ${reloadState}>${reloadText}</button></div>
        </details>
        ${refreshStatus}
        <div class="deals-work-summary">${esc(listSummary(workspace, items.length))}</div>
        <div class="deal-list">${cardsHtml}</div>
      </section>
    </main>`;

    const filter = document.getElementById('dealFilter');
    const search = document.getElementById('dealSearch');
    const reload = document.getElementById('reloadDeals');
    const retry = document.getElementById('retryDeals');
    const reset = document.getElementById('resetDealsFilter');
    if (filter) {
      filter.value = currentFilter;
      filter.onchange = (event) => { currentFilter = event.target.value; updateUrl(); render(); };
    }
    document.querySelectorAll('[data-deals-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        currentFilter = button.dataset.dealsFilter || defaultFilterForRole();
        updateUrl();
        render();
      });
    });
    if (search) search.oninput = (event) => { searchQuery = event.target.value; updateUrl(); render(); };
    if (reload) reload.onclick = () => loadDeals({ preserveContent: true });
    if (retry) retry.onclick = () => loadDeals({ preserveContent: true });
    if (reset) reset.onclick = () => { currentFilter = defaultFilterForRole(); searchQuery = ''; updateUrl(); render(); };
  } catch (error) {
    root.innerHTML = `<main class="nav-v2-shell"><div class="status error">Ошибка отображения списка: ${esc(error.message)}</div><button id="reloadDeals" class="btn light" type="button">Обновить</button></main>`;
    document.getElementById('reloadDeals')?.addEventListener('click', () => loadDeals({ preserveContent: Boolean(profile) }));
  }
}

function isAuthLoadError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return text.includes('сначала войдите')
    || text.includes('ошибка supabase 400')
    || text.includes('ошибка supabase 401')
    || text.includes('jwt expired')
    || text.includes('unauthorized')
    || text.includes('refresh');
}

function renderLoginAfterLoadError() {
  const root = document.getElementById('app');
  root.innerHTML = '<main class="nav-v2-shell"><div id="dealsAuthHost"></div></main>';
  const host = document.getElementById('dealsAuthHost');
  renderAuthBox(host, async () => location.reload());
  const status = document.getElementById('authStatus');
  if (status) {
    status.className = 'status warn';
    status.textContent = 'Сессия истекла или была повреждена. Войдите снова.';
  }
}

async function loadDeals({ preserveContent = false } = {}) {
  if (loadInProgress) return;

  const keepCurrentList = preserveContent && Boolean(profile);
  loadInProgress = true;
  loadError = '';

  if (keepCurrentList) render();
  else document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status" role="status" aria-live="polite">Загружаю сделки...</div></main>';

  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 80 });
    profile = data.profile;
    saveCachedProfile(profile);
    allDeals = data.items || [];
    applyDefaultFilterByRole();
    loadInProgress = false;
    loadError = '';
    render();
    publishDealsLoaded();
  } catch (error) {
    loadInProgress = false;
    if (isAuthLoadError(error)) {
      renderLoginAfterLoadError();
      return;
    }
    if (keepCurrentList) {
      loadError = error?.message || 'Сервис временно недоступен.';
      render();
      return;
    }
    document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error" role="alert">Ошибка загрузки: ${esc(error.message)}</div><button id="reloadDeals" class="btn light" type="button">Повторить</button></main>`;
    document.getElementById('reloadDeals')?.addEventListener('click', () => loadDeals());
  }
}

async function init() {
  setupTop('deals');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  await loadDeals();
}

init();
