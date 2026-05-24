import { setupTop, getCachedUser, renderAuthBox, rpc, esc, money, riskPill, statusText } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let currentData = null;

function list(data, key) { return Array.isArray(data?.[key]) ? data[key] : []; }
function dateText(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function metric(label, value, cls = '') { return `<div class="metric ${cls}"><span>${label}</span><b>${value}</b></div>`; }
function setPageStatus(text, type = 'info') {
  const el = document.getElementById('pageStatus');
  if (el) { el.className = 'status ' + type; el.textContent = text; }
}

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true
    || deal?.wizard_snapshot?.demo === true
    || String(deal?.title || '').startsWith('ДЕМО:');
}

function demoBadge(deal) {
  return isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span> ' : '';
}

function statusSelector(deal) {
  const statuses = [
    ['draft','Черновик'],['need_info','Нужно дозаполнить'],['need_lawyer','Юрист'],['need_broker','Брокер'],
    ['need_documents','Нужны документы'],['ready_for_deposit','Готова к задатку'],['deposit_done','Задаток внесен'],
    ['preparing_deal','Подготовка к сделке'],['ready_for_deal','Готова к сделке'],['registration','На регистрации'],
    ['registered','Зарегистрирована'],['closed','Закрыта'],['cancelled','Отменена']
  ];
  return `<div class="card"><h2>Управление сделкой</h2><div class="field"><label>Статус сделки</label><select id="dealStatus">${statuses.map(([id,title]) => `<option value="${id}" ${deal.status === id ? 'selected' : ''}>${title}</option>`).join('')}</select></div><div id="pageStatus" class="status">Можно изменить статус, отметить документы, закрыть задачи или добавить комментарий.</div><button id="saveStatus" class="btn primary" type="button">Сохранить статус</button></div>`;
}

function renderDocs(items) {
  if (!items.length) return '<div class="empty">Документы пока не сформированы.</div>';
  return `<div class="list">${items.map((doc) => `<div class="list-item"><div class="doc-status"><div><b>${esc(doc.title)}</b><span class="small">${esc(doc.category)} / ${esc(doc.side)}${doc.description ? ' — ' + esc(doc.description) : ''}</span></div><span class="pill ${doc.status === 'received' || doc.status === 'checked' ? 'green' : 'yellow'}">${esc(doc.status || 'needed')}</span></div><div class="actions" style="justify-content:flex-start"><button class="btn light" data-doc-status="received" data-doc-id="${doc.id}">Получен</button><button class="btn light" data-doc-status="checked" data-doc-id="${doc.id}">Проверен</button><button class="btn light" data-doc-status="needed" data-doc-id="${doc.id}">Нужен</button></div></div>`).join('')}</div>`;
}

function renderRisks(items) {
  if (!items.length) return '<div class="empty">Риски не обнаружены.</div>';
  return `<div class="list">${items.map((risk) => `<div class="list-item"><div>${riskPill(risk.level)} ${risk.blocks_deposit ? '<span class="pill red">блокирует задаток</span>' : ''} ${risk.blocks_deal ? '<span class="pill red">блокирует сделку</span>' : ''}</div><b>${esc(risk.title)}</b><p class="muted">${esc(risk.description || '')}</p><p><b>Рекомендация:</b> ${esc(risk.recommendation || 'Проверить с ответственным специалистом.')}</p></div>`).join('')}</div>`;
}

function renderExpenses(items) {
  if (!items.length) return '<div class="empty">Расходы пока не рассчитаны.</div>';
  const block = (title, sides) => {
    const allowedSides = Array.isArray(sides) ? sides : [sides];
    const filtered = items.filter((e) => allowedSides.includes(e.side));
    return `<div class="card" style="box-shadow:none"><h3>${title}</h3><div class="list">${filtered.map((e) => `<div class="list-item"><b>${esc(e.title)}</b><span class="small">${esc(e.category)} / сторона: ${esc(e.side)} / плательщик: ${esc(e.payer || 'не указан')}</span><p>${money(e.amount)} ${e.is_agreed ? '<span class="pill green">согласовано</span>' : '<span class="pill yellow">не согласовано</span>'}</p>${e.comment ? `<p class="muted">${esc(e.comment)}</p>` : ''}</div>`).join('') || '<div class="empty">Нет расходов</div>'}</div></div>`;
  };
  return `<div class="side-by-side">${block('Расходы покупателя','buyer')}${block('Расходы продавца','seller')}</div>${block('Общие и спорные расходы',['both','company','other_agency','external_party'])}`;
}

function renderTasks(items) {
  if (!items.length) return '<div class="empty">Задач пока нет.</div>';
  return `<div class="list">${items.map((task) => `<div class="list-item"><div><span class="pill ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'yellow' : 'blue'}">${esc(task.priority)}</span> <span class="pill">${esc(task.status)}</span></div><b>${esc(task.title)}</b><p class="muted">${esc(task.description || '')}</p><div class="actions" style="justify-content:flex-start"><button class="btn light" data-task-status="in_progress" data-task-id="${task.id}">В работе</button><button class="btn green" data-task-status="done" data-task-id="${task.id}">Готово</button><button class="btn light" data-task-status="open" data-task-id="${task.id}">Открыта</button></div></div>`).join('')}</div>`;
}

function renderComments(items) {
  return `<div class="list">${items.map((c) => `<div class="list-item"><b>${esc(c.author_role || 'Комментарий')}</b><span class="small">${dateText(c.created_at)}</span><p>${esc(c.body)}</p></div>`).join('') || '<div class="empty">Комментариев пока нет.</div>'}</div><div class="field"><label>Новый комментарий</label><textarea id="newComment" placeholder="Напишите комментарий для команды, юриста, брокера или менеджера"></textarea></div><button id="addComment" class="btn primary" type="button">Добавить комментарий</button>`;
}

function renderEvents(items) {
  if (!items.length) return '<div class="empty">История пока пустая.</div>';
  return `<div class="timeline">${items.map((event) => `<div class="list-item"><b>${esc(event.event_title)}</b><span class="small">${dateText(event.created_at)}</span></div>`).join('')}</div>`;
}

function renderCard(data) {
  currentData = data;
  const deal = data.deal;
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>${demoBadge(deal)}${esc(deal.title)}</h1><p>${esc(deal.next_action || 'Проверить карточку и определить следующий шаг.')}</p></section>
    ${isDemoDeal(deal) ? '<div class="status ok">Это демо-сделка. Ее можно безопасно пересоздать или удалить через админку демо-данных.</div>' : ''}
    <div class="kpi-row">
      ${metric('К задатку', (deal.readiness_deposit || 0) + '%', deal.readiness_deposit >= 80 ? 'green' : 'yellow')}
      ${metric('К сделке', (deal.readiness_deal || 0) + '%', deal.readiness_deal >= 80 ? 'green' : 'yellow')}
      ${metric('Статус', statusText(deal.status))}
      ${metric('Риск', riskPill(deal.risk_level))}
    </div>
    <section class="grid"><div class="card"><h2>Суть сделки</h2><div class="list"><div class="list-item"><b>Тип</b>${isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span>' : '<span class="pill green">Рабочая</span>'}</div><div class="list-item"><b>Объект</b>${esc(deal.object_type || '—')}</div><div class="list-item"><b>Адрес</b>${esc(deal.address || '—')}</div><div class="list-item"><b>Цена</b>${money(deal.price_total)}</div><div class="list-item"><b>Представительство</b>${esc(deal.representation_model || '—')}</div></div></div>${statusSelector(deal)}</section>
    <section class="card"><h2>Риски и рекомендации</h2>${renderRisks(list(data,'risks'))}</section>
    <section class="card"><h2>Документы</h2>${renderDocs(list(data,'documents'))}</section>
    <section class="card"><h2>Расходы</h2>${renderExpenses(list(data,'expenses'))}</section>
    <section class="card"><h2>Задачи</h2>${renderTasks(list(data,'tasks'))}</section>
    <section class="card"><h2>Комментарии</h2>${renderComments(list(data,'comments'))}</section>
    <section class="card"><h2>История</h2>${renderEvents(list(data,'events'))}</section>
  </main>`;
  bindActions();
}

function bindActions() {
  const statusBtn = document.getElementById('saveStatus');
  if (statusBtn) statusBtn.onclick = async () => {
    try { setPageStatus('Сохраняю статус...'); await rpc('nav_v2_update_deal_status', { p_deal_id: dealId, p_status: document.getElementById('dealStatus').value }); await load(); }
    catch (e) { setPageStatus('Ошибка: ' + e.message, 'error'); }
  };
  document.querySelectorAll('[data-doc-id]').forEach((btn) => btn.onclick = async () => {
    try { setPageStatus('Обновляю документ...'); await rpc('nav_v2_update_document_status', { p_document_id: btn.dataset.docId, p_status: btn.dataset.docStatus }); await load(); }
    catch (e) { setPageStatus('Ошибка документа: ' + e.message, 'error'); }
  });
  document.querySelectorAll('[data-task-id]').forEach((btn) => btn.onclick = async () => {
    try { setPageStatus('Обновляю задачу...'); await rpc('nav_v2_update_task_status', { p_task_id: btn.dataset.taskId, p_status: btn.dataset.taskStatus }); await load(); }
    catch (e) { setPageStatus('Ошибка задачи: ' + e.message, 'error'); }
  });
  const add = document.getElementById('addComment');
  if (add) add.onclick = async () => {
    const body = document.getElementById('newComment').value.trim();
    try { setPageStatus('Добавляю комментарий...'); await rpc('nav_v2_add_comment', { p_deal_id: dealId, p_body: body, p_visibility: 'team' }); await load(); }
    catch (e) { setPageStatus('Ошибка комментария: ' + e.message, 'error'); }
  };
}

async function load() {
  if (!dealId) { document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status error">Не указан id сделки.</div></main>'; return; }
  document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю карточку сделки...</div></main>';
  try { renderCard(await rpc('nav_v2_get_deal_card', { p_deal_id: dealId })); }
  catch (error) { document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error">Ошибка загрузки: ${esc(error.message)}</div></main>`; }
}

async function init() { setupTop('deals'); if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload()); await load(); }
init();