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

function openTask(task) {
  return !['done', 'completed', 'cancelled'].includes(String(task?.status || ''));
}

function spnTask(task) {
  return openTask(task) && (task?.assigned_role === 'spn' || task?.can_change_status === true);
}

function duePill(task) {
  const diff = daysUntil(task.due_date);
  if (!task.due_date) return '<span class="pill yellow">срок не установлен</span>';
  if (diff < 0) return `<span class="pill red">просрочено: ${dateShort(task.due_date)}</span>`;
  if (diff === 0) return `<span class="pill yellow">сегодня: ${dateShort(task.due_date)}</span>`;
  if (diff === 1) return `<span class="pill yellow">завтра: ${dateShort(task.due_date)}</span>`;
  return `<span class="pill blue">срок: ${dateShort(task.due_date)}</span>`;
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

function panelStatus(tasks) {
  const overdue = tasks.filter((task) => daysUntil(task.due_date) < 0).length;
  const today = tasks.filter((task) => daysUntil(task.due_date) === 0).length;
  if (overdue) return `<div class="status error">Есть просроченные СПН-задачи: ${overdue}. Их нужно закрыть или перенести срок.</div>`;
  if (today) return `<div class="status warn">На сегодня есть СПН-задачи: ${today}. Начните с них.</div>`;
  return '<div class="status ok">Критичных просрочек по СПН-задачам в этой карточке нет.</div>';
}

function emptyPanel() {
  return `<section class="card" data-spn-next-actions="true" style="border:2px solid rgba(22,163,74,.18)">
    <div class="section-title">
      <div>
        <h2>Ближайшие действия СПН</h2>
        <p class="muted">Открытых задач СПН по этой карточке нет.</p>
      </div>
      <span class="pill green">чисто</span>
    </div>
    <div class="status ok">Можно перейти к проверке документов, рисков или подготовке передачи специалистам.</div>
  </section>`;
}

function renderPanel(tasks) {
  const visible = tasks.slice(0, 3);
  const hiddenCount = Math.max(0, tasks.length - visible.length);
  return `<section class="card" data-spn-next-actions="true" style="border:2px solid rgba(245,158,11,.24)">
    <div class="section-title">
      <div>
        <h2>Ближайшие действия СПН</h2>
        <p class="muted">Короткий рабочий список по этой сделке: сроки, приоритет и что можно закрыть самому.</p>
      </div>
      <span class="pill yellow">${tasks.length} открыто</span>
    </div>
    ${panelStatus(tasks)}
    <div class="list">
      ${visible.map((task) => `<div class="list-item">
        <div class="actions" style="justify-content:flex-start;margin-top:0">
          ${duePill(task)}
          <span class="pill ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'yellow' : 'blue'}">${esc(priorityLabel(task.priority))}</span>
          ${task.can_change_status === true ? '<span class="pill green">можно закрыть СПН</span>' : '<span class="pill">контроль</span>'}
        </div>
        <b>${esc(task.title || 'Задача')}</b>
        ${task.description ? `<p class="muted">${esc(task.description)}</p>` : ''}
      </div>`).join('')}
    </div>
    ${hiddenCount ? `<p class="small">Еще задач: ${hiddenCount}. Полный список во вкладке «Задачи».</p>` : ''}
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" type="button" data-spn-next-actions-open-tasks>Открыть задачи</button>
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
    mount(tasks.length ? renderPanel(tasks) : emptyPanel());
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

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-spn-next-actions-open-tasks]')) {
    const tab = document.querySelector('[data-tab="tasks"]');
    if (tab) tab.click();
    else location.hash = 'tasks';
    return;
  }
  if (event.target.closest('[data-spn-next-actions-refresh]')) render(true);
});

const app = document.getElementById('app');
if (app) new MutationObserver(queueRender).observe(app, { childList: true, subtree: true });
setTimeout(() => render(false), 100);
