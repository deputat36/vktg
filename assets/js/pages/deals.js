import '../integrations/appNav.js';
import { getCurrentUser, signInWithPassword, signOut } from '../integrations/supabase.js';
import { getMyProfile, listAccessibleDeals, listProfiles, listDealTasksAndReviews, updateDealStatus, ROLE_LABELS, STATUS_LABELS, roleDescription } from '../integrations/crmApi.js';

let state = {
  user: null,
  profile: null,
  profiles: [],
  deals: [],
  taskMap: new Map(),
  reviewMap: new Map(),
  search: '',
  status: '',
  risk: '',
  workZone: 'auto',
  queue: 'auto'
};

function get(id) { return document.getElementById(id); }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function fmtDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function fmtDay(value) { return value ? new Date(value).toLocaleDateString('ru-RU') : '—'; }
function todayYmd() { return new Date().toISOString().slice(0, 10); }
function profileName(id) {
  if (!id) return '—';
  const p = state.profiles.find((item) => item.id === id);
  return p ? p.full_name : id.slice(0, 8);
}
function loadQueueCss() {
  if (document.querySelector('link[href="./assets/css/deal-queues.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/deal-queues.css';
  document.head.appendChild(link);
}
function isMortgageDeal(deal) {
  const d = deal.deal_json || {};
  const payments = d.payments || [];
  const certificates = d.certificates || [];
  const settlements = d.settlements || [];
  return Boolean(deal.broker_needed || payments.includes('mortgage') || payments.includes('nis') || certificates.length || settlements.includes('safe') || settlements.includes('pensionFund') || String(d.bankType || '').toLowerCase().includes('сбер') || String(d.bankType || '').toLowerCase().includes('банк'));
}
function needsLawyer(deal) {
  const d = deal.deal_json || {};
  const flags = d.flags || [];
  const payments = d.payments || [];
  const certificates = d.certificates || [];
  const basis = d.basis || [];
  return Boolean(deal.lawyer_needed || (deal.analysis_json?.stop || []).length || flags.length || certificates.length || payments.includes('matcap') || payments.includes('nominalChild') || payments.includes('svoChildAccount') || basis.includes('inheritLaw') || basis.includes('inheritWill') || basis.includes('privat') || basis.includes('court') || String(d.rightForm || '').includes('Доля'));
}
function hasChildren(deal) {
  const d = deal.deal_json || {};
  const flags = d.flags || [];
  const payments = d.payments || [];
  const certificates = d.certificates || [];
  return flags.includes('minorSeller') || flags.includes('minorBuyer') || flags.includes('minorRegistered') || payments.includes('matcap') || payments.includes('nominalChild') || payments.includes('svoChildAccount') || certificates.includes('matcap') || certificates.includes('nominalChild') || certificates.includes('svoChildAccount');
}
function hasStop(deal) {
  return Boolean((deal.analysis_json?.stop || []).length || deal.status === 'cancelled' || String(deal.risk_level || '').toLowerCase().includes('нельзя'));
}
function isMine(deal) {
  const id = state.profile?.id;
  return Boolean(id && (deal.created_by === id || deal.seller_spn_id === id || deal.buyer_spn_id === id));
}
function tasks(deal) { return state.taskMap.get(deal.id) || []; }
function reviews(deal) { return state.reviewMap.get(deal.id) || []; }
function openTaskList(deal) { return tasks(deal).filter((task) => task.status !== 'done' && task.status !== 'cancelled'); }
function openTaskCount(deal) { return openTaskList(deal).length; }
function urgentTaskCount(deal) { return openTaskList(deal).filter((task) => task.priority === 'urgent' || task.priority === 'high').length; }
function overdueTaskCount(deal) { const today = todayYmd(); return openTaskList(deal).filter((task) => task.due_date && task.due_date < today).length; }
function reviewCount(deal) { return reviews(deal).length; }
function lastReview(deal) { return reviews(deal).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null; }
function setStatus(text, type = 'info') {
  const el = get('pageStatus');
  if (!el) return;
  el.className = 'status ' + type;
  el.textContent = text;
}
function applyVisualRole() {
  const role = state.profile?.role || 'spn';
  const zone = state.workZone || defaultZoneForRole(role);
  document.body.dataset.role = role;
  document.body.dataset.zone = zone;
}

async function refreshAuth() {
  state.user = await getCurrentUser();
  if (!state.user) {
    get('authBox').style.display = '';
    get('crmBox').style.display = 'none';
    setStatus('Войдите, чтобы открыть список сделок.', 'warn');
    return;
  }
  get('authBox').style.display = 'none';
  get('crmBox').style.display = '';
  await loadCrm();
}

async function loadCrm() {
  setStatus('Загружаю профиль и сделки...', 'info');
  state.profile = await getMyProfile();
  state.profiles = await listProfiles();
  state.deals = await listAccessibleDeals();
  const ids = state.deals.map((deal) => deal.id).slice(0, 80);
  const related = await listDealTasksAndReviews(ids);
  state.taskMap = related.taskMap;
  state.reviewMap = related.reviewMap;
  if (state.workZone === 'auto') state.workZone = defaultZoneForRole(state.profile?.role);
  if (state.queue === 'auto') state.queue = defaultQueueForZone(state.workZone);
  applyVisualRole();
  renderRolePanel();
  renderFilters();
  renderStats();
  renderDeals();
  setStatus('Готово. Загружено сделок: ' + state.deals.length, 'ok');
}

function defaultZoneForRole(role) {
  if (role === 'lawyer') return 'lawyer';
  if (role === 'broker') return 'broker';
  if (role === 'manager') return 'manager';
  if (role === 'admin') return 'admin';
  return 'spn';
}
function defaultQueueForZone(zone) {
  if (zone === 'lawyer') return 'lawyer_review';
  if (zone === 'broker') return 'mortgage';
  if (zone === 'manager') return 'attention';
  if (zone === 'admin') return 'attention';
  return 'my_tasks';
}
function roleIcon(role) {
  if (role === 'admin') return '⚙️';
  if (role === 'manager') return '📊';
  if (role === 'lawyer') return '⚖️';
  if (role === 'broker') return '🏦';
  return '🏠';
}
function zoneIcon(zone) {
  if (zone === 'admin') return '⚙️';
  if (zone === 'manager') return '📊';
  if (zone === 'lawyer') return '⚖️';
  if (zone === 'broker') return '🏦';
  if (zone === 'all') return '🗂️';
  return '🏠';
}
function queueIcon(queue) {
  if (queue === 'attention') return '🚨';
  if (queue === 'overdue') return '⏰';
  if (queue === 'lawyer_review') return '⚖️';
  if (queue === 'mortgage') return '🏦';
  if (queue === 'ready') return '✅';
  if (queue === 'my_tasks') return '📝';
  if (queue === 'children') return '👶';
  return '🗂️';
}

function renderRolePanel() {
  const role = state.profile?.role || 'spn';
  get('rolePanel').innerHTML = `
    <div class="box role-card">
      <div class="work-zone-title">
        <div>
          <h2>${roleIcon(role)} ${esc(ROLE_LABELS[role] || role)}</h2>
          <p>${esc(roleDescription(role))}</p>
        </div>
        <span class="pill blue">${esc(state.profile?.team_name || 'Команда не указана')}</span>
      </div>
      <table>
        <tr><th>Пользователь</th><td>${esc(state.profile?.full_name || state.user?.email || '—')}</td></tr>
        <tr><th>Email</th><td>${esc(state.profile?.email || state.user?.email || '—')}</td></tr>
        <tr><th>Руководитель</th><td>${esc(profileName(state.profile?.manager_id))}</td></tr>
      </table>
    </div>
    <div class="box orangeBox">
      <h3>${zoneIcon(state.workZone)} Рабочая зона</h3>
      <p>${esc(workZoneDescription(state.workZone))}</p>
    </div>
  `;
}

function workZoneDescription(zone) {
  if (zone === 'spn') return 'Мои сделки и задатки: что нужно доделать, какие задачи открыты, где есть риск.';
  if (zone === 'lawyer') return 'Юридическая проверка: сделки, где нужно решение юриста или есть повышенный риск.';
  if (zone === 'broker') return 'Ипотека и банк: сделки со Сбером, ипотекой, сертификатами, оценкой и безопасными расчетами.';
  if (zone === 'manager') return 'Контроль группы: рискованные сделки, открытые задачи, готовность к задатку и сделке.';
  if (zone === 'admin') return 'Общая аналитика: все доступные сделки, роли, риски, ипотека, задачи и статусы.';
  return 'Все доступные сделки.';
}

function renderFilters() {
  const zones = [
    ['spn', 'Мои сделки СПН'],
    ['lawyer', 'Юрист'],
    ['broker', 'Брокер'],
    ['manager', 'Менеджер'],
    ['admin', 'Админ'],
    ['all', 'Все доступные']
  ];
  get('filters').innerHTML = `
    <div class="row">
      <label>Рабочая зона<select id="workZoneFilter">${zones.map(([id, title]) => `<option value="${id}" ${state.workZone === id ? 'selected' : ''}>${zoneIcon(id)} ${esc(title)}</option>`).join('')}</select></label>
      <label>Поиск<input id="dealSearch" placeholder="адрес, телефон, объект, кадастровый номер"></label>
    </div>
    <div class="row">
      <label>Статус<select id="dealStatusFilter"><option value="">Все статусы</option>${Object.entries(STATUS_LABELS).map(([id, title]) => `<option value="${id}">${esc(title)}</option>`).join('')}</select></label>
      <label>Риск<select id="dealRiskFilter"><option value="">Все риски</option><option value="Нельзя">Стоп / нельзя</option><option value="юрист">Юрист</option><option value="банк">Банк</option><option value="Можно">Можно</option></select></label>
    </div>
    <div class="actions" style="justify-content:flex-start">
      <button id="btnReloadDeals" class="green">Обновить</button>
      <a class="button light" href="./index.html">Новая сделка / навигатор</a>
      <a class="button light" href="./admin.html">Сотрудники / роли</a>
    </div>
    <div class="queue-filter-note">Очереди ниже автоматически подстраиваются под выбранную рабочую зону.</div>
  `;
  get('dealSearch').value = state.search;
  get('dealStatusFilter').value = state.status;
  get('dealRiskFilter').value = state.risk;
  get('workZoneFilter').value = state.workZone;
  get('workZoneFilter').onchange = (e) => { state.workZone = e.target.value; state.queue = defaultQueueForZone(state.workZone); applyVisualRole(); renderRolePanel(); renderDeals(); renderStats(); };
  get('dealSearch').oninput = (e) => { state.search = e.target.value; renderDeals(); renderStats(); };
  get('dealStatusFilter').onchange = (e) => { state.status = e.target.value; renderDeals(); renderStats(); };
  get('dealRiskFilter').onchange = (e) => { state.risk = e.target.value; renderDeals(); renderStats(); };
  get('btnReloadDeals').onclick = loadCrm;
}

function zoneMatches(deal) {
  const zone = state.workZone;
  if (zone === 'all') return true;
  if (zone === 'spn') return isMine(deal);
  if (zone === 'lawyer') return needsLawyer(deal) || ['needs_lawyer', 'lawyer_review', 'needs_documents'].includes(deal.status);
  if (zone === 'broker') return isMortgageDeal(deal) || deal.status === 'mortgage_review';
  if (zone === 'manager') return openTaskCount(deal) > 0 || needsLawyer(deal) || isMortgageDeal(deal) || hasStop(deal) || Number(deal.readiness_deposit || 0) < 80;
  if (zone === 'admin') return true;
  return true;
}
function queueMatches(deal) {
  const queue = state.queue;
  if (!queue || queue === 'all') return true;
  if (queue === 'my_tasks') return isMine(deal) && openTaskCount(deal) > 0;
  if (queue === 'attention') return hasStop(deal) || urgentTaskCount(deal) > 0 || overdueTaskCount(deal) > 0 || hasChildren(deal);
  if (queue === 'overdue') return overdueTaskCount(deal) > 0;
  if (queue === 'lawyer_review') return needsLawyer(deal) || ['needs_lawyer', 'lawyer_review', 'needs_documents'].includes(deal.status);
  if (queue === 'mortgage') return isMortgageDeal(deal) || deal.status === 'mortgage_review';
  if (queue === 'ready') return ['ready_for_deposit', 'ready_for_deal'].includes(deal.status) || Number(deal.readiness_deposit || 0) >= 80;
  if (queue === 'children') return hasChildren(deal);
  return true;
}
function baseFilteredDeals() {
  const q = state.search.trim().toLowerCase();
  return state.deals.filter((deal) => {
    const text = [deal.title, deal.address, deal.object_type, deal.seller_phone, deal.buyer_phone, deal.price_fact, deal.deal_json?.cadObject, deal.deal_json?.cadLand].join(' ').toLowerCase();
    if (!zoneMatches(deal)) return false;
    if (q && !text.includes(q)) return false;
    if (state.status && deal.status !== state.status) return false;
    if (state.risk && !String(deal.risk_level || '').toLowerCase().includes(state.risk.toLowerCase())) return false;
    return true;
  });
}
function filterDeals() { return baseFilteredDeals().filter(queueMatches); }

function queueItems(deals = baseFilteredDeals()) {
  return [
    ['attention', 'На контроле', deals.filter((deal) => hasStop(deal) || urgentTaskCount(deal) > 0 || hasChildren(deal)).length, 'red'],
    ['overdue', 'Просрочки', deals.filter((deal) => overdueTaskCount(deal) > 0).length, 'red'],
    ['lawyer_review', 'Юристу', deals.filter((deal) => needsLawyer(deal) || ['needs_lawyer', 'lawyer_review', 'needs_documents'].includes(deal.status)).length, 'orange'],
    ['mortgage', 'Брокеру', deals.filter((deal) => isMortgageDeal(deal) || deal.status === 'mortgage_review').length, 'orange'],
    ['my_tasks', 'Мои задачи', deals.filter((deal) => isMine(deal) && openTaskCount(deal) > 0).length, 'blue'],
    ['children', 'Дети', deals.filter(hasChildren).length, 'red'],
    ['ready', 'Готово', deals.filter((deal) => ['ready_for_deposit', 'ready_for_deal'].includes(deal.status) || Number(deal.readiness_deposit || 0) >= 80).length, 'green'],
    ['all', 'Все в зоне', deals.length, 'blue']
  ];
}

function renderStats() {
  const base = baseFilteredDeals();
  const deals = filterDeals();
  const mortgage = base.filter(isMortgageDeal).length;
  const lawyer = base.filter(needsLawyer).length;
  const openTasks = base.reduce((sum, deal) => sum + openTaskCount(deal), 0);
  const overdue = base.reduce((sum, deal) => sum + overdueTaskCount(deal), 0);
  const ready = base.filter((deal) => Number(deal.readiness_deposit || 0) >= 80 || ['ready_for_deposit', 'ready_for_deal'].includes(deal.status)).length;
  const my = base.filter(isMine).length;
  get('stats').innerHTML = `
    <div class="metrics">
      <div class="metric"><b>${base.length}</b><span>сделок в зоне</span></div>
      <div class="metric greenBox"><b>${my}</b><span>мои сделки</span></div>
      <div class="metric orangeBox"><b>${lawyer}</b><span>юрист</span></div>
      <div class="metric blue"><b>${mortgage}</b><span>ипотека / брокер</span></div>
      <div class="metric redBox"><b>${openTasks}</b><span>открытых задач</span></div>
      <div class="metric redBox"><b>${overdue}</b><span>просрочено</span></div>
      <div class="metric greenBox"><b>${ready}</b><span>готовность</span></div>
      <div class="metric"><b>${deals.length}</b><span>в очереди</span></div>
    </div>
    ${renderQueueDashboard(base)}
    ${renderWorkZoneTips(deals)}
  `;
}

function renderQueueDashboard(base) {
  const items = queueItems(base);
  return `
    <div class="box blue queue-dashboard">
      <div class="queue-section-title"><h3>Очереди по роли</h3><span class="pill blue">${zoneIcon(state.workZone)} ${esc(tableTitle())}</span></div>
      <div class="queue-grid">
        ${items.map(([id, title, count, tone]) => `<div class="queue-card ${tone} ${state.queue === id ? 'active' : ''}" data-queue="${id}"><b>${count}</b><span>${queueIcon(id)} ${esc(title)}</span></div>`).join('')}
      </div>
      <div class="queue-tabs">
        ${items.map(([id, title]) => `<button type="button" class="${state.queue === id ? 'active' : ''}" data-queue="${id}">${queueIcon(id)} ${esc(title)}</button>`).join('')}
      </div>
    </div>
  `;
}

function renderWorkZoneTips(deals) {
  const zone = state.workZone;
  const urgent = deals.filter((deal) => openTaskCount(deal) > 0 || needsLawyer(deal) || isMortgageDeal(deal) || hasChildren(deal)).slice(0, 6);
  const title = zone === 'lawyer' ? 'Что юристу разобрать в первую очередь'
    : zone === 'broker' ? 'Что брокеру взять в работу'
    : zone === 'manager' ? 'Что менеджеру проконтролировать'
    : zone === 'admin' ? 'На что обратить внимание руководителю'
    : 'Что СПН сделать сейчас';
  return `
    <div class="box orangeBox">
      <h3>${zoneIcon(zone)} ${esc(title)}</h3>
      ${urgent.length ? '<div class="queue-priority-list">' + urgent.map((deal) => `<div class="queue-priority-item"><div class="main"><b>${esc(deal.title || deal.address || 'Сделка')}</b><span>${esc(shortReason(deal))}</span></div><div class="queue-badges">${badgesForDeal(deal)}</div></div>`).join('') + '</div>' : '<p>Критичных задач в текущей очереди не найдено.</p>'}
    </div>
  `;
}

function shortReason(deal) {
  const reasons = [];
  if (overdueTaskCount(deal)) reasons.push('просрочено: ' + overdueTaskCount(deal));
  if (urgentTaskCount(deal)) reasons.push('срочных задач: ' + urgentTaskCount(deal));
  if (openTaskCount(deal)) reasons.push('открытых задач: ' + openTaskCount(deal));
  if (hasChildren(deal)) reasons.push('дети/маткапитал/детские деньги');
  if (needsLawyer(deal)) reasons.push('нужна юридическая проверка');
  if (isMortgageDeal(deal)) reasons.push('ипотека/банк');
  if (Number(deal.readiness_deposit || 0) < 80) reasons.push('готовность ниже 80%');
  return reasons.join(', ') || 'проверить статус';
}
function badgesForDeal(deal) {
  const badges = [];
  if (hasStop(deal)) badges.push('<span class="pill red">стоп</span>');
  if (overdueTaskCount(deal)) badges.push(`<span class="pill red">просрочено ${overdueTaskCount(deal)}</span>`);
  if (urgentTaskCount(deal)) badges.push(`<span class="pill orange">срочно ${urgentTaskCount(deal)}</span>`);
  if (hasChildren(deal)) badges.push('<span class="pill red">дети</span>');
  if (needsLawyer(deal)) badges.push('<span class="pill orange">юрист</span>');
  if (isMortgageDeal(deal)) badges.push('<span class="pill blue">банк</span>');
  if (['ready_for_deposit', 'ready_for_deal'].includes(deal.status)) badges.push('<span class="pill green">готово</span>');
  return badges.join('') || '<span class="pill green">обычная</span>';
}

function dealRoleHint(deal) {
  const role = state.profile?.role;
  if (role === 'admin') return 'Полный контроль';
  if (role === 'manager') return 'Контроль группы / отдела';
  if (role === 'lawyer') return needsLawyer(deal) ? 'Юридическая проверка' : 'Доступ по роли';
  if (role === 'broker') return isMortgageDeal(deal) ? 'Ипотека / банк' : 'Доступ по роли';
  return 'Моя сделка';
}
function nextAction(deal) {
  if (overdueTaskCount(deal)) return 'Срочно: закрыть просроченные задачи';
  if (needsLawyer(deal)) return 'Юрист: оставить решение / список замечаний';
  if (isMortgageDeal(deal)) return 'Брокер: проверить банк, Домклик, оценку';
  if (openTaskCount(deal)) return 'СПН: закрыть открытые задачи';
  if (Number(deal.readiness_deposit || 0) >= 80) return 'Можно готовить задаток / сделку';
  return 'СПН: дозаполнить карточку и документы';
}
function rowClass(deal) {
  if (overdueTaskCount(deal)) return 'deal-row-overdue';
  if (hasStop(deal) || hasChildren(deal)) return 'deal-row-attention';
  if (needsLawyer(deal)) return 'deal-row-lawyer';
  if (isMortgageDeal(deal)) return 'deal-row-mortgage';
  if (['ready_for_deposit', 'ready_for_deal'].includes(deal.status)) return 'deal-row-ready';
  return '';
}

function renderDeals() {
  const deals = filterDeals();
  const body = deals.map((deal) => {
    const dealReviews = reviews(deal);
    const openTasks = openTaskCount(deal);
    const recentReview = lastReview(deal);
    return `
      <tr class="${rowClass(deal)}">
        <td>${fmtDate(deal.updated_at)}</td>
        <td><b>${esc(deal.title || '—')}</b><br><span class="small">${esc(deal.address || '')}</span><br><span class="pill blue">${esc(dealRoleHint(deal))}</span><div class="queue-status-row">${badgesForDeal(deal)}</div></td>
        <td>${esc(STATUS_LABELS[deal.status] || deal.status || '—')}<br><select data-status-deal="${deal.id}">${Object.entries(STATUS_LABELS).map(([id, title]) => `<option value="${id}" ${id === deal.status ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></td>
        <td>${esc(deal.object_type || '—')}<br>${esc(deal.price_fact || '—')}</td>
        <td>${esc(profileName(deal.created_by))}<br><span class="small">Продавец: ${esc(deal.seller_phone || deal.deal_json?.sellerPhone || '—')}<br>Покупатель: ${esc(deal.buyer_phone || deal.deal_json?.buyerPhone || '—')}</span></td>
        <td>${deal.readiness_deposit || 0}%<br>${esc(deal.risk_level || '—')}</td>
        <td>${openTasks} откр. / ${overdueTaskCount(deal)} проср.<br>${dealReviews.length} реш.<br><span class="small">${esc(nextAction(deal))}</span>${recentReview ? `<br><span class="small">Последнее: ${esc(recentReview.decision || '')}</span>` : ''}</td>
        <td><a class="button light" href="./index.html?deal=${deal.id}">Открыть</a></td>
      </tr>
    `;
  }).join('');

  get('dealsList').innerHTML = `
    <div class="box blue">
      <h2>${queueIcon(state.queue)} ${esc(tableTitle())} / ${esc(queueTitle())}</h2>
      <div class="table-wrap"><table>
        <tr><th>Обновлено</th><th>Сделка</th><th>Статус</th><th>Объект / цена</th><th>СПН / контакты</th><th>Готовность / риск</th><th>Работа</th><th></th></tr>
        ${body || '<tr><td colspan="8">Сделки не найдены.</td></tr>'}
      </table></div>
    </div>
  `;

  document.querySelectorAll('[data-status-deal]').forEach((select) => {
    select.onchange = async () => {
      try {
        await updateDealStatus(select.dataset.statusDeal, select.value);
        await loadCrm();
      } catch (error) {
        alert('Не удалось изменить статус: ' + error.message);
      }
    };
  });
  document.querySelectorAll('[data-queue]').forEach((el) => {
    el.onclick = () => {
      state.queue = el.dataset.queue;
      renderStats();
      renderDeals();
    };
  });
}

function tableTitle() {
  if (state.workZone === 'spn') return 'Мои сделки СПН';
  if (state.workZone === 'lawyer') return 'Юридическая проверка';
  if (state.workZone === 'broker') return 'Ипотека / банк';
  if (state.workZone === 'manager') return 'Контроль менеджера';
  if (state.workZone === 'admin') return 'Админская аналитика сделок';
  return 'Все доступные сделки';
}
function queueTitle() {
  const found = queueItems(baseFilteredDeals()).find(([id]) => id === state.queue);
  return found ? found[1] : 'Все';
}

function bindAuth() {
  get('btnLogin').onclick = async () => {
    try {
      setStatus('Выполняю вход...', 'info');
      await signInWithPassword(get('email').value.trim(), get('password').value);
      await refreshAuth();
    } catch (error) {
      setStatus('Ошибка входа: ' + error.message, 'error');
    }
  };
  get('btnLogout').onclick = async () => {
    await signOut();
    await refreshAuth();
  };
}

loadQueueCss();
bindAuth();
refreshAuth().catch((error) => setStatus('Ошибка загрузки CRM: ' + error.message, 'error'));
