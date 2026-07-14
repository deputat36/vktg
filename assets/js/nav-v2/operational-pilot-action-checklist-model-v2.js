const TEXT_MIN_LENGTH = 10;
const REFERENCE_MIN_LENGTH = 3;
const ALLOWED_ROLES = new Set(['owner', 'admin']);
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

function normalizedBaseline(row = {}) {
  return {
    deal_id: text(row.deal_id),
    lane: text(row.lane),
    decision_note: text(row.decision_note),
    deal_title: text(row.deal_title) || null,
    address: text(row.address) || null,
    baseline_at: row.baseline_at || null,
    baseline_metrics: normalizedMetrics(row.baseline_metrics),
    responsibility_snapshot: normalizedResponsibility(row.responsibility_snapshot),
    measurement_contract: object(row.measurement_contract),
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

function baselineKey(source, rows) {
  const deals = rows
    .map((row) => `${text(row.lane)}:${text(row.deal_id)}`)
    .sort()
    .join('|');
  return `${text(source?.shortlist_key)}|${deals}`;
}

function executionStateErrors(state) {
  const expected = {
    action_selected: false,
    responsible_confirmed: false,
    deadline_confirmed: false,
    result_confirmed: false,
    next_step_confirmed: false
  };
  if (!object(state)) return ['Отсутствует execution_state.'];
  return Object.entries(expected).flatMap(([field, value]) => (
    state[field] === value ? [] : [`execution_state.${field} должен быть false.`]
  ));
}

function baselineSafetyErrors(safety = {}) {
  const expected = {
    browser_local_only: true,
    server_mutation_available: false,
    automatic_task_creation_available: false,
    automatic_assignment_available: false,
    automatic_status_change_available: false,
    pilot_started: false,
    pilot_start_authorized: false,
    requires_manual_action_selection: true,
    requires_manual_pilot_start: true,
    requires_result_evidence: true
  };
  return Object.entries(expected).flatMap(([field, value]) => (
    safety?.[field] === value ? [] : [`Некорректный safety marker ${field}.`]
  ));
}

function baselineTopErrors(payload) {
  const errors = [];
  const root = object(payload);
  if (!root) return ['Корневое значение JSON должно быть объектом.'];
  if (root.export_type !== 'navigator_v2_operational_pilot_measurement_baseline') errors.push('Неверный export_type.');
  if (Number(root.schema_version) !== 1) errors.push('Поддерживается только schema_version=1.');
  if (!object(root.source)) errors.push('Отсутствует source.');
  if (!object(root.summary)) errors.push('Отсутствует summary.');
  if (!Array.isArray(root.baselines)) errors.push('baselines должен быть массивом.');
  if (!object(root.safety)) errors.push('Отсутствует safety.');
  return errors;
}

function baselineChanges(before, after) {
  if (!before || !after) return [];
  const changes = [];
  for (const field of ['lane', 'deal_title', 'address']) {
    if (stableValue(before[field]) !== stableValue(after[field])) {
      changes.push({ field, baseline_value: before[field], fresh_value: after[field] });
    }
  }
  for (const field of METRIC_FIELDS) {
    if (stableValue(before.baseline_metrics[field]) !== stableValue(after.baseline_metrics[field])) {
      changes.push({
        field: `baseline_metrics.${field}`,
        baseline_value: before.baseline_metrics[field],
        fresh_value: after.baseline_metrics[field]
      });
    }
  }
  for (const field of RESPONSIBILITY_FIELDS) {
    if (stableValue(before.responsibility_snapshot[field]) !== stableValue(after.responsibility_snapshot[field])) {
      changes.push({
        field: `responsibility_snapshot.${field}`,
        baseline_value: before.responsibility_snapshot[field],
        fresh_value: after.responsibility_snapshot[field]
      });
    }
  }
  return changes;
}

function actionRow(base = {}, state = {}) {
  const current = state?.[base.deal_id] || {};
  return {
    deal_id: base.deal_id,
    lane: base.lane,
    action_title: text(current.action_title),
    action_reference: text(current.action_reference),
    responsible_id: text(current.responsible_id) || null,
    responsible_name_or_role: text(current.responsible_name_or_role),
    due_at: text(current.due_at),
    evidence_type: text(current.evidence_type),
    expected_result: text(current.expected_result),
    evidence_requirement: text(current.evidence_requirement),
    next_step: text(current.next_step),
    planning_note: text(current.planning_note)
  };
}

function actionErrors(action, nowValue) {
  const errors = [];
  if (action.action_title.length < TEXT_MIN_LENGTH) errors.push(`Действие должно содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  if (action.action_reference.length < REFERENCE_MIN_LENGTH) errors.push(`Ссылка на объект действия должна содержать не менее ${REFERENCE_MIN_LENGTH} символов.`);
  if (action.responsible_name_or_role.length < REFERENCE_MIN_LENGTH) errors.push('Нужно указать фактического ответственного или роль.');
  const due = Date.parse(action.due_at);
  const now = Date.parse(nowValue);
  if (!Number.isFinite(due)) errors.push('Нужно указать корректный срок.');
  else if (Number.isFinite(now) && due <= now) errors.push('Срок должен быть позже момента подготовки checklist.');
  if (!EVIDENCE_TYPES.has(action.evidence_type)) errors.push('Нужно выбрать допустимый тип evidence.');
  if (action.expected_result.length < TEXT_MIN_LENGTH) errors.push(`Ожидаемый результат должен содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  if (action.evidence_requirement.length < TEXT_MIN_LENGTH) errors.push(`Требование к evidence должно содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  if (action.next_step.length < TEXT_MIN_LENGTH) errors.push(`Следующий шаг должен содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  if (action.planning_note.length < TEXT_MIN_LENGTH) errors.push(`Основание плана должно содержать не менее ${TEXT_MIN_LENGTH} символов.`);
  return errors;
}

export function actionSuggestionsForLane(lane) {
  const suggestions = {
    quick_result: [
      'Закрыть одну просроченную клиентскую задачу с подтверждением результата',
      'Получить один недостающий факт по сделке и зафиксировать следующий шаг'
    ],
    responsibility_confirmation: [
      'Подтвердить фактического СПН, сторону сделки и менеджерскую связь',
      'Получить письменное подтверждение распределения ответственности по сделке'
    ],
    document_workflow: [
      'Провести один обязательный документ от назначения до подтверждения результата',
      'Закрыть один просроченный документ с ответственным, сроком и evidence'
    ]
  };
  return suggestions[text(lane)] || ['Зафиксировать одно проверяемое действие с evidence и следующим шагом'];
}

export function evidenceTypeOptions() {
  return [
    { value: 'task_completion', label: 'Выполнение задачи' },
    { value: 'document_status', label: 'Статус документа' },
    { value: 'risk_resolution', label: 'Закрытие риска' },
    { value: 'written_confirmation', label: 'Письменное подтверждение' },
    { value: 'uploaded_file', label: 'Загруженный файл' },
    { value: 'card_event', label: 'Событие в карточке' },
    { value: 'other', label: 'Другое проверяемое evidence' }
  ];
}

export function validatePilotMeasurementBaseline(payload, freshReport, options = {}) {
  const errors = baselineTopErrors(payload);
  const root = object(payload) || {};
  const source = object(root.source) || {};
  const summary = object(root.summary) || {};
  const safety = object(root.safety) || {};
  const rawBaselines = Array.isArray(root.baselines) ? root.baselines : [];
  const baselines = rawBaselines.map(normalizedBaseline);
  const freshItemsRaw = Array.isArray(freshReport?.operational_pilot_shortlist?.items)
    ? freshReport.operational_pilot_shortlist.items
    : [];
  const freshItems = freshItemsRaw.map(normalizedFreshItem);
  const freshKey = shortlistKey(freshItemsRaw);
  const ids = baselines.map((row) => row.deal_id).filter(Boolean);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

  errors.push(...baselineSafetyErrors(safety));
  if (summary.baseline_ready !== true) errors.push('summary.baseline_ready должен быть true.');
  if (summary.pilot_started !== false) errors.push('summary.pilot_started должен быть false.');
  if (number(summary.completion_results) !== 0) errors.push('summary.completion_results должен быть 0.');
  if (!baselines.length) errors.push('Measurement baseline не содержит confirmed deals.');
  if (number(summary.confirmed_deals) !== baselines.length) errors.push('summary.confirmed_deals не совпадает с baselines.');
  if (duplicateIds.length) errors.push('В baselines есть повторяющиеся deal_id.');
  if (!allowedRole(source?.decision_author?.role)) errors.push('decision_author должен иметь роль owner/admin.');
  if (!allowedRole(source?.validator_actor?.role)) errors.push('validator_actor должен иметь роль owner/admin.');
  if (!allowedRole(freshReport?.profile?.role)) errors.push('Свежую проверку должен выполнять owner/admin.');
  if (Number(source.report_version) !== Number(freshReport?.report_version)) errors.push('Версия operational report изменилась.');
  if (Number(source.pilot_version) !== Number(freshReport?.operational_pilot_shortlist?.pilot_version)) errors.push('Версия pilot shortlist изменилась.');
  if (text(source.shortlist_key) !== freshKey) errors.push('Shortlist key изменился после baseline.');

  baselines.forEach((row) => {
    if (!row.deal_id) errors.push('Baseline row не содержит deal_id.');
    if (!laneContract(row.lane)) errors.push(`${row.deal_id || 'неизвестная сделка'}: неизвестный lane.`);
    if (row.decision_note.length < TEXT_MIN_LENGTH) errors.push(`${row.deal_id || 'неизвестная сделка'}: decision_note слишком короткий.`);
    if (stableValue(row.measurement_contract) !== stableValue(laneContract(row.lane))) {
      errors.push(`${row.deal_id || 'неизвестная сделка'}: measurement_contract не соответствует lane.`);
    }
    errors.push(...executionStateErrors(row.execution_state).map((error) => `${row.deal_id || 'неизвестная сделка'}: ${error}`));
  });

  const packageValid = errors.length === 0;
  const rows = baselines.map((baseline) => {
    const fresh = freshItems.find((item) => item.deal_id === baseline.deal_id) || null;
    const changes = baselineChanges(baseline, fresh);
    const missing = !fresh;
    const state = !packageValid
      ? 'invalid'
      : missing || changes.length
        ? 'stale'
        : 'fresh_ready_for_action';
    return {
      deal_id: baseline.deal_id,
      lane: baseline.lane,
      state,
      missing_in_fresh_shortlist: missing,
      changes,
      baseline_snapshot: baseline,
      fresh_snapshot: fresh
    };
  });

  const stale = rows.filter((row) => row.state === 'stale').length;
  const invalid = rows.filter((row) => row.state === 'invalid').length;
  const changedFields = rows.reduce((total, row) => total + row.changes.length, 0);
  const freshPassed = packageValid && stale === 0 && invalid === 0;

  return {
    export_type: 'navigator_v2_operational_pilot_measurement_baseline_validation',
    schema_version: 1,
    validated_at: options.validatedAt || new Date().toISOString(),
    source_file: {
      generated_at: root.generated_at || null,
      report_version: source.report_version || null,
      pilot_version: source.pilot_version || null,
      shortlist_key: source.shortlist_key || null,
      baseline_key: baselineKey(source, baselines),
      decision_author: source.decision_author || null,
      validator_actor: source.validator_actor || null
    },
    fresh_source: {
      report_generated_at: freshReport?.generated_at || null,
      report_version: freshReport?.report_version || null,
      pilot_version: freshReport?.operational_pilot_shortlist?.pilot_version || null,
      shortlist_key: freshKey,
      planner_actor: freshReport?.profile || null
    },
    top_errors: errors,
    summary: {
      baselines: baselines.length,
      fresh: rows.filter((row) => row.state === 'fresh_ready_for_action').length,
      stale,
      invalid,
      changed_fields: changedFields,
      baseline_package_valid: packageValid,
      fresh_revalidation_passed: freshPassed,
      action_checklist_available: freshPassed && baselines.length > 0
    },
    baselines: rows,
    safety: {
      server_mutation_available: false,
      pilot_started: false,
      pilot_start_authorized: false,
      action_checklist_is_browser_local: true,
      requires_separate_owner_start_confirmation: true
    }
  };
}

export function createPilotActionState(validation) {
  const rows = Array.isArray(validation?.baselines)
    ? validation.baselines.filter((row) => row.state === 'fresh_ready_for_action')
    : [];
  return rows.reduce((state, row) => {
    state[row.deal_id] = {
      deal_id: row.deal_id,
      lane: row.lane,
      action_title: '',
      action_reference: '',
      responsible_id: '',
      responsible_name_or_role: '',
      due_at: '',
      evidence_type: '',
      expected_result: '',
      evidence_requirement: '',
      next_step: '',
      planning_note: ''
    };
    return state;
  }, {});
}

export function updatePilotActionState(state, dealId, patch = {}) {
  const id = text(dealId);
  if (!id || !state?.[id]) return state || {};
  const allowedFields = [
    'action_title',
    'action_reference',
    'responsible_id',
    'responsible_name_or_role',
    'due_at',
    'evidence_type',
    'expected_result',
    'evidence_requirement',
    'next_step',
    'planning_note'
  ];
  const next = { ...state[id] };
  allowedFields.forEach((field) => {
    if (patch[field] !== undefined) next[field] = text(patch[field]);
  });
  return { ...state, [id]: next };
}

export function summarizePilotActionChecklist(validation, state, actor = {}, options = {}) {
  const rows = Array.isArray(validation?.baselines)
    ? validation.baselines.filter((row) => row.state === 'fresh_ready_for_action')
    : [];
  const nowValue = options.now || new Date().toISOString();
  const actions = rows.map((row) => {
    const action = actionRow(row, state);
    const errors = actionErrors(action, nowValue);
    return { ...action, errors, valid: errors.length === 0 };
  });
  const valid = actions.filter((row) => row.valid).length;
  const invalid = actions.length - valid;
  const actorAllowed = allowedRole(actor?.role);
  const baselineAvailable = validation?.summary?.action_checklist_available === true;
  const checklistReady = baselineAvailable && actorAllowed && actions.length > 0 && invalid === 0;
  return {
    actions: actions.length,
    valid,
    invalid,
    actor_allowed: actorAllowed,
    baseline_available: baselineAvailable,
    checklist_ready: checklistReady,
    generated_against: nowValue,
    action_rows: actions
  };
}

export function buildPilotActionChecklistPackage(validation, state, actor = {}, options = {}) {
  const summary = summarizePilotActionChecklist(validation, state, actor, options);
  const sourceRows = Array.isArray(validation?.baselines)
    ? validation.baselines.filter((row) => row.state === 'fresh_ready_for_action')
    : [];
  const actionMap = new Map(summary.action_rows.map((row) => [row.deal_id, row]));

  return {
    export_type: 'navigator_v2_operational_pilot_action_checklist',
    schema_version: 1,
    generated_at: options.generatedAt || new Date().toISOString(),
    source: {
      baseline_generated_at: validation?.source_file?.generated_at || null,
      baseline_validated_at: validation?.validated_at || null,
      report_generated_at: validation?.fresh_source?.report_generated_at || null,
      report_version: validation?.fresh_source?.report_version || null,
      pilot_version: validation?.fresh_source?.pilot_version || null,
      shortlist_key: validation?.fresh_source?.shortlist_key || null,
      baseline_key: validation?.source_file?.baseline_key || null
    },
    planner_actor: {
      id: actor?.id || null,
      full_name: text(actor?.full_name) || null,
      email: text(actor?.email) || null,
      role: text(actor?.role) || null,
      role_allowed: allowedRole(actor?.role)
    },
    summary: {
      planned_actions: summary.actions,
      valid_actions: summary.valid,
      invalid_actions: summary.invalid,
      checklist_ready: summary.checklist_ready,
      pilot_started: false,
      pilot_start_authorized: false
    },
    actions: sourceRows.map((row) => {
      const action = actionMap.get(row.deal_id) || actionRow(row, state);
      return {
        deal_id: row.deal_id,
        lane: row.lane,
        deal_title: row.fresh_snapshot?.deal_title || row.baseline_snapshot?.deal_title || null,
        address: row.fresh_snapshot?.address || row.baseline_snapshot?.address || null,
        baseline_metrics: row.baseline_snapshot?.baseline_metrics || null,
        responsibility_snapshot: row.baseline_snapshot?.responsibility_snapshot || null,
        measurement_contract: row.baseline_snapshot?.measurement_contract || laneContract(row.lane),
        action: {
          action_title: action.action_title,
          action_reference: action.action_reference,
          responsible_id: action.responsible_id,
          responsible_name_or_role: action.responsible_name_or_role,
          due_at: action.due_at,
          evidence_type: action.evidence_type,
          expected_result: action.expected_result,
          evidence_requirement: action.evidence_requirement,
          next_step: action.next_step,
          planning_note: action.planning_note,
          valid: action.valid === true,
          validation_errors: action.errors || []
        },
        execution_state: {
          action_started: false,
          responsible_acknowledged: false,
          deadline_acknowledged: false,
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
      checklist_is_execution_authorization: false,
      pilot_started: false,
      pilot_start_authorized: false,
      requires_separate_owner_start_confirmation: true,
      requires_responsible_acknowledgement: true,
      requires_result_evidence: true,
      requires_post_action_result_confirmation: true
    }
  };
}
