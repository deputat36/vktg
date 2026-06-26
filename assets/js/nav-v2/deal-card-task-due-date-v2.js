import { rpc, esc } from './supabase-v2.js?v=20260625-1320';

const dealId = new URLSearchParams(location.search).get('id');
let cardData = null;
let loading = null;

function isTasksTab() {
  return location.hash === '#tasks' || document.querySelector('[data-tab="tasks"].active');
}

function isDemoDeal() {
  return document.querySelector('.hero .pill.blue')?.textContent?.trim() === 'ДЕМО';
}

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + Number(offsetDays || 0));
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayValue() {
  return dateValue(localDate());
}

function dateValueWithOffset(offsetDays) {
  return dateValue(localDate(offsetDays));
}

function daysUntil(value) {
  if (!value) return null;
  const due = new Date(`${value}T00:00:00`);
  const today = localDate();
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function dateLabel(value) {
  if (!value) return '<span class="pill yellow">срок не установлен</span>';
  const due = new Date(`${value}T00:00:00`);
  const diff = daysUntil(value);
  const dateText = due.toLocaleDateString('ru-RU');
  const cls = diff < 0 ? 'red' : diff <= 1 ? 'yellow' : 'blue';
  const prefix = diff < 0
    ? 'просрочено: '
    : diff === 0
      ? 'сегодня: '
      : diff === 1
        ? 'завтра: '
        : 'срок: ';
  return `<span class="pill ${cls}">${prefix}${dateText}</span>`;
}

function setPageStatus(text, type = 'info') {
  const status = document.getElementById('pageStatus');
  if (!status) return;
  status.className = `status ${type}`;
  status.textContent = text;
}

function presetButtonsHtml(taskId) {
  return `<div class="actions" style="justify-content:flex-start;margin-top:8px;gap:6px">
    <button class="btn light" type="button" data-task-due-preset="${esc(taskId)}" data-task-due-days="0">Сегодня</button>
    <button class="btn light" type="button" data-task-due-preset="${esc(taskId)}" data-task-due-days="1">Завтра</button>
    <button class="btn light" type="button" data-task-due-preset="${esc(taskId)}" data-task-due-days="2">+2 дня</button>
    <button class="btn light" type="button" data-task-due-preset="${esc(taskId)}" data-task-due-days="5">+5 дней</button>
  </div>`;
}

function editorHtml(task) {
  const value = task.due_date || '';
  return `<div class="nav-task-due-editor" data-task-due-editor="${esc(task.id)}" style="margin-top:10px">
    <div class="actions" style="justify-content:flex-start;align-items:flex-end">
      <div class="field" style="margin:0;min-width:180px">
        <label for="taskDue-${esc(task.id)}">Срок выполнения</label>
        <input id="taskDue-${esc(task.id)}" type="date" min="${todayValue()}" value="${esc(value)}" data-task-due-input="${esc(task.id)}">
      </div>
      <button class="btn primary" type="button" data-task-due-save="${esc(task.id)}">Сохранить срок</button>
      <button class="btn light" type="button" data-task-due-clear="${esc(task.id)}">Снять срок</button>
      <span data-task-due-label="${esc(task.id)}">${dateLabel(value)}</span>
    </div>
    ${presetButtonsHtml(task.id)}
    <div class="small" data-task-due-status="${esc(task.id)}">Быстрые сроки только подставляют дату. Для изменения нажмите «Сохранить срок».</div>
  </div>`;
}

function summaryHtml(task) {
  return `<div class="actions" data-task-due-summary="${esc(task.id)}" style="justify-content:flex-start;margin-top:8px">
    ${dateLabel(task.due_date)}
    <span class="small">Срок меняет ответственный специалист.</span>
  </div>`;
}

function findTaskItem(task) {
  const buttons = document.querySelectorAll('[data-task-id]');
  for (const button of buttons) {
    if (button.dataset.taskId === task.id) return button.closest('.list-item');
  }
  const items = document.querySelectorAll('.list-item');
  for (const item of items) {
    const title = item.querySelector(':scope > b')?.textContent?.trim();
    if (title === String(task.title || '').trim()) return item;
  }
  return null;
}

function injectEditors() {
  if (!isTasksTab() || !Array.isArray(cardData?.tasks)) return;
  cardData.tasks.forEach((task) => {
    const item = findTaskItem(task);
    if (!item) return;
    if (task.can_change_status === true) {
      if (!item.querySelector('[data-task-due-editor]')) item.insertAdjacentHTML('beforeend', editorHtml(task));
      return;
    }
    if (!item.querySelector('[data-task-due-summary]')) item.insertAdjacentHTML('beforeend', summaryHtml(task));
  });
}

async function ensureCardData() {
  if (!dealId || !isTasksTab()) return;
  if (cardData) return injectEditors();
  if (!loading) {
    loading = rpc('nav_v2_get_deal_card', { p_deal_id: dealId })
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

function updateDuePreview(taskId) {
  const input = document.querySelector(`[data-task-due-input="${taskId}"]`);
  const label = document.querySelector(`[data-task-due-label="${taskId}"]`);
  const status = document.querySelector(`[data-task-due-status="${taskId}"]`);
  if (label) label.innerHTML = dateLabel(input?.value || '');
  if (status) status.textContent = 'Дата выбрана. Чтобы применить изменение, нажмите «Сохранить срок».';
}

async function saveDueDate(taskId, value, button) {
  const task = cardData?.tasks?.find((item) => item.id === taskId);
  if (!task || task.can_change_status !== true) {
    setPageStatus('Нет прав менять срок этой задачи.', 'error');
    return;
  }
  if (value && value < todayValue()) {
    setPageStatus('Срок задачи не может быть в прошлом.', 'error');
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

  const preset = event.target.closest('[data-task-due-preset]');
  if (preset) {
    const taskId = preset.dataset.taskDuePreset;
    const input = document.querySelector(`[data-task-due-input="${taskId}"]`);
    if (input) {
      input.value = dateValueWithOffset(Number(preset.dataset.taskDueDays || 0));
      updateDuePreview(taskId);
    }
    return;
  }

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

document.addEventListener('input', (event) => {
  const input = event.target.closest('[data-task-due-input]');
  if (input) updateDuePreview(input.dataset.taskDueInput);
});

window.addEventListener('hashchange', ensureCardData);
if (location.hash === '#tasks') setTimeout(ensureCardData, 100);
