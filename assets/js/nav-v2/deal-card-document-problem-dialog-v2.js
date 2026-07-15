import { rpc } from './supabase-v2.js';
import { buildDocumentProblemDialog } from './action-dialog-model-v2.js?v=20260715-02';
import { clearActionDialogDraft, requestActionDialog } from './action-dialog-v2.js?v=20260715-02';
import { applyPageActionFeedback } from './page-action-feedback-v2.js?v=20260715-01';

let cardData = null;

function documents() { return Array.isArray(cardData?.documents) ? cardData.documents : []; }
function isDemoDeal() {
  const deal = cardData?.deal || {};
  return deal?.deal_summary?.demo === true || deal?.wizard_snapshot?.demo === true || String(deal?.title || '').startsWith('ДЕМО:');
}
function documentTitle(documentId) { return documents().find((item) => String(item?.id || '') === String(documentId || ''))?.title || ''; }
function setPageStatus(message, type = 'busy') { return applyPageActionFeedback(message, type === 'ok' ? 'success' : type === 'error' ? 'error' : 'busy'); }

async function saveProblem(button) {
  const config = buildDocumentProblemDialog({ documentTitle: documentTitle(button.dataset.docId), isDemo: isDemoDeal() });
  const decision = await requestActionDialog(config, button);
  if (!decision.confirmed) return;
  const note = String(decision.value || '').trim();
  if (!note) {
    setPageStatus('Для проблемного документа нужна короткая причина.', 'error');
    return;
  }
  button.disabled = true;
  setPageStatus('Обновляю документ...');
  try {
    await rpc('nav_v2_update_document_workflow', {
      p_document_id: button.dataset.docId,
      p_status: 'problem',
      p_assigned_to: null,
      p_responsible_role: null,
      p_due_date: null,
      p_note: note
    });
    clearActionDialogDraft(button);
    setPageStatus('Проблема документа сохранена. Обновляю карточку...', 'ok');
    setTimeout(() => location.reload(), 250);
  } catch (error) {
    button.disabled = false;
    setPageStatus(`Ошибка документа: ${error.message}`, 'error');
  }
}

function bindProblemButtons() {
  document.querySelectorAll('[data-doc-id][data-doc-status="problem"]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.dataset.documentProblemDialog === 'ready') return;
    button.dataset.documentProblemDialog = 'ready';
    button.onclick = () => void saveProblem(button);
  });
}

export function applyDealCardDocumentProblemDialog(data) {
  try {
    cardData = data || cardData;
    bindProblemButtons();
  } catch (_) {
  }
}
