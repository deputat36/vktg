import {
  detectSensitiveFreeText,
  sensitiveFreeTextMessage
} from './sensitive-free-text-model-v2.js?v=20260715-01';

const INSTALL_KEY = 'navSensitiveFreeTextGuardInstalled';
const ERROR_ATTR = 'data-sensitive-free-text-error';
const BLOCKING_ACTIONS = '#addComment, [data-action="save"], [data-action="draft"], [data-sensitive-free-text-submit]';
let sequence = 0;

function isEditableText(control) {
  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return false;
  if (control.disabled || control.readOnly || control.hasAttribute('data-allow-sensitive')) return false;
  if (control instanceof HTMLTextAreaElement) return true;
  return !control.type || control.type === 'text';
}

function errorNode(control) {
  const id = control.dataset.sensitiveFreeTextErrorId;
  return id ? document.getElementById(id) : null;
}

function preserveDescription(control, errorId) {
  const current = String(control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  if (!current.includes(errorId)) current.push(errorId);
  control.setAttribute('aria-describedby', current.join(' '));
}

function removeDescription(control, errorId) {
  const next = String(control.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (next.length) control.setAttribute('aria-describedby', next.join(' '));
  else control.removeAttribute('aria-describedby');
}

function ensureError(control) {
  const existing = errorNode(control);
  if (existing) return existing;
  const error = document.createElement('div');
  error.id = `navSensitiveFreeTextError${++sequence}`;
  error.className = 'status error';
  error.setAttribute('role', 'alert');
  error.setAttribute(ERROR_ATTR, 'true');
  error.hidden = true;
  control.dataset.sensitiveFreeTextErrorId = error.id;
  control.insertAdjacentElement('afterend', error);
  return error;
}

export function validateSensitiveFreeTextControl(control, options = {}) {
  if (!isEditableText(control)) return { valid: true, findings: [] };
  const findings = detectSensitiveFreeText(control.value);
  const error = findings.length ? ensureError(control) : errorNode(control);
  if (!findings.length) {
    if (error) {
      error.hidden = true;
      error.textContent = '';
      removeDescription(control, error.id);
    }
    control.removeAttribute('aria-invalid');
    control.removeAttribute('aria-errormessage');
    return { valid: true, findings: [] };
  }

  error.hidden = false;
  error.textContent = sensitiveFreeTextMessage(findings);
  preserveDescription(control, error.id);
  control.setAttribute('aria-invalid', 'true');
  control.setAttribute('aria-errormessage', error.id);
  if (options.focus) control.focus({ preventScroll: false });
  return { valid: false, findings };
}

function controlsWithin(root) {
  if (!(root instanceof Element || root instanceof Document)) return [];
  return [...root.querySelectorAll('textarea, input')].filter(isEditableText);
}

export function validateSensitiveFreeTextScope(root, options = {}) {
  const invalid = [];
  controlsWithin(root).forEach((control) => {
    const result = validateSensitiveFreeTextControl(control);
    if (!result.valid) invalid.push({ control, findings: result.findings });
  });
  if (invalid.length && options.focus !== false) invalid[0].control.focus({ preventScroll: false });
  return { valid: invalid.length === 0, invalid };
}

function scopeForAction(button) {
  if (!(button instanceof Element)) return document;
  if (button.id === 'addComment') return button.closest('.card') || document;
  if (button.closest('dialog')) return button.closest('dialog');
  if (button.matches('[data-action="save"], [data-action="draft"]')) return document.getElementById('app') || document;
  return button.closest('form, .card, main') || document;
}

function blockEvent(event, scope) {
  const result = validateSensitiveFreeTextScope(scope);
  if (result.valid) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}

function onInput(event) {
  if (isEditableText(event.target)) validateSensitiveFreeTextControl(event.target);
}

function onSubmit(event) {
  const form = event.target;
  if (form instanceof HTMLFormElement) blockEvent(event, form);
}

function onPointerAction(event) {
  const button = event.target?.closest?.(BLOCKING_ACTIONS);
  if (!button || button.disabled) return;
  blockEvent(event, scopeForAction(button));
}

export function installSensitiveFreeTextGuard(root = document) {
  const target = root instanceof Document ? root : document;
  if (target.documentElement?.dataset?.[INSTALL_KEY] === 'true') return false;
  if (target.documentElement) target.documentElement.dataset[INSTALL_KEY] = 'true';
  target.addEventListener('input', onInput, true);
  target.addEventListener('change', onInput, true);
  target.addEventListener('submit', onSubmit, true);
  target.addEventListener('pointerup', onPointerAction, true);
  target.addEventListener('click', onPointerAction, true);
  return true;
}
