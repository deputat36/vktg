import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';

const app = document.getElementById('app');
let report = null;
let busy = false;
let errorText = '';
let activeFilter = 'attention';
let periodDays = 30;

function n(value) { return Number(value || 0); }
function summary() { return report?.summary || {}; }
function items() { return Array.isArray(report?.items) ? report.items : []; }
function comparison() { return report?.comparison || {}; }
function currentPeriod() { return comparison().current_period || {}; }
function previousPeriod() { return comparison().previous_period || {}; }
function periodDelta() { return comparison().delta || {}; }
function allowed() { return ['owner', 'admin', 'manager'].includes(report?.profile?.role); }

function fmtDateTime(value) {
  if (!value) return 'Не зафиксировано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDate(value) {
  if (!value) return 'Дата не определена';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ru-RU');
}

function signed(value, suffix = '') {
  const number = Number(value || 0);
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${number}${suffix}`;
}

function movementTone(state) {
  return ({ confirmed_result: 'green', activity_without_result: 'yellow', no_recent_activity: 'red' })[state] || 'gray';
}

function filterItems() {
  return items().filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'attention') return Boolean(item.needs_attention);
    if (activeFilter === 'confirmed') return item.movement_state === 'confirmed_result';
    if (activeFilter === 'no_result') return item.movement_state === 'activity_without_result';
    if (activeFilter === 'no_activity') return item.movement_state === 'no_recent_activity';
    return true;
  });
}

function countFilter(filter) {
  const previous = activeFilter;
  activeFilter = filter;
  const count = filterItems().length;
  activeFilter = previous;
  return count;
}

function filterButton(id, label) {
  return `<button class="tab ${activeFilter === id ? 'active' : ''}" type="button" data-filter="${id}" aria-pressed="${activeFilter === id ? 'true' : 'false'}">${esc(label)} · ${countFilter(id)}</button>`;
}

function periodButton(days) {
  return `<button class="tab ${periodDays === days ? 'active' : ''}" type="button" data-period="${days}" aria-pressed="${periodDays === days ? 'true' : 'false'}">${days} дней</button>`;
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function responsibilityText(item) {
  const spn = [item.seller_spn_name, item.buyer_spn_name].filter(Boolean).join(' / ');
  return {
    manager: item.manager_name || 'Менеджер не назначен',
    spn: spn || 'СПН не назначен'
  };
}

function resultLine(label, created, completed, resultLabel) {
  return `<div><span class="small">${esc(label)}</span><b>${n(created)} создано</b><span class="muted">${n(completed)} ${esc(resultLabel)}</span></div>`;
}

function comparisonLine(label, field, options = {}) {
  const current = currentPeriod();
  const previous = previousPeriod();
  const delta = periodDelta();
  const suffix = options.suffix || '';
  const deltaSuffix = options.deltaSuffix ?? suffix;
  return `<div>
    <span class="small">${esc(label)}</span>
    <b>${esc(`${n(current[field])}${suffix}`)}</b>
    <span class="muted">Предыдущий период: ${esc(`${n(previous[field])}${suffix}`)}</span>
    <span class="pill gray">Изменение: ${esc(signed(delta[field], deltaSuffix))}</span>
  </div>`;
}

function comparisonBlock() {
  const data = comparison();
  if (!data.comparison_version) return '';
  const current = currentPeriod();
  const previous = previousPeriod();
  return `<section class="card adoption-comparison">
    <div class="section-title">
      <div>
        <h2>Текущий период и предыдущий равный период</h2>
        <p class="muted">Текущий: ${esc(fmtDate(current.period_start))} — ${esc(fmtDate(current.period_end))}. Предыдущий: ${esc(fmtDate(previous.period_start))} — ${esc(fmtDate(previous.period_end))}.</p>
      </div>
      <span class="pill blue">${n(data.period_days)} дней + ${n(data.period_days)} дней</span>
    </div>
    <div class="status warn"><b>Выборки различаются.</b> Сейчас в расчёте ${n(current.deals_in_scope)} сделок, в предыдущем периоде — ${n(previous.deals_in_scope)}. Дельта показывает изменение факта, а не автоматически «хороший» или «плохой» результат.</div>
    <div class="task-review-facts adoption-comparison-grid">
      ${comparisonLine('Доля сделок с подтверждённым результатом', 'confirmed_result_rate', { suffix: '%', deltaSuffix: ' п.п.' })}
      ${comparisonLine('Сделки с подтверждённым результатом', 'with_confirmed_results')}
      ${comparisonLine('Активность без результата', 'active_without_result')}
      ${comparisonLine('Подтверждённые результаты', 'confirmed_results')}
      ${comparisonLine('Выполненные задачи', 'completed_tasks')}
      ${comparisonLine('Закрытые риски', 'resolved_risks')}
      ${comparisonLine('Подтверждённые документы', 'resolved_documents')}
      ${comparisonLine('Клиентские действия созданы', 'client_actions_created')}
      ${comparisonLine('Проверки качества созданы', 'quality_warnings_created')}
    </div>
    <div class="status ok"><b>Граница сравнения.</b> ${esc(data.comparison_note || 'Сравниваются только события внутри равных периодов.')}</div>
    <div class="status warn"><b>Не рейтинг сотрудников.</b> Этот блок не оценивает отдельных специалистов и не включает реконструированный исторический backlog.</div>
  </section>`;
}

function dealRow(item) {
  const responsibility = responsibilityText(item);
  const staleTone = n(item.stale_days) >= 7 ? 'red' : n(item.stale_days) >= 3 ? 'yellow' : 'green';
  return `<article class="list-item task-review-card adoption-card">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${movementTone(item.movement_state)}">${esc(item.movement_state_label || 'Состояние не определено')}</span>
          ${item.needs_attention ? '<span class="pill red">Требует контроля</span>' : '<span class="pill green">Контроль не требуется</span>'}
        </div>
        <h3>${esc(item.deal_title || item.address || 'Сделка')}</h3>
        <p class="muted">${esc(item.address || 'Адрес не указан')} · ${esc(statusText(item.deal_status))}</p>
      </div>
      <span class="pill ${staleTone}">${n(item.stale_days)} дн. с последней активности</span>
    </div>

    ${item.attention_reason ? `<div class="status warn"><b>Почему требует внимания:</b> ${esc(item.attention_reason)}</div>` : ''}

    <div class="task-review-facts adoption-responsibility">
      <div><span class="small">Менеджер</span><b>${esc(responsibility.manager)}</b></div>
      <div><span class="small">СПН</span><b>${esc(responsibility.spn)}</b></div>
      <div><span class="small">Последняя активность</span><b>${esc(fmtDateTime(item.last_meaningful_activity_at))}</b><span class="muted">${esc(item.latest_event_title || item.latest_event_type || 'Событие не указано')}</span></div>
    </div>

    <div class="task-review-facts adoption-results">
      ${resultLine('Задачи', item.created_tasks, item.completed_tasks, 'выполнено')}
      ${resultLine('Риски', item.created_risks, item.resolved_risks, 'закрыто')}
      ${resultLine('Документы', item.created_documents, item.resolved_documents, 'подтверждено')}
      <div><span class="small">Сигналы задач</span><b>${n(item.client_actions_created)} клиентских действий</b><span class="muted">${n(item.quality_warnings_created)} проверок качества</span></div>
    </div>

    <div class="task-review-facts adoption-backlog">
      <div><span class="small">Открытые задачи</span><b>${n(item.open_tasks)}</b><span class="muted">Просрочено: ${n(item.overdue_tasks)}</span></div>
      <div><span class="small">Открытые риски</span><b>${n(item.open_risks)}</b></div>
      <div><span class="small">Просроченные документы</span><b>${n(item.overdue_required_documents)}</b></div>
    </div>

    <div class="status ${item.next_action ? 'ok' : 'warn'}"><b>Следующий шаг:</b> ${esc(item.next_action || 'Не указан')}</div>
    <div class="actions task-review-actions" style="justify-content:flex-start">
      <a class="btn primary" href="${esc(item.card_url || `./deal-card-v2.html?id=${encodeURIComponent(item.deal_id)}`)}">Открыть карточку</a>
    </div>
  </article>`;
}

function draw() {
  const s = summary();
  const rows = filterItems();
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero">
      <span class="role-home-eyebrow">Внедрение и результат</span>
      <h1>Движение сделок, а не только накопленные проблемы</h1>
      <p>Отчёт отделяет созданную активность от подтверждённого результата. Никакие сделки, задачи, риски и документы здесь не изменяются.</p>
    </section>

    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${report?.preview_only ? `<div class="status ok" role="status"><b>Только просмотр.</b> Период: ${n(report.period_days)} дней. Отчёт построен ${esc(fmtDateTime(report.generated_at))}.</div>` : ''}

    <section class="card">
      <div class="section-title"><div><h2>Период анализа</h2><p class="muted">Сравнивайте короткий и длинный цикл работы команды.</p></div></div>
      <div class="tabs task-review-tabs">${periodButton(7)}${periodButton(14)}${periodButton(30)}</div>
    </section>

    ${report ? `<section class="kpi-row task-review-metrics" aria-label="Сводка внедрения">
      ${metric('Сделок в работе', n(s.deals_in_scope), 'blue')}
      ${metric('Есть подтверждённый результат', n(s.with_confirmed_results), n(s.with_confirmed_results) ? 'green' : 'red')}
      ${metric('Активность без результата', n(s.active_without_result), n(s.active_without_result) ? 'yellow' : 'green')}
      ${metric('Без активности', n(s.no_recent_activity), n(s.no_recent_activity) ? 'red' : 'green')}
      ${metric('Выполнено задач', n(s.completed_tasks), n(s.completed_tasks) ? 'green' : 'red')}
      ${metric('Закрыто рисков', n(s.resolved_risks), n(s.resolved_risks) ? 'green' : 'red')}
      ${metric('Подтверждено документов', n(s.resolved_documents), n(s.resolved_documents) ? 'green' : 'yellow')}
      ${metric('Без менеджера', n(s.missing_manager), n(s.missing_manager) ? 'red' : 'green')}
    </section>

    ${comparisonBlock()}

    <section class="card task-review-explanation">
      <h2>Как читать отчёт</h2>
      <div class="task-review-legend">
        <div><span class="pill green">Подтверждённый результат</span><p>В периоде выполнена задача, закрыт риск или подтверждён документ.</p></div>
        <div><span class="pill yellow">Активность без результата</span><p>Создаются действия и события, но завершение не зафиксировано.</p></div>
        <div><span class="pill red">Нет активности</span><p>По сделке нет значимых действий за выбранный период.</p></div>
        <div><span class="pill gray">Проверка качества</span><p>Системный сигнал не считается клиентским результатом.</p></div>
      </div>
      <div class="status warn"><b>Важно.</b> Отчёт не оценивает работу сотрудника по одному числу. Он показывает, где система не получает подтверждения результата и следующего шага.</div>
    </section>

    <section class="card task-review-list">
      <div class="section-title"><div><h2>Сделки команды</h2><p class="muted">Сначала сделки без результата, владельца или актуального следующего шага.</p></div><span class="pill ${rows.length ? 'blue' : 'green'}">${rows.length}</span></div>
      <div class="tabs task-review-tabs">${filterButton('attention', 'Требуют контроля')}${filterButton('no_result', 'Активность без результата')}${filterButton('no_activity', 'Без активности')}${filterButton('confirmed', 'Есть результат')}${filterButton('all', 'Все')}</div>
      <div class="list">${rows.map(dealRow).join('') || '<div class="empty">В выбранной группе нет сделок.</div>'}</div>
    </section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Собираю операционный отчёт…' : 'Отчёт ещё не загружен.'}</p></section>`}
  </main>`;

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter || 'attention';
      draw();
    });
  });
  document.querySelectorAll('[data-period]').forEach((button) => {
    button.addEventListener('click', async () => {
      const next = Number(button.dataset.period || 30);
      if (![7, 14, 30].includes(next) || next === periodDays || busy) return;
      periodDays = next;
      await loadReport();
    });
  });
}

async function loadReport() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    report = await rpc('nav_v2_get_operational_adoption_report', { p_days: periodDays, p_limit: 500 }, 30000);
    if (!allowed()) throw new Error('Отчёт внедрения доступен владельцу, администратору и менеджеру.');
  } catch (error) {
    report = null;
    errorText = error.message || String(error);
  } finally {
    busy = false;
    draw();
  }
}

async function init() {
  setupTop('manager');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  await loadReport();
}

init();
