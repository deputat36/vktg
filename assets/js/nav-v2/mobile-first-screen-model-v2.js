const PAGE_POLICIES = Object.freeze({
  dashboard: Object.freeze({ primaryRegion: 'role-home-focus', maxVisibleActions: 2 }),
  deals: Object.freeze({ primaryRegion: 'deals-workspace', maxVisibleActions: 2 }),
  'deal-card': Object.freeze({ primaryRegion: 'deal-action-focus', maxVisibleActions: 2 }),
  manager: Object.freeze({ primaryRegion: 'manager-queue', maxVisibleActions: 3 })
});

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function mobileFirstScreenPolicy(page) {
  const policy = PAGE_POLICIES[page];
  if (!policy) throw new Error(`Unknown mobile first-screen page: ${page}`);
  return policy;
}

export function buildMobileFirstScreenPlan(page, { items = [], actions = [] } = {}) {
  const policy = mobileFirstScreenPolicy(page);
  const safeItems = list(items);
  const safeActions = list(actions);
  return {
    page,
    primaryRegion: policy.primaryRegion,
    primaryItem: safeItems[0] || null,
    secondaryItems: safeItems.slice(1),
    visibleActions: safeActions.slice(0, policy.maxVisibleActions),
    overflowActions: safeActions.slice(policy.maxVisibleActions),
    maxVisibleActions: policy.maxVisibleActions
  };
}

