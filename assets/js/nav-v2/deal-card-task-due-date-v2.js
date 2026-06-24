import { rpc, esc } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let cardData = null;
let loading = null;

function isTasksTab() {
  return location.hash === '#tasks' || document.querySelector('[data-tab="tasks"].active');
}

function isDemoDeal() {
  return document.querySelector('.hero .pill.blue')?.textContent?.trim() === 'ДЕМО';
}

function dateLabel(value) {
  if (!value) return '<span class="pill yellow">срок не установлен</span>';
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cls = due < today ? 'red' : due.getTime() === today.getTime() ? 'yellow' : 'blue';
  const prefix = due < today ? 'просрочено: ' : due.getTime() === today.getTime() ? 'сегодня: ' : 'срок: ';
  return `<span class="pill ${cls}">${prefix}${due.toLocaleDateString('ru-RU')}</span>`;
}

function setPageStatus(text, type = 'info') {
  const status = document.getElementById('pageStatus');
  if (!status) return;
  status.className = `status ${type}`;
  status.textContent = text;
}

function editorHtml(task) {
  const value = task.due_date || '';
  return `<div class="nav-task-due-editor" data-task-due-editor="${esc(task.id)}" style="margin-top:10px">
    <div class="actions" style="justify-content:flex-start;align-items:flex-end">
      <div class="field" style="margin:0;min-width:180px">
        <label for="taskDue-${esc(task.id)}">Срок выполнения</label>
        <input id="taskDue-${esc(task.id)}" type="date" value="${esc(value)}" data-task-due-input="${esc(task.id)}">
      </div>
      <button class="btn primary" type="button" data-task-due-save="${esc(task.id)}">Сохранить срок</button>
      ${value ? `<button class="btn light" type="button" data-task-due-clear="${esc(task.id)}">Снять срок</button>` : ''}
      <span data-task-due-label="${esc(task.id)}">${dateLabel(value)}</span>
    </div>
    <div class="small" data-task-due-status="${esc(task.id)}">Срок виден в списке сделок и помогает не пропустить следующий шаг.</div>
  </div>`;
}

function findTaskItem(taskId) {
  const buttons = document.querySelectorAll('[data-task-id]');
  for (const button of buttons) {
    if (button.dataset.taskId === taskId) return button.closest('.list-item');
  }
  return null;
}

function injectEditors() {
  if (!isTasksTab() || !Array.isArray(cardData?.tasks)) return;
  cardData.tasks.forEach((task) => {
    if (task.can_change_status !== true) return;
    const item = findTaskItem(task.id);
    if (!item || item.querySelector('[data-task-due-editor]')) return;
    item.insertAdjacentHTML('beforeend', editorHtml(task));
  });
}

async function ensureCardData() {
  if (!dealId || !isTasksTab()) return;
  if (cardData) return injectEditors();
  if (!loading) {
    loading = rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 12000)
      .then((data) => { cardData = data; return data; })
      .finally(() => { loading = null; });
  }
  try {
    await loading;
    injectEditors();
  } catch (error) {
    setPageStatus(`Не удалось загрузить управление сроками: ${error.message}`, 'error');
  }
}

async function saveDueDate(taskId, value, button) {
  const task = cardData?.tasks?.find((item) => item.id === taskId);
  if (!task || task.can_change_status !== true) {
    setPageStatus('Нет прав менять срок этой задачи.', 'error');
    return;
  }
  if (isDemoDeal() && !confirm('Это демо-сделка. Изменить срок тестовой задачи?')) return;

  const status = document.querySelector(`[data-task-due-status="${taskId}"]`);
  button.disabled = true;
  if (status) status.textContent = 'Сохраняю срок...';
  try {
    await rpc('nav_v2_update_task_due_date', { p_task_id: taskId, p_due_date: value || null }, 12000);
    if (status) status.textContent = value ? 'Срок сохранен. Обновляю карточку...' : 'Срок снят. Обновляю карточку...';
    setPageStatus(value ? 'Срок задачи сохранен.' : 'Срок задачи снят.', 'ok');
    setTimeout(() => location.reload(), 250);
  } catch (error) {
    button.disabled = false;
    if (status) status.textContent = `Ошибка: ${error.message}`;
    setPageStatus(`Не удалось сохранить срок: ${error.message}`, 'error');
  }
}

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab="tasks"], [data-tab-shortcut="tasks"]');
  if (tab) setTimeout(ensureCardData, 0);

  const save = event.target.closest('[data-task-due-save]');
  if (save) {
    const taskId = save.dataset.taskDueSave;
    const input = document.querySelector(`[data-task-due-input="${taskId}"]`);
    saveDueDate(taskId, input?.value || null, save);
    return;
  }

  const clear = event.target.closest('[data-task-due-clear]');
  if (clear) saveDueDate(clear.dataset.taskDueClear, null, clear);
});

window.addEventListener('hashchange', ensureCardData);
if (location.hash === '#tasks') setTimeout(ensureCardData, 100);
