import { updateDealStatus, STATUS_LABELS, getMyProfile } from './crmApi.js';
import { addStatusEvent } from './dealEvents.js';
import { getDeal } from '../ui/form.js';
import { normalizeDeal } from '../core/dealSchema.js';

let currentDealId = null;
let currentDealTitle = null;
let currentStatus = 'draft';
let currentRole = localStorage.getItem('navigator_role_workspace_v1') || 'spn';

const STATUS_FLOW = [
  ['draft', 'Черновик', 'СПН заполняет'],
  ['needs_lawyer', 'Передать юристу', 'Нужна проверка'],
  ['lawyer_review', 'У юриста', 'Юрист смотрит'],
  ['needs_documents', 'Доработка', 'Нужны документы'],
  ['mortgage_review', 'Ипотека', 'Банк/брокер'],
  ['ready_for_deposit', 'К задатку', 'Можно готовить'],
  ['ready_for_deal', 'К сделке', 'Финальный пакет'],
  ['registration', 'Регистрация', 'МФЦ/банк'],
  ['done', 'Завершено', 'Сделка закрыта']
];

const STATUS_TONE = {
  draft: 'gray',
  needs_lawyer: 'orange',
  lawyer_review: 'orange',
  needs_documents: 'orange',
  mortgage_review: 'orange',
  ready_for_deposit: 'green',
  ready_for_deal: 'green',
  registration: 'blue',
  done: 'green',
  cancelled: 'red',
  archive: 'gray'
};

const ACTIONS = {
  spn: [
    ['needs_lawyer', 'Передать юристу', 'Передать карточку юристу на проверку.', 'blue'],
    ['mortgage_review', 'Передать брокеру', 'Если есть ипотека, банк, Домклик, сертификаты или оценка.', 'orange'],
    ['needs_documents', 'Отметить доработку', 'Поставить статус, что документы собираются/исправляются.', 'orange'],
    ['ready_for_deposit', 'Запросить готовность к задатку', 'Только если документы собраны и стоп-факторов нет.', 'green']
  ],
  lawyer: [
    ['needs_documents', 'Нужны документы', 'Вернуть СПН на сбор недостающих документов.', 'orange'],
    ['ready_for_deposit', 'Разрешить задаток', 'Юридически можно готовить задаток.', 'green'],
    ['ready_for_deal', 'Разрешить сделку', 'Юридически можно готовить финальную сделку.', 'green'],
    ['cancelled', 'Стоп / нельзя', 'На текущих условиях задаток/сделка невозможны.', 'red']
  ],
  broker: [
    ['mortgage_review', 'Ипотека в работе', 'Банк/Домклик/оценка находятся в подготовке.', 'orange'],
    ['needs_documents', 'Нужны документы в банк', 'Вернуть СПН на сбор пакета для банка.', 'orange'],
    ['ready_for_deal', 'Банк готов', 'Можно согласовывать дату ипотечной сделки.', 'green']
  ],
  manager: [
    ['lawyer_review', 'На проверку юристу', 'Направить сделку юристу.', 'blue'],
    ['needs_documents', 'На доработку', 'Вернуть СПН с задачами.', 'orange'],
    ['ready_for_deposit', 'Разрешить движение', 'Разрешить готовить задаток после закрытия условий.', 'green'],
    ['cancelled', 'Поставить на паузу/стоп', 'Высокий риск или конфликт. Требуется отдельное решение.', 'red']
  ],
  admin: [
    ['draft', 'Вернуть в черновик', 'Сделку нужно перезаполнить или пересобрать.', 'gray'],
    ['lawyer_review', 'Юристу', 'Поставить на юридическую проверку.', 'blue'],
    ['needs_documents', 'Доработка', 'Вернуть на документы.', 'orange'],
    ['ready_for_deposit', 'К задатку', 'Разрешить подготовку задатка.', 'green'],
    ['ready_for_deal', 'К сделке', 'Разрешить финальную подготовку.', 'green'],
    ['done', 'Завершить', 'Отметить сделку завершенной.', 'green'],
    ['cancelled', 'Отменить', 'Отметить сделку отмененной/сорванной.', 'red']
  ]
};

function get(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function loadCss() {
  if (document.querySelector('link[href="./assets/css/status-workflow.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/status-workflow.css';
  document.head.appendChild(link);
}
function statusLabel(status) { return STATUS_LABELS[status] || status || 'Черновик'; }
function statusIndex(status) { return STATUS_FLOW.findIndex(([id]) => id === status); }
function safeDeal() { try { return getDeal(); } catch (_) { return {}; } }
function safeSchema() { try { return normalizeDeal(safeDeal()); } catch (_) { return null; } }

async function detectRole() {
  try {
    const profile = await getMyProfile();
    currentRole = profile.role || currentRole || 'spn';
    localStorage.setItem('navigator_role_workspace_v1', currentRole);
  } catch (_) {}
}

function ensurePanel() {
  if (get('statusWorkflowPanel')) return;
  const resultPanel = document.querySelector('.panel.result');
  const rolePanel = get('roleWorkspace');
  if (!resultPanel) return;
  const box = document.createElement('div');
  box.id = 'statusWorkflowPanel';
  box.className = 'status-workflow';
  if (rolePanel) rolePanel.insertAdjacentElement('afterend', box);
  else resultPanel.insertBefore(box, resultPanel.firstChild);
}

function timelineHtml() {
  const current = statusIndex(currentStatus);
  if (currentStatus === 'cancelled') {
    return `<div class="status-timeline"><div class="status-step stop current" data-num="!."><b>Сорвана / отменена</b><span>Продолжать нельзя без нового решения</span></div></div>`;
  }
  return `<div class="status-timeline">${STATUS_FLOW.map(([id, title, hint], index) => {
    const cls = index < current ? 'done' : index === current ? 'current' : '';
    return `<div class="status-step ${cls}" data-num="${index + 1}"><b>${esc(title)}</b><span>${esc(hint)}</span></div>`;
  }).join('')}</div>`;
}

function miniGrid() {
  const schema = safeSchema();
  const missing = schema?.required?.length ?? 0;
  const risks = schema?.stopReasons?.length ?? 0;
  const children = schema?.owners?.hasChildren ? 'да' : 'нет';
  const broker = schema?.needs?.broker ? 'да' : 'нет';
  return `<div class="status-mini-grid"><div class="status-mini"><b>${risks}</b><span>критичных признаков</span></div><div class="status-mini"><b>${missing}</b><span>не хватает</span></div><div class="status-mini"><b>${children}</b><span>дети</span></div><div class="status-mini"><b>${broker}</b><span>брокер</span></div></div>`;
}

function suggestedNext() {
  const schema = safeSchema();
  if (!currentDealId) return ['Сохраните сделку в Supabase', 'Без сохраненной сделки статус, решения и задачи не смогут закрепиться за карточкой.'];
  if (currentStatus === 'draft') return ['Заполнить мастер и передать юристу', 'Когда минимум данных собран, СПН нажимает “Передать юристу”.'];
  if (schema?.money?.hasMortgage && currentStatus !== 'ready_for_deal' && currentStatus !== 'done') return ['Подключить брокера', 'Есть ипотека/банк/сертификаты: проверьте вкладку “Брокеру” и статус Домклика/банка.'];
  if (schema?.required?.length) return ['Закрыть недостающие данные', 'Сначала закройте недостающие поля и задачи, затем повторно передайте юристу/брокеру.'];
  if (currentStatus === 'needs_documents') return ['Закрыть задачи и вернуть на проверку', 'СПН собирает документы, затем ставит статус “Передать юристу”.'];
  if (currentStatus === 'ready_for_deposit') return ['Готовить задаток', 'Зафиксируйте сумму, сроки, порядок расчетов и ответственность сторон.'];
  if (currentStatus === 'ready_for_deal') return ['Готовить сделку', 'Проверить госпошлину, расчет, МФЦ/банк, документы, ключи и регистрацию.'];
  return ['Контролировать следующий этап', 'Используйте решения и задачи, чтобы не потерять ответственность.'];
}

function roleActionsHtml() {
  const roleActions = ACTIONS[currentRole] || ACTIONS.spn;
  return `<div class="status-action-buttons">${roleActions.map(([status, title, hint, tone]) => `<button type="button" class="${esc(tone)}" data-status-action="${esc(status)}" title="${esc(hint)}">${esc(title)}</button>`).join('')}</div>`;
}

async function changeStatus(status) {
  if (!currentDealId) {
    alert('Сначала сохраните или откройте сделку из Supabase.');
    return;
  }
  try {
    const oldStatus = currentStatus;
    const updated = await updateDealStatus(currentDealId, status);
    currentStatus = updated.status || status;
    try { await addStatusEvent(currentDealId, oldStatus, currentStatus); } catch (_) {}
    window.dispatchEvent(new CustomEvent('navigatorDealStatusChanged', { detail: { id: currentDealId, title: currentDealTitle, status: currentStatus, oldStatus } }));
    window.dispatchEvent(new CustomEvent('navigatorDealEventsChanged', { detail: { id: currentDealId, title: currentDealTitle } }));
    render();
  } catch (error) {
    alert('Ошибка смены статуса: ' + error.message);
  }
}

function render() {
  const box = get('statusWorkflowPanel');
  if (!box) return;
  const tone = STATUS_TONE[currentStatus] || 'gray';
  const [nextTitle, nextText] = suggestedNext();
  box.innerHTML = `
    <div class="status-workflow-top">
      <div>
        <h2>🧭 Статус сделки</h2>
        <p>${currentDealTitle ? esc(currentDealTitle) : 'Откройте или сохраните сделку, чтобы вести статусный маршрут.'}</p>
      </div>
      <span class="status-badge-big ${esc(tone)}">${esc(statusLabel(currentStatus))}</span>
    </div>
    ${timelineHtml()}
    ${miniGrid()}
    <div class="status-actions">
      <div class="status-action-card">
        <h3>Следующий правильный шаг</h3>
        <p><b>${esc(nextTitle)}</b><br>${esc(nextText)}</p>
        <div class="status-history-hint">Статус меняется по сделке в Supabase и будет виден другим ролям.</div>
      </div>
      <div class="status-action-card">
        <h3>Действия роли: ${esc(currentRole)}</h3>
        <p>Нажимайте только то действие, которое реально соответствует текущей готовности сделки.</p>
        ${roleActionsHtml()}
      </div>
    </div>
    ${!currentDealId ? '<div class="status-note">Статус пока работает как подсказка. Чтобы сохранить его, сначала сохраните сделку в Supabase.</div>' : ''}
  `;
  box.querySelectorAll('[data-status-action]').forEach((button) => button.onclick = () => changeStatus(button.dataset.statusAction));
}

async function start() {
  loadCss();
  await detectRole();
  ensurePanel();
  render();
  window.addEventListener('navigatorDealOpened', (event) => {
    currentDealId = event.detail?.id || null;
    currentDealTitle = event.detail?.title || null;
    currentStatus = event.detail?.status || 'draft';
    render();
  });
  window.addEventListener('navigatorDealSaved', (event) => {
    currentDealId = event.detail?.id || currentDealId;
    currentDealTitle = event.detail?.title || currentDealTitle;
    currentStatus = event.detail?.status || currentStatus || 'draft';
    render();
  });
  window.addEventListener('navigatorDealStatusChanged', (event) => {
    currentStatus = event.detail?.status || currentStatus;
    render();
  });
  document.addEventListener('input', () => setTimeout(render, 160));
  document.addEventListener('change', () => setTimeout(render, 160));
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (document.querySelector('.panel.result') && document.querySelector('.tabs')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 80) clearInterval(timer);
}, 200);
