import assert from 'node:assert/strict';
import {
  fieldValidationState,
  formAssociationContract,
  formFieldIds,
  formFieldPolicy,
  mergeDescriptionIds
} from '../assets/js/nav-v2/form-association-model-v2.js';

assert.deepEqual(formFieldIds(), [
  'dealSearch',
  'dealFilter',
  'dealStatus',
  'newComment',
  'spnReworkCompletionText',
  'spnReworkReturnReason',
  'lawyerDocumentNoteV2'
]);

assert.equal(formFieldPolicy('dealSearch').labelText, 'Поиск сделок');
assert.equal(formFieldPolicy('dealFilter').labelText, 'Режим списка сделок');
assert.equal(formFieldPolicy('spnReworkCompletionText').minLength, 10);
assert.equal(formFieldPolicy('lawyerDocumentNoteV2').minLength, 5);
assert.equal(formFieldPolicy('unknown'), null);

assert.equal(mergeDescriptionIds('help-one help-two', 'help-two', 'error-one'), 'help-one help-two error-one');

assert.deepEqual(fieldValidationState({ fieldId: 'dealSearch', value: '' }), {
  invalid: false,
  required: false,
  reason: ''
});
assert.deepEqual(fieldValidationState({ fieldId: 'dealFilter', value: 'work' }), {
  invalid: false,
  required: false,
  reason: ''
});
assert.deepEqual(fieldValidationState({ fieldId: 'newComment', value: '' }), {
  invalid: true,
  required: true,
  reason: 'required_or_too_short'
});
assert.deepEqual(fieldValidationState({ fieldId: 'newComment', value: 'Готово' }), {
  invalid: false,
  required: true,
  reason: ''
});
assert.deepEqual(fieldValidationState({ fieldId: 'spnReworkReturnReason', value: '', alternativeSelected: false }), {
  invalid: true,
  required: false,
  reason: 'alternative_or_too_short'
});
assert.deepEqual(fieldValidationState({ fieldId: 'spnReworkReturnReason', value: '', alternativeSelected: true }), {
  invalid: false,
  required: false,
  reason: ''
});
assert.deepEqual(fieldValidationState({ fieldId: 'spnReworkReturnReason', value: 'Коротко', alternativeSelected: false }), {
  invalid: true,
  required: false,
  reason: 'alternative_or_too_short'
});
assert.deepEqual(fieldValidationState({ fieldId: 'lawyerDocumentNoteV2', value: '', conditionalRequired: false }), {
  invalid: false,
  required: false,
  reason: ''
});
assert.deepEqual(fieldValidationState({ fieldId: 'lawyerDocumentNoteV2', value: '', conditionalRequired: true }), {
  invalid: true,
  required: true,
  reason: 'required_or_too_short'
});

assert.deepEqual(formAssociationContract(), {
  explicitProgrammaticLabel: true,
  helpUsesAriaDescribedby: true,
  fieldErrorUsesAriaErrormessage: true,
  ariaInvalidOnlyForClientFieldError: true,
  ariaInvalidClearsOnInput: true,
  serverErrorDoesNotInvalidateValidField: true,
  liveAnnouncementOwnedByAsyncFeedback: true,
  positiveTabindexAllowed: false,
  layoutMutationAllowed: false,
  storageAllowed: false,
  networkAllowed: false
});

console.log('Navigator v2 form association semantic checks passed');
