const DEAL_TABS = new Set(['overview', 'risks', 'docs', 'reviews', 'tasks', 'expenses', 'comments', 'history']);

const ACTION_LABELS = {
  dashboard: 'Открыть приоритетную работу',
  deals: 'Продолжить работу со сделкой',
  deal_card: 'Открыть следующий рабочий раздел',
  manager: 'Открыть решение по сделке'
};

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function dealTabFromDataset(dataset = {}) {
  const candidates = [
    dataset.tab,
    dataset.tabShortcut,
    dataset.actionFocusTab,
    dataset.completionNextTab,
    dataset.spnReworkRoute,
    dataset.lawyerDocumentTab
  ];
  return candidates.map(clean).find((value) => DEAL_TABS.has(value)) || '';
}

export function dealTabPanelSelector(tab) {
  const safe = clean(tab);
  return DEAL_TABS.has(safe) ? `[data-deal-tab-panel="${safe}"]` : '';
}

export function primaryActionAccessibleName({ text = '', ariaLabel = '', surface = '' } = {}) {
  const explicit = clean(ariaLabel);
  if (explicit) return explicit;
  const visible = clean(text);
  if (visible) return visible;
  return ACTION_LABELS[clean(surface)] || 'Открыть главное действие';
}

export function shouldRestoreDisclosureFocus({ open, activeInside, activeIsSummary } = {}) {
  return open === false && activeInside === true && activeIsSummary !== true;
}

export function focusContinuityPolicy() {
  return Object.freeze({
    positiveTabindexAllowed: false,
    focusTargetAfterDealTabChange: 'active_work_panel',
    disclosureCloseTarget: 'summary',
    primaryActionRequiresAccessibleName: true,
    visibleFocusRequired: true
  });
}
