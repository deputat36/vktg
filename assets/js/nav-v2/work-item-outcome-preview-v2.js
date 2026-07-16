import { esc } from './supabase-v2.js';
import {
  DOCUMENT_OUTCOME_OPTIONS,
  RISK_RESOLUTION_OPTIONS,
  documentOutcomePreview,
  optionByCode,
  riskResolutionPreview,
  validateDocumentOutcome,
  validateRiskResolution
} from './work-item-outcome-model-v2.js?v=20260716-01';

const DIALOG_ID = 'workItemOutcomePreviewDialog';
let cardData = null;
let profile = null;
let current = null;

function clean(value) {
  return String(value ?? '').trim();
}

function roleLabel(role) {
  return ({ owner: 'owner', admin: 'admin', manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'ипотечный брокер' })[role] || role || 'роль не определена';
}

function optionsHtml(items) {
  return `<option value="">Выберите вариант</option>${items.map((item) => `<option value="${esc(item.code)}">${esc(item.label)}</option>`).join('')}`;
}

function ensureDialog() {
  let dialog = document.getElementById(DIALOG_ID);
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = DIALOG_ID;
  dialog.className = 'outcome-preview-dialog';
  dialog.innerHTML = `<form method="dialog" class="card outcome-preview-card">
    <div class="section-title">
      <div><span class="pill blue">PREVIEW</span><h2 id="outcomePreviewTitle">Предложить исход</h2><p class="muted" id="outcomePreviewContext"></p></div>
      <button class="btn light" value="cancel" aria-label="Закрыть">Закрыть</button>
    </div>
    <div class="status warn"><b>Без сохранения.</b> Эта форма проверяет будущий сценарий и не вызывает mutation RPC.</div>
    <div class="field"><label for="outcomePreviewCode">Исход</label><select id="outcomePreviewCode"></select><p class="small" id="outcomePreviewHelp"></p></div>
    <div class="field"><label for="outcomePreviewNote">Объяснение / evidence</label><textarea id="outcomePreviewNote" placeholder="Что произошло, что проверено, на чём основано предложение?"></textarea></div>
    <div class="field" id="outcomeExternalPartyField" hidden><label for="outcomeExternalParty">От кого ожидается</label><input id="outcomeExternalParty" placeholder="банк, нотариус, госорган, продавец, покупатель"></div>
    <div class="field" id="outcomeDeferredUntilField" hidden><label for="outcomeDeferredUntil">Контрольная дата</label><input id="outcomeDeferredUntil" type="date"></div>
    <div class="field" id="outcomeReplacementField" hidden><label for="outcomeReplacementId">Заменяющий документ</label><select id="outcomeReplacementId"></select></div>
    <div class="field" id="outcomeSupersededRiskField" hidden><label for="outcomeSupersededRiskId">Заменяющий риск</label><select id="outcomeSupersededRiskId"></select></div>
    <div id="outcomePreviewErrors" class="status error" hidden></div>
    <div id="outcomePreviewResult" hidden></div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" id="buildOutcomePreview" type="button">Показать результат</button>
      <button class="btn light" value="cancel">Закрыть</button>
    </div>
  </form>`;
  document.body.appendChild(dialog);

  dialog.querySelector('#outcomePreviewCode').addEventListener('change', refreshConditionalFields);
  dialog.querySelector('#buildOutcomePreview').addEventListener('click', buildPreview);
  dialog.addEventListener('close', () => { current = null; });
  return dialog;
}

function documentById(id) {
  return (Array.isArray(cardData?.documents) ? cardData.documents : []).find((item) => String(item.id) === String(id)) || null;
}

function otherDocuments(id) {
  return (Array.isArray(cardData?.documents) ? cardData.documents : []).filter((item) => String(item.id) !== String(id));
}

function otherRisks(id) {
  return (Array.isArray(cardData?.risks) ? cardData.risks : []).filter((item) => String(item.id) !== String(id));
}

function populateReplacementOptions() {
  const dialog = ensureDialog();
  const documentSelect = dialog.querySelector('#outcomeReplacementId');
  const riskSelect = dialog.querySelector('#outcomeSupersededRiskId');
  const documents = current?.type === 'document' ? otherDocuments(current.item.id) : [];
  const risks = current?.type === 'risk' ? otherRisks(current.item.id) : [];
  documentSelect.innerHTML = `<option value="">Выберите документ</option>${documents.map((item) => `<option value="${esc(item.id)}">${esc(item.title || 'Документ')}</option>`).join('')}`;
  riskSelect.innerHTML = `<option value="">Выберите риск</option>${risks.map((item) => `<option value="${esc(item.id)}">${esc(item.title || 'Риск')}</option>`).join('')}`;
}

function refreshConditionalFields() {
  const dialog = ensureDialog();
  const code = dialog.querySelector('#outcomePreviewCode').value;
  const option = optionByCode(current?.type, code);
  dialog.querySelector('#outcomePreviewHelp').textContent = option?.help || '';
  dialog.querySelector('#outcomeExternalPartyField').hidden = !(current?.type === 'document' && code === 'external_wait');
  dialog.querySelector('#outcomeDeferredUntilField').hidden = !(current?.type === 'document' && code === 'deferred');
  dialog.querySelector('#outcomeReplacementField').hidden = !(current?.type === 'document' && code === 'replaced');
  dialog.querySelector('#outcomeSupersededRiskField').hidden = !(current?.type === 'risk' && code === 'superseded');
  dialog.querySelector('#outcomePreviewErrors').hidden = true;
  dialog.querySelector('#outcomePreviewResult').hidden = true;
}

function openPreview(type, item) {
  const dialog = ensureDialog();
  current = { type, item };
  const role = profile?.role || '';
  const assignedRole = type === 'document' ? item.responsible_role : item.assigned_role;
  dialog.querySelector('#outcomePreviewTitle').textContent = type === 'document' ? 'Исход документа' : 'Решение по риску';
  dialog.querySelector('#outcomePreviewContext').textContent = `${item.title || (type === 'document' ? 'Документ' : 'Риск')} · ваша роль: ${roleLabel(role)} · ответственная роль: ${roleLabel(assignedRole)}`;
  dialog.querySelector('#outcomePreviewCode').innerHTML = optionsHtml(type === 'document' ? DOCUMENT_OUTCOME_OPTIONS : RISK_RESOLUTION_OPTIONS);
  dialog.querySelector('#outcomePreviewNote').value = '';
  dialog.querySelector('#outcomeExternalParty').value = '';
  dialog.querySelector('#outcomeDeferredUntil').value = '';
  populateReplacementOptions();
  refreshConditionalFields();
  dialog.showModal();
}

function previewInput() {
  const dialog = ensureDialog();
  return {
    code: dialog.querySelector('#outcomePreviewCode').value,
    note: dialog.querySelector('#outcomePreviewNote').value,
    externalParty: dialog.querySelector('#outcomeExternalParty').value,
    deferredUntil: dialog.querySelector('#outcomeDeferredUntil').value,
    replacementDocumentId: dialog.querySelector('#outcomeReplacementId').value,
    supersededByRiskId: dialog.querySelector('#outcomeSupersededRiskId').value
  };
}

function renderErrors(errors) {
  const box = ensureDialog().querySelector('#outcomePreviewErrors');
  box.innerHTML = `<b>Нужно исправить:</b><ul>${errors.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
  box.hidden = false;
}

function buildPreview() {
  if (!current) return;
  const input = previewInput();
  const validation = current.type === 'document' ? validateDocumentOutcome(input) : validateRiskResolution(input);
  const dialog = ensureDialog();
  dialog.querySelector('#outcomePreviewErrors').hidden = true;
  if (!validation.valid) {
    renderErrors(validation.errors);
    dialog.querySelector('#outcomePreviewResult').hidden = true;
    return;
  }

  const role = profile?.role || '';
  const preview = current.type === 'document'
    ? documentOutcomePreview({ role, responsibleRole: current.item.responsible_role, category: current.item.category, code: input.code })
    : riskResolutionPreview({ role, assignedRole: current.item.assigned_role, code: input.code });
  const selected = optionByCode(current.type, input.code);
  const result = dialog.querySelector('#outcomePreviewResult');
  result.className = `status ${preview.tone}`;
  result.innerHTML = `<b>${esc(preview.heading)}</b><p>${esc(selected?.label || input.code)}. ${esc(preview.readiness)}</p><p class="small">Будущее действие интерфейса: ${esc(preview.actionLabel)}. Сейчас ничего не сохранено.</p>`;
  result.hidden = false;
}

function attachDocumentButtons() {
  const groups = new Map();
  document.querySelectorAll('[data-doc-id]').forEach((button) => {
    const id = button.dataset.docId;
    if (id && !groups.has(id)) groups.set(id, button.closest('.list-item'));
  });

  groups.forEach((itemNode, id) => {
    const documentItem = documentById(id);
    if (!itemNode || !documentItem || itemNode.querySelector('[data-outcome-document-preview]')) return;
    if (documentItem.status === 'checked' || documentItem.outcome_state === 'confirmed') return;
    const actions = itemNode.querySelector('.actions:last-of-type') || itemNode;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn light';
    button.dataset.outcomeDocumentPreview = id;
    button.textContent = profile?.role === 'spn' ? 'Предложить другой исход' : 'Исход / исключение';
    button.addEventListener('click', () => openPreview('document', documentItem));
    actions.appendChild(button);
  });
}

function attachRiskButtons() {
  const risks = Array.isArray(cardData?.risks) ? cardData.risks : [];
  if (!risks.length) return;
  const listItems = Array.from(document.querySelectorAll('.list-item'));
  risks.forEach((risk) => {
    if (risk.is_resolved === true || risk.resolution_state === 'confirmed') return;
    const itemNode = listItems.find((node) => clean(node.querySelector('b')?.textContent) === clean(risk.title));
    if (!itemNode || itemNode.querySelector('[data-outcome-risk-preview]')) return;
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.style.justifyContent = 'flex-start';
    actions.style.marginTop = '8px';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn light';
    button.dataset.outcomeRiskPreview = risk.id;
    button.textContent = profile?.role === 'spn' ? 'Предложить решение' : 'Решение по риску';
    button.addEventListener('click', () => openPreview('risk', risk));
    actions.appendChild(button);
    itemNode.appendChild(actions);
  });
}

export function applyWorkItemOutcomePreview(data, currentProfile) {
  cardData = data;
  profile = currentProfile || data?.profile || null;
  if (!cardData || !profile) return;
  ensureDialog();
  attachDocumentButtons();
  attachRiskButtons();
}
