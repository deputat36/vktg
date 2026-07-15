import assert from 'node:assert/strict';
import {
  actionDialogContract,
  buildDocumentProblemDialog,
  buildRiskResolutionDialog,
  nativeDialogDecision,
  nativeDialogInventory
} from '../assets/js/nav-v2/action-dialog-model-v2.js';

const inventory = nativeDialogInventory();
assert.equal(inventory.length, 10);
assert.equal(inventory.filter((item) => item.decision === 'replace_now').length, 2);
assert.equal(nativeDialogDecision('risk-resolution').decision, 'replace_now');
assert.equal(nativeDialogDecision('deal-document-problem').decision, 'replace_now');
assert.equal(nativeDialogDecision('deal-lawyer-handoff').decision, 'candidate');
assert.equal(nativeDialogDecision('deal-demo-guard').decision, 'keep_native');
assert.equal(nativeDialogDecision('unknown'), null);

const resolveDialog = buildRiskResolutionDialog({
  nextState: true,
  isDemo: true,
  riskTitle: 'Не согласованы расчёты'
});
assert.equal(resolveDialog.id, 'risk-resolution');
assert.equal(resolveDialog.title, 'Устранить риск');
assert.equal(resolveDialog.confirmLabel, 'Устранить риск');
assert.equal(resolveDialog.input.required, false);
assert.equal(resolveDialog.details.length, 2);
assert.match(resolveDialog.details[0], /Не согласованы расчёты/);
assert.match(resolveDialog.details[1], /демо-сделка/);
assert.equal(resolveDialog.fallbackConfirm, true);

const reopenDialog = buildRiskResolutionDialog({ nextState: false });
assert.equal(reopenDialog.title, 'Вернуть риск в работу');
assert.equal(reopenDialog.tone, 'warning');
assert.equal(reopenDialog.details.length, 0);

const documentDialog = buildDocumentProblemDialog({
  documentTitle: 'Выписка ЕГРН',
  isDemo: true
});
assert.equal(documentDialog.id, 'deal-document-problem');
assert.equal(documentDialog.title, 'Зафиксировать проблему документа');
assert.equal(documentDialog.confirmLabel, 'Сохранить проблему');
assert.equal(documentDialog.tone, 'danger');
assert.equal(documentDialog.fallbackConfirm, false);
assert.equal(documentDialog.input.required, true);
assert.equal(documentDialog.input.minLength, 1);
assert.match(documentDialog.details[0], /Выписка ЕГРН/);
assert.match(documentDialog.details[1], /Проблема/);
assert.match(documentDialog.details[2], /демо-сделка/);

assert.deepEqual(actionDialogContract(), {
  nativeDialogPreferred: true,
  confirmPromptFallbackAllowed: true,
  escapeCancelsMutation: true,
  cancelButtonRequired: true,
  focusReturnsToTrigger: true,
  inputDraftMemoryOnly: true,
  draftPreservedOnCancel: true,
  draftPreservedOnServerError: true,
  draftClearedOnlyAfterSuccess: true,
  stableAccessibleNameRequired: true,
  stableAccessibleDescriptionRequired: true,
  positiveTabindexAllowed: false,
  storageAllowed: false,
  networkAllowed: false,
  rpcAllowed: false
});

console.log('Navigator v2 action dialog semantic checks passed');
