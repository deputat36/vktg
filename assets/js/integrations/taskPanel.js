import {
  listDealTasks,
  addDealTask,
  updateDealTaskStatus,
  TASK_STATUSES,
  TASK_PRIORITIES,
  getTaskPriorityLabel
} from './tasks.js';

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
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function ensureTab() {
  if (document.getElementById('dealTasks')) return;
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
  const body = document.getElementById('taskPanelBody');
  if (!body) return;

  if (!currentDealId) {
    body.className = 'box blue';
    body.innerHTML = 'Откройте сделку из Supabase, чтобы создать задачи.';
    return;
  }

  body.className = 'box blue';
  body.innerHTML = '<p>Загрузка задач...</p>';

  try {
    const tasks = await listDealTasks(currentDealId);
    body.innerHTML = `
      <h3>${esc(currentDealTitle || 'Открытая сделка')}</h3>
      <div class="box grayBox">
        <h3>Быстрые задачи</h3>
        <div class="scenario-grid">
          ${QUICK_TASKS.map((task, index) => `<button class="light" data-quick-task="${index}">${esc(task[0])}</button>`).join('')}
        </div>
      </div>
      <div class="row">
        <label>Задача<input id="taskTitle" placeholder="Например: запросить справку о зарегистрированных"></label>
        <label>Срок<input id="taskDue" type="date"></label>
      </div>
      <div class="row">
        <label>Приоритет<select id="taskPriority">${TASK_PRIORITIES.map((item) => `<option value="${item[0]}">${esc(item[1])}</option>`).join('')}</select></label>
        <label>Статус<select id="taskStatus">${TASK_STATUSES.map((item) => `<option value="${item[0]}">${esc(item[1])}</option>`).join('')}</select></label>
      </div>
      <label>Описание / комментарий<textarea id="taskDescription" placeholder="Что именно нужно сделать, где получить документ, что проверить..."></textarea></label>
      <button id="btnAddTask" class="green">Добавить задачу</button>
      <h3>Список задач</h3>
      ${tasks.length ? renderTasks(tasks) : '<div class="box grayBox">Задач пока нет.</div>'}
    `;

    body.querySelectorAll('[data-quick-task]').forEach((btn) => {
      btn.onclick = async () => {
        const task = QUICK_TASKS[Number(btn.dataset.quickTask)];
        await createTask({ title: task[0], description: task[1], priority: task[2], status: 'open' });
      };
    });

    document.getElementById('btnAddTask').onclick = async () => {
      await createTask({
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value,
        priority: document.getElementById('taskPriority').value,
        status: document.getElementById('taskStatus').value,
        due_date: document.getElementById('taskDue').value
      });
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
    tasks.map((task) => '<tr><td><select data-task-status="' + task.id + '">' + TASK_STATUSES.map((item) => '<option value="' + item[0] + '" ' + (item[0] === task.status ? 'selected' : '') + '>' + esc(item[1]) + '</option>').join('') + '</select></td><td>' + esc(getTaskPriorityLabel(task.priority)) + '</td><td>' + esc(task.due_date || '—') + '</td><td>' + esc(task.title) + '</td><td>' + esc(task.description || '—') + '</td></tr>').join('') +
    '</table>';
}

function start() {
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
  window.addEventListener('navigatorTasksChanged', (event) => {
    currentDealId = event.detail?.id || currentDealId;
    currentDealTitle = event.detail?.title || currentDealTitle;
    renderPanel();
  });
}

start();
