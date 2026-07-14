import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';
import {
  buildOwnerStartConfirmationPackage,
  createOwnerStartState,
  summarizeOwnerStartConfirmation,
  updateOwnerStartState,
  validatePilotActionChecklist
} from './operational-pilot-start-confirmation-model-v2.js';

const app = document.getElementById('app');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
let freshReport = null;
let importedChecklist = null;
let checklistValidation = null;
let decisionState = {};
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
  return Array.isArray(checklistValidation?.actions)
    ? checklistValidation.actions.filter((row) => row.state === 'fresh_ready_for_owner_start')
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
    fresh_ready_for_owner_start: 'Checklist актуален',
    stale: 'Checklist устарел',
    invalid: 'Checklist некорректен'
  })[state] || state || 'Не проверено';
}

function stateTone(state) {
  return ({ fresh_ready_for_owner_start: 'green', stale: 'red', invalid: 'red' })[state] || 'gray';
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
  if (!rows.length) return '<div class="status ok"><b>Свежесть подтверждена.</b> Контролируемые поля checklist не изменились.</div>';
  return `<div class="list">${rows.map((change) => `<article class="list-item">
    <div class="section-title"><div><h4><code>${esc(change.field)}</code></h4></div><span class="pill red">Изменено</span></div>
    <div class="task-review-facts">
      <div><span class="small">В checklist</span><b>${esc(valueText(change.checklist_value))}</b></div>
      <div><span class="small">Сейчас</span><b>${esc(valueText(change.fresh_value))}</b></div>
    </div>
  </article>`).join('')}</div>`;
}

function currentDecision(row) {
  return decisionState?.[row.deal_id] || {};
}

function decisionSummaryRow(dealId) {
  const summary = summarizeOwnerStartConfirmation(checklistValidation, decisionState, profile());
  return summary.decision_rows.find((row) => row.deal_id === dealId) || { errors: [], valid: false };
}

function decisionCard(row, index) {
  const snapshot = row.checklist_snapshot || {};
  const action = snapshot.action || {};
  const decision = currentDecision(row);
  const checked = decisionSummaryRow(row.deal_id);
  const authorized = decision.decision === 'authorized';
  return `<article class="list-item task-review-card" data-start-deal="${esc(row.deal_id)}">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${laneTone(row.lane)}">${esc(laneLabel(row.lane))}</span>
          <span class="pill ${checked.valid ? 'green' : 'yellow'}">${checked.valid ? 'Решение заполнено' : 'Нужны поля'}</span>
        </div>
        <h3>${esc(snapshot.deal_title || snapshot.address || row.deal_id)}</h3>
        <p class="muted">${esc(snapshot.address || 'Адрес не указан')} · <code>${esc(row.deal_id)}</code></p>
      </div>
      <span class="pill ${stateTone(row.state)}">${esc(stateLabel(row.state))}</span>
    </div>

    <div class="status info"><b>Запланированное действие:</b> ${esc(action.action_title || 'Не указано')}</div>
    <div class="task-review-facts">
      <div><span class="small">Объект</span><b>${esc(action.action_reference || 'Не указан')}</b></div>
      <div><span class="small">Ответственный</span><b>${esc(action.responsible_name_or_role || 'Не указан')}</b></div>
      <div><span class="small">Срок действия</span><b>${esc(fmtDateTime(action.due_at))}</b></div>
      <div><span class="small">Evidence</span><b>${esc(action.evidence_type || 'Не указан')}</b></div>
    </div>
    <details class="task-review-contract"><summary>Ожидаемый результат и следующий шаг</summary>
      <div class="status ok"><b>Результат:</b> ${esc(action.expected_result || 'Не указан')}</div>
      <div class="status info"><b>Evidence:</b> ${esc(action.evidence_requirement || 'Не указано')}</div>
      <div class="status info"><b>Следующий шаг:</b> ${esc(action.next_step || 'Не указан')}</div>
      <div class="status warn"><b>Основание плана:</b> ${esc(action.planning_note || 'Не указано')}</div>
    </details>

    <fieldset class="task-review-contract" style="margin-top:16px">
      <legend><b>Решение владельца</b></legend>
      <label class="small" for="pilotStartDecision-${index}">Решение</label>
      <select id="pilotStartDecision-${index}" data-start-field="decision">
        <option value="">Выберите решение</option>
        <option value="authorized"${decision.decision === 'authorized' ? ' selected' : ''}>Разрешить ручной запуск</option>
        <option value="rejected"${decision.decision === 'rejected' ? ' selected' : ''}>Отклонить действие</option>
      </select>

      <label class="small" for="pilotStartNote-${index}" style="display:block;margin-top:12px">Основание решения</label>
      <textarea id="pilotStartNote-${index}" data-start-field="authorization_note" rows="3" maxlength="1000" placeholder="Почему действие разрешено или отклонено">${esc(decision.authorization_note || '')}</textarea>

      <label class="small" for="pilotStartExpires-${index}" style="display:block;margin-top:12px">Разрешение действует до</label>
      <input id="pilotStartExpires-${index}" type="datetime-local" data-start-field="authorization_expires_at" value="${esc(inputDateTime(decision.authorization_expires_at))}"${authorized ? '' : ' disabled'}>
      <p class="muted">Для разрешённого действия срок подтверждения должен быть в будущем и не позже срока самого действия.</p>

      <div class="status ${checked.valid ? 'ok' : 'warn'}" style="margin-top:12px"><b>${checked.valid ? 'Решение заполнено.' : 'Подтверждение не готово.'}</b> ${checked.valid ? 'Пакет можно сформировать, но действие ещё не начато.' : 'Выберите решение и заполните обязательные поля.'}</div>
      ${checked.errors?.length ? `<details class="task-review-contract" open><summary>Что исправить</summary>${errorList(checked.errors, 'Ошибок нет.')}</details>` : ''}
    </fieldset>
  </article>`;
}

function validationBlock() {
  if (!checklistValidation) return '';
  const summary = checklistValidation.summary || {};
  const packageValid = summary.checklist_package_valid === true;
  const revalidated = summary.fresh_revalidation_passed === true;
  return `<section class="card">
    <div class="section-title">
      <div><h2>Проверка action checklist</h2><p class="muted">Файл: ${esc(importedFileName || 'без имени')} · проверен ${esc(fmtDateTime(checklistValidation.validated_at))}</p></div>
      <span class="pill ${revalidated ? 'green' : 'red'}">${revalidated ? 'Checklist актуален' : 'Старт заблокирован'}</span>
    </div>
    <div class="kpi-row task-review-metrics" aria-label="Сводка проверки action checklist">
      ${metric('Действий', n(summary.actions), 'blue')}
      ${metric('Актуально', n(summary.fresh), n(summary.fresh) ? 'green' : 'yellow')}
      ${metric('Устарело', n(summary.stale), n(summary.stale) ? 'red' : 'green')}
      ${metric('Некорректно', n(summary.invalid), n(summary.invalid) ? 'red' : 'green')}
      ${metric('Изменённых полей', n(summary.changed_fields), n(summary.changed_fields) ? 'red' : 'green')}
    </div>
    <div class="status ${packageValid ? 'ok' : 'error'}"><b>Структура checklist:</b> ${packageValid ? 'валидна' : 'невалидна'}.</div>
    <div class="status ${revalidated ? 'ok' : 'warn'}"><b>Fresh read-only revalidation:</b> ${revalidated ? 'пройдена' : 'не пройдена'}.</div>
    ${checklistValidation.top_errors?.length ? `<details class="task-review-contract" open><summary>Ошибки checklist</summary>${errorList(checklistValidation.top_errors, 'Ошибок нет.')}</details>` : ''}
    <div class="list">${(checklistValidation.actions || []).map((row) => `<article class="list-item">
      <div class="section-title"><div><h4>${esc(row.checklist_snapshot?.deal_title || row.checklist_snapshot?.address || row.deal_id)}</h4><p class="muted">${esc(laneLabel(row.lane))}</p></div><span class="pill ${stateTone(row.state)}">${esc(stateLabel(row.state))}</span></div>
      <details class="task-review-contract"${row.changes?.length ? ' open' : ''}><summary>Сравнение checklist со свежей карточкой</summary>${changeRows(row.changes)}</details>
    </article>`).join('')}</div>
  </section>`;
}

function confirmationBlock() {
  if (!checklistValidation?.summary?.owner_start_confirmation_available) return '';
  const summary = summarizeOwnerStartConfirmation(checklistValidation, decisionState, profile());
  return `<section class="card">
    <div class="section-title">
      <div><h2>Owner start confirmation</h2><p class="muted">Рассмотрите каждое действие и разрешите ручной запуск либо отклоните его.</p></div>
      <span class="pill ${summary.decision_package_ready ? 'green' : 'yellow'}">${summary.decision_package_ready ? 'Решение готово' : 'Нужно заполнение'}</span>
    </div>
    <div class="kpi-row task-review-metrics" aria-label="Сводка owner start confirmation">
      ${metric('Действий', n(summary.actions), 'blue')}
      ${metric('Разрешено', n(summary.authorized), n(summary.authorized) ? 'green' : 'yellow')}
      ${metric('Отклонено', n(summary.rejected), n(summary.rejected) ? 'yellow' : 'green')}
      ${metric('Нужно исправить', n(summary.invalid), n(summary.invalid) ? 'red' : 'green')}
      ${metric('Автор owner/admin', summary.actor_allowed ? 'да' : 'нет', summary.actor_allowed ? 'green' : 'red')}
    </div>
    <div class="status ${summary.pilot_start_authorized ? 'ok' : 'warn'}"><b>${summary.pilot_start_authorized ? 'Владелец разрешил ручной запуск минимум одного действия.' : 'Ручной запуск не разрешён.'}</b> В любом случае <code>pilot_started=false</code>.</div>
    <div class="status warn"><b>Граница.</b> Этот JSON не создаёт задачи и не запускает действие. До исполнения требуется отдельное подтверждение ответственного; после исполнения — evidence и результат.</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" type="button" id="downloadPilotStartConfirmation"${summary.actions ? '' : ' disabled'}>Скачать owner confirmation JSON</button>
      <button class="btn light" type="button" id="downloadPilotChecklistValidation">Скачать проверку checklist</button>
      <button class="btn light" type="button" id="clearPilotStartConfirmation">Очистить файл</button>
    </div>
  </section>
  <section class="card">
    <div class="section-title"><div><h2>Решения по действиям</h2><p class="muted">Поля существуют только в памяти страницы и исчезнут после перезагрузки.</p></div><span class="pill blue">${availableRows().length}</span></div>
    <div class="list">${availableRows().map(decisionCard).join('')}</div>
  </section>`;
}

function uploadBlock() {
  return `<section class="card">
    <div class="section-title">
      <div><h2>Загрузить action checklist</h2><p class="muted">Принимается файл <code>navigator_v2_operational_pilot_action_checklist</code> с <code>checklist_ready=true</code>.</p></div>
      <span class="pill blue">До 2 МБ</span>
    </div>
    <div class="status warn"><b>Файл остаётся локально.</b> Он читается только в памяти браузера и не отправляется в Supabase.</div>
    <label for="pilotActionChecklistFile"><b>JSON-файл checklist</b></label>
    <input id="pilotActionChecklistFile" type="file" accept="application/json,.json">
    <p class="muted">Система повторно сравнит версии, shortlist key, метрики, ответственность, срок действия и safety markers со свежим read-only отчётом.</p>
  </section>`;
}

function draw() {
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero">
      <span class="role-home-eyebrow">Явное решение владельца</span>
      <h1>Разрешение на ручной старт пилотного действия</h1>
      <p>Загрузите готовый action checklist, подтвердите его свежесть и примите решение по каждому действию. Серверные данные не изменяются.</p>
    </section>

    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${noticeText ? `<div class="status ${noticeTone}" role="status">${esc(noticeText)}</div>` : ''}

    ${freshReport ? `<div class="status ok" role="status"><b>Свежий read-only источник загружен.</b> Report v${n(freshReport.report_version)}, pilot v${n(pilot().pilot_version)}, ${pilot().items?.length || 0} карточки, сформирован ${esc(fmtDateTime(freshReport.generated_at))}.</div>
      ${uploadBlock()}
      ${validationBlock()}
      ${confirmationBlock()}
      <section class="card"><div class="actions" style="justify-content:flex-start"><a class="btn light" href="./operational-pilot-action-checklist-v2.html">Вернуться к action checklist</a><a class="btn light" href="./operational-adoption-v2.html">Вернуться к отчёту</a></div></section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Загружаю свежий read-only shortlist…' : 'Свежий отчёт не загружен.'}</p></section>`}
  </main>`;

  document.getElementById('pilotActionChecklistFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importChecklist(file);
  });

  document.querySelectorAll('[data-start-deal]').forEach((card) => {
    const dealId = card.dataset.startDeal;
    card.querySelectorAll('[data-start-field]').forEach((field) => {
      field.addEventListener('change', () => {
        let value = field.value;
        if (field.dataset.startField === 'authorization_expires_at' && value) {
          const parsed = new Date(value);
          value = Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
        }
        const patch = { [field.dataset.startField]: value };
        if (field.dataset.startField === 'decision' && value !== 'authorized') patch.authorization_expires_at = '';
        decisionState = updateOwnerStartState(decisionState, dealId, patch);
        noticeText = '';
        draw();
      });
    });
  });

  document.getElementById('downloadPilotStartConfirmation')?.addEventListener('click', () => {
    const payload = buildOwnerStartConfirmationPackage(checklistValidation, decisionState, profile());
    downloadJson(payload, `navigator-v2-operational-pilot-owner-start-confirmation-${dateStamp()}.json`);
    noticeTone = payload.summary.decision_package_ready ? 'ok' : 'warn';
    noticeText = payload.summary.decision_package_ready
      ? 'Owner start confirmation скачан. Он не выполняет server mutation и не запускает действие автоматически.'
      : 'Скачан черновой owner confirmation с decision_package_ready=false.';
    draw();
  });

  document.getElementById('downloadPilotChecklistValidation')?.addEventListener('click', () => {
    downloadJson(checklistValidation, `navigator-v2-operational-pilot-action-checklist-validation-${dateStamp()}.json`);
    noticeTone = 'ok';
    noticeText = 'Проверка action checklist скачана. Рабочие данные не менялись.';
    draw();
  });

  document.getElementById('clearPilotStartConfirmation')?.addEventListener('click', () => {
    importedChecklist = null;
    checklistValidation = null;
    decisionState = {};
    importedFileName = '';
    noticeTone = 'info';
    noticeText = 'Локальный checklist и owner confirmation очищены. Supabase не изменялся.';
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

async function importChecklist(file) {
  errorText = '';
  noticeText = '';
  if (file.size > MAX_FILE_BYTES) {
    errorText = 'Файл превышает допустимый размер 2 МБ.';
    draw();
    return;
  }
  try {
    importedChecklist = JSON.parse(await file.text());
    importedFileName = file.name;
    checklistValidation = validatePilotActionChecklist(importedChecklist, freshReport);
    decisionState = checklistValidation.summary?.owner_start_confirmation_available
      ? createOwnerStartState(checklistValidation)
      : {};
    noticeTone = checklistValidation.summary?.owner_start_confirmation_available ? 'ok' : 'warn';
    noticeText = checklistValidation.summary?.owner_start_confirmation_available
      ? 'Action checklist актуален. Можно принять owner start decision.'
      : 'Checklist проверен, но owner start confirmation заблокирован.';
  } catch (error) {
    importedChecklist = null;
    checklistValidation = null;
    decisionState = {};
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
    if (!allowed()) throw new Error('Owner start confirmation доступен только владельцу и администратору.');
  } catch (error) {
    freshReport = null;
    errorText = error.message || String(error);
  } finally {
    busy = false;
    draw();
  }
}

const user = getCachedUser();
setupTop({ user, title: 'Подтверждение старта пилота', subtitle: 'Owner/admin · browser-local · без mutation' });
if (!user) {
  renderAuthBox(app, { title: 'Нужен вход', text: 'Войдите под владельцем или администратором, чтобы проверить action checklist.' });
} else {
  void loadFreshReport();
}
