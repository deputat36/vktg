const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const SUBJECT_KINDS = new Set(['deal', 'document', 'review', 'corporate_document', 'calendar', 'external_confirmation']);

const CATALOG = Object.freeze({
  document_request: { roles: ['spn', 'manager'], defaultSla: 2, maxSla: 5, criterion: 'document_received', evidence: ['document_status', 'external_confirmation', 'comment_reference'], gate: 'deposit', subjects: ['document'] },
  document_check: { roles: ['spn', 'lawyer', 'broker', 'manager'], defaultSla: 1, maxSla: 3, criterion: 'document_checked', evidence: ['document_status', 'review_decision'], gate: 'deal', subjects: ['document', 'review'] },
  term_approval: { roles: ['spn', 'manager'], defaultSla: 2, maxSla: 5, criterion: 'terms_confirmed', evidence: ['agreement_status', 'comment_reference'], gate: 'deposit', subjects: ['deal', 'external_confirmation'] },
  legal_decision: { roles: ['lawyer'], defaultSla: 1, maxSla: 3, criterion: 'legal_decision_recorded', evidence: ['review_decision'], gate: 'deposit', subjects: ['deal', 'review'] },
  financial_decision: { roles: ['broker'], defaultSla: 2, maxSla: 5, criterion: 'financial_decision_recorded', evidence: ['review_decision', 'external_confirmation'], gate: 'deal', subjects: ['deal', 'review'] },
  corporate_document_signing: { roles: ['spn', 'manager'], defaultSla: 3, maxSla: 7, criterion: 'corporate_document_signed', evidence: ['corporate_document_status'], gate: 'corporate', subjects: ['corporate_document'] },
  card_correction: { roles: ['spn', 'manager'], defaultSla: 1, maxSla: 3, criterion: 'card_fields_corrected', evidence: ['card_validation'], gate: 'none', subjects: ['deal'] },
  contract_preparation: { roles: ['lawyer'], defaultSla: 2, maxSla: 5, criterion: 'contract_draft_ready', evidence: ['contract_reference', 'review_decision'], gate: 'deal', subjects: ['deal', 'review'] },
  appointment_scheduling: { roles: ['spn', 'manager'], defaultSla: 2, maxSla: 5, criterion: 'appointment_confirmed', evidence: ['calendar_event', 'external_confirmation'], gate: 'none', subjects: ['calendar', 'deal'] },
  post_deal_action: { roles: ['spn', 'manager'], defaultSla: 3, maxSla: 10, criterion: 'post_deal_action_confirmed', evidence: ['external_confirmation', 'comment_reference', 'corporate_document_status'], gate: 'post_deal', subjects: ['deal', 'corporate_document', 'external_confirmation'] }
});

const CREATE_KEYS = new Set(['task_type', 'assigned_role', 'assigned_to', 'sla_days', 'evidence_kind', 'priority', 'subject_kind', 'subject_reference_id']);
const ACTIVE_REASONS = Object.freeze({
  waiting_external: ['awaiting_counterparty', 'awaiting_bank', 'awaiting_document'],
  deferred: ['postponed_by_client', 'route_changed']
});
const TERMINAL_REASONS = Object.freeze({
  not_applicable: ['no_longer_required', 'route_changed'],
  replaced: ['replaced_by_specific_task', 'duplicate_work_item'],
  cancelled: ['process_cancelled', 'route_changed']
});

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function boundedTaskUuid(value) {
  const normalized = clean(value).toLowerCase();
  return UUID_RE.test(normalized) ? normalized : null;
}

function integer(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function result(ok, errors, rpcPreview, normalized = null) {
  return {
    ok,
    errors,
    normalized,
    rpc_preview: ok ? rpcPreview : null,
    transport_enabled: false,
    persistence: {
      automatic_backlog_created: false,
      legacy_rows_backfilled: false,
      deal_readiness_changed: false,
      risk_gate_changed: false,
      deal_status_changed: false
    }
  };
}

export function boundedTaskCreateRpcPreview(input = {}) {
  const errors = [];
  const dealId = boundedTaskUuid(input.deal_id);
  const clientRequestId = boundedTaskUuid(input.client_request_id);
  const sourceItems = Array.isArray(input.items) ? input.items : [];

  if (!dealId) errors.push('deal_id должен быть UUID.');
  if (!clientRequestId) errors.push('client_request_id должен быть UUID.');
  if (sourceItems.length < 1 || sourceItems.length > 5) errors.push('Выберите от 1 до 5 задач.');

  const items = sourceItems.map((raw, index) => {
    const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const unknown = Object.keys(item).filter((key) => !CREATE_KEYS.has(key));
    if (unknown.length) errors.push(`Задача ${index + 1}: неизвестные поля ${unknown.join(', ')}.`);

    const taskType = clean(item.task_type);
    const catalog = CATALOG[taskType];
    const assignedRole = clean(item.assigned_role);
    const assignedTo = boundedTaskUuid(item.assigned_to);
    const evidenceKind = clean(item.evidence_kind);
    const subjectKind = clean(item.subject_kind);
    const subjectReferenceId = boundedTaskUuid(item.subject_reference_id);
    const requestedSla = integer(item.sla_days);
    const priority = clean(item.priority) || 'normal';

    if (!catalog) errors.push(`Задача ${index + 1}: неизвестный task_type.`);
    if (catalog && !catalog.roles.includes(assignedRole)) errors.push(`Задача ${index + 1}: assigned_role не разрешён catalog.`);
    if (!assignedTo) errors.push(`Задача ${index + 1}: assigned_to должен быть UUID.`);
    if (catalog && !catalog.evidence.includes(evidenceKind)) errors.push(`Задача ${index + 1}: evidence_kind не разрешён catalog.`);
    if (!SUBJECT_KINDS.has(subjectKind) || (catalog && !catalog.subjects.includes(subjectKind))) errors.push(`Задача ${index + 1}: subject_kind не разрешён для task_type.`);
    if (!subjectReferenceId) errors.push(`Задача ${index + 1}: subject_reference_id должен быть UUID.`);
    if (subjectKind === 'deal' && dealId && subjectReferenceId !== dealId) errors.push(`Задача ${index + 1}: subject_reference_id должен совпадать с deal_id.`);
    if (!PRIORITIES.has(priority)) errors.push(`Задача ${index + 1}: недопустимый priority.`);

    const slaDays = requestedSla === null && catalog ? catalog.defaultSla : requestedSla;
    if (catalog && (!Number.isInteger(slaDays) || slaDays < 1 || slaDays > catalog.maxSla)) {
      errors.push(`Задача ${index + 1}: SLA должен быть от 1 до ${catalog.maxSla} дней.`);
    }

    return {
      task_type: taskType,
      assigned_role: assignedRole,
      assigned_to: assignedTo,
      sla_days: slaDays,
      evidence_kind: evidenceKind,
      priority,
      subject_kind: subjectKind,
      subject_reference_id: subjectReferenceId
    };
  });

  const ok = errors.length === 0;
  return result(ok, errors, {
    name: 'nav_v2_create_bounded_tasks',
    args: { p_deal_id: dealId, p_items: items, p_client_request_id: clientRequestId }
  }, { deal_id: dealId, client_request_id: clientRequestId, items });
}

export function boundedTaskStartRpcPreview(input = {}) {
  const taskId = boundedTaskUuid(input.task_id);
  const requestId = boundedTaskUuid(input.client_request_id);
  const errors = [];
  if (!taskId) errors.push('task_id должен быть UUID.');
  if (!requestId) errors.push('client_request_id должен быть UUID.');
  return result(errors.length === 0, errors, {
    name: 'nav_v2_start_bounded_task',
    args: { p_task_id: taskId, p_client_request_id: requestId }
  });
}

export function boundedTaskCompleteRpcPreview(input = {}) {
  const taskId = boundedTaskUuid(input.task_id);
  const evidenceId = boundedTaskUuid(input.evidence_reference_id);
  const requestId = boundedTaskUuid(input.client_request_id);
  const errors = [];
  if (!taskId) errors.push('task_id должен быть UUID.');
  if (!evidenceId) errors.push('evidence_reference_id должен быть UUID.');
  if (!requestId) errors.push('client_request_id должен быть UUID.');
  return result(errors.length === 0, errors, {
    name: 'nav_v2_complete_bounded_task',
    args: { p_task_id: taskId, p_evidence_reference_id: evidenceId, p_client_request_id: requestId }
  });
}

export function boundedTaskActiveOutcomeRpcPreview(input = {}) {
  const taskId = boundedTaskUuid(input.task_id);
  const requestId = boundedTaskUuid(input.client_request_id);
  const outcomeCode = clean(input.outcome_code);
  const reasonCode = clean(input.reason_code);
  const reviewDate = clean(input.review_date);
  const errors = [];
  if (!taskId) errors.push('task_id должен быть UUID.');
  if (!requestId) errors.push('client_request_id должен быть UUID.');
  if (!ACTIVE_REASONS[outcomeCode]?.includes(reasonCode)) errors.push('Недопустимый active outcome или reason_code.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) errors.push('review_date должен быть датой YYYY-MM-DD.');
  return result(errors.length === 0, errors, {
    name: 'nav_v2_set_bounded_task_active_outcome',
    args: { p_task_id: taskId, p_outcome_code: outcomeCode, p_reason_code: reasonCode, p_review_date: reviewDate, p_client_request_id: requestId }
  });
}

export function boundedTaskTerminalProposalRpcPreview(input = {}) {
  const taskId = boundedTaskUuid(input.task_id);
  const requestId = boundedTaskUuid(input.client_request_id);
  const replacementId = boundedTaskUuid(input.replacement_task_id);
  const outcomeCode = clean(input.outcome_code);
  const reasonCode = clean(input.reason_code);
  const errors = [];
  if (!taskId) errors.push('task_id должен быть UUID.');
  if (!requestId) errors.push('client_request_id должен быть UUID.');
  if (!TERMINAL_REASONS[outcomeCode]?.includes(reasonCode)) errors.push('Недопустимый terminal outcome или reason_code.');
  if (outcomeCode === 'replaced' && !replacementId) errors.push('Для replaced требуется replacement_task_id UUID.');
  if (outcomeCode !== 'replaced' && clean(input.replacement_task_id)) errors.push('replacement_task_id разрешён только для replaced.');
  if (replacementId && replacementId === taskId) errors.push('replacement_task_id должен отличаться от task_id.');
  return result(errors.length === 0, errors, {
    name: 'nav_v2_propose_bounded_task_terminal_outcome',
    args: { p_task_id: taskId, p_outcome_code: outcomeCode, p_reason_code: reasonCode, p_replacement_task_id: replacementId, p_client_request_id: requestId }
  });
}

export function boundedTaskTerminalDecisionRpcPreview(input = {}) {
  const taskId = boundedTaskUuid(input.task_id);
  const requestId = boundedTaskUuid(input.client_request_id);
  const decision = clean(input.decision);
  const errors = [];
  if (!taskId) errors.push('task_id должен быть UUID.');
  if (!requestId) errors.push('client_request_id должен быть UUID.');
  if (!['confirm', 'reject'].includes(decision)) errors.push('decision должен быть confirm или reject.');
  return result(errors.length === 0, errors, {
    name: 'nav_v2_decide_bounded_task_terminal_outcome',
    args: { p_task_id: taskId, p_decision: decision, p_client_request_id: requestId }
  });
}

export function minimizeBoundedTaskMutationResponse(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const task = source.task && typeof source.task === 'object' ? source.task : null;
  const safeTask = task ? Object.fromEntries([
    'id', 'deal_id', 'task_contract_version', 'task_type', 'assigned_role', 'assigned_to',
    'status', 'priority', 'due_date', 'sla_days', 'completion_criterion_code', 'evidence_kind',
    'evidence_reference_id', 'evidence_confirmed_at', 'gate_scope', 'subject_kind',
    'subject_reference_id', 'outcome_code', 'outcome_state', 'outcome_reason_code',
    'outcome_review_date', 'outcome_replacement_task_id', 'completed_by', 'completed_at', 'updated_at'
  ].filter((key) => Object.prototype.hasOwnProperty.call(task, key)).map((key) => [key, task[key]])) : null;
  return {
    ok: source.ok === true,
    task: safeTask,
    decision: typeof source.decision === 'string' ? source.decision : undefined,
    idempotent_replay: source.idempotent_replay === true,
    automatic_backlog_created: false,
    legacy_rows_backfilled: false
  };
}

export const BOUNDED_TASK_ADAPTER_CATALOG = CATALOG;
