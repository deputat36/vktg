import assert from 'node:assert/strict';
import {
  buildResponsibleAcknowledgementPackage,
  createResponsibleAcknowledgementState,
  summarizeResponsibleAcknowledgement,
  updateResponsibleAcknowledgementState,
  validateOwnerStartConfirmation
} from '../assets/js/nav-v2/operational-pilot-responsible-acknowledgement-model-v2.js';

const NOW = '2026-07-14T10:00:00.000Z';
const ACK_AT = '2026-07-14T09:45:00.000Z';

function freshReport(overrides = {}) {
  return {
    generated_at: '2026-07-14T09:59:00.000Z',
    report_version: 7,
    profile: { id: 'owner-1', role: 'owner', full_name: 'Алексей Ковтун', email: 'owner@example.test' },
    operational_pilot_shortlist: {
      pilot_version: 1,
      items: [
        {
          review_order: 1,
          lane: 'quick_result',
          deal_id: 'deal-1',
          deal_title: 'Тестовая сделка',
          address: 'Пушкинская 97-11'
        }
      ]
    },
    ...overrides
  };
}

function ownerStartPackage(overrides = {}) {
  const base = {
    export_type: 'navigator_v2_operational_pilot_owner_start_confirmation',
    schema_version: 1,
    generated_at: '2026-07-14T09:30:00.000Z',
    source: {
      checklist_generated_at: '2026-07-14T09:10:00.000Z',
      checklist_validated_at: '2026-07-14T09:15:00.000Z',
      report_generated_at: '2026-07-14T09:00:00.000Z',
      report_version: 7,
      pilot_version: 1,
      shortlist_key: '1:quick_result:deal-1',
      baseline_key: 'baseline-1',
      checklist_key: 'checklist-1',
      planner_actor: { id: 'owner-1', role: 'owner' }
    },
    owner_actor: {
      id: 'owner-1',
      full_name: 'Алексей Ковтун',
      email: 'owner@example.test',
      role: 'owner',
      role_allowed: true
    },
    summary: {
      reviewed_actions: 1,
      authorized_actions: 1,
      rejected_actions: 0,
      invalid_decisions: 0,
      decision_package_ready: true,
      pilot_start_authorized: true,
      pilot_started: false,
      server_mutation_performed: false
    },
    decisions: [
      {
        deal_id: 'deal-1',
        lane: 'quick_result',
        deal_title: 'Тестовая сделка',
        address: 'Пушкинская 97-11',
        action: {
          action_title: 'Получить письменное подтверждение следующего шага',
          action_reference: 'task-1',
          responsible_id: 'spn-1',
          responsible_name_or_role: 'Овчинников Александр Константинович',
          due_at: '2026-07-14T12:00:00.000Z',
          evidence_type: 'written_confirmation',
          expected_result: 'Получено подтверждение и назначен следующий шаг',
          evidence_requirement: 'Ссылка на сообщение ответственного',
          next_step: 'Проверить evidence и обновить план сделки',
          planning_note: 'Действие ограничено одним проверяемым результатом',
          valid: true,
          validation_errors: []
        },
        measurement_contract: { success_condition: 'one_action_completed_with_evidence_and_next_step' },
        owner_decision: {
          decision: 'authorized',
          authorization_note: 'Разрешаю ручное выполнение после подтверждения ответственного',
          authorization_expires_at: '2026-07-14T11:00:00.000Z',
          valid: true,
          validation_errors: []
        },
        execution_state: {
          owner_authorized: true,
          responsible_acknowledged: false,
          action_started: false,
          evidence_received: false,
          result_confirmed: false,
          next_step_confirmed: false
        }
      }
    ],
    safety: {
      browser_local_only: true,
      server_mutation_available: false,
      automatic_task_creation_available: false,
      automatic_assignment_available: false,
      automatic_status_change_available: false,
      owner_confirmation_is_server_execution: false,
      pilot_start_authorized_by_owner: true,
      pilot_started: false,
      responsible_acknowledgement_recorded: false,
      requires_manual_responsible_acknowledgement: true,
      requires_manual_execution: true,
      requires_execution_receipt: true,
      requires_result_evidence: true,
      requires_post_action_result_confirmation: true
    }
  };
  return structuredClone({ ...base, ...overrides });
}

const validation = validateOwnerStartConfirmation(ownerStartPackage(), freshReport(), { now: NOW, validatedAt: NOW });
assert.equal(validation.summary.confirmation_package_valid, true);
assert.equal(validation.summary.fresh_revalidation_passed, true);
assert.equal(validation.summary.authorized_ready, 1);
assert.equal(validation.summary.responsible_acknowledgement_capture_available, true);

let state = createResponsibleAcknowledgementState(validation);
state = updateResponsibleAcknowledgementState(state, 'deal-1', {
  acknowledgement_decision: 'acknowledged',
  acknowledged_by_id: 'spn-1',
  acknowledged_by_name_or_role: 'Овчинников Александр Константинович',
  acknowledgement_channel: 'messenger',
  acknowledgement_reference: 'telegram-message-42',
  acknowledgement_note: 'Ответственный подтвердил действие, срок и ожидаемый результат.',
  acknowledged_at: ACK_AT
});

const summary = summarizeResponsibleAcknowledgement(validation, state, freshReport().profile, { now: NOW });
assert.equal(summary.acknowledgement_package_ready, true);
assert.equal(summary.acknowledged, 1);
assert.equal(summary.execution_candidate_count, 1);
assert.equal(summary.execution_authorized, false);

const evidencePackage = buildResponsibleAcknowledgementPackage(validation, state, freshReport().profile, {
  now: NOW,
  generatedAt: NOW
});
assert.equal(evidencePackage.summary.acknowledgement_package_ready, true);
assert.equal(evidencePackage.summary.authenticated_self_acknowledgements, 0);
assert.equal(evidencePackage.summary.execution_authorized, false);
assert.equal(evidencePackage.summary.pilot_started, false);
assert.equal(evidencePackage.safety.acknowledgement_is_authenticated_self_action, false);
assert.equal(evidencePackage.safety.requires_execution_receipt, true);

const identityMismatchState = updateResponsibleAcknowledgementState(state, 'deal-1', { acknowledged_by_id: 'spn-other' });
const identityMismatch = summarizeResponsibleAcknowledgement(validation, identityMismatchState, freshReport().profile, { now: NOW });
assert.equal(identityMismatch.acknowledgement_package_ready, false);
assert.match(identityMismatch.acknowledgement_rows[0].errors.join(' '), /не совпадает/i);

const futureState = updateResponsibleAcknowledgementState(state, 'deal-1', { acknowledged_at: '2026-07-14T10:10:01.000Z' });
const futureSummary = summarizeResponsibleAcknowledgement(validation, futureState, freshReport().profile, { now: NOW });
assert.equal(futureSummary.acknowledgement_package_ready, false);
assert.match(futureSummary.acknowledgement_rows[0].errors.join(' '), /будущем/i);

const managerSummary = summarizeResponsibleAcknowledgement(validation, state, { id: 'manager-1', role: 'manager' }, { now: NOW });
assert.equal(managerSummary.actor_allowed, false);
assert.equal(managerSummary.acknowledgement_package_ready, false);

const expiredValidation = validateOwnerStartConfirmation(ownerStartPackage(), freshReport(), {
  now: '2026-07-14T11:30:00.000Z',
  validatedAt: '2026-07-14T11:30:00.000Z'
});
assert.equal(expiredValidation.summary.fresh_revalidation_passed, false);
assert.equal(expiredValidation.summary.expired > 0 || expiredValidation.summary.invalid > 0, true);

const staleReport = freshReport({
  operational_pilot_shortlist: {
    pilot_version: 1,
    items: [{ review_order: 1, lane: 'quick_result', deal_id: 'deal-1', deal_title: 'Изменённая сделка', address: 'Пушкинская 97-11' }]
  }
});
const staleValidation = validateOwnerStartConfirmation(ownerStartPackage(), staleReport, { now: NOW });
assert.equal(staleValidation.summary.fresh_revalidation_passed, false);
assert.equal(staleValidation.summary.stale, 1);

const tampered = ownerStartPackage();
tampered.safety.server_mutation_available = true;
const tamperedValidation = validateOwnerStartConfirmation(tampered, freshReport(), { now: NOW });
assert.equal(tamperedValidation.summary.confirmation_package_valid, false);
assert.match(tamperedValidation.top_errors.join(' '), /server_mutation_available/);

const duplicate = ownerStartPackage();
duplicate.decisions.push(structuredClone(duplicate.decisions[0]));
duplicate.summary.reviewed_actions = 2;
duplicate.summary.authorized_actions = 2;
const duplicateValidation = validateOwnerStartConfirmation(duplicate, freshReport(), { now: NOW });
assert.equal(duplicateValidation.summary.confirmation_package_valid, false);
assert.match(duplicateValidation.top_errors.join(' '), /повторяющиеся deal_id/i);

const rejected = ownerStartPackage();
rejected.summary.authorized_actions = 0;
rejected.summary.rejected_actions = 1;
rejected.summary.pilot_start_authorized = false;
rejected.decisions[0].owner_decision.decision = 'rejected';
rejected.decisions[0].owner_decision.authorization_expires_at = null;
rejected.decisions[0].execution_state.owner_authorized = false;
rejected.safety.pilot_start_authorized_by_owner = false;
const rejectedValidation = validateOwnerStartConfirmation(rejected, freshReport(), { now: NOW });
assert.equal(rejectedValidation.summary.confirmation_package_valid, true);
assert.equal(rejectedValidation.summary.fresh_revalidation_passed, true);
assert.equal(rejectedValidation.summary.authorized_ready, 0);
assert.equal(rejectedValidation.summary.rejected_verified, 1);
assert.equal(rejectedValidation.summary.responsible_acknowledgement_capture_available, false);

console.log('Navigator v2 pilot responsible acknowledgement semantic regression passed');
