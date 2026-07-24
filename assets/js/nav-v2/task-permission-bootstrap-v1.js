export const TASK_PERMISSION_BOOTSTRAP_KEY = '__NAV_V2_TASK_PERMISSION_BOOTSTRAP_V1__';
export const TASK_PERMISSION_BOOTSTRAP_EVENT = 'nav-v2-task-permissions-ready';

const PERMISSION_FIELDS = Object.freeze([
  'can_change_status',
  'can_start',
  'can_complete',
  'can_set_active_outcome',
  'can_propose_terminal_outcome',
  'can_decide_terminal_outcome'
]);

function text(value) {
  return String(value ?? '').trim();
}

function boolValue(value) {
  return value === true || value === 'true';
}

function permissionTask(task = {}) {
  const id = text(task.id);
  if (!id) return null;
  const result = {
    id,
    status: text(task.status) || null,
    assigned_role: text(task.assigned_role) || null,
    task_contract_version: Number.isFinite(Number(task.task_contract_version))
      ? Number(task.task_contract_version)
      : null,
    outcome_state: text(task.outcome_state) || null
  };
  for (const field of PERMISSION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(task, field)) result[field] = boolValue(task[field]);
  }
  return Object.freeze(result);
}

export function buildTaskPermissionBootstrap(data = {}) {
  const dealId = text(data?.deal?.id);
  if (!dealId) return null;
  const tasks = (Array.isArray(data?.tasks) ? data.tasks : [])
    .map(permissionTask)
    .filter(Boolean);
  return Object.freeze({
    schema_version: 1,
    deal_id: dealId,
    tasks: Object.freeze(tasks)
  });
}

export function readTaskPermissionBootstrap(target = globalThis, expectedDealId = '') {
  let snapshot = null;
  try { snapshot = target?.[TASK_PERMISSION_BOOTSTRAP_KEY] || null; } catch (_) { return null; }
  if (!snapshot || snapshot.schema_version !== 1) return null;
  if (text(expectedDealId) && text(snapshot.deal_id) !== text(expectedDealId)) return null;
  return snapshot;
}

export function publishTaskPermissionBootstrap(data = {}, target = globalThis) {
  const snapshot = buildTaskPermissionBootstrap(data);
  if (!snapshot || !target) return null;
  try {
    Object.defineProperty(target, TASK_PERMISSION_BOOTSTRAP_KEY, {
      value: snapshot,
      configurable: true,
      enumerable: false,
      writable: false
    });
  } catch (_) {
    try { target[TASK_PERMISSION_BOOTSTRAP_KEY] = snapshot; } catch (_) { return null; }
  }
  if (typeof target.dispatchEvent === 'function' && typeof target.CustomEvent === 'function') {
    target.dispatchEvent(new target.CustomEvent(TASK_PERMISSION_BOOTSTRAP_EVENT, {
      detail: Object.freeze({ deal_id: snapshot.deal_id, task_count: snapshot.tasks.length })
    }));
  }
  return snapshot;
}

export const TASK_PERMISSION_BOOTSTRAP_POLICY = Object.freeze({
  authority: 'full_deal_card_server_permission',
  storage: 'memory_only',
  contains_pii: false,
  permission_inference: false,
  production_schema_change: false,
  fail_closed_without_snapshot: true
});
