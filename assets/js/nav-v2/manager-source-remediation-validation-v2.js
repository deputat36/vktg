import { getCachedUser, rpc, esc } from './supabase-v2.js';

const CONTAINER_ID = 'confirmation-package-validation';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
let currentReport = null;
let importedPackage = null;
let validationResult = null;
let loading = false;
let statusText = 'Выберите JSON, выгруженный из локального листа подтверждений.';
let statusTone = 'info';

function n(value) { return Number(value || 0); }
function normalizeId(value) { return value ? String(value) : null; }
function evidenceItems() { return Array.isArray(currentReport?.responsibility_evidence?.items) ? currentReport.responsibility_evidence.items : []; }
function confirmationContext() { return currentReport?.responsibility_confirmation_context || {}; }
function activeSpnOptions() { return Array.isArray(confirmationContext().active_spn_options) ? confirmationContext().active_spn_options : []; }
function managerOptions() { return Array.isArray(confirmationContext().manager_options) ? confirmationContext().manager_options : []; }
function reportAllowed() { return ['owner', 'admin', 'manager'].includes(currentReport?.profile?.role); }

function fmtDateTime(value) {
  if (!value) return 'не указано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function stateTone(state) {
  return ({ ready: 'green', stale: 'red', invalid: 'red', not_ready: 'yellow', no_change: 'gray' })[state] || 'gray';
}

function stateLabel(state) {
  return ({
    ready: 'Готово к одной точечной операции',
    stale: 'Исходные данные изменились',
    invalid: 'Некорректное решение',
    not_ready: 'Не подтверждено',
    no_change: 'Изменение отсутствует'
  })[state] || state;
}

function packageTopErrors(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) errors.push('Корневое значение JSON должно быть объектом.');
  if (payload?.export_type !== 'navigator_v2_responsibility_confirmation_draft') errors.push('Неверный export_type.');
  if (![1, 2].includes(Number(payload?.schema_version))) errors.push('Поддерживаются schema_version 1 и 2.');
  if (!Array.isArray(payload?.deal_decisions)) errors.push('deal_decisions должен быть массивом.');
  if (!Array.isArray(payload?.manager_decisions)) errors.push('manager_decisions должен быть массивом.');
  if (payload?.safety?.server_mutation_available !== false) errors.push('В файле отсутствует обязательный safety marker server_mutation_available=false.');
  if (payload?.safety?.requires_separate_audited_point_operation !== true) errors.push('Файл не требует отдельную аудируемую точечную операцию.');
  return errors;
}

function operationBase(type, recordIndex, targetId, field, currentId, proposedId, note) {
  return {
    type,
    record_index: recordIndex,
    target_id: targetId || null,
    field,
    expected_current_id: normalizeId(currentId),
    proposed_id: normalizeId(proposedId),
    note: String(note || '').trim(),
    state: 'invalid',
    reasons: []
  };
}

function validateDealRecord(row, index, dealMap, spnMap) {
  const operations = [];
  if (!row || typeof row !== 'object') {
    return [{ ...operationBase('deal_spn', index, null, null, null, null, ''), reasons: ['Строка решения по сделке не является объектом.'] }];
  }
  const live = dealMap.get(String(row.deal_id || ''));
  if (!live) {
    return [{ ...operationBase('deal_spn', index, row.deal_id, null, null, null, row.note), state: 'stale', reasons: ['Сделка отсутствует в свежем read-only отчёте.'] }];
  }

  const definitions = [
    {
      field: 'seller_spn_id',
      currentExport: row.current_seller_spn_id,
      currentLive: live.seller_spn_id,
      proposed: row.proposed_seller_spn_id,
      proposedName: row.proposed_seller_spn_name
    },
    {
      field: 'buyer_spn_id',
      currentExport: row.current_buyer_spn_id,
      currentLive: live.buyer_spn_id,
      proposed: row.proposed_buyer_spn_id,
      proposedName: row.proposed_buyer_spn_name
    }
  ];

  definitions.forEach((definition) => {
    const proposed = normalizeId(definition.proposed);
    const liveCurrent = normalizeId(definition.currentLive);
    const exportCurrent = normalizeId(definition.currentExport);
    if (!proposed || proposed === liveCurrent) return;

    const operation = operationBase('deal_spn', index, row.deal_id, definition.field, exportCurrent, proposed, row.note);
    operation.target_title = row.deal_title || live.deal_title || row.address || 'Сделка';
    operation.proposed_name = definition.proposedName || spnMap.get(proposed)?.full_name || spnMap.get(proposed)?.email || null;
    operation.state = 'ready';

    if (exportCurrent !== liveCurrent) {
      operation.state = 'stale';
      operation.reasons.push(`Текущее значение ${definition.field} изменилось после экспорта.`);
    }
    if (!spnMap.has(proposed)) {
      operation.state = 'invalid';
      operation.reasons.push('Предлагаемый СПН отсутствует в свежем каталоге активных СПН.');
    }
    if (row.decision_status !== 'confirmed') {
      if (operation.state === 'ready') operation.state = 'not_ready';
      operation.reasons.push('Статус решения должен быть confirmed.');
    }
    if (!operation.note) {
      if (operation.state === 'ready') operation.state = 'not_ready';
      operation.reasons.push('Для точечной операции требуется комментарий-основание.');
    }
    operations.push(operation);
  });

  if (!operations.length) {
    operations.push({
      ...operationBase('deal_spn', index, row.deal_id, null, null, null, row.note),
      target_title: row.deal_title || live.deal_title || row.address || 'Сделка',
      state: 'no_change',
      reasons: ['Предлагаемые значения не отличаются от текущих либо не выбраны.']
    });
  }
  return operations;
}

function validateManagerRecord(row, index, spnMap, managerMap) {
  if (!row || typeof row !== 'object') {
    return [{ ...operationBase('profile_manager', index, null, 'manager_id', null, null, ''), reasons: ['Строка manager_id не является объектом.'] }];
  }
  const spnId = normalizeId(row.spn_id);
  const liveSpn = spnMap.get(spnId);
  if (!liveSpn) {
    return [{ ...operationBase('profile_manager', index, spnId, 'manager_id', row.current_manager_id, row.proposed_manager_id, row.note), state: 'stale', reasons: ['Профиль СПН отсутствует в свежем каталоге.'] }];
  }
  const proposed = normalizeId(row.proposed_manager_id);
  const liveCurrent = normalizeId(liveSpn.manager_id);
  const exportCurrent = normalizeId(row.current_manager_id);
  if (!proposed || proposed === liveCurrent) {
    return [{
      ...operationBase('profile_manager', index, spnId, 'manager_id', exportCurrent, proposed, row.note),
      target_title: row.spn_name || liveSpn.full_name || liveSpn.email || 'СПН',
      state: 'no_change',
      reasons: ['Предлагаемый manager_id не отличается от текущего либо не выбран.']
    }];
  }

  const operation = operationBase('profile_manager', index, spnId, 'manager_id', exportCurrent, proposed, row.note);
  operation.target_title = row.spn_name || liveSpn.full_name || liveSpn.email || 'СПН';
  operation.proposed_name = row.proposed_manager_name || managerMap.get(proposed)?.full_name || managerMap.get(proposed)?.email || null;
  operation.state = 'ready';
  if (exportCurrent !== liveCurrent) {
    operation.state = 'stale';
    operation.reasons.push('Текущий manager_id изменился после экспорта.');
  }
  if (!managerMap.has(proposed)) {
    operation.state = 'invalid';
    operation.reasons.push('Предлагаемый менеджер отсутствует в свежем каталоге допустимых owner/admin/manager.');
  }
  if (row.decision_status !== 'confirmed') {
    if (operation.state === 'ready') operation.state = 'not_ready';
    operation.reasons.push('Статус решения должен быть confirmed.');
  }
  if (!operation.note) {
    if (operation.state === 'ready') operation.state = 'not_ready';
    operation.reasons.push('Для точечной операции требуется комментарий-основание.');
  }
  return [operation];
}

function validatePackage(payload) {
  const topErrors = packageTopErrors(payload);
  const dealMap = new Map(evidenceItems().map((item) => [String(item.deal_id), item]));
  const spnMap = new Map(activeSpnOptions().map((item) => [String(item.id), item]));
  const managerMap = new Map(managerOptions().map((item) => [String(item.id), item]));
  const operations = [];

  if (!topErrors.length) {
    payload.deal_decisions.forEach((row, index) => operations.push(...validateDealRecord(row, index, dealMap, spnMap)));
    payload.manager_decisions.forEach((row, index) => operations.push(...validateManagerRecord(row, index, spnMap, managerMap)));
  }

  const summary = {
    records: n(payload?.deal_decisions?.length) + n(payload?.manager_decisions?.length),
    operations: operations.length,
    ready: operations.filter((item) => item.state === 'ready').length,
    stale: operations.filter((item) => item.state === 'stale').length,
    invalid: operations.filter((item) => item.state === 'invalid').length,
    not_ready: operations.filter((item) => item.state === 'not_ready').length,
    no_change: operations.filter((item) => item.state === 'no_change').length
  };
  const actionable = operations.filter((item) => item.state !== 'no_change');
  const pointReady = topErrors.length === 0
    && summary.ready === 1
    && summary.stale === 0
    && summary.invalid === 0
    && summary.not_ready === 0
    && actionable.length === 1;

  return {
    validation_version: 1,
    validated_at: new Date().toISOString(),
    source_report_version: currentReport?.report_version || null,
    source_report_generated_at: currentReport?.generated_at || null,
    package_exported_at: payload?.exported_at || null,
    package_schema_version: payload?.schema_version || null,
    top_errors: topErrors,
    summary,
    point_operation_ready: pointReady,
    operations
  };
}

function operationHtml(item) {
  return `<article class="list-item">
    <div class="section-title">
      <div><h4>${esc(item.target_title || item.target_id || 'Запись')}</h4><p class="muted"><code>${esc(item.field || 'нет поля')}</code> · ${esc(item.type)}</p></div>
      <span class="pill ${stateTone(item.state)}">${esc(stateLabel(item.state))}</span>
    </div>
    <div class="task-review-facts">
      <div><span class="small">Ожидается сейчас</span><b>${esc(item.expected_current_id || 'NULL')}</b></div>
      <div><span class="small">Предлагается</span><b>${esc(item.proposed_name || item.proposed_id || 'не выбрано')}</b></div>
    </div>
    ${item.note ? `<div class="status ok"><b>Основание:</b> ${esc(item.note)}</div>` : ''}
    ${item.reasons?.length ? `<ul>${item.reasons.map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul>` : ''}
  </article>`;
}

function validationSectionHtml() {
  const result = validationResult;
  const summary = result?.summary || {};
  const readyTone = result?.point_operation_ready ? 'green' : result ? 'yellow' : 'gray';
  return `<section class="list-item" id="${CONTAINER_ID}" aria-label="Проверка импортированного пакета подтверждений">
    <div class="section-title">
      <div><h3>Проверка JSON перед точечной операцией</h3><p class="muted">Импорт сравнивается со свежим read-only отчётом. Серверные данные не изменяются.</p></div>
      <span class="pill ${readyTone}">${result?.point_operation_ready ? 'Ровно одна операция готова' : 'Запись в БД отключена'}</span>
    </div>
    <div id="confirmationValidationStatus" class="status ${esc(statusTone)}">${esc(statusText)}</div>
    <div class="actions" style="justify-content:flex-start">
      <input id="confirmationPackageFile" type="file" accept="application/json,.json" hidden>
      <button class="btn primary" id="chooseConfirmationPackage" type="button">Выбрать JSON для проверки</button>
      ${result ? '<button class="btn" id="downloadValidationReport" type="button">Скачать отчёт проверки</button>' : ''}
      ${result?.point_operation_ready ? '<button class="btn green" id="copyPointOperation" type="button">Копировать готовую операцию</button>' : ''}
      ${importedPackage ? '<button class="btn red" id="clearImportedPackage" type="button">Убрать импорт</button>' : ''}
    </div>
    ${result ? `<div class="kpi-row task-review-metrics" aria-label="Результат проверки пакета">
      <div class="metric blue"><span>Строк пакета</span><b>${n(summary.records)}</b></div>
      <div class="metric green"><span>Готово</span><b>${n(summary.ready)}</b></div>
      <div class="metric red"><span>Устарело</span><b>${n(summary.stale)}</b></div>
      <div class="metric red"><span>Некорректно</span><b>${n(summary.invalid)}</b></div>
      <div class="metric yellow"><span>Не подтверждено</span><b>${n(summary.not_ready)}</b></div>
      <div class="metric gray"><span>Без изменений</span><b>${n(summary.no_change)}</b></div>
    </div>
    ${result.top_errors.length ? `<div class="status error"><b>Файл отклонён:</b><ul>${result.top_errors.map((error) => `<li>${esc(error)}</li>`).join('')}</ul></div>` : ''}
    <div class="status ${result.point_operation_ready ? 'ok' : 'warn'}"><b>Вердикт:</b> ${result.point_operation_ready ? 'Пакет содержит ровно одну свежую, подтверждённую и однозначную точечную операцию.' : 'Пакет нельзя использовать как основание для автоматической записи. Исправьте неоднозначности или выберите одну операцию.'}</div>
    <p class="muted">Экспорт: ${esc(fmtDateTime(result.package_exported_at))}. Проверка: ${esc(fmtDateTime(result.validated_at))}. Свежий отчёт: версия ${n(result.source_report_version)}, ${esc(fmtDateTime(result.source_report_generated_at))}.</p>
    <div class="list">${result.operations.map(operationHtml).join('') || '<div class="empty">Операции в файле не найдены.</div>'}</div>` : '<div class="empty">Файл ещё не загружен.</div>'}
  </section>`;
}

function mountSection() {
  const host = document.getElementById('confirmation-draft');
  if (!host) return;
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) existing.outerHTML = validationSectionHtml();
  else host.insertAdjacentHTML('beforeend', validationSectionHtml());
  bindEvents();
}

function setStatus(text, tone = 'info') {
  statusText = text;
  statusTone = tone;
  mountSection();
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validationExportPayload() {
  return {
    export_type: 'navigator_v2_responsibility_confirmation_validation',
    schema_version: 1,
    validated_by_user_id: getCachedUser()?.id || null,
    safety: {
      read_only_validation: true,
      server_mutation_available: false,
      requires_separate_audited_point_operation: true
    },
    package: importedPackage,
    validation: validationResult
  };
}

function downloadValidationReport() {
  const payload = validationExportPayload();
  downloadText(`navigator-responsibility-validation-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(payload, null, 2)}\n`, 'application/json;charset=utf-8');
  setStatus('Отчёт проверки скачан. Никакая операция в Supabase не выполнялась.', 'ok');
}

async function copyPointOperation() {
  const operation = validationResult?.point_operation_ready ? validationResult.operations.find((item) => item.state === 'ready') : null;
  if (!operation) return setStatus('Ровно одна готовая операция не определена.', 'warn');
  const text = [
    'Navigator v2 — подтверждённая точечная операция',
    `Тип: ${operation.type}`,
    `Цель: ${operation.target_title || operation.target_id}`,
    `ID: ${operation.target_id}`,
    `Поле: ${operation.field}`,
    `Ожидаемое текущее значение: ${operation.expected_current_id || 'NULL'}`,
    `Предлагаемое значение: ${operation.proposed_id}`,
    `Предлагаемое имя: ${operation.proposed_name || 'не указано'}`,
    `Основание: ${operation.note}`,
    'Запись в БД не выполнялась; требуется отдельная audited point correction.'
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Готовая точечная операция скопирована. Серверные данные не изменены.', 'ok');
  } catch (error) {
    setStatus(`Не удалось скопировать операцию: ${error.message || error}`, 'error');
  }
}

function clearImportedPackage() {
  importedPackage = null;
  validationResult = null;
  setStatus('Импортированный файл удалён из памяти страницы.', 'ok');
}

async function readPackageFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) return setStatus('Файл больше 2 МБ и отклонён.', 'error');
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    importedPackage = payload;
    validationResult = validatePackage(payload);
    const summary = validationResult.summary;
    setStatus(
      validationResult.point_operation_ready
        ? 'Файл свежий и содержит ровно одну готовую точечную операцию.'
        : `Проверка завершена: готово ${summary.ready}, устарело ${summary.stale}, некорректно ${summary.invalid}, не подтверждено ${summary.not_ready}.`,
      validationResult.point_operation_ready ? 'ok' : 'warn'
    );
  } catch (error) {
    importedPackage = null;
    validationResult = null;
    setStatus(`JSON не прочитан: ${error.message || error}`, 'error');
  }
}

function bindEvents() {
  const input = document.getElementById('confirmationPackageFile');
  document.getElementById('chooseConfirmationPackage')?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    readPackageFile(file);
    input.value = '';
  });
  document.getElementById('downloadValidationReport')?.addEventListener('click', downloadValidationReport);
  document.getElementById('copyPointOperation')?.addEventListener('click', copyPointOperation);
  document.getElementById('clearImportedPackage')?.addEventListener('click', clearImportedPackage);
}

async function loadFreshReport() {
  if (loading || !getCachedUser()) return;
  loading = true;
  setStatus('Получаю свежий read-only отчёт для проверки пакета…', 'info');
  try {
    currentReport = await rpc('nav_v2_get_operational_adoption_report', { p_days: 30, p_limit: 500 }, 30000);
    if (!reportAllowed()) throw new Error('Проверка пакета доступна владельцу, администратору и менеджеру.');
    setStatus('Свежий read-only отчёт загружен. Выберите JSON для проверки.', 'ok');
  } catch (error) {
    currentReport = null;
    setStatus(`Свежий отчёт недоступен: ${error.message || error}`, 'error');
  } finally {
    loading = false;
    mountSection();
  }
}

const observer = new MutationObserver(() => {
  if (document.getElementById('confirmation-draft') && !document.getElementById(CONTAINER_ID)) mountSection();
});
observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
mountSection();
loadFreshReport();
