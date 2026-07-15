import { buildAsyncFeedbackPolicy } from './async-feedback-model-v2.js?v=20260715-01';

export function applyPageActionFeedback(message, phase = 'idle', statusId = 'pageStatus') {
  const status = document.getElementById(statusId);
  if (!(status instanceof HTMLElement)) return false;
  const current = ['idle', 'busy', 'success', 'error'].includes(phase) ? phase : 'idle';
  const policy = buildAsyncFeedbackPolicy(current, 'pointer');
  const tone = current === 'busy' ? 'warn' : current === 'success' ? 'ok' : current === 'error' ? 'error' : '';
  status.className = `status ${tone}`.trim();
  status.setAttribute('role', policy.role);
  status.setAttribute('aria-live', policy.live);
  status.setAttribute('aria-atomic', 'true');
  status.setAttribute('aria-busy', policy.busy ? 'true' : 'false');
  status.dataset.navActionFeedbackPhase = current;
  status.textContent = String(message || '');
  return true;
}
