import {
  buildUxMeasurementEvent,
  surfaceFromPath,
  uiLatencyBucket,
  viewportBucket
} from './ux-measurement-model-v2.js?v=20260715-01';

export const NAV_V2_UX_EVENT = 'nav-v2:ux-measurement';

const PRIMARY_SELECTOR = '.mobile-first-screen-primary-action, #lawyerDocumentCycleV2 .lawyer-document-actions .btn.primary';
const DETAILS_SELECTOR = '.mobile-first-screen-more, .mobile-first-screen-details';
const MANAGER_ACTIONS = new Map([
  ['card', 'manager_card'],
  ['tasks', 'manager_tasks'],
  ['risks', 'manager_risks'],
  ['docs', 'manager_documents'],
  ['responsibility', 'manager_responsibility']
]);

let controller = null;

function nowValue() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function actionSlot(element) {
  return element.closest('.mobile-first-screen-more') ? 'secondary' : 'primary';
}

function actionKind(element, surface) {
  const managerKind = MANAGER_ACTIONS.get(String(element.dataset.managerActionKind || ''));
  if (managerKind) return managerKind;
  if (element.hasAttribute('data-spn-rework-submit')) return 'submit_rework';
  if (element.closest('[data-spn-rework-phase="submitted"]')) return 'open_recheck';
  if (element.hasAttribute('data-lawyer-document-action')) return 'document_workflow';
  if (element.hasAttribute('data-completion-next-tab') || element.hasAttribute('data-action-focus-tab')) return 'open_next_step';
  if (surface === 'dashboard') return 'open_priority';
  if (surface === 'deals') return 'continue_work';
  if (surface === 'manager') return 'manager_card';
  if (surface === 'deal_card') return 'open_next_step';
  return 'other_primary';
}

function safeSurface(options = {}) {
  const declared = String(options.surface || document.documentElement.dataset.navUxSurface || '').trim();
  return declared || surfaceFromPath(location.pathname);
}

export function startNavV2UxMeasurement(options = {}) {
  if (controller) return controller;
  const surface = safeSurface(options);
  if (!surface) return null;

  const startedAt = Number.isFinite(Number(options.startedAt)) ? Number(options.startedAt) : nowValue();
  const eventTarget = options.eventTarget || window;

  function emit(input) {
    const detail = buildUxMeasurementEvent({
      ...input,
      surface,
      viewport: viewportBucket(window.innerWidth)
    });
    if (!detail) return null;
    eventTarget.dispatchEvent(new CustomEvent(NAV_V2_UX_EVENT, { detail }));
    return detail;
  }

  function onClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest(PRIMARY_SELECTOR);
    if (!action) return;
    emit({
      event_name: 'primary_action_opened',
      event_source: 'ui',
      action_kind: actionKind(action, surface),
      action_slot: actionSlot(action),
      duration_bucket: uiLatencyBucket(nowValue() - startedAt)
    });
  }

  function onToggle(event) {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.matches(DETAILS_SELECTOR) || !details.open) return;
    if (details.dataset.navUxOpened === '1') return;
    details.dataset.navUxOpened = '1';
    emit({
      event_name: 'secondary_details_opened',
      event_source: 'ui',
      action_kind: 'expand_context',
      action_slot: 'context'
    });
  }

  document.addEventListener('click', onClick);
  document.addEventListener('toggle', onToggle, true);
  document.documentElement.dataset.navUxMeasurement = 'event-only-v1';

  controller = Object.freeze({
    surface,
    stop() {
      document.removeEventListener('click', onClick);
      document.removeEventListener('toggle', onToggle, true);
      delete document.documentElement.dataset.navUxMeasurement;
      controller = null;
    }
  });
  return controller;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  startNavV2UxMeasurement();
}
