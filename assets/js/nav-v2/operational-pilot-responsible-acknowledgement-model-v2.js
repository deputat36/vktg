const TEXT_MIN_LENGTH = 10;
const REFERENCE_MIN_LENGTH = 3;
const ALLOWED_RECORDER_ROLES = new Set(['owner', 'admin']);
const ACK_DECISIONS = new Set(['acknowledged', 'rejected', 'needs_clarification']);
const ACK_CHANNELS = new Set([
  'written_confirmation',
  'email',
  'messenger',
  'phone_call',
  'in_person',
  'task_comment',
  'other'
]);

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

function allowedRecorderRole(value) {
  return ALLOWED_RECORDER_ROLES.has(text(value));
}

function normalizedName(value) {
  return text(value).toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

function stableValue(value) {
  if (Array.isArray(value) || object(value)) return JSON.stringify(value);
  if (value === null || value === undefined) return 'null';
  return String(value);
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

function normalizedOwnerDecision(value = {}) {
  const source = object(value) || {};
  return {
    decision: text(source.decision),
    authorization_note: text(source.authorization_note),
    authorization_expires_at: text(source.authorization_expires_at) || null,
    valid: source.valid === true,
    validation_errors: Array.isArray(source.validation_errors) ? source.validation_errors.map(text).filter(Boolean) : []
  };
}

function normalizedExecutionState(value = {}) {
  const source = object(value) || {};
  return {
    owner_authorized: source.owner_authorized === true,
    responsible_acknowledged: source.responsible_acknowledged === true,
    action_started: source.action_started === true,
    evidence_received: source.evidence_received === true,
    result_confirmed: source.result_confirmed === true,
    next_step_confirmed: source.next_step_confirmed === true
  };
}

function normalizedDecisionRow(value = {}) {
  return {
    deal_id: text(value.deal_id),
    lane: text(value.lane),
    deal_title: text(value.deal_title) || null,
    address: text(value.address) || null,
    action: normalizedAction(value.action),
    measurement_contract: object(value.measurement_contract),
    owner_decision: normalizedOwnerDecision(value.owner_decision),
    execution_state: normalizedExecutionState(value.execution_state)
  };
}

function topErrors(payload) {
  const errors = [];
  const root = object(payload);
  if (!root) return ['Корневое значение JSON должно быть объектом.'];
  if (root.export_type !== 'navigator_v2_operational_pilot_owner_start_confirmation') errors.push('Неверный export_type.');
  if (Number(root.schema_version) !== 1) errors.push('Поддерживается только schema_version=1.');
  if (!object(root.source)) errors.push('Отсутствует source.');
  if (!object(root.owner_actor)) errors.push('Отсутствует owner_actor.');
  if (!object(root.summary)) errors.push('Отсутствует summary.');
  if (!Array.isArray(root.decisions)) errors.push('decisions должен быть массивом.');
  if (!object(root.safety)) errors.push('Отсутствует safety.');
  return errors;
}

function safetyErrors(safety = {}, summary = {}) {
  const expected = {
    browser_local_only: true,
    server_mutation_available: false,
    automatic_task_creation_available: false,
    automatic_assignment_available: false,
    automatic_status_change_available: false,
    owner_confirmation_is_server_execution: false,
    pilot_started: false,
    responsible_acknowledgement_recorded: false,
    requires_manual_responsible_acknowledgement: true,
    requires_manual_execution: true,
    requires_execution_receipt: true,
    requires_result_evidence: true,
    requires_post_action_result_confirmation: true
  };
  const errors = Object.entries(expected).flatMap(([field, value]) => (
    safety?.[field] === value ? [] : [`Некорректный safety marker ${field}.`]
  ));
  if (safety?.pilot_start_authorized_by_owner !== (summary?.pilot_start_authorized === true)) {
    errors.push('safety.pilot_start_authorized_by_owner не совпадает с summary.pilot_start_authorized.');
  }
  return errors;
}

function decisionErrors(row, nowValue) {
  const errors = [];
  const decision = row.owner_decision;
  const execution = row.execution_state;
  const action = row.action;
  if (!row.deal_id) errors.push('Отсутствует deal_id.');
  if (!row.lane) errors.push('Отсутствует lane.');
  if (!['authorized', 'rejected'].includes(decision.decision)) errors.push('owner_decision должен быть authorized или rejected.');
  if (decision.valid !== true || decision.validation_errors.length) errors.push('owner_decision должен быть валидным.');
  if (decision.authorization_note.length < TEXT_MIN_LENGTH) errors.push('Основание owner decision слишком короткое.');
  if (action.valid !== true || action.validation_errors.length) errors.push('Action должен быть валидным.');
  if (action.action_title.length < TEXT_MIN_LENGTH) errors.push('Название действия слишком короткое.');
  if (action.action_reference.length < REFERENCE_MIN_LENGTH) errors.push('Объект действия не указан.');
  if (action.responsible_name_or_role.length < REFERENCE_MIN_LENGTH) errors.push('Ответственный или роль не указаны.');
  const due = Date.parse(action.due_at);
  const now = Date.parse(nowValue);
  if (!Number.isFinite(due)) errors.push('Срок действия некорректен.');
  else if (Number.isFinite(now) && due <= now) errors.push('Срок действия уже наступил или прошёл.');
  if (decision.decision === 'authorized') {
    const expires = Date.parse(decision.authorization_expires_at || '');
    if (!Number.isFinite(expires)) errors.push('Срок owner authorization не указан.');
    else {
      if (Number.isFinite(now) && expires <= now) errors.push('Owner authorization уже истёк.');
      if (Number.isFinite(due) && expires > due) errors.push('Owner authorization действует позже срока действия.');
    }
    if (!execution.owner_authorized) errors.push('execution_state.owner_authorized должен быть true.');
  } else if (execution.owner_authorized) {
    errors.push('Отклонённое действие не может иметь owner_authorized=true.');
  }
  for (const field of ['responsible_acknowledged', 'action_started', 'evidence_received', 'result_confirmed', 'next_step_confirmed']) {
    if (execution[field] !== false) errors.push(`execution_state.${field} должен быть false.`);
  }
  return errors;
}

function freshChanges(row, freshItem) {
  if (!freshItem) return [];
  const changes = [];
  for (const [field, before, after] of [
    ['lane', row.lane, freshItem.lane],
    ['deal_title', row.deal_title, freshItem.deal_title],
    ['address', row.address, freshItem.address]
  ]) {
    if (stableValue(before) !== stableValue(after)) {
      changes.push({ field, confirmation_value: before, fresh_value: after });
    }
  }
  return changes;
}

function confirmationKey(source = {}, rows = []) {
  return [
    text(source.checklist_key),
    text(source.shortlist_key),
    ...rows.map((row) => [
      row.lane,
      row.deal_id,
      row.owner_decision.decision,
      row.owner_decision.authorization_expires_at || '',
      row.action.due_at,
      row.action.responsible_id || '',
      row.action.responsible_name_or_role
    ].join(':')).sort()
  ].join('|');
}

export function validateOwnerStartConfirmation(payload, freshReport, options = {}) {
  const errors = topErrors(payload);
  const root = object(payload) || {};
  const source = object(root.source) || {};
  const ownerActor = object(root.owner_actor) || {};
  const summary = object(root.summary) || {};
  const safety = object(root.safety) || {};
  const nowValue = options.now || new Date().toISOString();
  const decisions = (Array.isArray(root.decisions) ? root.decisions : []).map(normalizedDecisionRow);
  const freshItemsRaw = Array.isArray(freshReport?.operational_pilot_shortlist?.items)
    ? freshReport.operational_pilot_shortlist.items
    : [];
  const freshKey = shortlistKey(freshItemsRaw);
  const ids = decisions.map((row) => row.deal_id).filter(Boolean);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

  errors.push(...safetyErrors(safety, summary));
  if (!allowedRecorderRole(ownerActor.role) || ownerActor.role_allowed !== true) errors.push('owner_actor должен иметь подтверждённую роль owner/admin.');
  if (!allowedRecorderRole(freshReport?.profile?.role)) errors.push('Fresh revalidation должен выполнять owner/admin.');
  if (summary.decision_package_ready !== true) errors.push('summary.decision_package_ready должен быть true.');
  if (summary.pilot_started !== false) errors.push('summary.pilot_started должен быть false.');
  if (summary.server_mutation_performed !== false) errors.push('summary.server_mutation_performed должен быть false.');
  if (!decisions.length) errors.push('Owner start confirmation не содержит решений.');
  if (number(summary.reviewed_actions) !== decisions.length) errors.push('summary.reviewed_actions не совпадает с decisions.');
  const authorizedCount = decisions.filter((row) => row.owner_decision.decision === 'authorized').length;
  const rejectedCount = decisions.filter((row) => row.owner_decision.decision === 'rejected').length;
  if (number(summary.authorized_actions) !== authorizedCount) errors.push('summary.authorized_actions не совпадает с decisions.');
  if (number(summary.rejected_actions) !== rejectedCount) errors.push('summary.rejected_actions не совпадает с decisions.');
  if ((summary.pilot_start_authorized === true) !== (authorizedCount > 0)) errors.push('summary.pilot_start_authorized не совпадает с количеством authorized actions.');
  if (duplicateIds.length) errors.push('В decisions есть повторяющиеся deal_id.');
  if (Number(source.report_version) !== Number(freshReport?.report_version)) errors.push('Версия operational report изменилась.');
  if (Number(source.pilot_version) !== Number(freshReport?.operational_pilot_shortlist?.pilot_version)) errors.push('Версия pilot shortlist изменилась.');
  if (text(source.shortlist_key) !== freshKey) errors.push('Shortlist key изменился после owner confirmation.');

  decisions.forEach((row) => {
    errors.push(...decisionErrors(row, nowValue).map((error) => `${row.deal_id || 'неизвестная сделка'}: ${error}`));
  });

  const packageValid = errors.length === 0;
  const rows = decisions.map((decision) => {
    const fresh = freshItemsRaw.find((item) => text(item.deal_id) === decision.deal_id) || null;
    const changes = freshChanges(decision, fresh);
    const missing = !fresh;
    const expired = decision.owner_decision.decision === 'authorized' && (
      Date.parse(decision.owner_decision.authorization_expires_at || '') <= Date.parse(nowValue)
      || Date.parse(decision.action.due_at || '') <= Date.parse(nowValue)
    );
    const state = !packageValid
      ? 'invalid'
      : missing || changes.length
        ? 'stale'
        : expired
          ? 'expired'
          : decision.owner_decision.decision === 'authorized'
            ? 'authorized_ready_for_acknowledgement'
            : 'rejected_by_owner';
    return {
      deal_id: decision.deal_id,
      lane: decision.lane,
      state,
      missing_in_fresh_shortlist: missing,
      changes,
      confirmation_snapshot: decision,
      fresh_snapshot: fresh
    };
  });

  const stale = rows.filter((row) => row.state === 'stale').length;
  const invalid = rows.filter((row) => row.state === 'invalid').length;
  const expired = rows.filter((row) => row.state === 'expired').length;
  const authorizedReady = rows.filter((row) => row.state === 'authorized_ready_for_acknowledgement').length;
  const rejectedVerified = rows.filter((row) => row.state === 'rejected_by_owner').length;
  const freshPassed = packageValid && stale === 0 && invalid === 0 && expired === 0;

  return {
    export_type: 'navigator_v2_operational_pilot_owner_start_confirmation_validation',
    schema_version: 1,
    validated_at: options.validatedAt || new Date().toISOString(),
    source_file: {
      generated_at: root.generated_at || null,
      report_version: source.report_version || null,
      pilot_version: source.pilot_version || null,
      shortlist_key: source.shortlist_key || null,
      baseline_key: source.baseline_key || null,
      checklist_key: source.checklist_key || null,
      confirmation_key: confirmationKey(source, decisions),
      planner_actor: source.planner_actor || null,
      owner_actor: root.owner_actor || null
    },
    fresh_source: {
      report_generated_at: freshReport?.generated_at || null,
      report_version: freshReport?.report_version || null,
      pilot_version: freshReport?.operational_pilot_shortlist?.pilot_version || null,
      shortlist_key: freshKey,
      recorder_actor: freshReport?.profile || null
    },
    top_errors: errors,
    summary: {
      decisions: decisions.length,
      authorized_ready: authorizedReady,
      rejected_verified: rejectedVerified,
      stale,
      expired,
      invalid,
      confirmation_package_valid: packageValid,
      fresh_revalidation_passed: freshPassed,
      responsible_acknowledgement_capture_available: freshPassed && authorizedReady > 0
    },
    decisions: rows,
    safety: {
      server_mutation_available: false,
      pilot_started: false,
      execution_authorized: false,
      acknowledgement_capture_is_browser_local: true,
      acknowledgement_is_authenticated_self_action: false,
      requires_owner_or_admin_recorder: true,
      requires_execution_receipt: true
    }
  };
}

export function acknowledgementChannelOptions() {
  return [
    { value: 'written_confirmation', label: 'Письменное подтверждение' },
    { value: 'email', label: 'Email' },
    { value: 'messenger', label: 'Сообщение в мессенджере' },
    { value: 'phone_call', label: 'Телефонный разговор' },
    { value: 'in_person', label: 'Личная встреча' },
    { value: 'task_comment', label: 'Комментарий к задаче или карточке' },
    { value: 'other', label: 'Другое evidence' }
  ];
}

export function createResponsibleAcknowledgementState(validation) {
  const rows = Array.isArray(validation?.decisions)
    ? validation.decisions.filter((row) => row.state === 'authorized_ready_for_acknowledgement')
    : [];
  return rows.reduce((state, row) => {
    const action = row.confirmation_snapshot?.action || {};
    state[row.deal_id] = {
      deal_id: row.deal_id,
      lane: row.lane,
      acknowledgement_decision: '',
      acknowledged_by_id: action.responsible_id || '',
      acknowledged_by_name_or_role: action.responsible_name_or_role || '',
      acknowledgement_channel: '',
      acknowledgement_reference: '',
      acknowledgement_note: '',
      acknowledged_at: ''
    };
    return state;
  }, {});
}

export function updateResponsibleAcknowledgementState(state, dealId, patch = {}) {
  const id = text(dealId);
  if (!id || !state?.[id]) return state || {};
  const next = { ...state[id] };
  for (const field of [
    'acknowledgement_decision',
    'acknowledged_by_id',
    'acknowledged_by_name_or_role',
    'acknowledgement_channel',
    'acknowledgement_reference',
    'acknowledgement_note',
    'acknowledged_at'
  ]) {
    if (patch[field] !== undefined) next[field] = text(patch[field]);
  }
  return { ...state, [id]: next };
}

function acknowledgementRow(base = {}, state = {}, nowValue, confirmationGeneratedAt) {
  const current = state?.[base.deal_id] || {};
  const snapshot = base.confirmation_snapshot || {};
  const action = snapshot.action || {};
  const ownerDecision = snapshot.owner_decision || {};
  const decision = text(current.acknowledgement_decision);
  const byId = text(current.acknowledged_by_id) || null;
  const byName = text(current.acknowledged_by_name_or_role);
  const channel = text(current.acknowledgement_channel);
  const reference = text(current.acknowledgement_reference);
  const note = text(current.acknowledgement_note);
  const acknowledgedAt = text(current.acknowledged_at);
  const errors = [];

  if (!ACK_DECISIONS.has(decision)) errors.push('Нужно выбрать acknowledged, rejected или needs_clarification.');
  if (byName.length < REFERENCE_MIN_LENGTH) errors.push('Нужно указать, кто дал ответ.');
  if (!ACK_CHANNELS.has(channel)) errors.push('Нужно выбрать канал подтверждения.');
  if (reference.length < REFERENCE_MIN_LENGTH) errors.push('Нужно указать ссылку, ID сообщения или иной ориентир evidence.');
  if (note.length < TEXT_MIN_LENGTH) errors.push(`Комментарий должен содержать не менее ${TEXT_MIN_LENGTH} символов.`);

  const expectedId = text(action.responsible_id) || null;
  const expectedName = text(action.responsible_name_or_role);
  const identityMatches = expectedId
    ? byId === expectedId
    : normalizedName(byName) === normalizedName(expectedName);
  if (!identityMatches) errors.push('Указанный ответственный не совпадает с action checklist.');

  const at = Date.parse(acknowledgedAt);
  const now = Date.parse(nowValue);
  const generated = Date.parse(confirmationGeneratedAt || '');
  const authorizationExpires = Date.parse(ownerDecision.authorization_expires_at || '');
  const due = Date.parse(action.due_at || '');
  if (!Number.isFinite(at)) errors.push('Нужно указать время подтверждения.');
  else {
    if (Number.isFinite(generated) && at < generated) errors.push('Подтверждение не может быть раньше owner start confirmation.');
    if (Number.isFinite(now) && at > now + 5 * 60_000) errors.push('Время подтверждения не может быть в будущем.');
    if (Number.isFinite(authorizationExpires) && at > authorizationExpires) errors.push('Подтверждение получено после истечения owner authorization.');
    if (Number.isFinite(due) && at > due) errors.push('Подтверждение получено после срока действия.');
  }

  return {
    deal_id: base.deal_id,
    lane: base.lane,
    acknowledgement_decision: decision,
    acknowledged_by_id: byId,
    acknowledged_by_name_or_role: byName,
    acknowledgement_channel: channel,
    acknowledgement_reference: reference,
    acknowledgement_note: note,
    acknowledged_at: acknowledgedAt,
    identity_matches_action: identityMatches,
    valid: errors.length === 0,
    errors
  };
}

export function summarizeResponsibleAcknowledgement(validation, state, actor = {}, options = {}) {
  const rows = Array.isArray(validation?.decisions)
    ? validation.decisions.filter((row) => row.state === 'authorized_ready_for_acknowledgement')
    : [];
  const nowValue = options.now || new Date().toISOString();
  const confirmationGeneratedAt = validation?.source_file?.generated_at || null;
  const acknowledgements = rows.map((row) => acknowledgementRow(row, state, nowValue, confirmationGeneratedAt));
  const invalid = acknowledgements.filter((row) => !row.valid).length;
  const acknowledged = acknowledgements.filter((row) => row.valid && row.acknowledgement_decision === 'acknowledged').length;
  const rejected = acknowledgements.filter((row) => row.valid && row.acknowledgement_decision === 'rejected').length;
  const clarification = acknowledgements.filter((row) => row.valid && row.acknowledgement_decision === 'needs_clarification').length;
  const actorAllowed = allowedRecorderRole(actor?.role);
  const captureAvailable = validation?.summary?.responsible_acknowledgement_capture_available === true;
  const packageReady = captureAvailable && actorAllowed && acknowledgements.length > 0 && invalid === 0;
  return {
    actions: acknowledgements.length,
    acknowledged,
    rejected,
    needs_clarification: clarification,
    invalid,
    actor_allowed: actorAllowed,
    capture_available: captureAvailable,
    acknowledgement_package_ready: packageReady,
    execution_candidate_count: packageReady ? acknowledged : 0,
    execution_authorized: false,
    generated_against: nowValue,
    acknowledgement_rows: acknowledgements
  };
}

export function buildResponsibleAcknowledgementPackage(validation, state, actor = {}, options = {}) {
  const summary = summarizeResponsibleAcknowledgement(validation, state, actor, options);
  const sourceRows = Array.isArray(validation?.decisions)
    ? validation.decisions.filter((row) => row.state === 'authorized_ready_for_acknowledgement')
    : [];
  const acknowledgementMap = new Map(summary.acknowledgement_rows.map((row) => [row.deal_id, row]));

  return {
    export_type: 'navigator_v2_operational_pilot_responsible_acknowledgement_evidence',
    schema_version: 1,
    generated_at: options.generatedAt || new Date().toISOString(),
    source: {
      owner_start_generated_at: validation?.source_file?.generated_at || null,
      owner_start_validated_at: validation?.validated_at || null,
      report_generated_at: validation?.fresh_source?.report_generated_at || null,
      report_version: validation?.fresh_source?.report_version || null,
      pilot_version: validation?.fresh_source?.pilot_version || null,
      shortlist_key: validation?.fresh_source?.shortlist_key || null,
      baseline_key: validation?.source_file?.baseline_key || null,
      checklist_key: validation?.source_file?.checklist_key || null,
      confirmation_key: validation?.source_file?.confirmation_key || null,
      planner_actor: validation?.source_file?.planner_actor || null,
      owner_actor: validation?.source_file?.owner_actor || null
    },
    recorder_actor: {
      id: actor?.id || null,
      full_name: text(actor?.full_name) || null,
      email: text(actor?.email) || null,
      role: text(actor?.role) || null,
      role_allowed: allowedRecorderRole(actor?.role)
    },
    summary: {
      authorized_actions_reviewed: summary.actions,
      acknowledged_actions: summary.acknowledged,
      rejected_actions: summary.rejected,
      needs_clarification_actions: summary.needs_clarification,
      invalid_acknowledgements: summary.invalid,
      acknowledgement_package_ready: summary.acknowledgement_package_ready,
      execution_candidate_count: summary.execution_candidate_count,
      authenticated_self_acknowledgements: 0,
      execution_authorized: false,
      pilot_started: false,
      server_mutation_performed: false
    },
    acknowledgements: sourceRows.map((row) => {
      const acknowledgement = acknowledgementMap.get(row.deal_id) || acknowledgementRow(
        row,
        state,
        summary.generated_against,
        validation?.source_file?.generated_at || null
      );
      return {
        deal_id: row.deal_id,
        lane: row.lane,
        deal_title: row.confirmation_snapshot?.deal_title || null,
        address: row.confirmation_snapshot?.address || null,
        action: row.confirmation_snapshot?.action || null,
        owner_decision: row.confirmation_snapshot?.owner_decision || null,
        responsible_acknowledgement: {
          acknowledgement_decision: acknowledgement.acknowledgement_decision,
          acknowledged_by_id: acknowledgement.acknowledged_by_id,
          acknowledged_by_name_or_role: acknowledgement.acknowledged_by_name_or_role,
          acknowledgement_channel: acknowledgement.acknowledgement_channel,
          acknowledgement_reference: acknowledgement.acknowledgement_reference,
          acknowledgement_note: acknowledgement.acknowledgement_note,
          acknowledged_at: acknowledgement.acknowledged_at,
          identity_matches_action: acknowledgement.identity_matches_action,
          valid: acknowledgement.valid,
          validation_errors: acknowledgement.errors
        },
        execution_state: {
          owner_authorized: true,
          responsible_acknowledged: acknowledgement.valid && acknowledgement.acknowledgement_decision === 'acknowledged',
          authenticated_self_acknowledgement: false,
          action_started: false,
          execution_receipt_created: false,
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
      automatic_execution_available: false,
      acknowledgement_recorded_by_owner_or_admin: true,
      acknowledgement_is_authenticated_self_action: false,
      execution_authorized: false,
      pilot_started: false,
      requires_authenticated_responsible_confirmation_or_explicit_owner_exception: true,
      requires_execution_receipt: true,
      requires_result_evidence: true,
      requires_post_action_result_confirmation: true
    }
  };
}
