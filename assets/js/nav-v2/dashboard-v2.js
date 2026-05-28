import { setupTop, getCachedUser, renderAuthBox, rpc, esc, riskPill, saveCachedProfile, statusText } from './supabase-v2.js';

let data = null;
let loadWarning = '';

function shortId(id) { return String(id || '').slice(0, 8).toUpperCase(); }
function dateText(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function metric(label, value, cls = '') { return `<div class="metric ${cls}"><span>${label}</span><b>${value ?? 0}</b></div>`; }
function roleName(role) { return ({ owner:'Владелец', admin:'Админ', manager:'Менеджер', spn:'СПН', lawyer:'Юрист', broker:'Брокер', viewer:'Наблюдатель' })[role] || role || '—'; }

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true || deal?.wizard_snapshot?.demo === true || String(deal?.title || '').startsWith('ДЕМО:');
}
function demoBadge(deal) { return isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span> ' : ''; }
function activeTasksForDeal(dealId) { return (data?.tasks || []).filter((task) => task.deal_id === dealId && ['open', 'in_progress'].includes(task.status)); }
function hasRoleTask(deal, role) { return activeTasksForDeal(deal.id).some((task) => task.assigned_role === role); }
function missingDocs(deal) { return Number(deal.missing_documents_count || 0); }
function openTasks(deal) { return Number(deal.open_tasks_count || 0); }

function needsLawyerQueue(deal) {
  if (!deal.lawyer_needed) return false;
  return deal.status === 'need_lawyer'
    || deal.status === 'need_documents'
    || deal.has_children
    || deal.risk_level === 'red'
    || Number(deal.red_risks_count || 0) > 0
    || hasRoleTask(deal, 'lawyer');
}
function needsBrokerQueue(deal) {
  if (!deal.broker_needed) return false;
  return deal.status === 'need_broker'
    || deal.status === 'need_documents'
    || deal.has_mortgage
    || hasRoleTask(deal, 'broker');
}
function queueBadges(deal) {
  return `${needsLawyerQueue(deal) ? '<span class="pill yellow">юристу</span> ' : ''}${needsBrokerQueue(deal) ? '<span class="pill blue">брокеру</span> ' : ''}`;
}

function dealCard(deal) {
  return `<a class="deal-card ${isDemoDeal(deal) ? 'demo-card' : ''}" href="./deal-card-v2.html?id=${encodeURIComponent(deal.id)}">
    <div class="deal-head">
      <div>
        <div class="small">ID ${shortId(deal.id)} · ${dateText(deal.created_at)}</div>
        <div class="deal-title">${demoBadge(deal)}${esc(deal.title)}</div>
        <div class="small">${esc(deal.address || 'Адрес не указан')}</div>
      </div>
      ${riskPill(deal.risk_level)}
    </div>
    <div class="deal-meta">
      <div><span class="small">Задаток</span><b>${deal.readiness_deposit || 0}%</b></div>
      <div><span class="small">Документы</span><b>${missingDocs(deal)}</b></div>
      <div><span class="small">Задачи</span><b>${openTasks(deal)}</b></div>
    </div>
    <p><b>Следующее действие:</b><br>${esc(deal.next_action || 'Проверить карточку')}</p>
    <div>${demoBadge(deal)}${deal.has_children ? '<span class="pill red">дети</span> ' : ''}${deal.has_mortgage ? '<span class="pill yellow">ипотека</span> ' : ''}${queueBadges(deal)}${!deal.expenses_agreed ? '<span class="pill yellow">расходы</span> ' : ''}${!deal.settlements_agreed ? '<span class="pill yellow">расчеты</span> ' : ''}<span class="pill">${statusText(deal.status)}</span></div>
  </a>`;
}

function taskItem(task) {
  const isDemoTask = String(task.deal_title || '').startsWith('ДЕМО:');
  return `<div class="list-item">
    <div>${isDemoTask ? '<span class="pill blue">ДЕМО</span> ' : ''}<span class="pill ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'yellow' : 'blue'}">${esc(task.priority)}</span> <span class="pill">${esc(task.assigned_role || 'роль')}</span></div>
    <b>${esc(task.title)}</b>
    <p class="muted">${esc(task.description || '')}</p>
    <a class="btn light" href="./deal-card-v2.html?id=${encodeURIComponent(task.deal_id)}">Открыть сделку</a>
  </div>`;
}

function queue(title, items, emptyText) {
  return `<section class="card"><div class="section-title"><h2>${title}</h2><span class="pill blue">${items.length}</span></div><div class="deal-list">${items.map(dealCard).join('') || `<div class="empty">${emptyText}</div>`}</div></section>`;
}
function taskQueue(title, items, emptyText) {
  return `<section class="card"><div class="section-title"><h2>${title}</h2><span class="pill blue">${items.length}</span></div><div class="list">${items.map(taskItem).join('') || `<div class="empty">${emptyText}</div>`}</div></section>`;
}

function roleIntro(role) {
  if (role === 'spn') return 'Ваш рабочий стол СПН: свои сделки, документы, открытые задачи и готовность к задатку.';
  if (role === 'manager') return 'Рабочий стол менеджера: сделки команды, проблемные сделки, расходы, расчеты и очереди специалистов.';
  if (role === 'lawyer') return 'Юридическая очередь: сделки с детьми, опекой, сложными основаниями, красными рисками и документами.';
  if (role === 'broker') return 'Брокерская очередь: ипотека, маткапитал, сертификаты, банк, расчеты и финансовые условия.';
  if (role === 'viewer') return 'Режим просмотра: видимые вам сделки без управленческих действий.';
  return 'Главный экран контроля: сделки, роли, очереди, риски, документы, расходы и задачи.';
}

function quickActions(role) {
  const common = ['<a class="btn light" href="./deals-v2.html">Список сделок</a>', '<button id="reloadDashboard" class="btn light" type="button">Обновить</button>'];
  if (role === 'spn') return [`<a class="btn primary" href="./spn-v2.html">Создать сделку</a>`, ...common].join('');
  if (role === 'lawyer') return [`<a class="btn primary" href="./deals-v2.html">Открыть очередь</a>`, ...common].join('');
  if (role === 'broker') return [`<a class="btn primary" href="./deals-v2.html">Открыть очередь</a>`, ...common].join('');
  if (['owner','admin'].includes(role)) return [`<a class="btn primary" href="./spn-v2.html">Создать сделку</a>`, `<a class="btn light" href="./admin-v2.html">Команда</a>`, `<a class="btn light" href="./nav-access-audit-v2.html">Аудит доступов</a>`, `<a class="btn light" href="./nav-access-v2.html">Создать доступ</a>`, ...common].join('');
  if (role === 'manager') return [`<a class="btn primary" href="./deals-v2.html">Сделки команды</a>`, `<a class="btn light" href="./nav-access-audit-v2.html">Аудит доступов</a>`, ...common].join('');
  return common.join('');
}

function buildFallbackData(listData) {
  const deals = listData.items || [];
  return {
    profile: listData.profile || {},
    deals,
    tasks: [],
    summary: {
      total: deals.length,
      ready_for_deposit: deals.filter(d => Number(d.readiness_deposit || 0) >= 80).length,
      ready_for_deal: deals.filter(d => Number(d.readiness_deal || 0) >= 80).length,
      missing_documents: deals.reduce((sum, deal) => sum + missingDocs(deal), 0),
      open_tasks: deals.reduce((sum, deal) => sum + openTasks(deal), 0)
    }
  };
}

function roleSections(role, groups) {
  const { attention, lawyer, broker, readyDeposit, noExpenses, noSettlements, docsMissing, openTaskDeals, tasks, roleTasks, demoDeals, realDeals } = groups;
  if (role === 'spn') {
    return [
      queue('Мои сделки требуют внимания', attention, 'Сейчас нет критичных вопросов по вашим сделкам.'),
      queue('Нужно собрать документы', docsMissing, 'По видимым сделкам нет недостающих обязательных документов.'),
      queue('Готовы к задатку', readyDeposit, 'Пока нет сделок с готовностью к задатку 80%+.'),
      queue('Открытые задачи по сделкам', openTaskDeals, 'Открытых задач по сделкам нет.'),
      taskQueue('Мои открытые задачи', tasks, 'Открытые задачи недоступны или их нет.')
    ].join('');
  }
  if (role === 'lawyer') {
    return [
      queue('Юридическая очередь', lawyer, 'Сделок для юридической проверки сейчас нет.'),
      queue('Красные риски и дети', attention.filter(d => d.has_children || d.risk_level === 'red' || Number(d.red_risks_count || 0) > 0), 'Красных юридических рисков сейчас нет.'),
      queue('Документы блокируют сделку', docsMissing, 'Нет сделок с недостающими документами.'),
      taskQueue('Задачи юриста', roleTasks, 'Открытых задач юриста нет.')
    ].join('');
  }
  if (role === 'broker') {
    return [
      queue('Брокерская очередь', broker, 'Сделок для брокера сейчас нет.'),
      queue('Ипотека / банк / маткапитал', broker.filter(d => d.has_mortgage || d.broker_needed), 'Ипотечных и финансовых сделок нет.'),
      queue('Не согласованы расчеты', noSettlements, 'Расчеты согласованы во всех видимых сделках.'),
      taskQueue('Задачи брокера', roleTasks, 'Открытых задач брокера нет.')
    ].join('');
  }
  if (role === 'manager') {
    return [
      queue('Сделки команды на контроле', attention, 'Критичных сделок команды сейчас нет.'),
      queue('Передать юристу', lawyer, 'Очередь юриста пустая.'),
      queue('Передать брокеру', broker, 'Очередь брокера пустая.'),
      queue('Не согласованы расходы', noExpenses, 'Расходы согласованы.'),
      queue('Не согласованы расчеты', noSettlements, 'Расчеты согласованы.'),
      taskQueue('Открытые задачи команды', tasks, 'Открытых задач нет.')
    ].join('');
  }
  if (role === 'viewer') {
    return [
      queue('Видимые сделки', realDeals, 'Нет видимых рабочих сделок.'),
      queue('Демо-сделки', demoDeals, 'Нет видимых демо-сделок.')
    ].join('');
  }
  return [
    queue('На контроле', attention, 'Критичных сделок сейчас нет.'),
    queue('Передать юристу', lawyer, 'Очередь юриста пустая.'),
    queue('Передать брокеру', broker, 'Очередь брокера пустая.'),
    queue('Не согласованы расходы', noExpenses, 'Расходы согласованы во всех видимых сделках.'),
    queue('Не согласованы расчеты', noSettlements, 'Расчеты согласованы во всех видимых сделках.'),
    queue('Готовы к задатку', readyDeposit, 'Пока нет сделок с готовностью к задатку 80%+.'),
    taskQueue('Открытые задачи', tasks, 'Открытых задач нет.')
  ].join('');
}

function render() {
  const summary = data?.summary || {};
  const profile = data?.profile || {};
  const role = profile.role || 'viewer';
  const deals = Array.isArray(data?.deals) ? data.deals : [];
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const attention = deals.filter(d => d.risk_level === 'red' || d.has_children || !d.expenses_agreed || !d.settlements_agreed || Number(d.red_risks_count || 0) > 0);
  const lawyer = deals.filter(needsLawyerQueue);
  const broker = deals.filter(needsBrokerQueue);
  const readyDeposit = deals.filter(d => Number(d.readiness_deposit || 0) >= 80);
  const noExpenses = deals.filter(d => !d.expenses_agreed);
  const noSettlements = deals.filter(d => !d.settlements_agreed);
  const docsMissing = deals.filter(d => missingDocs(d) > 0);
  const openTaskDeals = deals.filter(d => openTasks(d) > 0);
  const demoDeals = deals.filter(isDemoDeal);
  const realDeals = deals.filter(d => !isDemoDeal(d));
  const roleTasks = tasks.filter(t => !t.assigned_role || t.assigned_role === role);
  const groups = { attention, lawyer, broker, readyDeposit, noExpenses, noSettlements, docsMissing, openTaskDeals, tasks, roleTasks, demoDeals, realDeals };
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Рабочий стол v2</h1><p>${roleIntro(role)}</p></section>
    ${loadWarning ? `<div class="status warn">${esc(loadWarning)}</div>` : ''}
    <section class="kpi-row">
      ${metric('Всего сделок', summary.total)}
      ${metric('Готовы к задатку', summary.ready_for_deposit)}
      ${metric('Готовы к сделке', summary.ready_for_deal)}
      ${metric('Документы', summary.missing_documents, summary.missing_documents ? 'yellow' : 'green')}
      ${metric('Открытые задачи', summary.open_tasks, summary.open_tasks ? 'yellow' : 'green')}
    </section>
    <section class="grid">
      <div class="card"><h2>Профиль</h2><div class="list"><div class="list-item"><b>${esc(profile.full_name || 'Пользователь')}</b><span class="small">${esc(profile.email || '')}</span></div><div class="list-item"><b>Роль</b>${esc(roleName(role))}</div></div></div>
      <div class="card"><h2>Быстрые действия</h2><div class="actions" style="justify-content:flex-start">${quickActions(role)}</div></div>
    </section>
    ${roleSections(role, groups)}
  </main>`;
  const reload = document.getElementById('reloadDashboard');
  if (reload) reload.onclick = load;
}

async function load() {
  document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю рабочий стол...</div></main>';
  loadWarning = '';
  try {
    data = await rpc('nav_v2_get_dashboard', {}, 15000);
    saveCachedProfile(data.profile);
    render();
  } catch (dashboardError) {
    try {
      const listData = await rpc('nav_v2_get_deals_list', { p_limit: 80 }, 15000);
      data = buildFallbackData(listData);
      saveCachedProfile(data.profile);
      loadWarning = 'Полный рабочий стол не загрузился, включен запасной режим по списку сделок. Карточки сделок доступны, но открытые задачи в этом режиме не показываются.';
      render();
    } catch (fallbackError) {
      document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error">Ошибка загрузки: ${esc(fallbackError.message || dashboardError.message || 'Supabase')}</div><div class="actions" style="justify-content:flex-start"><a class="btn light" href="./deals-v2.html">Открыть список сделок</a><a class="btn light" href="./spn-v2.html">Новая сделка</a><button class="btn primary" onclick="location.reload()">Обновить страницу</button></div></main>`;
    }
  }
}

async function init() {
  setupTop('dashboard');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  await load();
}

init();