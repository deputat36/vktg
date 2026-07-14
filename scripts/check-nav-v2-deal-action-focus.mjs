import assert from 'node:assert/strict';
import { buildDealActionFocus } from '../assets/js/nav-v2/deal-card-action-focus-model-v2.js';

const now = Date.parse('2026-07-14T12:00:00Z');
const profile = { id: 'user-1', role: 'owner', full_name: 'Алексей Ковтун' };
const baseDeal = {
  id: 'deal-1',
  status: 'draft',
  next_action: 'Проверить карточку',
  readiness_deposit: 70,
  readiness_deal: 50,
  manager_id: 'manager-1',
  seller_spn_id: 'spn-1'
};

const taskFocus = buildDealActionFocus({
  deal: baseDeal,
  tasks: [
    { id: 'future', title: 'Будущая задача', status: 'open', priority: 'high', due_date: '2026-07-20', assigned_role: 'broker', source: 'auto_broker' },
    { id: 'overdue', title: 'Юридическая проверка', description: 'Проверить детей и опеку', status: 'open', priority: 'urgent', due_date: '2026-07-10', assigned_role: 'lawyer', source: 'auto_lawyer', can_change_status: true }
  ],
  risks: [{ level: 'red', is_resolved: false }],
  documents: [{ is_required: true, status: 'needed' }]
}, profile, now);

assert.equal(taskFocus.taskId, 'overdue', 'Overdue urgent task must be primary');
assert.equal(taskFocus.deadlineState, 'overdue');
assert.equal(taskFocus.responsible, 'Юрист');
assert.equal(taskFocus.primaryTab, 'tasks');
assert.equal(taskFocus.relatedTab, 'risks');
assert.equal(taskFocus.canChangeTask, true);
assert.match(taskFocus.resultCriteria, /Юрист зафиксировал результат проверки/);
assert.deepEqual(taskFocus.blockers, { overdueTasks: 1, redRisks: 1, missingDocuments: 1 });

const ownTask = buildDealActionFocus({
  deal: baseDeal,
  tasks: [{ id: 'mine', title: 'Моя задача', status: 'in_progress', due_date: '2026-07-14', assigned_to: 'user-1', source: 'manual' }]
}, profile, now);
assert.equal(ownTask.responsible, 'Алексей Ковтун');
assert.equal(ownTask.deadlineState, 'today');

const riskFallback = buildDealActionFocus({
  deal: { ...baseDeal, next_action: '' },
  tasks: [],
  risks: [{ id: 'risk-1', level: 'red', is_resolved: false, title: 'Опека', recommendation: 'Передать юристу', assigned_role: 'lawyer' }],
  documents: []
}, profile, now);
assert.equal(riskFallback.source, 'risk');
assert.equal(riskFallback.title, 'Передать юристу');
assert.equal(riskFallback.responsible, 'Юрист');
assert.equal(riskFallback.primaryTab, 'risks');

const documentFallback = buildDealActionFocus({
  deal: baseDeal,
  tasks: [],
  risks: [],
  documents: [{ id: 'doc-1', title: 'Выписка ЕГРН', description: 'Проверить право', is_required: true, status: 'needed', responsible_role: 'spn', due_date: '2026-07-16' }]
}, profile, now);
assert.equal(documentFallback.source, 'document');
assert.match(documentFallback.title, /Выписка ЕГРН/);
assert.equal(documentFallback.responsible, 'СПН');
assert.equal(documentFallback.primaryTab, 'docs');
assert.equal(documentFallback.deadlineState, 'future');

const viewer = buildDealActionFocus({ deal: baseDeal, tasks: [] }, { id: 'viewer-1', role: 'viewer' }, now);
assert.equal(viewer.readOnly, true, 'Viewer focus must remain explicitly read-only');
assert.equal(viewer.canChangeTask, false);

console.log('Navigator v2 deal action focus semantic checks passed');
