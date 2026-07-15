import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = JSON.parse(readFileSync(new URL('../config/nav-v2-mobile-first-screen.json', import.meta.url), 'utf8'));

function selectFirstScreenActions(surface, candidates) {
  const rules = policy.surfaces[surface];
  if (!rules) throw new Error(`Unknown mobile surface: ${surface}`);
  const primary = candidates.filter((item) => item.kind === 'primary').slice(0, rules.required_primary_actions);
  const context = candidates.filter((item) => item.kind === 'context').slice(0, rules.max_context_actions);
  return {
    primary,
    context,
    overflow: candidates.filter((item) => !primary.includes(item) && !context.includes(item))
  };
}

assert.equal(policy.schema_version, 1);
assert.equal(policy.min_test_width_px, 360);
assert.equal(policy.max_width_px, 430);
assert.ok(policy.first_screen_height_px >= 760);

const dashboard = selectFirstScreenActions('dashboard', [
  { id: 'priority-1', kind: 'primary' },
  { id: 'queue', kind: 'context' },
  { id: 'hero-primary-duplicate', kind: 'primary' },
  { id: 'quick-actions-duplicate', kind: 'context' }
]);
assert.deepEqual(dashboard.primary.map((item) => item.id), ['priority-1']);
assert.equal(dashboard.context.length, 2);
assert.ok(dashboard.overflow.some((item) => item.id === 'hero-primary-duplicate'));

const deals = selectFirstScreenActions('deals', [
  { id: 'first-deal', kind: 'primary' },
  { id: 'work-mode', kind: 'context' },
  { id: 'attention-mode', kind: 'context' },
  { id: 'advanced-filter', kind: 'context' },
  { id: 'new-deal', kind: 'context' },
  { id: 'second-deal', kind: 'primary' }
]);
assert.deepEqual(deals.primary.map((item) => item.id), ['first-deal']);
assert.deepEqual(deals.context.map((item) => item.id), ['work-mode', 'attention-mode', 'advanced-filter']);
assert.ok(deals.overflow.some((item) => item.id === 'new-deal'));

const dealCard = selectFirstScreenActions('deal-card', [
  { id: 'completion-next', kind: 'primary' },
  { id: 'action-focus-duplicate', kind: 'primary' },
  { id: 'documents', kind: 'context' },
  { id: 'risks', kind: 'context' },
  { id: 'quick-status', kind: 'context' }
]);
assert.deepEqual(dealCard.primary.map((item) => item.id), ['completion-next']);
assert.equal(dealCard.context.length, 2);
assert.ok(policy.surfaces['deal-card'].hide_duplicate_action_focus_after_completion);
assert.ok(dealCard.overflow.some((item) => item.id === 'action-focus-duplicate'));

const manager = selectFirstScreenActions('manager', [
  { id: 'decision', kind: 'primary' },
  { id: 'risks', kind: 'context' },
  { id: 'documents', kind: 'context' },
  { id: 'responsibility', kind: 'context' },
  { id: 'confirmed-result-link', kind: 'primary' }
]);
assert.deepEqual(manager.primary.map((item) => item.id), ['decision']);
assert.deepEqual(manager.context.map((item) => item.id), ['risks', 'documents']);
assert.ok(manager.overflow.some((item) => item.id === 'confirmed-result-link'));

console.log('Navigator v2 mobile first-screen action-budget semantics passed');
