import { rpc, esc } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let loaded = false;
let data = null;
let scheduled = false;
let reloadTimer = null;
let loadSeq = 0;
let dataVersion = 0;

function isMissingDocument(doc) {
  return doc?.is_required && !['received', 'checked'].includes(doc?.status);
}

function isUrgentTask(task) {
  return ['urgent', 'high'].includes(task?.priority) && ['open', 'in_progress'].includes(task?.status);
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
  })[category] || category || 'документ';
}

function roleLabel(role) {
  return ({ owner: 'owner', admin: 'admin', manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'брокер', viewer: 'наблюдатель' })[role] || role || 'не назначен';
}

function priorityLabel(priority) {
  return ({ urgent: 'срочно', high: 'важно', normal: 'обычно', low: 'низкий' })[priority] || priority || 'обычно';
}

function findHandoffPanel() {
  const headings = [...document.querySelectorAll('section.card h2')];
  const heading = headings.find((node) => node.textContent.trim() === 'Перед передачей юристу');
  return heading?.closest?.('section.card') || null;
}

function itemList(items, emptyText) {
  if (!items.length) return `<div class="list-item">${esc(emptyText)}</div>`;
  return items.map((item) => `<div class="list-item">${item}</div>`).join('');
}

function buildHintHtml() {
  const docs = Array.isArray(data?.documents) ? data.documents : [];
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const missingDocs = docs.filter(isMissingDocument).slice(0, 6);
  const urgentTasks = tasks.filter(isUrgentTask).slice(0, 6);
  if (!missingDocs.length && !urgentTasks.length) return '';

  const docItems = missingDocs.map((doc) => `${esc(doc.title || 'Документ')} <span class="pill yellow">${esc(docCategoryLabel(doc.category))}</span>`);
  const taskItems = urgentTasks.map((task) => `${esc(task.title || 'Задача')} <span class="pill ${task.priority === 'urgent' ? 'red' : 'yellow'}">${esc(priorityLabel(task.priority))}</span> <span class="pill blue">${esc(roleLabel(task.assigned_role))}</span>`);

  return `<h3>Что закрыть перед передачей</h3>
    <div class="side-by-side">
      <div>
        <h4>Документы</h4>
        <div class="list">${itemList(docItems, 'Критичных недостающих документов не найдено.')}</div>
      </div>
      <div>
        <h4>Задачи</h4>
        <div class="list">${itemList(taskItems, 'Срочных открытых задач не найдено.')}</div>
      </div>
    </div>`;
}

function renderHints(card) {
  if (!card || !loaded || !data) return;
  const existing = card.querySelector('[data-handoff-detail-hints]');
  const html = buildHintHtml();

  if (!html) {
    existing?.remove();
    return;
  }

  if (existing) {
    if (existing.dataset.version !== String(dataVersion)) {
      existing.innerHTML = html;
      existing.dataset.version = String(dataVersion);
    }
    return;
  }

  const block = document.createElement('div');
  block.dataset.handoffDetailHints = 'true';
  block.dataset.version = String(dataVersion);
  block.className = 'card';
  block.style.boxShadow = 'none';
  block.style.marginTop = '12px';
  block.innerHTML = html;
  card.appendChild(block);
}

function apply() {
  renderHints(findHandoffPanel());
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    apply();
  }, 120);
}

function queueReload(delay = 900) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    loadData();
  }, delay);
}

async function loadData() {
  if (!dealId) return;
  const seq = ++loadSeq;
  try {
    const nextData = await rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 12000);
    if (seq !== loadSeq) return;
    data = nextData;
    dataVersion += 1;
    loaded = true;
    apply();
  } catch (_) {
    if (seq === loadSeq) loaded = false;
  }
}

const app = document.getElementById('app');
if (app) {
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  app.addEventListener('click', (event) => {
    const target = event.target;
    const button = target?.closest?.('button[data-doc-id][data-doc-status], button[data-task-id][data-task-status], button[data-quick-status], #saveStatus');
    if (button && !button.disabled) queueReload();
  }, true);
}

loadData();
window.addEventListener('hashchange', schedule);
