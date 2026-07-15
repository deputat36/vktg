import {
  baseDescriptionIds,
  fieldAssociationPolicy,
  validationDescriptionIds
} from './form-association-model-v2.js?v=20260715-01';

const FIELD_IDS = Object.freeze([
  'dealSearch',
  'dealFilter',
  'dealStatus',
  'newComment',
  'spnReworkCompletionText',
  'spnReworkReturnReason',
  'lawyerDocumentNoteV2'
]);

const ACTION_RULES = Object.freeze([
  Object.freeze({ selector: '#addComment', fieldId: 'newComment', statusId: 'pageStatus' }),
  Object.freeze({ selector: '[data-spn-rework-submit]', fieldId: 'spnReworkCompletionText', statusId: 'spnReworkStatusV2' }),
  Object.freeze({ selector: '[data-spn-rework-return]', fieldId: 'spnReworkReturnReason', statusId: 'spnReworkStatusV2' }),
  Object.freeze({ selector: '[data-lawyer-document-action][data-lawyer-document-note-required="1"]', fieldId: 'lawyerDocumentNoteV2', statusId: 'lawyerDocumentStatusV2' })
]);

let delegatedValidationBound = false;

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

function createHiddenHelp(control, policy, id) {
  if (!policy?.helpText || !id || document.getElementById(id)) return;
  const helper = document.createElement('span');
  helper.id = id;
  helper.dataset.navFieldHelp = 'true';
  helper.textContent = policy.helpText;
  helper.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
  const host = control.closest('.field') || control.parentElement || document.body;
  host.append(helper);
}

function existingHelpIds(control, policy) {
  for (const id of policy?.helpIds || []) createHiddenHelp(control, policy, id);
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
  const helpIds = existingHelpIds(control, policy);
  const baseIds = baseDescriptionIds({
    existing: control.getAttribute('aria-describedby') || '',
    helpIds,
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

function statusIsLocalError(statusId) {
  const status = statusId ? document.getElementById(statusId) : null;
  return status instanceof HTMLElement && status.classList.contains('error');
}

function bindDelegatedValidation() {
  if (delegatedValidationBound || typeof document === 'undefined') return;
  delegatedValidationBound = true;
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const rule = ACTION_RULES.find((candidate) => target.closest(candidate.selector));
    if (!rule) return;
    queueMicrotask(() => setFieldValidation(rule.fieldId, statusIsLocalError(rule.statusId)));
  }, true);
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-spn-rework-option]')) clearFieldValidation('spnReworkReturnReason');
  }, true);
}

export function applyFormAssociations(root = document) {
  let prepared = 0;
  for (const fieldId of FIELD_IDS) {
    const policy = fieldAssociationPolicy(fieldId);
    const control = root instanceof HTMLElement && root.id === fieldId ? root : root.querySelector?.(`#${CSS.escape(fieldId)}`);
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) continue;
    prepareControl(control, policy);
    prepared += 1;
  }
  bindDelegatedValidation();
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
    helpIds: existingHelpIds(control, policy),
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
