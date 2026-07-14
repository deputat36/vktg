import assert from 'node:assert/strict';
import { buildManagerActionRoute, managerItemNeedsDistribution } from '../assets/js/nav-v2/manager-action-route-v2.js';

const base = {
  deal_id: 'deal-1',
  card_url: './deal-card-v2.html?id=deal-1',
  manager_id: 'manager-1',
  lawyer_assignment_state: 'assigned',
  broker_assignment_state: 'not_required',
  overdue_tasks_count: 0,
  blocking_risks_count: 0,
  overdue_required_documents_count: 0
};

const tasks = buildManagerActionRoute({ ...base, overdue_tasks_count: 4, blocking_risks_count: 2, overdue_required_documents_count: 1, manager_id: null });
assert.equal(tasks.primary.kind, 'tasks');
assert.equal(tasks.primary.href, './deal-card-v2.html?id=deal-1#tasks');
assert.match(tasks.primary.label, /4/);
assert.deepEqual(tasks.secondary.map((item) => item.kind), ['responsibility', 'risks', 'docs']);

const risks = buildManagerActionRoute({ ...base, blocking_risks_count: 3 });
assert.equal(risks.primary.kind, 'risks');
assert.equal(risks.primary.href, './deal-card-v2.html?id=deal-1#risks');

const docs = buildManagerActionRoute({ ...base, overdue_required_documents_count: 2 });
assert.equal(docs.primary.kind, 'docs');
assert.equal(docs.primary.href, './deal-card-v2.html?id=deal-1#docs');

const responsibility = buildManagerActionRoute({ ...base, manager_id: null });
assert.equal(managerItemNeedsDistribution({ ...base, manager_id: null }), true);
assert.equal(responsibility.primary.kind, 'responsibility');
assert.equal(responsibility.primary.href, './manager-source-remediation-v2.html?deal_id=deal-1');

const lawyer = buildManagerActionRoute({ ...base, lawyer_assignment_state: 'waiting_assignment' });
assert.equal(lawyer.context.needsDistribution, true);
assert.equal(lawyer.primary.kind, 'responsibility');

const card = buildManagerActionRoute(base);
assert.equal(card.primary.kind, 'card');
assert.equal(card.primary.href, './deal-card-v2.html?id=deal-1');
assert.deepEqual(card.secondary, []);

const encoded = buildManagerActionRoute({ ...base, deal_id: 'deal / 2', card_url: '' });
assert.equal(encoded.primary.href, './deal-card-v2.html?id=deal%20%2F%202');

console.log('Navigator v2 manager action routes semantic checks passed');
