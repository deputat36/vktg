import assert from 'node:assert/strict';
import {
  buildOwnerStartConfirmationPackage,
  createOwnerStartState,
  summarizeOwnerStartConfirmation,
  updateOwnerStartState,
  validatePilotActionChecklist
} from '../assets/js/nav-v2/operational-pilot-start-confirmation-model-v2.js';

const NOW = '2026-07-14T10:00:00.000Z';
const DUE = '2026-07-15T12:00:00.000Z';
const EXPIRES = '2026-07-15T10:00:00.000Z';

const metrics = {
  readiness_deposit: 50,
  readiness_deal: 40,
  open_tasks: 2,
  overdue_tasks: 1,
  open_risks: 1,
  blocking_deal_risks: 1,
  open_required_documents: 3,
  overdue_required_documents: 2,
  resolved_documents: 1,
  unowned_required_documents: 0
};
const responsibility = {
  manager_id: '00000000-0000-4000-8000-000000000001',
  manager_name: 'Менеджер',
  seller_spn_id: '00000000-0000-4000-8000-000000000002',
  seller_spn_name: 'СПН',
  buyer_spn_id: null,
  buyer_spn_name: null,
  evidence_candidate_id: null,
  evidence_candidate_name: null
};
const contract = {
  outcome_type: 'verified_action_completion',
  success_condition: 'one_action_completed_with_evidence_and_next_step',
  required_completion_fields: ['action_title', 'responsible_id_or_role', 'due_at', 'result_evidence', 'result_confirmed_at', 'next_step']
};
const action = {
  action_title: 'Закрыть одну просроченную клиентскую задачу',
  action_reference: 'task-1',
  responsible_id: responsibility.seller_spn_id,
  responsible_name_or_role: 'СПН',
  due_at: DUE,
  evidence_type: 'task_completion',
  expected_result: 'Просроченная задача закрыта подтверждённым результатом',
  evidence_requirement: 'Событие выполнения и письменное подтверждение клиента',
  next_step: 'Менеджер проверяет результат и назначает следующий этап',
  planning_note: 'Это минимальный проверяемый шаг для короткого цикла',
  valid: true,
  validation_errors: []
};
const execution = {
  action_started: false,
  responsible_acknowledged: false,
  deadline_acknowledged: false,
  evidence_received: false,
  result_confirmed: false,
  next_step_confirmed: false
};
const freshReport = {
  generated_at: NOW,
  report_version: 7,
  profile: { id: 'owner-1', full_name: 'Владелец', email: 'owner@example.test', role: 'owner' },
  operational_pilot_shortlist: {
    pilot_version: 1,
    items: [{
      review_order: 1,
      lane: 'quick_result',
      deal_id: 'deal-1',
      deal_title: 'Тестовая сделка',
      address: 'Тестовый адрес',
      ...metrics,
      ...responsibility
    }]
  }
};
const checklist = {
  export_type: 'navigator_v2_operational_pilot_action_checklist',
  schema_version: 1,
  generated_at: NOW,
  source: {
    report_version: 7,
    pilot_version: 1,
    shortlist_key: '1:quick_result:deal-1',
    baseline_key: 'baseline-1'
  },
  planner_actor: { id: 'owner-1', full_name: 'Владелец', email: 'owner@example.test', role: 'owner', role_allowed: true },
  summary: { planned_actions: 1, valid_actions: 1, invalid_actions: 0, checklist_ready: true, pilot_started: false, pilot_start_authorized: false },
  actions: [{
    deal_id: 'deal-1',
    lane: 'quick_result',
    deal_title: 'Тестовая сделка',
    address: 'Тестовый адрес',
    baseline_metrics: metrics,
    responsibility_snapshot: responsibility,
    measurement_contract: contract,
    action,
    execution_state: execution
  }],
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

const validation = validatePilotActionChecklist(checklist, freshReport, { now: NOW, validatedAt: NOW });
assert.equal(validation.summary.owner_start_confirmation_available, true);
assert.equal(validation.summary.fresh_revalidation_passed, true);

let state = createOwnerStartState(validation);
state = updateOwnerStartState(state, 'deal-1', {
  decision: 'authorized',
  authorization_note: 'Разрешаю ручной запуск после подтверждения ответственного',
  authorization_expires_at: EXPIRES
});
const ready = summarizeOwnerStartConfirmation(validation, state, freshReport.profile, { now: NOW });
assert.equal(ready.decision_package_ready, true);
assert.equal(ready.pilot_start_authorized, true);
const pkg = buildOwnerStartConfirmationPackage(validation, state, freshReport.profile, { now: NOW, generatedAt: NOW });
assert.equal(pkg.summary.decision_package_ready, true);
assert.equal(pkg.summary.pilot_start_authorized, true);
assert.equal(pkg.summary.pilot_started, false);
assert.equal(pkg.safety.responsible_acknowledgement_recorded, false);

const changed = structuredClone(freshReport);
changed.operational_pilot_shortlist.items[0].open_tasks = 3;
assert.equal(validatePilotActionChecklist(checklist, changed, { now: NOW }).summary.fresh_revalidation_passed, false);

const manager = structuredClone(freshReport);
manager.profile.role = 'manager';
assert.equal(validatePilotActionChecklist(checklist, manager, { now: NOW }).summary.owner_start_confirmation_available, false);

const duplicateChecklist = structuredClone(checklist);
duplicateChecklist.actions.push(structuredClone(duplicateChecklist.actions[0]));
duplicateChecklist.summary.planned_actions = 2;
duplicateChecklist.summary.valid_actions = 2;
assert.equal(validatePilotActionChecklist(duplicateChecklist, freshReport, { now: NOW }).summary.checklist_package_valid, false);

const pastSummary = structuredClone(checklist);
pastSummary.actions[0].action.due_at = '2026-07-13T12:00:00.000Z';
assert.equal(validatePilotActionChecklist(pastSummary, freshReport, { now: NOW }).summary.checklist_package_valid, false);

const tamperedSafety = structuredClone(checklist);
tamperedSafety.safety.server_mutation_available = true;
assert.equal(validatePilotActionChecklist(tamperedSafety, freshReport, { now: NOW }).summary.checklist_package_valid, false);

let expiredState = createOwnerStartState(validation);
expiredState = updateOwnerStartState(expiredState, 'deal-1', {
  decision: 'authorized',
  authorization_note: 'Разрешение действует слишком долго и должно быть отклонено',
  authorization_expires_at: '2026-07-16T10:00:00.000Z'
});
assert.equal(summarizeOwnerStartConfirmation(validation, expiredState, freshReport.profile, { now: NOW }).decision_package_ready, false);

let rejectedState = createOwnerStartState(validation);
rejectedState = updateOwnerStartState(rejectedState, 'deal-1', {
  decision: 'rejected',
  authorization_note: 'План отклонён до уточнения фактического ответственного'
});
const rejected = summarizeOwnerStartConfirmation(validation, rejectedState, freshReport.profile, { now: NOW });
assert.equal(rejected.decision_package_ready, true);
assert.equal(rejected.pilot_start_authorized, false);

console.log('Navigator v2 operational pilot owner start confirmation semantic regression passed');
