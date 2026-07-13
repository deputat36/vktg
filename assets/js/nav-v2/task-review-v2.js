import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';

const app = document.getElementById('app');
let preview = null;
let busy = false;
let errorText = '';
let activeFilter = 'client';

function n(value) { return Number(value || 0); }
function items() { return Array.isArray(preview?.items) ? preview.items : []; }
function summary() { return preview?.summary || {}; }
function allowed() { return ['owner', 'admin', 'manager'].includes(preview?.profile?.role); }

function fmtDate(value) {
  if (!value) return 'Срок не определён';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ru-RU');
}

function roleLabel(role) {
  return ({ owner: 'владелец', admin: 'администратор', manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'брокер', viewer: 'наблюдатель' })[role] || role || 'роль не назначена';
}

function priorityLabel(priority) {
  return ({ urgent: 'Срочно', high: 'Высокий', normal: 'Обычный', low: 'Низкий' })[priority] || priority || 'Без приоритета';
}

function typeTone(type) {
  return ({ legal_blocker: 'red', management_escalation: 'red', operational_task: 'blue', document_request: 'blue', broker_task: 'yellow', quality_warning: 'gray', system_recommendation: 'gray' })[type] || 'gray';
}

function contractTone(state) {
  return ({ matches_inference: 'green', overrides_inference: 'blue', partial: 'yellow', not_persisted: 'gray' })[state] || 'gray';
}

function contractNeedsReview(item) {
  return item.contract_state === 'not_persisted' || item.contract_state === 'partial';
}

function ownerText(item) {
  if (item.assigned_to_name) return item.assigned_to_name;
  if (item.assigned_role) return `Роль: ${roleLabel(item.assigned_role)}`;
  return 'Ответственный не назначен';
}

function filterItems() {
  return items().filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'client') return Boolean(item.is_client_action);
    if (activeFilter === 'quality') return item.task_type === 'quality_warning';
    if (activeFilter === 'legal') return item.task_type === 'legal_blocker';
    if (activeFilter === 'broker') return item.task_type === 'broker_task';
    if (activeFilter === 'unassigned') return Boolean(item.needs_assignment);
    if (activeFilter === 'contract') return contractNeedsReview(item);
    return true;
  });
}

function countFilter(filter) {
  const original = activeFilter;
  activeFilter = filter;
  const count = filterItems().length;
  activeFilter = original;
  return count;
}

function filterButton(id, label) {
  const count = countFilter(id);
  return `<button class="tab ${activeFilter === id ? 'active' : ''}" type="button" data-filter="${id}" aria-pressed="${activeFilter === id ? 'true' : 'false'}">${esc(label)} · ${count}</button>`;
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function contractDetails(item) {
  const persisted = item.persisted_task_type && item.persisted_sla_days
    ? `Сохранено: ${item.persisted_task_type}, ${n(item.persisted_sla_days)} дн.`
    : item.persisted_task_type || item.persisted_sla_days
      ? `Частично сохранено: ${item.persisted_task_type || 'тип не указан'}, ${item.persisted_sla_days ? `${n(item.persisted_sla_days)} дн.` : 'SLA не указан'}`
      : 'Тип и SLA не записаны в задачу';
  const inference = `Расчёт: ${item.inferred_task_type || item.task_type || 'тип не определён'}, ${n(item.inferred_sla_days || item.sla_days)} дн.`;
  return `${persisted}. ${inference}.`;
}

function taskRow(item) {
  const overdueTone = item.is_overdue ? 'red' : 'green';
  const ownerTone = item.needs_assignment ? 'red' : 'blue';
  return `<article class="list-item task-review-card">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${typeTone(item.task_type)}">${esc(item.task_type_label || 'Рабочая задача')}</span>
          <span class="pill ${item.priority === 'urgent' ? 'red' : item.priority === 'high' ? 'yellow' : 'gray'}">${esc(priorityLabel(item.priority))}</span>
          <span class="pill ${contractTone(item.contract_state)}">${esc(item.contract_state_label || 'Контракт не определён')}</span>
        </div>
        <h3>${esc(item.title || 'Задача без названия')}</h3>
        <p class="muted">${esc(item.deal_title || 'Сделка')} · ${esc(statusText(item.deal_status))}</p>
      </div>
      <span class="pill ${overdueTone}">${item.is_overdue ? `Просрочено: ${n(item.days_overdue)} дн.` : 'В срок'}</span>
    </div>
    ${item.description ? `<p>${esc(item.description)}</p>` : ''}
    <div class="task-review-facts">
      <div><span class="small">Ответственный</span><b>${esc(ownerText(item))}</b><span class="pill ${ownerTone}">${esc(item.assignment_state === 'person_assigned' ? 'Назначен сотрудник' : item.assignment_state === 'role_assigned' ? 'Назначена роль' : 'Не назначен')}</span></div>
      <div><span class="small">Контрольная дата</span><b>${esc(fmtDate(item.control_due_date))}</b><span class="muted">SLA: ${n(item.sla_days)} дн.${item.due_date ? '' : ' · рассчитано автоматически'}</span></div>
    </div>
    <details class="task-review-contract"><summary>Тип и SLA задачи</summary><p>${esc(contractDetails(item))}</p></details>
    ${item.overdue_reason ? `<div class="status ${item.is_overdue ? 'warn' : 'ok'}"><b>Почему требует внимания:</b> ${esc(item.overdue_reason)}</div>` : ''}
    <div class="actions task-review-actions" style="justify-content:flex-start">
      <a class="btn primary" href="${esc(item.card_url || `./deal-card-v2.html?id=${encodeURIComponent(item.deal_id)}`)}">Открыть карточку</a>
    </div>
  </article>`;
}

function draw() {
  const s = summary();
  const rows = filterItems();
  const missingContracts = n(s.missing_contracts) + n(s.partial_contracts);
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero"><span class="role-home-eyebrow">Предварительный разбор</span><h1>Рабочие задачи отдельно от проверок качества</h1><p>Здесь задачи сгруппированы по смыслу. Ничего не закрывается, не переназначается и не переклассифицируется автоматически.</p></section>
    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${preview?.preview_only ? `<div class="status ok" role="status"><b>Только просмотр.</b> Таблица поддерживает сохранённые тип и SLA, но существующие задачи не изменены. Preview показывает сохранённый контракт и безопасный расчёт рядом.</div>` : ''}
    ${preview ? `<section class="kpi-row task-review-metrics" aria-label="Сводка задач">
      ${metric('Клиентские действия', n(s.client_actions), n(s.client_actions) ? 'blue' : 'green')}
      ${metric('Проверки качества', n(s.quality_warnings), n(s.quality_warnings) ? 'yellow' : 'green')}
      ${metric('Юридические стоп-факторы', n(s.legal_blockers), n(s.legal_blockers) ? 'red' : 'green')}
      ${metric('Задачи брокера', n(s.broker_tasks), n(s.broker_tasks) ? 'yellow' : 'green')}
      ${metric('Просрочено', n(s.overdue_tasks), n(s.overdue_tasks) ? 'red' : 'green')}
      ${metric('Контракт не сохранён', missingContracts, missingContracts ? 'yellow' : 'green')}
    </section>
    <section class="card task-review-explanation">
      <h2>Как читать очередь</h2>
      <div class="task-review-legend">
        <div><span class="pill blue">Рабочая задача</span><p>Действие по расчётам, договорённостям или следующему этапу сделки.</p></div>
        <div><span class="pill red">Юридический стоп-фактор</span><p>Требует решения юриста до продолжения сделки.</p></div>
        <div><span class="pill yellow">Задача брокера</span><p>Связана с финансированием и ипотечным сценарием.</p></div>
        <div><span class="pill gray">Проверка качества</span><p>Показывает пробел данных, но не заменяет клиентское действие.</p></div>
      </div>
      <div class="status warn"><b>Контракт задачи.</b> Серый статус означает, что тип и SLA пока вычисляются из источника задачи. Сохранять их массово нельзя до authenticated E2E и утверждённого mutation workflow.</div>
    </section>
    <section class="card task-review-list">
      <div class="section-title"><div><h2>Очередь задач</h2><p class="muted">Сначала просроченные, неназначенные и блокирующие задачи.</p></div><span class="pill ${rows.length ? 'red' : 'green'}">${rows.length}</span></div>
      <div class="tabs task-review-tabs">${filterButton('client', 'Клиентские действия')}${filterButton('quality', 'Качество данных')}${filterButton('legal', 'Юрист')}${filterButton('broker', 'Брокер')}${filterButton('unassigned', 'Без ответственного')}${filterButton('contract', 'Без сохранённого контракта')}${filterButton('all', 'Все')}</div>
      <div class="list">${rows.map(taskRow).join('') || '<div class="empty">В выбранной группе нет задач.</div>'}</div>
    </section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Классифицирую задачи…' : 'Разбор ещё не загружен.'}</p></section>`}
  </main>`;
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter || 'client';
      draw();
    });
  });
}

async function loadPreview() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    preview = await rpc('nav_v2_get_task_taxonomy_preview', { p_limit: 500 }, 20000);
    if (!allowed()) throw new Error('Разбор задач доступен владельцу, администратору и менеджеру.');
  } catch (error) {
    preview = null;
    errorText = error.message || String(error);
  } finally {
    busy = false;
    draw();
  }
}

async function init() {
  setupTop('manager');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  await loadPreview();
}

init();
