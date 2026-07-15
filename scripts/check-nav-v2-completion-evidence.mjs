import assert from 'node:assert/strict';
import { buildDealCompletionEvidence } from '../assets/js/nav-v2/deal-card-completion-evidence-model-v2.js';

const now = '2026-07-15T12:00:00Z';
const profile = { id: 'owner-1', role: 'owner', full_name: 'Алексей Ковтун' };
const deal = {
  id: 'deal-1', status: 'preparing_deal', next_action: 'Назначить дату сделки',
  manager_id: 'manager-1', lawyer_id: 'lawyer-1', seller_spn_id: 'spn-1'
};

const taskEvidence = buildDealCompletionEvidence({
  deal,
  tasks: [
    { id: 'task-done', title: 'Проверить пакет', status: 'done', completed_by: 'owner-1', completed_at: '2026-07-15T10:00:00Z' },
    { id: 'task-next', title: 'Согласовать дату', status: 'open', priority: 'urgent', due_date: '2026-07-16', assigned_role: 'manager' }
  ],
  documents: [], risks: [],
  events: [{ id: 'event-task', actor_id: 'owner-1', event_type: 'task_status_changed', created_at: '2026-07-15T10:00:00Z', event_data: { task_id: 'task-done', old_status: 'open', status: 'done' } }]
}, profile, { now });

assert.equal(taskEvidence.visible, true);
assert.equal(taskEvidence.kind, 'task');
assert.match(taskEvidence.title, /Проверить пакет/);
assert.equal(taskEvidence.actor, 'Алексей Ковтун');
assert.equal(taskEvidence.nextAction.taskId, 'task-next');
assert.equal(taskEvidence.nextAction.title, 'Согласовать дату');
assert.equal(taskEvidence.nextAction.primaryTab, 'tasks');
assert.match(taskEvidence.serverFact, /текущий статус задачи на сервере/);

const documentEvidence = buildDealCompletionEvidence({
  deal,
  tasks: [], risks: [],
  documents: [{ id: 'doc-1', title: 'Выписка ЕГРН', status: 'checked', checked_by: 'lawyer-1', responsible_role: 'lawyer' }],
  events: [
    { id: 'event-doc', actor_id: 'lawyer-1', event_type: 'document_workflow_updated', created_at: '2026-07-15T09:00:00Z', event_data: { document_id: 'doc-1', old_status: 'received', status: 'checked' } },
    { id: 'event-task-reopened', actor_id: 'owner-1', event_type: 'task_status_changed', created_at: '2026-07-15T10:00:00Z', event_data: { task_id: 'task-done', old_status: 'done', status: 'open' } }
  ]
}, profile, { now });

assert.equal(documentEvidence.kind, 'document', 'A reopened/missing task must not produce stale completion evidence');
assert.equal(documentEvidence.actor, 'Юрист');
assert.equal(documentEvidence.state, 'Проверен');

const noOpDocument = buildDealCompletionEvidence({
  deal,
  tasks: [], risks: [],
  documents: [{ id: 'doc-1', title: 'Выписка ЕГРН', status: 'checked' }],
  events: [{ id: 'event-doc', actor_id: 'lawyer-1', event_type: 'document_workflow_updated', created_at: '2026-07-15T09:00:00Z', event_data: { document_id: 'doc-1', old_status: 'checked', status: 'checked' } }]
}, profile, { now });
assert.equal(noOpDocument.visible, false, 'Assignment-only document update must not masquerade as completion');

const riskEvidence = buildDealCompletionEvidence({
  deal,
  tasks: [], documents: [],
  risks: [{ id: 'risk-1', title: 'Опека', is_resolved: true, resolved_by: 'lawyer-1', assigned_role: 'lawyer' }],
  events: [{ id: 'event-risk', actor_id: 'lawyer-1', event_type: 'risk_resolved', created_at: '2026-07-15T08:00:00Z', event_data: { risk_id: 'risk-1', is_resolved: true } }]
}, profile, { now });
assert.equal(riskEvidence.kind, 'risk');
assert.equal(riskEvidence.actor, 'Юрист');

const stageEvidence = buildDealCompletionEvidence({
  deal,
  tasks: [], documents: [], risks: [],
  events: [{ id: 'event-stage', actor_id: 'manager-1', event_type: 'status_changed', created_at: '2026-07-15T07:00:00Z', event_data: { old_status: 'deposit_done', status: 'preparing_deal' } }]
}, { id: 'viewer-1', role: 'viewer' }, { now });
assert.equal(stageEvidence.kind, 'deal_status');
assert.equal(stageEvidence.actor, 'Менеджер');
assert.equal(stageEvidence.readOnly, true);

const backwardStage = buildDealCompletionEvidence({
  deal: { ...deal, status: 'need_info' }, tasks: [], documents: [], risks: [],
  events: [{ event_type: 'status_changed', created_at: '2026-07-15T07:00:00Z', event_data: { old_status: 'preparing_deal', status: 'need_info' } }]
}, profile, { now });
assert.equal(backwardStage.visible, false, 'A return to rework is not completion evidence');

const stale = buildDealCompletionEvidence({
  deal,
  tasks: [{ id: 'task-done', title: 'Старая задача', status: 'done' }], documents: [], risks: [],
  events: [{ event_type: 'task_status_changed', created_at: '2026-07-01T10:00:00Z', event_data: { task_id: 'task-done', old_status: 'open', status: 'done' } }]
}, profile, { now });
assert.equal(stale.visible, false, 'Evidence older than seven days must not dominate the current card');

console.log('Navigator v2 completion evidence semantic checks passed');
