const PAGE_SELECTOR = '.mobile-first-screen-page';
const DETAILS_SELECTOR = '.mobile-first-screen-more, .mobile-first-screen-details';
const TAB_SELECTOR = '.tabs [data-tab]';
const TAB_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);
const originalPositions = new WeakMap();

let bindingsReady = false;
let pendingFocus = null;
let lastHashFocus = '';

function pages(root = document) {
  if (root instanceof Element && root.matches(PAGE_SELECTOR)) return [root];
  return [...root.querySelectorAll(PAGE_SELECTOR)];
}

function directChildren(page) {
  return [...page.children];
}

function rememberOrder(page) {
  directChildren(page).forEach((child, index) => {
    if (!originalPositions.has(child)) originalPositions.set(child, index);
  });
}

function cssOrder(element) {
  const value = Number.parseInt(getComputedStyle(element).order, 10);
  return Number.isFinite(value) ? value : 0;
}

function reorderPage(page, compact) {
  rememberOrder(page);
  const children = directChildren(page);
  children.sort((left, right) => {
    if (compact) {
      const byCss = cssOrder(left) - cssOrder(right);
      if (byCss) return byCss;
    }
    return (originalPositions.get(left) ?? 0) - (originalPositions.get(right) ?? 0);
  });
  children.forEach((child) => page.append(child));
  page.dataset.navDomOrder = compact ? 'compact' : 'source';
}

function detailsSummary(details) {
  return details.querySelector(':scope > summary');
}

function syncDetailsState(root = document) {
  root.querySelectorAll(DETAILS_SELECTOR).forEach((details) => {
    if (!(details instanceof HTMLDetailsElement)) return;
    const summary = detailsSummary(details);
    if (!summary) return;
    summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
  });
}

function routeIntent(element) {
  if (element.hasAttribute('data-tab')) {
    return { route: element.dataset.tab || '', mode: 'tab', targetId: '' };
  }
  if (element.hasAttribute('data-tab-shortcut')) {
    return { route: element.dataset.tabShortcut || '', mode: 'panel', targetId: '' };
  }
  if (element.hasAttribute('data-action-focus-tab')) {
    return { route: element.dataset.actionFocusTab || '', mode: 'panel', targetId: '' };
  }
  if (element.hasAttribute('data-completion-next-tab')) {
    return { route: element.dataset.completionNextTab || '', mode: 'panel', targetId: '' };
  }
  if (element.hasAttribute('data-spn-rework-route')) {
    return {
      route: element.dataset.spnReworkRoute || '',
      mode: 'panel',
      targetId: element.dataset.spnReworkTarget || ''
    };
  }
  return null;
}

function activeTab(root = document, route = '') {
  return [...root.querySelectorAll(TAB_SELECTOR)]
    .find((tab) => String(tab.dataset.tab || '') === route)
    || root.querySelector(`${TAB_SELECTOR}.active`);
}

function focusableHeading(container) {
  if (!container) return null;
  const heading = container.matches('h1,h2,h3')
    ? container
    : container.querySelector('h1,h2,h3,[data-nav-focus-target]');
  return heading || container;
}

function markFocusTarget(target) {
  if (!target) return null;
  if (!target.matches('a,button,input,select,textarea,summary,[tabindex]')) target.tabIndex = -1;
  target.dataset.navFocusTarget = '1';
  target.classList.add('nav-focus-landed');
  target.addEventListener('blur', () => target.classList.remove('nav-focus-landed'), { once: true });
  return target;
}

function focusTarget(target) {
  const prepared = markFocusTarget(target);
  if (!prepared) return false;
  prepared.focus({ preventScroll: true });
  prepared.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return document.activeElement === prepared;
}

function findPanel(root, route) {
  const panels = [...root.querySelectorAll('[data-nav-tab-panel]')];
  return panels.find((panel) => panel.dataset.navTabPanel === route)
    || panels.find((panel) => panel.getAttribute('role') === 'tabpanel')
    || null;
}

function focusIntent(root, intent) {
  if (!intent?.route && !intent?.targetId) return false;
  if (intent.targetId) {
    const explicit = document.getElementById(intent.targetId);
    if (explicit) return focusTarget(focusableHeading(explicit));
  }
  if (intent.mode === 'tab') return focusTarget(activeTab(root, intent.route));
  const panel = findPanel(root, intent.route);
  if (panel) return focusTarget(focusableHeading(panel));
  const explicitHash = document.getElementById(intent.route);
  if (explicitHash) return focusTarget(focusableHeading(explicitHash));
  return false;
}

function scheduleFocus(root = document) {
  const hashRoute = location.hash.replace(/^#/, '');
  const shouldUseHash = !pendingFocus
    && hashRoute
    && hashRoute !== lastHashFocus
    && (!document.activeElement || document.activeElement === document.body);
  const intent = pendingFocus || (shouldUseHash ? { route: hashRoute, mode: 'panel', targetId: '' } : null);
  if (!intent) return;

  requestAnimationFrame(() => {
    if (focusIntent(root, intent)) {
      if (shouldUseHash) lastHashFocus = hashRoute;
      pendingFocus = null;
    }
  });
}

function enhanceTabs(root = document) {
  root.querySelectorAll('.tabs').forEach((tabList, listIndex) => {
    const tabs = [...tabList.querySelectorAll('[data-tab]')];
    if (!tabs.length) return;

    tabList.setAttribute('role', 'tablist');
    if (!tabList.getAttribute('aria-label')) tabList.setAttribute('aria-label', 'Разделы карточки сделки');

    const active = tabs.find((tab) => tab.classList.contains('active')) || tabs[0];
    tabs.forEach((tab, tabIndex) => {
      const route = String(tab.dataset.tab || `section-${tabIndex + 1}`);
      tab.id = tab.id || `navDealTab-${listIndex + 1}-${route}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', tab === active ? 'true' : 'false');
      tab.tabIndex = tab === active ? 0 : -1;
    });

    const section = tabList.closest('section.card');
    if (!section) return;
    let panel = section.querySelector(':scope > [data-nav-tab-panel]');
    if (!panel) {
      panel = document.createElement('div');
      panel.setAttribute('role', 'tabpanel');
      panel.tabIndex = -1;
      while (tabList.nextSibling) panel.append(tabList.nextSibling);
      section.append(panel);
    }
    const route = String(active.dataset.tab || '');
    panel.dataset.navTabPanel = route;
    panel.setAttribute('aria-labelledby', active.id);
    active.setAttribute('aria-controls', panel.id || `navDealPanel-${listIndex + 1}`);
    panel.id = panel.id || `navDealPanel-${listIndex + 1}`;
    const heading = panel.querySelector(':scope > h1, :scope > h2, :scope > h3');
    if (heading) {
      heading.tabIndex = -1;
      heading.dataset.navFocusTarget = '1';
    }
  });
}

function onClickCapture(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const control = target.closest(
    '[data-tab], [data-tab-shortcut], [data-action-focus-tab], [data-completion-next-tab], [data-spn-rework-route]'
  );
  const intent = control ? routeIntent(control) : null;
  if (intent?.route || intent?.targetId) pendingFocus = intent;
}

function onToggle(event) {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !details.matches(DETAILS_SELECTOR)) return;
  const summary = detailsSummary(details);
  summary?.setAttribute('aria-expanded', details.open ? 'true' : 'false');
  if (!details.open && document.activeElement && details.contains(document.activeElement)) summary?.focus();
}

function onTabKeydown(event) {
  if (!TAB_KEYS.has(event.key)) return;
  const current = event.target;
  if (!(current instanceof Element) || !current.matches('[role="tab"][data-tab]')) return;
  const tabList = current.closest('[role="tablist"]');
  const tabs = [...(tabList?.querySelectorAll('[role="tab"][data-tab]') || [])];
  if (!tabs.length) return;

  const currentIndex = Math.max(0, tabs.indexOf(current));
  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;

  event.preventDefault();
  pendingFocus = { route: tabs[nextIndex].dataset.tab || '', mode: 'tab', targetId: '' };
  tabs[nextIndex].click();
}

function bindGlobalEvents() {
  if (bindingsReady) return;
  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('toggle', onToggle, true);
  document.addEventListener('keydown', onTabKeydown);
  bindingsReady = true;
}

export function applyAccessibilityContinuity(root = document, compact = false) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  bindGlobalEvents();
  pages(root).forEach((page) => reorderPage(page, compact));
  enhanceTabs(root);
  syncDetailsState(root);
  scheduleFocus(root);
}
