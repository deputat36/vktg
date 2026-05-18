import '../integrations/appNav.js';
import { getCurrentUser, signInWithPassword, signOut } from '../integrations/supabase.js';
import { getMyProfile, listAccessibleDeals, listProfiles, listDealTasksAndReviews, STATUS_LABELS } from '../integrations/crmApi.js';

let state = {
  user: null,
  profile: null,
  profiles: [],
  deals: [],
  taskMap: new Map(),
  reviewMap: new Map(),
  search: '',
  period: 'all',
  onlyProblems: false
};

function get(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function setStatus(text, type = 'info') { const el = get('pageStatus'); if (el) { el.textContent = text; el.className = 'status ' + type; } }
function profileName(id) { const p = state.profiles.find((x) => x.id === id); return p ? p.full_name : (id ? id.slice(0, 8) : '—'); }
function isMortgageDeal(deal) { const d = deal.deal_json || {}; return Boolean(deal.broker_needed || (d.payments || []).includes('mortgage') || (d.certificates || []).length || String(d.bankType || '').includes('Сбер') || String(d.bankType || '').includes('банк')); }
function needsLawyer(deal) { const d = deal.deal_json || {}; return Boolean(deal.lawyer_needed || (deal.analysis_json?.stop || []).length || (deal.analysis_json?.warnings || []).length || (d.flags || []).length || (d.certificates || []).length || String(d.rightForm || '').includes('Доля')); }
function openTaskCount(deal) { return (state.taskMap.get(deal.id) || []).filter((task) => task.status !== 'done' && task.status !== 'cancelled').length; }
function reviewCount(deal) { return (state.reviewMap.get(deal.id) || []).length; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function isInPeriod(deal) { if (state.period === 'all') return true; const updated = new Date(deal.updated_at || deal.created_at); if (state.period === '7') return updated >= daysAgo(7); if (state.period === '30') return updated >= daysAgo(30); if (state.period === '90') return updated >= daysAgo(90); return true; }
function isProblem(deal) { return openTaskCount(deal) > 0 || needsLawyer(deal) || isMortgageDeal(deal) || Number(deal.readiness_deposit || 0) < 80 || ['needs_lawyer','lawyer_review','needs_documents','mortgage_review','cancelled'].includes(deal.status); }
function filteredDeals() { const q = state.search.trim().toLowerCase(); return state.deals.filter((deal) => { if (!isInPeriod(deal)) return false; if (state.onlyProblems && !isProblem(deal)) return false; const text = [deal.title, deal.address, deal.object_type, deal.seller_phone, deal.buyer_phone, deal.risk_level, profileName(deal.created_by)].join(' ').toLowerCase(); return !q || text.includes(q); }); }

async function refreshAuth() {
  state.user = await getCurrentUser();
  if (!state.user) { get('authBox').style.display = ''; get('dashboardBox').style.display = 'none'; setStatus('Войдите, чтобы открыть дашборд.', 'warn'); return; }
  get('authBox').style.display = 'none'; get('dashboardBox').style.display = '';
  await loadDashboard();
}

async function loadDashboard() {
  setStatus('Загружаю аналитику...', 'info');
  state.profile = await getMyProfile();
  state.profiles = await listProfiles();
  state.deals = await listAccessibleDeals(500);
  const ids = state.deals.map((deal) => deal.id).slice(0, 120);
  const related = await listDealTasksAndReviews(ids);
  state.taskMap = related.taskMap;
  state.reviewMap = related.reviewMap;
  document.body.dataset.role = state.profile?.role || 'manager';
  document.body.dataset.zone = 'manager';
  renderToolbar(); renderKpis(); renderCharts(); renderProblems(); renderLoads();
  setStatus('Готово. Сделок загружено: ' + state.deals.length, 'ok');
}

function renderToolbar() {
  get('toolbar').innerHTML = `
    <div class="dashboard-toolbar">
      <div class="row">
        <label>Поиск<input id="dashSearch" placeholder="адрес, СПН, телефон, риск"></label>
        <label>Период<select id="dashPeriod"><option value="all">Все время</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option></select></label>
      </div>
      <div class="actions">
        <label class="check"><input type="checkbox" id="dashOnlyProblems" ${state.onlyProblems ? 'checked' : ''}> только проблемные</label>
        <button id="btnReloadDashboard" class="green">Обновить</button>
        <button onclick="window.print()" class="light">Печать</button>
      </div>
    </div>
  `;
  get('dashSearch').value = state.search;
  get('dashPeriod').value = state.period;
  get('dashSearch').oninput = (e) => { state.search = e.target.value; rerender(); };
  get('dashPeriod').onchange = (e) => { state.period = e.target.value; rerender(); };
  get('dashOnlyProblems').onchange = (e) => { state.onlyProblems = e.target.checked; rerender(); };
  get('btnReloadDashboard').onclick = loadDashboard;
}

function rerender() { renderKpis(); renderCharts(); renderProblems(); renderLoads(); }
function renderKpis() {
  const deals = filteredDeals();
  const openTasks = deals.reduce((s,d) => s + openTaskCount(d), 0);
  const lawyer = deals.filter(needsLawyer).length;
  const mortgage = deals.filter(isMortgageDeal).length;
  const lowReady = deals.filter((d) => Number(d.readiness_deposit || 0) < 80).length;
  const ready = deals.filter((d) => Number(d.readiness_deposit || 0) >= 80).length;
  const cancelled = deals.filter((d) => d.status === 'cancelled').length;
  get('kpis').innerHTML = `
    <div class="kpi-line">
      <div class="kpi-card"><b>${deals.length}</b><span>сделок</span><small>в выбранном периоде</small></div>
      <div class="kpi-card redBox"><b>${openTasks}</b><span>открытых задач</span><small>требуют контроля</small></div>
      <div class="kpi-card orangeBox"><b>${lawyer}</b><span>юридическая проверка</span><small>риск / особенности</small></div>
      <div class="kpi-card blue"><b>${mortgage}</b><span>ипотека / банк</span><small>брокер, Домклик, оценка</small></div>
      <div class="kpi-card greenBox"><b>${ready}</b><span>готовы 80%+</span><small>можно вести к задатку</small></div>
      <div class="kpi-card redBox"><b>${cancelled}</b><span>сорваны / отменены</span><small>разобрать причины</small></div>
    </div>
  `;
}

function countBy(items, fn) { const m = new Map(); items.forEach((item) => { const k = fn(item) || '—'; m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a,b) => b[1]-a[1]); }
function barList(title, rows) { const max = Math.max(1, ...rows.map((x) => x[1])); return `<div class="box blue"><h2>${esc(title)}</h2><div class="bar-list">${rows.length ? rows.map(([label,count]) => `<div class="bar-row"><div class="bar-label">${esc(label)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(count/max*100)}%"></div></div><div class="bar-value">${count}</div></div>`).join('') : '<div class="dashboard-empty">Нет данных</div>'}</div></div>`; }
function renderCharts() {
  const deals = filteredDeals();
  const statusRows = countBy(deals, (d) => STATUS_LABELS[d.status] || d.status || 'Без статуса');
  const spnRows = countBy(deals, (d) => profileName(d.created_by)).slice(0, 12);
  const typeRows = countBy(deals, (d) => d.object_type || 'Не указан').slice(0, 10);
  get('charts').innerHTML = `<div class="dashboard-grid"><div>${barList('Воронка по статусам', statusRows)}</div><div>${barList('Загрузка по СПН', spnRows)}</div><div class="dashboard-wide">${barList('Типы объектов', typeRows)}</div></div>`;
}

function problemReason(deal) { const r=[]; if(openTaskCount(deal)) r.push('задачи: '+openTaskCount(deal)); if(needsLawyer(deal)) r.push('юрист'); if(isMortgageDeal(deal)) r.push('ипотека/банк'); if(Number(deal.readiness_deposit||0)<80) r.push('готовность <80%'); if(deal.status==='cancelled') r.push('отменена'); return r; }
function renderProblems() {
  const problems = filteredDeals().filter(isProblem).sort((a,b) => problemReason(b).length - problemReason(a).length || openTaskCount(b)-openTaskCount(a)).slice(0, 20);
  get('problems').innerHTML = `
    <div class="box orangeBox dashboard-wide">
      <h2>Проблемные сделки и точки контроля</h2>
      <div class="problem-list">
        ${problems.length ? problems.map((deal) => `<div class="problem-card"><div><h3>${esc(deal.title || deal.address || 'Сделка')}</h3><p>${esc(deal.object_type || '—')} · ${esc(profileName(deal.created_by))} · готовность ${deal.readiness_deposit || 0}%</p><div class="problem-tags">${problemReason(deal).map((x) => `<span class="pill orange">${esc(x)}</span>`).join('')}<span class="pill blue">${esc(STATUS_LABELS[deal.status] || deal.status || '—')}</span></div></div><a class="button light" href="./index.html?deal=${deal.id}">Открыть</a></div>`).join('') : '<div class="dashboard-empty">Проблемных сделок в выборке нет.</div>'}
      </div>
    </div>
  `;
}

function renderLoads() {
  const deals = filteredDeals();
  const rows = state.profiles.filter((p) => p.is_active).map((p) => {
    const mine = deals.filter((d) => d.created_by === p.id || d.seller_spn_id === p.id || d.buyer_spn_id === p.id || d.lawyer_id === p.id || d.broker_id === p.id || d.manager_id === p.id);
    const tasks = mine.reduce((s,d) => s + openTaskCount(d), 0);
    return { p, count: mine.length, tasks, lawyer: mine.filter(needsLawyer).length, mortgage: mine.filter(isMortgageDeal).length };
  }).filter((x) => x.count || x.tasks).sort((a,b) => (b.tasks-a.tasks) || (b.count-a.count)).slice(0, 30);
  get('loads').innerHTML = `
    <div class="box blue dashboard-wide">
      <h2>Загрузка сотрудников</h2>
      <div class="table-wrap"><table class="load-table"><tr><th>Сотрудник</th><th>Роль</th><th>Команда</th><th>Сделки</th><th>Открытые задачи</th><th>Юрист</th><th>Ипотека</th></tr>${rows.length ? rows.map((x) => `<tr><td>${esc(x.p.full_name || '—')}</td><td>${esc(x.p.role || '—')}</td><td>${esc(x.p.team_name || '—')}</td><td>${x.count}</td><td>${x.tasks}</td><td>${x.lawyer}</td><td>${x.mortgage}</td></tr>`).join('') : '<tr><td colspan="7">Нет данных по загрузке.</td></tr>'}</table></div>
    </div>
  `;
}

function bindAuth() {
  get('btnLogin').onclick = async () => { try { setStatus('Выполняю вход...', 'info'); await signInWithPassword(get('email').value.trim(), get('password').value); await refreshAuth(); } catch (error) { setStatus('Ошибка входа: ' + error.message, 'error'); } };
  get('btnLogout').onclick = async () => { await signOut(); await refreshAuth(); };
}

bindAuth();
refreshAuth().catch((error) => setStatus('Ошибка загрузки дашборда: ' + error.message, 'error'));
