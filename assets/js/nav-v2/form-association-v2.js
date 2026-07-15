import {
  fieldValidationState,
  formFieldIds,
  formFieldPolicy,
  mergeDescriptionIds
} from './form-association-model-v2.js?v=20260715-01';

const STATUS_BY_FIELD = Object.freeze({
  dealStatus: 'pageStatus',
  newComment: 'pageStatus',
  spnReworkCompletionText: 'spnReworkStatusV2',
  spnReworkReturnReason: 'spnReworkStatusV2',
  lawyerDocumentNoteV2: 'lawyerDocumentStatusV2'
});

const ACTIONS = Object.freeze([
  Object.freeze({ selector: '#addComment', fieldId: 'newComment' }),
  Object.freeze({ selector: '[data-spn-rework-submit]', fieldId: 'spnReworkCompletionText' }),
  Object.freeze({ selector: '[data-spn-rework-return]', fieldId: 'spnReworkReturnReason' }),
  Object.freeze({ selector: '[data-lawyer-document-action]', fieldId: 'lawyerDocumentNoteV2', conditionalAttribute: 'data-lawyer-document-note-required' })
]);

let installed = false;

function hiddenStyle(element) {
  element.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
}

function labelForField(field) {
  const explicit = document.querySelector(`label[for="${field.id}"]`);
  if (explicit instanceof HTMLLabelElement) return explicit;
  const local = field.closest('.field, .spn-rework-evidence')?.querySelector('label');
  if (!(local instanceof HTMLLabelElement)) return null;
  local.htmlFor = field.id;
  return local;
}

function existingHelp(field) {
  if (field.id === 'spnReworkCompletionText') {
    return field.closest('.spn-rework-evidence')?.querySelector('p.small') || null;
  }
  return null;
}

function ensureHelp(field, policy) {
  const existing = existingHelp(field);
  if (existing instanceof HTMLElement) {
    if (!existing.id) existing.id = `${field.id}Help`;
    return existing;
  }
  const id = `${field.id}Help`;
  let help = document.getElementById(id);
  if (!(help instanceof HTMLElement)) {
    help = document.createElement('span');
    help.id = id;
    help.textContent = policy.helpText;
    help.dataset.navFieldHelp = field.id;
    hiddenStyle(help);
    (field.closest('.field, .spn-rework-evidence') || field.parentElement)?.append(help);
  }
  return help;
}

function statusForField(fieldId) {
  const id = STATUS_BY_FIELD[fieldId];
  const status = id ? document.getElementById(id) : null;
  return status instanceof HTMLElement ? status : null;
}

function alternativeSelected(policy) {
  return Boolean(policy?.alternativeSelector && document.querySelector(policy.alternativeSelector));
}

function conditionalRequired(field) {
  return field.dataset.navConditionalRequired === '1';
}

function validationFor(field) {
  const policy = formFieldPolicy(field.id);
  return fieldValidationState({
    fieldId: field.id,
    value: field.value,
    alternativeSelected: alternativeSelected(policy),
    conditionalRequired: conditionalRequired(field)
  });
}

function clearFieldError(field) {
  field.removeAttribute('aria-invalid');
  field.removeAttribute('aria-errormessage');
  delete field.dataset.navFieldError;
}

function applyFieldError(field, status) {
  if (!(status instanceof HTMLElement)) return;
  if (!status.id) status.id = `${field.id}Error`;
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-errormessage', status.id);
  field.dataset.navFieldError = status.id;
}

function syncFieldValidity(field) {
  const state = validationFor(field);
  field.setAttribute('aria-required', state.required ? 'true' : 'false');
  if (!state.invalid) clearFieldError(field);
  return state;
}

function prepareField(field) {
  const policy = formFieldPolicy(field.id);
  if (!policy) return;
  const label = labelForField(field);
  if (label && !String(label.textContent || '').trim()) label.textContent = policy.labelText;
  const help = ensureHelp(field, policy);
  field.setAttribute('aria-describedby', mergeDescriptionIds(field.getAttribute('aria-describedby'), help?.id));
  field.dataset.navFormAssociation = 'ready';
  syncFieldValidity(field);
}

function prepareReturnOptions(root = document) {
  const group = root.querySelector('.spn-rework-options');
  if (!(group instanceof HTMLElement)) return;
  group.setAttribute('role', 'group');
  if (!group.getAttribute('aria-label')) group.setAttribute('aria-label', 'Замечания для возврата СПН');
  const reason = root.getElementById?.('spnReworkReturnReason') || document.getElementById('spnReworkReturnReason');
  const helpId = reason?.getAttribute('aria-describedby');
  if (helpId) group.setAttribute('aria-describedby', helpId);
}

function actionConfig(control) {
  return ACTIONS.find((item) => control.matches(item.selector)) || null;
}

function validateAfterAction(control, config) {
  const field = document.getElementById(config.fieldId);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;

  if (config.conditionalAttribute) {
    field.dataset.navConditionalRequired = control.getAttribute(config.conditionalAttribute) === '1' ? '1' : '0';
  }
  const state = syncFieldValidity(field);
  const status = statusForField(field.id);
  const clientErrorVisible = status?.classList.contains('error') && state.invalid;
  if (clientErrorVisible) applyFieldError(field, status);
}

function onAction(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const control = target.closest(ACTIONS.map((item) => item.selector).join(', '));
  if (!(control instanceof HTMLElement)) return;
  const config = actionConfig(control);
  if (!config) return;
  queueMicrotask(() => validateAfterAction(control, config));
}

function onFieldInput(event) {
  const field = event.target;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
  if (!formFieldPolicy(field.id)) return;
  syncFieldValidity(field);
}

function onAlternativeChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.matches('[data-spn-rework-option]')) return;
  const field = document.getElementById('spnReworkReturnReason');
  if (field instanceof HTMLTextAreaElement) syncFieldValidity(field);
}

export function applyFormAssociations(root = document) {
  formFieldIds().forEach((fieldId) => {
    const field = root.getElementById?.(fieldId) || document.getElementById(fieldId);
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) prepareField(field);
  });
  prepareReturnOptions(root);
}

export function installFormAssociationLifecycle() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('click', onAction);
  document.addEventListener('input', onFieldInput, true);
  document.addEventListener('change', onAlternativeChange, true);
}

installFormAssociationLifecycle();
