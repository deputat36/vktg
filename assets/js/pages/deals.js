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
  workZone: 'auto'
};

function get(id) { return document.getElementById(id); }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function fmtDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function profileName(id) {
  if (!id) return '—';
  const p = state.profiles.find((item) => item.id === id);
  return p ? p.full_name : id.slice(0, 8);
}
function isMortgageDeal(deal) {
  const d = deal.deal_json || {};
  const payments = d.payments || [];
  const certificates = d.certificates || [];
  return Boolean(deal.broker_needed || payments.includes('mortgage') || certificates.length || String(d.bankType || '').includes('Сбер') || String(d.bankType || '').includes('банк'));
}
function needsLawyer(deal) {
  const d = deal.deal_json || {};
  return Boolean(deal.lawyer_needed || (deal.analysis_json?.stop || []).length || (d.flags || []).length || (d.certificates || []).length || String(d.rightForm || '').includes('Доля'));
}
function isMine(deal) {
  const id = state.profile?.id;
  return Boolean(id && (deal.created_by === id || deal.seller_spn_id === id || deal.buyer_spn_id === id));
}
function openTaskCount(deal) {
  return (state.taskMap.get(deal.id) || []).filter((task) => task.status !== 'done' && task.status !== 'cancelled').length;
}
function reviewCount(deal) {
  return (state.reviewMap.get(deal.id) || []).length;
}
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
  const ids = state.deals.map((deal) => deal.id).slice(0, 50);
  const related = await listDealTasksAndReviews(ids);
  state.taskMap = related.taskMap;
  state.reviewMap = related.reviewMap;
  if (state.workZone === 'auto') state.workZone = defaultZoneForRole(state.profile?.role);
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
  `;
  get('dealSearch').value = state.search;
  get('dealStatusFilter').value = state.status;
  get('dealRiskFilter').value = state.risk;
  get('workZoneFilter').value = state.workZone;
  get('workZoneFilter').onchange = (e) => { state.workZone = e.target.value; applyVisualRole(); renderRolePanel(); renderDeals(); renderStats(); };
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
  if (zone === 'manager') return openTaskCount(deal) > 0 || needsLawyer(deal) || isMortgageDeal(deal) || Number(deal.readiness_deposit || 0) < 80;
  if (zone === 'admin') return true;
  return true;
}

function filterDeals() {
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

function renderStats() {
  const deals = filterDeals();
  const mortgage = deals.filter(isMortgageDeal).length;
  const lawyer = deals.filter(needsLawyer).length;
  const openTasks = deals.reduce((sum, deal) => sum + openTaskCount(deal), 0);
  const ready = deals.filter((deal) => Number(deal.readiness_deposit || 0) >= 80).length;
  const my = deals.filter(isMine).length;
  get('stats').innerHTML = `
    <div class="metrics">
      <div class="metric"><b>${deals.length}</b><span>сделок в зоне</span></div>
      <div class="metric greenBox"><b>${my}</b><span>мои сделки</span></div>
      <div class="metric orangeBox"><b>${lawyer}</b><span>юрист</span></div>
      <div class="metric blue"><b>${mortgage}</b><span>ипотека / брокер</span></div>
      <div class="metric redBox"><b>${openTasks}</b><span>открытых задач</span></div>
      <div class="metric greenBox"><b>${ready}</b><span>готовность 80%+</span></div>
    </div>
    ${renderWorkZoneTips(deals)}
  `;
}

function renderWorkZoneTips(deals) {
  const zone = state.workZone;
  const urgent = deals.filter((deal) => openTaskCount(deal) > 0 || needsLawyer(deal) || isMortgageDeal(deal)).slice(0, 5);
  const title = zone === 'lawyer' ? 'Что юристу разобрать в первую очередь'
    : zone === 'broker' ? 'Что брокеру взять в работу'
    : zone === 'manager' ? 'Что менеджеру проконтролировать'
    : zone === 'admin' ? 'На что обратить внимание руководителю'
    : 'Что СПН сделать сейчас';
  return `
    <div class="box orangeBox">
      <h3>${zoneIcon(zone)} ${esc(title)}</h3>
      ${urgent.length ? '<ul>' + urgent.map((deal) => `<li><b>${esc(deal.title || deal.address || 'Сделка')}</b>: ${esc(shortReason(deal))}</li>`).join('') + '</ul>' : '<p>Критичных задач в текущей зоне не найдено.</p>'}
    </div>
  `;
}

function shortReason(deal) {
  const reasons = [];
  if (openTaskCount(deal)) reasons.push('открытых задач: ' + openTaskCount(deal));
  if (needsLawyer(deal)) reasons.push('нужна юридическая проверка');
  if (isMortgageDeal(deal)) reasons.push('ипотека/банк');
  if (Number(deal.readiness_deposit || 0) < 80) reasons.push('готовность ниже 80%');
  return reasons.join(', ') || 'проверить статус';
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
  if (needsLawyer(deal)) return 'Юрист: оставить решение / список замечаний';
  if (isMortgageDeal(deal)) return 'Брокер: проверить банк, Домклик, оценку';
  if (openTaskCount(deal)) return 'СПН: закрыть открытые задачи';
  if (Number(deal.readiness_deposit || 0) >= 80) return 'Можно готовить задаток / сделку';
  return 'СПН: дозаполнить карточку и документы';
}

function renderDeals() {
  const deals = filterDeals();
  const body = deals.map((deal) => {
    const reviews = state.reviewMap.get(deal.id) || [];
    const openTasks = openTaskCount(deal);
    return `
      <tr>
        <td>${fmtDate(deal.updated_at)}</td>
        <td><b>${esc(deal.title || '—')}</b><br><span class="small">${esc(deal.address || '')}</span><br><span class="pill blue">${esc(dealRoleHint(deal))}</span></td>
        <td>${esc(STATUS_LABELS[deal.status] || deal.status || '—')}<br><select data-status-deal="${deal.id}">${Object.entries(STATUS_LABELS).map(([id, title]) => `<option value="${id}" ${id === deal.status ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></td>
        <td>${esc(deal.object_type || '—')}<br>${esc(deal.price_fact || '—')}</td>
        <td>${esc(profileName(deal.created_by))}<br><span class="small">Продавец: ${esc(deal.seller_phone || deal.deal_json?.sellerPhone || '—')}<br>Покупатель: ${esc(deal.buyer_phone || deal.deal_json?.buyerPhone || '—')}</span></td>
        <td>${deal.readiness_deposit || 0}%<br>${esc(deal.risk_level || '—')}</td>
        <td>${openTasks} откр.<br>${reviews.length} реш.<br><span class="small">${esc(nextAction(deal))}</span></td>
        <td><a class="button light" href="./index.html?deal=${deal.id}">Открыть</a></td>
      </tr>
    `;
  }).join('');

  get('dealsList').innerHTML = `
    <div class="box blue">
      <h2>${zoneIcon(state.workZone)} ${esc(tableTitle())}</h2>
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
}

function tableTitle() {
  if (state.workZone === 'spn') return 'Мои сделки СПН';
  if (state.workZone === 'lawyer') return 'Юридическая проверка';
  if (state.workZone === 'broker') return 'Ипотека / банк';
  if (state.workZone === 'manager') return 'Контроль менеджера';
  if (state.workZone === 'admin') return 'Админская аналитика сделок';
  return 'Все доступные сделки';
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

bindAuth();
refreshAuth().catch((error) => setStatus('Ошибка загрузки CRM: ' + error.message, 'error'));
