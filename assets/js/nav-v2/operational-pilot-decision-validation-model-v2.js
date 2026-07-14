const NOTE_MIN_LENGTH = 10;
const DECISION_STATUSES = new Set(['confirmed', 'rejected']);
const ALLOWED_ROLES = new Set(['owner', 'admin']);
const TRACKED_FIELDS = [
  'review_order',
  'lane',
  'lane_label',
  'deal_id',
  'deal_title',
  'address',
  'deal_status',
  'readiness_deposit',
  'readiness_deal',
  'manager_id',
  'manager_name',
  'seller_spn_id',
  'seller_spn_name',
  'buyer_spn_id',
  'buyer_spn_name',
  'evidence_candidate_id',
  'evidence_candidate_name',
  'open_tasks',
  'overdue_tasks',
  'open_risks',
  'blocking_deal_risks',
  'open_required_documents',
  'overdue_required_documents',
  'resolved_documents',
  'unowned_required_documents',
  'reasons',
  'cautions',
  'safe_action'
];

function text(value) {
  return String(value ?? '').trim();
}

function scalar(value) {
  return value === undefined || value === '' ? null : value;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function allowedRole(value) {
  return ALLOWED_ROLES.has(text(value));
}

function normalizedSnapshot(item = {}) {
  return {
    review_order: number(item.review_order),
    lane: text(item.lane),
    lane_label: text(item.lane_label) || null,
    deal_id: text(item.deal_id),
    deal_title: text(item.deal_title) || null,
    address: text(item.address) || null,
    deal_status: text(item.deal_status) || null,
    readiness_deposit: number(item.readiness_deposit),
    readiness_deal: number(item.readiness_deal),
    manager_id: scalar(item.manager_id),
    manager_name: text(item.manager_name) || null,
    seller_spn_id: scalar(item.seller_spn_id),
    seller_spn_name: text(item.seller_spn_name) || null,
    buyer_spn_id: scalar(item.buyer_spn_id),
    buyer_spn_name: text(item.buyer_spn_name) || null,
    evidence_candidate_id: scalar(item.evidence_candidate_id),
    evidence_candidate_name: text(item.evidence_candidate_name) || null,
    open_tasks: number(item.open_tasks),
    overdue_tasks: number(item.overdue_tasks),
    open_risks: number(item.open_risks),
    blocking_deal_risks: number(item.blocking_deal_risks),
    open_required_documents: number(item.open_required_documents),
    overdue_required_documents: number(item.overdue_required_documents),
    resolved_documents: number(item.resolved_documents),
    unowned_required_documents: number(item.unowned_required_documents),
    reasons: list(item.reasons),
    cautions: list(item.cautions),
    safe_action: text(item.safe_action) || null
  };
}

function snapshotKey(items) {
  return items
    .map(normalizedSnapshot)
    .filter((item) => item.deal_id && item.lane)
    .map((item) => `${item.review_order}:${item.lane}:${item.deal_id}`)
    .sort()
    .join('|');
}

function stableValue(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value === null || value === undefined) return 'null';
  return String(value);
}

function snapshotChanges(previous, fresh) {
  const before = normalizedSnapshot(previous);
  const after = normalizedSnapshot(fresh);
  return TRACKED_FIELDS.flatMap((field) => {
    if (stableValue(before[field]) === stableValue(after[field])) return [];
    return [{ field, package_value: before[field], fresh_value: after[field] }];
  });
}

function topErrors(payload) {
  const errors = [];
  const root = object(payload);
  if (!root) return ['Корневое значение JSON должно быть объектом.'];
  if (root.export_type !== 'navigator_v2_operational_pilot_owner_decision') errors.push('Неверный export_type.');
  if (Number(root.schema_version) !== 1) errors.push('Поддерживается только schema_version=1.');
  if (!object(root.source)) errors.push('Отсутствует source.');
  if (!object(root.decision_author)) errors.push('Отсутствует decision_author.');
  if (!object(root.summary)) errors.push('Отсутствует summary.');
  if (!Array.isArray(root.decisions)) errors.push('decisions должен быть массивом.');
  if (!Array.isArray(root.shortlist_snapshot)) errors.push('shortlist_snapshot должен быть массивом.');
  if (!object(root.safety)) errors.push('Отсутствует safety.');
  return errors;
}

function safetyErrors(safety = {}) {
  const required = {
    browser_local_only: true,
    server_mutation_available: false,
    automatic_selection_available: false,
    pilot_started: false,
    pilot_start_authorized: false,
    requires_manual_pilot_start: true,
    requires_fresh_readonly_revalidation: true,
    requires_separate_measurement_baseline: true
  };
  return Object.entries(required).flatMap(([field, expected]) => (
    safety?.[field] === expected ? [] : [`Некорректный safety marker ${field}.`]
  ));
}

function normalizedDecision(row = {}) {
  const decisionStatus = text(row.decision_status).toLowerCase();
  const note = text(row.note);
  return {
    deal_id: text(row.deal_id),
    lane: text(row.lane),
    decision_status: decisionStatus,
    note,
    selected_for_pilot: row.selected_for_pilot === true,
    note_valid: row.note_valid === true,
    structural_errors: [
      !text(row.deal_id) ? 'Не указан deal_id.' : null,
      !text(row.lane) ? 'Не указан lane.' : null,
      !DECISION_STATUSES.has(decisionStatus) ? 'Решение должно быть confirmed или rejected.' : null,
      note.length < NOTE_MIN_LENGTH ? `Основание должно содержать не менее ${NOTE_MIN_LENGTH} символов.` : null,
      row.selected_for_pilot !== (decisionStatus === 'confirmed') ? 'selected_for_pilot не соответствует decision_status.' : null,
      row.note_valid !== true ? 'note_valid должен быть true.' : null
    ].filter(Boolean)
  };
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
  return contracts[lane] || {
    outcome_type: 'manual_operational_result',
    success_condition: 'result_confirmed_with_evidence_and_next_step',
    required_completion_fields: ['responsible_id_or_role', 'due_at', 'result_evidence', 'result_confirmed_at', 'next_step']
  };
}

export function validatePilotOwnerDecisionPackage(payload, freshReport, options = {}) {
  const errors = topErrors(payload);
  const root = object(payload) || {};
  const snapshots = Array.isArray(root.shortlist_snapshot) ? root.shortlist_snapshot.map(normalizedSnapshot) : [];
  const freshItems = Array.isArray(freshReport?.operational_pilot_shortlist?.items)
    ? freshReport.operational_pilot_shortlist.items.map(normalizedSnapshot)
    : [];
  const decisions = Array.isArray(root.decisions) ? root.decisions.map(normalizedDecision) : [];
  const packageKey = snapshotKey(snapshots);
  const freshKey = snapshotKey(freshItems);
  const packageIds = snapshots.map((item) => item.deal_id).filter(Boolean);
  const decisionIds = decisions.map((item) => item.deal_id).filter(Boolean);
  const duplicatePackageIds = packageIds.filter((id, index) => packageIds.indexOf(id) !== index);
  const duplicateDecisionIds = decisionIds.filter((id, index) => decisionIds.indexOf(id) !== index);
  const author = object(root.decision_author) || {};
  const summary = object(root.summary) || {};
  const source = object(root.source) || {};
  const safety = object(root.safety) || {};

  errors.push(...safetyErrors(safety));
  if (!allowedRole(author.role) || author.role_allowed !== true) errors.push('Автор решения должен быть owner/admin с role_allowed=true.');
  if (summary.decision_package_ready !== true) errors.push('В исходном пакете decision_package_ready должен быть true.');
  if (!snapshots.length) errors.push('Shortlist snapshot пуст.');
  if (snapshots.length !== decisions.length) errors.push('Количество decisions не совпадает с shortlist_snapshot.');
  if (duplicatePackageIds.length) errors.push('В shortlist_snapshot есть повторяющиеся deal_id.');
  if (duplicateDecisionIds.length) errors.push('В decisions есть повторяющиеся deal_id.');
  if (source.shortlist_key !== packageKey) errors.push('source.shortlist_key не совпадает с содержимым shortlist_snapshot.');
  if (Number(source.report_version) !== Number(freshReport?.report_version)) errors.push('Версия operational report изменилась.');
  if (Number(source.pilot_version) !== Number(freshReport?.operational_pilot_shortlist?.pilot_version)) errors.push('Версия pilot shortlist изменилась.');
  if (!allowedRole(freshReport?.profile?.role)) errors.push('Свежую проверку должен выполнять owner/admin.');

  decisions.forEach((decision) => {
    errors.push(...decision.structural_errors.map((error) => `${decision.deal_id || 'неизвестная сделка'}: ${error}`));
    const snapshot = snapshots.find((item) => item.deal_id === decision.deal_id);
    if (!snapshot) errors.push(`${decision.deal_id || 'неизвестная сделка'}: решение отсутствует в shortlist_snapshot.`);
    if (snapshot && snapshot.lane !== decision.lane) errors.push(`${decision.deal_id}: lane решения не совпадает со snapshot.`);
  });

  snapshots.forEach((snapshot) => {
    if (!decisions.some((decision) => decision.deal_id === snapshot.deal_id)) {
      errors.push(`${snapshot.deal_id}: snapshot не имеет решения.`);
    }
  });

  const packageStructurallyValid = errors.length === 0;
  const rows = decisions.map((decision) => {
    const packageSnapshot = snapshots.find((item) => item.deal_id === decision.deal_id) || null;
    const freshSnapshot = freshItems.find((item) => item.deal_id === decision.deal_id) || null;
    const changes = packageSnapshot && freshSnapshot ? snapshotChanges(packageSnapshot, freshSnapshot) : [];
    const missingFresh = !freshSnapshot;
    const stale = missingFresh || changes.length > 0 || packageKey !== freshKey;
    const state = !packageStructurallyValid || decision.structural_errors.length
      ? 'invalid'
      : stale
        ? 'stale'
        : decision.decision_status === 'confirmed'
          ? 'confirmed_ready_for_baseline'
          : 'rejected_verified';
    return {
      deal_id: decision.deal_id,
      lane: decision.lane,
      decision_status: decision.decision_status,
      note: decision.note,
      selected_for_pilot: decision.selected_for_pilot,
      state,
      missing_in_fresh_shortlist: missingFresh,
      changes,
      package_snapshot: packageSnapshot,
      fresh_snapshot: freshSnapshot
    };
  });

  const confirmed = rows.filter((row) => row.decision_status === 'confirmed').length;
  const rejected = rows.filter((row) => row.decision_status === 'rejected').length;
  const stale = rows.filter((row) => row.state === 'stale').length;
  const invalid = rows.filter((row) => row.state === 'invalid').length;
  const changedFields = rows.reduce((total, row) => total + row.changes.length, 0);
  const freshRevalidationPassed = packageStructurallyValid && packageKey === freshKey && stale === 0 && invalid === 0;
  const measurementBaselineReady = freshRevalidationPassed && confirmed > 0;

  return {
    export_type: 'navigator_v2_operational_pilot_owner_decision_validation',
    schema_version: 1,
    validated_at: options.validatedAt || new Date().toISOString(),
    source_file: {
      exported_at: root.exported_at || null,
      report_version: source.report_version || null,
      pilot_version: source.pilot_version || null,
      shortlist_key: source.shortlist_key || null,
      decision_author: author
    },
    fresh_source: {
      report_generated_at: freshReport?.generated_at || null,
      report_version: freshReport?.report_version || null,
      pilot_version: freshReport?.operational_pilot_shortlist?.pilot_version || null,
      shortlist_key: freshKey,
      validator_actor: freshReport?.profile || null
    },
    top_errors: errors,
    summary: {
      decisions: decisions.length,
      confirmed,
      rejected,
      stale,
      invalid,
      changed_fields: changedFields,
      decision_package_valid: packageStructurallyValid,
      fresh_revalidation_passed: freshRevalidationPassed,
      measurement_baseline_ready: measurementBaselineReady
    },
    decisions: rows,
    safety: {
      server_mutation_available: false,
      pilot_started: false,
      pilot_start_authorized: false,
      baseline_is_readonly_snapshot: true,
      requires_separate_manual_pilot_start: true
    }
  };
}

export function buildPilotMeasurementBaseline(validation, options = {}) {
  if (validation?.summary?.measurement_baseline_ready !== true) return null;
  const confirmedRows = Array.isArray(validation.decisions)
    ? validation.decisions.filter((row) => row.state === 'confirmed_ready_for_baseline')
    : [];
  if (!confirmedRows.length) return null;

  return {
    export_type: 'navigator_v2_operational_pilot_measurement_baseline',
    schema_version: 1,
    generated_at: options.generatedAt || new Date().toISOString(),
    source: {
      decision_exported_at: validation.source_file?.exported_at || null,
      validation_validated_at: validation.validated_at || null,
      report_generated_at: validation.fresh_source?.report_generated_at || null,
      report_version: validation.fresh_source?.report_version || null,
      pilot_version: validation.fresh_source?.pilot_version || null,
      shortlist_key: validation.fresh_source?.shortlist_key || null,
      decision_author: validation.source_file?.decision_author || null,
      validator_actor: validation.fresh_source?.validator_actor || null
    },
    summary: {
      confirmed_deals: confirmedRows.length,
      baseline_ready: true,
      pilot_started: false,
      completion_results: 0
    },
    baselines: confirmedRows.map((row) => {
      const snapshot = normalizedSnapshot(row.fresh_snapshot || {});
      return {
        deal_id: row.deal_id,
        lane: row.lane,
        decision_note: row.note,
        deal_title: snapshot.deal_title,
        address: snapshot.address,
        baseline_at: validation.fresh_source?.report_generated_at || validation.validated_at || null,
        baseline_metrics: {
          readiness_deposit: snapshot.readiness_deposit,
          readiness_deal: snapshot.readiness_deal,
          open_tasks: snapshot.open_tasks,
          overdue_tasks: snapshot.overdue_tasks,
          open_risks: snapshot.open_risks,
          blocking_deal_risks: snapshot.blocking_deal_risks,
          open_required_documents: snapshot.open_required_documents,
          overdue_required_documents: snapshot.overdue_required_documents,
          resolved_documents: snapshot.resolved_documents,
          unowned_required_documents: snapshot.unowned_required_documents
        },
        responsibility_snapshot: {
          manager_id: snapshot.manager_id,
          manager_name: snapshot.manager_name,
          seller_spn_id: snapshot.seller_spn_id,
          seller_spn_name: snapshot.seller_spn_name,
          buyer_spn_id: snapshot.buyer_spn_id,
          buyer_spn_name: snapshot.buyer_spn_name,
          evidence_candidate_id: snapshot.evidence_candidate_id,
          evidence_candidate_name: snapshot.evidence_candidate_name
        },
        measurement_contract: laneContract(row.lane),
        execution_state: {
          action_selected: false,
          responsible_confirmed: false,
          deadline_confirmed: false,
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
      pilot_started: false,
      pilot_start_authorized: false,
      requires_manual_action_selection: true,
      requires_manual_pilot_start: true,
      requires_result_evidence: true
    }
  };
}
