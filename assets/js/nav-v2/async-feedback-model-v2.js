const PHASES = new Set(['idle', 'busy', 'success', 'error']);
const MODES = new Set(['keyboard', 'pointer']);
const TOKENS = new Set(['spn-submitted', 'spn-returned', 'lawyer-document']);

export function asyncActivationMode(clickDetail) {
  return Number(clickDetail) === 0 ? 'keyboard' : 'pointer';
}

export function buildAsyncFeedbackPolicy(phase, mode = 'pointer') {
  const normalizedPhase = PHASES.has(phase) ? phase : 'idle';
  const normalizedMode = MODES.has(mode) ? mode : 'pointer';
  const policies = {
    idle: { role: 'status', live: 'polite', busy: false, focus: false },
    busy: { role: 'status', live: 'polite', busy: true, focus: false },
    success: { role: 'status', live: 'polite', busy: false, focus: false },
    error: { role: 'alert', live: 'assertive', busy: false, focus: normalizedMode === 'keyboard' }
  };
  return {
    phase: normalizedPhase,
    mode: normalizedMode,
    atomic: true,
    ...policies[normalizedPhase]
  };
}

export function asyncFocusToken(value) {
  return TOKENS.has(value) ? value : '';
}

export function asyncFocusSelectors(token) {
  const normalized = asyncFocusToken(token);
  return ({
    'spn-submitted': [
      '#spnReworkWorkflowV2[data-spn-rework-phase="submitted"]',
      '#dealCompletionEvidenceV2',
      '#dealActionFocus'
    ],
    'spn-returned': [
      '#spnReworkWorkflowV2[data-spn-rework-phase="fix"]',
      '#dealActionFocus'
    ],
    'lawyer-document': [
      '#lawyerDocumentCycleV2 .lawyer-document-confirmation',
      '#dealCompletionEvidenceV2',
      '#lawyerDocumentCycleV2',
      '#dealActionFocus'
    ]
  })[normalized] || [];
}

export function classifyAsyncStatus(className, actionDisabled) {
  const classes = new Set(String(className || '').split(/\s+/).filter(Boolean));
  if (classes.has('error')) return 'error';
  if (classes.has('ok')) return 'success';
  if (classes.has('warn') && actionDisabled) return 'busy';
  return 'idle';
}
