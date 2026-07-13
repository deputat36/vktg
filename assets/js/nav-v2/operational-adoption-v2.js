import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';

const app = document.getElementById('app');
let report = null;
let comparison = null;
let busy = false;
let errorText = '';
let activeFilter = 'attention';
let periodDays = 30;

const additiveFields = [
  'meaningful_events',
  'created_tasks',
  'client_actions_created',
  'quality_warnings_created',
  'completed_tasks',
  'created_risks',
  'resolved_risks',
  'created_documents',
  'resolved_documents',
  'confirmed_results',
  'activity_signals'
];

function n(value) { return Number(value || 0); }
function summary() { return report?.summary || {}; }
function items() { return Array.isArray(report?.items) ? report.items : []; }
function allowed(value = report) { return ['owner', 'admin', 'manager'].includes(value?.profile?.role); }

function fmtDateTime(value) {
  if (!value) return 'Не зафиксировано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
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

function itemMap(value) {
  return new Map((Array.isArray(value?.items) ? value.items : []).map((item) => [String(item.deal_id || ''), item]));
}

function subtractMetric(longItem, currentItem, field) {
  return Math.max(0, n(longItem?.[field]) - n(currentItem?.[field]));
}

function derivePeriodComparison(currentReport, doubledReport) {
  const currentItems = itemMap(currentReport);
  const previous = {
    deals_in_scope: 0,
    with_confirmed_results: 0,
    activity_without_result: 0,
    no_activity: 0,
    meaningful_events: 0,
    created_tasks: 0,
    client_actions_created: 0,
    quality_warnings_created: 0,
    completed_tasks: 0,
    created_risks: 0,
    resolved_risks: 0,
    created_documents: 0,
    resolved_documents: 0,
    confirmed_results: 0,
    activity_signals: 0
  };

  for (const longItem of Array.isArray(doubledReport?.items) ? doubledReport.items : []) {
    const currentItem = currentItems.get(String(longItem.deal_id || '')) || {};
    const periodItem = {};
    for (const field of additiveFields) {
      periodItem[field] = subtractMetric(longItem, currentItem, field);
      previous[field] += periodItem[field];
    }
    previous.deals_in_scope += 1;
    if (periodItem.confirmed_results > 0) previous.with_confirmed_results += 1;
    else if (periodItem.activity_signals > 0) previous.activity_without_result += 1;
    else previous.no_activity += 1;
  }

  const currentSummary = currentReport?.summary || {};
  const current = {
    deals_in_scope: n(currentSummary.deals_in_scope),
    with_confirmed_results: n(currentSummary.with_confirmed_results),
    activity_without_result: n(currentSummary.active_without_result),
    no_activity: n(currentSummary.no_recent_activity),
    meaningful_events: n(currentSummary.meaningful_events),
    created_tasks: n(currentSummary.created_tasks),
    client_actions_created: n(currentSummary.client_actions_created),
    quality_warnings_created: n(currentSummary.quality_warnings_created),
    completed_tasks: n(currentSummary.completed_tasks),
    created_risks: n(currentSummary.created_risks),
    resolved_risks: n(currentSummary.resolved_risks),
    created_documents: n(currentSummary.created_documents),
    resolved_documents: n(currentSummary.resolved_documents),
    confirmed_results: n(currentSummary.confirmed_results),
    activity_signals: n(currentSummary.activity_signals)
  };

  return {
    period_days: periodDays,
    current,
    previous,
    generated_at: currentReport?.generated_at || null
  };
}

function trendDelta(currentValue, previousValue) {
  return n(currentValue) - n(previousValue);
}

function trendTone(delta, preferredDirection = 'neutral') {
  if (!delta || preferredDirection === 'neutral') return delta ? 'blue' : 'gray';
  const improved = preferredDirection === 'higher' ? delta > 0 : delta < 0;
  return improved ? 'green' : 'red';
}

function deltaLabel(delta) {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function comparisonMetric(label, key, preferredDirection = 'neutral') {
  const currentValue = n(comparison?.current?.[key]);
  const previousValue = n(comparison?.previous?.[key]);
  const delta = trendDelta(currentValue, previousValue);
  return `<div class="metric ${trendTone(delta, preferredDirection)}">
    <span>${esc(label)}</span>
    <b>${currentValue}</b>
    <span class="muted">предыдущий период: ${previousValue} · изменение: ${esc(deltaLabel(delta))}</span>
  </div>`;
}

function comparisonSection() {
  if (!comparison) return '';
  return `<section class="card adoption-comparison">
    <div class="section-title">
      <div>
        <h2>Текущий период против предыдущего</h2>
        <p class="muted">Сравниваются последние ${periodDays} дней и непосредственно предшествующие им ${periodDays} дней.</p>
      </div>
      <span class="pill blue">${periodDays} + ${periodDays} дней</span>
    </div>
    <div class="kpi-row task-review-metrics" aria-label="Сравнение периодов">
      ${comparisonMetric('Сделки с подтверждённым результатом', 'with_confirmed_results', 'higher')}
      ${comparisonMetric('Подтверждённые результаты', 'confirmed_results', 'higher')}
      ${comparisonMetric('Выполненные задачи', 'completed_tasks', 'higher')}
      ${comparisonMetric('Закрытые риски', 'resolved_risks', 'higher')}
      ${comparisonMetric('Подтверждённые документы', 'resolved_documents', 'higher')}
      ${comparisonMetric('Сделки без активности', 'no_activity', 'lower')}
      ${comparisonMetric('Активность без результата', 'activity_without_result', 'neutral')}
      ${comparisonMetric('Клиентские действия', 'client_actions_created', 'neutral')}
      ${comparisonMetric('Проверки качества', 'quality_warnings_created', 'neutral')}
    </div>
    <div class="status warn">
      <b>Граница сравнения.</b> Исторические снимки открытых задач, рисков и просроченных документов ранее не сохранялись. Поэтому backlog ниже остаётся текущим состоянием, а сравнение показывает только созданные действия и подтверждённые результаты за два равных периода.
    </div>
    <div class="status ok">
      <b>Без единого рейтинга.</b> Рост клиентских действий или quality warnings сам по себе не считается улучшением. Руководитель видит отдельные изменения и проверяет их вместе с подтверждённым результатом.
    </div>
  </section>`;
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

    ${comparisonSection()}

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
    const [currentReport, doubledReport] = await Promise.all([
      rpc('nav_v2_get_operational_adoption_report', { p_days: periodDays, p_limit: 500 }, 30000),
      rpc('nav_v2_get_operational_adoption_report', { p_days: periodDays * 2, p_limit: 500 }, 30000)
    ]);
    if (!allowed(currentReport) || !allowed(doubledReport)) {
      throw new Error('Отчёт внедрения доступен владельцу, администратору и менеджеру.');
    }
    report = currentReport;
    comparison = derivePeriodComparison(currentReport, doubledReport);
  } catch (error) {
    report = null;
    comparison = null;
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
