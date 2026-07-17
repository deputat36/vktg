const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ACTIVE_REASONS = Object.freeze({
  waiting_external: Object.freeze(['awaiting_counterparty', 'awaiting_bank', 'awaiting_document']),
  deferred: Object.freeze(['postponed_by_client', 'route_changed'])
});

const TERMINAL_REASONS = Object.freeze({
  not_applicable: Object.freeze(['no_longer_required', 'route_changed']),
  replaced: Object.freeze(['replaced_by_specific_task', 'duplicate_work_item']),
  cancelled: Object.freeze(['process_cancelled', 'route_changed'])
});

const ACTIONS = Object.freeze({
  legacy_update_task_status: {
    rpc: 'nav_v2_update_task_status',
    required: ['task_id', 'status'],
    enums: { status: ['open', 'in_progress', 'done'] }
  },
  bounded_task_start: {
    rpc: 'nav_v2_start_bounded_task',
    required: ['task_id', 'client_request_id', 'task_contract_version']
  },
  bounded_task_complete: {
    rpc: 'nav_v2_complete_bounded_task',
    required: ['task_id', 'evidence_reference_id', 'client_request_id', 'task_contract_version']
  },
  bounded_task_active_outcome: {
    rpc: 'nav_v2_set_bounded_task_active_outcome',
    required: ['task_id', 'outcome_code', 'reason_code', 'review_date', 'client_request_id', 'task_contract_version'],
    enums: { outcome_code: ['waiting_external', 'deferred'] }
  },
  bounded_task_terminal_proposal: {
    rpc: 'nav_v2_propose_bounded_task_terminal_outcome',
    required: ['task_id', 'outcome_code', 'reason_code', 'client_request_id', 'task_contract_version'],
    enums: { outcome_code: ['not_applicable', 'replaced', 'cancelled'] }
  },
  bounded_task_terminal_decision: {
    rpc: 'nav_v2_decide_bounded_task_terminal_outcome',
    required: ['task_id', 'decision', 'client_request_id', 'task_contract_version'],
    enums: { decision: ['confirm', 'reject'] }
  }
});

const UUID_FIELDS = new Set([
  'task_id',
  'evidence_reference_id',
  'replacement_task_id',
  'client_request_id'
]);

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredMissing(source, key) {
  if (key === 'task_contract_version') {
    return source[key] === null || source[key] === undefined || source[key] === '';
  }
  return source[key] === null || source[key] === undefined || clean(source[key]) === '';
}

function validCalendarDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function validateReason(action, normalized, errors) {
  if (action === 'bounded_task_active_outcome') {
    if (!ACTIVE_REASONS[normalized.outcome_code]?.includes(normalized.reason_code)) {
      errors.push('reason_code не разрешён для active outcome.');
    }
  }
  if (action === 'bounded_task_terminal_proposal') {
    if (!TERMINAL_REASONS[normalized.outcome_code]?.includes(normalized.reason_code)) {
      errors.push('reason_code не разрешён для terminal outcome.');
    }
  }
}

export function validateTaskEdgeAction(action, payload = {}) {
  const contract = ACTIONS[action];
  const errors = [];
  if (!contract) {
    return {
      ok: false,
      errors: ['Неизвестное task action.'],
      action: null,
      rpc: null,
      args: null,
      runtime_integrated: false,
      transport_enabled: false
    };
  }

  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  const allowed = new Set([
    ...contract.required,
    'replacement_task_id',
    'task_contract_version'
  ]);
  const unknown = Object.keys(source).filter((key) => !allowed.has(key));
  if (unknown.length) errors.push(`Неизвестные поля: ${unknown.join(', ')}.`);

  for (const key of contract.required) {
    if (requiredMissing(source, key)) errors.push(`Поле ${key} обязательно.`);
  }

  const normalized = {};
  for (const [key, value] of Object.entries(source)) {
    if (!allowed.has(key)) continue;
    if (key === 'task_contract_version') {
      normalized[key] = Number(value);
    } else if (UUID_FIELDS.has(key)) {
      const uuid = clean(value).toLowerCase();
      if (uuid && !UUID_RE.test(uuid)) errors.push(`${key} должен быть UUID.`);
      normalized[key] = uuid || null;
    } else {
      normalized[key] = clean(value);
    }
  }

  for (const [key, values] of Object.entries(contract.enums || {})) {
    if (!values.includes(normalized[key])) errors.push(`${key} имеет недопустимое значение.`);
  }

  if ('review_date' in normalized && normalized.review_date && !validCalendarDate(normalized.review_date)) {
    errors.push('review_date должен быть реальной датой YYYY-MM-DD.');
  }

  validateReason(action, normalized, errors);

  if (action === 'bounded_task_terminal_proposal') {
    if (normalized.outcome_code === 'replaced' && !normalized.replacement_task_id) {
      errors.push('Для replaced требуется replacement_task_id.');
    }
    if (normalized.outcome_code !== 'replaced' && normalized.replacement_task_id) {
      errors.push('replacement_task_id разрешён только для replaced.');
    }
    if (normalized.replacement_task_id && normalized.replacement_task_id === normalized.task_id) {
      errors.push('replacement_task_id должен отличаться от task_id.');
    }
  }

  if (action === 'legacy_update_task_status' && Number(source.task_contract_version) === 2) {
    errors.push('Legacy action запрещён для contract-v2 задачи.');
  }
  if (action.startsWith('bounded_') && normalized.task_contract_version !== 2) {
    errors.push('Governed action разрешён только для contract-v2 задачи.');
  }

  return {
    ok: errors.length === 0,
    errors,
    action,
    rpc: errors.length ? null : contract.rpc,
    args: errors.length ? null : normalized,
    runtime_integrated: false,
    transport_enabled: false
  };
}

export const TASK_EDGE_ACTION_CONTRACT = ACTIONS;
export const TASK_EDGE_REASON_CONTRACT = Object.freeze({
  active: ACTIVE_REASONS,
  terminal: TERMINAL_REASONS
});
