import './ux-measurement-v2.js?v=20260715-01';

const DISCLOSURE_SELECTOR = '.mobile-first-screen-more, .mobile-first-screen-details';
let mediaQuery = null;
let resizeBound = false;

function mobileQuery() {
  if (mediaQuery) return mediaQuery;
  mediaQuery = window.matchMedia('(max-width: 430px)');
  return mediaQuery;
}

function syncDisclosures(root = document) {
  const compact = mobileQuery().matches;
  root.querySelectorAll(DISCLOSURE_SELECTOR).forEach((details) => {
    if (details instanceof HTMLDetailsElement) details.open = !compact;
  });
}

export function applyMobileFirstScreenDisclosure(root = document) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  syncDisclosures(root);
  if (resizeBound) return;
  mobileQuery().addEventListener('change', () => syncDisclosures(document));
  resizeBound = true;
}
