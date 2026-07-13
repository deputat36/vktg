import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';

const app = document.getElementById('app');
let report = null;
let busy = false;
let errorText = '';
let activeFilter = 'all';

function n(value) { return Number(value || 0); }
function plan() { return report?.manager_source_remediation_plan || {}; }
function summary() { return plan().summary || {}; }
function items() { return Array.isArray(plan().items) ? plan().items : []; }
function allowed() { return ['owner', 'admin', 'manager'].includes(report?.profile?.role); }

function priorityTone(priority) {
  return ({ urgent: 'red', high: 'yellow', normal: 'blue' })[priority] || 'gray';
}

function filterItems() {
  if (activeFilter === 'all') return items();
  return items().filter((item) => item.priority === activeFilter);
}

function countFilter(filter) {
  if (filter === 'all') return items().length;
  return items().filter((item) => item.priority === filter).length;
}

function filterButton(id, label) {
  return `<button class="tab ${activeFilter === id ? 'active' : ''}" type="button" data-filter="${id}" aria-pressed="${activeFilter === id ? 'true' : 'false'}">${esc(label)} · ${countFilter(id)}</button>`;
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function targetText(item) {
  if (item.target_kind === 'profile_field') {
    const profile = item.current_profile_name || item.target_profile_id || 'профиль не определён';
    return `Профиль: ${profile} · поле ${item.target_field || 'manager_id'}`;
  }
  const profile = item.current_profile_name
    ? `Сейчас указан профиль: ${item.current_profile_name}${item.current_profile_role ? ` (${item.current_profile_role})` : ''}`
    : 'Текущий профиль не указан';
  return `Поле сделки: ${item.target_field || 'СПН'} · ${profile}`;
}

function dealLinks(item) {
  const deals = Array.isArray(item.preview_deals) ? item.preview_deals : [];
  const links = deals.map((deal) => {
    const label = deal.deal_title || deal.address || 'Сделка';
    return `<li><a href="${esc(deal.card_url || `./deal-card-v2.html?id=${encodeURIComponent(deal.deal_id || '')}`)}">${esc(label)}</a><span class="muted"> · ${esc(deal.side_field || item.target_field || '')}</span></li>`;
  }).join('');
  const more = n(item.more_deals_count);
  return `<ul>${links || '<li>Список сделок не сформирован</li>'}</ul>${more ? `<p class="muted">И ещё ${more} сделок в этой группе.</p>` : ''}`;
}

function remediationCard(item) {
  const disabled = item.mutation_available !== true;
  return `<article class="list-item task-review-card remediation-card">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${priorityTone(item.priority)}">${esc(item.priority_label || item.priority || 'Приоритет не указан')}</span>
          <span class="pill gray">${esc(item.remediation_label || item.remediation_code || 'Источник не определён')}</span>
        </div>
        <h3>${esc(item.action_title || 'Исправить источник ответственности')}</h3>
        <p class="muted">${esc(targetText(item))}</p>
      </div>
      <span class="pill ${disabled ? 'green' : 'red'}">${disabled ? 'Изменения отключены' : 'Требуется проверка доступа'}</span>
    </div>

    <div class="task-review-facts">
      <div><span class="small">Затронуто сделок</span><b>${n(item.affected_deals)}</b></div>
      <div><span class="small">Затронуто сторон</span><b>${n(item.affected_deal_sides)}</b></div>
      <div><span class="small">Целевое поле</span><b>${esc(item.target_field || 'Не определено')}</b></div>
      <div><span class="small">Тип исправления</span><b>${esc(item.target_kind === 'profile_field' ? 'Профиль сотрудника' : 'Поле сделки')}</b></div>
    </div>

    <div class="status warn"><b>Безопасное действие:</b> ${esc(item.safe_action || 'Провести ручную проверку источника.')}</div>
    <details class="task-review-contract"><summary>Затронутые сделки</summary>${dealLinks(item)}</details>
  </article>`;
}

function executionOrder() {
  const steps = Array.isArray(plan().execution_order) ? plan().execution_order : [];
  if (!steps.length) return '';
  return `<section class="card">
    <div class="section-title"><div><h2>Порядок исправления</h2><p class="muted">Каждый шаг выполняется вручную и повторно проверяется в предложении менеджера.</p></div></div>
    <ol>${steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>
  </section>`;
}

function draw() {
  const p = plan();
  const s = summary();
  const rows = filterItems();

  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero">
      <span class="role-home-eyebrow">Качество источников ответственности</span>
      <h1>Что исправить до назначения менеджера</h1>
      <p>План группирует неверные поля сделок и профилей. Он не выбирает нового СПН или менеджера и не изменяет рабочие данные.</p>
      <div class="actions" style="justify-content:flex-start"><a class="btn light" href="./operational-adoption-v2.html">Вернуться к движению и результату</a></div>
    </section>

    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${p.preview_only ? `<div class="status ok" role="status"><b>Только просмотр.</b> Автоматические исправления и массовые назначения отключены.</div>` : ''}

    ${report ? `<section class="kpi-row task-review-metrics" aria-label="Сводка плана исправления">
      ${metric('Групп исправления', n(s.remediation_groups), 'blue')}
      ${metric('Затронуто сделок', n(s.affected_deals), n(s.affected_deals) ? 'red' : 'green')}
      ${metric('Сначала', n(s.urgent_groups), n(s.urgent_groups) ? 'red' : 'green')}
      ${metric('Затем', n(s.high_groups), n(s.high_groups) ? 'yellow' : 'green')}
      ${metric('После проверки сторон', n(s.normal_groups), n(s.normal_groups) ? 'blue' : 'green')}
    </section>

    <section class="card">
      <div class="status warn"><b>Граница решения.</b> ${esc(p.decision_note || 'План не назначает сотрудников и не заменяет подтверждение владельца.')}</div>
      <div class="tabs task-review-tabs">${filterButton('all', 'Все')}${filterButton('urgent', 'Сначала')}${filterButton('high', 'Затем')}${filterButton('normal', 'После проверки')}</div>
    </section>

    ${executionOrder()}

    <section class="card task-review-list">
      <div class="section-title"><div><h2>Группы ручного исправления</h2><p class="muted">Сначала устраните неверные роли в полях СПН, затем связи СПН с менеджерами и только после этого пустые стороны сделок.</p></div><span class="pill ${rows.length ? 'blue' : 'green'}">${rows.length}</span></div>
      <div class="list">${rows.map(remediationCard).join('') || '<div class="empty">В выбранной группе нет исправлений.</div>'}</div>
    </section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Группирую источники ответственности…' : 'План ещё не загружен.'}</p></section>`}
  </main>`;

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter || 'all';
      draw();
    });
  });
}

async function loadPlan() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    report = await rpc('nav_v2_get_operational_adoption_report', { p_days: 30, p_limit: 500 }, 30000);
    if (!allowed()) throw new Error('План исправления доступен владельцу, администратору и менеджеру.');
    if (!report?.manager_source_remediation_plan?.plan_version) {
      throw new Error('План исправления ещё не развернут на сервере.');
    }
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
  await loadPlan();
}

init();
