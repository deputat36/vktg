import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';
import {
  actionSuggestionsForLane,
  buildPilotActionChecklistPackage,
  createPilotActionState,
  evidenceTypeOptions,
  summarizePilotActionChecklist,
  updatePilotActionState,
  validatePilotMeasurementBaseline
} from './operational-pilot-action-checklist-model-v2.js';

const app = document.getElementById('app');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
let freshReport = null;
let importedBaseline = null;
let baselineValidation = null;
let actionState = {};
let importedFileName = '';
let busy = false;
let errorText = '';
let noticeText = '';
let noticeTone = 'info';

function n(value) { return Number(value || 0); }
function profile() { return freshReport?.profile || {}; }
function pilot() { return freshReport?.operational_pilot_shortlist || {}; }
function allowed() { return ['owner', 'admin'].includes(profile().role); }
function availableRows() {
  return Array.isArray(baselineValidation?.baselines)
    ? baselineValidation.baselines.filter((row) => row.state === 'fresh_ready_for_action')
    : [];
}

function fmtDateTime(value) {
  if (!value) return 'Не зафиксировано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function inputDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function stateLabel(state) {
  return ({
    fresh_ready_for_action: 'Baseline актуален',
    stale: 'Baseline устарел',
    invalid: 'Baseline некорректен'
  })[state] || state || 'Не проверено';
}

function stateTone(state) {
  return ({ fresh_ready_for_action: 'green', stale: 'red', invalid: 'red' })[state] || 'gray';
}

function laneLabel(lane) {
  return ({
    quick_result: 'Короткий результат',
    responsibility_confirmation: 'Ответственность',
    document_workflow: 'Документный цикл'
  })[lane] || lane || 'Сценарий';
}

function laneTone(lane) {
  return ({ quick_result: 'green', responsibility_confirmation: 'blue', document_workflow: 'yellow' })[lane] || 'gray';
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
  if (!rows.length) return '<div class="status ok"><b>Свежесть подтверждена.</b> Контролируемые поля baseline не изменились.</div>';
  return `<div class="list">${rows.map((change) => `<article class="list-item">
    <div class="section-title"><div><h4><code>${esc(change.field)}</code></h4></div><span class="pill red">Изменено</span></div>
    <div class="task-review-facts">
      <div><span class="small">В baseline</span><b>${esc(valueText(change.baseline_value))}</b></div>
      <div><span class="small">Сейчас</span><b>${esc(valueText(change.fresh_value))}</b></div>
    </div>
  </article>`).join('')}</div>`;
}

function responsibleSuggestions(row) {
  const snapshot = row?.baseline_snapshot?.responsibility_snapshot || {};
  const values = [
    [snapshot.manager_id, snapshot.manager_name],
    [snapshot.seller_spn_id, snapshot.seller_spn_name],
    [snapshot.buyer_spn_id, snapshot.buyer_spn_name],
    [snapshot.evidence_candidate_id, snapshot.evidence_candidate_name]
  ];
  const seen = new Set();
  return values.flatMap(([id, name]) => {
    const label = String(name || '').trim();
    if (!label || seen.has(label)) return [];
    seen.add(label);
    return [{ id: id || null, label }];
  });
}

function actionReferenceLabel(lane) {
  return ({
    quick_result: 'Задача, факт или объект действия',
    responsibility_confirmation: 'СПН, сторона сделки или связь для подтверждения',
    document_workflow: 'Документ или этап документного цикла'
  })[lane] || 'Объект действия';
}

function currentAction(row) {
  return actionState?.[row.deal_id] || {};
}

function actionSummaryRow(dealId) {
  const summary = summarizePilotActionChecklist(baselineValidation, actionState, profile());
  return summary.action_rows.find((row) => row.deal_id === dealId) || { errors: [], valid: false };
}

function evidenceSelect(current) {
  return `<select data-action-field="evidence_type">
    <option value="">Выберите тип evidence</option>
    ${evidenceTypeOptions().map((item) => `<option value="${esc(item.value)}"${current === item.value ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}
  </select>`;
}

function actionCard(row, index) {
  const snapshot = row.baseline_snapshot || {};
  const metrics = snapshot.baseline_metrics || {};
  const action = currentAction(row);
  const checked = actionSummaryRow(row.deal_id);
  const suggestions = actionSuggestionsForLane(row.lane);
  const people = responsibleSuggestions(row);
  const actionListId = `pilotActionSuggestions-${index}`;
  const responsibleListId = `pilotResponsibleSuggestions-${index}`;
  return `<article class="list-item task-review-card" data-action-deal="${esc(row.deal_id)}">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${laneTone(row.lane)}">${esc(laneLabel(row.lane))}</span>
          <span class="pill ${checked.valid ? 'green' : 'yellow'}">${checked.valid ? 'Действие заполнено' : 'Нужны поля'}</span>
        </div>
        <h3>${esc(snapshot.deal_title || snapshot.address || row.deal_id)}</h3>
        <p class="muted">${esc(snapshot.address || 'Адрес не указан')} · <code>${esc(row.deal_id)}</code></p>
      </div>
      <span class="pill ${stateTone(row.state)}">${esc(stateLabel(row.state))}</span>
    </div>

    <div class="task-review-facts">
      <div><span class="small">Готовность</span><b>Задаток ${n(metrics.readiness_deposit)}% · сделка ${n(metrics.readiness_deal)}%</b></div>
      <div><span class="small">Задачи</span><b>${n(metrics.open_tasks)} открыто</b><span class="muted">Просрочено: ${n(metrics.overdue_tasks)}</span></div>
      <div><span class="small">Риски</span><b>${n(metrics.open_risks)} открыто</b><span class="muted">Блокируют: ${n(metrics.blocking_deal_risks)}</span></div>
      <div><span class="small">Документы</span><b>${n(metrics.open_required_documents)} открыто</b><span class="muted">Просрочено: ${n(metrics.overdue_required_documents)}</span></div>
    </div>

    <details class="task-review-contract"><summary>Measurement contract</summary>
      <div class="status ok"><b>Условие результата:</b> ${esc(snapshot.measurement_contract?.success_condition || 'Не указано')}</div>
      ${errorList(snapshot.measurement_contract?.required_completion_fields, 'Обязательные поля результата не указаны.')}
    </details>

    <fieldset class="task-review-contract" style="margin-top:16px">
      <legend><b>Одно ручное действие</b></legend>
      <label class="small" for="pilotActionTitle-${index}">Название действия</label>
      <input id="pilotActionTitle-${index}" list="${actionListId}" data-action-field="action_title" value="${esc(action.action_title || '')}" maxlength="500" placeholder="Выберите или сформулируйте одно проверяемое действие">
      <datalist id="${actionListId}">${suggestions.map((value) => `<option value="${esc(value)}"></option>`).join('')}</datalist>

      <label class="small" for="pilotActionReference-${index}" style="display:block;margin-top:12px">${esc(actionReferenceLabel(row.lane))}</label>
      <input id="pilotActionReference-${index}" data-action-field="action_reference" value="${esc(action.action_reference || '')}" maxlength="500" placeholder="ID, название документа, задача, сторона или другой точный ориентир">

      <div class="task-review-facts" style="margin-top:12px">
        <div>
          <label class="small" for="pilotResponsible-${index}">Ответственный или роль</label>
          <input id="pilotResponsible-${index}" list="${responsibleListId}" data-action-field="responsible_name_or_role" value="${esc(action.responsible_name_or_role || '')}" maxlength="300" placeholder="ФИО или роль">
          <datalist id="${responsibleListId}">${people.map((item) => `<option value="${esc(item.label)}"></option>`).join('')}</datalist>
        </div>
        <div>
          <label class="small" for="pilotResponsibleId-${index}">ID ответственного, если известен</label>
          <input id="pilotResponsibleId-${index}" data-action-field="responsible_id" value="${esc(action.responsible_id || '')}" maxlength="100" placeholder="UUID или служебный ID">
        </div>
        <div>
          <label class="small" for="pilotDueAt-${index}">Срок</label>
          <input id="pilotDueAt-${index}" type="datetime-local" data-action-field="due_at" value="${esc(inputDateTime(action.due_at))}">
        </div>
        <div>
          <label class="small" for="pilotEvidenceType-${index}">Тип evidence</label>
          <div id="pilotEvidenceType-${index}">${evidenceSelect(action.evidence_type || '')}</div>
        </div>
      </div>

      <label class="small" for="pilotExpectedResult-${index}" style="display:block;margin-top:12px">Ожидаемый результат</label>
      <textarea id="pilotExpectedResult-${index}" data-action-field="expected_result" rows="3" maxlength="1000" placeholder="Что должно объективно измениться после действия">${esc(action.expected_result || '')}</textarea>

      <label class="small" for="pilotEvidenceRequirement-${index}" style="display:block;margin-top:12px">Какое evidence подтвердит результат</label>
      <textarea id="pilotEvidenceRequirement-${index}" data-action-field="evidence_requirement" rows="3" maxlength="1000" placeholder="Ссылка, файл, статус, событие или письменное подтверждение">${esc(action.evidence_requirement || '')}</textarea>

      <label class="small" for="pilotNextStep-${index}" style="display:block;margin-top:12px">Следующий шаг после подтверждения</label>
      <textarea id="pilotNextStep-${index}" data-action-field="next_step" rows="3" maxlength="1000" placeholder="Что должно произойти после evidence">${esc(action.next_step || '')}</textarea>

      <label class="small" for="pilotPlanningNote-${index}" style="display:block;margin-top:12px">Основание выбора действия</label>
      <textarea id="pilotPlanningNote-${index}" data-action-field="planning_note" rows="3" maxlength="1000" placeholder="Почему именно это действие является безопасным и полезным">${esc(action.planning_note || '')}</textarea>

      <div class="status ${checked.valid ? 'ok' : 'warn'}" style="margin-top:12px"><b>${checked.valid ? 'План действия заполнен.' : 'Checklist не готов.'}</b> ${checked.valid ? 'Это всё ещё не разрешение на запуск.' : 'Заполните обязательные поля и укажите будущий срок.'}</div>
      ${checked.errors?.length ? `<details class="task-review-contract" open><summary>Что исправить</summary>${errorList(checked.errors, 'Ошибок нет.')}</details>` : ''}
    </fieldset>
  </article>`;
}

function validationBlock() {
  if (!baselineValidation) return '';
  const summary = baselineValidation.summary || {};
  const packageValid = summary.baseline_package_valid === true;
  const revalidated = summary.fresh_revalidation_passed === true;
  return `<section class="card">
    <div class="section-title">
      <div><h2>Проверка measurement baseline</h2><p class="muted">Файл: ${esc(importedFileName || 'без имени')} · проверен ${esc(fmtDateTime(baselineValidation.validated_at))}</p></div>
      <span class="pill ${revalidated ? 'green' : 'red'}">${revalidated ? 'Baseline актуален' : 'Checklist заблокирован'}</span>
    </div>
    <div class="kpi-row task-review-metrics" aria-label="Сводка проверки measurement baseline">
      ${metric('Baseline-сделок', n(summary.baselines), 'blue')}
      ${metric('Актуально', n(summary.fresh), n(summary.fresh) ? 'green' : 'yellow')}
      ${metric('Устарело', n(summary.stale), n(summary.stale) ? 'red' : 'green')}
      ${metric('Некорректно', n(summary.invalid), n(summary.invalid) ? 'red' : 'green')}
      ${metric('Изменённых полей', n(summary.changed_fields), n(summary.changed_fields) ? 'red' : 'green')}
    </div>
    <div class="status ${packageValid ? 'ok' : 'error'}"><b>Структура baseline:</b> ${packageValid ? 'валидна' : 'невалидна'}.</div>
    <div class="status ${revalidated ? 'ok' : 'warn'}"><b>Fresh read-only revalidation:</b> ${revalidated ? 'пройдена' : 'не пройдена'}.</div>
    ${baselineValidation.top_errors?.length ? `<details class="task-review-contract" open><summary>Ошибки baseline</summary>${errorList(baselineValidation.top_errors, 'Ошибок нет.')}</details>` : ''}
    <div class="list">${(baselineValidation.baselines || []).map((row) => `<article class="list-item">
      <div class="section-title"><div><h4>${esc(row.baseline_snapshot?.deal_title || row.baseline_snapshot?.address || row.deal_id)}</h4><p class="muted">${esc(laneLabel(row.lane))}</p></div><span class="pill ${stateTone(row.state)}">${esc(stateLabel(row.state))}</span></div>
      <details class="task-review-contract"${row.changes?.length ? ' open' : ''}><summary>Сравнение baseline со свежей карточкой</summary>${changeRows(row.changes)}</details>
    </article>`).join('')}</div>
  </section>`;
}

function checklistBlock() {
  if (!baselineValidation?.summary?.action_checklist_available) return '';
  const summary = summarizePilotActionChecklist(baselineValidation, actionState, profile());
  return `<section class="card">
    <div class="section-title">
      <div><h2>Ручной action checklist</h2><p class="muted">Для каждой confirmed-сделки требуется ровно одно действие, фактический ответственный, срок, evidence и следующий шаг.</p></div>
      <span class="pill ${summary.checklist_ready ? 'green' : 'yellow'}">${summary.checklist_ready ? 'Checklist готов' : 'Нужно заполнение'}</span>
    </div>
    <div class="kpi-row task-review-metrics" aria-label="Сводка action checklist">
      ${metric('Действий', n(summary.actions), 'blue')}
      ${metric('Валидно', n(summary.valid), n(summary.valid) ? 'green' : 'yellow')}
      ${metric('Нужно исправить', n(summary.invalid), n(summary.invalid) ? 'red' : 'green')}
      ${metric('Автор owner/admin', summary.actor_allowed ? 'да' : 'нет', summary.actor_allowed ? 'green' : 'red')}
    </div>
    <div class="status ${summary.checklist_ready ? 'ok' : 'warn'}"><b>${summary.checklist_ready ? 'Пакет checklist можно выгрузить.' : 'Checklist пока черновой.'}</b> Даже готовый пакет содержит <code>pilot_started=false</code> и <code>pilot_start_authorized=false</code>.</div>
    <div class="status warn"><b>Граница.</b> Checklist не создаёт задачи, не назначает людей и не меняет статусы. Для фактического старта требуется отдельное подтверждение владельца и согласие ответственного.</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" type="button" id="downloadPilotActionChecklist"${summary.actions ? '' : ' disabled'}>Скачать checklist JSON</button>
      <button class="btn light" type="button" id="downloadPilotBaselineValidation">Скачать проверку baseline</button>
      <button class="btn light" type="button" id="clearPilotActionChecklist">Очистить файл</button>
    </div>
  </section>
  <section class="card">
    <div class="section-title"><div><h2>Действия по confirmed-сделкам</h2><p class="muted">Поля существуют только в памяти этой страницы и исчезнут после перезагрузки.</p></div><span class="pill blue">${availableRows().length}</span></div>
    <div class="list">${availableRows().map(actionCard).join('')}</div>
  </section>`;
}

function uploadBlock() {
  return `<section class="card">
    <div class="section-title">
      <div><h2>Загрузить measurement baseline</h2><p class="muted">Принимается файл <code>navigator_v2_operational_pilot_measurement_baseline</code>, созданный после fresh validation.</p></div>
      <span class="pill blue">До 2 МБ</span>
    </div>
    <div class="status warn"><b>Файл остаётся локально.</b> Он читается только в памяти браузера и не отправляется в Supabase.</div>
    <label for="pilotMeasurementBaselineFile"><b>JSON-файл baseline</b></label>
    <input id="pilotMeasurementBaselineFile" type="file" accept="application/json,.json">
    <p class="muted">Система повторно сравнит shortlist key, версии, метрики и ответственность со свежим read-only отчётом.</p>
  </section>`;
}

function draw() {
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero">
      <span class="role-home-eyebrow">План операционного действия</span>
      <h1>Одно действие, ответственный, срок и evidence</h1>
      <p>Загрузите measurement baseline, подтвердите его свежесть и подготовьте локальный checklist для confirmed-сделок. Серверные данные не изменяются.</p>
    </section>

    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${noticeText ? `<div class="status ${noticeTone}" role="status">${esc(noticeText)}</div>` : ''}

    ${freshReport ? `<div class="status ok" role="status"><b>Свежий read-only источник загружен.</b> Report v${n(freshReport.report_version)}, pilot v${n(pilot().pilot_version)}, ${pilot().items?.length || 0} карточки, сформирован ${esc(fmtDateTime(freshReport.generated_at))}.</div>
      ${uploadBlock()}
      ${validationBlock()}
      ${checklistBlock()}
      <section class="card"><div class="actions" style="justify-content:flex-start"><a class="btn light" href="./operational-pilot-decision-validation-v2.html">Вернуться к validation</a><a class="btn light" href="./operational-adoption-v2.html">Вернуться к отчёту</a></div></section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Загружаю свежий read-only shortlist…' : 'Свежий отчёт не загружен.'}</p></section>`}
  </main>`;

  document.getElementById('pilotMeasurementBaselineFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importBaseline(file);
  });

  document.querySelectorAll('[data-action-deal]').forEach((card) => {
    const dealId = card.dataset.actionDeal;
    card.querySelectorAll('[data-action-field]').forEach((field) => {
      field.addEventListener('change', () => {
        let value = field.value;
        if (field.dataset.actionField === 'due_at' && value) {
          const parsed = new Date(value);
          value = Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
        }
        actionState = updatePilotActionState(actionState, dealId, { [field.dataset.actionField]: value });
        noticeText = '';
        draw();
      });
    });
  });

  document.getElementById('downloadPilotActionChecklist')?.addEventListener('click', () => {
    const payload = buildPilotActionChecklistPackage(baselineValidation, actionState, profile());
    downloadJson(payload, `navigator-v2-operational-pilot-action-checklist-${dateStamp()}.json`);
    noticeTone = payload.summary.checklist_ready ? 'ok' : 'warn';
    noticeText = payload.summary.checklist_ready
      ? 'Готовый action checklist скачан. Он не запускает пилот и не изменяет Supabase.'
      : 'Скачан черновой checklist с checklist_ready=false.';
    draw();
  });

  document.getElementById('downloadPilotBaselineValidation')?.addEventListener('click', () => {
    downloadJson(baselineValidation, `navigator-v2-operational-pilot-measurement-baseline-validation-${dateStamp()}.json`);
    noticeTone = 'ok';
    noticeText = 'Проверка measurement baseline скачана. Рабочие данные не менялись.';
    draw();
  });

  document.getElementById('clearPilotActionChecklist')?.addEventListener('click', () => {
    importedBaseline = null;
    baselineValidation = null;
    actionState = {};
    importedFileName = '';
    noticeTone = 'info';
    noticeText = 'Локальный baseline и checklist очищены. Supabase не изменялся.';
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

async function importBaseline(file) {
  errorText = '';
  noticeText = '';
  if (file.size > MAX_FILE_BYTES) {
    errorText = 'Файл превышает допустимый размер 2 МБ.';
    draw();
    return;
  }
  try {
    importedBaseline = JSON.parse(await file.text());
    importedFileName = file.name;
    baselineValidation = validatePilotMeasurementBaseline(importedBaseline, freshReport);
    actionState = baselineValidation.summary?.action_checklist_available
      ? createPilotActionState(baselineValidation)
      : {};
    noticeTone = baselineValidation.summary?.action_checklist_available ? 'ok' : 'warn';
    noticeText = baselineValidation.summary?.action_checklist_available
      ? 'Measurement baseline актуален. Можно заполнить ручной action checklist.'
      : 'Baseline проверен, но action checklist заблокирован.';
  } catch (error) {
    importedBaseline = null;
    baselineValidation = null;
    actionState = {};
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
    if (!allowed()) throw new Error('Action checklist операционного пилота доступен только владельцу и администратору.');
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
