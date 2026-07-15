import assert from 'node:assert/strict';
import {
  focusModeForControl,
  nextTabIndex,
  sortOperationalRegions
} from '../assets/js/nav-v2/accessibility-continuity-model-v2.js';

const regions = [
  { id: 'hero', sourceOrder: 0, visualOrder: 0 },
  { id: 'status', sourceOrder: 1, visualOrder: 8 },
  { id: 'metrics', sourceOrder: 2, visualOrder: 9 },
  { id: 'workspace', sourceOrder: 3, visualOrder: 1 }
];

assert.deepEqual(
  sortOperationalRegions(regions, true).map((item) => item.id),
  ['hero', 'workspace', 'status', 'metrics'],
  'compact DOM order must follow the visible action-first order'
);
assert.deepEqual(
  sortOperationalRegions(regions, false).map((item) => item.id),
  ['hero', 'status', 'metrics', 'workspace'],
  'desktop DOM order must restore source order'
);

assert.equal(nextTabIndex(0, 'ArrowRight', 3), 1);
assert.equal(nextTabIndex(2, 'ArrowRight', 3), 0);
assert.equal(nextTabIndex(0, 'ArrowLeft', 3), 2);
assert.equal(nextTabIndex(1, 'Home', 3), 0);
assert.equal(nextTabIndex(1, 'End', 3), 2);
assert.equal(nextTabIndex(1, 'Enter', 3), -1);
assert.equal(nextTabIndex(0, 'ArrowRight', 0), -1);

assert.equal(focusModeForControl('tab'), 'tab');
for (const type of ['tab_shortcut', 'action_focus', 'completion_next', 'spn_rework']) {
  assert.equal(focusModeForControl(type), 'panel');
}
assert.equal(focusModeForControl('unknown'), '');

console.log('Navigator v2 accessibility continuity semantic checks passed');
