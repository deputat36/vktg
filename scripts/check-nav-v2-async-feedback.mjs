import assert from 'node:assert/strict';
import {
  asyncActivationMode,
  asyncFocusSelectors,
  asyncFocusToken,
  buildAsyncFeedbackPolicy,
  classifyAsyncStatus
} from '../assets/js/nav-v2/async-feedback-model-v2.js';

assert.equal(asyncActivationMode(0), 'keyboard');
assert.equal(asyncActivationMode(1), 'pointer');

assert.deepEqual(buildAsyncFeedbackPolicy('busy', 'keyboard'), {
  phase: 'busy', mode: 'keyboard', atomic: true,
  role: 'status', live: 'polite', busy: true, focus: false
});
assert.equal(buildAsyncFeedbackPolicy('error', 'keyboard').role, 'alert');
assert.equal(buildAsyncFeedbackPolicy('error', 'keyboard').live, 'assertive');
assert.equal(buildAsyncFeedbackPolicy('error', 'keyboard').focus, true);
assert.equal(buildAsyncFeedbackPolicy('error', 'pointer').focus, false);
assert.equal(buildAsyncFeedbackPolicy('success', 'keyboard').busy, false);

assert.equal(classifyAsyncStatus('status warn', true), 'busy');
assert.equal(classifyAsyncStatus('status ok', true), 'success');
assert.equal(classifyAsyncStatus('status error', false), 'error');
assert.equal(classifyAsyncStatus('status', false), 'idle');

for (const token of ['spn-submitted', 'spn-returned', 'lawyer-document']) {
  assert.equal(asyncFocusToken(token), token);
  assert.ok(asyncFocusSelectors(token).length >= 2);
}
assert.equal(asyncFocusToken('deal-id-or-free-text'), '');
assert.deepEqual(asyncFocusSelectors('unknown'), []);

const selectors = JSON.stringify([
  ...asyncFocusSelectors('spn-submitted'),
  ...asyncFocusSelectors('spn-returned'),
  ...asyncFocusSelectors('lawyer-document')
]);
assert.ok(!selectors.includes('uuid'));
assert.ok(!selectors.includes('address'));

console.log('Navigator v2 async feedback semantics passed');
