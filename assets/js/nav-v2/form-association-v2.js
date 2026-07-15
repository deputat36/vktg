import {
  baseDescriptionIds,
  fieldAssociationPolicy,
  validationDescriptionIds
} from './form-association-model-v2.js?v=20260715-01';

function resolveControl(fieldOrId) {
  if (fieldOrId instanceof HTMLInputElement || fieldOrId instanceof HTMLSelectElement || fieldOrId instanceof HTMLTextAreaElement) return fieldOrId;
  const id = String(fieldOrId || '').trim();
  return id ? document.getElementById(id) : null;
}

function labelFor(control) {
  if (!(control instanceof HTMLElement) || !control.id) return null;
  const explicit = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
  if (explicit instanceof HTMLLabelElement) return explicit;
  const wrapping = control.closest('label');
  if (wrapping instanceof HTMLLabelElement) return wrapping;
  const field = control.closest('.field');
  const adjacent = field?.querySelector(':scope > label');
  if (adjacent instanceof HTMLLabelElement) {
    adjacent.htmlFor = control.id;
    return adjacent;
  }
  return null;
}

function existingHelpIds(policy) {
  return (policy?.helpIds || []).filter((id) => document.getElementById(id));
}

function writeDescription(control, ids) {
  const value = ids.join(' ');
  if (value) control.setAttribute('aria-describedby', value);
  else control.removeAttribute('aria-describedby');
}

function prepareControl(control, policy) {
  if (!(control instanceof HTMLElement) || !policy) return;
  const label = labelFor(control);
  if (!label && !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby')) {
    control.setAttribute('aria-label', policy.name);
  }
  const baseIds = baseDescriptionIds({
    existing: control.getAttribute('aria-describedby') || '',
    helpIds: existingHelpIds(policy),
    statusId: policy.statusId
  });
  control.dataset.navFieldBaseDescription = baseIds.join(' ');
  control.dataset.navFieldStatus = policy.statusId || '';
  writeDescription(control, validationDescriptionIds({ baseIds, statusId: policy.statusId, invalid: control.getAttribute('aria-invalid') === 'true' }));
  if (control.dataset.navFieldRecoveryBound !== '1') {
    const clear = () => clearFieldValidation(control);
    control.addEventListener('input', clear);
    control.addEventListener('change', clear);
    control.dataset.navFieldRecoveryBound = '1';
  }
}

export function applyFormAssociations(root = document) {
  let prepared = 0;
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
    const control = root instanceof HTMLElement && root.id === fieldId ? root : root.querySelector?.(`#${CSS.escape(fieldId)}`);
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) continue;
    prepareControl(control, policy);
    prepared += 1;
  }
  return prepared;
}

export function setFieldValidation(fieldOrId, invalid = true) {
  const control = resolveControl(fieldOrId);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return false;
  const policy = fieldAssociationPolicy(control.id);
  if (!policy) return false;
  prepareControl(control, policy);
  const baseIds = baseDescriptionIds({
    existing: control.dataset.navFieldBaseDescription || control.getAttribute('aria-describedby') || '',
    helpIds: existingHelpIds(policy),
    statusId: policy.statusId
  });
  if (invalid) control.setAttribute('aria-invalid', 'true');
  else control.removeAttribute('aria-invalid');
  writeDescription(control, validationDescriptionIds({ baseIds, statusId: policy.statusId, invalid }));
  return true;
}

export function clearFieldValidation(fieldOrId) {
  return setFieldValidation(fieldOrId, false);
}
