import { taskActionRoutePreview } from './task-action-router-v2.js?v=20260716-01';

export function installTaskActionAuthoritativeRehearsal({
  root,
  resolveTask,
  resolveInput = () => ({}),
  onResult = () => {}
} = {}) {
  if (!root || typeof root.addEventListener !== 'function') {
    throw new TypeError('root с addEventListener обязателен.');
  }
  if (typeof resolveTask !== 'function') {
    throw new TypeError('resolveTask обязателен.');
  }

  const inFlight = new Set();

  const listener = (event) => {
    const button = event.target?.closest?.('[data-task-rehearsal-action]');
    if (!button || !root.contains(button)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const taskId = String(button.dataset.taskId || '').trim();
    const action = String(button.dataset.taskRehearsalAction || '').trim();
    const key = `${taskId}:${action}`;
    if (!taskId || !action || inFlight.has(key)) return;

    const task = resolveTask(taskId);
    if (!task) {
      onResult({
        ok: false,
        errors: ['Synthetic task не найдена.'],
        mode: 'unknown',
        rpc_preview: null,
        transport_enabled: false,
        runtime_integrated: false,
        authoritative_handler: true
      }, { taskId, action, button });
      return;
    }

    inFlight.add(key);
    try {
      const input = resolveInput({ task, action, button }) || {};
      const result = taskActionRoutePreview({ task, action, input });
      onResult({
        ...result,
        transport_enabled: false,
        runtime_integrated: false,
        authoritative_handler: true,
        competing_handlers_suppressed: true
      }, { taskId, action, button });
    } finally {
      inFlight.delete(key);
    }
  };

  root.addEventListener('click', listener, { capture: true });
  root.dataset.taskAuthoritativeRehearsal = 'ready';

  return () => {
    root.removeEventListener('click', listener, { capture: true });
    delete root.dataset.taskAuthoritativeRehearsal;
  };
}

export const TASK_AUTHORITATIVE_REHEARSAL_CONTRACT = Object.freeze({
  event_phase: 'capture',
  stop_immediate_propagation: true,
  one_router_call_per_click: true,
  runtime_integrated: false,
  transport_enabled: false
});
