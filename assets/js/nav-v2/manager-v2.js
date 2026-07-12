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
  if (!value) return 'срок не назначен';
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
  return item.next_action_owner_name || roleLabel(item.next_action_owner_role) || 'не назначен';
}
function queueReasons(item) {
  const reasons = [];
  (item.missing_critical_data || []).forEach((reason) => reasons.push(reason));
  (item.operational_blockers || []).forEach((reason) => reasons.push(reason));
  return [...new Set(reasons)];
}
function visibleItems() {
  return items().filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'unassigned') {
      return !item.manager_id || item.lawyer_assignment_state === 'waiting_assignment' || item.broker_assignment_state === 'waiting_assignment';
    }
    return item.needs_manager_attention && (dueIsTodayOrOverdue(item.next_action_due_date) || n(item.stale_days) >= 7 || n(item.blocking_risks_count) > 0);
  });
}
function filterButton(id, label) {
  return `<button class="tab ${activeFilter === id ? 'active' : ''}" type="button" data-filter="${id}">${label}</button>`;
}
function readinessTone(value) {
  if (n(value) >= 80) return 'green';
  if (n(value) >= 60) return 'yellow';
  return 'red';
}
function assignmentText(item) {
  const parts = [];
  if (!item.manager_id) parts.push('менеджер не назначен');
  if (item.lawyer_assignment_state === 'waiting_assignment') parts.push('юрист ожидает распределения');
  if (item.broker_assignment_state === 'waiting_assignment') parts.push('брокер ожидает распределения');
  return parts.join(' · ');
}
function itemRow(item) {
  const reasons = queueReasons(item);
  const dueTone = dueIsTodayOrOverdue(item.next_action_due_date) ? 'red' : 'blue';
  return `<article class="list-item">
    <div class="section-title">
      <div>
        <b>${esc(item.title || 'Сделка')}</b>
        <span class="small">${esc(statusText(item.status))} · без активности ${n(item.stale_days)} дн.</span>
      </div>
      <span class="pill ${readinessTone(item.operational_readiness_percent)}">готовность ${n(item.operational_readiness_percent)}%</span>
    </div>
    <div class="status ${reasons.length ? 'warn' : 'ok'}"><b>Почему в очереди</b><br>${reasons.length ? reasons.map(esc).join(' · ') : 'Критичных препятствий не найдено'}</div>
    ${assignmentText(item) ? `<p class="muted"><b>Распределение:</b> ${esc(assignmentText(item))}</p>` : ''}
    <div class="grid">
      <div class="list-item"><b>Главное действие</b><p>${esc(item.main_action || 'Назначить следующий шаг')}</p></div>
      <div class="list-item"><b>Ответственный и срок</b><p>${esc(ownerText(item))}</p><span class="pill ${dueTone}">${esc(fmtDate(item.next_action_due_date))}</span></div>
    </div>
    <p class="muted"><b>Почему нельзя двигаться к задатку:</b> ${esc(item.cannot_advance_deposit_reason || item.cannot_advance_reason || 'причина не определена')}</p>
    <div class="actions" style="justify-content:flex-start">
      <a class="btn primary" href="${esc(item.card_url || `./deal-card-v2.html?id=${encodeURIComponent(item.deal_id)}`)}">Открыть карточку</a>
    </div>
  </article>`;
}
function workloadRow(item) {
  return `<div class="list-item"><div class="section-title"><div><b>${esc(item.spn_name || 'СПН')}</b><span class="small">сделок: ${n(item.deals_count)}</span></div><span class="pill ${n(item.attention_count) ? 'yellow' : 'green'}">на контроле: ${n(item.attention_count)}</span></div><p class="muted">С просроченными задачами: ${n(item.overdue_count)}</p></div>`;
}
function draw() {
  const s = summary();
  const rows = visibleItems();
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Что требует решения сегодня</h1><p>Ежедневная очередь руководителя: причина, ответственный, срок и одно главное действие по каждой зависшей сделке.</p></section>
    ${errorText ? `<div class="status error">${esc(errorText)}</div>` : ''}
    ${preview?.preview_only ? '<div class="status ok"><b>Безопасный предварительный просмотр.</b> Готовность рассчитана на сервере; сделки, назначения и сроки не изменяются.</div>' : ''}
    ${preview ? `<section class="kpi-row">
      ${metric('Требуют внимания', n(s.needs_manager_attention), n(s.needs_manager_attention) ? 'red' : 'green')}
      ${metric('Без менеджера', n(s.without_manager), n(s.without_manager) ? 'red' : 'green')}
      ${metric('Без СПН', n(s.without_spn), n(s.without_spn) ? 'red' : 'green')}
      ${metric('Юрист ожидает', n(s.lawyer_waiting), n(s.lawyer_waiting) ? 'yellow' : 'green')}
      ${metric('Брокер ожидает', n(s.broker_waiting), n(s.broker_waiting) ? 'yellow' : 'green')}
      ${metric('Блокирующий риск', n(s.with_blocking_risk), n(s.with_blocking_risk) ? 'red' : 'green')}
      ${metric('Просрочен документ', n(s.with_overdue_required_document), n(s.with_overdue_required_document) ? 'red' : 'green')}
      ${metric('Просрочена задача', n(s.with_overdue_task), n(s.with_overdue_task) ? 'red' : 'green')}
    </section>
    <section class="grid">
      <div class="card"><h2>Правдивая готовность</h2><div class="summary-grid">${metric('Старая к задатку', `${s.average_legacy_deposit_percent || 0}%`, 'blue')}${metric('Операционная', `${s.average_operational_readiness_percent || 0}%`, readinessTone(s.average_operational_readiness_percent))}</div><div class="status warn">Старый показатель давал 80%+ для ${n(s.legacy_deposit_green)} сделок. После проверки владельца, срока, сторон, рисков и документов зелёных: ${n(s.operational_green)}; скрытых расхождений: ${n(s.legacy_green_but_operational_blocked)}.</div></div>
      <div class="card"><div class="section-title"><div><h2>Нагрузка СПН</h2><p class="muted">Сколько сделок и просрочек сейчас у каждого ответственного.</p></div></div><div class="list">${workload().map(workloadRow).join('') || '<div class="empty">Ответственные СПН не назначены.</div>'}</div></div>
    </section>
    <section class="card" style="margin-top:18px"><div class="section-title"><div><h2>Очередь решений</h2><p class="muted">Сортировка выполняется по готовности, сроку и давности активности.</p></div><span class="pill ${rows.length ? 'red' : 'green'}">${rows.length}</span></div><div class="tabs">${filterButton('today', 'Решить сегодня')}${filterButton('unassigned', 'Нужно распределить')}${filterButton('all', 'Все на контроле')}</div><div class="list">${rows.map(itemRow).join('') || '<div class="empty">В выбранной очереди нет сделок.</div>'}</div></section>` : `<section class="card"><p>${busy ? 'Формирую очередь…' : 'Очередь ещё не загружена.'}</p></section>`}
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
    if (!allowed()) throw new Error('Кабинет доступен owner, admin и manager.');
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
