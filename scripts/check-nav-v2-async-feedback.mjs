import assert from 'node:assert/strict';
import {
  asyncFeedbackContract,
  confirmedFocusTarget,
  feedbackFingerprint,
  feedbackPolicy,
  publicErrorMessage,
  reloadHashForTarget
} from '../assets/js/nav-v2/async-feedback-model-v2.js';

assert.deepEqual(feedbackPolicy('busy'), {
  state: 'busy',
  role: 'status',
  live: 'polite',
  busy: true,
  focusOnKeyboard: false,
  tone: 'warn'
});
assert.equal(feedbackPolicy('error').role, 'alert');
assert.equal(feedbackPolicy('error').live, 'assertive');
assert.equal(feedbackPolicy('error').focusOnKeyboard, true);
assert.equal(feedbackFingerprint({ state: 'busy', message: '  Сохраняю   данные ' }), 'busy:Сохраняю данные');

const technical = publicErrorMessage('JWT expired: unauthorized', 'действие по документу');
assert.match(technical, /Не удалось сохранить действие по документу/);
assert.match(technical, /Введённые данные сохранены/);
assert.doesNotMatch(technical, /JWT|unauthorized/i);

const readable = publicErrorMessage('Срок документа уже изменён', 'действие');
assert.match(readable, /Срок документа уже изменён/);
assert.match(readable, /Повторите действие той же кнопкой/);

assert.deepEqual(confirmedFocusTarget('#dealCompletionEvidenceV2'), {
  id: 'dealCompletionEvidenceV2',
  selector: '#dealCompletionEvidenceV2',
  label: 'Подтверждённый результат и следующий шаг'
});
assert.equal(confirmedFocusTarget('#unknownTarget'), null);
assert.equal(reloadHashForTarget('spnReworkWorkflowV2'), '#spnReworkWorkflowV2');
assert.equal(reloadHashForTarget('javascript:alert(1)'), '');

assert.deepEqual(asyncFeedbackContract(), {
  repeatedAnnouncementSuppressed: true,
  keyboardErrorMayReceiveFocus: true,
  pointerErrorDoesNotStealFocus: true,
  inputValuesPreservedOnError: true,
  serverConfirmedReloadUsesAllowlistedHashOnly: true,
  rawTechnicalErrorsHiddenFromWorkUi: true,
  storageAllowed: false,
  networkTransportAdded: false
});

console.log('Navigator v2 accessible async feedback semantic checks passed');
