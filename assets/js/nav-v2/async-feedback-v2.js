import {
  asyncActivationMode,
  asyncFocusSelectors,
  asyncFocusToken,
  buildAsyncFeedbackPolicy,
  classifyAsyncStatus
} from './async-feedback-model-v2.js?v=20260715-01';

const ACTIONS = [
  { selector: '[data-spn-rework-submit]', status: '#spnReworkStatusV2', token: 'spn-submitted' },
  { selector: '[data-spn-rework-return]', status: '#spnReworkStatusV2', token: 'spn-returned' },
  { selector: '[data-lawyer-document-action]', status: '#lawyerDocumentStatusV2', token: 'lawyer-document' }
];
const FOCUS_PARAM = 'nav_focus';
const WATCH_INTERVAL_MS = 50;
const WATCH_TIMEOUT_MS = 20000;
let installed = false;
let lastFocusRequest = '';
const lastAnnouncements = new WeakMap();

function reducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function prepareStatus(status) {
  if (!(status instanceof HTMLElement)) return;
  if (!status.getAttribute('role')) status.setAttribute('role', 'status');
  if (!status.getAttribute('aria-live')) status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  if (!status.hasAttribute('aria-busy')) status.setAttribute('aria-busy', 'false');
}

function applyPolicy(status, phase, mode) {
  if (!(status instanceof HTMLElement)) return;
  const policy = buildAsyncFeedbackPolicy(phase, mode);
  const key = `${policy.phase}|${status.textContent || ''}`;
  if (lastAnnouncements.get(status) === key) return;
  lastAnnouncements.set(status, key);
  status.setAttribute('role', policy.role);
  status.setAttribute('aria-live', policy.live);
  status.setAttribute('aria-atomic', policy.atomic ? 'true' : 'false');
  status.setAttribute('aria-busy', policy.busy ? 'true' : 'false');

  if (!policy.focus) return;
  const active = document.activeElement;
  const editing = active instanceof HTMLElement
    && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
    && status.closest('section, article')?.contains(active);
  if (editing) return;
  status.tabIndex = -1;
  queueMicrotask(() => status.focus({ preventScroll: true }));
}

function publishFocusToken(token) {
  const normalized = asyncFocusToken(token);
  if (!normalized) return;
  const url = new URL(location.href);
  url.searchParams.set(FOCUS_PARAM, normalized);
  history.replaceState(history.state, '', url);
}

function watchAction(action, config, mode) {
  const status = document.querySelector(config.status);
  if (!(status instanceof HTMLElement)) return;
  prepareStatus(status);
  const initial = `${status.className}|${status.textContent || ''}`;
  const started = Date.now();
  let changed = false;
  const timer = setInterval(() => {
    if (!document.contains(status)) {
      clearInterval(timer);
      return;
    }
    const fingerprint = `${status.className}|${status.textContent || ''}`;
    if (fingerprint !== initial) changed = true;
    const phase = classifyAsyncStatus(status.className, Boolean(action?.disabled));
    applyPolicy(status, phase, mode);

    if (phase === 'success') {
      publishFocusToken(config.token);
      clearInterval(timer);
      return;
    }
    if (phase === 'error') {
      clearInterval(timer);
      return;
    }
    if (!changed && Date.now() - started > 700 && !action?.disabled) {
      clearInterval(timer);
      return;
    }
    if (Date.now() - started > WATCH_TIMEOUT_MS) clearInterval(timer);
  }, WATCH_INTERVAL_MS);
}

function actionConfig(target) {
  if (!(target instanceof Element)) return null;
  for (const config of ACTIONS) {
    const action = target.closest(config.selector);
    if (action) return { action, config };
  }
  return null;
}

function focusRequestedTarget(root = document) {
  const url = new URL(location.href);
  const token = asyncFocusToken(url.searchParams.get(FOCUS_PARAM));
  if (!token) return false;
  const requestKey = `${location.pathname}|${token}`;
  if (lastFocusRequest === requestKey) return false;
  const target = asyncFocusSelectors(token)
    .map((selector) => root.querySelector(selector))
    .find((candidate) => candidate instanceof HTMLElement);
  if (!(target instanceof HTMLElement)) return false;

  lastFocusRequest = requestKey;
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  url.searchParams.delete(FOCUS_PARAM);
  history.replaceState(history.state, '', url);
  return true;
}

export function applyAccessibleAsyncFeedback(root = document) {
  ACTIONS.forEach((config) => {
    const status = root.querySelector(config.status);
    if (status instanceof HTMLElement) prepareStatus(status);
  });
  focusRequestedTarget(root);
}

export function installAccessibleAsyncFeedback() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('click', (event) => {
    const match = actionConfig(event.target);
    if (!match) return;
    const mode = asyncActivationMode(event.detail);
    queueMicrotask(() => watchAction(match.action, match.config, mode));
  }, true);
}

installAccessibleAsyncFeedback();
