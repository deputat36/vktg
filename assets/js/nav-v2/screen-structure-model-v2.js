const SURFACES = Object.freeze({
  dashboard: Object.freeze({
    key: 'dashboard',
    titleId: 'navDashboardScreenTitle',
    kpiLabel: 'Показатели рабочего стола',
    sections: Object.freeze([
      Object.freeze({ selector: '.role-home-focus', heading: 'h2', key: 'focus' }),
      Object.freeze({ selector: '.role-home-quick-actions', heading: 'h2', key: 'quick-actions' }),
      Object.freeze({ selector: '.role-home-recent', heading: 'h2', key: 'recent' })
    ]),
    items: Object.freeze([
      Object.freeze({ selector: '.role-home-priority-card', heading: 'h3', level: 3, key: 'priority' })
    ])
  }),
  deals: Object.freeze({
    key: 'deals',
    titleId: 'navDealsScreenTitle',
    kpiLabel: 'Показатели списка сделок',
    sections: Object.freeze([
      Object.freeze({ selector: '.deals-workspace', heading: 'h2', key: 'workspace' })
    ]),
    items: Object.freeze([
      Object.freeze({ selector: '.deals-work-card', heading: '.deal-title', level: 3, key: 'deal' })
    ])
  }),
  deal_card: Object.freeze({
    key: 'deal-card',
    titleId: 'navDealCardScreenTitle',
    kpiLabel: 'Показатели карточки сделки',
    sections: Object.freeze([
      Object.freeze({ selector: '#dealActionFocus', heading: 'h2', key: 'main-action' }),
      Object.freeze({ selector: '#spnReworkWorkflowV2', heading: 'h2', key: 'spn-rework' }),
      Object.freeze({ selector: '#lawyerDocumentCycleV2', heading: 'h2', key: 'document-cycle' }),
      Object.freeze({ selector: '#dealCompletionEvidenceV2', heading: 'h2', key: 'completion' }),
      Object.freeze({ selector: ':scope > section.card', heading: 'h2', key: 'card-section', multiple: true })
    ]),
    items: Object.freeze([])
  }),
  manager: Object.freeze({
    key: 'manager',
    titleId: 'navManagerScreenTitle',
    kpiLabel: 'Главные показатели контроля',
    sections: Object.freeze([
      Object.freeze({ selector: '.manager-confirmed-results', heading: 'h2', key: 'confirmed-results' }),
      Object.freeze({ selector: '.manager-readiness-summary', heading: 'h2', key: 'readiness' }),
      Object.freeze({ selector: '.manager-queue', heading: 'h2', key: 'queue' })
    ]),
    items: Object.freeze([
      Object.freeze({ selector: '.manager-decision-card', heading: '.manager-decision-head b', level: 3, key: 'decision' }),
      Object.freeze({ selector: '.manager-confirmed-card', heading: 'h3', level: 3, key: 'confirmed' })
    ])
  })
});

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeScreenSurface(value) {
  const key = clean(value).toLowerCase().replace(/-/g, '_');
  return Object.hasOwn(SURFACES, key) ? key : '';
}

export function screenStructurePolicy(surface) {
  const key = normalizeScreenSurface(surface);
  return key ? SURFACES[key] : null;
}

export function screenStructureId(surface, kind, index = 0) {
  const policy = screenStructurePolicy(surface);
  if (!policy) return '';
  const safeKind = clean(kind).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'region';
  const suffix = Number(index) > 0 ? `-${Number(index) + 1}` : '';
  return `nav-${policy.key}-${safeKind}${suffix}`;
}

export function contextualRegionName(base, context) {
  const normalizedBase = clean(base);
  const normalizedContext = clean(context);
  if (!normalizedBase) return normalizedContext;
  if (!normalizedContext) return normalizedBase;
  return `${normalizedBase}: ${normalizedContext}`;
}

export function screenStructureContract() {
  return Object.freeze({
    surfaces: Object.freeze(Object.keys(SURFACES)),
    oneMainPerScreen: true,
    oneH1PerScreen: true,
    mainNamedByH1: true,
    actionSectionsNamedByHeadings: true,
    itemHeadingsLevel: 3,
    kpiUsesNamedGroup: true,
    repeatedNestedRegionsNeedContext: true,
    unnamedCardsStayUnpromoted: true,
    liveStatusIsNotLandmark: true,
    layoutMutationAllowed: false,
    storageAllowed: false,
    networkAllowed: false
  });
}
