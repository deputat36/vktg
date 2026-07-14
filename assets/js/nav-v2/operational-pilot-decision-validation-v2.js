import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';
import {
  buildPilotMeasurementBaseline,
  validatePilotOwnerDecisionPackage
} from './operational-pilot-decision-validation-model-v2.js';

const app = document.getElementById('app');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
let freshReport = null;
let importedPackage = null;
let validationResult = null;
let baselinePackage = null;
let importedFileName = '';
let busy = false;
let errorText = '';
let noticeText = '';
let noticeTone = 'info';

function n(value) { return Number(value || 0); }
function profile() { return freshReport?.profile || {}; }
function pilot() { return freshReport?.operational_pilot_shortlist || {}; }
function allowed() { return ['owner', 'admin'].includes(profile().role); }

function fmtDateTime(value) {
  if (!value) return 'Не зафиксировано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function stateLabel(state) {
  return ({
    confirmed_ready_for_baseline: 'Подтверждено и актуально',
    rejected_verified: 'Отклонение подтверждено',
    stale: 'Данные изменились',
    invalid: 'Пакет некорректен'
  })[state] || state || 'Не проверено';
}

function stateTone(state) {
  return ({
    confirmed_ready_for_baseline: 'green',
    rejected_verified: 'gray',
    stale: 'red',
    invalid: 'red'
  })[state] || 'gray';
}

function valueText(value) {
  if (Array.isArray(value)) return value.length ? value.join(' · ') : '[]';
  if (value === null || value === undefined || value === '') return 'NULL';
  return String(value);
}

function errorList(values, emptyText) {
  const rows = Array.isArray(values) ? values.filter(Boolean) : [];
  return rows.length ? `<ul>${rows.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>` : `<span class="muted">${esc(emptyText)}</span>`;
}

function changeRows(changes) {
  const rows = Array.isArray(changes) ? changes : [];
  if (!rows.length) return '<div class="status ok"><b>Свежесть подтверждена.</b> Контролируемые поля не изменились.</div>';
  return `<div class="list">${rows.map((change) => `<article class="list-item">
    <div class="section-title"><div><h4><code>${esc(change.field)}</code></h4></div><span class="pill red">Изменено</span></div>
    <div class="task-review-facts">
      <div><span class="small">В owner package</span><b>${esc(valueText(change.package_value))}</b></div>
      <div><span class="small">Сейчас</span><b>${esc(valueText(change.fresh_value))}</b></div>
    </div>
  </article>`).join('')}</div>`;
}

function decisionCard(row) {
  const snapshot = row.fresh_snapshot || row.package_snapshot || {};
  return `<article class="list-item task-review-card">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${stateTone(row.state)}">${esc(stateLabel(row.state))}</span>
          <span class="pill gray">${esc(row.lane || 'lane не указан')}</span>
        </div>
        <h3>${esc(snapshot.deal_title || snapshot.address || row.deal_id || 'Сделка')}</h3>
        <p class="muted">${esc(snapshot.address || 'Адрес не указан')} · <code>${esc(row.deal_id || '')}</code></p>
      </div>
      <span class="pill ${row.decision_status === 'confirmed' ? 'green' : 'gray'}">${row.decision_status === 'confirmed' ? 'В пилот предложено' : 'Отклонено'}</span>
    </div>
    <div class="status ${row.decision_status === 'confirmed' ? 'ok' : 'warn'}"><b>Основание owner:</b> ${esc(row.note || 'Не указано')}</div>
    <div class="task-review-facts">
      <div><span class="small">Готовность</span><b>Задаток ${n(snapshot.readiness_deposit)}% · сделка ${n(snapshot.readiness_deal)}%</b></div>
      <div><span class="small">Задачи</span><b>${n(snapshot.open_tasks)} открыто</b><span class="muted">Просрочено: ${n(snapshot.overdue_tasks)}</span></div>
      <div><span class="small">Риски</span><b>${n(snapshot.open_risks)} открыто</b><span class="muted">Блокируют сделку: ${n(snapshot.blocking_deal_risks)}</span></div>
      <div><span class="small">Документы</span><b>${n(snapshot.open_required_documents)} открыто</b><span class="muted">Просрочено: ${n(snapshot.overdue_required_documents)} · подтверждено: ${n(snapshot.resolved_documents)}</span></div>
    </div>
    <details class="task-review-contract"${row.changes?.length ? ' open' : ''}><summary>Сравнение со свежим shortlist</summary>${changeRows(row.changes)}</details>
  </article>`;
}

function validationBlock() {
  if (!validationResult) return '';
  const summary = validationResult.summary || {};
  const packageValid = summary.decision_package_valid === true;
  const revalidated = summary.fresh_revalidation_passed === true;
  const baselineReady = summary.measurement_baseline_ready === true;
  return `<section class="card">
    <div class="section-title">
      <div>
        <h2>Результат свежей проверки</h2>
        <p class="muted">Файл: ${esc(importedFileName || 'без имени')} · проверен ${esc(fmtDateTime(validationResult.validated_at))}</p>
      </div>
      <span class="pill ${baselineReady ? 'green' : revalidated ? 'yellow' : 'red'}">${baselineReady ? 'Baseline готов' : revalidated ? 'Проверено, но нет confirmed' : 'Нужна корректировка'}</span>
    </div>
    <div class="kpi-row task-review-metrics" aria-label="Сводка проверки owner decision package">
      ${metric('Решений', n(summary.decisions), 'blue')}
      ${metric('Подтверждено', n(summary.confirmed), n(summary.confirmed) ? 'green' : 'yellow')}
      ${metric('Отклонено', n(summary.rejected), n(summary.rejected) ? 'gray' : 'green')}
      ${metric('Устарело', n(summary.stale), n(summary.stale) ? 'red' : 'green')}
      ${metric('Некорректно', n(summary.invalid), n(summary.invalid) ? 'red' : 'green')}
      ${metric('Изменённых полей', n(summary.changed_fields), n(summary.changed_fields) ? 'red' : 'green')}
    </div>
    <div class="status ${packageValid ? 'ok' : 'error'}"><b>Структура owner package:</b> ${packageValid ? 'валидна' : 'невалидна'}.</div>
    <div class="status ${revalidated ? 'ok' : 'warn'}"><b>Fresh read-only revalidation:</b> ${revalidated ? 'пройдена' : 'не пройдена'}.</div>
    <div class="status ${baselineReady ? 'ok' : 'warn'}"><b>Measurement baseline:</b> ${baselineReady ? 'можно выгрузить для confirmed deals' : 'не готов'}.</div>
    ${validationResult.top_errors?.length ? `<details class="task-review-contract" open><summary>Ошибки пакета</summary>${errorList(validationResult.top_errors, 'Ошибок нет.')}</details>` : ''}
    <div class="actions" style="justify-content:flex-start">
      <button class="btn light" type="button" id="downloadPilotValidation">Скачать validation JSON</button>
      <button class="btn primary" type="button" id="downloadPilotBaseline"${baselineReady ? '' : ' disabled'}>Скачать measurement baseline</button>
      <button class="btn light" type="button" id="clearPilotValidation">Очистить файл</button>
    </div>
  </section>
  <section class="card">
    <div class="section-title"><div><h2>Решения и изменения</h2><p class="muted">Любое изменение контролируемых полей блокирует baseline до нового owner package.</p></div><span class="pill blue">${validationResult.decisions?.length || 0}</span></div>
    <div class="list">${(validationResult.decisions || []).map(decisionCard).join('') || '<div class="empty">Решения отсутствуют.</div>'}</div>
  </section>`;
}

function uploadBlock() {
  return `<section class="card">
    <div class="section-title">
      <div><h2>Загрузить owner decision JSON</h2><p class="muted">Принимается файл `navigator_v2_operational_pilot_owner_decision`, созданный на экране решения владельца.</p></div>
      <span class="pill blue">До 2 МБ</span>
    </div>
    <div class="status warn"><b>Файл остаётся локально.</b> Он читается в памяти браузера и не отправляется в Supabase.</div>
    <label for="pilotDecisionFile"><b>JSON-файл решения</b></label>
    <input id="pilotDecisionFile" type="file" accept="application/json,.json">
    <p class="muted">После выбора система сравнит source versions, shortlist key и все контролируемые поля трёх карточек со свежим read-only отчётом.</p>
  </section>`;
}

function draw() {
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero">
      <span class="role-home-eyebrow">Fresh revalidation</span>
      <h1>Проверка решения владельца и исходная точка пилота</h1>
      <p>Загрузите owner decision JSON, сравните его со свежим shortlist и получите measurement baseline только для актуальных подтверждённых сделок.</p>
    </section>

    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${noticeText ? `<div class="status ${noticeTone}" role="status">${esc(noticeText)}</div>` : ''}

    ${freshReport ? `<div class="status ok" role="status"><b>Свежий read-only источник загружен.</b> Report v${n(freshReport.report_version)}, pilot v${n(pilot().pilot_version)}, ${pilot().items?.length || 0} карточки, сформирован ${esc(fmtDateTime(freshReport.generated_at))}.</div>
      ${uploadBlock()}
      ${validationBlock()}
      <section class="card"><div class="actions" style="justify-content:flex-start"><a class="btn light" href="./operational-pilot-decision-v2.html">Оформить новое решение</a><a class="btn light" href="./operational-adoption-v2.html">Вернуться к отчёту</a></div></section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Загружаю свежий read-only shortlist…' : 'Свежий отчёт не загружен.'}</p></section>`}
  </main>`;

  document.getElementById('pilotDecisionFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importFile(file);
  });

  document.getElementById('downloadPilotValidation')?.addEventListener('click', () => {
    downloadJson(validationResult, `navigator-v2-operational-pilot-owner-decision-validation-${dateStamp()}.json`);
    noticeTone = 'ok';
    noticeText = 'Validation report скачан. Он не меняет данные и не запускает пилот.';
    draw();
  });

  document.getElementById('downloadPilotBaseline')?.addEventListener('click', () => {
    if (!baselinePackage) return;
    downloadJson(baselinePackage, `navigator-v2-operational-pilot-measurement-baseline-${dateStamp()}.json`);
    noticeTone = 'ok';
    noticeText = 'Read-only measurement baseline скачан. Pilot start по-прежнему не разрешён.';
    draw();
  });

  document.getElementById('clearPilotValidation')?.addEventListener('click', () => {
    importedPackage = null;
    validationResult = null;
    baselinePackage = null;
    importedFileName = '';
    noticeTone = 'info';
    noticeText = 'Локальный файл очищен. Supabase не изменялся.';
    draw();
  });
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadJson(payload, filename) {
  if (!payload) return;
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importFile(file) {
  errorText = '';
  noticeText = '';
  if (file.size > MAX_FILE_BYTES) {
    errorText = 'Файл превышает допустимый размер 2 МБ.';
    draw();
    return;
  }
  try {
    importedPackage = JSON.parse(await file.text());
    importedFileName = file.name;
    validationResult = validatePilotOwnerDecisionPackage(importedPackage, freshReport);
    baselinePackage = buildPilotMeasurementBaseline(validationResult);
    noticeTone = validationResult.summary?.measurement_baseline_ready ? 'ok' : 'warn';
    noticeText = validationResult.summary?.measurement_baseline_ready
      ? 'Owner package актуален. Measurement baseline готов к скачиванию.'
      : 'Файл проверен, но measurement baseline заблокирован.';
  } catch (error) {
    importedPackage = null;
    validationResult = null;
    baselinePackage = null;
    importedFileName = file.name;
    errorText = `Не удалось прочитать JSON: ${error.message || String(error)}`;
  }
  draw();
}

async function loadFreshReport() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    freshReport = await rpc('nav_v2_get_operational_adoption_report', { p_days: 30, p_limit: 500 }, 30000);
    if (!allowed()) throw new Error('Проверка owner decision package доступна только владельцу и администратору.');
  } catch (error) {
    freshReport = null;
    errorText = error.message || String(error);
  } finally {
    busy = false;
    draw();
  }
}

async function init() {
  setupTop('manager');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  await loadFreshReport();
}

init();
