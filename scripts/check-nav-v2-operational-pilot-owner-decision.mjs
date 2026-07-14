import assert from 'node:assert/strict';
import {
  buildPilotDecisionPackage,
  createPilotDecisionState,
  reconcilePilotDecisionState,
  summarizePilotDecisions,
  updatePilotDecision
} from '../assets/js/nav-v2/operational-adoption-pilot-decision-v2.js';

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
    open_tasks: 5,
    overdue_tasks: 5,
    open_risks: 2,
    blocking_deal_risks: 2,
    open_required_documents: 8,
    overdue_required_documents: 0,
    resolved_documents: 0,
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
    evidence_candidate_id: 'spn-1',
    evidence_candidate_name: 'Овчинников Александр Константинович',
    open_tasks: 3,
    overdue_tasks: 3,
    open_required_documents: 11,
    unowned_required_documents: 11
  },
  {
    review_order: 3,
    lane: 'document_workflow',
    lane_label: 'Документный рабочий цикл',
    deal_id: 'deal-document',
    deal_title: 'Приборная',
    address: 'Приборная',
    deal_status: 'in_progress',
    open_tasks: 5,
    overdue_tasks: 5,
    open_required_documents: 9,
    overdue_required_documents: 6,
    resolved_documents: 2
  }
];

const ownerProfile = {
  id: 'owner-1',
  full_name: 'Владелец',
  email: 'owner@example.test',
  role: 'owner'
};

let state = createPilotDecisionState(items);
assert.deepEqual(Object.keys(state).sort(), ['deal-document', 'deal-quick', 'deal-responsibility']);
assert.equal(summarizePilotDecisions(items, state, ownerProfile).pending, 3);
assert.equal(summarizePilotDecisions(items, state, ownerProfile).decision_package_ready, false);

state = updatePilotDecision(state, 'deal-quick', {
  decision_status: 'confirmed',
  note: 'Проверить короткий результат по одному действию.'
});
state = updatePilotDecision(state, 'deal-responsibility', {
  decision_status: 'rejected',
  note: 'Сначала требуется подтвердить сторону сделки и менеджера.'
});
state = updatePilotDecision(state, 'deal-document', {
  decision_status: 'confirmed',
  note: 'Провести один обязательный документ через полный цикл.'
});

const complete = summarizePilotDecisions(items, state, ownerProfile);
assert.equal(complete.total, 3);
assert.equal(complete.reviewed, 3);
assert.equal(complete.confirmed, 2);
assert.equal(complete.rejected, 1);
assert.equal(complete.pending, 0);
assert.equal(complete.invalid_notes, 0);
assert.equal(complete.review_complete, true);
assert.equal(complete.decision_package_ready, true);

const report = {
  report_version: 7,
  generated_at: '2026-07-14T07:00:00.000Z',
  period_days: 30,
  profile: ownerProfile,
  operational_pilot_shortlist: {
    pilot_version: 1,
    items
  }
};

const payload = buildPilotDecisionPackage(report, state, { exportedAt: '2026-07-14T07:05:00.000Z' });
assert.equal(payload.export_type, 'navigator_v2_operational_pilot_owner_decision');
assert.equal(payload.schema_version, 1);
assert.equal(payload.summary.decision_package_ready, true);
assert.equal(payload.decisions.filter((item) => item.selected_for_pilot).length, 2);
assert.equal(payload.shortlist_snapshot.length, 3);
assert.equal(payload.source.shortlist_key, '1:quick_result:deal-quick|2:responsibility_confirmation:deal-responsibility|3:document_workflow:deal-document');
assert.equal(payload.safety.browser_local_only, true);
assert.equal(payload.safety.server_mutation_available, false);
assert.equal(payload.safety.automatic_selection_available, false);
assert.equal(payload.safety.pilot_started, false);
assert.equal(payload.safety.pilot_start_authorized, false);
assert.equal(payload.safety.requires_manual_pilot_start, true);
assert.equal(payload.safety.requires_fresh_readonly_revalidation, true);
assert.equal(payload.safety.requires_separate_measurement_baseline, true);

const shortNoteState = updatePilotDecision(state, 'deal-document', { note: 'коротко' });
assert.equal(summarizePilotDecisions(items, shortNoteState, ownerProfile).invalid_notes, 1);
assert.equal(summarizePilotDecisions(items, shortNoteState, ownerProfile).decision_package_ready, false);

const managerSummary = summarizePilotDecisions(items, state, { ...ownerProfile, role: 'manager' });
assert.equal(managerSummary.review_complete, true);
assert.equal(managerSummary.author_allowed, false);
assert.equal(managerSummary.decision_package_ready, false);

const changedItems = items.map((item) => item.deal_id === 'deal-quick' ? { ...item, lane: 'document_workflow' } : item);
const reconciled = reconcilePilotDecisionState(changedItems, state);
assert.equal(reconciled['deal-quick'].decision_status, 'pending');
assert.equal(reconciled['deal-responsibility'].decision_status, 'rejected');

console.log('Navigator v2 operational pilot owner decision semantic regression passed');
