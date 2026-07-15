import assert from 'node:assert/strict';
import {
  actionDialogContract,
  buildDocumentProblemDialog,
  buildLawyerHandoffDialog,
  buildRiskResolutionDialog,
  nativeDialogDecision,
  nativeDialogInventory
} from '../assets/js/nav-v2/action-dialog-model-v2.js';

const inventory = nativeDialogInventory();
assert.equal(inventory.length, 10);
assert.equal(inventory.filter((item) => item.decision === 'replace_now').length, 3);
assert.equal(nativeDialogDecision('risk-resolution').decision, 'replace_now');
assert.equal(nativeDialogDecision('deal-document-problem').decision, 'replace_now');
assert.equal(nativeDialogDecision('deal-lawyer-handoff').decision, 'replace_now');
assert.equal(nativeDialogDecision('deal-demo-guard').decision, 'keep_native');
assert.equal(nativeDialogDecision('unknown'), null);

const resolveDialog = buildRiskResolutionDialog({
  nextState: true,
  isDemo: true,
  riskTitle: 'Не согласованы расчёты'
});
assert.equal(resolveDialog.id, 'risk-resolution');
assert.equal(resolveDialog.title, 'Устранить риск');
assert.equal(resolveDialog.input.required, false);
assert.equal(resolveDialog.details.length, 2);
assert.equal(resolveDialog.fallbackConfirm, true);

const documentDialog = buildDocumentProblemDialog({
  documentTitle: 'Выписка ЕГРН',
  isDemo: true
});
assert.equal(documentDialog.id, 'deal-document-problem');
assert.equal(documentDialog.input.required, true);
assert.equal(documentDialog.fallbackConfirm, false);
assert.match(documentDialog.details[0], /Выписка ЕГРН/);

const handoffDialog = buildLawyerHandoffDialog({
  issues: ['Не хватает документов: 2.', 'Есть красный риск: 1.'],
  isDemo: true
});
assert.equal(handoffDialog.id, 'deal-lawyer-handoff');
assert.equal(handoffDialog.title, 'Передать юристу с незакрытыми пунктами?');
assert.equal(handoffDialog.confirmLabel, 'Передать юристу');
assert.equal(handoffDialog.cancelLabel, 'Вернуться к карточке');
assert.equal(handoffDialog.input, null);
assert.equal(handoffDialog.details.length, 3);
assert.match(handoffDialog.details[2], /демо-сделка/);

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
