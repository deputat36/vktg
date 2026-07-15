const FEEDBACK_STATES = new Set(['idle', 'busy', 'success', 'error']);
const CONFIRMED_TARGETS = {
  dealCompletionEvidenceV2: 'Подтверждённый результат и следующий шаг',
  spnReworkWorkflowV2: 'Результат повторной отправки СПН',
  lawyerDocumentCycleV2: 'Подтверждённый документный цикл',
  dealActionFocus: 'Главное действие по сделке'
};

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function feedbackPolicy(state = 'idle') {
  const normalized = FEEDBACK_STATES.has(state) ? state : 'idle';
  return Object.freeze({
    state: normalized,
    role: normalized === 'error' ? 'alert' : 'status',
    live: normalized === 'error' ? 'assertive' : 'polite',
    busy: normalized === 'busy',
    focusOnKeyboard: normalized === 'error',
    tone: normalized === 'error' ? 'error' : normalized === 'success' ? 'ok' : normalized === 'busy' ? 'warn' : ''
  });
}

export function feedbackFingerprint({ state = 'idle', message = '' } = {}) {
  return `${feedbackPolicy(state).state}:${clean(message)}`;
}

export function confirmedFocusTarget(targetId) {
  const id = clean(targetId).replace(/^#/, '');
  if (!Object.hasOwn(CONFIRMED_TARGETS, id)) return null;
  return Object.freeze({ id, selector: `#${id}`, label: CONFIRMED_TARGETS[id] });
}

export function reloadHashForTarget(targetId) {
  const target = confirmedFocusTarget(targetId);
  return target ? `#${target.id}` : '';
}

export function asyncFeedbackContract() {
  return Object.freeze({
    repeatedAnnouncementSuppressed: true,
    keyboardErrorMayReceiveFocus: true,
    pointerErrorDoesNotStealFocus: true,
    inputValuesPreservedOnError: true,
    serverConfirmedReloadUsesAllowlistedHashOnly: true,
    storageAllowed: false,
    networkTransportAdded: false
  });
}
