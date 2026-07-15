import {
  dealTabFromDataset,
  dealTabPanelLabel,
  dealTabPanelSelector,
  primaryActionAccessibleName,
  shouldRestoreDisclosureFocus
} from './focus-continuity-model-v2.js?v=20260715-01';

const DISCLOSURE_SELECTOR = '.mobile-first-screen-more, .mobile-first-screen-details';
const PRIMARY_SELECTOR = '.mobile-first-screen-primary-action';
const TAB_ACTION_SELECTOR = '[data-tab], [data-tab-shortcut], [data-action-focus-tab], [data-completion-next-tab], [data-spn-rework-route], [data-lawyer-document-tab]';
let installed = false;
let keyboardModality = false;
let detailSequence = 0;
let lastHashFocus = '';

function pageSurface() {
  if (document.documentElement.dataset.navUxSurface) return document.documentElement.dataset.navUxSurface;
  if (document.querySelector('.mobile-first-screen-dashboard')) return 'dashboard';
  if (document.querySelector('.mobile-first-screen-deals')) return 'deals';
  if (document.querySelector('.mobile-first-screen-card')) return 'deal_card';
  if (document.querySelector('.mobile-first-screen-manager')) return 'manager';
  return '';
}

function reducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function focusPanel(tab, force = false) {
  if (!force && !keyboardModality) return false;
  const selector = dealTabPanelSelector(tab);
  const panel = selector ? document.querySelector(selector) : null;
  if (!(panel instanceof HTMLElement)) return false;
  panel.focus({ preventScroll: true });
  panel.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  return document.activeElement === panel;
}

function schedulePanelFocus(tab, force = false) {
  if (!tab) return;
  queueMicrotask(() => {
    if (focusPanel(tab, force)) return;
    setTimeout(() => focusPanel(tab, force), 80);
  });
}

function detailsBody(details) {
  return details.querySelector(':scope > .mobile-first-screen-more-list, :scope > .mobile-first-screen-details-body');
}

function prepareDisclosure(details) {
  if (!(details instanceof HTMLDetailsElement)) return;
  const summary = details.querySelector(':scope > summary');
  const body = detailsBody(details);
  if (!(summary instanceof HTMLElement) || !(body instanceof HTMLElement)) return;
  if (!body.id) {
    detailSequence += 1;
    body.id = `navFocusDisclosure${detailSequence}`;
  }
  summary.setAttribute('aria-controls', body.id);
  summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
  summary.dataset.navFocusSummary = 'true';
}

function preparePrimaryAction(action) {
  if (!(action instanceof HTMLElement)) return;
  const name = primaryActionAccessibleName({
    text: action.textContent,
    ariaLabel: action.getAttribute('aria-label'),
    surface: pageSurface()
  });
  if (!action.getAttribute('aria-label') && !String(action.textContent || '').trim()) action.setAttribute('aria-label', name);
  action.dataset.navPrimaryAction = 'true';
}

function prepareDealTabPanel(root = document) {
  const activeTab = root.querySelector('.tabs [data-tab].active');
  const tab = activeTab instanceof HTMLElement ? dealTabFromDataset(activeTab.dataset) : '';
  const tabs = activeTab?.closest('.tabs');
  const panel = tabs?.closest('section.card');
  if (!tab || !(panel instanceof HTMLElement)) return;
  panel.dataset.dealTabPanel = tab;
  panel.tabIndex = -1;
  panel.setAttribute('aria-label', dealTabPanelLabel(tab));
  tabs.setAttribute('aria-label', 'Разделы карточки сделки');
  tabs.querySelectorAll('[data-tab]').forEach((button) => {
    button.setAttribute('aria-pressed', button === activeTab ? 'true' : 'false');
  });
}

function focusHashPanelOnce() {
  const tab = String(location.hash || '').replace(/^#/, '');
  if (!tab || lastHashFocus === `${location.pathname}#${tab}`) return;
  const selector = dealTabPanelSelector(tab);
  if (!selector || !document.querySelector(selector)) return;
  lastHashFocus = `${location.pathname}#${tab}`;
  schedulePanelFocus(tab, true);
}

export function applyActionFocusContinuity(root = document) {
  root.querySelectorAll(PRIMARY_SELECTOR).forEach(preparePrimaryAction);
  root.querySelectorAll(DISCLOSURE_SELECTOR).forEach(prepareDisclosure);
  prepareDealTabPanel(root);
  focusHashPanelOnce();
}

export function installActionFocusContinuity() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.addEventListener('keydown', (event) => {
    if (['Tab', 'Enter', ' ', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) keyboardModality = true;
  }, true);
  document.addEventListener('pointerdown', () => { keyboardModality = false; }, true);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const action = target.closest(TAB_ACTION_SELECTOR);
    const tab = action ? dealTabFromDataset(action.dataset) : '';
    if (tab) schedulePanelFocus(tab);
  }, true);

  document.addEventListener('toggle', (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.matches(DISCLOSURE_SELECTOR)) return;
    prepareDisclosure(details);
    const summary = details.querySelector(':scope > summary');
    const active = document.activeElement;
    const restore = shouldRestoreDisclosureFocus({
      open: details.open,
      activeInside: active instanceof Element && details.contains(active),
      activeIsSummary: active === summary
    });
    if (restore && summary instanceof HTMLElement) summary.focus({ preventScroll: true });
  }, true);
}

installActionFocusContinuity();
