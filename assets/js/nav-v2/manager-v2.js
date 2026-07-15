import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';
import { buildManagerActionRoute, managerItemNeedsDistribution } from './manager-action-route-v2.js?v=20260714-01';
import {
  buildManagerConfirmedResult,
  managerResultCandidate,
  sortManagerConfirmedResults,
  summarizeManagerConfirmedResults
} from './manager-confirmed-results-model-v2.js?v=20260715-01';

const app = document.getElementById('app');
const COMPLETION_LOAD_LIMIT = 40;
const COMPLETION_CONCURRENCY = 4;
let preview = null;
let busy = false;
let errorText = '';
let activeFilter = 'today';
let confirmedResults = [];
let confirmedBusy = false;
let confirmedError = '';
let activeConfirmedFilter = 'today';

function n(value) { return Number(value || 0); }
function items() { return Array.isArray(preview?.items) ? preview.items : []; }
function summary() { return preview?.summary || {}; }
function workload() { return Array.isArray(preview?.spn_workload) ? preview.spn_workload : []; }
function allowed() { return ['owner', 'admin', 'manager'].includes(preview?.profile?.role); }

function fmtDate(value) {
  if (!value) return 'Срок не назначен';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ru-RU');
}

function fmtDateTime(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return 'Время не зафиксировано';
  return date.toLocaleString('ru-RU');
}

function dueIsTodayOrOverdue(value) {
  if (!value) return true;
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due <= today;
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function roleLabel(role) {
  return ({ manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'брокер', owner: 'владелец', admin: 'администратор' })[role] || role || 'роль не назначена';
}

function ownerText(item) {
  return item.next_action_owner_name || roleLabel(item.next_action_owner_role) || 'Ответственный не назначен';
}

function queueReasons(item) {
  const reasons = [];
  (item.missing_critical_data || []).forEach((reason) => reasons.push(reason));
  (item.operational_blockers || []).forEach((reason) => reasons.push(reason));
  return [...new Set(reasons)];
}

function needsDistribution(item) {
  return managerItemNeedsDistribution(item);
}

function needsToday(item) {
  return item.needs_manager_attention
    && (dueIsTodayOrOverdue(item.next_action_due_date) || n(item.stale_days) >= 7 || n(item.blocking_risks_count) > 0);
}

function visibleItems() {
  return items().filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'unassigned') return needsDistribution(item);
    return needsToday(item);
  });
}

function todayCount() { return items().filter(needsToday).length; }
function distributionCount() { return items().filter(needsDistribution).length; }
function overdueCount() {
  return items().filter((item) => n(item.overdue_tasks_count) > 0 || n(item.overdue_required_documents_count) > 0).length;
}

function filterButton(id, label, count) {
  return `<button class="tab ${activeFilter === id ? 'active' : ''}" type="button" data-filter="${id}" aria-pressed="${activeFilter === id ? 'true' : 'false'}">${esc(label)} · ${n(count)}</button>`;
}

function confirmedFilterButton(id, label, count) {
  return `<button class="tab ${activeConfirmedFilter === id ? 'active' : ''}" type="button" data-confirmed-filter="${id}" aria-pressed="${activeConfirmedFilter === id ? 'true' : 'false'}">${esc(label)} · ${n(count)}</button>`;
}

function readinessTone(value) {
  if (n(value) >= 80) return 'green';
  if (n(value) >= 60) return 'yellow';
  return 'red';
}

function assignmentLabels(item) {
  const labels = [];
  if (!item.manager_id) labels.push('Без менеджера');
  if (item.lawyer_assignment_state === 'waiting_assignment') labels.push('Назначить юриста');
  if (item.broker_assignment_state === 'waiting_assignment') labels.push('Назначить брокера');
  return labels;
}

function reasonList(reasons) {
  if (!reasons.length) return '<p class="muted">Критичных препятствий не найдено.</p>';
  return `<ul class="manager-reasons">${reasons.map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul>`;
}

function actionButtons(item) {
  const route = buildManagerActionRoute(item);
  return `<div class="actions manager-card-actions" style="justify-content:flex-start">
    <a class="btn primary" data-manager-action-kind="${esc(route.primary.kind)}" href="${esc(route.primary.href)}">${esc(route.primary.label)}</a>
    ${route.secondary.map((action) => `<a class="btn light" data-manager-action-kind="${esc(action.kind)}" href="${esc(action.href)}">${esc(action.label)}</a>`).join('')}
  </div>`;
}

function itemRow(item) {
  const reasons = queueReasons(item);
  const dueTone = dueIsTodayOrOverdue(item.next_action_due_date) ? 'red' : 'blue';
  const assignments = assignmentLabels(item);
  return `<article class="list-item manager-decision-card">
    <div class="section-title manager-decision-head">
      <div>
        <b>${esc(item.title || 'Сделка')}</b>
        <span class="small">${esc(statusText(item.status))} · без активности ${n(item.stale_days)} дн.</span>
      </div>
      <span class="pill ${readinessTone(item.operational_readiness_percent)}">готовность ${n(item.operational_readiness_percent)}%</span>
    </div>
    <div class="manager-card-labels">
      ${assignments.map((label) => `<span class="pill yellow">${esc(label)}</span>`).join('')}
      ${n(item.blocking_risks_count) ? `<span class="pill red">блокирующих рисков: ${n(item.blocking_risks_count)}</span>` : ''}
      ${n(item.overdue_tasks_count) ? `<span class="pill red">просроченных задач: ${n(item.overdue_tasks_count)}</span>` : ''}
      ${n(item.overdue_required_documents_count) ? `<span class="pill red">просроченных документов: ${n(item.overdue_required_documents_count)}</span>` : ''}
    </div>
    <section class="manager-main-action" aria-label="Главное действие по сделке">
      <div>
        <span class="small">Главное действие</span>
        <b>${esc(item.main_action || 'Назначить следующий шаг')}</b>
      </div>
      <div class="manager-owner-due">
        <span>${esc(ownerText(item))}</span>
        <span class="pill ${dueTone}">${esc(fmtDate(item.next_action_due_date))}</span>
      </div>
    </section>
    <div class="manager-reason-box">
      <b>Почему сделка требует внимания</b>
      ${reasonList(reasons)}
    </div>
    ${actionButtons(item)}
    <details class="manager-card-details">
      <summary>Показать расчёт готовности</summary>
      <p><b>Почему нельзя двигаться к задатку:</b> ${esc(item.cannot_advance_deposit_reason || item.cannot_advance_reason || 'Причина не определена')}</p>
      <p class="muted">Старый показатель: ${n(item.legacy_readiness_deposit_percent)}%. Операционный показатель: ${n(item.operational_readiness_percent)}%.</p>
    </details>
  </article>`;
}

function completionDueTone(action) {
  if (action?.deadlineState === 'overdue') return 'red';
  if (action?.deadlineState === 'today' || action?.deadlineState === 'none') return 'yellow';
  return 'blue';
}

function completionDueLabel(action) {
  if (!action?.dueDate) return 'Срок нужно назначить';
  const prefix = action.deadlineState === 'overdue' ? 'Просрочено · ' : action.deadlineState === 'today' ? 'Сегодня · ' : 'До ';
  return `${prefix}${fmtDate(String(action.dueDate).slice(0, 10))}`;
}

function confirmedRows() {
  if (activeConfirmedFilter === 'today') return confirmedResults.filter((item) => item.window === 'today');
  return confirmedResults;
}

function confirmedResultRow(item) {
  const action = item.nextAction || {};
  return `<article class="list-item manager-confirmed-card" data-manager-result-kind="${esc(item.kind)}">
    <div class="section-title manager-confirmed-head">
      <div><span class="small">${esc(item.dealTitle)}</span><h3>${esc(item.resultTitle)}</h3></div>
      <span class="pill green">${esc(item.state)}</span>
    </div>
    <div class="manager-confirmed-meta">
      <div><span>Кто зафиксировал</span><b>${esc(item.actor)}</b></div>
      <div><span>Когда</span><b>${esc(fmtDateTime(item.at))}</b></div>
      <div><span>Серверное подтверждение</span><b>${esc(item.serverFact)}</b></div>
    </div>
    <section class="manager-confirmed-next" aria-label="Следующий шаг после подтверждённого результата">
      <div><span class="small">Следующий ответственный шаг</span><b>${esc(action.title || 'Определить следующий шаг сделки')}</b></div>
      <div class="manager-confirmed-next-owner"><span>${esc(action.responsible || 'Ответственный не назначен')}</span><span class="pill ${completionDueTone(action)}">${esc(completionDueLabel(action))}</span></div>
      ${action.resultCriteria ? `<p><b>Готово, когда:</b> ${esc(action.resultCriteria)}</p>` : ''}
    </section>
    <div class="actions manager-confirmed-actions"><a class="btn primary" href="${esc(item.nextHref)}">Открыть следующий шаг</a></div>
  </article>`;
}

function confirmedResultsSection() {
  const counts = summarizeManagerConfirmedResults(confirmedResults);
  const rows = confirmedRows();
  let body = '';
  if (confirmedBusy) body = '<div class="status">Проверяю недавние серверные события по сделкам с активностью за семь дней…</div>';
  else if (rows.length) body = `<div class="list">${rows.map(confirmedResultRow).join('')}</div>`;
  else body = `<div class="empty">${activeConfirmedFilter === 'today' ? 'Сегодня подтверждённых результатов ещё нет.' : 'За последние семь дней подтверждённых результатов не найдено.'}</div>`;

  return `<section class="card manager-confirmed-results" aria-labelledby="managerConfirmedTitle">
    <div class="section-title">
      <div><span class="role-home-eyebrow">Факт, а не обещание</span><h2 id="managerConfirmedTitle">Подтверждённые результаты</h2><p class="muted">Результат показывается только когда audit-событие совпадает с текущим состоянием задачи, документа, риска или этапа сделки.</p></div>
      <span class="pill ${counts.today ? 'green' : 'blue'}">сегодня: ${counts.today}</span>
    </div>
    <div class="tabs manager-confirmed-tabs">${confirmedFilterButton('today', 'Сегодня', counts.today)}${confirmedFilterButton('seven-days', 'За 7 дней', counts.sevenDays)}</div>
    ${confirmedError ? `<div class="status warn" role="status">${esc(confirmedError)}</div>` : ''}
    ${body}
  </section>`;
}

function workloadRow(item) {
  return `<div class="list-item"><div class="section-title"><div><b>${esc(item.spn_name || 'СПН')}</b><span class="small">сделок: ${n(item.deals_count)}</span></div><span class="pill ${n(item.attention_count) ? 'yellow' : 'green'}">на контроле: ${n(item.attention_count)}</span></div><p class="muted">С просроченными задачами: ${n(item.overdue_count)}</p></div>`;
}

function secondaryMetrics(s) {
  return `<details class="card manager-secondary-metrics">
    <summary><b>Дополнительные показатели контроля</b><span class="muted">Назначения, документы и просрочки</span></summary>
    <div class="kpi-row manager-secondary-grid">
      ${metric('Без СПН', n(s.without_spn), n(s.without_spn) ? 'red' : 'green')}
      ${metric('Юрист ожидает', n(s.lawyer_waiting), n(s.lawyer_waiting) ? 'yellow' : 'green')}
      ${metric('Брокер ожидает', n(s.broker_waiting), n(s.broker_waiting) ? 'yellow' : 'green')}
      ${metric('Просрочен документ', n(s.with_overdue_required_document), n(s.with_overdue_required_document) ? 'red' : 'green')}
      ${metric('Просрочена задача', n(s.with_overdue_task), n(s.with_overdue_task) ? 'red' : 'green')}
    </div>
  </details>`;
}

function bindFilters() {
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => { activeFilter = button.dataset.filter || 'today'; draw(); });
  });
  document.querySelectorAll('[data-confirmed-filter]').forEach((button) => {
    button.addEventListener('click', () => { activeConfirmedFilter = button.dataset.confirmedFilter || 'today'; draw(); });
  });
}

function draw() {
  const s = summary();
  const rows = visibleItems();
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero manager-hero"><span class="role-home-eyebrow">Менеджерский контроль</span><h1>Что требует решения сегодня</h1><p>Сначала решите просроченные и блокирующие ситуации. Ниже отдельно показано, что уже завершено и подтверждено сервером.</p></section>
    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${preview?.preview_only ? '<div class="status ok" role="status"><b>Режим контроля.</b> Данные рассчитаны без изменения сделок, назначений и сроков.</div>' : ''}
    ${preview ? `<section class="kpi-row manager-primary-metrics" aria-label="Главные показатели контроля">
      ${metric('Решить сегодня', todayCount(), todayCount() ? 'red' : 'green')}
      ${metric('Нужно распределить', distributionCount(), distributionCount() ? 'yellow' : 'green')}
      ${metric('Блокирующие риски', n(s.with_blocking_risk), n(s.with_blocking_risk) ? 'red' : 'green')}
      ${metric('Сделки с просрочками', overdueCount(), overdueCount() ? 'red' : 'green')}
    </section>
    ${confirmedResultsSection()}
    <section class="card manager-readiness-summary">
      <div class="section-title"><div><h2>Правдивая готовность</h2><p class="muted">Операционная оценка учитывает ответственного, срок, стороны, риски и документы.</p></div></div>
      <div class="summary-grid">${metric('Старая к задатку', `${s.average_legacy_deposit_percent || 0}%`, 'blue')}${metric('Операционная', `${s.average_operational_readiness_percent || 0}%`, readinessTone(s.average_operational_readiness_percent))}</div>
      <div class="status warn">Старый показатель показывал 80%+ для ${n(s.legacy_deposit_green)} сделок. После операционной проверки зелёных: ${n(s.operational_green)}; скрытых расхождений: ${n(s.legacy_green_but_operational_blocked)}.</div>
    </section>
    ${secondaryMetrics(s)}
    <details class="card manager-workload">
      <summary><b>Нагрузка СПН</b><span class="muted">Сделки и просрочки по каждому ответственному</span></summary>
      <div class="list">${workload().map(workloadRow).join('') || '<div class="empty">Ответственные СПН не назначены.</div>'}</div>
    </details>
    <section class="card manager-queue" style="margin-top:18px">
      <div class="section-title"><div><h2>Очередь решений</h2><p class="muted">Сделки отсортированы по готовности, сроку и давности активности.</p></div><div class="actions"><a class="btn light" href="./task-review-v2.html">Разобрать задачи</a><span class="pill ${rows.length ? 'red' : 'green'}">${rows.length}</span></div></div>
      <div class="tabs manager-tabs">${filterButton('today', 'Решить сегодня', todayCount())}${filterButton('unassigned', 'Нужно распределить', distributionCount())}${filterButton('all', 'Все на контроле', items().length)}</div>
      <div class="list">${rows.map(itemRow).join('') || '<div class="empty">В выбранной очереди нет сделок.</div>'}</div>
    </section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Формирую очередь решений…' : 'Очередь ещё не загружена.'}</p></section>`}
  </main>`;
  bindFilters();
}

async function mapWithConcurrency(values, limit, worker) {
  const source = Array.isArray(values) ? values : [];
  const results = new Array(source.length);
  let cursor = 0;
  async function run() {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, value: await worker(source[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), source.length) }, () => run()));
  return results;
}

async function loadConfirmedResults() {
  if (!preview || confirmedBusy) return;
  confirmedBusy = true;
  confirmedError = '';
  draw();
  const now = new Date();
  const candidates = items()
    .filter((item) => managerResultCandidate(item, { now, maxAgeDays: 7 }))
    .slice(0, COMPLETION_LOAD_LIMIT);

  if (!candidates.length) {
    confirmedResults = [];
    confirmedBusy = false;
    draw();
    return;
  }

  const loaded = await mapWithConcurrency(candidates, COMPLETION_CONCURRENCY, async (item) => {
    const cardData = await rpc('nav_v2_get_deal_card', { p_deal_id: item.deal_id }, 20000);
    return buildManagerConfirmedResult(item, cardData, preview.profile, {
      now,
      maxAgeDays: 7,
      timeZone: 'Europe/Moscow'
    });
  });

  const failures = loaded.filter((entry) => !entry?.ok).length;
  confirmedResults = sortManagerConfirmedResults(loaded.filter((entry) => entry?.ok).map((entry) => entry.value));
  if (failures) confirmedError = `Не удалось проверить карточки: ${failures}. Остальные подтверждённые результаты показаны.`;
  confirmedBusy = false;
  draw();
}

async function loadPreview() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  let shouldLoadConfirmed = false;
  try {
    preview = await rpc('nav_v2_get_operational_readiness_preview', { p_limit: 100 }, 20000);
    if (!allowed()) throw new Error('Кабинет доступен владельцу, администратору и менеджеру.');
    shouldLoadConfirmed = true;
  } catch (error) {
    preview = null;
    errorText = error.message || String(error);
  } finally {
    busy = false;
    draw();
  }
  if (shouldLoadConfirmed) await loadConfirmedResults();
}

async function init() {
  setupTop('manager');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  await loadPreview();
}

init();
