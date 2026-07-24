import assert from 'node:assert/strict';
import {
  TASK_PERMISSION_BOOTSTRAP_EVENT,
  TASK_PERMISSION_BOOTSTRAP_KEY,
  TASK_PERMISSION_BOOTSTRAP_POLICY,
  buildTaskPermissionBootstrap,
  publishTaskPermissionBootstrap,
  readTaskPermissionBootstrap
} from '../../assets/js/nav-v2/task-permission-bootstrap-v1.js';

const card = {
  deal: { id: 'deal-1', address: 'Секретный адрес' },
  tasks: [
    {
      id: 'task-1',
      title: 'Персональные данные клиента',
      description: 'Не должно попасть в bootstrap',
      assigned_to: 'person-uuid',
      assigned_role: 'spn',
      status: 'open',
      can_change_status: true
    },
    {
      id: 'task-2',
      assigned_role: 'lawyer',
      status: 'in_progress',
      task_contract_version: 2,
      can_change_status: false,
      can_complete: true,
      outcome_state: 'active'
    }
  ]
};

const snapshot = buildTaskPermissionBootstrap(card);
assert.equal(snapshot.schema_version, 1);
assert.equal(snapshot.deal_id, 'deal-1');
assert.equal(snapshot.tasks.length, 2);
assert.deepEqual(snapshot.tasks[0], {
  id: 'task-1',
  status: 'open',
  assigned_role: 'spn',
  task_contract_version: null,
  outcome_state: null,
  can_change_status: true
});
assert.equal('title' in snapshot.tasks[0], false);
assert.equal('description' in snapshot.tasks[0], false);
assert.equal('assigned_to' in snapshot.tasks[0], false);
assert.equal(JSON.stringify(snapshot).includes('Секретный адрес'), false);
assert.equal(Object.isFrozen(snapshot), true);
assert.equal(Object.isFrozen(snapshot.tasks), true);
assert.equal(Object.isFrozen(snapshot.tasks[0]), true);

const events = [];
const target = {
  CustomEvent: class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  },
  dispatchEvent(event) { events.push(event); }
};
const published = publishTaskPermissionBootstrap(card, target);
assert.equal(target[TASK_PERMISSION_BOOTSTRAP_KEY], published);
assert.equal(events.length, 1);
assert.equal(events[0].type, TASK_PERMISSION_BOOTSTRAP_EVENT);
assert.deepEqual(events[0].detail, { deal_id: 'deal-1', task_count: 2 });
assert.equal(readTaskPermissionBootstrap(target, 'deal-1'), published);
assert.equal(readTaskPermissionBootstrap(target, 'another-deal'), null);
assert.equal(buildTaskPermissionBootstrap({ deal: {}, tasks: [] }), null);
assert.deepEqual(TASK_PERMISSION_BOOTSTRAP_POLICY, {
  authority: 'full_deal_card_server_permission',
  storage: 'memory_only',
  contains_pii: false,
  permission_inference: false,
  production_schema_change: false,
  fail_closed_without_snapshot: true
});

console.log('Navigator v2 task permission bootstrap unit regression passed');
