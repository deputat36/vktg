import {
  listDealTasks,
  addDealTask,
  updateDealTaskStatus,
  TASK_STATUSES,
  TASK_PRIORITIES,
  getTaskPriorityLabel
} from './tasks.js';
import { suggestTasksForDeal } from './autoTasks.js';
import { getDeal } from '../ui/form.js';

let currentDealId = null;
let currentDealTitle = null;

const QUICK_TASKS = [
  ['Запросить ЕГРН с ЭЦП', 'Получить не просто PDF, а полный комплект файлов выписки с электронной подписью.', 'high'],
  ['Запросить справку о зарегистрированных', 'Продавцу получить справку о зарегистрированных через Госуслуги/МФЦ/уполномоченный орган.', 'high'],
  ['Проверить документы основания', 'Проверить все документы основания по объекту: договор, наследство, приватизация, решение суда и т.д.', 'high'],
  ['Проверить расчет и расходы', 'Согласовать форму расчета, госпошлину, оценку, СБР/аккредитив, нотариальные расходы и комиссию.', 'normal'],
  ['Проверить объект для банка', 'Для ипотеки проверить требования банка, Домклик/личный кабинет, оценку, загрузку документов продавца и покупателя.', 'high'],
  ['Передать карточку юристу', 'Проверить, что карточка заполнена понятно: объект, стороны, документы, расчет, вопросы и ссылка на папку.', 'normal'],
  ['Проверить участок в НСПД', 'По кадастровому номеру проверить, отображаются ли границы участка на карте НСПД.', 'normal']
];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function get(id) { return document.getElementById(id); }
function dealSafe() { try { return getDeal(); } catch (_) { return {}; } }
function priorityClass(value) { return value === 'urgent' ? 'red' : value === 'high' ? 'orange' : value === 'low' ? 'green' : 'blue'; }
function normalize(value) { return String(value || '').trim().toLowerCase(); }

function ensureTab() {
  if (get('dealTasks')) return;
  const tabs = document.querySelector('.tabs');
  const result = document.querySelector('.result');
  if (!tabs || !result) return;

  const btn = document.createElement('button');
  btn.className = 'tab';
  btn.dataset.tab = 'dealTasks';
  btn.textContent = 'Задачи';
  tabs.appendChild(btn);

  const page = document.createElement('div');
  page.id = 'dealTasks';
  page.className = 'tabpage';
  page.innerHTML = '<h2>Задачи по сделке</h2><div id="taskPanelBody" class="box blue">Откройте сделку из Supabase, чтобы создать задачи.</div>';
  result.appendChild(page);

  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.tabpage').forEach((item) => item.classList.remove('active'));
    btn.classList.add('active');
    page.classList.add('active');
    renderPanel();
  };
}

async function renderPanel() {
  const body = get('taskPanelBody');
  if (!body) return;

  if (!currentDealId) {
    const suggestions = suggestTasksForDeal(dealSafe());
    body.className = 'box blue';
    body.innerHTML = `
      <h3>Сделка еще не сохранена в Supabase</h3>
      <p>Постоянные задачи сохраняются только к сохраненной сделке. Но система уже может показать, какие задачи появятся по текущему паспорту сделки.</p>
      <div class="box orangeBox"><h3>Предварительные задачи</h3>${suggestions.length ? renderSuggestedList(suggestions) : '<p>Критичных предварительных задач нет.</p>'}</div>
    `;
    return;
  }

  body.className = 'box blue';
  body.innerHTML = '<p>Загрузка задач...</p>';

  try {
    const tasks = await listDealTasks(currentDealId);
    const suggestions = filterExistingSuggestions(suggestTasksForDeal(dealSafe()), tasks);
    body.innerHTML = `
      <h3>${esc(currentDealTitle || 'Открытая сделка')}</h3>
      ${taskMetrics(tasks)}
      ${suggestions.length ? `<div class="box orangeBox"><h3>Автозадачи по паспорту сделки</h3><p class="small">Система видит незакрытые риски и недостающие данные. Можно создать задачи автоматически.</p>${renderSuggestedList(suggestions)}<button id="btnCreateSuggestedTasks" class="green">Создать автозадачи (${suggestions.length})</button></div>` : '<div class="box greenBox"><h3>Автозадачи по паспорту сделки</h3><p>Новых автозадач нет. Основные риски либо не выявлены, либо задачи уже созданы.</p></div>'}
      <div class="box grayBox">
        <h3>Быстрые задачи</h3>
        <div class="scenario-grid">${QUICK_TASKS.map((task, index) => `<button class="light" data-quick-task="${index}">${esc(task[0])}</button>`).join('')}</div>
      </div>
      <div class="box blue">
        <h3>Добавить задачу вручную</h3>
        <div class="row"><label>Задача<input id="taskTitle" placeholder="Например: запросить справку о зарегистрированных"></label><label>Срок<input id="taskDue" type="date"></label></div>
        <div class="row"><label>Приоритет<select id="taskPriority">${TASK_PRIORITIES.map((item) => `<option value="${item[0]}">${esc(item[1])}</option>`).join('')}</select></label><label>Статус<select id="taskStatus">${TASK_STATUSES.map((item) => `<option value="${item[0]}">${esc(item[1])}</option>`).join('')}</select></label></div>
        <label>Описание / комментарий<textarea id="taskDescription" placeholder="Что именно нужно сделать, где получить документ, что проверить..."></textarea></label>
        <button id="btnAddTask" class="green">Добавить задачу</button>
      </div>
      <h3>Список задач</h3>${tasks.length ? renderTasks(tasks) : '<div class="box grayBox">Задач пока нет.</div>'}
    `;

    get('btnCreateSuggestedTasks')?.addEventListener('click', async () => {
      for (const task of suggestions) await addDealTask(currentDealId, task);
      await renderPanel();
    });

    body.querySelectorAll('[data-quick-task]').forEach((btn) => {
      btn.onclick = async () => {
        const item = QUICK_TASKS[Number(btn.dataset.quickTask)];
        await createTask({ title: item[0], description: item[1], priority: item[2], status: 'open' });
      };
    });

    get('btnAddTask').onclick = async () => {
      await createTask({ title: get('taskTitle').value, description: get('taskDescription').value, priority: get('taskPriority').value, status: get('taskStatus').value, due_date: get('taskDue').value });
    };

    body.querySelectorAll('[data-task-status]').forEach((select) => {
      select.onchange = async () => {
        try {
          await updateDealTaskStatus(select.dataset.taskStatus, select.value);
          await renderPanel();
        } catch (error) {
          alert('Ошибка изменения статуса: ' + error.message);
        }
      };
    });
  } catch (error) {
    body.className = 'box redBox';
    body.innerHTML = 'Ошибка загрузки задач: ' + esc(error.message);
  }
}

function filterExistingSuggestions(suggestions, tasks) {
  const existing = new Set((tasks || []).map((item) => normalize(item.title)));
  return suggestions.filter((item) => !existing.has(normalize(item.title)));
}

function taskMetrics(tasks) {
  const open = tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').length;
  const urgent = tasks.filter((task) => task.priority === 'urgent' && task.status !== 'done' && task.status !== 'cancelled').length;
  const done = tasks.filter((task) => task.status === 'done').length;
  return `<div class="metrics"><div class="metric ${open ? 'orangeBox' : 'greenBox'}"><b>${open}</b><span>открыто</span></div><div class="metric ${urgent ? 'redBox' : 'greenBox'}"><b>${urgent}</b><span>срочно</span></div><div class="metric"><b>${done}</b><span>выполнено</span></div><div class="metric"><b>${tasks.length}</b><span>всего</span></div></div>`;
}

function renderSuggestedList(tasks) {
  return '<ul>' + tasks.map((task) => `<li><b>${esc(task.title)}</b> <span class="pill ${priorityClass(task.priority)}">${esc(getTaskPriorityLabel(task.priority || 'normal'))}</span><br><span class="small">${esc(task.description || '')}</span></li>`).join('') + '</ul>';
}

async function createTask(task) {
  try {
    if (!task.title || !task.title.trim()) {
      alert('Укажите название задачи');
      return;
    }
    await addDealTask(currentDealId, task);
    await renderPanel();
  } catch (error) {
    alert('Ошибка добавления задачи: ' + error.message);
  }
}

function renderTasks(tasks) {
  return '<table><tr><th>Статус</th><th>Приоритет</th><th>Срок</th><th>Задача</th><th>Описание</th></tr>' +
    tasks.map((task) => '<tr><td><select data-task-status="' + task.id + '">' + TASK_STATUSES.map((item) => '<option value="' + item[0] + '" ' + (item[0] === task.status ? 'selected' : '') + '>' + esc(item[1]) + '</option>').join('') + '</select></td><td><span class="pill ' + priorityClass(task.priority) + '">' + esc(getTaskPriorityLabel(task.priority)) + '</span></td><td>' + esc(task.due_date || '—') + '</td><td>' + esc(task.title) + '</td><td>' + esc(task.description || '—') + '</td></tr>').join('') +
    '</table>';
}

function start() {
  ensureTab();
  window.addEventListener('navigatorDealOpened', (event) => { currentDealId = event.detail?.id || null; currentDealTitle = event.detail?.title || null; renderPanel(); });
  window.addEventListener('navigatorDealSaved', (event) => { currentDealId = event.detail?.id || currentDealId; currentDealTitle = event.detail?.title || currentDealTitle; renderPanel(); });
  window.addEventListener('navigatorTasksChanged', (event) => { currentDealId = event.detail?.id || currentDealId; currentDealTitle = event.detail?.title || currentDealTitle; renderPanel(); });
  document.addEventListener('input', () => setTimeout(renderPanel, 150));
  document.addEventListener('change', () => setTimeout(renderPanel, 150));
}

start();
