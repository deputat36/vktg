import assert from 'node:assert/strict';
import {
  landmarkStructureContract,
  landmarkStructurePolicy,
  normalizeLandmarkSurface,
  stableLandmarkId,
  virtualHeadingPolicy
} from '../assets/js/nav-v2/landmark-structure-model-v2.js';

assert.equal(normalizeLandmarkSurface('deal-card'), 'deal_card');
assert.equal(normalizeLandmarkSurface('unknown'), '');

const dashboard = landmarkStructurePolicy('dashboard');
assert.equal(dashboard.pageLabel, 'Рабочий стол Навигатора');
assert.deepEqual(dashboard.regions.map((rule) => rule.key), ['priority', 'quick-actions', 'recent-deals']);
assert.equal(dashboard.articles[0].heading, 'h3');

const deals = landmarkStructurePolicy('deals');
assert.equal(deals.regions[0].selector, '.deals-workspace');
assert.equal(deals.articles[0].virtualLevel, 3);

const card = landmarkStructurePolicy('deal-card');
assert.deepEqual(card.regions.map((rule) => rule.selector), [
  '#spnReworkWorkflowV2',
  '#lawyerDocumentCycleV2',
  '#dealCompletionEvidenceV2',
  '#dealActionFocus'
]);

const manager = landmarkStructurePolicy('manager');
assert.deepEqual(manager.regions.map((rule) => rule.key), ['confirmed-results', 'readiness', 'decision-queue']);
assert.equal(manager.articles[0].virtualLevel, 3);

assert.equal(stableLandmarkId('deal-card', 'action focus', 0), 'nav-deal-card-action-focus-1');
assert.equal(stableLandmarkId('manager', 'decision', 2), 'nav-manager-decision-3');
assert.deepEqual(virtualHeadingPolicy(9), { role: 'heading', ariaLevel: '6' });
assert.deepEqual(virtualHeadingPolicy(1), { role: 'heading', ariaLevel: '2' });

assert.deepEqual(landmarkStructureContract(), {
  oneMainPerSurface: true,
  oneH1PerSurface: true,
  topLevelRegionHeadingLevel: 2,
  itemHeadingLevel: 3,
  namedRegionsUseExistingHeadingsFirst: true,
  statusAndAlertAreNotPromotedToRegions: true,
  visualOrderUnchanged: true,
  permissionsUnchanged: true,
  storageAllowed: false,
  networkTransportAdded: false
});

console.log('Navigator v2 landmark and heading structure semantic checks passed');
