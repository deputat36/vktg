const SURFACES = Object.freeze({
  dashboard: Object.freeze({
    pageLabel: 'Рабочий стол Навигатора',
    regions: Object.freeze([
      Object.freeze({ key: 'priority', selector: '.role-home-focus', heading: 'h2', fallback: 'Приоритетная работа' }),
      Object.freeze({ key: 'quick-actions', selector: '.role-home-quick-actions', heading: 'h2', fallback: 'Быстрые действия' }),
      Object.freeze({ key: 'recent-deals', selector: '.role-home-recent', heading: 'h2', fallback: 'Последние рабочие сделки' })
    ]),
    articles: Object.freeze([
      Object.freeze({ key: 'priority-deal', selector: '.role-home-priority-card', heading: 'h3', fallback: 'Приоритетная сделка' })
    ])
  }),
  deals: Object.freeze({
    pageLabel: 'Рабочий список сделок',
    regions: Object.freeze([
      Object.freeze({ key: 'workspace', selector: '.deals-workspace', heading: 'h2', fallback: 'Сделки для работы' })
    ]),
    articles: Object.freeze([
      Object.freeze({ key: 'deal', selector: '.deals-work-card', heading: '.deal-title', fallback: 'Рабочая сделка', virtualLevel: 3 })
    ])
  }),
  deal_card: Object.freeze({
    pageLabel: 'Карточка сделки',
    regions: Object.freeze([
      Object.freeze({ key: 'spn-rework', selector: '#spnReworkWorkflowV2', heading: 'h2', fallback: 'Доработка карточки СПН' }),
      Object.freeze({ key: 'lawyer-document', selector: '#lawyerDocumentCycleV2', heading: 'h2', fallback: 'Документный цикл юриста' }),
      Object.freeze({ key: 'completion', selector: '#dealCompletionEvidenceV2', heading: 'h2', fallback: 'Подтверждённый результат и следующий шаг' }),
      Object.freeze({ key: 'action-focus', selector: '#dealActionFocus', heading: 'h2', fallback: 'Главное действие сейчас' })
    ]),
    articles: Object.freeze([])
  }),
  manager: Object.freeze({
    pageLabel: 'Менеджерский контроль сделок',
    regions: Object.freeze([
      Object.freeze({ key: 'confirmed-results', selector: '.manager-confirmed-results', heading: 'h2', fallback: 'Подтверждённые результаты' }),
      Object.freeze({ key: 'readiness', selector: '.manager-readiness-summary', heading: 'h2', fallback: 'Правдивая готовность' }),
      Object.freeze({ key: 'decision-queue', selector: '.manager-queue', heading: 'h2', fallback: 'Очередь решений' })
    ]),
    articles: Object.freeze([
      Object.freeze({ key: 'decision', selector: '.manager-decision-card', heading: '.manager-decision-head b', fallback: 'Сделка, требующая решения', virtualLevel: 3 }),
      Object.freeze({ key: 'confirmed', selector: '.manager-confirmed-card', heading: 'h3', fallback: 'Подтверждённый результат' })
    ])
  })
});

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeLandmarkSurface(value) {
  const key = clean(value).replace('-', '_');
  return Object.hasOwn(SURFACES, key) ? key : '';
}

export function landmarkStructurePolicy(surface) {
  const key = normalizeLandmarkSurface(surface);
  return key ? SURFACES[key] : Object.freeze({ pageLabel: 'Рабочая область Навигатора', regions: Object.freeze([]), articles: Object.freeze([]) });
}

export function stableLandmarkId(surface, kind, index = 0) {
  const safeSurface = normalizeLandmarkSurface(surface) || 'page';
  const safeKind = clean(kind).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'region';
  const safeIndex = Math.max(0, Number.parseInt(index, 10) || 0) + 1;
  return `nav-${safeSurface.replace('_', '-')}-${safeKind}-${safeIndex}`;
}

export function virtualHeadingPolicy(level = 3) {
  const normalized = Math.min(6, Math.max(2, Number.parseInt(level, 10) || 3));
  return Object.freeze({ role: 'heading', ariaLevel: String(normalized) });
}

export function landmarkStructureContract() {
  return Object.freeze({
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
}
