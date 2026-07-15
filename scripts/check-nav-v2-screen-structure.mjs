import assert from 'node:assert/strict';
import {
  contextualRegionName,
  normalizeScreenSurface,
  screenStructureContract,
  screenStructureId,
  screenStructurePolicy
} from '../assets/js/nav-v2/screen-structure-model-v2.js';

assert.equal(normalizeScreenSurface('deal-card'), 'deal_card');
assert.equal(normalizeScreenSurface('manager'), 'manager');
assert.equal(normalizeScreenSurface('unknown'), '');

for (const surface of ['dashboard', 'deals', 'deal_card', 'manager']) {
  const policy = screenStructurePolicy(surface);
  assert.ok(policy, `${surface} policy must exist`);
  assert.ok(policy.titleId, `${surface} must define one main title id`);
  assert.ok(policy.kpiLabel, `${surface} must define a KPI group name`);
  assert.ok(Array.isArray(policy.sections), `${surface} sections must be explicit`);
  assert.ok(Array.isArray(policy.items), `${surface} item rules must be explicit`);
  assert.match(screenStructureId(surface, 'main action', 0), /^nav-[a-z-]+-main-action$/);
}

assert.equal(contextualRegionName('Главное действие', 'Сделка на Просторной'), 'Главное действие: Сделка на Просторной');
assert.equal(contextualRegionName('Следующий шаг', ''), 'Следующий шаг');

const contract = screenStructureContract();
assert.deepEqual(contract.surfaces, ['dashboard', 'deals', 'deal_card', 'manager']);
assert.equal(contract.oneMainPerScreen, true);
assert.equal(contract.oneH1PerScreen, true);
assert.equal(contract.actionSectionsNamedByHeadings, true);
assert.equal(contract.itemHeadingsLevel, 3);
assert.equal(contract.unnamedCardsStayUnpromoted, true);
assert.equal(contract.liveStatusIsNotLandmark, true);
assert.equal(contract.layoutMutationAllowed, false);
assert.equal(contract.storageAllowed, false);
assert.equal(contract.networkAllowed, false);

console.log('Navigator v2 screen structure semantic checks passed');
