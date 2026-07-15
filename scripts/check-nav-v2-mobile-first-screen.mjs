import assert from 'node:assert/strict';
import {
  buildMobileFirstScreenPlan,
  mobileFirstScreenPolicy
} from '../assets/js/nav-v2/mobile-first-screen-model-v2.js';

const expected = {
  dashboard: ['role-home-focus', 2],
  deals: ['deals-workspace', 2],
  'deal-card': ['deal-action-focus', 2],
  manager: ['manager-queue', 3]
};

for (const [page, [primaryRegion, maxVisibleActions]] of Object.entries(expected)) {
  const policy = mobileFirstScreenPolicy(page);
  assert.equal(policy.primaryRegion, primaryRegion, `${page} must put the operational result first`);
  assert.equal(policy.maxVisibleActions, maxVisibleActions, `${page} must keep a compact action budget`);
}

const items = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];
const actions = [{ id: 'primary' }, { id: 'context' }, { id: 'extra' }, { id: 'overflow' }];
const deals = buildMobileFirstScreenPlan('deals', { items, actions });
assert.equal(deals.primaryItem.id, 'first', 'The highest-priority item must remain visible');
assert.deepEqual(deals.secondaryItems.map((item) => item.id), ['second', 'third'], 'Secondary items must remain available for disclosure');
assert.deepEqual(deals.visibleActions.map((action) => action.id), ['primary', 'context'], 'Deals must expose at most two first-screen actions');
assert.deepEqual(deals.overflowActions.map((action) => action.id), ['extra', 'overflow'], 'Extra actions must not be lost');

const manager = buildMobileFirstScreenPlan('manager', { items, actions });
assert.equal(manager.visibleActions.length, 3, 'Manager may expose one main and two contextual actions');
assert.equal(manager.overflowActions.length, 1, 'Manager overflow must remain available');

const empty = buildMobileFirstScreenPlan('dashboard');
assert.equal(empty.primaryItem, null);
assert.deepEqual(empty.secondaryItems, []);
assert.throws(() => mobileFirstScreenPolicy('unknown'), /Unknown mobile first-screen page/);

console.log('Navigator v2 mobile first-screen semantic checks passed');

