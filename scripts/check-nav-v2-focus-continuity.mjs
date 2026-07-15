import assert from 'node:assert/strict';
import {
  dealTabFromDataset,
  dealTabPanelLabel,
  dealTabPanelSelector,
  focusContinuityPolicy,
  primaryActionAccessibleName,
  shouldRestoreDisclosureFocus
} from '../assets/js/nav-v2/focus-continuity-model-v2.js?v=20260715-01';

assert.equal(dealTabFromDataset({ tab: 'docs' }), 'docs');
assert.equal(dealTabFromDataset({ actionFocusTab: 'tasks' }), 'tasks');
assert.equal(dealTabFromDataset({ completionNextTab: 'risks' }), 'risks');
assert.equal(dealTabFromDataset({ tab: 'unknown', dealId: 'secret' }), '');
assert.equal(dealTabPanelSelector('comments'), '[data-deal-tab-panel="comments"]');
assert.equal(dealTabPanelSelector('secret-id'), '');
assert.equal(dealTabPanelLabel('docs'), 'Документы сделки');
assert.equal(primaryActionAccessibleName({ text: '  Продолжить   работу ' }), 'Продолжить работу');
assert.equal(primaryActionAccessibleName({ ariaLabel: 'Явное действие', text: 'Другое' }), 'Явное действие');
assert.equal(primaryActionAccessibleName({ surface: 'manager' }), 'Открыть решение по сделке');
assert.equal(shouldRestoreDisclosureFocus({ open: false, activeInside: true, activeIsSummary: false }), true);
assert.equal(shouldRestoreDisclosureFocus({ open: true, activeInside: true, activeIsSummary: false }), false);
assert.equal(shouldRestoreDisclosureFocus({ open: false, activeInside: true, activeIsSummary: true }), false);
assert.deepEqual(focusContinuityPolicy(), {
  positiveTabindexAllowed: false,
  focusTargetAfterDealTabChange: 'active_work_panel',
  disclosureCloseTarget: 'summary',
  primaryActionRequiresAccessibleName: true,
  visibleFocusRequired: true
});

console.log('Navigator v2 focus continuity semantics passed');
