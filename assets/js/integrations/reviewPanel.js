import { listDealReviews, addDealReview, REVIEW_DECISIONS, REVIEW_ROLES } from './reviews.js';
import { updateDealStatus } from './crmApi.js';
import { addReviewEvent, addStatusEvent } from './dealEvents.js';
import { createTasksFromReview, suggestTasksForReview, suggestTasksForDeal } from './autoTasks.js';
import { getDeal } from '../ui/form.js';
import { normalizeDeal } from '../core/dealSchema.js';

let currentDealId = null;
let currentDealTitle = null;
let currentStatus = null;

const QUICK_DECISIONS = [
  ['lawyer', 'can_prepare_deposit', 'Юрист: можно к задатку', 'Документы и условия достаточны для подготовки задатка.'],
  ['lawyer', 'needs_documents', 'Юрист: нужны документы', 'Не хватает документов для юридической проверки.'],
  ['lawyer', 'needs_correction', 'Юрист: доработать условия', 'Нужно изменить или уточнить условия сделки до задатка.'],
  ['lawyer', 'stop_current_conditions', 'Юрист: стоп', 'На текущих условиях задаток брать нельзя.'],
  ['broker', 'needs_documents', 'Брокер: нужны документы в банк', 'Нужно загрузить пакет покупателя, продавца и объекта.'],
  ['broker', 'can_prepare_deal', 'Брокер: можно к сделке', 'Банк/ипотечный сценарий предварительно готов.'],
  ['manager', 'manager_required', 'Менеджер: взять на контроль', 'Нужно управленческое решение по риску или конфликту.']
];

function statusFromReview(role, decision) {
  if (decision === 'stop_current_conditions') return 'cancelled';
  if (decision === 'needs_documents' || decision === 'needs_correction') return 'needs_documents';
  if (decision === 'manager_required') return 'needs_lawyer';
  if (decision === 'can_prepare_deposit') return 'ready_for_deposit';
  if (decision === 'can_prepare_deal') return 'ready_for_deal';
  if (role === 'broker' && decision === 'needs_documents') return 'mortgage_review';
  return null;
}

const STATUS_LABELS_LOCAL = {
  cancelled: 'Сорвана / отменена',
  needs_documents: 'Нужны документы',
  needs_lawyer: 'Нужна проверка юриста',
  ready_for_deposit: 'Готова к задатку',
  ready_for_deal: 'Готова к сделке',
  mortgage_review: 'Ипотека / банк'
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function get(id) { return document.getElementById(id); }
function decisionLabel(value) { return (REVIEW_DECISIONS.find((item) => item[0] === value) || [value, value])[1]; }
function roleLabel(value) { return (REVIEW_ROLES.find((item) => item[0] === value) || [value, value])[1]; }
function currentDealSafe() { try { return getDeal(); } catch (_) { return {}; } }

function ensureTab() {
  if (get('dealReviews')) return;
  const tabs = document.querySelector('.tabs');
  const result = document.querySelector('.result');
  if (!tabs || !result) return;

  const btn = document.createElement('button');
  btn.className = 'tab';
  btn.dataset.tab = 'dealReviews';
  btn.textContent = 'Решения';
  tabs.appendChild(btn);

  const page = document.createElement('div');
  page.id = 'dealReviews';
  page.className = 'tabpage';
  page.innerHTML = '<h2>Решения по сделке</h2><div id="reviewPanelBody" class="box blue">Сохраните или откройте сделку из Supabase, чтобы добавить решение юриста, брокера или менеджера.</div>';
  result.appendChild(page);

  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.tabpage').forEach((item) => item.classList.remove('active'));
    btn.classList.add('active');
    page.classList.add('active');
    renderPanel();
  };
}

function schemaSummary() {
  const deal = currentDealSafe();
  const schema = normalizeDeal(deal);
  const cards = [
    ['Стоп-признаки', schema.stopReasons.length, schema.stopReasons.length ? 'redBox' : 'greenBox'],
    ['Не хватает', schema.required.length, schema.required.length ? 'orangeBox' : 'greenBox'],
    ['Дети', schema.owners.hasChildren ? 'да' : 'нет', schema.owners.hasChildren ? 'redBox' : 'greenBox'],
    ['Брокер', schema.needs.broker ? 'нужен' : 'нет', schema.needs.broker ? 'orangeBox' : 'greenBox']
  ];
  return `<div class="metrics">${cards.map(([title, value, cls]) => `<div class="metric ${cls}"><b>${esc(value)}</b><span>${esc(title)}</span></div>`).join('')}</div>`;
}

function renderSuggestedTasks() {
  const role = get('reviewRole')?.value || 'lawyer';
  const decision = get('reviewDecision')?.value || 'needs_documents';
  const comment = get('reviewComment')?.value || '';
  const target = get('reviewTaskSuggestions');
  if (!target) return;

  const deal = currentDealSafe();
  const tasks = suggestTasksForReview(role, decision, comment, deal);
  const nextStatus = statusFromReview(role, decision);
  target.innerHTML = `
    <h3>Какие задачи будут созданы автоматически</h3>
    ${nextStatus ? `<p class="small"><b>Статус сделки после решения:</b> ${esc(STATUS_LABELS_LOCAL[nextStatus] || nextStatus)}</p>` : ''}
    ${tasks.length ? '<ul>' + tasks.map((task) => `<li><b>${esc(task.title)}</b> <span class="pill ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'orange' : 'blue'}">${esc(task.priority || 'normal')}</span><br><span class="small">${esc(task.description || '')}</span></li>`).join('') + '</ul>' : '<p>Для этого решения автозадач нет. Можно добавить задачу вручную во вкладке «Задачи».</p>'}
  `;
}

function renderQuickButtons() {
  return `<div class="box grayBox"><h3>Быстрые решения</h3><div class="scenario-grid">${QUICK_DECISIONS.map((item, index) => `<button type="button" class="light" data-quick-review="${index}"><b>${esc(item[2])}</b><br><span class="small">${esc(item[3])}</span></button>`).join('')}</div></div>`;
}

async function renderPanel() {
  const body = get('reviewPanelBody');
  if (!body) return;

  if (!currentDealId) {
    const draftTasks = suggestTasksForDeal(currentDealSafe());
    body.className = 'box blue';
    body.innerHTML = `
      <h3>Сделка еще не сохранена в Supabase</h3>
      <p>Решение юриста и задачи сохраняются только к сохраненной сделке. Сначала нажмите «Сохранить в Supabase» или откройте сделку из списка.</p>
      ${schemaSummary()}
      <div class="box orangeBox"><h3>Что система уже видит по текущей карточке</h3>${draftTasks.length ? '<ul>' + draftTasks.slice(0, 8).map((task) => `<li><b>${esc(task.title)}</b><br><span class="small">${esc(task.description || '')}</span></li>`).join('') + '</ul>' : '<p>Критичных автозадач по текущей карточке нет.</p>'}</div>
    `;
    return;
  }

  body.className = 'box blue';
  body.innerHTML = '<p>Загрузка решений...</p>';

  try {
    const items = await listDealReviews(currentDealId);
    body.innerHTML = `
      <h3>${esc(currentDealTitle || 'Открытая сделка')}</h3>
      ${schemaSummary()}
      ${renderQuickButtons()}
      <div class="box blue">
        <h3>Добавить решение</h3>
        <div class="row">
          <label>Кто оставляет решение
            <select id="reviewRole">${REVIEW_ROLES.map((item) => `<option value="${item[0]}">${esc(item[1])}</option>`).join('')}</select>
          </label>
          <label>Решение
            <select id="reviewDecision">${REVIEW_DECISIONS.map((item) => `<option value="${item[0]}">${esc(item[1])}</option>`).join('')}</select>
          </label>
        </div>
        <label>Комментарий / что нужно сделать
          <textarea id="reviewComment" placeholder="Например: нужна свежая ЕГРН с ЭЦП, справка о зарегистрированных, уточнить порядок расчетов..."></textarea>
        </label>
        <div id="reviewTaskSuggestions" class="box orangeBox"></div>
        <button id="btnAddReview" class="green">Добавить решение, создать задачи и обновить статус</button>
      </div>
      <h3>История решений</h3>
      ${items.length ? renderReviews(items) : '<div class="box grayBox">Решений пока нет.</div>'}
    `;

    renderSuggestedTasks();
    get('reviewRole').onchange = renderSuggestedTasks;
    get('reviewDecision').onchange = renderSuggestedTasks;
    get('reviewComment').oninput = renderSuggestedTasks;

    body.querySelectorAll('[data-quick-review]').forEach((button) => {
      button.onclick = () => {
        const [role, decision, , comment] = QUICK_DECISIONS[Number(button.dataset.quickReview)];
        get('reviewRole').value = role;
        get('reviewDecision').value = decision;
        get('reviewComment').value = comment;
        renderSuggestedTasks();
      };
    });

    get('btnAddReview').onclick = async () => {
      try {
        const role = get('reviewRole').value;
        const decision = get('reviewDecision').value;
        const comment = get('reviewComment').value;
        const deal = currentDealSafe();
        await addDealReview(currentDealId, role, decision, comment);
        try { await addReviewEvent(currentDealId, roleLabel(role), decisionLabel(decision), comment); } catch (_) {}
        const createdTasks = await createTasksFromReview(currentDealId, role, decision, comment, deal);
        const nextStatus = statusFromReview(role, decision);
        if (nextStatus) {
          const oldStatus = currentStatus;
          await updateDealStatus(currentDealId, nextStatus);
          try { await addStatusEvent(currentDealId, oldStatus, nextStatus, 'Статус изменен по решению'); } catch (_) {}
          currentStatus = nextStatus;
          window.dispatchEvent(new CustomEvent('navigatorDealStatusChanged', { detail: { id: currentDealId, title: currentDealTitle, status: nextStatus, oldStatus } }));
        }
        get('reviewComment').value = '';
        window.dispatchEvent(new CustomEvent('navigatorTasksChanged', { detail: { id: currentDealId, title: currentDealTitle } }));
        window.dispatchEvent(new CustomEvent('navigatorDealEventsChanged', { detail: { id: currentDealId, title: currentDealTitle } }));
        await renderPanel();
        alert('Решение добавлено. Создано задач: ' + createdTasks.length + (nextStatus ? '. Статус обновлен.' : ''));
      } catch (error) {
        alert('Ошибка добавления решения: ' + error.message);
      }
    };
  } catch (error) {
    body.className = 'box redBox';
    body.innerHTML = 'Ошибка загрузки решений: ' + esc(error.message);
  }
}

function renderReviews(items) {
  return '<table><tr><th>Дата</th><th>Роль</th><th>Решение</th><th>Комментарий</th></tr>' +
    items.map((item) => '<tr><td>' + new Date(item.created_at).toLocaleString('ru-RU') + '</td><td>' + esc(roleLabel(item.reviewer_role)) + '</td><td>' + esc(decisionLabel(item.decision)) + '</td><td>' + esc(item.comment || '—') + '</td></tr>').join('') +
    '</table>';
}

function start() {
  ensureTab();
  window.addEventListener('navigatorDealOpened', (event) => {
    currentDealId = event.detail?.id || null;
    currentDealTitle = event.detail?.title || null;
    currentStatus = event.detail?.status || currentStatus;
    renderPanel();
  });
  window.addEventListener('navigatorDealSaved', (event) => {
    currentDealId = event.detail?.id || currentDealId;
    currentDealTitle = event.detail?.title || currentDealTitle;
    currentStatus = event.detail?.status || currentStatus;
    renderPanel();
  });
  window.addEventListener('navigatorDealStatusChanged', (event) => {
    currentStatus = event.detail?.status || currentStatus;
  });
  document.addEventListener('input', () => setTimeout(renderPanel, 150));
  document.addEventListener('change', () => setTimeout(renderPanel, 150));
}

start();
