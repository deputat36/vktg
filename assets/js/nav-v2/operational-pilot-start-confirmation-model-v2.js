const TEXT_MIN_LENGTH = 10;
const REFERENCE_MIN_LENGTH = 3;
const ALLOWED_ROLES = new Set(['owner', 'admin']);
const DECISIONS = new Set(['authorized', 'rejected']);
const EVIDENCE_TYPES = new Set([
  'task_completion',
  'document_status',
  'risk_resolution',
  'written_confirmation',
  'uploaded_file',
  'card_event',
  'other'
]);

const METRIC_FIELDS = [
  'readiness_deposit',
  'readiness_deal',
  'open_tasks',
  'overdue_tasks',
  'open_risks',
  'blocking_deal_risks',
  'open_required_documents',
  'overdue_required_documents',
  'resolved_documents',
  'unowned_required_documents'
];

const RESPONSIBILITY_FIELDS = [
  'manager_id',
  'manager_name',
  'seller_spn_id',
  'seller_spn_name',
  'buyer_spn_id',
  'buyer_spn_name',
  'evidence_candidate_id',
  'evidence_candidate_name'
];

function text(value) {
  return String(value ?? '').trim();
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scalar(value) {
  return value === undefined || value === '' ? null : value;
}

function allowedRole(value) {
  return ALLOWED_ROLES.has(text(value));
}

function stableValue(value) {
  if (Array.isArray(value) || object(value)) return JSON.stringify(value);
  if (value === null || value === undefined) return 'null';
  return String(value);
}

function laneContract(lane) {
  const contracts = {
    quick_result: {
      outcome_type: 'verified_action_completion',
      success_condition: 'one_action_completed_with_evidence_and_next_step',
      required_completion_fields: [
        'action_title',
        'responsible_id_or_role',
        'due_at',
        'result_evidence',
        'result_confirmed_at',
        'next_step'
      ]
    },
    responsibility_confirmation: {
      outcome_type: 'responsibility_confirmation',
      success_condition: 'spn_side_and_manager_confirmed_with_evidence',
      required_completion_fields: [
        'confirmed_spn_id',
        'confirmed_side',
        'confirmed_manager_id',
        'confirmation_evidence',
        'confirmed_at',
        'next_step'
      ]
    },
    document_workflow: {
      outcome_type: 'document_cycle_completion',
      success_condition: 'one_required_document_completed_with_owner_deadline_and_evidence',
      required_completion_fields: [
        'document_id',
        'responsible_id_or_role',
        'due_date',
        'expected_result',
        'result_evidence',
        'result_confirmed_at',
        'next_step'
      ]
    }
  };
  return contracts[text(lane)] || null;
}

function normalizedMetrics(value = {}) {
  const source = object(value) || {};
  return METRIC_FIELDS.reduce((result, field) => {
    result[field] = number(source[field]);
    return result;
  }, {});
}

function normalizedResponsibility(value = {}) {
  const source = object(value) || {};
  return RESPONSIBILITY_FIELDS.reduce((result, field) => {
    result[field] = field.endsWith('_name') ? (text(source[field]) || null) : scalar(source[field]);
    return result;
  }, {});
}

function normalizedAction(value = {}) {
  const source = object(value) || {};
  return {
    action_title: text(source.action_title),
    action_reference: text(source.action_reference),
    responsible_id: text(source.responsible_id) || null,
    responsible_name_or_role: text(source.responsible_name_or_role),
    due_at: text(source.due_at),
    evidence_type: text(source.evidence_type),
    expected_result: text(source.expected_result),
    evidence_requirement: text(source.evidence_requirement),
    next_step: text(source.next_step),
    planning_note: text(source.planning_note),
    valid: source.valid === true,
    validation_errors: Array.isArray(source.validation_errors) ? source.validation_errors.map(text).filter(Boolean) : []
  };
}

function normalizedChecklistRow(row = {}) {
  return {
    deal_id: text(row.deal_id),
    lane: text(row.lane),
    deal_title: text(row.deal_title) || null,
    address: text(row.address) || null,
    baseline_metrics: normalizedMetrics(row.baseline_metrics),
    responsibility_snapshot: normalizedResponsibility(row.responsibility_snapshot),
    measurement_contract: object(row.measurement_contract),
    action: normalizedAction(row.action),
    execution_state: object(row.execution_state)
  };
}

function normalizedFreshItem(row = {}) {
  return {
    deal_id: text(row.deal_id),
    lane: text(row.lane),
    deal_title: text(row.deal_title) || null,
    address: text(row.address) || null,
    baseline_metrics: normalizedMetrics(row),
    responsibility_snapshot: normalizedResponsibility(row)
  };
}

function shortlistKey(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      review_order: number(item?.review_order),
      lane: text(item?.lane),
      deal_id: text(item?.deal_id)
    }))
    .filter((item) => item.deal_id && item.lane)
    .map((item) => `${item.review_order}:${item.lane}:${item.deal_id}`)
    .sort()
    .join('|');
}

function checklistKey(source, rows) {
  return [
    text(source?.baseline_key),
    text(source?.shortlist_key),
    ...rows
      .map((row) => `${row.lane}:${row.deal_id}:${row.action.due_at}:${row.action.action_title}`)
      .sort()
  ].join('|');
}

function checklistSafetyErrors(safety = {}) {
  const expected = {
    browser_local_only: true,
    server_mutation_available: false,
    automatic_task_creation_available: false,
    automatic_assignment_available: false,
    automatic_status_change_available: false,
    checklist_is_execution_authorization: false,
    pilot_started: false,
    pilot_start_authorized: false,
    requires_separate_owner_start_confirmation: true,
    requires_responsible_acknowledgement: true,
    requires_result_evidence: true,
    requires_post_action_result_confirmation: true
  };
  return Object.entries(expected).flatMap(([field, value]) => (
    safety?.[field] === value ? [] : [`Некорректный safety marker ${field}.`]
  ));
}

function executionStateErrors(state) {
  const expected = {
    action_started: false,
    responsible_acknowledged: false,
    deadline_acknowledged: false,
    evidence_received: false,
    result_confirmed: false,
    next_step_confirmed: false
  };
  if (!object(state)) return ['Отсутствует execution_state.'];
  return Object.entries(expected).flatMap(([field, value]) => (
    state[field] === value ? [] : [`execution_state.${field} должен быть false.`]
  ));
}

function actionErrors(action, nowValue) {
  const errors = [];
  if (action.action_title.length < TEXT_MIN_LENGTH) errors.push(`Действие должно содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  if (action.action_reference.length < REFERENCE_MIN_LENGTH) errors.push(`Ссылка на объект действия должна содержать не менее ${REFERENCE_MIN_LENGTH} символов.`);
  if (action.responsible_name_or_role.length < REFERENCE_MIN_LENGTH) errors.push('Нужно указать фактического ответственного или роль.');
  const due = Date.parse(action.due_at);
  const now = Date.parse(nowValue);
  if (!Number.isFinite(due)) errors.push('Нужно указать корректный срок действия.');
  else if (Number.isFinite(now) && due <= now) errors.push('Срок действия уже наступил или прошёл.');
  if (!EVIDENCE_TYPES.has(action.evidence_type)) errors.push('Недопустимый тип evidence.');
  if (action.expected_result.length < TEXT_MIN_LENGTH) errors.push(`Ожидаемый результат должен содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  if (action.evidence_requirement.length < TEXT_MIN_LENGTH) errors.push(`Требование к evidence должно содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  if (action.next_step.length < TEXT_MIN_LENGTH) errors.push(`Следующий шаг должен содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  if (action.planning_note.length < TEXT_MIN_LENGTH) errors.push(`Основание плана должно содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  if (action.valid !== true) errors.push('action.valid должен быть true.');
  if (action.validation_errors.length) errors.push('action.validation_errors должен быть пустым.');
  return errors;
}

function topErrors(payload) {
  const errors = [];
  const root = object(payload);
  if (!root) return ['Корневое значение JSON должно быть объектом.'];
  if (root.export_type !== 'navigator_v2_operational_pilot_action_checklist') errors.push('Неверный export_type.');
  if (Number(root.schema_version) !== 1) errors.push('Поддерживается только schema_version=1.');
  if (!object(root.source)) errors.push('Отсутствует source.');
  if (!object(root.planner_actor)) errors.push('Отсутствует planner_actor.');
  if (!object(root.summary)) errors.push('Отсутствует summary.');
  if (!Array.isArray(root.actions)) errors.push('actions должен быть массивом.');
  if (!object(root.safety)) errors.push('Отсутствует safety.');
  return errors;
}

function rowChanges(before, after) {
  if (!before || !after) return [];
  const changes = [];
  for (const field of ['lane', 'deal_title', 'address']) {
    if (stableValue(before[field]) !== stableValue(after[field])) {
      changes.push({ field, checklist_value: before[field], fresh_value: after[field] });
    }
  }
  for (const field of METRIC_FIELDS) {
    if (stableValue(before.baseline_metrics[field]) !== stableValue(after.baseline_metrics[field])) {
      changes.push({
        field: `baseline_metrics.${field}`,
        checklist_value: before.baseline_metrics[field],
        fresh_value: after.baseline_metrics[field]
      });
    }
  }
  for (const field of RESPONSIBILITY_FIELDS) {
    if (stableValue(before.responsibility_snapshot[field]) !== stableValue(after.responsibility_snapshot[field])) {
      changes.push({
        field: `responsibility_snapshot.${field}`,
        checklist_value: before.responsibility_snapshot[field],
        fresh_value: after.responsibility_snapshot[field]
      });
    }
  }
  return changes;
}

export function validatePilotActionChecklist(payload, freshReport, options = {}) {
  const errors = topErrors(payload);
  const root = object(payload) || {};
  const source = object(root.source) || {};
  const planner = object(root.planner_actor) || {};
  const summary = object(root.summary) || {};
  const safety = object(root.safety) || {};
  const rawActions = Array.isArray(root.actions) ? root.actions : [];
  const actions = rawActions.map(normalizedChecklistRow);
  const freshItemsRaw = Array.isArray(freshReport?.operational_pilot_shortlist?.items)
    ? freshReport.operational_pilot_shortlist.items
    : [];
  const freshItems = freshItemsRaw.map(normalizedFreshItem);
  const freshKey = shortlistKey(freshItemsRaw);
  const nowValue = options.now || new Date().toISOString();
  const ids = actions.map((row) => row.deal_id).filter(Boolean);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

  errors.push(...checklistSafetyErrors(safety));
  if (summary.checklist_ready !== true) errors.push('summary.checklist_ready должен быть true.');
  if (summary.pilot_started !== false) errors.push('summary.pilot_started должен быть false.');
  if (summary.pilot_start_authorized !== false) errors.push('summary.pilot_start_authorized должен быть false.');
  if (!actions.length) errors.push('Checklist не содержит действий.');
  if (number(summary.planned_actions) !== actions.length) errors.push('summary.planned_actions не совпадает с actions.');
  if (number(summary.valid_actions) !== actions.length) errors.push('summary.valid_actions не совпадает с actions.');
  if (number(summary.invalid_actions) !== 0) errors.push('summary.invalid_actions должен быть 0.');
  if (!allowedRole(planner.role) || planner.role_allowed !== true) errors.push('planner_actor должен иметь подтверждённую роль owner/admin.');
  if (!allowedRole(freshReport?.profile?.role)) errors.push('Fresh revalidation должен выполнять owner/admin.');
  if (Number(source.report_version) !== Number(freshReport?.report_version)) errors.push('Версия operational report изменилась.');
  if (Number(source.pilot_version) !== Number(freshReport?.operational_pilot_shortlist?.pilot_version)) errors.push('Версия pilot shortlist изменилась.');
  if (text(source.shortlist_key) !== freshKey) errors.push('Shortlist key изменился после checklist.');
  if (duplicateIds.length) errors.push('В actions есть повторяющиеся deal_id.');

  actions.forEach((row) => {
    if (!row.deal_id) errors.push('Action row не содержит deal_id.');
    if (!laneContract(row.lane)) errors.push(`${row.deal_id || 'неизвестная сделка'}: неизвестный lane.`);
    if (stableValue(row.measurement_contract) !== stableValue(laneContract(row.lane))) {
      errors.push(`${row.deal_id || 'неизвестная сделка'}: measurement_contract не соответствует lane.`);
    }
    errors.push(...actionErrors(row.action, nowValue).map((error) => `${row.deal_id || 'неизвестная сделка'}: ${error}`));
    errors.push(...executionStateErrors(row.execution_state).map((error) => `${row.deal_id || 'неизвестная сделка'}: ${error}`));
  });

  const packageValid = errors.length === 0;
  const rows = actions.map((action) => {
    const fresh = freshItems.find((item) => item.deal_id === action.deal_id) || null;
    const changes = rowChanges(action, fresh);
    const missing = !fresh;
    const state = !packageValid
      ? 'invalid'
      : missing || changes.length
        ? 'stale'
        : 'fresh_ready_for_owner_start';
    return {
      deal_id: action.deal_id,
      lane: action.lane,
      state,
      missing_in_fresh_shortlist: missing,
      changes,
      checklist_snapshot: action,
      fresh_snapshot: fresh
    };
  });

  const stale = rows.filter((row) => row.state === 'stale').length;
  const invalid = rows.filter((row) => row.state === 'invalid').length;
  const changedFields = rows.reduce((total, row) => total + row.changes.length, 0);
  const freshPassed = packageValid && stale === 0 && invalid === 0;

  return {
    export_type: 'navigator_v2_operational_pilot_action_checklist_validation',
    schema_version: 1,
    validated_at: options.validatedAt || new Date().toISOString(),
    source_file: {
      generated_at: root.generated_at || null,
      report_version: source.report_version || null,
      pilot_version: source.pilot_version || null,
      shortlist_key: source.shortlist_key || null,
      baseline_key: source.baseline_key || null,
      checklist_key: checklistKey(source, actions),
      planner_actor: root.planner_actor || null
    },
    fresh_source: {
      report_generated_at: freshReport?.generated_at || null,
      report_version: freshReport?.report_version || null,
      pilot_version: freshReport?.operational_pilot_shortlist?.pilot_version || null,
      shortlist_key: freshKey,
      owner_actor: freshReport?.profile || null
    },
    top_errors: errors,
    summary: {
      actions: actions.length,
      fresh: rows.filter((row) => row.state === 'fresh_ready_for_owner_start').length,
      stale,
      invalid,
      changed_fields: changedFields,
      checklist_package_valid: packageValid,
      fresh_revalidation_passed: freshPassed,
      owner_start_confirmation_available: freshPassed && actions.length > 0
    },
    actions: rows,
    safety: {
      server_mutation_available: false,
      pilot_started: false,
      pilot_start_authorized: false,
      owner_start_confirmation_is_browser_local: true,
      requires_owner_decision_per_action: true,
      requires_responsible_acknowledgement: true
    }
  };
}

export function createOwnerStartState(validation) {
  const rows = Array.isArray(validation?.actions)
    ? validation.actions.filter((row) => row.state === 'fresh_ready_for_owner_start')
    : [];
  return rows.reduce((state, row) => {
    state[row.deal_id] = {
      deal_id: row.deal_id,
      lane: row.lane,
      decision: '',
      authorization_note: '',
      authorization_expires_at: ''
    };
    return state;
  }, {});
}

export function updateOwnerStartState(state, dealId, patch = {}) {
  const id = text(dealId);
  if (!id || !state?.[id]) return state || {};
  const next = { ...state[id] };
  for (const field of ['decision', 'authorization_note', 'authorization_expires_at']) {
    if (patch[field] !== undefined) next[field] = text(patch[field]);
  }
  return { ...state, [id]: next };
}

function decisionRow(base = {}, state = {}, nowValue) {
  const current = state?.[base.deal_id] || {};
  const decision = text(current.decision);
  const note = text(current.authorization_note);
  const expiresAt = text(current.authorization_expires_at);
  const errors = [];
  if (!DECISIONS.has(decision)) errors.push('Нужно выбрать authorized или rejected.');
  if (note.length < TEXT_MIN_LENGTH) errors.push(`Основание решения должно содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  if (decision === 'authorized') {
    const expires = Date.parse(expiresAt);
    const now = Date.parse(nowValue);
    const due = Date.parse(base?.checklist_snapshot?.action?.due_at || '');
    if (!Number.isFinite(expires)) errors.push('Нужно указать срок действия разрешения.');
    else {
      if (Number.isFinite(now) && expires <= now) errors.push('Срок действия разрешения должен быть в будущем.');
      if (Number.isFinite(due) && expires > due) errors.push('Разрешение не может действовать позже срока самого действия.');
    }
  }
  return {
    deal_id: base.deal_id,
    lane: base.lane,
    decision,
    authorization_note: note,
    authorization_expires_at: decision === 'authorized' ? expiresAt : null,
    valid: errors.length === 0,
    errors
  };
}

export function summarizeOwnerStartConfirmation(validation, state, actor = {}, options = {}) {
  const rows = Array.isArray(validation?.actions)
    ? validation.actions.filter((row) => row.state === 'fresh_ready_for_owner_start')
    : [];
  const nowValue = options.now || new Date().toISOString();
  const decisions = rows.map((row) => decisionRow(row, state, nowValue));
  const invalid = decisions.filter((row) => !row.valid).length;
  const authorized = decisions.filter((row) => row.valid && row.decision === 'authorized').length;
  const rejected = decisions.filter((row) => row.valid && row.decision === 'rejected').length;
  const actorAllowed = allowedRole(actor?.role);
  const checklistAvailable = validation?.summary?.owner_start_confirmation_available === true;
  const decisionPackageReady = checklistAvailable && actorAllowed && decisions.length > 0 && invalid === 0;
  return {
    actions: decisions.length,
    authorized,
    rejected,
    invalid,
    actor_allowed: actorAllowed,
    checklist_available: checklistAvailable,
    decision_package_ready: decisionPackageReady,
    pilot_start_authorized: decisionPackageReady && authorized > 0,
    generated_against: nowValue,
    decision_rows: decisions
  };
}

export function buildOwnerStartConfirmationPackage(validation, state, actor = {}, options = {}) {
  const summary = summarizeOwnerStartConfirmation(validation, state, actor, options);
  const sourceRows = Array.isArray(validation?.actions)
    ? validation.actions.filter((row) => row.state === 'fresh_ready_for_owner_start')
    : [];
  const decisionMap = new Map(summary.decision_rows.map((row) => [row.deal_id, row]));

  return {
    export_type: 'navigator_v2_operational_pilot_owner_start_confirmation',
    schema_version: 1,
    generated_at: options.generatedAt || new Date().toISOString(),
    source: {
      checklist_generated_at: validation?.source_file?.generated_at || null,
      checklist_validated_at: validation?.validated_at || null,
      report_generated_at: validation?.fresh_source?.report_generated_at || null,
      report_version: validation?.fresh_source?.report_version || null,
      pilot_version: validation?.fresh_source?.pilot_version || null,
      shortlist_key: validation?.fresh_source?.shortlist_key || null,
      baseline_key: validation?.source_file?.baseline_key || null,
      checklist_key: validation?.source_file?.checklist_key || null,
      planner_actor: validation?.source_file?.planner_actor || null
    },
    owner_actor: {
      id: actor?.id || null,
      full_name: text(actor?.full_name) || null,
      email: text(actor?.email) || null,
      role: text(actor?.role) || null,
      role_allowed: allowedRole(actor?.role)
    },
    summary: {
      reviewed_actions: summary.actions,
      authorized_actions: summary.authorized,
      rejected_actions: summary.rejected,
      invalid_decisions: summary.invalid,
      decision_package_ready: summary.decision_package_ready,
      pilot_start_authorized: summary.pilot_start_authorized,
      pilot_started: false,
      server_mutation_performed: false
    },
    decisions: sourceRows.map((row) => {
      const decision = decisionMap.get(row.deal_id) || decisionRow(row, state, summary.generated_against);
      return {
        deal_id: row.deal_id,
        lane: row.lane,
        deal_title: row.checklist_snapshot?.deal_title || null,
        address: row.checklist_snapshot?.address || null,
        action: row.checklist_snapshot?.action || null,
        measurement_contract: row.checklist_snapshot?.measurement_contract || laneContract(row.lane),
        owner_decision: {
          decision: decision.decision,
          authorization_note: decision.authorization_note,
          authorization_expires_at: decision.authorization_expires_at,
          valid: decision.valid,
          validation_errors: decision.errors
        },
        execution_state: {
          owner_authorized: decision.valid && decision.decision === 'authorized',
          responsible_acknowledged: false,
          action_started: false,
          evidence_received: false,
          result_confirmed: false,
          next_step_confirmed: false
        }
      };
    }),
    safety: {
      browser_local_only: true,
      server_mutation_available: false,
      automatic_task_creation_available: false,
      automatic_assignment_available: false,
      automatic_status_change_available: false,
      owner_confirmation_is_server_execution: false,
      pilot_start_authorized_by_owner: summary.pilot_start_authorized,
      pilot_started: false,
      responsible_acknowledgement_recorded: false,
      requires_manual_responsible_acknowledgement: true,
      requires_manual_execution: true,
      requires_execution_receipt: true,
      requires_result_evidence: true,
      requires_post_action_result_confirmation: true
    }
  };
}
