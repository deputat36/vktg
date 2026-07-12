import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';

const app = document.getElementById('app');
let preview = null;
let busy = false;
let errorText = '';
let activeFilter = 'today';

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
  return !item.manager_id
    || item.lawyer_assignment_state === 'waiting_assignment'
    || item.broker_assignment_state === 'waiting_assignment';
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
    <div class="actions manager-card-actions" style="justify-content:flex-start">
      <a class="btn primary" href="${esc(item.card_url || `./deal-card-v2.html?id=${encodeURIComponent(item.deal_id)}`)}">Открыть и решить</a>
    </div>
    <details class="manager-card-details">
      <summary>Показать расчёт готовности</summary>
      <p><b>Почему нельзя двигаться к задатку:</b> ${esc(item.cannot_advance_deposit_reason || item.cannot_advance_reason || 'Причина не определена')}</p>
      <p class="muted">Старый показатель: ${n(item.legacy_readiness_deposit_percent)}%. Операционный показатель: ${n(item.operational_readiness_percent)}%.</p>
    </details>
  </article>`;
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

function draw() {
  const s = summary();
  const rows = visibleItems();
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero manager-hero"><span class="role-home-eyebrow">Менеджерский контроль</span><h1>Что требует решения сегодня</h1><p>Сначала решите просроченные и блокирующие ситуации. В каждой карточке показано одно главное действие, ответственный и срок.</p></section>
    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${preview?.preview_only ? '<div class="status ok" role="status"><b>Режим контроля.</b> Данные рассчитаны без изменения сделок, назначений и сроков.</div>' : ''}
    ${preview ? `<section class="kpi-row manager-primary-metrics" aria-label="Главные показатели контроля">
      ${metric('Решить сегодня', todayCount(), todayCount() ? 'red' : 'green')}
      ${metric('Нужно распределить', distributionCount(), distributionCount() ? 'yellow' : 'green')}
      ${metric('Блокирующие риски', n(s.with_blocking_risk), n(s.with_blocking_risk) ? 'red' : 'green')}
      ${metric('Сделки с просрочками', overdueCount(), overdueCount() ? 'red' : 'green')}
    </section>
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
      <div class="section-title"><div><h2>Очередь решений</h2><p class="muted">Сделки уже отсортированы по готовности, сроку и давности активности.</p></div><div class="actions"><a class="btn light" href="./task-review-v2.html">Разобрать задачи</a><span class="pill ${rows.length ? 'red' : 'green'}">${rows.length}</span></div></div>
      <div class="tabs manager-tabs">${filterButton('today', 'Решить сегодня', todayCount())}${filterButton('unassigned', 'Нужно распределить', distributionCount())}${filterButton('all', 'Все на контроле', items().length)}</div>
      <div class="list">${rows.map(itemRow).join('') || '<div class="empty">В выбранной очереди нет сделок.</div>'}</div>
    </section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Формирую очередь решений…' : 'Очередь ещё не загружена.'}</p></section>`}
  </main>`;
  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => { activeFilter = button.dataset.filter || 'today'; draw(); });
  });
}

async function loadPreview() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    preview = await rpc('nav_v2_get_operational_readiness_preview', { p_limit: 100 }, 20000);
    if (!allowed()) throw new Error('Кабинет доступен владельцу, администратору и менеджеру.');
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
