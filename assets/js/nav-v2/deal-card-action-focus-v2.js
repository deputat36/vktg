import { esc } from './supabase-v2.js';
import { buildDealActionFocus } from './deal-card-action-focus-model-v2.js?v=20260714-01';

function dateLabel(value) {
  if (!value) return 'Срок не указан';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Срок не указан';
  return `До ${date.toLocaleDateString('ru-RU')}`;
}

function deadlinePill(focus) {
  const labels = {
    overdue: ['Срок просрочен', 'red'],
    today: ['Срок сегодня', 'yellow'],
    future: [dateLabel(focus.dueDate), 'blue'],
    none: ['Срок нужно уточнить', 'yellow']
  };
  const [label, cls] = labels[focus.deadlineState] || labels.none;
  return `<span class="pill ${cls}">${esc(label)}</span>`;
}

function blockerPills(focus) {
  const pills = [];
  if (focus.blockers.overdueTasks) pills.push(`<span class="pill red">просроченных задач: ${focus.blockers.overdueTasks}</span>`);
  if (focus.blockers.redRisks) pills.push(`<span class="pill red">красных рисков: ${focus.blockers.redRisks}</span>`);
  if (focus.blockers.missingDocuments) pills.push(`<span class="pill yellow">не хватает документов: ${focus.blockers.missingDocuments}</span>`);
  if (!pills.length) pills.push('<span class="pill green">критичных блокеров не найдено</span>');
  return pills.join('');
}

function tabLabel(tab) {
  return ({ tasks: 'Открыть задачи', risks: 'Открыть риски', docs: 'Открыть документы', overview: 'Открыть сводку' })[tab] || 'Открыть раздел';
}

function focusHtml(focus) {
  const readOnlyNotice = focus.readOnly
    ? '<div class="status">Режим наблюдения: блок показывает приоритет, но не разрешает менять данные.</div>'
    : '';
  const taskNotice = focus.source === 'task'
    ? `<span class="pill blue">задача ${focus.taskStatus === 'in_progress' ? 'в работе' : 'открыта'}</span>`
    : `<span class="pill blue">источник: ${focus.source === 'risk' ? 'риск' : focus.source === 'document' ? 'документ' : 'следующий шаг сделки'}</span>`;
  const relatedButton = focus.relatedTab && focus.relatedTab !== focus.primaryTab
    ? `<button class="btn light" type="button" data-action-focus-tab="${esc(focus.relatedTab)}">${esc(tabLabel(focus.relatedTab))}</button>`
    : '';

  return `<section id="dealActionFocus" class="card deal-action-focus" aria-labelledby="dealActionFocusTitle">
    <div class="deal-action-focus-head">
      <div>
        <span class="deal-action-focus-eyebrow">Главное действие сейчас</span>
        <h2 id="dealActionFocusTitle">${esc(focus.title)}</h2>
        ${focus.description ? `<p class="muted">${esc(focus.description)}</p>` : ''}
      </div>
      <div class="deal-action-focus-pills">${taskNotice}${deadlinePill(focus)}</div>
    </div>
    <div class="deal-action-focus-grid">
      <div><span>Ответственный</span><b>${esc(focus.responsible)}</b></div>
      <div><span>Срок</span><b>${esc(focus.dueDate ? dateLabel(focus.dueDate) : 'Нужно назначить')}</b></div>
      <div><span>Готовность</span><b>Задаток ${focus.readiness.deposit}% · Сделка ${focus.readiness.deal}%</b></div>
    </div>
    <div class="deal-action-focus-result"><span>Как понять, что готово</span><b>${esc(focus.resultCriteria)}</b></div>
    <div class="deal-action-focus-blockers">${blockerPills(focus)}</div>
    ${readOnlyNotice}
    <div class="actions deal-action-focus-actions">
      <button class="btn primary" type="button" data-action-focus-tab="${esc(focus.primaryTab)}"${focus.taskId ? ` data-action-focus-task="${esc(focus.taskId)}"` : ''}>${esc(tabLabel(focus.primaryTab))}</button>
      ${relatedButton}
    </div>
  </section>`;
}

function openTab(tabName, taskId = '') {
  const tab = document.querySelector(`[data-tab="${tabName}"]`);
  if (tab) {
    tab.click();
    setTimeout(() => {
      const taskTarget = taskId ? document.querySelector(`[data-task-id="${taskId}"]`)?.closest('.list-item') : null;
      (taskTarget || document.querySelector('.tabs'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return;
  }
  location.hash = tabName;
  location.reload();
}

function bindActions() {
  document.querySelectorAll('[data-action-focus-tab]').forEach((button) => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => openTab(button.dataset.actionFocusTab || 'overview', button.dataset.actionFocusTask || ''));
  });
}

export function applyDealCardActionFocus(data, profile) {
  const main = document.querySelector('main.nav-v2-shell');
  if (!main || !data?.deal) return;
  const focus = buildDealActionFocus(data, profile || data?.profile || null);
  const html = focusHtml(focus);
  const existing = document.getElementById('dealActionFocus');
  if (existing) existing.outerHTML = html;
  else {
    const anchor = document.getElementById('spnRecheckAlert') || main.querySelector('.hero') || main.firstElementChild;
    anchor?.insertAdjacentHTML('afterend', html);
  }
  bindActions();
}
