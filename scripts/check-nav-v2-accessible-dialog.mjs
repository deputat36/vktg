import assert from 'node:assert/strict';
import {
  accessibleDialogContract,
  accessibleDialogInventory,
  accessibleDialogPolicy,
  accessibleDialogValidation
} from '../assets/js/nav-v2/accessible-dialog-model-v2.js';

assert.deepEqual(accessibleDialogInventory().controlled, [
  'lawyer_handoff_blockers',
  'document_problem_reason',
  'risk_resolution_comment'
]);
assert.equal(accessibleDialogInventory().native.length, 5);

const handoff = accessibleDialogPolicy('lawyer_handoff_blockers', {
  items: ['Не хватает документа', 'Есть красный риск'],
  demo: true
});
assert.equal(handoff.kind, 'confirm');
assert.equal(handoff.items.length, 2);
assert.match(handoff.demoText, /демо-сделка/i);

const documentProblem = accessibleDialogPolicy('document_problem_reason', {
  subject: 'Выписка ЕГРН'
});
assert.equal(documentProblem.inputRequired, true);
assert.match(documentProblem.description, /Выписка ЕГРН/);

const risk = accessibleDialogPolicy('risk_resolution_comment', {
  actionLabel: 'Устранить риск',
  subject: 'Не получено согласие'
});
assert.match(risk.title, /Устранить риск/);
assert.equal(risk.inputRequired, false);

assert.deepEqual(accessibleDialogValidation({ key: 'document_problem_reason', value: '' }), {
  valid: false,
  reason: 'required_or_too_short'
});
assert.deepEqual(accessibleDialogValidation({ key: 'document_problem_reason', value: 'Нет подписи' }), {
  valid: true,
  reason: ''
});
assert.deepEqual(accessibleDialogValidation({ key: 'risk_resolution_comment', value: '' }), {
  valid: true,
  reason: ''
});

assert.deepEqual(accessibleDialogContract(), {
  nativeDialogPreferred: true,
  roleDialogFallback: true,
  escapeCancelsWithoutMutation: true,
  cancelRestoresTriggerFocus: true,
  serverErrorPreservesInput: true,
  promptReplayIsBounded: true,
  nativeConfirmRetainedWhenReplacementAddsNoValue: true,
  positiveTabindexAllowed: false,
  storageAllowed: false,
  networkAllowed: false
});

console.log('Navigator v2 accessible dialog semantic checks passed');
