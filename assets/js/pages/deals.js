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
  roleMode: 'auto'
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

function setStatus(text, type = 'info') {
  const el = get('pageStatus');
  if (!el) return;
  el.className = 'status ' + type;
  el.textContent = text;
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
  renderRolePanel();
  renderFilters();
  renderStats();
  renderDeals();
  setStatus('Готово. Загружено сделок: ' + state.deals.length, 'ok');
}

function renderRolePanel() {
  const role = state.profile?.role || 'spn';
  get('rolePanel').innerHTML = `
    <div class="box blue">
      <h2>${esc(ROLE_LABELS[role] || role)}</h2>
      <p>${esc(roleDescription(role))}</p>
      <table>
        <tr><th>Пользователь</th><td>${esc(state.profile?.full_name || state.user?.email || '—')}</td></tr>
        <tr><th>Email</th><td>${esc(state.profile?.email || state.user?.email || '—')}</td></tr>
        <tr><th>Команда</th><td>${esc(state.profile?.team_name || '—')}</td></tr>
        <tr><th>Руководитель</th><td>${esc(profileName(state.profile?.manager_id))}</td></tr>
      </table>
    </div>
  `;
}

function renderFilters() {
  get('filters').innerHTML = `
    <div class="row">
      <label>Поиск<input id="dealSearch" placeholder="адрес, телефон, объект, кадастровый номер"></label>
      <label>Статус<select id="dealStatusFilter"><option value="">Все статусы</option>${Object.entries(STATUS_LABELS).map(([id, title]) => `<option value="${id}">${esc(title)}</option>`).join('')}</select></label>
      <label>Риск<select id="dealRiskFilter"><option value="">Все риски</option><option value="Нельзя">Стоп / нельзя</option><option value="юрист">Юрист</option><option value="банк">Банк</option><option value="Можно">Можно</option></select></label>
    </div>
    <div class="actions" style="justify-content:flex-start">
      <button id="btnReloadDeals" class="green">Обновить</button>
      <a class="button light" href="./index.html">Новая сделка / навигатор</a>
    </div>
  `;
  get('dealSearch').value = state.search;
  get('dealStatusFilter').value = state.status;
  get('dealRiskFilter').value = state.risk;
  get('dealSearch').oninput = (e) => { state.search = e.target.value; renderDeals(); renderStats(); };
  get('dealStatusFilter').onchange = (e) => { state.status = e.target.value; renderDeals(); renderStats(); };
  get('dealRiskFilter').onchange = (e) => { state.risk = e.target.value; renderDeals(); renderStats(); };
  get('btnReloadDeals').onclick = loadCrm;
}

function filterDeals() {
  const q = state.search.trim().toLowerCase();
  return state.deals.filter((deal) => {
    const text = [deal.title, deal.address, deal.object_type, deal.seller_phone, deal.buyer_phone, deal.price_fact, deal.deal_json?.cadObject, deal.deal_json?.cadLand].join(' ').toLowerCase();
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
  const openTasks = deals.reduce((sum, deal) => sum + (state.taskMap.get(deal.id) || []).filter((task) => task.status !== 'done' && task.status !== 'cancelled').length, 0);
  const ready = deals.filter((deal) => Number(deal.readiness_deposit || 0) >= 80).length;
  get('stats').innerHTML = `
    <div class="metrics">
      <div class="metric"><b>${deals.length}</b><span>сделок в выборке</span></div>
      <div class="metric orangeBox"><b>${lawyer}</b><span>нужна проверка юриста</span></div>
      <div class="metric blue"><b>${mortgage}</b><span>ипотека / брокер</span></div>
      <div class="metric redBox"><b>${openTasks}</b><span>открытых задач</span></div>
      <div class="metric greenBox"><b>${ready}</b><span>готовность 80%+</span></div>
    </div>
  `;
}

function dealRoleHint(deal) {
  const role = state.profile?.role;
  if (role === 'admin') return 'Полный контроль';
  if (role === 'manager') return 'Контроль группы / отдела';
  if (role === 'lawyer') return needsLawyer(deal) ? 'Юридическая проверка' : 'Доступ по роли';
  if (role === 'broker') return isMortgageDeal(deal) ? 'Ипотека / банк' : 'Доступ по роли';
  return 'Моя сделка';
}

function renderDeals() {
  const deals = filterDeals();
  const body = deals.map((deal) => {
    const tasks = state.taskMap.get(deal.id) || [];
    const reviews = state.reviewMap.get(deal.id) || [];
    const openTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').length;
    return `
      <tr>
        <td>${fmtDate(deal.updated_at)}</td>
        <td><b>${esc(deal.title || '—')}</b><br><span class="small">${esc(deal.address || '')}</span><br><span class="pill blue">${esc(dealRoleHint(deal))}</span></td>
        <td>${esc(STATUS_LABELS[deal.status] || deal.status || '—')}<br><select data-status-deal="${deal.id}">${Object.entries(STATUS_LABELS).map(([id, title]) => `<option value="${id}" ${id === deal.status ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></td>
        <td>${esc(deal.object_type || '—')}<br>${esc(deal.price_fact || '—')}</td>
        <td>${esc(profileName(deal.created_by))}<br><span class="small">Продавец: ${esc(deal.seller_phone || deal.deal_json?.sellerPhone || '—')}<br>Покупатель: ${esc(deal.buyer_phone || deal.deal_json?.buyerPhone || '—')}</span></td>
        <td>${deal.readiness_deposit || 0}%<br>${esc(deal.risk_level || '—')}</td>
        <td>${openTasks} откр.<br>${reviews.length} реш.</td>
        <td><a class="button light" href="./index.html?deal=${deal.id}">Открыть</a></td>
      </tr>
    `;
  }).join('');

  get('dealsList').innerHTML = `
    <div class="box blue">
      <h2>Сделки</h2>
      <table>
        <tr><th>Обновлено</th><th>Сделка</th><th>Статус</th><th>Объект / цена</th><th>СПН / контакты</th><th>Готовность / риск</th><th>Задачи</th><th></th></tr>
        ${body || '<tr><td colspan="8">Сделки не найдены.</td></tr>'}
      </table>
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
