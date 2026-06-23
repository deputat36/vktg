import { setupTop, getCachedUser, renderAuthBox, rpc, esc, money, riskPill, statusText } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let currentData = null;
let currentProfile = null;
let activeTab = location.hash ? location.hash.replace('#', '') : 'overview';

function list(data, key) { return Array.isArray(data?.[key]) ? data[key] : []; }
function dateText(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function dateShort(value) { return value ? new Date(value).toLocaleDateString('ru-RU') : '—'; }
function metric(label, value, cls = '') { return `<div class="metric ${cls}"><span>${label}</span><b>${value ?? '—'}</b></div>`; }
function countOpenTasks(items) { return items.filter((task) => ['open', 'in_progress'].includes(task.status)).length; }
function countMissingDocs(items) { return items.filter((doc) => doc.is_required && !['received', 'checked'].includes(doc.status)).length; }
function countRedRisks(items) { return items.filter((risk) => risk.level === 'red' && risk.is_resolved !== true).length; }
function countBlockingReviews(items) { return items.filter((review) => review.blocks_deposit || review.blocks_deal || review.decision === 'blocked').length; }
function isLawyer() { return currentProfile?.role === 'lawyer'; }
function setPageStatus(text, type = 'info') {
  const el = document.getElementById('pageStatus');
  if (el) { el.className = 'status ' + type; el.textContent = text; }
}

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true
    || deal?.wizard_snapshot?.demo === true
    || String(deal?.title || '').startsWith('ДЕМО:');
}

function demoBadge(deal) { return isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span> ' : ''; }

function norm(value) {
  return String(value || '').trim();
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

function docCategoryLabel(category) {
  return ({
    identity: 'личность',
    object: 'объект',
    basis: 'основание права',
    utilities: 'справки и коммунальные',
    land: 'земля',
    children: 'дети / опека',
    share: 'доля / сособственники',
    mortgage: 'ипотека',
    money: 'деньги',
    other: 'другое'
  })[category] || category || 'категория не указана';
}

function sideLabel(side) {
  return ({
    seller: 'продавец',
    buyer: 'покупатель',
    both: 'обе стороны',
    company: 'компания',
    other_agency: 'партнер',
    external_party: 'внешняя сторона'
  })[side] || side || 'сторона не указана';
}

function docStatusLabel(status) {
  return ({
    needed: 'нужен',
    requested: 'запрошен',
    received: 'получен',
    checked: 'проверен',
    problem: 'проблема'
  })[status] || status || 'нужен';
}

function taskStatusLabel(status) {
  return ({
    open: 'открыта',
    in_progress: 'в работе',
    done: 'готово',
    cancelled: 'отменена'
  })[status] || status || 'открыта';
}

function taskPriorityLabel(priority) {
  return ({
    urgent: 'срочно',
    high: 'важно',
    normal: 'обычно',
    low: 'низкий'
  })[priority] || priority || 'обычно';
}

function isGenericTitle(title) {
  const text = norm(title).toLowerCase();
  return !text
    || text.includes('продавец не указан')
    || text.includes('покупатель не указан')
    || text.includes('адрес не указан');
}

function dealDisplayTitle(deal) {
  const explicitTitle = norm(deal?.display_title);
  if (explicitTitle) return explicitTitle;
  const storedTitle = norm(deal?.title);
  if (!isGenericTitle(storedTitle)) return storedTitle;
  return `${objectTypeName(deal?.object_type)} — ${norm(deal?.address) || 'адрес уточняется'}`;
}

function findPersonNames(deal, side) {
  const summary = deal?.deal_summary || {};
  const snapshot = deal?.wizard_snapshot || {};
  const sideData = snapshot?.[side] || snapshot?.[`${side}Info`] || {};
  const keys = side === 'seller'
    ? ['seller_last_name','seller_name','seller_fio','seller_full_name','seller']
    : ['buyer_last_name','buyer_name','buyer_fio','buyer_full_name','buyer'];
  const values = [];
  for (const key of keys) {
    values.push(deal?.[key], summary?.[key], sideData?.[key], snapshot?.[key]);
  }
  return values.map(norm).find(Boolean) || '';
}

function dealPartiesLine(deal) {
  const seller = findPersonNames(deal, 'seller');
  const buyer = findPersonNames(deal, 'buyer');
  const parts = [];
  if (seller) parts.push(`продавец: ${seller}`);
  if (buyer) parts.push(`покупатель: ${buyer}`);
  return parts.join(' · ');
}

function dealHeadline(deal) {
  const title = dealDisplayTitle(deal);
  if (isLawyer()) return `Юридическая проверка: ${title}`;
  return title;
}

function confirmDemoAction(actionText) {
  const deal = currentData?.deal;
  if (!isDemoDeal(deal)) return true;
  return confirm(`Это демо-сделка. Подтвердите тестовое действие: ${actionText}. Реальные сделки не будут затронуты.`);
}

function dealModePanel(deal) {
  if (isDemoDeal(deal)) return `<div class="status ok"><span class="pill blue">ДЕМО</span> Тестовая карточка. Действия безопасны, но перед сохранением появится подтверждение.</div>`;
  return `<div class="status ok"><span class="pill green">Рабочая</span> Реальная сделка Навигатора. Все изменения сохраняются в CRM.</div>`;
}

function statusSelector(deal) {
  const statuses = [
    ['draft','Черновик'],['need_info','Нужно дозаполнить'],['need_lawyer','Юрист'],['need_broker','Брокер'],
    ['need_documents','Нужны документы'],['ready_for_deposit','Готова к задатку'],['deposit_done','Задаток внесен'],
    ['preparing_deal','Подготовка к сделке'],['ready_for_deal','Готова к сделке'],['registration','На регистрации'],
    ['registered','Зарегистрирована'],['closed','Закрыта'],['cancelled','Отменена']
  ];
  return `<div class="card" style="box-shadow:none">
    <h3>Статус сделки</h3>
    <div class="field"><label>Текущий статус</label><select id="dealStatus">${statuses.map(([id,title]) => `<option value="${id}" ${deal.status === id ? 'selected' : ''}>${title}</option>`).join('')}</select></div>
    <button id="saveStatus" class="btn primary" type="button">Сохранить статус</button>
  </div>`;
}

function lawyerQuickActions(deal) {
  return `<section class="card">
    <div class="section-title">
      <div>
        <h2>Юридические действия</h2>
        <p class="muted">Кнопки фиксируют структурированное решение юриста и меняют рабочий статус сделки.</p>
      </div>
      ${riskPill(deal.risk_level)}
    </div>
    <div id="pageStatus" class="status">Проверьте риски, документы и условия. После проверки выберите юридическое действие.</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn green" data-legal-action="checked" type="button">Проверено юристом</button>
      <button class="btn light" data-legal-action="need_documents" type="button">Нужны документы</button>
      <button class="btn red" data-legal-action="stop_factor" type="button">Есть стоп-фактор</button>
      <button class="btn light" data-legal-action="return_spn" type="button">Вернуть СПН</button>
      <button class="btn light" data-tab-shortcut="docs" type="button">К документам</button>
      <button class="btn light" data-tab-shortcut="reviews" type="button">К решениям</button>
    </div>
  </section>`;
}

function quickActions(deal) {
  if (isLawyer()) return lawyerQuickActions(deal);
  return `<section class="card">
    <div class="section-title">
      <div>
        <h2>Быстрые действия</h2>
        <p class="muted">Кнопки меняют статус сделки и помогают быстро передать ее нужному специалисту.</p>
      </div>
      ${riskPill(deal.risk_level)}
    </div>
    <div id="pageStatus" class="status">Выберите действие или перейдите во вкладку нужного раздела.</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn light" data-quick-status="need_lawyer" type="button">Передать юристу</button>
      <button class="btn light" data-quick-status="need_broker" type="button">Передать брокеру</button>
      <button class="btn green" data-quick-status="ready_for_deposit" type="button">Готово к задатку</button>
      <button class="btn green" data-quick-status="ready_for_deal" type="button">Готово к сделке</button>
      <button class="btn light" data-quick-status="need_documents" type="button">Нужны документы</button>
    </div>
  </section>`;
}

function lawyerHandoffIssues(data) {
  const deal = data?.deal || {};
  const docs = list(data, 'documents');
  const tasks = list(data, 'tasks');
  const risks = list(data, 'risks');
  const reviews = list(data, 'reviews');
  const issues = [];
  const missingDocs = countMissingDocs(docs);
  const redRisks = countRedRisks(risks);
  const blockingReviews = countBlockingReviews(reviews);
  const urgentTasks = tasks.filter((task) => ['urgent', 'high'].includes(task.priority) && ['open','in_progress'].includes(task.status)).length;

  if (missingDocs) issues.push(`Не хватает обязательных документов: ${missingDocs}.`);
  if (redRisks) issues.push(`Есть красные риски: ${redRisks}.`);
  if (blockingReviews) issues.push(`Есть блокирующие решения проверки: ${blockingReviews}.`);
  if (urgentTasks) issues.push(`Есть срочные/важные открытые задачи: ${urgentTasks}.`);
  if (!deal.expenses_agreed) issues.push('Расходы между сторонами не согласованы.');
  if (!deal.settlements_agreed) issues.push('Порядок расчетов не согласован.');
  if ((deal.readiness_deposit || 0) < 70) issues.push(`Готовность к задатку низкая: ${deal.readiness_deposit || 0}%.`);
  if ((deal.readiness_deal || 0) < 60) issues.push(`Готовность к сделке низкая: ${deal.readiness_deal || 0}%.`);

  return { issues, missingDocs, redRisks, blockingReviews, urgentTasks, ok: issues.length === 0 };
}

function lawyerReturnText() {
  const h = lawyerHandoffIssues(currentData);
  const lines = ['Юрист: карточка возвращена СПН на доработку. Нужно уточнить данные, документы или условия сделки.'];
  if (h.issues.length) {
    lines.push('', 'Что доработать:');
    h.issues.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  } else {
    lines.push('', 'Комментарий юриста: требуется уточнить детали перед продолжением подготовки сделки.');
  }
  lines.push('', 'После исправления нажмите «Отправить на повторную проверку» в верхнем блоке карточки.');
  return lines.join('\n');
}

function spnBeforeLawyerPanel(data) {
  if (isLawyer()) return '';
  const deal = data.deal;
  const h = lawyerHandoffIssues(data);
  return `<section class="card" style="border:2px solid ${h.ok ? 'rgba(22,163,74,.22)' : 'rgba(245,158,11,.28)'}">
    <div class="section-title">
      <div>
        <h2>Перед передачей юристу</h2>
        <p class="muted">Это контроль качества заявки для СПН. Задача — передать юристу не поток вопросов, а собранную карточку с понятными пробелами.</p>
      </div>
      <span class="pill ${h.ok ? 'green' : 'yellow'}">${h.ok ? 'можно передавать' : 'есть пробелы'}</span>
    </div>
    <div class="kpi-row">
      ${metric('К задатку', (deal.readiness_deposit || 0) + '%', deal.readiness_deposit >= 80 ? 'green' : 'yellow')}
      ${metric('К сделке', (deal.readiness_deal || 0) + '%', deal.readiness_deal >= 80 ? 'green' : 'yellow')}
      ${metric('Документы', h.missingDocs, h.missingDocs ? 'yellow' : 'green')}
      ${metric('Красные риски', h.redRisks, h.redRisks ? 'red' : 'green')}
    </div>
    <div class="status ${h.ok ? 'ok' : 'warn'}">${h.ok ? 'Ключевые пробелы не обнаружены. Передайте юристу и добавьте короткий комментарий, если есть нюансы.' : 'Перед передачей юристу желательно привести карточку в порядок или явно написать, чего не хватает.'}</div>
    <div class="list">
      ${h.issues.length ? h.issues.map((item) => `<div class="list-item">${esc(item)}</div>`).join('') : '<div class="list-item">Ключевые документы, риски, расходы и расчеты выглядят достаточно собранными.</div>'}
    </div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn light" data-tab-shortcut="docs" type="button">Проверить документы</button>
      <button class="btn light" data-tab-shortcut="risks" type="button">Проверить риски</button>
      <button class="btn light" data-tab-shortcut="reviews" type="button">Проверить решения</button>
      <button class="btn light" data-tab-shortcut="comments" type="button">Написать комментарий</button>
    </div>
  </section>`;
}

function reviewMeta(decision) {
  return ({
    approved: ['Одобрено', 'green'],
    need_info: ['Нужна информация', 'yellow'],
    blocked: ['Блокировано', 'red']
  })[decision] || [decision || 'Решение', 'blue'];
}

function reviewPill(review) {
  const [label, cls] = reviewMeta(review?.decision);
  return `<span class="pill ${cls}">${esc(label)}</span>`;
}

function legalPanel(data) {
  const deal = data.deal;
  const docs = list(data, 'documents');
  const risks = list(data, 'risks');
  const reviews = list(data, 'reviews');
  const latestReview = reviews[0] || null;
  const missingDocs = countMissingDocs(docs);
  const redRisks = countRedRisks(risks);
  const blockingReviews = countBlockingReviews(reviews);
  return `<section class="card" style="border:2px solid rgba(220,38,38,.16)">
    <div class="section-title">
      <div><h2>Юридический профиль сделки</h2><p class="muted">Короткая карта проверки для юриста: риски, документы, решения, дети, ипотека, расходы и расчеты.</p></div>
      <span class="pill yellow">lawyer</span>
    </div>
    <div class="kpi-row">
      ${metric('Красные риски', redRisks, redRisks ? 'red' : 'green')}
      ${metric('Не хватает документов', missingDocs, missingDocs ? 'yellow' : 'green')}
      ${metric('Блокирующие решения', blockingReviews, blockingReviews ? 'red' : 'green')}
      ${metric('Последнее решение', latestReview ? reviewPill(latestReview) : '—')}
    </div>
    <div class="list">
      <div class="list-item"><b>Статус</b>${statusText(deal.status)}</div>
      <div class="list-item"><b>Следующий шаг</b>${esc(deal.next_action || 'Проверить юридические риски и пакет документов.')}</div>
      <div class="list-item"><b>Расходы</b>${deal.expenses_agreed ? '<span class="pill green">согласованы</span>' : '<span class="pill yellow">не согласованы</span>'}</div>
      <div class="list-item"><b>Расчеты</b>${deal.settlements_agreed ? '<span class="pill green">согласованы</span>' : '<span class="pill yellow">не согласованы</span>'}</div>
    </div>
  </section>`;
}

function docStatusClass(doc) {
  if (doc.status === 'checked') return 'green';
  if (doc.status === 'received') return 'blue';
  if (doc.status === 'problem') return 'red';
  return 'yellow';
}

function docDuePill(doc) {
  if (!doc.due_date || doc.status === 'checked') return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(doc.due_date);
  due.setHours(0, 0, 0, 0);
  const cls = due < today ? 'red' : 'blue';
  return `<span class="pill ${cls}">срок: ${dateShort(doc.due_date)}</span>`;
}

function roleLabel(role) {
  return ({ owner: 'owner', admin: 'admin', manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'брокер', viewer: 'наблюдатель' })[role] || role || 'не назначен';
}

function canChangeTaskStatus(task) {
  const role = currentProfile?.role;
  const userId = currentProfile?.id;
  if (!role || !userId) return false;
  if (['owner', 'admin'].includes(role)) return true;
  if (role === 'manager') return true;
  if (task.assigned_to && task.assigned_to === userId) return true;
  return !task.assigned_to && task.assigned_role === role;
}

function taskActions(task) {
  if (canChangeTaskStatus(task)) {
    return `<div class="actions" style="justify-content:flex-start"><button class="btn light" data-task-status="in_progress" data-task-id="${task.id}">В работе</button><button class="btn green" data-task-status="done" data-task-id="${task.id}">Готово</button><button class="btn light" data-task-status="open" data-task-id="${task.id}">Открыта</button></div>`;
  }
  return `<div class="status warn">Задача закреплена за ролью «${esc(roleLabel(task.assigned_role))}». Вы видите ее для контроля, но статус меняет ответственный специалист.</div>`;
}

function renderDocs(items) {
  if (!items.length) return '<div class="empty">Документы пока не сформированы.</div>';
  return `<div class="list">${items.map((doc) => {
    const note = doc.problem_note || doc.status_note || '';
    const category = docCategoryLabel(doc.category);
    const side = sideLabel(doc.side);
    return `<div class="list-item">
      <div class="doc-status">
        <div>
          <b>${esc(doc.title)}</b>
          <span class="small">${esc(category)} / ${esc(side)}${doc.description ? ' — ' + esc(doc.description) : ''}</span>
        </div>
        <span class="pill ${docStatusClass(doc)}">${esc(docStatusLabel(doc.status))}</span>
      </div>
      <div class="actions" style="justify-content:flex-start;margin-top:8px">
        <span class="pill blue">ответственный: ${esc(roleLabel(doc.responsible_role))}</span>
        ${docDuePill(doc)}
        ${doc.required_for_deposit ? '<span class="pill yellow">до задатка</span>' : ''}
        ${doc.required_for_deal ? '<span class="pill">до сделки</span>' : ''}
      </div>
      ${note ? `<p class="muted"><b>Заметка:</b> ${esc(note)}</p>` : ''}
      <div class="actions" style="justify-content:flex-start">
        <button class="btn light" data-doc-status="received" data-doc-id="${doc.id}">Получен</button>
        <button class="btn green" data-doc-status="checked" data-doc-id="${doc.id}">Проверен</button>
        <button class="btn red" data-doc-status="problem" data-doc-id="${doc.id}">Проблема</button>
        <button class="btn light" data-doc-status="needed" data-doc-id="${doc.id}">Нужен</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function renderRisks(items) {
  if (!items.length) return '<div class="empty">Риски не обнаружены.</div>';
  return `<div class="list">${items.map((risk) => `<div class="list-item"><div>${riskPill(risk.level)} ${risk.blocks_deposit ? '<span class="pill red">блокирует задаток</span>' : ''} ${risk.blocks_deal ? '<span class="pill red">блокирует сделку</span>' : ''}</div><b>${esc(risk.title)}</b><p class="muted">${esc(risk.description || '')}</p><p><b>Рекомендация:</b> ${esc(risk.recommendation || 'Проверить с ответственным специалистом.')}</p></div>`).join('')}</div>`;
}

function renderReviews(items) {
  if (!items.length) return '<div class="empty">Решений проверки пока нет.</div>';
  return `<div class="list">${items.map((review) => `<div class="list-item">
    <div class="actions" style="justify-content:flex-start">
      ${reviewPill(review)}
      <span class="pill blue">${esc(roleLabel(review.reviewer_role))}</span>
      ${review.blocks_deposit ? '<span class="pill red">блокирует задаток</span>' : ''}
      ${review.blocks_deal ? '<span class="pill red">блокирует сделку</span>' : ''}
    </div>
    <span class="small">${dateText(review.created_at)}</span>
    ${review.body ? `<p>${esc(review.body)}</p>` : '<p class="muted">Комментарий к решению не указан.</p>'}
  </div>`).join('')}</div>`;
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
  const filtered = isLawyer() ? items.filter((task) => !task.assigned_role || task.assigned_role === 'lawyer' || task.assigned_role === 'spn') : items;
  if (!filtered.length) return '<div class="empty">Задач по этому профилю пока нет.</div>';
  return `<div class="list">${filtered.map((task) => `<div class="list-item"><div><span class="pill ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'yellow' : 'blue'}">${esc(taskPriorityLabel(task.priority))}</span> <span class="pill">${esc(taskStatusLabel(task.status))}</span> ${task.assigned_role ? `<span class="pill blue">${esc(roleLabel(task.assigned_role))}</span>` : ''}</div><b>${esc(task.title)}</b><p class="muted">${esc(task.description || '')}</p>${taskActions(task)}</div>`).join('')}</div>`;
}

function renderComments(items) {
  const placeholder = isLawyer() ? 'Юридический комментарий: что проверено, чего не хватает, есть ли стоп-факторы, что должен сделать СПН' : 'Напишите комментарий для команды, юриста, брокера или менеджера';
  const title = isLawyer() ? 'Юридический комментарий' : 'Новый комментарий';
  return `<div class="list">${items.map((c) => `<div class="list-item"><b>${esc(c.author_role || 'Комментарий')}</b><span class="small">${dateText(c.created_at)}</span><p>${esc(c.body)}</p></div>`).join('') || '<div class="empty">Комментариев пока нет.</div>'}</div><div class="field"><label>${title}</label><textarea id="newComment" placeholder="${placeholder}"></textarea></div><button id="addComment" class="btn primary" type="button">Добавить комментарий</button>`;
}

function renderEvents(items) {
  if (!items.length) return '<div class="empty">История пока пустая.</div>';
  return `<div class="timeline">${items.map((event) => `<div class="list-item"><b>${esc(event.event_title)}</b><span class="small">${dateText(event.created_at)}</span></div>`).join('')}</div>`;
}

function overview(data) {
  const deal = data.deal;
  const docs = list(data, 'documents');
  const risks = list(data, 'risks');
  const tasks = list(data, 'tasks');
  const reviews = list(data, 'reviews');
  const missingDocs = countMissingDocs(docs);
  const redRisks = countRedRisks(risks);
  const openTasks = countOpenTasks(tasks);
  const blockingReviews = countBlockingReviews(reviews);
  const partiesLine = dealPartiesLine(deal);
  return `<section class="grid">
    <div class="card"><h2>Суть сделки</h2><div class="list"><div class="list-item"><b>Тип</b>${isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span>' : '<span class="pill green">Рабочая</span>'}</div><div class="list-item"><b>Объект</b>${esc(objectTypeName(deal.object_type))}</div><div class="list-item"><b>Адрес</b>${esc(deal.address || '—')}</div>${partiesLine ? `<div class="list-item"><b>Стороны</b>${esc(partiesLine)}</div>` : ''}<div class="list-item"><b>Цена</b>${money(deal.price_total)}</div><div class="list-item"><b>Представительство</b>${esc(deal.representation_model || '—')}</div><div class="list-item"><b>Создана</b>${dateText(deal.created_at)}</div></div></div>
    <div class="card"><h2>${isLawyer() ? 'Юридический контроль' : 'Контроль'}</h2><div class="list"><div class="list-item"><b>Следующий шаг</b>${esc(deal.next_action || 'Проверить карточку')}</div><div class="list-item"><b>Риски</b>${redRisks ? `<span class="pill red">красных: ${redRisks}</span>` : '<span class="pill green">красных нет</span>'}</div><div class="list-item"><b>Документы</b>${missingDocs ? `<span class="pill yellow">не хватает: ${missingDocs}</span>` : '<span class="pill green">критичных долгов нет</span>'}</div><div class="list-item"><b>Решения</b>${blockingReviews ? `<span class="pill red">блокирующих: ${blockingReviews}</span>` : '<span class="pill green">блокирующих нет</span>'}</div><div class="list-item"><b>Задачи</b>${openTasks ? `<span class="pill yellow">открытых: ${openTasks}</span>` : '<span class="pill green">открытых нет</span>'}</div><div class="list-item"><b>Расходы</b>${deal.expenses_agreed ? '<span class="pill green">согласованы</span>' : '<span class="pill yellow">не согласованы</span>'}</div><div class="list-item"><b>Расчеты</b>${deal.settlements_agreed ? '<span class="pill green">согласованы</span>' : '<span class="pill yellow">не согласованы</span>'}</div></div></div>
  </section>
  <section class="grid"><div>${statusSelector(deal)}</div><div class="card" style="box-shadow:none"><h3>Ответственные очереди</h3><div class="list"><div class="list-item"><b>Юрист</b>${deal.lawyer_needed ? '<span class="pill yellow">нужен</span>' : '<span class="pill green">не требуется</span>'}</div><div class="list-item"><b>Брокер</b>${deal.broker_needed ? '<span class="pill yellow">нужен</span>' : '<span class="pill green">не требуется</span>'}</div><div class="list-item"><b>Дети / опека / детские деньги</b>${deal.has_children ? '<span class="pill red">есть</span>' : '<span class="pill green">нет</span>'}</div><div class="list-item"><b>Ипотека</b>${deal.has_mortgage ? '<span class="pill yellow">есть</span>' : '<span class="pill green">нет</span>'}</div></div></div></section>`;
}

function tabButton(id, title, count = null) { return `<button class="tab ${activeTab === id ? 'active' : ''}" data-tab="${id}" type="button">${title}${count !== null ? ` (${count})` : ''}</button>`; }

function renderTabs(data) {
  const defaultTabs = [
    tabButton('overview', 'Сводка'), tabButton('risks', 'Риски', list(data,'risks').length), tabButton('docs', 'Документы', list(data,'documents').length),
    tabButton('reviews', 'Решения', list(data,'reviews').length), tabButton('tasks', 'Задачи', list(data,'tasks').length), tabButton('expenses', 'Расходы', list(data,'expenses').length), tabButton('comments', 'Комментарии', list(data,'comments').length), tabButton('history', 'История', list(data,'events').length)
  ];
  const lawyerTabs = [
    tabButton('risks', 'Риски', list(data,'risks').length), tabButton('docs', 'Документы', list(data,'documents').length), tabButton('reviews', 'Решения', list(data,'reviews').length), tabButton('tasks', 'Задачи', list(data,'tasks').length),
    tabButton('comments', 'Комментарии', list(data,'comments').length), tabButton('overview', 'Сводка'), tabButton('expenses', 'Расходы', list(data,'expenses').length), tabButton('history', 'История', list(data,'events').length)
  ];
  return `<section class="card"><div class="tabs">${(isLawyer() ? lawyerTabs : defaultTabs).join('')}</div>${renderTabContent(data)}</section>`;
}

function renderTabContent(data) {
  if (activeTab === 'risks') return `<h2>${isLawyer() ? 'Юридические риски и стоп-факторы' : 'Риски и рекомендации'}</h2>${isLawyer() ? '<div class="status warn">Проверьте правоустанавливающие документы, собственников, детей/опеку, обременения, расчеты, сроки и условия задатка.</div>' : ''}${renderRisks(list(data,'risks'))}`;
  if (activeTab === 'docs') return `<h2>${isLawyer() ? 'Документы для юридической проверки' : 'Документы'}</h2>${renderDocs(list(data,'documents'))}`;
  if (activeTab === 'reviews') return `<h2>${isLawyer() ? 'Решения юридической проверки' : 'Решения проверки'}</h2>${renderReviews(list(data,'reviews'))}`;
  if (activeTab === 'tasks') return `<h2>${isLawyer() ? 'Задачи юриста и СПН' : 'Задачи'}</h2>${renderTasks(list(data,'tasks'))}`;
  if (activeTab === 'expenses') return `<h2>Расходы</h2>${renderExpenses(list(data,'expenses'))}`;
  if (activeTab === 'comments') return `<h2>${isLawyer() ? 'Юридические комментарии' : 'Комментарии'}</h2>${renderComments(list(data,'comments'))}`;
  if (activeTab === 'history') return `<h2>История</h2>${renderEvents(list(data,'events'))}`;
  return `<h2>Сводка</h2>${overview(data)}`;
}

function renderCard(data) {
  currentData = data;
  const deal = data.deal;
  const docs = list(data, 'documents');
  const tasks = list(data, 'tasks');
  const risks = list(data, 'risks');
  const reviews = list(data, 'reviews');
  const partiesLine = dealPartiesLine(deal);
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>${demoBadge(deal)}${esc(dealHeadline(deal))}</h1><p>${esc(partiesLine || deal.next_action || (isLawyer() ? 'Проверить юридические риски, документы и условия сделки.' : 'Проверить карточку и определить следующий шаг.'))}</p></section>
    ${dealModePanel(deal)}
    ${isLawyer() ? legalPanel(data) : ''}
    <div class="kpi-row">
      ${metric('К задатку', (deal.readiness_deposit || 0) + '%', deal.readiness_deposit >= 80 ? 'green' : 'yellow')}
      ${metric('К сделке', (deal.readiness_deal || 0) + '%', deal.readiness_deal >= 80 ? 'green' : 'yellow')}
      ${metric('Документы', countMissingDocs(docs), countMissingDocs(docs) ? 'yellow' : 'green')}
      ${metric('Задачи', countOpenTasks(tasks), countOpenTasks(tasks) ? 'yellow' : 'green')}
    </div>
    <div class="kpi-row">
      ${metric('Статус', statusText(deal.status))}
      ${metric('Риск', riskPill(deal.risk_level))}
      ${metric('Красные риски', countRedRisks(risks), countRedRisks(risks) ? 'red' : 'green')}
      ${metric('Решения', countBlockingReviews(reviews), countBlockingReviews(reviews) ? 'red' : 'green')}
    </div>
    ${spnBeforeLawyerPanel(data)}
    ${quickActions(deal)}
    ${renderTabs(data)}
  </main>`;
  bindActions();
}

async function runLegalAction(action) {
  const config = {
    checked: ['preparing_deal', 'Юрист: первичная юридическая проверка выполнена. Критичных замечаний по текущей информации нет. Можно продолжать подготовку сделки.', 'approved', false, false],
    need_documents: ['need_documents', 'Юрист: для продолжения проверки нужны дополнительные документы. СПН необходимо дозапросить пакет документов и обновить карточку сделки.', 'need_info', false, true],
    stop_factor: ['need_lawyer', 'Юрист: выявлен юридический стоп-фактор. До устранения замечаний нельзя переводить сделку к задатку/основной сделке.', 'blocked', true, true]
  }[action];

  if (action === 'return_spn') {
    if (!confirmDemoAction('вернуть СПН на доработку')) return;
    try {
      setPageStatus('Возвращаю СПН на доработку...');
      await rpc('nav_v2_return_spn_rework', { p_deal_id: dealId, p_body: lawyerReturnText() }, 12000);
      await load();
    } catch (e) { setPageStatus('Ошибка возврата СПН: ' + e.message, 'error'); }
    return;
  }

  if (!config) return;
  if (!confirmDemoAction('зафиксировать юридическое действие')) return;
  try {
    setPageStatus('Фиксирую юридическое действие...');
    await rpc('nav_v2_add_deal_review', {
      p_deal_id: dealId,
      p_decision: config[2],
      p_body: config[1],
      p_blocks_deposit: config[3],
      p_blocks_deal: config[4]
    });
    await rpc('nav_v2_update_deal_status', { p_deal_id: dealId, p_status: config[0] });
    activeTab = 'reviews';
    history.replaceState(null, '', `${location.pathname}${location.search}#${activeTab}`);
    await load();
  } catch (e) { setPageStatus('Ошибка юридического действия: ' + e.message, 'error'); }
}

function confirmLawyerHandoff() {
  const h = lawyerHandoffIssues(currentData);
  if (!h.issues.length) return true;
  const text = `В карточке есть незакрытые пункты перед передачей юристу:\n\n${h.issues.join('\n')}\n\nПередать юристу всё равно?`;
  return confirm(text);
}

function bindActions() {
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.onclick = () => { activeTab = btn.dataset.tab; history.replaceState(null, '', `${location.pathname}${location.search}#${activeTab}`); renderCard(currentData); });
  document.querySelectorAll('[data-tab-shortcut]').forEach((btn) => btn.onclick = () => { activeTab = btn.dataset.tabShortcut; history.replaceState(null, '', `${location.pathname}${location.search}#${activeTab}`); renderCard(currentData); });
  document.querySelectorAll('[data-legal-action]').forEach((btn) => btn.onclick = () => runLegalAction(btn.dataset.legalAction));
  document.querySelectorAll('[data-quick-status]').forEach((btn) => btn.onclick = async () => {
    if (btn.dataset.quickStatus === 'need_lawyer' && !confirmLawyerHandoff()) return;
    if (!confirmDemoAction('изменить статус сделки')) return;
    try { setPageStatus('Сохраняю быстрый статус...'); await rpc('nav_v2_update_deal_status', { p_deal_id: dealId, p_status: btn.dataset.quickStatus }); await load(); }
    catch (e) { setPageStatus('Ошибка быстрого действия: ' + e.message, 'error'); }
  });
  const statusBtn = document.getElementById('saveStatus');
  if (statusBtn) statusBtn.onclick = async () => {
    if (!confirmDemoAction('изменить статус сделки')) return;
    try { setPageStatus('Сохраняю статус...'); await rpc('nav_v2_update_deal_status', { p_deal_id: dealId, p_status: document.getElementById('dealStatus').value }); await load(); }
    catch (e) { setPageStatus('Ошибка: ' + e.message, 'error'); }
  };
  document.querySelectorAll('[data-doc-id]').forEach((btn) => btn.onclick = async () => {
    if (!confirmDemoAction('изменить статус документа')) return;
    const note = btn.dataset.docStatus === 'problem' ? prompt('Что не так с документом? Это увидят СПН и юрист.') : '';
    if (btn.dataset.docStatus === 'problem' && !norm(note)) { setPageStatus('Для проблемного документа нужна короткая причина.', 'error'); return; }
    try {
      setPageStatus('Обновляю документ...');
      await rpc('nav_v2_update_document_workflow', {
        p_document_id: btn.dataset.docId,
        p_status: btn.dataset.docStatus,
        p_assigned_to: null,
        p_responsible_role: null,
        p_due_date: null,
        p_note: note || null
      });
      await load();
    }
    catch (e) { setPageStatus('Ошибка документа: ' + e.message, 'error'); }
  });
  document.querySelectorAll('[data-task-id]').forEach((btn) => btn.onclick = async () => {
    if (!confirmDemoAction('изменить статус задачи')) return;
    try { setPageStatus('Обновляю задачу...'); await rpc('nav_v2_update_task_status', { p_task_id: btn.dataset.taskId, p_status: btn.dataset.taskStatus }); await load(); }
    catch (e) { setPageStatus('Ошибка задачи: ' + e.message, 'error'); }
  });
  const add = document.getElementById('addComment');
  if (add) add.onclick = async () => {
    const body = document.getElementById('newComment').value.trim();
    if (!body) { setPageStatus('Комментарий пустой.', 'error'); return; }
    if (!confirmDemoAction('добавить комментарий')) return;
    try { setPageStatus('Добавляю комментарий...'); await rpc('nav_v2_add_comment', { p_deal_id: dealId, p_body: body, p_visibility: 'team' }); await load(); }
    catch (e) { setPageStatus('Ошибка комментария: ' + e.message, 'error'); }
  };
}

function isCardLoadFallbackError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return text.includes('сначала войдите')
    || text.includes('ошибка supabase 400')
    || text.includes('ошибка supabase 401')
    || text.includes('jwt expired')
    || text.includes('unauthorized')
    || text.includes('refresh');
}

function renderLoginAfterCardError() {
  const root = document.getElementById('app');
  root.innerHTML = '<main class="nav-v2-shell"><div id="dealCardAuthHost"></div></main>';
  const host = document.getElementById('dealCardAuthHost');
  renderAuthBox(host, async () => location.reload());
  const status = document.getElementById('authStatus');
  if (status) {
    status.className = 'status warn';
    status.textContent = 'Сессия истекла или была повреждена. Войдите снова.';
  }
}

async function load() {
  if (!dealId) { document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status error">Не указан id сделки.</div></main>'; return; }
  document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю карточку сделки...</div></main>';
  try {
    const cardData = await rpc('nav_v2_get_deal_card', { p_deal_id: dealId });
    if (!currentProfile) {
      try { const profileData = await rpc('nav_v2_get_my_profile', {}, 12000); currentProfile = profileData.profile || null; } catch (_) { currentProfile = cardData.profile || null; }
    }
    if (isLawyer() && !location.hash && activeTab === 'overview') activeTab = 'risks';
    renderCard(cardData);
  }
  catch (error) {
    if (isCardLoadFallbackError(error)) {
      renderLoginAfterCardError();
      return;
    }
    document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error">Ошибка загрузки: ${esc(error.message)}</div></main>`;
  }
}

async function init() { setupTop('deals'); if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload()); await load(); }
init();