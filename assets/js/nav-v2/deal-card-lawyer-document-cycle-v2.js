import { rpc, esc } from './supabase-v2.js';
import { buildLawyerDocumentCycle } from './deal-card-lawyer-document-cycle-model-v2.js?v=20260715-01';

const PANEL_ID = 'lawyerDocumentCycleV2';
let cardData = null;
let profileData = null;
let selectedDocumentId = '';
let model = null;

function dateOnly(value) {
  if (!value) return 'Срок не назначен';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 'Срок не назначен' : date.toLocaleDateString('ru-RU');
}

function dateTime(value) {
  if (!value) return 'Не зафиксировано';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Не зафиксировано' : date.toLocaleString('ru-RU');
}

function statusTone(status) {
  return ({ checked: 'green', received: 'blue', requested: 'yellow', problem: 'red' })[status] || 'yellow';
}

function dueText(doc) {
  if (doc.dueState === 'overdue') return `Просрочен · ${dateOnly(doc.dueDate)}`;
  if (doc.dueState === 'today') return `Сегодня · ${dateOnly(doc.dueDate)}`;
  if (doc.dueState === 'future') return `До ${dateOnly(doc.dueDate)}`;
  if (doc.dueState === 'closed') return 'Закрыт';
  return 'Срок не назначен';
}

function dueTone(doc) {
  return doc.dueState === 'overdue' ? 'red' : doc.dueState === 'today' || doc.dueState === 'none' ? 'yellow' : doc.dueState === 'closed' ? 'green' : 'blue';
}

function stepClass(status, step) {
  const order = ['needed', 'requested', 'received', 'checked'];
  const normalized = status === 'missing' ? 'needed' : status === 'problem' ? 'received' : status;
  const current = order.indexOf(normalized);
  const index = order.indexOf(step);
  if (status === 'problem' && step === 'checked') return 'is-problem';
  if (index < current || status === 'checked') return 'is-done';
  if (index === current) return status === 'problem' ? 'is-problem' : 'is-current';
  return '';
}

function progressHtml(doc) {
  const steps = [
    ['needed', 'Нужен'],
    ['requested', 'Запрошен'],
    ['received', 'Получен'],
    ['checked', doc.status === 'problem' ? 'Проблема' : 'Проверен']
  ];
  return `<ol class="lawyer-document-progress" aria-label="Этапы документа">${steps.map(([id, label]) => `<li class="${stepClass(doc.status, id)}"><span></span><b>${esc(label)}</b></li>`).join('')}</ol>`;
}

function completionHtml(completion) {
  if (!completion) return '';
  return `<div class="lawyer-document-confirmation" role="status">
    <span>Последнее подтверждённое действие</span>
    <b>${esc(completion.title)} → ${esc(completion.statusLabel)}</b>
    <small>${esc(dateTime(completion.at))} · ${esc(completion.next)}</small>
  </div>`;
}

function actionButtons(doc) {
  if (!doc.actions.length) return '<div class="status ok">По этому документу действий не требуется.</div>';
  return `<div class="actions lawyer-document-actions">${doc.actions.map((action, index) => `<button class="btn ${index === 0 ? 'primary' : action.target === 'problem' ? 'red' : 'light'}" type="button" data-lawyer-document-action="${esc(action.target)}" data-lawyer-document-note-required="${action.requiresNote ? '1' : '0'}">${esc(action.label)}</button>`).join('')}</div>`;
}

function focusHtml(doc) {
  if (!doc) return '<div class="empty">Документы по сделке пока не сформированы.</div>';
  return `<article class="lawyer-document-focus" data-lawyer-document-focus="${esc(doc.id)}">
    <div class="lawyer-document-focus-head">
      <div><span class="lawyer-document-eyebrow">Главный документ сейчас</span><h3>${esc(doc.title)}</h3><p>${esc(doc.side)} · ${esc(doc.why)}</p></div>
      <div class="lawyer-document-focus-pills"><span class="pill ${statusTone(doc.status)}">${esc(doc.statusLabel)}</span><span class="pill ${dueTone(doc)}">${esc(dueText(doc))}</span></div>
    </div>
    ${progressHtml(doc)}
    <div class="lawyer-document-meta">
      <div><span>Ответственный</span><b>${esc(doc.owner)}</b></div>
      <div><span>Контрольный срок</span><b>${esc(dueText(doc))}</b></div>
      <div><span>Последнее изменение</span><b>${esc(dateTime(doc.lastChangedAt))}</b></div>
      <div><span>Влияние</span><b>${esc(doc.blocking)}</b></div>
    </div>
    ${doc.note ? `<div class="lawyer-document-problem"><span>Проблема или комментарий</span><b>${esc(doc.note)}</b></div>` : ''}
    <div class="lawyer-document-next"><span>Следующее действие</span><b>${esc(doc.nextAction)}</b></div>
    ${doc.actions.length ? '<div class="field"><label for="lawyerDocumentNoteV2">Комментарий к действию</label><textarea id="lawyerDocumentNoteV2" placeholder="Для проблемы укажите конкретную причину. Для остальных действий комментарий необязателен."></textarea></div>' : ''}
    ${actionButtons(doc)}
    <div id="lawyerDocumentStatusV2" class="status" aria-live="polite">Изменение сохранит сервер, зафиксирует событие и после обновления выберет следующий документ.</div>
  </article>`;
}

function listHtml(documents, focusId) {
  if (!documents.length) return '<div class="empty">Список документов пуст.</div>';
  return `<div class="lawyer-document-list">${documents.map((doc) => `<article class="lawyer-document-row ${doc.id === focusId ? 'is-selected' : ''}">
    <div><b>${esc(doc.title)}</b><small>${esc(doc.side)} · ${esc(doc.why)}</small><small>${esc(doc.owner)} · ${esc(dueText(doc))} · изменён ${esc(dateTime(doc.lastChangedAt))}</small>${doc.note ? `<small class="lawyer-document-row-problem">${esc(doc.note)}</small>` : ''}</div>
    <div class="lawyer-document-row-actions"><span class="pill ${statusTone(doc.status)}">${esc(doc.statusLabel)}</span><span class="pill ${doc.blockingTone}">${esc(doc.blocking)}</span><button class="btn light" type="button" data-lawyer-document-select="${esc(doc.id)}">${doc.id === focusId ? 'В фокусе' : 'Открыть'}</button></div>
  </article>`).join('')}</div>`;
}

function panelHtml(view) {
  const c = view.counts;
  return `<section id="${PANEL_ID}" class="card lawyer-document-cycle" aria-labelledby="lawyerDocumentCycleTitle">
    <div class="lawyer-document-cycle-head">
      <div><span class="lawyer-document-eyebrow">Документный цикл юриста</span><h2 id="lawyerDocumentCycleTitle">От запроса до подтверждённой проверки</h2><p>Один документ, одно следующее действие. После результата система автоматически поднимет следующий приоритет.</p></div>
      <span class="pill ${c.problem || c.overdue ? 'red' : c.received ? 'blue' : view.complete ? 'green' : 'yellow'}">${view.complete ? 'все проверено' : `открыто: ${c.total - c.checked}`}</span>
    </div>
    <div class="lawyer-document-summary">
      <span class="pill red">проблемы: ${c.problem}</span><span class="pill red">просрочено: ${c.overdue}</span><span class="pill blue">получено: ${c.received}</span><span class="pill yellow">ожидаем: ${c.requested}</span><span class="pill green">проверено: ${c.checked}</span>
    </div>
    ${completionHtml(view.completion)}
    ${view.complete ? '<div class="status ok"><b>Документный минимум закрыт.</b> Все документы в текущем payload имеют статус «Проверен».</div>' : ''}
    ${focusHtml(view.focus)}
    <details class="lawyer-document-all"><summary>Все документы · ${c.total}</summary>${listHtml(view.documents, view.focus?.id)}</details>
  </section>`;
}

function mount() {
  const main = document.querySelector('main.nav-v2-shell');
  if (!main) return;
  const existing = document.getElementById(PANEL_ID);
  if (!model?.visible) {
    existing?.remove();
    delete document.documentElement.dataset.navLawyerDocumentCycle;
    return;
  }
  document.documentElement.dataset.navLawyerDocumentCycle = 'active';
  const html = panelHtml(model);
  if (existing) existing.outerHTML = html;
  else {
    const rework = document.getElementById('spnReworkWorkflowV2');
    const activeRework = ['fix', 'submitted'].includes(rework?.dataset.spnReworkPhase) ? rework : null;
    const anchor = activeRework || main.querySelector('.hero') || main.firstElementChild;
    anchor?.insertAdjacentHTML('afterend', html);
  }
  bindActions();
  if (location.hash === `#${PANEL_ID}`) {
    queueMicrotask(() => document.getElementById(PANEL_ID)?.scrollIntoView({ block: 'start' }));
  }
}

function setStatus(message, tone = '') {
  const status = document.getElementById('lawyerDocumentStatusV2');
  if (!status) return;
  status.className = `status ${tone}`.trim();
  status.textContent = message;
}

async function updateDocument(button) {
  const doc = model?.focus;
  const target = button.dataset.lawyerDocumentAction;
  if (!doc || !target) return;
  const note = document.getElementById('lawyerDocumentNoteV2')?.value?.trim() || '';
  if (button.dataset.lawyerDocumentNoteRequired === '1' && note.length < 5) {
    setStatus('Опишите конкретную проблему по документу.', 'error');
    document.getElementById('lawyerDocumentNoteV2')?.focus();
    return;
  }
  if (model.isDemo && !confirm('Это демо-сделка. Сохранить действие по документу?')) return;
  if (!confirm(`${button.textContent.trim()}: «${doc.title}»?`)) return;
  button.disabled = true;
  setStatus('Сохраняю действие и серверное подтверждение...', 'warn');
  try {
    await rpc('nav_v2_update_document_workflow', {
      p_document_id: doc.id,
      p_status: target,
      p_assigned_to: null,
      p_responsible_role: null,
      p_due_date: null,
      p_note: note || null
    }, 15000);
    setStatus('Результат сохранён. Загружаю подтверждение и следующий документ...', 'ok');
    setTimeout(() => location.reload(), 600);
  } catch (error) {
    button.disabled = false;
    setStatus(error?.message || String(error), 'error');
  }
}

function bindActions() {
  document.querySelectorAll('[data-lawyer-document-select]').forEach((button) => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => {
      selectedDocumentId = button.dataset.lawyerDocumentSelect || '';
      model = buildLawyerDocumentCycle(cardData, profileData, { selectedId: selectedDocumentId });
      mount();
      document.getElementById(PANEL_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  document.querySelectorAll('[data-lawyer-document-action]').forEach((button) => {
    if (button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => void updateDocument(button));
  });
}

export function applyLawyerDocumentCycle(data, profile) {
  try {
    cardData = data;
    profileData = profile || data?.profile || null;
    model = buildLawyerDocumentCycle(cardData, profileData, { selectedId: selectedDocumentId });
    if (selectedDocumentId && !model.documents?.some((doc) => doc.id === selectedDocumentId)) selectedDocumentId = '';
    mount();
  } catch (_) {
    // Юридический документный цикл не должен ломать базовую карточку.
  }
}
