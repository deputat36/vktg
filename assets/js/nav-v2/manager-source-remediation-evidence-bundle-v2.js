import { getCachedUser, esc } from './supabase-v2.js';

const CONTAINER_ID = 'responsibility-evidence-bundle-validation';
const PRIMARY_HOST_ID = 'responsibility-server-point-preview';
const FALLBACK_HOST_ID = 'confirmation-package-validation';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const NEAR_EXPIRY_MS = 5 * 60 * 1000;

const FILE_SLOTS = {
  confirmation: {
    label: '1. Confirmation JSON',
    inputId: 'responsibilityBundleConfirmationFile',
    buttonId: 'chooseResponsibilityBundleConfirmation',
    expectedType: 'navigator_v2_responsibility_confirmation_draft'
  },
  validation: {
    label: '2. Validation report',
    inputId: 'responsibilityBundleValidationFile',
    buttonId: 'chooseResponsibilityBundleValidation',
    expectedType: 'navigator_v2_responsibility_confirmation_validation'
  },
  preview: {
    label: '3. Server preview',
    inputId: 'responsibilityBundlePreviewFile',
    buttonId: 'chooseResponsibilityBundlePreview',
    expectedType: 'navigator_v2_responsibility_point_server_preview'
  }
};

let loadedFiles = {
  confirmation: null,
  validation: null,
  preview: null
};
let bundleResult = null;
let bundleManifest = null;
let validationSequence = 0;
let statusText = 'Загрузите три JSON-файла одного решения. Файлы остаются только в памяти страницы.';
let statusTone = 'info';

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function normalizeOperation(operation) {
  if (!isRecord(operation)) return null;
  return {
    type: text(operation.type || operation.operation_type),
    target_id: normalizeId(operation.target_id),
    field: text(operation.field),
    expected_current_id: Object.prototype.hasOwnProperty.call(operation, 'expected_current_id')
      ? normalizeId(operation.expected_current_id)
      : normalizeId(operation.actual_current_id),
    proposed_id: normalizeId(operation.proposed_id),
    note: text(operation.note)
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sameOperation(left, right) {
  const a = normalizeOperation(left);
  const b = normalizeOperation(right);
  return Boolean(a && b && stableStringify(a) === stableStringify(b));
}

function operationLabel(operation) {
  if (!operation) return 'операция не определена';
  return `${operation.type || '?'} · ${operation.field || '?'} · ${operation.target_id || '?'}`;
}

function addChangedOperation(operations, data) {
  const current = normalizeId(data.current);
  const proposed = normalizeId(data.proposed);
  if (!proposed || proposed === current) return;
  operations.push({
    type: data.type,
    target_id: normalizeId(data.targetId),
    field: data.field,
    expected_current_id: current,
    proposed_id: proposed,
    note: text(data.note),
    decision_status: text(data.decisionStatus),
    source: data.source
  });
}

export function extractConfirmationOperations(confirmation) {
  const operations = [];
  const errors = [];
  const dealRows = Array.isArray(confirmation?.deal_decisions) ? confirmation.deal_decisions : [];
  const managerRows = Array.isArray(confirmation?.manager_decisions) ? confirmation.manager_decisions : [];

  dealRows.forEach((row, index) => {
    if (!isRecord(row)) {
      errors.push(`deal_decisions[${index}] не является объектом.`);
      return;
    }
    addChangedOperation(operations, {
      type: 'deal_spn',
      targetId: row.deal_id,
      field: 'seller_spn_id',
      current: row.current_seller_spn_id,
      proposed: row.proposed_seller_spn_id,
      note: row.note,
      decisionStatus: row.decision_status,
      source: `deal_decisions[${index}].seller_spn_id`
    });
    addChangedOperation(operations, {
      type: 'deal_spn',
      targetId: row.deal_id,
      field: 'buyer_spn_id',
      current: row.current_buyer_spn_id,
      proposed: row.proposed_buyer_spn_id,
      note: row.note,
      decisionStatus: row.decision_status,
      source: `deal_decisions[${index}].buyer_spn_id`
    });
  });

  managerRows.forEach((row, index) => {
    if (!isRecord(row)) {
      errors.push(`manager_decisions[${index}] не является объектом.`);
      return;
    }
    addChangedOperation(operations, {
      type: 'profile_manager',
      targetId: row.spn_id,
      field: 'manager_id',
      current: row.current_manager_id,
      proposed: row.proposed_manager_id,
      note: row.note,
      decisionStatus: row.decision_status,
      source: `manager_decisions[${index}].manager_id`
    });
  });

  return { operations, errors };
}

function requireMarker(condition, message, errors) {
  if (!condition) errors.push(message);
}

function parseTime(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function previewResultOperation(preview) {
  if (!isRecord(preview)) return null;
  return normalizeOperation({
    operation_type: preview.operation_type,
    target_id: preview.target_id,
    field: preview.field,
    expected_current_id: preview.expected_current_id,
    proposed_id: preview.proposed_id,
    note: preview.note
  });
}

function topLevelChecks(confirmation, validationReport, serverPreview, errors) {
  requireMarker(isRecord(confirmation), 'Confirmation JSON должен быть объектом.', errors);
  requireMarker(isRecord(validationReport), 'Validation report должен быть объектом.', errors);
  requireMarker(isRecord(serverPreview), 'Server preview должен быть объектом.', errors);
  if (!isRecord(confirmation) || !isRecord(validationReport) || !isRecord(serverPreview)) return;

  requireMarker(
    confirmation.export_type === FILE_SLOTS.confirmation.expectedType,
    'Confirmation JSON имеет неверный export_type.',
    errors
  );
  requireMarker([1, 2].includes(Number(confirmation.schema_version)), 'Confirmation JSON: поддерживаются schema_version 1 и 2.', errors);
  requireMarker(Array.isArray(confirmation.deal_decisions), 'Confirmation JSON: deal_decisions должен быть массивом.', errors);
  requireMarker(Array.isArray(confirmation.manager_decisions), 'Confirmation JSON: manager_decisions должен быть массивом.', errors);
  requireMarker(confirmation?.safety?.server_mutation_available === false, 'Confirmation JSON: отсутствует server_mutation_available=false.', errors);
  requireMarker(confirmation?.safety?.requires_separate_audited_point_operation === true, 'Confirmation JSON: отсутствует требование отдельной audited point operation.', errors);

  requireMarker(
    validationReport.export_type === FILE_SLOTS.validation.expectedType,
    'Validation report имеет неверный export_type.',
    errors
  );
  requireMarker(Number(validationReport.schema_version) === 1, 'Validation report: поддерживается только schema_version 1.', errors);
  requireMarker(validationReport?.safety?.read_only_validation === true, 'Validation report: отсутствует read_only_validation=true.', errors);
  requireMarker(validationReport?.safety?.server_mutation_available === false, 'Validation report: отсутствует server_mutation_available=false.', errors);
  requireMarker(validationReport?.safety?.requires_separate_audited_point_operation === true, 'Validation report: отсутствует требование отдельной audited point operation.', errors);

  requireMarker(
    serverPreview.export_type === FILE_SLOTS.preview.expectedType,
    'Server preview имеет неверный export_type.',
    errors
  );
  requireMarker(Number(serverPreview.schema_version) === 1, 'Server preview: поддерживается только schema_version 1.', errors);
  requireMarker(serverPreview?.safety?.read_only_preview === true, 'Server preview: отсутствует read_only_preview=true.', errors);
  requireMarker(serverPreview?.safety?.mutation_available === false, 'Server preview: отсутствует mutation_available=false.', errors);
  requireMarker(serverPreview?.safety?.execution_rpc_available === false, 'Server preview: отсутствует execution_rpc_available=false.', errors);
  requireMarker(serverPreview?.safety?.requires_revalidation === true, 'Server preview: отсутствует requires_revalidation=true.', errors);
}

export function validateEvidenceBundle(input, nowValue = Date.now()) {
  const confirmation = input?.confirmation;
  const validationReport = input?.validation;
  const serverPreview = input?.preview;
  const errors = [];
  const warnings = [];

  topLevelChecks(confirmation, validationReport, serverPreview, errors);
  if (errors.length && (!isRecord(confirmation) || !isRecord(validationReport) || !isRecord(serverPreview))) {
    return {
      validation_version: 1,
      checked_at: new Date(nowValue).toISOString(),
      bundle_ready: false,
      errors,
      warnings,
      operation: null,
      operation_fingerprint: null,
      preview_expires_at: null,
      preview_remaining_seconds: null
    };
  }

  if (isRecord(validationReport) && isRecord(confirmation)) {
    requireMarker(isRecord(validationReport.package), 'Validation report не содержит исходный package.', errors);
    if (isRecord(validationReport.package)) {
      requireMarker(
        stableStringify(validationReport.package) === stableStringify(confirmation),
        'Validation report относится к другому confirmation JSON или файл был изменён после проверки.',
        errors
      );
    }
  }

  const extracted = extractConfirmationOperations(confirmation);
  errors.push(...extracted.errors);
  requireMarker(extracted.operations.length === 1, `Confirmation JSON должен содержать ровно одну изменяемую операцию; найдено ${extracted.operations.length}.`, errors);
  const confirmationCandidate = extracted.operations.length === 1 ? extracted.operations[0] : null;
  const confirmationOperation = normalizeOperation(confirmationCandidate);

  if (confirmationCandidate) {
    requireMarker(confirmationCandidate.decision_status === 'confirmed', 'Единственная операция в confirmation JSON не имеет decision_status=confirmed.', errors);
    requireMarker(Boolean(confirmationOperation?.type), 'У операции отсутствует type.', errors);
    requireMarker(Boolean(confirmationOperation?.target_id), 'У операции отсутствует target_id.', errors);
    requireMarker(Boolean(confirmationOperation?.field), 'У операции отсутствует field.', errors);
    requireMarker(Boolean(confirmationOperation?.proposed_id), 'У операции отсутствует proposed_id.', errors);
    requireMarker((confirmationOperation?.note || '').length >= 10, 'Основание операции должно содержать не менее 10 символов.', errors);
  }

  const validation = isRecord(validationReport?.validation) ? validationReport.validation : null;
  requireMarker(Boolean(validation), 'Validation report не содержит объект validation.', errors);
  let validationOperation = null;
  if (validation) {
    const operations = Array.isArray(validation.operations) ? validation.operations : [];
    const readyOperations = operations.filter((item) => item?.state === 'ready');
    const actionable = operations.filter((item) => item?.state !== 'no_change');
    requireMarker(validation.point_operation_ready === true, 'Validation report не подтверждает point_operation_ready=true.', errors);
    requireMarker(readyOperations.length === 1, `Validation report должен содержать ровно одну ready-операцию; найдено ${readyOperations.length}.`, errors);
    requireMarker(actionable.length === 1, `Validation report содержит ${actionable.length} изменяемых операций вместо одной.`, errors);
    requireMarker(Number(validation?.summary?.ready) === 1, 'Validation summary.ready должен быть равен 1.', errors);
    requireMarker(Number(validation?.summary?.stale) === 0, 'Validation summary.stale должен быть равен 0.', errors);
    requireMarker(Number(validation?.summary?.invalid) === 0, 'Validation summary.invalid должен быть равен 0.', errors);
    requireMarker(Number(validation?.summary?.not_ready) === 0, 'Validation summary.not_ready должен быть равен 0.', errors);
    validationOperation = readyOperations.length === 1 ? normalizeOperation(readyOperations[0]) : null;
    if (confirmationOperation && validationOperation) {
      requireMarker(
        sameOperation(confirmationOperation, validationOperation),
        `Ready-операция validation report не совпадает с confirmation JSON: ${operationLabel(validationOperation)}.`,
        errors
      );
    }
  }

  const previewEnvelopeOperation = normalizeOperation(serverPreview?.operation);
  const preview = isRecord(serverPreview?.preview) ? serverPreview.preview : null;
  requireMarker(Boolean(previewEnvelopeOperation), 'Server preview не содержит operation.', errors);
  requireMarker(Boolean(preview), 'Server preview не содержит объект preview.', errors);

  let previewOperation = null;
  let expiresAt = null;
  let generatedAt = null;
  let remainingMs = null;
  let fingerprint = null;
  if (preview) {
    previewOperation = previewResultOperation(preview);
    fingerprint = text(preview.operation_fingerprint) || null;
    expiresAt = parseTime(preview.expires_at);
    generatedAt = parseTime(preview.generated_at);
    remainingMs = expiresAt === null ? null : expiresAt - Number(nowValue);

    requireMarker(preview.ready === true, 'Server preview не имеет ready=true.', errors);
    requireMarker(preview.reason_code === 'ready', 'Server preview reason_code должен быть ready.', errors);
    requireMarker(preview.mutation_available === false, 'Server preview result: mutation_available должен быть false.', errors);
    requireMarker(preview.execution_rpc_available === false, 'Server preview result: execution_rpc_available должен быть false.', errors);
    requireMarker(preview.requires_revalidation === true, 'Server preview result: requires_revalidation должен быть true.', errors);
    requireMarker(/^[a-f0-9]{32}$/i.test(fingerprint || ''), 'Server preview не содержит корректный operation_fingerprint.', errors);
    requireMarker(expiresAt !== null, 'Server preview содержит некорректный expires_at.', errors);
    requireMarker(generatedAt !== null, 'Server preview содержит некорректный generated_at.', errors);
    if (expiresAt !== null) requireMarker(expiresAt > Number(nowValue), 'Server preview истёк и не может входить в evidence bundle.', errors);
    if (generatedAt !== null && expiresAt !== null) requireMarker(generatedAt < expiresAt, 'Server preview generated_at должен быть раньше expires_at.', errors);
    requireMarker(
      normalizeId(preview.actual_current_id) === normalizeId(preview.expected_current_id),
      'Server preview actual_current_id не совпадает с expected_current_id.',
      errors
    );

    if (remainingMs !== null && remainingMs > 0 && remainingMs < NEAR_EXPIRY_MS) {
      warnings.push('Server preview истекает менее чем через 5 минут; перед исполнением потребуется новый preview.');
    }
  }

  for (const [label, operation] of [
    ['validation report', validationOperation],
    ['server preview envelope', previewEnvelopeOperation],
    ['server preview result', previewOperation]
  ]) {
    if (confirmationOperation && operation) {
      requireMarker(
        sameOperation(confirmationOperation, operation),
        `Операция из ${label} не совпадает с confirmation JSON: ${operationLabel(operation)}.`,
        errors
      );
    }
  }

  if (previewEnvelopeOperation && previewOperation) {
    requireMarker(sameOperation(previewEnvelopeOperation, previewOperation), 'Server preview envelope и server result описывают разные операции.', errors);
  }

  const validatedBy = normalizeId(validationReport?.validated_by_user_id);
  const previewBy = normalizeId(serverPreview?.generated_by_user_id);
  if (validatedBy && previewBy) {
    requireMarker(validatedBy === previewBy, 'Validation report и server preview сформированы разными пользователями.', errors);
  }

  const confirmationExportedAt = parseTime(confirmation?.exported_at);
  const validationCheckedAt = parseTime(validation?.validated_at);
  if (confirmationExportedAt !== null && validationCheckedAt !== null && validationCheckedAt < confirmationExportedAt) {
    warnings.push('Время validation report раньше времени confirmation export; проверьте часы устройства.');
  }
  if (validationCheckedAt !== null && generatedAt !== null && generatedAt < validationCheckedAt) {
    warnings.push('Server preview сформирован раньше validation report; повторите последовательность проверки.');
  }

  return {
    validation_version: 1,
    checked_at: new Date(nowValue).toISOString(),
    bundle_ready: errors.length === 0,
    errors,
    warnings,
    operation: confirmationOperation,
    operation_fingerprint: fingerprint,
    confirmation_exported_at: confirmation?.exported_at || null,
    validation_validated_at: validation?.validated_at || null,
    preview_generated_at: preview?.generated_at || null,
    preview_expires_at: preview?.expires_at || null,
    preview_remaining_seconds: remainingMs === null ? null : Math.max(0, Math.floor(remainingMs / 1000))
  };
}

export async function sha256Hex(content) {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function buildManifest(payloads, result) {
  const operationText = stableStringify(result.operation);
  return {
    export_type: 'navigator_v2_responsibility_evidence_bundle_validation',
    schema_version: 1,
    validated_at: result.checked_at,
    validated_by_user_id: getCachedUser()?.id || null,
    bundle_ready: result.bundle_ready,
    operation: result.operation,
    operation_fingerprint: result.operation_fingerprint,
    preview_expires_at: result.preview_expires_at,
    preview_remaining_seconds: result.preview_remaining_seconds,
    errors: result.errors,
    warnings: result.warnings,
    hashes: {
      confirmation_sha256: await sha256Hex(stableStringify(payloads.confirmation)),
      validation_report_sha256: await sha256Hex(stableStringify(payloads.validation)),
      server_preview_sha256: await sha256Hex(stableStringify(payloads.preview)),
      operation_sha256: await sha256Hex(operationText)
    },
    safety: {
      local_memory_only: true,
      server_mutation_available: false,
      execution_rpc_available: false,
      requires_server_revalidation: true,
      requires_separate_audited_point_operation: true
    }
  };
}

function fmtDateTime(value) {
  if (!value) return 'не указано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtSize(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${value} Б`;
  return `${Math.ceil(value / 1024)} КБ`;
}

function slotHtml(key, config) {
  const loaded = loadedFiles[key];
  return `<article class="list-item">
    <div class="section-title">
      <div><h4>${esc(config.label)}</h4><p class="muted">${loaded ? `${esc(loaded.file.name)} · ${esc(fmtSize(loaded.file.size))}` : `Ожидается ${esc(config.expectedType)}`}</p></div>
      <span class="pill ${loaded ? 'green' : 'gray'}">${loaded ? 'Загружен' : 'Нет файла'}</span>
    </div>
    <input id="${config.inputId}" type="file" accept="application/json,.json" hidden>
    <button class="btn" id="${config.buttonId}" type="button">${loaded ? 'Заменить файл' : 'Выбрать файл'}</button>
  </article>`;
}

function resultHtml() {
  if (!bundleResult) return '<div class="empty">Комплект ещё не собран.</div>';
  const result = bundleResult;
  return `<div class="status ${result.bundle_ready ? 'ok' : 'error'}"><b>Вердикт:</b> ${result.bundle_ready ? 'Три evidence-файла согласованы и описывают одну неистёкшую операцию.' : 'Evidence bundle отклонён; точечная операция запрещена.'}</div>
    ${result.errors.length ? `<div class="status error"><b>Ошибки:</b><ul>${result.errors.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
    ${result.warnings.length ? `<div class="status warn"><b>Предупреждения:</b><ul>${result.warnings.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
    ${result.operation ? `<div class="task-review-facts">
      <div><span class="small">Тип</span><b>${esc(result.operation.type)}</b></div>
      <div><span class="small">Поле</span><b><code>${esc(result.operation.field)}</code></b></div>
      <div><span class="small">Target</span><b>${esc(result.operation.target_id)}</b></div>
      <div><span class="small">До</span><b>${esc(result.operation.expected_current_id || 'NULL')}</b></div>
      <div><span class="small">После</span><b>${esc(result.operation.proposed_id)}</b></div>
      <div><span class="small">Preview до</span><b>${esc(fmtDateTime(result.preview_expires_at))}</b></div>
    </div>` : ''}
    ${result.operation_fingerprint ? `<div class="status ok"><b>Fingerprint:</b> <code>${esc(result.operation_fingerprint)}</code></div>` : ''}
    <div class="status warn"><b>Граница:</b> даже bundle_ready=true не выполняет UPDATE. Перед audited correction обязательна повторная server revalidation.</div>`;
}

function sectionHtml() {
  const loadedCount = Object.values(loadedFiles).filter(Boolean).length;
  return `<section class="list-item" id="${CONTAINER_ID}" aria-label="Проверка комплекта evidence-файлов">
    <div class="section-title">
      <div><h3>Проверка трёх evidence-файлов</h3><p class="muted">Confirmation, validation report и server preview сверяются между собой локально. Файлы не отправляются в Supabase.</p></div>
      <span class="pill ${bundleResult?.bundle_ready ? 'green' : bundleResult ? 'red' : 'gray'}">${bundleResult?.bundle_ready ? 'Bundle готов' : `${loadedCount}/3 файла`}</span>
    </div>
    <div id="responsibilityEvidenceBundleStatus" class="status ${esc(statusTone)}">${esc(statusText)}</div>
    <div class="list">${Object.entries(FILE_SLOTS).map(([key, config]) => slotHtml(key, config)).join('')}</div>
    <div class="actions" style="justify-content:flex-start">
      ${bundleManifest ? '<button class="btn" id="downloadResponsibilityEvidenceBundleManifest" type="button">Скачать bundle manifest</button>' : ''}
      ${bundleResult?.bundle_ready ? '<button class="btn green" id="copyResponsibilityEvidenceBundleSummary" type="button">Копировать готовую операцию</button>' : ''}
      ${loadedCount ? '<button class="btn red" id="clearResponsibilityEvidenceBundle" type="button">Очистить три файла</button>' : ''}
    </div>
    ${resultHtml()}
  </section>`;
}

function mount() {
  if (typeof document === 'undefined') return;
  const host = document.getElementById(PRIMARY_HOST_ID) || document.getElementById(FALLBACK_HOST_ID);
  if (!host) return;
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) existing.outerHTML = sectionHtml();
  else host.insertAdjacentHTML('afterend', sectionHtml());
  bindEvents();
}

function setStatus(message, tone = 'info') {
  statusText = message;
  statusTone = tone;
  mount();
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

async function revalidateBundle() {
  const sequence = ++validationSequence;
  const payloads = {
    confirmation: loadedFiles.confirmation?.payload || null,
    validation: loadedFiles.validation?.payload || null,
    preview: loadedFiles.preview?.payload || null
  };
  if (!payloads.confirmation || !payloads.validation || !payloads.preview) {
    bundleResult = null;
    bundleManifest = null;
    setStatus(`Загружено ${Object.values(loadedFiles).filter(Boolean).length} из 3 файлов.`, 'info');
    return;
  }

  bundleResult = validateEvidenceBundle(payloads, Date.now());
  try {
    const manifest = await buildManifest(payloads, bundleResult);
    if (sequence !== validationSequence) return;
    bundleManifest = manifest;
    setStatus(
      bundleResult.bundle_ready
        ? 'Evidence bundle согласован. UPDATE не выполнялся; перед исполнением нужна новая server revalidation.'
        : `Evidence bundle отклонён: ${bundleResult.errors.length} ошибок.`,
      bundleResult.bundle_ready ? 'ok' : 'error'
    );
  } catch (error) {
    if (sequence !== validationSequence) return;
    bundleManifest = null;
    setStatus(`Не удалось сформировать SHA-256 manifest: ${error.message || error}`, 'error');
  }
}

async function readSlotFile(key, file) {
  const config = FILE_SLOTS[key];
  if (!config || !file) return;
  if (file.size > MAX_FILE_BYTES) return setStatus(`${config.label}: файл больше 2 МБ и отклонён.`, 'error');
  try {
    const payload = JSON.parse(await file.text());
    if (!isRecord(payload)) throw new Error('корневое значение должно быть объектом');
    if (payload.export_type !== config.expectedType) {
      throw new Error(`ожидался export_type ${config.expectedType}`);
    }
    loadedFiles[key] = { file, payload };
    bundleResult = null;
    bundleManifest = null;
    mount();
    await revalidateBundle();
  } catch (error) {
    loadedFiles[key] = null;
    bundleResult = null;
    bundleManifest = null;
    setStatus(`${config.label}: JSON отклонён — ${error.message || error}.`, 'error');
  }
}

function downloadManifest() {
  if (!bundleManifest) return;
  downloadText(
    `navigator-responsibility-evidence-bundle-${new Date().toISOString().slice(0, 10)}.json`,
    `${JSON.stringify(bundleManifest, null, 2)}\n`,
    'application/json;charset=utf-8'
  );
  setStatus('Bundle manifest скачан. Исходные evidence-файлы остаются только в памяти страницы.', 'ok');
}

async function copyBundleSummary() {
  if (!bundleResult?.bundle_ready || !bundleResult.operation) return;
  const operation = bundleResult.operation;
  const summary = [
    'Navigator v2 — согласованный responsibility evidence bundle',
    `Тип: ${operation.type}`,
    `Target: ${operation.target_id}`,
    `Поле: ${operation.field}`,
    `До: ${operation.expected_current_id || 'NULL'}`,
    `После: ${operation.proposed_id}`,
    `Основание: ${operation.note}`,
    `Fingerprint: ${bundleResult.operation_fingerprint}`,
    `Preview до: ${bundleResult.preview_expires_at}`,
    'UPDATE не выполнялся; требуется повторная server revalidation и отдельная audited point correction.'
  ].join('\n');
  try {
    await navigator.clipboard.writeText(summary);
    setStatus('Сводка bundle скопирована. Серверные данные не изменялись.', 'ok');
  } catch (error) {
    setStatus(`Не удалось скопировать сводку: ${error.message || error}`, 'error');
  }
}

function clearBundle() {
  validationSequence += 1;
  loadedFiles = { confirmation: null, validation: null, preview: null };
  bundleResult = null;
  bundleManifest = null;
  setStatus('Три evidence-файла удалены из памяти страницы.', 'ok');
}

function bindEvents() {
  Object.entries(FILE_SLOTS).forEach(([key, config]) => {
    const input = document.getElementById(config.inputId);
    document.getElementById(config.buttonId)?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      readSlotFile(key, file);
    });
  });
  document.getElementById('downloadResponsibilityEvidenceBundleManifest')?.addEventListener('click', downloadManifest);
  document.getElementById('copyResponsibilityEvidenceBundleSummary')?.addEventListener('click', copyBundleSummary);
  document.getElementById('clearResponsibilityEvidenceBundle')?.addEventListener('click', clearBundle);
}

function startBrowserModule() {
  const observer = new MutationObserver(() => {
    const host = document.getElementById(PRIMARY_HOST_ID) || document.getElementById(FALLBACK_HOST_ID);
    if (host && !document.getElementById(CONTAINER_ID)) mount();
  });
  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  mount();
}

if (typeof document !== 'undefined') startBrowserModule();
