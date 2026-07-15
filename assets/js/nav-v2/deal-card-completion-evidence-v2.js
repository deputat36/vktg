import { esc } from './supabase-v2.js';
import { buildDealCompletionEvidence } from './deal-card-completion-evidence-model-v2.js?v=20260715-01';

const PANEL_ID = 'dealCompletionEvidenceV2';

function dateTime(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? 'Время не зафиксировано' : date.toLocaleString('ru-RU');
}

function dueLabel(action) {
  if (!action?.dueDate) return 'Срок нужно назначить';
  const date = new Date(`${String(action.dueDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Срок нужно назначить';
  const prefix = action.deadlineState === 'overdue' ? 'Просрочено · ' : action.deadlineState === 'today' ? 'Сегодня · ' : 'До ';
  return `${prefix}${date.toLocaleDateString('ru-RU')}`;
}

function dueTone(action) {
  if (action?.deadlineState === 'overdue') return 'red';
  if (action?.deadlineState === 'today' || action?.deadlineState === 'none') return 'yellow';
  return 'blue';
}

function tabLabel(tab) {
  return ({ tasks: 'Перейти к следующей задаче', risks: 'Перейти к следующему риску', docs: 'Перейти к следующему документу', overview: 'Открыть следующий шаг' })[tab]
    || 'Открыть следующий шаг';
}

function panelHtml(model) {
  const action = model.nextAction;
  return `<section id="${PANEL_ID}" class="card deal-completion-evidence" data-completion-kind="${esc(model.kind)}" role="status" aria-labelledby="dealCompletionEvidenceTitle">
    <div class="deal-completion-head">
      <div><span class="deal-completion-eyebrow">Результат подтверждён сервером</span><h2 id="dealCompletionEvidenceTitle">${esc(model.title)}</h2><p>Карточка уже загружена после сохранения. Показан факт из истории сделки, а не локальное обещание интерфейса.</p></div>
      <span class="pill green">${esc(model.state)}</span>
    </div>
    <details class="mobile-first-screen-details deal-completion-meta-details">
      <summary>Кто и когда подтвердил</summary>
      <div class="mobile-first-screen-details-body deal-completion-meta">
        <div><span>Кто зафиксировал</span><b>${esc(model.actor)}</b></div>
        <div><span>Когда</span><b>${esc(dateTime(model.at))}</b></div>
        <div><span>Подтверждение</span><b>${esc(model.serverFact)}</b></div>
      </div>
    </details>
    <div class="deal-completion-next">
      <div><span>Следующее действие выбрано автоматически</span><h3>${esc(action.title)}</h3></div>
      <div class="deal-completion-next-meta"><span class="pill blue">${esc(action.responsible)}</span><span class="pill ${dueTone(action)}">${esc(dueLabel(action))}</span></div>
      ${action.resultCriteria ? `<p><b>Готово, когда:</b> ${esc(action.resultCriteria)}</p>` : ''}
      <div class="actions"><button class="btn primary mobile-first-screen-primary-action" type="button" data-completion-next-tab="${esc(action.primaryTab)}"${action.taskId ? ` data-completion-next-task="${esc(action.taskId)}"` : ''}>${esc(tabLabel(action.primaryTab))}</button></div>
    </div>
  </section>`;
}

function openNext(tabName, taskId = '') {
  const tab = document.querySelector(`[data-tab="${tabName}"]`);
  if (tab) {
    tab.click();
    setTimeout(() => {
      const task = taskId ? document.querySelector(`[data-task-id="${taskId}"]`)?.closest('.list-item') : null;
      (task || document.querySelector('.tabs'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return;
  }
  location.hash = tabName;
  location.reload();
}

function bindAction() {
  const button = document.querySelector('[data-completion-next-tab]');
  if (!button || button.dataset.bound === '1') return;
  button.dataset.bound = '1';
  button.addEventListener('click', () => openNext(button.dataset.completionNextTab || 'overview', button.dataset.completionNextTask || ''));
}

export function applyDealCardCompletionEvidence(data, profile) {
  const main = document.querySelector('main.nav-v2-shell');
  if (!main || !data?.deal) return;
  const model = buildDealCompletionEvidence(data, profile || data?.profile || null);
  const existing = document.getElementById(PANEL_ID);
  if (!model.visible) {
    existing?.remove();
    delete document.documentElement.dataset.navCompletionEvidence;
    return;
  }

  document.documentElement.dataset.navCompletionEvidence = model.kind;
  const html = panelHtml(model);
  if (existing) existing.outerHTML = html;
  else {
    const actionFocus = document.getElementById('dealActionFocus');
    if (actionFocus) actionFocus.insertAdjacentHTML('beforebegin', html);
    else {
      const lawyerCycle = document.getElementById('lawyerDocumentCycleV2');
      const rework = document.getElementById('spnReworkWorkflowV2');
      const activeRework = ['fix', 'submitted'].includes(rework?.dataset.spnReworkPhase) ? rework : null;
      const anchor = lawyerCycle || activeRework || main.querySelector('.hero') || main.firstElementChild;
      anchor?.insertAdjacentHTML('afterend', html);
    }
  }
  bindAction();
}
