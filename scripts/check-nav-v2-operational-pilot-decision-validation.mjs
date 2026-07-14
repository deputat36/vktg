import assert from 'node:assert/strict';
import {
  buildPilotDecisionPackage,
  createPilotDecisionState,
  updatePilotDecision
} from '../assets/js/nav-v2/operational-adoption-pilot-decision-v2.js';
import {
  buildPilotMeasurementBaseline,
  validatePilotOwnerDecisionPackage
} from '../assets/js/nav-v2/operational-pilot-decision-validation-model-v2.js';

const items = [
  {
    review_order: 1,
    lane: 'quick_result',
    lane_label: 'Быстрый пилотный цикл',
    deal_id: 'deal-quick',
    deal_title: 'Пушкинская 97-11',
    address: 'Пушкинская 97-11',
    deal_status: 'in_progress',
    readiness_deposit: 60,
    readiness_deal: 55,
    manager_id: null,
    seller_spn_id: null,
    buyer_spn_id: null,
    open_tasks: 5,
    overdue_tasks: 5,
    open_risks: 2,
    blocking_deal_risks: 2,
    open_required_documents: 8,
    overdue_required_documents: 0,
    resolved_documents: 0,
    unowned_required_documents: 0,
    reasons: ['Уникальный адрес'],
    cautions: ['Нужно подтвердить ответственность'],
    safe_action: 'Выбрать одно проверяемое действие'
  },
  {
    review_order: 2,
    lane: 'responsibility_confirmation',
    lane_label: 'Подтверждение ответственности',
    deal_id: 'deal-responsibility',
    deal_title: 'Танцырей',
    address: 'Танцырей',
    deal_status: 'in_progress',
    readiness_deposit: 70,
    readiness_deal: 65,
    evidence_candidate_id: 'spn-1',
    evidence_candidate_name: 'Овчинников Александр Константинович',
    open_tasks: 3,
    overdue_tasks: 3,
    open_risks: 2,
    blocking_deal_risks: 2,
    open_required_documents: 11,
    overdue_required_documents: 0,
    resolved_documents: 0,
    unowned_required_documents: 11,
    reasons: ['Есть сильный evidence-кандидат'],
    cautions: ['Нужно подтвердить сторону и manager_id'],
    safe_action: 'Проверить фактическую ответственность'
  },
  {
    review_order: 3,
    lane: 'document_workflow',
    lane_label: 'Документный рабочий цикл',
    deal_id: 'deal-document',
    deal_title: 'Приборная',
    address: 'Приборная',
    deal_status: 'in_progress',
    readiness_deposit: 50,
    readiness_deal: 45,
    open_tasks: 5,
    overdue_tasks: 5,
    open_risks: 2,
    blocking_deal_risks: 2,
    open_required_documents: 9,
    overdue_required_documents: 6,
    resolved_documents: 2,
    unowned_required_documents: 0,
    reasons: ['Есть смешанный документный цикл'],
    cautions: ['Шесть обязательных документов просрочены'],
    safe_action: 'Выбрать один обязательный документ'
  }
];

const owner = {
  id: 'owner-1',
  full_name: 'Владелец',
  email: 'owner@example.test',
  role: 'owner'
};

const report = {
  report_version: 7,
  generated_at: '2026-07-14T08:00:00.000Z',
  period_days: 30,
  profile: owner,
  operational_pilot_shortlist: {
    pilot_version: 1,
    items
  }
};

let state = createPilotDecisionState(items);
state = updatePilotDecision(state, 'deal-quick', {
  decision_status: 'confirmed',
  note: 'Проверить одно действие с результатом и следующим шагом.'
});
state = updatePilotDecision(state, 'deal-responsibility', {
  decision_status: 'rejected',
  note: 'Сначала подтвердить сторону сделки и manager_id кандидата.'
});
state = updatePilotDecision(state, 'deal-document', {
  decision_status: 'confirmed',
  note: 'Провести один обязательный документ через полный цикл.'
});

const ownerPackage = buildPilotDecisionPackage(report, state, {
  exportedAt: '2026-07-14T08:05:00.000Z'
});
const validation = validatePilotOwnerDecisionPackage(ownerPackage, {
  ...report,
  generated_at: '2026-07-14T08:10:00.000Z'
}, {
  validatedAt: '2026-07-14T08:11:00.000Z'
});

assert.equal(validation.export_type, 'navigator_v2_operational_pilot_owner_decision_validation');
assert.equal(validation.summary.decision_package_valid, true);
assert.equal(validation.summary.fresh_revalidation_passed, true);
assert.equal(validation.summary.measurement_baseline_ready, true);
assert.equal(validation.summary.confirmed, 2);
assert.equal(validation.summary.rejected, 1);
assert.equal(validation.summary.stale, 0);
assert.equal(validation.summary.changed_fields, 0);
assert.equal(validation.decisions.filter((row) => row.state === 'confirmed_ready_for_baseline').length, 2);
assert.equal(validation.decisions.filter((row) => row.state === 'rejected_verified').length, 1);
assert.equal(validation.safety.server_mutation_available, false);
assert.equal(validation.safety.pilot_start_authorized, false);

const baseline = buildPilotMeasurementBaseline(validation, {
  generatedAt: '2026-07-14T08:12:00.000Z'
});
assert.ok(baseline);
assert.equal(baseline.export_type, 'navigator_v2_operational_pilot_measurement_baseline');
assert.equal(baseline.summary.confirmed_deals, 2);
assert.equal(baseline.summary.baseline_ready, true);
assert.equal(baseline.summary.pilot_started, false);
assert.deepEqual(baseline.baselines.map((row) => row.deal_id).sort(), ['deal-document', 'deal-quick']);
assert.equal(baseline.baselines.find((row) => row.deal_id === 'deal-quick').measurement_contract.outcome_type, 'verified_action_completion');
assert.equal(baseline.baselines.find((row) => row.deal_id === 'deal-document').measurement_contract.outcome_type, 'document_cycle_completion');
assert.equal(baseline.safety.server_mutation_available, false);
assert.equal(baseline.safety.automatic_task_creation_available, false);
assert.equal(baseline.safety.automatic_assignment_available, false);
assert.equal(baseline.safety.automatic_status_change_available, false);
assert.equal(baseline.safety.pilot_start_authorized, false);
assert.equal(baseline.safety.requires_result_evidence, true);

const changedReport = {
  ...report,
  generated_at: '2026-07-14T08:20:00.000Z',
  operational_pilot_shortlist: {
    ...report.operational_pilot_shortlist,
    items: items.map((item) => item.deal_id === 'deal-document' ? { ...item, overdue_required_documents: 5 } : item)
  }
};
const staleValidation = validatePilotOwnerDecisionPackage(ownerPackage, changedReport);
assert.equal(staleValidation.summary.decision_package_valid, true);
assert.equal(staleValidation.summary.fresh_revalidation_passed, false);
assert.equal(staleValidation.summary.measurement_baseline_ready, false);
assert.equal(staleValidation.summary.stale, 1);
assert.equal(staleValidation.summary.changed_fields, 1);
assert.equal(staleValidation.decisions.find((row) => row.deal_id === 'deal-document').changes[0].field, 'overdue_required_documents');
assert.equal(buildPilotMeasurementBaseline(staleValidation), null);

const tamperedSafety = structuredClone(ownerPackage);
tamperedSafety.safety.pilot_start_authorized = true;
const invalidSafety = validatePilotOwnerDecisionPackage(tamperedSafety, report);
assert.equal(invalidSafety.summary.decision_package_valid, false);
assert.equal(invalidSafety.summary.measurement_baseline_ready, false);
assert.ok(invalidSafety.top_errors.some((error) => error.includes('pilot_start_authorized')));

const managerReport = { ...report, profile: { ...owner, role: 'manager' } };
const invalidActor = validatePilotOwnerDecisionPackage(ownerPackage, managerReport);
assert.equal(invalidActor.summary.decision_package_valid, false);
assert.equal(invalidActor.summary.measurement_baseline_ready, false);
assert.ok(invalidActor.top_errors.some((error) => error.includes('owner/admin')));

const allRejectedState = items.reduce((next, item) => updatePilotDecision(next, item.deal_id, {
  decision_status: 'rejected',
  note: `Отклонено после проверки сценария ${item.lane}.`
}), createPilotDecisionState(items));
const allRejectedPackage = buildPilotDecisionPackage(report, allRejectedState);
const allRejectedValidation = validatePilotOwnerDecisionPackage(allRejectedPackage, report);
assert.equal(allRejectedValidation.summary.decision_package_valid, true);
assert.equal(allRejectedValidation.summary.fresh_revalidation_passed, true);
assert.equal(allRejectedValidation.summary.confirmed, 0);
assert.equal(allRejectedValidation.summary.measurement_baseline_ready, false);
assert.equal(buildPilotMeasurementBaseline(allRejectedValidation), null);

const badKey = structuredClone(ownerPackage);
badKey.source.shortlist_key = 'tampered';
const invalidKey = validatePilotOwnerDecisionPackage(badKey, report);
assert.equal(invalidKey.summary.decision_package_valid, false);
assert.ok(invalidKey.top_errors.some((error) => error.includes('shortlist_key')));

console.log('Navigator v2 operational pilot decision validation semantic regression passed');
