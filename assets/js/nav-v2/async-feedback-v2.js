import {
  confirmedFocusTarget,
  feedbackFingerprint,
  feedbackPolicy,
  publicErrorMessage,
  reloadHashForTarget
} from './async-feedback-model-v2.js?v=20260715-01';

const STATUS_SELECTOR = '#spnReworkStatusV2, #lawyerDocumentStatusV2, #pageStatus';
const ACTION_SELECTOR = [
  '[data-spn-rework-submit]',
  '[data-spn-rework-return]',
  '[data-lawyer-document-action]',
  '[data-legal-action]',
  '[data-quick-status]',
  '[data-doc-id]',
  '[data-task-id]',
  '#saveStatus',
  '#addComment'
].join(', ');

const FLOW_CONFIG = [
  {
    action: '[data-spn-rework-submit], [data-spn-rework-return]',
    status: '#spnReworkStatusV2',
    container: '#spnReworkWorkflowV2',
    confirmed: 'spnReworkWorkflowV2',
    context: 'повторную отправку карточки'
  },
  {
    action: '[data-lawyer-document-action]',
    status: '#lawyerDocumentStatusV2',
    container: '#lawyerDocumentCycleV2',
    confirmed: 'lawyerDocumentCycleV2',
    context: 'действие по документу'
  },
  {
    action: '[data-legal-action], [data-quick-status], [data-doc-id], [data-task-id], #saveStatus, #addComment',
    status: '#pageStatus',
    container: 'main.nav-v2-shell',
    confirmed: 'dealCompletionEvidenceV2',
    context: 'изменение в карточке'
  }
];

let installed = false;
let keyboardModality = false;
let announcer = null;
let lastAnnouncement = '';
let lastConfirmedHash = '';

function ensureAnnouncer() {
  if (announcer?.isConnected) return announcer;
  announcer = document.getElementById('navAsyncFeedbackAnnouncer');
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'navAsyncFeedbackAnnouncer';
    announcer.dataset.navAsyncFeedback = 'announcer';
    announcer.setAttribute('aria-atomic', 'true');
    announcer.style.cssText = 'position:fixed;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
    document.body.append(announcer);
  }
  return announcer;
}

function announce(state, message) {
  const text = String(message || '').trim();
  if (!text) return;
  const fingerprint = feedbackFingerprint({ state, message: text });
  if (fingerprint === lastAnnouncement) return;
  lastAnnouncement = fingerprint;
  const policy = feedbackPolicy(state);
  const region = ensureAnnouncer();
  region.setAttribute('role', policy.role);
  region.setAttribute('aria-live', policy.live);
  region.textContent = '';
  queueMicrotask(() => { region.textContent = text; });
}

function flowFor(control) {
  return FLOW_CONFIG.find((flow) => control.matches(flow.action)) || null;
}

function stateFromStatus(status, control) {
  if (status.classList.contains('error')) return 'error';
  if (status.classList.contains('ok')) return 'success';
  if (status.classList.contains('warn') || control?.disabled) return 'busy';
  return 'idle';
}

function decorateVisibleStatus(status, state) {
  const policy = feedbackPolicy(state);
  status.dataset.navAsyncState = policy.state;
  status.setAttribute('role', policy.role);
  status.setAttribute('aria-live', 'off');
  status.setAttribute('aria-atomic', 'true');
  status.setAttribute('aria-busy', policy.busy ? 'true' : 'false');
}

function setContainerBusy(flow, busy) {
  const container = document.querySelector(flow.container);
  if (container) container.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function friendlyError(status, flow) {
  const message = publicErrorMessage(status.textContent, flow.context);
  if (status.textContent !== message) status.textContent = message;
  return message;
}

function markConfirmedReload(flow) {
  const hash = reloadHashForTarget(flow.confirmed);
  if (!hash || location.hash === hash) return;
  history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
}

function applyState(status, control, flow) {
  const state = stateFromStatus(status, control);
  decorateVisibleStatus(status, state);
  setContainerBusy(flow, state === 'busy');

  let message = String(status.textContent || '').trim();
  if (state === 'error') message = friendlyError(status, flow);
  if (state === 'success' && /загружа|подтвержден|подтверждён/i.test(message)) markConfirmedReload(flow);

  announce(state, message);
  if (state === 'error' && keyboardModality) {
    status.tabIndex = -1;
    status.focus({ preventScroll: true });
    status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  return state;
}

function monitor(control, flow) {
  const startedAt = Date.now();
  let previous = '';

  function tick() {
    const status = document.querySelector(flow.status);
    if (!(status instanceof HTMLElement)) {
      if (Date.now() - startedAt < 1500) setTimeout(tick, 35);
      return;
    }

    const state = applyState(status, control, flow);
    const current = feedbackFingerprint({ state, message: status.textContent });
    const changed = current !== previous;
    previous = current;

    if (state === 'error' || state === 'success') return;
    if (Date.now() - startedAt < 20000 && (state === 'busy' || control.disabled || changed)) setTimeout(tick, 35);
  }

  queueMicrotask(tick);
}

function confirmedFocusNode(target) {
  if (target.id === 'lawyerDocumentCycleV2') {
    return target.querySelector('.lawyer-document-confirmation') || target.querySelector('.lawyer-document-focus') || target;
  }
  if (target.id === 'spnReworkWorkflowV2') {
    return target.querySelector('.spn-rework-confirmation') || target.querySelector('.spn-rework-result') || target;
  }
  return target;
}

function focusConfirmedHash() {
  const targetModel = confirmedFocusTarget(location.hash);
  if (!targetModel || lastConfirmedHash === targetModel.id) return;
  const target = document.querySelector(targetModel.selector);
  if (!(target instanceof HTMLElement)) return;
  const focusNode = confirmedFocusNode(target);
  if (!(focusNode instanceof HTMLElement)) return;

  lastConfirmedHash = targetModel.id;
  focusNode.tabIndex = -1;
  focusNode.setAttribute('role', 'status');
  focusNode.setAttribute('aria-live', 'polite');
  focusNode.setAttribute('aria-atomic', 'true');
  if (!focusNode.getAttribute('aria-label')) focusNode.setAttribute('aria-label', targetModel.label);
  focusNode.focus({ preventScroll: true });
  focusNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
  announce('success', targetModel.label);
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
}

export function applyAsyncFeedbackLifecycle(root = document) {
  root.querySelectorAll(STATUS_SELECTOR).forEach((status) => {
    if (status instanceof HTMLElement) decorateVisibleStatus(status, stateFromStatus(status, null));
  });
  const completion = root.querySelector('#dealCompletionEvidenceV2');
  if (completion instanceof HTMLElement && !confirmedFocusTarget(location.hash)) {
    completion.setAttribute('role', 'region');
    completion.setAttribute('aria-live', 'off');
  }
  focusConfirmedHash();
}

export function installAsyncFeedbackLifecycle() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', (event) => {
    if (['Tab', 'Enter', ' '].includes(event.key)) keyboardModality = true;
  }, true);
  document.addEventListener('pointerdown', () => { keyboardModality = false; }, true);
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest(ACTION_SELECTOR);
    if (!(control instanceof HTMLButtonElement)) return;
    const flow = flowFor(control);
    if (!flow) return;
    const status = document.querySelector(flow.status);
    if (status instanceof HTMLElement) status.setAttribute('aria-live', 'off');
    monitor(control, flow);
  }, true);
}

installAsyncFeedbackLifecycle();
