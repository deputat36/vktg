import { getCachedUser, renderAuthBox, rpc, esc, money, statusText } from './supabase-v2.js?v=20260625-1230';

const app = document.getElementById('app');
const dealId = new URLSearchParams(location.search).get('id') || '';
let data = null;
let active = location.hash ? location.hash.replace('#', '') : 'overview';
let source = 'lite';

function arr(key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function date(value) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

function metric(title, value, cls = '') {
  return `<div class="metric ${cls}"><span>${esc(title)}</span><b>${value ?? '—'}</b></div>`;
}

function docStatus(status) {
  return ({ needed: 'нужен', requested: 'запрошен', received: 'получен', checked: 'проверен', problem: 'проблема' })[status] || status || 'нужен';
}

function taskStatus(status) {
  return ({ open: 'открыта', in_progress: 'в работе', done: 'готово', cancelled: 'отменена' })[status] || status || 'открыта';
}

function role(role) {
  return ({ spn: 'СПН', lawyer: 'юрист', broker: 'брокер', manager: 'менеджер', owner: 'owner', admin: 'admin' })[role] || role || 'роль не указана';
}

function tab(id, title, count = null) {
  return `<button class="tab ${active === id ? 'active' : ''}" data-tab="${id}" type="button">${esc(title)}${count !== null ? ` (${count})` : ''}</button>`;
}

function docsHtml() {
  const docs = arr('documents');
  if (!docs.length) return '<div class="empty">Документы пока не сформированы.</div>';
  return `<div class="list">${docs.map((doc) => `<div class="list-item"><b>${esc(doc.title)}</b><span class="small">${esc(docStatus(doc.status))} · ${esc(doc.side || '')} · ${esc(role(doc.responsible_role))}</span>${doc.problem_note ? `<p>${esc(doc.problem_note)}</p>` : ''}</div>`).join('')}</div>`;
}

function tasksHtml() {
  const tasks = arr('tasks');
  if (!tasks.length) return '<div class="empty">Задач пока нет.</div>';
  return `<div class="list">${tasks.map((task) => `<div class="list-item"><b>${esc(task.title)}</b><span class="small">${esc(taskStatus(task.status))} · ${esc(role(task.assigned_role))} · ${esc(task.priority || '')}</span>${task.description ? `<p>${esc(task.description)}</p>` : ''}</div>`).join('')}</div>`;
}

function risksHtml() {
  const risks = arr('risks');
  if (!risks.length) return '<div class="empty">Риски не обнаружены.</div>';
  return `<div class="list">${risks.map((risk) => `<div class="list-item"><b>${esc(risk.title)}</b><span class="small">${esc(risk.level || '')}</span><p>${esc(risk.description || '')}</p></div>`).join('')}</div>`;
}

function commentsHtml() {
  const comments = arr('comments');
  if (!comments.length) return '<div class="empty">Комментариев пока нет.</div>';
  return `<div class="list">${comments.map((comment) => `<div class="list-item"><b>${esc(comment.author_role || 'комментарий')}</b><span class="small">${date(comment.created_at)}</span><p>${esc(comment.body || '')}</p></div>`).join('')}</div>`;
}

function overviewHtml() {
  const deal = data?.deal || {};
  const docs = arr('documents');
  const tasks = arr('tasks');
  const missingDocs = docs.filter((doc) => doc.is_required && !['received', 'checked', 'not_required'].includes(doc.status)).length;
  const openTasks = tasks.filter((task) => ['open', 'in_progress'].includes(task.status)).length;
  return `<section class="grid">
    <div class="card"><h2>Суть сделки</h2><div class="list"><div class="list-item"><b>Адрес</b>${esc(deal.address || '—')}</div><div class="list-item"><b>Цена</b>${money(deal.price_total)}</div><div class="list-item"><b>Статус</b>${esc(statusText(deal.status))}</div><div class="list-item"><b>Создана</b>${date(deal.created_at)}</div></div></div>
    <div class="card"><h2>Контроль</h2><div class="list"><div class="list-item"><b>Следующий шаг</b>${esc(deal.next_action || 'Проверить карточку')}</div><div class="list-item"><b>Документы</b>${missingDocs ? `<span class="pill yellow">не хватает: ${missingDocs}</span>` : '<span class="pill green">критичных долгов нет</span>'}</div><div class="list-item"><b>Задачи</b>${openTasks ? `<span class="pill yellow">открытых: ${openTasks}</span>` : '<span class="pill green">открытых нет</span>'}</div><div class="list-item"><b>Расчёты</b>${deal.settlements_agreed ? '<span class="pill green">согласованы</span>' : '<span class="pill yellow">не согласованы</span>'}</div></div></div>
  </section>`;
}

function tabContent() {
  if (active === 'docs') return `<section class="card"><h2>Документы</h2>${docsHtml()}</section>`;
  if (active === 'tasks') return `<section class="card"><h2>Задачи</h2>${tasksHtml()}</section>`;
  if (active === 'risks') return `<section class="card"><h2>Риски</h2>${risksHtml()}</section>`;
  if (active === 'comments') return `<section class="card"><h2>Комментарии</h2>${commentsHtml()}</section>`;
  return overviewHtml();
}

function render() {
  const deal = data?.deal || {};
  const docs = arr('documents');
  const tasks = arr('tasks');
  const risks = arr('risks');
  const title = deal.display_title || deal.title || 'Карточка сделки';
  const openTasks = tasks.filter((task) => ['open', 'in_progress'].includes(task.status)).length;
  const missingDocs = docs.filter((doc) => doc.is_required && !['received', 'checked', 'not_required'].includes(doc.status)).length;
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>${esc(title)}</h1><p>${esc(deal.address || deal.next_action || 'Безопасный вход в карточку без старого кэша.')}</p></section>
    <section class="card">
      <div class="status ok">Безопасный режим: карточка загружена через ${source === 'lite' ? 'облегчённую RPC' : 'полную RPC fallback'} с принудительным обновлением Supabase-клиента.</div>
      <div class="actions" style="justify-content:flex-start"><a class="btn primary" href="./deal-card-v2.html?id=${encodeURIComponent(dealId)}&cache=${Date.now()}">Открыть полную карточку</a><a class="btn light" href="./deals-v2.html">К списку сделок</a><a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a></div>
    </section>
    <section class="kpi-row">${metric('Статус', statusText(deal.status))}${metric('Цена', money(deal.price_total))}${metric('Документы', missingDocs, missingDocs ? 'yellow' : 'green')}${metric('Задачи', openTasks, openTasks ? 'yellow' : 'green')}</section>
    <section class="card"><div class="tabs">${tab('overview','Сводка')}${tab('docs','Документы',docs.length)}${tab('tasks','Задачи',tasks.length)}${tab('risks','Риски',risks.length)}${tab('comments','Комментарии',arr('comments').length)}</div></section>
    ${tabContent()}
  </main>`;
  document.querySelectorAll('[data-tab]').forEach((button) => button.onclick = () => {
    active = button.dataset.tab || 'overview';
    history.replaceState(null, '', `${location.pathname}${location.search}#${active}`);
    render();
  });
}

async function loadCardData() {
  try {
    source = 'lite';
    return await rpc('nav_v2_get_deal_card_lite', { p_deal_id: dealId }, 30000);
  } catch (_) {
    source = 'full';
    return await rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 60000);
  }
}

async function load() {
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  if (!dealId) {
    app.innerHTML = '<main class="nav-v2-shell"><div class="status error">Не указан id сделки.</div></main>';
    return;
  }
  app.innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю безопасную карточку...</div></main>';
  try {
    data = await loadCardData();
    render();
  } catch (error) {
    app.innerHTML = `<main class="nav-v2-shell"><section class="hero"><h1>Ошибка безопасной карточки</h1></section><div class="status error">${esc(error.message || error)}</div><div class="actions" style="justify-content:flex-start"><a class="btn light" href="./deal-card-check-v2.html?id=${encodeURIComponent(dealId)}">Проверка карточки</a><a class="btn light" href="./deals-v2.html">К списку</a></div></main>`;
  }
}

load();
