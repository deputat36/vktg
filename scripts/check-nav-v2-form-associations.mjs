import assert from 'node:assert/strict';
import {
  baseDescriptionIds,
  describedByTokens,
  fieldAssociationContract,
  fieldAssociationPolicy,
  validationDescriptionIds
} from '../assets/js/nav-v2/form-association-model-v2.js';

assert.deepEqual(describedByTokens('help help error'), ['help', 'error']);
assert.deepEqual(
  baseDescriptionIds({ existing: 'legacy pageStatus legacy', helpIds: ['newCommentHelp'], statusId: 'pageStatus' }),
  ['legacy', 'newCommentHelp']
);
assert.deepEqual(
  validationDescriptionIds({ baseIds: ['newCommentHelp'], statusId: 'pageStatus', invalid: true }),
  ['newCommentHelp', 'pageStatus']
);
assert.deepEqual(
  validationDescriptionIds({ baseIds: ['newCommentHelp', 'pageStatus'], statusId: 'pageStatus', invalid: false }),
  ['newCommentHelp', 'pageStatus']
);

for (const fieldId of [
  'dealSearch',
  'dealFilter',
  'dealStatus',
  'newComment',
  'spnReworkCompletionText',
  'spnReworkReturnReason',
  'lawyerDocumentNoteV2'
]) {
  const policy = fieldAssociationPolicy(fieldId);
  assert.ok(policy, `${fieldId} policy must exist`);
  assert.equal(policy.id, fieldId);
  assert.ok(policy.name);
  assert.ok(policy.helpText);
  assert.ok(policy.helpIds.length > 0);
}

assert.equal(fieldAssociationPolicy('unknownField'), null);

const contract = fieldAssociationContract();
assert.equal(contract.placeholderIsNotName, true);
assert.equal(contract.explicitLabelPreferred, true);
assert.equal(contract.permanentHelpPreserved, true);
assert.equal(contract.errorAddedOnlyWhileInvalid, true);
assert.equal(contract.errorRemovedAfterEdit, true);
assert.equal(contract.globalStatusNotAttachedByDefault, true);
assert.equal(contract.unknownFieldsUntouched, true);
assert.equal(contract.hiddenHelperInsertionAllowed, true);
assert.equal(contract.visibleLayoutMutationAllowed, false);
assert.equal(contract.storageAllowed, false);
assert.equal(contract.networkAllowed, false);

console.log('Navigator v2 form association semantic checks passed');
