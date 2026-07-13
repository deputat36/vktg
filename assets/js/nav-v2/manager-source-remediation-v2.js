import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';

const app = document.getElementById('app');
let report = null;
let busy = false;
let errorText = '';

function n(value) { return Number(value || 0); }
function remediationPlan() { return report?.manager_source_remediation_plan || {}; }
function remediationSummary() { return remediationPlan().summary || {}; }
function remediationItems() { return Array.isArray(remediationPlan().items) ? remediationPlan().items : []; }
function responsibilityEvidence() { return report?.responsibility_evidence || {}; }
function evidenceSummary() { return responsibilityEvidence().summary || {}; }
function evidenceItems() { return Array.isArray(responsibilityEvidence().items) ? responsibilityEvidence().items : []; }
function allowed() { return ['owner', 'admin', 'manager'].includes(report?.profile?.role); }

function fmtDateTime(value) {
  if (!value) return 'Не зафиксировано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function priorityTone(priority) {
  return ({ urgent: 'red', high: 'yellow', normal: 'blue' })[priority] || 'gray';
}

function evidenceTone(state) {
  return ({
    strong_single_evidence: 'blue',
    multiple_candidates: 'red',
    weak_single_evidence: 'yellow',
    no_active_spn_evidence: 'gray'
  })[state] || 'gray';
}

function signalLabel(code) {
  return ({
    deal_creator: 'Создал сделку',
    participant: 'Участник сделки',
    event_actor: 'Автор событий',
    task_creator: 'Создавал задачи',
    task_assignee: 'Исполнитель задач',
    task_completer: 'Завершал задачи',
    document_assignee: 'Ответственный за документы',
    document_checker: 'Проверял документы'
  })[code] || code;
}

function previewDeals(item) {
  const deals = Array.isArray(item.preview_deals) ? item.preview_deals : [];
  if (!deals.length) return '<div class="empty">Примеры сделок не переданы.</div>';
  return `<div class="list">${deals.map((deal) => `<article class="list-item">
    <div class="section-title">
      <div>
        <h4>${esc(deal.deal_title || deal.address || 'Сделка')}</h4>
        <p class="muted">Поле: <code>${esc(deal.side_field || item.target_field || 'не определено')}</code></p>
      </div>
      <a class="btn" href="${esc(deal.card_url || `./deal-card-v2.html?id=${encodeURIComponent(deal.deal_id || '')}`)}">Открыть</a>
    </div>
  </article>`).join('')}</div>`;
}

function remediationCard(item) {
  return `<article class="list-item task-review-card">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${priorityTone(item.priority)}">${esc(item.priority_label || item.priority || 'Приоритет')}</span>
          <span class="pill gray">Ручное исправление</span>
        </div>
        <h3>${esc(item.action_title || item.remediation_label || 'Исправить источник')}</h3>
        <p class="muted">${esc(item.remediation_label || 'Источник требует проверки')}</p>
      </div>
      <span class="pill ${item.mutation_available ? 'red' : 'green'}">${item.mutation_available ? 'Изменение доступно' : 'Автоисправление отключено'}</span>
    </div>
    <div class="task-review-facts">
      <div><span class="small">Целевое поле</span><b><code>${esc(item.target_field || 'не определено')}</code></b></div>
      <div><span class="small">Текущий профиль</span><b>${esc(item.current_profile_name || 'Не указан')}</b><span class="muted">Роль: ${esc(item.current_profile_role || 'нет профиля')}</span></div>
      <div><span class="small">Затронуто сделок</span><b>${n(item.affected_deals)}</b><span class="muted">Сторон сделки: ${n(item.affected_deal_sides)}</span></div>
    </div>
    <div class="status warn"><b>Безопасное действие:</b> ${esc(item.safe_action || 'Требуется ручная проверка')}</div>
    <details class="task-review-contract"><summary>Затронутые сделки</summary>${previewDeals(item)}${n(item.more_deals_count) ? `<p class="muted">Ещё сделок вне preview: ${n(item.more_deals_count)}</p>` : ''}</details>
  </article>`;
}

function signalBreakdown(candidate) {
  const breakdown = candidate?.signal_breakdown && typeof candidate.signal_breakdown === 'object'
    ? candidate.signal_breakdown
    : {};
  const rows = Object.entries(breakdown);
  if (!rows.length) return '<span class="muted">Сигналы не расшифрованы</span>';
  return `<ul>${rows.map(([code, details]) => `<li><b>${esc(signalLabel(code))}</b>: ${n(details?.count)} · последнее ${esc(fmtDateTime(details?.last_at))}</li>`).join('')}</ul>`;
}

function candidateCard(candidate) {
  return `<article class="list-item">
    <div class="section-title">
      <div>
        <h4>${esc(candidate.candidate_name || 'СПН без имени')}</h4>
        <p class="muted">Независимых типов сигналов: ${n(candidate.independent_signal_types)} · всего действий: ${n(candidate.total_signal_count)}</p>
      </div>
      <span class="pill ${candidate.manager_link_status === 'present' ? 'green' : 'yellow'}">${candidate.manager_link_status === 'present' ? 'Менеджер указан' : 'manager_id отсутствует'}</span>
    </div>
    <div class="task-review-facts">
      <div><span class="small">Менеджер профиля</span><b>${esc(candidate.manager_name || 'Не назначен')}</b></div>
      <div><span class="small">Последний сигнал</span><b>${esc(fmtDateTime(candidate.last_signal_at))}</b></div>
    </div>
    <details class="task-review-contract"><summary>Подтверждающие сигналы</summary>${signalBreakdown(candidate)}</details>
    <div class="status warn"><b>Не назначение.</b> История действий не определяет сторону сделки и требует подтверждения владельца.</div>
  </article>`;
}

function evidenceCard(item) {
  const candidates = Array.isArray(item.candidates) ? item.candidates : [];
  return `<article class="list-item task-review-card">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${evidenceTone(item.evidence_state)}">${esc(item.evidence_state_label || item.evidence_state || 'Состояние не определено')}</span>
          <span class="pill gray">Только доказательства</span>
        </div>
        <h3>${esc(item.deal_title || item.address || 'Сделка')}</h3>
        <p class="muted">${esc(item.address || 'Адрес не указан')} · ${esc(statusText(item.deal_status))}</p>
      </div>
      <span class="pill ${item.selection_available || item.mutation_available ? 'red' : 'green'}">Выбор и запись отключены</span>
    </div>
    <div class="task-review-facts">
      <div><span class="small">Текущее поле СПН продавца</span><b>${esc(item.seller_spn_name || 'Не назначен')}</b><span class="muted">Роль: ${esc(item.seller_profile_role || 'нет профиля')}</span></div>
      <div><span class="small">Текущее поле СПН покупателя</span><b>${esc(item.buyer_spn_name || 'Не назначен')}</b><span class="muted">Роль: ${esc(item.buyer_profile_role || 'нет профиля')}</span></div>
      <div><span class="small">Активных СПН с сигналами</span><b>${n(item.candidate_count)}</b><span class="muted">Максимум независимых типов: ${n(item.strongest_signal_types)}</span></div>
    </div>
    <div class="status warn"><b>Следующее безопасное действие:</b> ${esc(item.safe_action || 'Требуется ручная проверка')}</div>
    <details class="task-review-contract" ${candidates.length ? 'open' : ''}><summary>Evidence-only candidates</summary>${candidates.map(candidateCard).join('') || '<div class="empty">Активный СПН по истории действий не найден.</div>'}</details>
    <div class="actions task-review-actions" style="justify-content:flex-start">
      <a class="btn primary" href="${esc(item.card_url || `./deal-card-v2.html?id=${encodeURIComponent(item.deal_id || '')}`)}">Открыть карточку</a>
    </div>
  </article>`;
}

function draw() {
  const plan = remediationPlan();
  const planSummary = remediationSummary();
  const evidence = responsibilityEvidence();
  const eSummary = evidenceSummary();
  const planRows = remediationItems();
  const evidenceRows = evidenceItems();

  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero">
      <span class="role-home-eyebrow">Ответственность и качество источников</span>
      <h1>Что исправить до назначения менеджера</h1>
      <p>Экран группирует ошибки полей СПН и показывает подтверждающие действия активных специалистов. Он не выбирает кандидата, не определяет сторону сделки и не изменяет данные.</p>
    </section>

    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${report?.preview_only ? `<div class="status ok" role="status"><b>Только просмотр.</b> Отчёт построен ${esc(fmtDateTime(report.generated_at))}.</div>` : ''}

    ${report ? `<section class="card">
      <div class="section-title"><div><h2>Группы ручного исправления</h2><p class="muted">Порядок исправления построен от ошибочных ролей к отсутствующим полям.</p></div><span class="pill red">Решение владельца</span></div>
      <div class="status warn"><b>Автоматические исправления и массовые назначения отключены.</b> Каждое изменение должно быть подтверждено по карточке сделки.</div>
      <div class="kpi-row task-review-metrics" aria-label="Сводка плана исправления">
        ${metric('Групп исправления', n(planSummary.remediation_groups), 'blue')}
        ${metric('Затронуто сделок', n(planSummary.affected_deals), n(planSummary.affected_deals) ? 'red' : 'green')}
        ${metric('Сначала', n(planSummary.urgent_groups), n(planSummary.urgent_groups) ? 'red' : 'green')}
        ${metric('Затем', n(planSummary.high_groups), n(planSummary.high_groups) ? 'yellow' : 'green')}
        ${metric('После проверки сторон', n(planSummary.normal_groups), n(planSummary.normal_groups) ? 'blue' : 'green')}
      </div>
      <details class="task-review-contract" open><summary>Порядок исправления</summary><ol>${(Array.isArray(plan.execution_order) ? plan.execution_order : []).map((step) => `<li>${esc(step)}</li>`).join('')}</ol></details>
      <div class="list">${planRows.map(remediationCard).join('') || '<div class="empty">Группы исправления не найдены.</div>'}</div>
    </section>

    <section class="card">
      <div class="section-title"><div><h2>Подтверждающие действия активных СПН</h2><p class="muted">Creator, participants, events, tasks и documents учитываются как отдельные типы доказательств.</p></div><span class="pill blue">Evidence only</span></div>
      <div class="status warn"><b>История действий — не назначение.</b> Даже сильный одиночный набор сигналов требует ручного подтверждения владельца.</div>
      <div class="kpi-row task-review-metrics" aria-label="Сводка доказательств ответственности">
        ${metric('Сделок в выборке', n(eSummary.deals_in_scope), 'blue')}
        ${metric('Есть сигналы активного СПН', n(eSummary.with_any_active_spn_evidence), n(eSummary.with_any_active_spn_evidence) ? 'blue' : 'gray')}
        ${metric('Сильный одиночный набор', n(eSummary.strong_single_evidence), n(eSummary.strong_single_evidence) ? 'yellow' : 'gray')}
        ${metric('Слабый одиночный набор', n(eSummary.weak_single_evidence), n(eSummary.weak_single_evidence) ? 'yellow' : 'green')}
        ${metric('Несколько кандидатов', n(eSummary.multiple_candidates), n(eSummary.multiple_candidates) ? 'red' : 'green')}
        ${metric('Нет сигналов', n(eSummary.no_active_spn_evidence), n(eSummary.no_active_spn_evidence) ? 'red' : 'green')}
      </div>
      <div class="status ok"><b>Граница вывода.</b> ${esc(evidence.decision_note || 'Сигналы помогают подготовить ручное решение, но не заменяют его.')}</div>
      <div class="list">${evidenceRows.map(evidenceCard).join('') || '<div class="empty">Evidence-only данные не получены.</div>'}</div>
    </section>

    <section class="card">
      <div class="actions" style="justify-content:flex-start">
        <a class="btn" href="./operational-adoption-v2.html">Вернуться к движению и результату</a>
        <a class="btn" href="./manager-v2.html">Открыть контроль сделок</a>
      </div>
    </section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Собираю план исправления и доказательства…' : 'Данные ещё не загружены.'}</p></section>`}
  </main>`;
}

async function loadReport() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    report = await rpc('nav_v2_get_operational_adoption_report', { p_days: 30, p_limit: 500 }, 30000);
    if (!allowed()) throw new Error('Источники ответственности доступны владельцу, администратору и менеджеру.');
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
