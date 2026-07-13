import { getCachedUser, rpc, esc } from './supabase-v2.js';

const CONTAINER_ID = 'responsibility-server-point-preview';
const LOCAL_VALIDATION_ID = 'confirmation-package-validation';
const FILE_INPUT_ID = 'confirmationPackageFile';
const MAX_FILE_BYTES = 2 * 1024 * 1024;

let profile = null;
let importedPackage = null;
let previewResult = null;
let previewOperation = null;
let busy = false;
let statusText = 'Сначала получите локальный verdict point_operation_ready=true.';
let statusTone = 'info';

function normalizeId(value) { return value ? String(value) : null; }
function fmtDateTime(value) {
  if (!value) return 'не указано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function ownerAdminAllowed() { return ['owner', 'admin'].includes(profile?.role); }
function localPointReady() { return Boolean(document.getElementById('copyPointOperation')); }

function extractOperations(payload) {
  const operations = [];
  const dealRows = Array.isArray(payload?.deal_decisions) ? payload.deal_decisions : [];
  const managerRows = Array.isArray(payload?.manager_decisions) ? payload.manager_decisions : [];

  dealRows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const sellerCurrent = normalizeId(row.current_seller_spn_id);
    const sellerProposed = normalizeId(row.proposed_seller_spn_id);
    if (sellerProposed && sellerProposed !== sellerCurrent) {
      operations.push({
        type: 'deal_spn',
        target_id: normalizeId(row.deal_id),
        field: 'seller_spn_id',
        expected_current_id: sellerCurrent,
        proposed_id: sellerProposed,
        note: String(row.note || '').trim()
      });
    }

    const buyerCurrent = normalizeId(row.current_buyer_spn_id);
    const buyerProposed = normalizeId(row.proposed_buyer_spn_id);
    if (buyerProposed && buyerProposed !== buyerCurrent) {
      operations.push({
        type: 'deal_spn',
        target_id: normalizeId(row.deal_id),
        field: 'buyer_spn_id',
        expected_current_id: buyerCurrent,
        proposed_id: buyerProposed,
        note: String(row.note || '').trim()
      });
    }
  });

  managerRows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const current = normalizeId(row.current_manager_id);
    const proposed = normalizeId(row.proposed_manager_id);
    if (!proposed || proposed === current) return;
    operations.push({
      type: 'profile_manager',
      target_id: normalizeId(row.spn_id),
      field: 'manager_id',
      expected_current_id: current,
      proposed_id: proposed,
      note: String(row.note || '').trim()
    });
  });

  return operations;
}

function readyOperation() {
  if (!importedPackage || !localPointReady()) return null;
  const operations = extractOperations(importedPackage);
  return operations.length === 1 ? operations[0] : null;
}

function previewTone() {
  if (!previewResult) return 'gray';
  return previewResult.ready ? 'green' : 'red';
}

function previewLabel() {
  if (!previewResult) return 'Серверная проверка не выполнена';
  return previewResult.ready ? 'Fingerprint сформирован' : 'Сервер отклонил операцию';
}

function previewHtml() {
  const operation = readyOperation();
  const canPreview = ownerAdminAllowed() && operation && !busy;
  const result = previewResult;

  return `<section class="list-item" id="${CONTAINER_ID}" aria-label="Серверный preview точечной коррекции">
    <div class="section-title">
      <div>
        <h3>Серверный preview одной операции</h3>
        <p class="muted">Supabase повторно проверяет текущее значение, роли профилей и основание. UPDATE не выполняется.</p>
      </div>
      <span class="pill ${previewTone()}">${esc(previewLabel())}</span>
    </div>
    <div id="responsibilityServerPreviewStatus" class="status ${esc(statusTone)}">${esc(statusText)}</div>
    ${!ownerAdminAllowed() && profile ? '<div class="status warn"><b>Доступ:</b> серверный fingerprint доступен только owner/admin. Manager может использовать локальную проверку файла.</div>' : ''}
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" id="runResponsibilityServerPreview" type="button" ${canPreview ? '' : 'disabled'}>${busy ? 'Проверяю…' : 'Получить серверный preview'}</button>
      ${result ? '<button class="btn" id="downloadResponsibilityServerPreview" type="button">Скачать server preview</button>' : ''}
      ${result?.ready ? '<button class="btn green" id="copyResponsibilityFingerprint" type="button">Копировать fingerprint</button>' : ''}
    </div>
    ${operation ? `<div class="task-review-facts">
      <div><span class="small">Тип</span><b>${esc(operation.type)}</b></div>
      <div><span class="small">Поле</span><b><code>${esc(operation.field)}</code></b></div>
      <div><span class="small">Цель</span><b>${esc(operation.target_id || 'не указана')}</b></div>
    </div>` : '<div class="empty">Локальный валидатор ещё не выделил ровно одну готовую операцию.</div>'}
    ${result ? `<div class="status ${result.ready ? 'ok' : 'error'}"><b>${esc(result.reason_code || 'result')}:</b> ${esc(result.reason || '')}</div>
      <div class="task-review-facts">
        <div><span class="small">Текущее значение в БД</span><b>${esc(result.actual_current_id || 'NULL')}</b></div>
        <div><span class="small">Предлагаемое значение</span><b>${esc(result.proposed_profile?.name || result.proposed_id || 'не указано')}</b></div>
        <div><span class="small">Действителен до</span><b>${esc(fmtDateTime(result.expires_at))}</b></div>
      </div>
      ${result.operation_fingerprint ? `<div class="status ok"><b>Operation fingerprint:</b> <code>${esc(result.operation_fingerprint)}</code></div>` : ''}
      <div class="status warn"><b>Граница:</b> mutation_available=${esc(String(result.mutation_available))}, execution_rpc_available=${esc(String(result.execution_rpc_available))}. Перед будущим исполнением требуется повторная проверка.</div>` : ''}
  </section>`;
}

function mount() {
  const localSection = document.getElementById(LOCAL_VALIDATION_ID);
  if (!localSection) return;
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) existing.outerHTML = previewHtml();
  else localSection.insertAdjacentHTML('afterend', previewHtml());
  bindButtons();
}

function setStatus(text, tone = 'info') {
  statusText = text;
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

function previewEvidence() {
  return {
    export_type: 'navigator_v2_responsibility_point_server_preview',
    schema_version: 1,
    generated_by_user_id: getCachedUser()?.id || null,
    operation: previewOperation,
    preview: previewResult,
    safety: {
      read_only_preview: true,
      mutation_available: false,
      execution_rpc_available: false,
      requires_revalidation: true
    }
  };
}

async function runPreview() {
  if (busy) return;
  const operation = readyOperation();
  if (!ownerAdminAllowed()) return setStatus('Серверный preview доступен только owner/admin.', 'warn');
  if (!operation) return setStatus('Локальный пакет не содержит ровно одну готовую операцию.', 'warn');

  busy = true;
  previewResult = null;
  previewOperation = operation;
  setStatus('Supabase проверяет expected current value и роли профилей без записи…', 'info');
  try {
    previewResult = await rpc('nav_v2_preview_responsibility_point_correction', { p_operation: operation }, 30000);
    setStatus(
      previewResult?.ready
        ? 'Серверный preview готов. Fingerprint не является исполнением и действует ограниченное время.'
        : `Сервер отклонил операцию: ${previewResult?.reason || 'причина не указана'}`,
      previewResult?.ready ? 'ok' : 'error'
    );
  } catch (error) {
    previewResult = null;
    setStatus(`Серверный preview не выполнен: ${error.message || error}`, 'error');
  } finally {
    busy = false;
    mount();
  }
}

function downloadPreview() {
  const evidence = previewEvidence();
  downloadText(
    `navigator-responsibility-server-preview-${new Date().toISOString().slice(0, 10)}.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    'application/json;charset=utf-8'
  );
  setStatus('Server preview скачан. Данные в Supabase не изменялись.', 'ok');
}

async function copyFingerprint() {
  if (!previewResult?.ready || !previewResult.operation_fingerprint) return;
  const text = [
    'Navigator v2 — server responsibility point preview',
    `Fingerprint: ${previewResult.operation_fingerprint}`,
    `Тип: ${previewResult.operation_type}`,
    `Target: ${previewResult.target_id}`,
    `Поле: ${previewResult.field}`,
    `До: ${previewResult.actual_current_id || 'NULL'}`,
    `После: ${previewResult.proposed_id}`,
    `Действителен до: ${previewResult.expires_at}`,
    `Основание: ${previewResult.note}`,
    'Исполнение отсутствует; требуется отдельная revalidation и audited point correction.'
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Fingerprint скопирован. Операция не выполнялась.', 'ok');
  } catch (error) {
    setStatus(`Не удалось скопировать fingerprint: ${error.message || error}`, 'error');
  }
}

function bindButtons() {
  document.getElementById('runResponsibilityServerPreview')?.addEventListener('click', runPreview);
  document.getElementById('downloadResponsibilityServerPreview')?.addEventListener('click', downloadPreview);
  document.getElementById('copyResponsibilityFingerprint')?.addEventListener('click', copyFingerprint);
}

async function capturePackage(file) {
  if (!file || file.size > MAX_FILE_BYTES) {
    importedPackage = null;
    previewResult = null;
    previewOperation = null;
    return mount();
  }
  try {
    importedPackage = JSON.parse(await file.text());
  } catch {
    importedPackage = null;
  }
  previewResult = null;
  previewOperation = null;
  setTimeout(mount, 0);
  setTimeout(mount, 250);
}

document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== FILE_INPUT_ID) return;
  capturePackage(target.files?.[0]);
}, true);

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element) || target.id !== 'clearImportedPackage') return;
  importedPackage = null;
  previewResult = null;
  previewOperation = null;
  setTimeout(() => setStatus('Импорт очищен; серверный preview сброшен.', 'ok'), 0);
}, true);

async function loadProfile() {
  if (!getCachedUser()) return;
  try {
    const response = await rpc('nav_v2_get_my_profile', {}, 15000);
    profile = response?.profile || response || null;
  } catch (error) {
    profile = null;
    statusText = `Профиль для server preview не загружен: ${error.message || error}`;
    statusTone = 'error';
  }
  mount();
}

const observer = new MutationObserver(() => {
  const localSection = document.getElementById(LOCAL_VALIDATION_ID);
  if (!localSection) return;
  const previewSection = document.getElementById(CONTAINER_ID);
  const previewButton = document.getElementById('runResponsibilityServerPreview');
  const shouldEnable = Boolean(ownerAdminAllowed() && readyOperation() && !busy);
  if (!previewSection || (previewButton && previewButton.disabled === shouldEnable)) mount();
});
observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

mount();
loadProfile();
