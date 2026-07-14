import assert from 'node:assert/strict';
import {
  buildPilotActionChecklistPackage,
  createPilotActionState,
  summarizePilotActionChecklist,
  updatePilotActionState,
  validatePilotMeasurementBaseline
} from '../assets/js/nav-v2/operational-pilot-action-checklist-model-v2.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const shortlistItems = [
  {
    review_order: 1,
    lane: 'quick_result',
    deal_id: 'deal-quick',
    deal_title: 'Пушкинская 97-11',
    address: 'Пушкинская 97-11',
    readiness_deposit: 60,
    readiness_deal: 55,
    manager_id: 'manager-1',
    manager_name: 'Менеджер Один',
    seller_spn_id: 'spn-1',
    seller_spn_name: 'СПН Один',
    buyer_spn_id: null,
    buyer_spn_name: null,
    evidence_candidate_id: null,
    evidence_candidate_name: null,
    open_tasks: 5,
    overdue_tasks: 5,
    open_risks: 2,
    blocking_deal_risks: 2,
    open_required_documents: 8,
    overdue_required_documents: 0,
    resolved_documents: 1,
    unowned_required_documents: 0
  },
  {
    review_order: 2,
    lane: 'responsibility_confirmation',
    deal_id: 'deal-responsibility',
    deal_title: 'Танцырей',
    address: 'Танцырей',
    readiness_deposit: 45,
    readiness_deal: 40,
    manager_id: null,
    manager_name: null,
    seller_spn_id: null,
    seller_spn_name: null,
    buyer_spn_id: null,
    buyer_spn_name: null,
    evidence_candidate_id: 'spn-2',
    evidence_candidate_name: 'СПН Два',
    open_tasks: 3,
    overdue_tasks: 3,
    open_risks: 2,
    blocking_deal_risks: 2,
    open_required_documents: 11,
    overdue_required_documents: 11,
    resolved_documents: 0,
    unowned_required_documents: 11
  },
  {
    review_order: 3,
    lane: 'document_workflow',
    deal_id: 'deal-document',
    deal_title: 'Приборная',
    address: 'Приборная',
    readiness_deposit: 50,
    readiness_deal: 45,
    manager_id: 'manager-1',
    manager_name: 'Менеджер Один',
    seller_spn_id: 'spn-3',
    seller_spn_name: 'СПН Три',
    buyer_spn_id: null,
    buyer_spn_name: null,
    evidence_candidate_id: null,
    evidence_candidate_name: null,
    open_tasks: 5,
    overdue_tasks: 5,
    open_risks: 2,
    blocking_deal_risks: 2,
    open_required_documents: 9,
    overdue_required_documents: 6,
    resolved_documents: 2,
    unowned_required_documents: 0
  }
];

const shortlistKey = shortlistItems
  .map((item) => `${item.review_order}:${item.lane}:${item.deal_id}`)
  .sort()
  .join('|');

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
  }
};

function baselineRow(item) {
  return {
    deal_id: item.deal_id,
    lane: item.lane,
    decision_note: `Owner подтвердил сценарий ${item.lane}`,
    deal_title: item.deal_title,
    address: item.address,
    baseline_at: '2026-07-14T08:00:00.000Z',
    baseline_metrics: {
      readiness_deposit: item.readiness_deposit,
      readiness_deal: item.readiness_deal,
      open_tasks: item.open_tasks,
      overdue_tasks: item.overdue_tasks,
      open_risks: item.open_risks,
      blocking_deal_risks: item.blocking_deal_risks,
      open_required_documents: item.open_required_documents,
      overdue_required_documents: item.overdue_required_documents,
      resolved_documents: item.resolved_documents,
      unowned_required_documents: item.unowned_required_documents
    },
    responsibility_snapshot: {
      manager_id: item.manager_id,
      manager_name: item.manager_name,
      seller_spn_id: item.seller_spn_id,
      seller_spn_name: item.seller_spn_name,
      buyer_spn_id: item.buyer_spn_id,
      buyer_spn_name: item.buyer_spn_name,
      evidence_candidate_id: item.evidence_candidate_id,
      evidence_candidate_name: item.evidence_candidate_name
    },
    measurement_contract: contracts[item.lane],
    execution_state: {
      action_selected: false,
      responsible_confirmed: false,
      deadline_confirmed: false,
      result_confirmed: false,
      next_step_confirmed: false
    }
  };
}

const owner = { id: 'owner-1', full_name: 'Владелец', email: 'owner@example.test', role: 'owner' };
const freshReport = {
  report_version: 7,
  generated_at: '2026-07-14T09:00:00.000Z',
  profile: owner,
  operational_pilot_shortlist: {
    pilot_version: 1,
    items: shortlistItems
  }
};

const baseline = {
  export_type: 'navigator_v2_operational_pilot_measurement_baseline',
  schema_version: 1,
  generated_at: '2026-07-14T08:10:00.000Z',
  source: {
    decision_exported_at: '2026-07-14T07:30:00.000Z',
    validation_validated_at: '2026-07-14T08:00:00.000Z',
    report_generated_at: '2026-07-14T08:00:00.000Z',
    report_version: 7,
    pilot_version: 1,
    shortlist_key: shortlistKey,
    decision_author: { ...owner, role_allowed: true },
    validator_actor: owner
  },
  summary: {
    confirmed_deals: 2,
    baseline_ready: true,
    pilot_started: false,
    completion_results: 0
  },
  baselines: [baselineRow(shortlistItems[0]), baselineRow(shortlistItems[1])],
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

const now = '2026-07-14T10:00:00.000Z';
const validation = validatePilotMeasurementBaseline(baseline, freshReport, { validatedAt: now });
assert.equal(validation.summary.baseline_package_valid, true);
assert.equal(validation.summary.fresh_revalidation_passed, true);
assert.equal(validation.summary.action_checklist_available, true);
assert.equal(validation.summary.fresh, 2);

let state = createPilotActionState(validation);
for (const row of validation.baselines) {
  state = updatePilotActionState(state, row.deal_id, {
    action_title: row.lane === 'quick_result'
      ? 'Закрыть одну просроченную клиентскую задачу с evidence'
      : 'Подтвердить фактического СПН, сторону сделки и менеджера',
    action_reference: row.lane === 'quick_result' ? 'task-overdue-1' : 'seller-side-spn',
    responsible_id: row.lane === 'quick_result' ? 'spn-1' : 'manager-1',
    responsible_name_or_role: row.lane === 'quick_result' ? 'СПН Один' : 'Владелец или менеджер',
    due_at: '2026-07-15T12:00:00.000Z',
    evidence_type: row.lane === 'quick_result' ? 'task_completion' : 'written_confirmation',
    expected_result: 'Получен объективно проверяемый результат по выбранному действию',
    evidence_requirement: 'Ссылка на событие карточки или письменное подтверждение результата',
    next_step: 'После проверки evidence зафиксировать следующий этап сделки',
    planning_note: 'Это минимальное безопасное действие для проверки операционного цикла'
  });
}

const summary = summarizePilotActionChecklist(validation, state, owner, { now });
assert.equal(summary.actions, 2);
assert.equal(summary.valid, 2);
assert.equal(summary.invalid, 0);
assert.equal(summary.checklist_ready, true);

const checklist = buildPilotActionChecklistPackage(validation, state, owner, {
  now,
  generatedAt: '2026-07-14T10:05:00.000Z'
});
assert.equal(checklist.export_type, 'navigator_v2_operational_pilot_action_checklist');
assert.equal(checklist.summary.checklist_ready, true);
assert.equal(checklist.summary.pilot_started, false);
assert.equal(checklist.summary.pilot_start_authorized, false);
assert.equal(checklist.actions.length, 2);
assert.equal(checklist.actions.every((row) => row.action.valid), true);
assert.equal(checklist.actions.every((row) => row.execution_state.action_started === false), true);
assert.equal(checklist.safety.server_mutation_available, false);
assert.equal(checklist.safety.checklist_is_execution_authorization, false);
assert.equal(checklist.safety.requires_separate_owner_start_confirmation, true);

const staleReport = clone(freshReport);
staleReport.operational_pilot_shortlist.items[0].overdue_required_documents = 1;
const staleValidation = validatePilotMeasurementBaseline(baseline, staleReport, { validatedAt: now });
assert.equal(staleValidation.summary.fresh_revalidation_passed, false);
assert.equal(staleValidation.summary.action_checklist_available, false);
assert.equal(staleValidation.baselines[0].state, 'stale');
assert.equal(staleValidation.baselines[0].changes.some((change) => change.field === 'baseline_metrics.overdue_required_documents'), true);

const tamperedSafety = clone(baseline);
tamperedSafety.safety.automatic_task_creation_available = true;
const safetyValidation = validatePilotMeasurementBaseline(tamperedSafety, freshReport, { validatedAt: now });
assert.equal(safetyValidation.summary.baseline_package_valid, false);
assert.equal(safetyValidation.summary.action_checklist_available, false);

const managerReport = clone(freshReport);
managerReport.profile = { id: 'manager-2', role: 'manager' };
const managerValidation = validatePilotMeasurementBaseline(baseline, managerReport, { validatedAt: now });
assert.equal(managerValidation.summary.baseline_package_valid, false);
assert.equal(managerValidation.summary.action_checklist_available, false);

const duplicateBaseline = clone(baseline);
duplicateBaseline.baselines.push(clone(duplicateBaseline.baselines[0]));
duplicateBaseline.summary.confirmed_deals = 3;
const duplicateValidation = validatePilotMeasurementBaseline(duplicateBaseline, freshReport, { validatedAt: now });
assert.equal(duplicateValidation.summary.baseline_package_valid, false);
assert.equal(duplicateValidation.top_errors.some((error) => error.includes('повторяющиеся deal_id')), true);

let pastState = clone(state);
pastState = updatePilotActionState(pastState, 'deal-quick', { due_at: '2026-07-14T09:00:00.000Z' });
const pastSummary = summarizePilotActionChecklist(validation, pastState, owner, { now });
assert.equal(pastSummary.checklist_ready, false);
assert.equal(pastSummary.invalid, 1);
assert.equal(pastSummary.action_rows.find((row) => row.deal_id === 'deal-quick').errors.some((error) => error.includes('позже')), true);

const managerSummary = summarizePilotActionChecklist(validation, state, { id: 'manager-2', role: 'manager' }, { now });
assert.equal(managerSummary.actor_allowed, false);
assert.equal(managerSummary.checklist_ready, false);

console.log('Navigator v2 operational pilot action checklist semantic regression passed');
