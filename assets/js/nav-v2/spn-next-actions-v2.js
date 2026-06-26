import { rpc, esc } from './supabase-v2.js?v=20260625-1320';

const dealId = new URLSearchParams(location.search).get('id');
let cardData = null;
let loading = null;
let renderQueued = false;

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function localDate(value = null) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(value) {
  if (!value) return 9999;
  return Math.round((localDate(value).getTime() - localDate().getTime()) / 86400000);
}

function dateShort(value) {
  return value ? localDate(value).toLocaleDateString('ru-RU') : '—';
}

function priorityWeight(priority) {
  return ({ urgent: 0, high: 1, normal: 2, low: 3 })[priority] ?? 2;
}

function priorityLabel(priority) {
  return ({ urgent: 'срочно', high: 'важно', normal: 'обычно', low: 'низкий' })[priority] || priority || 'обычно';
}

function roleLabel(role) {
  return ({ owner: 'owner', admin: 'admin', manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'брокер', viewer: 'наблюдатель' })[role] || role || 'не назначен';
}

function docStatusLabel(status) {
  return ({ needed: 'нужен', requested: 'запрошен', received: 'получен', checked: 'проверен', problem: 'проблема' })[status] || status || 'нужен';
}

function docStatusClass(status) {
  if (status === 'problem') return 'red';
  if (status === 'requested') return 'blue';
  return 'yellow';
}

function openTask(task) {
  return !['done', 'completed', 'cancelled'].includes(String(task?.status || ''));
}

function spnTask(task) {
  return openTask(task) && (task?.assigned_role === 'spn' || task?.can_change_status === true);
}

function missingRequiredDoc(doc) {
  return doc?.is_required === true && !['received', 'checked'].includes(String(doc?.status || ''));
}

function duePill(value, emptyText = 'срок не установлен') {
  const diff = daysUntil(value);
  if (!value) return `<span class="pill yellow">${esc(emptyText)}</span>`;
  if (diff < 0) return `<span class="pill red">просрочено: ${dateShort(value)}</span>`;
  if (diff === 0) return `<span class="pill yellow">сегодня: ${dateShort(value)}</span>`;
  if (diff === 1) return `<span class="pill yellow">завтра: ${dateShort(value)}</span>`;
  return `<span class="pill blue">срок: ${dateShort(value)}</span>`;
}

function taskSort(a, b) {
  const dueA = daysUntil(a.due_date);
  const dueB = daysUntil(b.due_date);
  if (dueA !== dueB) return dueA - dueB;
  const priorityA = priorityWeight(a.priority);
  const priorityB = priorityWeight(b.priority);
  if (priorityA !== priorityB) return priorityA - priorityB;
  return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
}

function docSort(a, b) {
  const dueA = daysUntil(a.due_date);
  const dueB = daysUntil(b.due_date);
  if (dueA !== dueB) return dueA - dueB;
  return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
}

function panelStatus(tasks, docs) {
  const overdueTasks = tasks.filter((task) => daysUntil(task.due_date) < 0).length;
  const todayTasks = tasks.filter((task) => daysUntil(task.due_date) === 0).length;
  const overdueDocs = docs.filter((doc) => daysUntil(doc.due_date) < 0).length;
  if (overdueTasks || overdueDocs) {
    const parts = [];
    if (overdueTasks) parts.push(`СПН-задачи: ${overdueTasks}`);
    if (overdueDocs) parts.push(`документы: ${overdueDocs}`);
    return `<div class="status error">Есть просроченные пункты: ${parts.join(', ')}. Их нужно закрыть или перенести срок.</div>`;
  }
  if (todayTasks) return `<div class="status warn">На сегодня есть СПН-задачи: ${todayTasks}. Начните с них.</div>`;
  if (docs.length) return `<div class="status warn">Есть обязательные документы к контролю: ${docs.length}. Проверьте запрос и получение.</div>`;
  return '<div class="status ok">Критичных просрочек по СПН-задачам и обязательным документам в этой карточке нет.</div>';
}

function emptyPanel() {
  return `<section class="card" data-spn-next-actions="true" style="border:2px solid rgba(22,163,74,.18)">
    <div class="section-title">
      <div>
        <h2>Ближайшие действия СПН</h2>
        <p class="muted">Открытых задач СПН и обязательных документов к контролю нет.</p>
      </div>
      <span class="pill green">чисто</span>
    </div>
    <div class="status ok">Можно перейти к проверке рисков или подготовке передачи специалистам.</div>
  </section>`;
}

function tasksHtml(tasks) {
  if (!tasks.length) return '';
  const visible = tasks.slice(0, 3);
  const hiddenCount = Math.max(0, tasks.length - visible.length);
  return `<h3>Задачи СПН</h3>
    <div class="list">
      ${visible.map((task) => `<div class="list-item">
        <div class="actions" style="justify-content:flex-start;margin-top:0">
          ${duePill(task.due_date)}
          <span class="pill ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'yellow' : 'blue'}">${esc(priorityLabel(task.priority))}</span>
          ${task.can_change_status === true ? '<span class="pill green">можно закрыть СПН</span>' : '<span class="pill">контроль</span>'}
        </div>
        <b>${esc(task.title || 'Задача')}</b>
        ${task.description ? `<p class="muted">${esc(task.description)}</p>` : ''}
      </div>`).join('')}
    </div>
    ${hiddenCount ? `<p class="small">Еще задач: ${hiddenCount}. Полный список во вкладке «Задачи».</p>` : ''}`;
}

function docStagePills(doc) {
  const pills = [];
  if (doc.required_for_deposit === true) pills.push('<span class="pill red">до задатка</span>');
  if (doc.required_for_deal === true) pills.push('<span class="pill yellow">до сделки</span>');
  return pills.join('');
}

function docsSummaryHtml(docs) {
  if (!docs.length) return '';
  const forDeposit = docs.filter((doc) => doc.required_for_deposit === true).length;
  const forDeal = docs.filter((doc) => doc.required_for_deal === true).length;
  const forSpn = docs.filter((doc) => doc.responsible_role === 'spn').length;
  const forLawyer = docs.filter((doc) => doc.responsible_role === 'lawyer').length;
  return `<div class="actions" style="justify-content:flex-start;margin-top:0">
    <span class="pill yellow">всего: ${docs.length}</span>
    <span class="pill red">до задатка: ${forDeposit}</span>
    <span class="pill yellow">до сделки: ${forDeal}</span>
    <span class="pill blue">СПН: ${forSpn}</span>
    <span class="pill blue">юрист: ${forLawyer}</span>
  </div>`;
}

function docsHtml(docs) {
  if (!docs.length) return '';
  const visible = docs.slice(0, 2);
  const hiddenCount = Math.max(0, docs.length - visible.length);
  return `<h3>Документы к контролю</h3>
    ${docsSummaryHtml(docs)}
    <div class="list">
      ${visible.map((doc) => `<div class="list-item">
        <div class="actions" style="justify-content:flex-start;margin-top:0">
          ${duePill(doc.due_date, 'срок документа не установлен')}
          <span class="pill ${docStatusClass(doc.status)}">${esc(docStatusLabel(doc.status))}</span>
          <span class="pill yellow">обязательный</span>
          ${docStagePills(doc)}
          <span class="pill blue">ответственный: ${esc(roleLabel(doc.responsible_role))}</span>
        </div>
        <b>${esc(doc.title || 'Документ')}</b>
        ${doc.description ? `<p class="muted">${esc(doc.description)}</p>` : ''}
      </div>`).join('')}
    </div>
    ${hiddenCount ? `<p class="small">Еще обязательных документов к контролю: ${hiddenCount}. Полный список во вкладке «Документы».</p>` : ''}`;
}

function renderPanel(tasks, docs) {
  const count = tasks.length + docs.length;
  return `<section class="card" data-spn-next-actions="true" style="border:2px solid rgba(245,158,11,.24)">
    <div class="section-title">
      <div>
        <h2>Ближайшие действия СПН</h2>
        <p class="muted">Короткий рабочий список по этой сделке: задачи, сроки и обязательные документы.</p>
      </div>
      <span class="pill yellow">${count} открыто</span>
    </div>
    ${panelStatus(tasks, docs)}
    ${tasksHtml(tasks)}
    ${docsHtml(docs)}
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" type="button" data-spn-next-actions-open-tasks>Открыть задачи</button>
      <button class="btn light" type="button" data-spn-next-actions-open-docs>Открыть документы</button>
      <button class="btn light" type="button" data-spn-next-actions-refresh>Обновить</button>
    </div>
  </section>`;
}

function mount(html) {
  const main = document.querySelector('#app .nav-v2-shell');
  if (!main) return false;
  const existing = main.querySelector('[data-spn-next-actions]');
  if (existing) {
    if (existing.outerHTML !== html) existing.outerHTML = html;
  } else {
    const before = main.querySelector('.kpi-row') || main.querySelector('.card');
    if (before) before.insertAdjacentHTML('beforebegin', html);
    else main.insertAdjacentHTML('beforeend', html);
  }
  return true;
}

async function loadCard(force = false) {
  if (!dealId) return null;
  if (cardData && !force) return cardData;
  if (!loading) {
    loading = rpc('nav_v2_get_deal_card', { p_deal_id: dealId })
      .then((data) => { cardData = data; return data; })
      .finally(() => { loading = null; });
  }
  return loading;
}

async function render(force = false) {
  try {
    const data = await loadCard(force);
    if (data?.profile?.role !== 'spn') return;
    const tasks = list(data, 'tasks').filter(spnTask).sort(taskSort);
    const docs = list(data, 'documents').filter(missingRequiredDoc).sort(docSort);
    mount(tasks.length || docs.length ? renderPanel(tasks, docs) : emptyPanel());
  } catch (_) {
    // Основная карточка сама показывает ошибку загрузки. Этот блок не должен мешать входу в карточку.
  }
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    render(false);
  }, 80);
}

function openTab(id) {
  const tab = document.querySelector(`[data-tab="${id}"]`);
  if (tab) tab.click();
  else location.hash = id;
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-spn-next-actions-open-tasks]')) {
    openTab('tasks');
    return;
  }
  if (event.target.closest('[data-spn-next-actions-open-docs]')) {
    openTab('docs');
    return;
  }
  if (event.target.closest('[data-spn-next-actions-refresh]')) render(true);
});

const app = document.getElementById('app');
if (app) new MutationObserver(queueRender).observe(app, { childList: true, subtree: true });
setTimeout(() => render(false), 100);
