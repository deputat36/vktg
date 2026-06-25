import { rpc, esc } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let cardData = null;
let loading = false;
let scheduled = false;
let observerStarted = false;

const ROLE_LABELS = {
  owner: 'owner',
  admin: 'admin',
  manager: 'менеджер',
  spn: 'СПН',
  lawyer: 'юрист',
  broker: 'брокер',
  viewer: 'наблюдатель'
};
const ROLE_ORDER = ['manager', 'spn', 'lawyer', 'broker', 'viewer', 'owner', 'admin'];
const CLOSED_DOC_STATUSES = ['received', 'checked'];

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function roleLabel(role) {
  return ROLE_LABELS[role] || role || 'не назначен';
}

function setStatus(message, type = 'info') {
  const el = document.getElementById('pageStatus');
  if (!el) return;
  el.textContent = message || '';
  el.className = type === 'error' ? 'status error' : 'status';
}

function participantName(userId) {
  const participant = list(cardData, 'participants').find((item) => item.user_id === userId);
  if (!participant) return userId ? String(userId).slice(0, 8) : 'не назначен';
  return participant.display_name || participant.email || roleLabel(participant.role_in_deal) || String(userId).slice(0, 8);
}

function assigneeOptions(selected) {
  const seen = new Set();
  const options = [`<option value="" ${selected ? '' : 'selected'}>Без ответственного</option>`];

  list(cardData, 'participants').forEach((participant) => {
    if (!participant.user_id || seen.has(participant.user_id)) return;
    seen.add(participant.user_id);
    const label = `${participantName(participant.user_id)}${participant.role_in_deal ? ' — ' + roleLabel(participant.role_in_deal) : ''}`;
    options.push(`<option value="${esc(participant.user_id)}" ${participant.user_id === selected ? 'selected' : ''}>${esc(label)}</option>`);
  });

  if (selected && !seen.has(selected)) {
    options.push(`<option value="${esc(selected)}" selected>${esc(participantName(selected))}</option>`);
  }

  return options.join('');
}

function roleOptions(selected) {
  return ['<option value="">Не менять</option>'].concat(
    ROLE_ORDER.map((role) => `<option value="${esc(role)}" ${role === selected ? 'selected' : ''}>${esc(roleLabel(role))}</option>`)
  ).join('');
}

function isoDate(value) {
  return value ? String(value).slice(0, 10) : '';
}

function dateShort(value) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : '—';
}

function duePill(doc) {
  if (!doc.due_date) return '';
  const isOverdue = !CLOSED_DOC_STATUSES.includes(doc.status) && isoDate(doc.due_date) < isoDate(new Date().toISOString());
  return `<span class="pill ${isOverdue ? 'red' : 'yellow'}">срок: ${esc(dateShort(doc.due_date))}</span>`;
}

function docMetaHtml(doc) {
  const assignee = doc.assigned_to ? ` / ${participantName(doc.assigned_to)}` : '';
  return `<span class="pill blue">ответственный: ${esc(roleLabel(doc.responsible_role))}${esc(assignee)}</span>
    ${duePill(doc)}
    ${doc.required_for_deposit ? '<span class="pill yellow">до задатка</span>' : ''}
    ${doc.required_for_deal ? '<span class="pill">до сделки</span>' : ''}`;
}

function panelHtml(doc) {
  const assignedText = doc.assigned_to ? `Сейчас назначен: ${participantName(doc.assigned_to)}` : 'Ответственный не назначен';
  const dueText = doc.due_date ? `срок ${dateShort(doc.due_date)}` : 'срок не задан';

  return `<div class="doc-workflow-panel" data-doc-workflow-panel="${esc(doc.id)}" style="margin-top:10px">
    <div class="grid">
      <div class="field">
        <label>Роль</label>
        <select data-doc-role-save="${esc(doc.id)}">${roleOptions(doc.responsible_role)}</select>
      </div>
      <div class="field">
        <label>Ответственный</label>
        <select data-doc-assignee-save="${esc(doc.id)}">${assigneeOptions(doc.assigned_to)}</select>
      </div>
      <div class="field">
        <label>Срок</label>
        <input type="date" data-doc-due-save="${esc(doc.id)}" value="${esc(isoDate(doc.due_date))}">
      </div>
    </div>
    <div class="actions" style="justify-content:flex-start;margin-top:8px">
      <button class="btn light" data-doc-workflow-save="${esc(doc.id)}">Сохранить ответственного и срок</button>
      <span class="small">${esc(assignedText)}; ${esc(dueText)}. Пустой ответственный или срок очищает поле.</span>
    </div>
  </div>`;
}

async function loadCard(force = false) {
  if (!dealId || loading) return false;
  if (cardData && !force) return true;
  loading = true;
  try {
    cardData = await rpc('nav_v2_get_deal_card', { p_deal_id: dealId });
    return true;
  }
  catch (e) {
    setStatus('Не удалось загрузить данные документов: ' + e.message, 'error');
    return false;
  }
  finally {
    loading = false;
  }
}

function documentById(docId) {
  return list(cardData, 'documents').find((doc) => doc.id === docId);
}

function documentItem(docId) {
  const button = document.querySelector(`[data-doc-id="${docId}"]`);
  return button?.closest('.list-item') || null;
}

function bindWorkflowButton(docId) {
  const button = document.querySelector(`[data-doc-workflow-save="${docId}"]`);
  if (!button || button.dataset.bound === '1') return;
  button.dataset.bound = '1';
  button.onclick = () => saveWorkflow(docId);
}

function refreshDocumentUi(docId) {
  const doc = documentById(docId);
  const item = documentItem(docId);
  if (!doc || !item) return;

  const meta = item.querySelector('.doc-status + .actions');
  if (meta) meta.innerHTML = docMetaHtml(doc);

  const panel = item.querySelector(`[data-doc-workflow-panel="${docId}"]`);
  if (panel) {
    panel.outerHTML = panelHtml(doc);
  }
  else {
    item.insertAdjacentHTML('beforeend', panelHtml(doc));
  }
  bindWorkflowButton(docId);
}

async function saveWorkflow(docId) {
  const role = document.querySelector(`[data-doc-role-save="${docId}"]`)?.value || null;
  const assignedTo = document.querySelector(`[data-doc-assignee-save="${docId}"]`)?.value || null;
  const dueDate = document.querySelector(`[data-doc-due-save="${docId}"]`)?.value || null;

  if (!confirm('Изменить ответственного или срок документа?')) return;

  try {
    setStatus('Сохраняю ответственного и срок...');
    await rpc('nav_v2_update_document_assignment', {
      p_document_id: docId,
      p_assigned_to: assignedTo,
      p_responsible_role: role,
      p_due_date: dueDate,
      p_clear_assigned_to: !assignedTo,
      p_clear_due_date: !dueDate
    });
    const refreshed = await loadCard(true);
    if (!refreshed) return;
    refreshDocumentUi(docId);
    setStatus('Документ обновлен.');
  }
  catch (e) {
    setStatus('Ошибка документа: ' + e.message, 'error');
  }
}

function enhanceDocuments() {
  if (!cardData) return;
  const docsById = new Map(list(cardData, 'documents').map((doc) => [doc.id, doc]));

  document.querySelectorAll('[data-doc-id]').forEach((button) => {
    const docId = button.dataset.docId;
    const item = button.closest('.list-item');
    const doc = docsById.get(docId);
    if (!item || !doc || item.querySelector(`[data-doc-workflow-panel="${docId}"]`)) return;
    item.insertAdjacentHTML('beforeend', panelHtml(doc));
    bindWorkflowButton(docId);
  });
}

function hasDocumentButtons() {
  return Boolean(document.querySelector('[data-doc-id]'));
}

async function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(async () => {
    scheduled = false;
    if (!hasDocumentButtons()) return;
    const loaded = await loadCard();
    if (loaded) enhanceDocuments();
  });
}

function boot() {
  const app = document.getElementById('app') || document.body;
  if (!observerStarted) {
    observerStarted = true;
    new MutationObserver(scheduleEnhance).observe(app, { childList: true, subtree: true });
  }
  scheduleEnhance();
}

boot();
