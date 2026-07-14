import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';
import {
  buildPilotDecisionPackage,
  createPilotDecisionState,
  summarizePilotDecisions,
  updatePilotDecision
} from './operational-adoption-pilot-decision-v2.js';

const app = document.getElementById('app');
let report = null;
let decisions = {};
let busy = false;
let errorText = '';
let noticeText = '';
let noticeTone = 'info';

function n(value) { return Number(value || 0); }
function pilot() { return report?.operational_pilot_shortlist || {}; }
function items() { return Array.isArray(pilot().items) ? pilot().items : []; }
function profile() { return report?.profile || {}; }
function allowed() { return ['owner', 'admin'].includes(profile().role); }
function currentDecision(item) { return decisions?.[String(item?.deal_id || '')] || { decision_status: 'pending', note: '' }; }

function fmtDateTime(value) {
  if (!value) return 'Не зафиксировано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function toneForLane(lane) {
  return ({ quick_result: 'green', responsibility_confirmation: 'blue', document_workflow: 'yellow' })[lane] || 'gray';
}

function decisionLabel(value) {
  return ({ pending: 'Не рассмотрено', confirmed: 'Подтвердить для пилота', rejected: 'Отклонить' })[value] || value;
}

function decisionTone(value) {
  return ({ pending: 'gray', confirmed: 'green', rejected: 'red' })[value] || 'gray';
}

function option(value, current) {
  return `<option value="${value}"${current === value ? ' selected' : ''}>${esc(decisionLabel(value))}</option>`;
}

function textList(values, emptyText) {
  const rows = Array.isArray(values) ? values.filter(Boolean) : [];
  return rows.length ? `<ul>${rows.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>` : `<span class="muted">${esc(emptyText)}</span>`;
}

function responsibility(item) {
  const spn = [item.seller_spn_name, item.buyer_spn_name].filter(Boolean).join(' / ');
  return {
    spn: spn || 'СПН не подтверждён',
    manager: item.manager_name || 'Менеджер не назначен'
  };
}

function decisionCard(item) {
  const current = currentDecision(item);
  const people = responsibility(item);
  const noteInvalid = current.decision_status !== 'pending' && String(current.note || '').trim().length < 10;
  return `<article class="list-item task-review-card operational-pilot-card">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${toneForLane(item.lane)}">${esc(item.lane_label || item.lane || 'Сценарий')}</span>
          <span class="pill ${decisionTone(current.decision_status)}">${esc(decisionLabel(current.decision_status))}</span>
        </div>
        <h3>${esc(item.deal_title || item.address || 'Сделка')}</h3>
        <p class="muted">${esc(item.address || 'Адрес не указан')} · ${esc(statusText(item.deal_status))}</p>
      </div>
      <span class="pill gray">Порядок проверки: ${n(item.review_order)}</span>
    </div>

    <div class="status ok"><b>Цель сценария:</b> ${esc(item.lane_goal || 'Проверить рабочий цикл сделки.')}</div>
    <div class="task-review-facts">
      <div><span class="small">Готовность</span><b>Задаток ${n(item.readiness_deposit)}% · сделка ${n(item.readiness_deal)}%</b></div>
      <div><span class="small">СПН</span><b>${esc(people.spn)}</b><span class="muted">Менеджер: ${esc(people.manager)}</span></div>
      <div><span class="small">Evidence</span><b>${esc(item.evidence_candidate_name || 'Кандидат не подтверждён')}</b><span class="muted">Типов сигналов: ${n(item.strongest_signal_types)} · действий: ${n(item.strongest_signal_count)}</span></div>
      <div><span class="small">Активность</span><b>${n(item.meaningful_events)} значимых событий</b><span class="muted">Последняя: ${esc(fmtDateTime(item.last_meaningful_activity_at))}</span></div>
    </div>
    <div class="task-review-facts adoption-backlog">
      <div><span class="small">Задачи</span><b>${n(item.open_tasks)} открыто</b><span class="muted">Просрочено: ${n(item.overdue_tasks)}</span></div>
      <div><span class="small">Риски</span><b>${n(item.open_risks)} открыто</b><span class="muted">Блокируют сделку: ${n(item.blocking_deal_risks)}</span></div>
      <div><span class="small">Документы</span><b>${n(item.open_required_documents)} обязательных открыто</b><span class="muted">Просрочено: ${n(item.overdue_required_documents)} · подтверждено: ${n(item.resolved_documents)}</span></div>
    </div>

    <details class="task-review-contract" open><summary>Почему предложена эта сделка</summary>${textList(item.reasons, 'Причины не переданы.')}</details>
    <details class="task-review-contract"><summary>Ограничения до пилота</summary>${textList(item.cautions, 'Ограничения не переданы.')}</details>
    <div class="status warn"><b>Следующее безопасное действие:</b> ${esc(item.safe_action || 'Проверить карточку вручную.')}</div>

    <fieldset class="task-review-contract" style="margin-top:16px">
      <legend><b>Решение владельца</b></legend>
      <label class="small" for="pilotDecision-${esc(item.deal_id)}">Статус решения</label>
      <select id="pilotDecision-${esc(item.deal_id)}" data-pilot-decision="${esc(item.deal_id)}">
        ${option('pending', current.decision_status)}
        ${option('confirmed', current.decision_status)}
        ${option('rejected', current.decision_status)}
      </select>
      <label class="small" for="pilotNote-${esc(item.deal_id)}" style="display:block;margin-top:12px">Основание решения</label>
      <textarea id="pilotNote-${esc(item.deal_id)}" data-pilot-note="${esc(item.deal_id)}" rows="3" maxlength="1000" placeholder="Не менее 10 символов для подтверждения или отказа">${esc(current.note || '')}</textarea>
      <p class="${noteInvalid ? 'status error' : 'muted'}" style="margin-top:8px">${noteInvalid ? 'Для принятого решения требуется основание не короче 10 символов.' : 'Черновик хранится только в памяти этой страницы и исчезнет после перезагрузки.'}</p>
    </fieldset>

    <div class="actions task-review-actions" style="justify-content:flex-start">
      <a class="btn light" href="${esc(item.card_url || `./deal-card-v2.html?id=${encodeURIComponent(item.deal_id)}`)}">Открыть карточку</a>
    </div>
  </article>`;
}

function packageBlock() {
  const summary = summarizePilotDecisions(items(), decisions, profile());
  const ready = summary.decision_package_ready;
  return `<section class="card">
    <div class="section-title">
      <div>
        <h2>Пакет решения владельца</h2>
        <p class="muted">Файл фиксирует решения и исходный read-only snapshot. Он не запускает пилот и ничего не записывает в Supabase.</p>
      </div>
      <span class="pill ${ready ? 'green' : 'yellow'}">${ready ? 'Пакет готов' : 'Нужны решения'}</span>
    </div>
    <div class="kpi-row task-review-metrics" aria-label="Сводка решений по пилоту">
      ${metric('Всего сценариев', summary.total, 'blue')}
      ${metric('Рассмотрено', summary.reviewed, summary.reviewed === summary.total ? 'green' : 'yellow')}
      ${metric('Подтверждено', summary.confirmed, summary.confirmed ? 'green' : 'gray')}
      ${metric('Отклонено', summary.rejected, summary.rejected ? 'red' : 'gray')}
      ${metric('Не рассмотрено', summary.pending, summary.pending ? 'yellow' : 'green')}
      ${metric('Коротких оснований', summary.invalid_notes, summary.invalid_notes ? 'red' : 'green')}
    </div>
    <div class="status ${ready ? 'ok' : 'warn'}"><b>${ready ? 'Решение оформлено.' : 'Пакет пока черновой.'}</b> ${ready ? 'Все три сценария рассмотрены, основания заполнены. Можно скачать JSON для следующей read-only проверки.' : 'Нужно подтвердить или отклонить каждый сценарий и указать основание не короче 10 символов.'}</div>
    <div class="status warn"><b>Граница.</b> Даже готовый пакет содержит <code>pilot_started=false</code>, <code>pilot_start_authorized=false</code> и требует отдельный measurement baseline после свежей проверки данных.</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" type="button" id="downloadPilotDecision"${summary.total ? '' : ' disabled'}>Скачать JSON</button>
      <button class="btn light" type="button" id="clearPilotDecision"${summary.reviewed || summary.invalid_notes ? '' : ' disabled'}>Очистить решения</button>
      <a class="btn light" href="./operational-adoption-v2.html">Вернуться к отчёту</a>
    </div>
  </section>`;
}

function draw() {
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero">
      <span class="role-home-eyebrow">Решение владельца</span>
      <h1>Какие сделки допустить к операционному пилоту</h1>
      <p>Проверьте три предложенных сценария, подтвердите или отклоните каждый и выгрузите локальный пакет решения. Серверные данные не изменяются.</p>
    </section>

    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${noticeText ? `<div class="status ${noticeTone}" role="status">${esc(noticeText)}</div>` : ''}

    ${report ? `<div class="status ok" role="status"><b>Только локальный черновик.</b> Отчёт версии ${n(report.report_version)}, shortlist версии ${n(pilot().pilot_version)}, построен ${esc(fmtDateTime(report.generated_at))}. Автор: ${esc(profile().full_name || profile().email || profile().id || 'не указан')}.</div>
      ${packageBlock()}
      <section class="card">
        <div class="section-title"><div><h2>Три сценария</h2><p class="muted">Решение относится только к текущему snapshot. При смене данных требуется новая проверка.</p></div><span class="pill blue">${items().length}</span></div>
        <div class="list">${items().map(decisionCard).join('') || '<div class="empty">Shortlist отсутствует. Автоматический выбор не выполнялся.</div>'}</div>
      </section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Загружаю read-only shortlist…' : 'Данные не загружены.'}</p></section>`}
  </main>`;

  document.querySelectorAll('[data-pilot-decision]').forEach((select) => {
    select.addEventListener('change', () => {
      decisions = updatePilotDecision(decisions, select.dataset.pilotDecision, { decision_status: select.value });
      noticeText = '';
      draw();
    });
  });

  document.querySelectorAll('[data-pilot-note]').forEach((textarea) => {
    textarea.addEventListener('change', () => {
      decisions = updatePilotDecision(decisions, textarea.dataset.pilotNote, { note: textarea.value });
      noticeText = '';
      draw();
    });
  });

  document.getElementById('downloadPilotDecision')?.addEventListener('click', () => {
    const payload = buildPilotDecisionPackage(report, decisions);
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `navigator-v2-operational-pilot-owner-decision-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    noticeTone = payload.summary.decision_package_ready ? 'ok' : 'warn';
    noticeText = payload.summary.decision_package_ready
      ? 'Готовый пакет решения скачан. Он не запускает пилот и требует свежую read-only проверку.'
      : 'Скачан черновой пакет. В нём decision_package_ready=false.';
    draw();
  });

  document.getElementById('clearPilotDecision')?.addEventListener('click', () => {
    decisions = createPilotDecisionState(items());
    noticeTone = 'info';
    noticeText = 'Локальные решения очищены. Supabase не изменялся.';
    draw();
  });
}

async function loadReport() {
  if (busy) return;
  busy = true;
  errorText = '';
  noticeText = '';
  draw();
  try {
    report = await rpc('nav_v2_get_operational_adoption_report', { p_days: 30, p_limit: 500 }, 30000);
    if (!allowed()) throw new Error('Лист решения по пилоту доступен только владельцу и администратору.');
    decisions = createPilotDecisionState(items());
  } catch (error) {
    report = null;
    decisions = {};
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
