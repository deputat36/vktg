import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';
import {
  acknowledgementChannelOptions,
  buildResponsibleAcknowledgementPackage,
  createResponsibleAcknowledgementState,
  summarizeResponsibleAcknowledgement,
  updateResponsibleAcknowledgementState,
  validateOwnerStartConfirmation
} from './operational-pilot-responsible-acknowledgement-model-v2.js';

const app = document.getElementById('app');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
let freshReport = null;
let importedConfirmation = null;
let confirmationValidation = null;
let acknowledgementState = {};
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
  return Array.isArray(confirmationValidation?.decisions)
    ? confirmationValidation.decisions.filter((row) => row.state === 'authorized_ready_for_acknowledgement')
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

function stateLabel(state) {
  return ({
    authorized_ready_for_acknowledgement: 'Можно фиксировать evidence',
    rejected_by_owner: 'Отклонено владельцем',
    stale: 'Owner confirmation устарел',
    expired: 'Разрешение истекло',
    invalid: 'Owner confirmation некорректен'
  })[state] || state || 'Не проверено';
}

function stateTone(state) {
  return ({
    authorized_ready_for_acknowledgement: 'green',
    rejected_by_owner: 'gray',
    stale: 'red',
    expired: 'red',
    invalid: 'red'
  })[state] || 'gray';
}

function errorList(values, emptyText) {
  const rows = Array.isArray(values) ? values.filter(Boolean) : [];
  return rows.length ? `<ul>${rows.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>` : `<span class="muted">${esc(emptyText)}</span>`;
}

function valueText(value) {
  if (Array.isArray(value)) return value.length ? value.join(' · ') : '[]';
  if (value === null || value === undefined || value === '') return 'NULL';
  return String(value);
}

function changeRows(changes) {
  const rows = Array.isArray(changes) ? changes : [];
  if (!rows.length) return '<div class="status ok"><b>Свежесть подтверждена.</b> Deal, lane и адрес не изменились.</div>';
  return `<div class="list">${rows.map((change) => `<article class="list-item">
    <div class="section-title"><div><h4><code>${esc(change.field)}</code></h4></div><span class="pill red">Изменено</span></div>
    <div class="task-review-facts">
      <div><span class="small">В owner confirmation</span><b>${esc(valueText(change.confirmation_value))}</b></div>
      <div><span class="small">Сейчас</span><b>${esc(valueText(change.fresh_value))}</b></div>
    </div>
  </article>`).join('')}</div>`;
}

function currentAcknowledgement(row) {
  return acknowledgementState?.[row.deal_id] || {};
}

function acknowledgementSummaryRow(dealId) {
  const summary = summarizeResponsibleAcknowledgement(confirmationValidation, acknowledgementState, profile());
  return summary.acknowledgement_rows.find((row) => row.deal_id === dealId) || { errors: [], valid: false };
}

function channelSelect(current) {
  return `<select data-ack-field="acknowledgement_channel">
    <option value="">Выберите канал</option>
    ${acknowledgementChannelOptions().map((item) => `<option value="${esc(item.value)}"${current === item.value ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}
  </select>`;
}

function acknowledgementCard(row, index) {
  const snapshot = row.confirmation_snapshot || {};
  const action = snapshot.action || {};
  const ownerDecision = snapshot.owner_decision || {};
  const current = currentAcknowledgement(row);
  const checked = acknowledgementSummaryRow(row.deal_id);
  return `<article class="list-item task-review-card" data-ack-deal="${esc(row.deal_id)}">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${laneTone(row.lane)}">${esc(laneLabel(row.lane))}</span>
          <span class="pill ${checked.valid ? 'green' : 'yellow'}">${checked.valid ? 'Evidence заполнено' : 'Нужны поля'}</span>
        </div>
        <h3>${esc(snapshot.deal_title || snapshot.address || row.deal_id)}</h3>
        <p class="muted">${esc(snapshot.address || 'Адрес не указан')} · <code>${esc(row.deal_id)}</code></p>
      </div>
      <span class="pill ${stateTone(row.state)}">${esc(stateLabel(row.state))}</span>
    </div>

    <div class="status ok"><b>Owner authorization действует до:</b> ${esc(fmtDateTime(ownerDecision.authorization_expires_at))}</div>
    <div class="status info"><b>Действие:</b> ${esc(action.action_title || 'Не указано')}</div>
    <div class="task-review-facts">
      <div><span class="small">Объект</span><b>${esc(action.action_reference || 'Не указан')}</b></div>
      <div><span class="small">Ответственный по checklist</span><b>${esc(action.responsible_name_or_role || 'Не указан')}</b></div>
      <div><span class="small">ID ответственного</span><b>${esc(action.responsible_id || 'Не указан')}</b></div>
      <div><span class="small">Срок действия</span><b>${esc(fmtDateTime(action.due_at))}</b></div>
    </div>

    <details class="task-review-contract"><summary>Ожидаемый результат и evidence</summary>
      <div class="status ok"><b>Ожидаемый результат:</b> ${esc(action.expected_result || 'Не указан')}</div>
      <div class="status info"><b>Нужное evidence:</b> ${esc(action.evidence_requirement || 'Не указано')}</div>
      <div class="status info"><b>Следующий шаг:</b> ${esc(action.next_step || 'Не указан')}</div>
    </details>

    <fieldset class="task-review-contract" style="margin-top:16px">
      <legend><b>Evidence согласия ответственного</b></legend>
      <div class="status warn"><b>Важно.</b> Это запись владельца или администратора об evidence. Она не является authenticated self-acknowledgement ответственного.</div>

      <label class="small" for="pilotAckDecision-${index}">Ответ ответственного</label>
      <select id="pilotAckDecision-${index}" data-ack-field="acknowledgement_decision">
        <option value="">Выберите ответ</option>
        <option value="acknowledged"${current.acknowledgement_decision === 'acknowledged' ? ' selected' : ''}>Подтвердил действие и срок</option>
        <option value="rejected"${current.acknowledgement_decision === 'rejected' ? ' selected' : ''}>Отказался от действия</option>
        <option value="needs_clarification"${current.acknowledgement_decision === 'needs_clarification' ? ' selected' : ''}>Требует уточнения</option>
      </select>

      <div class="task-review-facts" style="margin-top:12px">
        <div>
          <label class="small" for="pilotAckByName-${index}">Кто дал ответ</label>
          <input id="pilotAckByName-${index}" data-ack-field="acknowledged_by_name_or_role" value="${esc(current.acknowledged_by_name_or_role || '')}" maxlength="300" placeholder="ФИО или роль">
        </div>
        <div>
          <label class="small" for="pilotAckById-${index}">ID ответственного</label>
          <input id="pilotAckById-${index}" data-ack-field="acknowledged_by_id" value="${esc(current.acknowledged_by_id || '')}" maxlength="100" placeholder="UUID, если указан в checklist">
        </div>
        <div>
          <label class="small" for="pilotAckAt-${index}">Когда получен ответ</label>
          <input id="pilotAckAt-${index}" type="datetime-local" data-ack-field="acknowledged_at" value="${esc(inputDateTime(current.acknowledged_at))}">
        </div>
        <div>
          <label class="small" for="pilotAckChannel-${index}">Канал evidence</label>
          <div id="pilotAckChannel-${index}">${channelSelect(current.acknowledgement_channel || '')}</div>
        </div>
      </div>

      <label class="small" for="pilotAckReference-${index}" style="display:block;margin-top:12px">Ссылка или ориентир evidence</label>
      <input id="pilotAckReference-${index}" data-ack-field="acknowledgement_reference" value="${esc(current.acknowledgement_reference || '')}" maxlength="500" placeholder="ID сообщения, ссылка, номер комментария, дата звонка">

      <label class="small" for="pilotAckNote-${index}" style="display:block;margin-top:12px">Содержание ответа</label>
      <textarea id="pilotAckNote-${index}" data-ack-field="acknowledgement_note" rows="3" maxlength="1000" placeholder="Что именно подтвердил, отклонил или попросил уточнить ответственный">${esc(current.acknowledgement_note || '')}</textarea>

      <div class="status ${checked.valid ? 'ok' : 'warn'}" style="margin-top:12px"><b>${checked.valid ? 'Evidence заполнено.' : 'Пакет не готов.'}</b> ${checked.valid ? 'Исполнение всё ещё заблокировано до отдельного execution receipt.' : 'Заполните ответ, identity, время, канал и evidence.'}</div>
      ${checked.errors?.length ? `<details class="task-review-contract" open><summary>Что исправить</summary>${errorList(checked.errors, 'Ошибок нет.')}</details>` : ''}
    </fieldset>
  </article>`;
}

function validationBlock() {
  if (!confirmationValidation) return '';
  const summary = confirmationValidation.summary || {};
  return `<section class="card">
    <div class="section-title">
      <div><h2>Проверка owner start confirmation</h2><p class="muted">Файл: ${esc(importedFileName || 'без имени')} · проверен ${esc(fmtDateTime(confirmationValidation.validated_at))}</p></div>
      <span class="pill ${summary.fresh_revalidation_passed ? 'green' : 'red'}">${summary.fresh_revalidation_passed ? 'Пакет актуален' : 'Acknowledgement заблокирован'}</span>
    </div>
    <div class="kpi-row task-review-metrics" aria-label="Сводка проверки owner start confirmation">
      ${metric('Решений', n(summary.decisions), 'blue')}
      ${metric('Можно подтвердить', n(summary.authorized_ready), n(summary.authorized_ready) ? 'green' : 'yellow')}
      ${metric('Отклонено owner', n(summary.rejected_verified), 'gray')}
      ${metric('Устарело', n(summary.stale), n(summary.stale) ? 'red' : 'green')}
      ${metric('Истекло', n(summary.expired), n(summary.expired) ? 'red' : 'green')}
      ${metric('Некорректно', n(summary.invalid), n(summary.invalid) ? 'red' : 'green')}
    </div>
    <div class="status ${summary.confirmation_package_valid ? 'ok' : 'error'}"><b>Структура owner confirmation:</b> ${summary.confirmation_package_valid ? 'валидна' : 'невалидна'}.</div>
    <div class="status ${summary.fresh_revalidation_passed ? 'ok' : 'warn'}"><b>Fresh read-only revalidation:</b> ${summary.fresh_revalidation_passed ? 'пройдена' : 'не пройдена'}.</div>
    ${confirmationValidation.top_errors?.length ? `<details class="task-review-contract" open><summary>Ошибки пакета</summary>${errorList(confirmationValidation.top_errors, 'Ошибок нет.')}</details>` : ''}
    <div class="list">${(confirmationValidation.decisions || []).map((row) => `<article class="list-item">
      <div class="section-title"><div><h4>${esc(row.confirmation_snapshot?.deal_title || row.confirmation_snapshot?.address || row.deal_id)}</h4><p class="muted">${esc(laneLabel(row.lane))}</p></div><span class="pill ${stateTone(row.state)}">${esc(stateLabel(row.state))}</span></div>
      <details class="task-review-contract"${row.changes?.length ? ' open' : ''}><summary>Сравнение со свежей карточкой</summary>${changeRows(row.changes)}</details>
    </article>`).join('')}</div>
  </section>`;
}

function acknowledgementBlock() {
  if (!confirmationValidation?.summary?.responsible_acknowledgement_capture_available) return '';
  const summary = summarizeResponsibleAcknowledgement(confirmationValidation, acknowledgementState, profile());
  return `<section class="card">
    <div class="section-title">
      <div><h2>Пакет evidence ответственного</h2><p class="muted">Зафиксируйте внешний факт согласия, отказа или запроса уточнения для каждого owner-authorized действия.</p></div>
      <span class="pill ${summary.acknowledgement_package_ready ? 'green' : 'yellow'}">${summary.acknowledgement_package_ready ? 'Evidence-пакет готов' : 'Нужно заполнение'}</span>
    </div>
    <div class="kpi-row task-review-metrics" aria-label="Сводка acknowledgement evidence">
      ${metric('Действий', n(summary.actions), 'blue')}
      ${metric('Подтвердили', n(summary.acknowledged), n(summary.acknowledged) ? 'green' : 'yellow')}
      ${metric('Отказались', n(summary.rejected), n(summary.rejected) ? 'red' : 'green')}
      ${metric('Нужно уточнение', n(summary.needs_clarification), n(summary.needs_clarification) ? 'yellow' : 'green')}
      ${metric('Ошибок', n(summary.invalid), n(summary.invalid) ? 'red' : 'green')}
    </div>
    <div class="status ${summary.acknowledgement_package_ready ? 'ok' : 'warn'}"><b>${summary.acknowledgement_package_ready ? 'Evidence-пакет можно выгрузить.' : 'Пакет пока не готов.'}</b> Даже готовый файл содержит <code>execution_authorized=false</code> и <code>pilot_started=false</code>.</div>
    <div class="status warn"><b>Граница.</b> Запись сделана owner/admin и не доказывает authenticated self-action. Для реального исполнения требуется отдельный execution receipt и текущая server revalidation.</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" type="button" id="downloadPilotResponsibleAcknowledgement"${summary.actions ? '' : ' disabled'}>Скачать evidence JSON</button>
      <button class="btn light" type="button" id="downloadPilotOwnerStartValidation">Скачать проверку owner confirmation</button>
      <button class="btn light" type="button" id="clearPilotResponsibleAcknowledgement">Очистить файл</button>
    </div>
  </section>
  <section class="card">
    <div class="section-title"><div><h2>Owner-authorized действия</h2><p class="muted">Поля существуют только в памяти страницы и исчезнут после перезагрузки.</p></div><span class="pill blue">${availableRows().length}</span></div>
    <div class="list">${availableRows().map(acknowledgementCard).join('')}</div>
  </section>`;
}

function uploadBlock() {
  return `<section class="card">
    <div class="section-title">
      <div><h2>Загрузить owner start confirmation</h2><p class="muted">Принимается файл <code>navigator_v2_operational_pilot_owner_start_confirmation</code>.</p></div>
      <span class="pill blue">До 2 МБ</span>
    </div>
    <div class="status warn"><b>Файл остаётся локально.</b> Он читается только в памяти браузера и не отправляется в Supabase.</div>
    <label for="pilotOwnerStartConfirmationFile"><b>JSON-файл owner confirmation</b></label>
    <input id="pilotOwnerStartConfirmationFile" type="file" accept="application/json,.json">
    <p class="muted">Система повторно проверит версии, shortlist key, owner authorization, сроки и текущие deal/lane данные.</p>
  </section>`;
}

function draw() {
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero">
      <span class="role-home-eyebrow">Evidence ответственного</span>
      <h1>Зафиксировать согласие, отказ или запрос уточнения</h1>
      <p>Загрузите owner start confirmation, подтвердите его свежесть и сформируйте локальный evidence-пакет. Это не authenticated self-acknowledgement и не запуск действия.</p>
    </section>

    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${noticeText ? `<div class="status ${noticeTone}" role="status">${esc(noticeText)}</div>` : ''}

    ${freshReport ? `<div class="status ok" role="status"><b>Свежий read-only источник загружен.</b> Report v${n(freshReport.report_version)}, pilot v${n(pilot().pilot_version)}, ${pilot().items?.length || 0} карточки, сформирован ${esc(fmtDateTime(freshReport.generated_at))}.</div>
      ${uploadBlock()}
      ${validationBlock()}
      ${acknowledgementBlock()}
      <section class="card"><div class="actions" style="justify-content:flex-start"><a class="btn light" href="./operational-pilot-start-confirmation-v2.html">Вернуться к owner confirmation</a><a class="btn light" href="./operational-adoption-v2.html">Вернуться к отчёту</a></div></section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Загружаю свежий read-only shortlist…' : 'Свежий отчёт не загружен.'}</p></section>`}
  </main>`;

  document.getElementById('pilotOwnerStartConfirmationFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importConfirmation(file);
  });

  document.querySelectorAll('[data-ack-deal]').forEach((card) => {
    const dealId = card.dataset.ackDeal;
    card.querySelectorAll('[data-ack-field]').forEach((field) => {
      field.addEventListener('change', () => {
        let value = field.value;
        if (field.dataset.ackField === 'acknowledged_at' && value) {
          const parsed = new Date(value);
          value = Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
        }
        acknowledgementState = updateResponsibleAcknowledgementState(
          acknowledgementState,
          dealId,
          { [field.dataset.ackField]: value }
        );
        noticeText = '';
        draw();
      });
    });
  });

  document.getElementById('downloadPilotResponsibleAcknowledgement')?.addEventListener('click', () => {
    const payload = buildResponsibleAcknowledgementPackage(confirmationValidation, acknowledgementState, profile());
    downloadJson(payload, `navigator-v2-operational-pilot-responsible-acknowledgement-${dateStamp()}.json`);
    noticeTone = payload.summary.acknowledgement_package_ready ? 'ok' : 'warn';
    noticeText = payload.summary.acknowledgement_package_ready
      ? 'Evidence-пакет скачан. Он не разрешает исполнение и не изменяет Supabase.'
      : 'Скачан черновой evidence-пакет с acknowledgement_package_ready=false.';
    draw();
  });

  document.getElementById('downloadPilotOwnerStartValidation')?.addEventListener('click', () => {
    downloadJson(confirmationValidation, `navigator-v2-operational-pilot-owner-start-confirmation-validation-${dateStamp()}.json`);
    noticeTone = 'ok';
    noticeText = 'Проверка owner start confirmation скачана. Рабочие данные не менялись.';
    draw();
  });

  document.getElementById('clearPilotResponsibleAcknowledgement')?.addEventListener('click', () => {
    importedConfirmation = null;
    confirmationValidation = null;
    acknowledgementState = {};
    importedFileName = '';
    noticeTone = 'info';
    noticeText = 'Локальный owner confirmation и evidence-пакет очищены. Supabase не изменялся.';
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

async function importConfirmation(file) {
  errorText = '';
  noticeText = '';
  if (file.size > MAX_FILE_BYTES) {
    errorText = 'Файл превышает допустимый размер 2 МБ.';
    draw();
    return;
  }
  try {
    importedConfirmation = JSON.parse(await file.text());
    importedFileName = file.name;
    confirmationValidation = validateOwnerStartConfirmation(importedConfirmation, freshReport);
    acknowledgementState = confirmationValidation.summary?.responsible_acknowledgement_capture_available
      ? createResponsibleAcknowledgementState(confirmationValidation)
      : {};
    noticeTone = confirmationValidation.summary?.responsible_acknowledgement_capture_available ? 'ok' : 'warn';
    noticeText = confirmationValidation.summary?.responsible_acknowledgement_capture_available
      ? 'Owner start confirmation актуален. Можно зафиксировать evidence ответственного.'
      : 'Owner start confirmation проверен, но acknowledgement evidence заблокирован.';
  } catch (error) {
    importedConfirmation = null;
    confirmationValidation = null;
    acknowledgementState = {};
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
    if (!allowed()) throw new Error('Пакет evidence ответственного доступен только владельцу и администратору.');
  } catch (error) {
    freshReport = null;
    errorText = error.message || String(error);
  } finally {
    busy = false;
    draw();
  }
}

const user = getCachedUser();
setupTop({ user, title: 'Evidence ответственного', subtitle: 'Owner/admin · browser-local · не self-acknowledgement' });
if (!user) {
  renderAuthBox(app, { title: 'Нужен вход', text: 'Войдите под владельцем или администратором, чтобы проверить owner start confirmation.' });
} else {
  void loadFreshReport();
}
