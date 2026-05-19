import { listDealEvents, addDealEvent, eventLabel } from './dealEvents.js';

let currentDealId = null;
let currentDealTitle = null;
let currentFilter = 'all';

const FILTERS = [
  ['all', 'Все'],
  ['status_changed', 'Статусы'],
  ['review_added', 'Решения'],
  ['task_created', 'Задачи'],
  ['task_completed', 'Закрытые'],
  ['note_added', 'Заметки']
];

function get(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function loadCss() {
  if (document.querySelector('link[href="./assets/css/deal-events.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/deal-events.css';
  document.head.appendChild(link);
}
function icon(type) {
  if (type === 'status_changed') return '🧭';
  if (type === 'review_added') return '✅';
  if (type === 'task_created') return '📝';
  if (type === 'task_completed') return '✔';
  if (type === 'task_status_changed') return '🔁';
  if (type === 'note_added') return '💬';
  return '•';
}
function ensureTab() {
  if (get('dealEvents')) return;
  const tabs = document.querySelector('.tabs');
  const result = document.querySelector('.result');
  if (!tabs || !result) return;
  const btn = document.createElement('button');
  btn.className = 'tab';
  btn.dataset.tab = 'dealEvents';
  btn.textContent = 'Лента';
  tabs.appendChild(btn);

  const page = document.createElement('div');
  page.id = 'dealEvents';
  page.className = 'tabpage';
  page.innerHTML = '<h2>Лента сделки</h2><div id="eventPanelBody" class="box blue">Откройте или сохраните сделку, чтобы видеть историю.</div>';
  result.appendChild(page);

  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.tabpage').forEach((item) => item.classList.remove('active'));
    btn.classList.add('active');
    page.classList.add('active');
    renderPanel();
  };
}

function renderFilters() {
  return `<div class="event-filters">${FILTERS.map(([id, label]) => `<button type="button" class="${currentFilter === id ? 'active' : ''}" data-event-filter="${id}">${esc(label)}</button>`).join('')}</div>`;
}

async function renderPanel() {
  const body = get('eventPanelBody');
  if (!body) return;
  if (!currentDealId) {
    body.className = 'box blue';
    body.innerHTML = '<h3>Лента появится после сохранения сделки</h3><p>События привязываются к сделке в Supabase: статусы, решения, задачи, закрытие задач и заметки.</p>';
    return;
  }
  body.className = 'box blue';
  body.innerHTML = '<p>Загрузка ленты...</p>';
  try {
    const events = await listDealEvents(currentDealId, 150);
    const filtered = currentFilter === 'all' ? events : events.filter((event) => event.event_type === currentFilter);
    body.innerHTML = `
      <div class="event-feed-top">
        <div>
          <h3>${esc(currentDealTitle || 'Открытая сделка')}</h3>
          <p>История действий по сделке: статусы, решения, задачи, заметки.</p>
        </div>
        <div class="event-feed-actions"><button id="btnRefreshEvents" class="light" type="button">Обновить</button></div>
      </div>
      ${renderFilters()}
      <div class="event-note-form">
        <label>Заметка по сделке<textarea id="eventNoteText" placeholder="Например: продавец обещал донести ЕГРН завтра до 12:00"></textarea></label>
        <button id="btnAddEventNote" class="green" type="button">Добавить заметку в ленту</button>
      </div>
      ${filtered.length ? `<div class="deal-events-feed">${filtered.map(renderEvent).join('')}</div>` : '<div class="event-empty">Событий пока нет.</div>'}
    `;
    get('btnRefreshEvents').onclick = renderPanel;
    get('btnAddEventNote').onclick = addNote;
    body.querySelectorAll('[data-event-filter]').forEach((button) => {
      button.onclick = () => {
        currentFilter = button.dataset.eventFilter;
        renderPanel();
      };
    });
  } catch (error) {
    body.className = 'box redBox';
    body.innerHTML = 'Ошибка загрузки ленты: ' + esc(error.message);
  }
}

function renderEvent(event) {
  return `<div class="event-item">
    <div class="event-icon ${esc(event.event_type)}">${icon(event.event_type)}</div>
    <div class="event-body">
      <h3>${esc(event.title || eventLabel(event.event_type))}</h3>
      ${event.body ? `<p>${esc(event.body)}</p>` : ''}
      ${(event.old_value || event.new_value) ? `<div class="event-diff"><span>${esc(event.old_value || '—')}</span>→<span class="new">${esc(event.new_value || '—')}</span></div>` : ''}
      <div class="event-meta"><span>${esc(eventLabel(event.event_type))}</span><span>${new Date(event.created_at).toLocaleString('ru-RU')}</span></div>
    </div>
  </div>`;
}

async function addNote() {
  const text = get('eventNoteText')?.value?.trim();
  if (!text) {
    alert('Напишите текст заметки.');
    return;
  }
  try {
    await addDealEvent(currentDealId, { event_type: 'note_added', title: 'Добавлена заметка', body: text });
    get('eventNoteText').value = '';
    window.dispatchEvent(new CustomEvent('navigatorDealEventsChanged', { detail: { id: currentDealId, title: currentDealTitle } }));
    await renderPanel();
  } catch (error) {
    alert('Ошибка добавления заметки: ' + error.message);
  }
}

function start() {
  loadCss();
  ensureTab();
  window.addEventListener('navigatorDealOpened', (event) => {
    currentDealId = event.detail?.id || null;
    currentDealTitle = event.detail?.title || null;
    renderPanel();
  });
  window.addEventListener('navigatorDealSaved', (event) => {
    currentDealId = event.detail?.id || currentDealId;
    currentDealTitle = event.detail?.title || currentDealTitle;
    renderPanel();
  });
  window.addEventListener('navigatorDealStatusChanged', renderPanel);
  window.addEventListener('navigatorTasksChanged', renderPanel);
  window.addEventListener('navigatorDealEventsChanged', renderPanel);
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (document.querySelector('.tabs') && document.querySelector('.panel.result')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 80) clearInterval(timer);
}, 200);
