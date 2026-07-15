import {
  landmarkStructurePolicy,
  stableLandmarkId,
  virtualHeadingPolicy
} from './landmark-structure-model-v2.js?v=20260715-01';

const SURFACE_SELECTORS = Object.freeze([
  ['dashboard', '.mobile-first-screen-dashboard'],
  ['deals', '.mobile-first-screen-deals'],
  ['deal_card', '.mobile-first-screen-card'],
  ['manager', '.mobile-first-screen-manager']
]);

function surfaceForMain(main) {
  return SURFACE_SELECTORS.find(([, selector]) => main.matches(selector))?.[0] || '';
}

function directPageMain(root = document) {
  if (root instanceof HTMLElement && root.matches('main.mobile-first-screen-page')) return root;
  return root.querySelector('main.mobile-first-screen-page');
}

function elementText(element) {
  return String(element?.textContent || '').trim().replace(/\s+/g, ' ');
}

function ensureHeadingId(heading, surface, key, index) {
  if (!(heading instanceof HTMLElement)) return '';
  if (!heading.id) heading.id = stableLandmarkId(surface, `${key}-title`, index);
  return heading.id;
}

function ensureVirtualHeading(heading, level) {
  if (!(heading instanceof HTMLElement)) return;
  if (/^H[1-6]$/.test(heading.tagName)) return;
  const policy = virtualHeadingPolicy(level);
  heading.setAttribute('role', policy.role);
  heading.setAttribute('aria-level', policy.ariaLevel);
  heading.dataset.navVirtualHeading = policy.ariaLevel;
}

function nameContainer(container, rule, surface, index) {
  if (!(container instanceof HTMLElement)) return;
  if (container.matches('[role="status"], [role="alert"]')) return;
  const heading = container.querySelector(rule.heading);
  if (heading instanceof HTMLElement) {
    ensureVirtualHeading(heading, rule.virtualLevel || 2);
    const headingId = ensureHeadingId(heading, surface, rule.key, index);
    if (headingId) {
      container.setAttribute('aria-labelledby', headingId);
      container.removeAttribute('aria-label');
      container.dataset.navLandmarkName = 'heading';
      return;
    }
  }
  if (!container.getAttribute('aria-labelledby') && !container.getAttribute('aria-label')) {
    container.setAttribute('aria-label', rule.fallback);
    container.dataset.navLandmarkName = 'fallback';
  }
}

function prepareMain(main, surface, policy) {
  const h1s = [...main.querySelectorAll('h1')];
  const primary = h1s[0];
  main.dataset.navLandmarkSurface = surface;
  main.dataset.navMainCount = String(document.querySelectorAll('main.mobile-first-screen-page').length);
  main.dataset.navH1Count = String(h1s.length);
  if (primary instanceof HTMLElement) {
    const titleId = ensureHeadingId(primary, surface, 'page', 0);
    main.setAttribute('aria-labelledby', titleId);
    main.removeAttribute('aria-label');
  } else if (!main.getAttribute('aria-label')) {
    main.setAttribute('aria-label', policy.pageLabel);
  }
  h1s.slice(1).forEach((heading, index) => {
    heading.setAttribute('role', 'heading');
    heading.setAttribute('aria-level', '2');
    heading.dataset.navUnexpectedH1 = String(index + 2);
  });
}

function prepareRules(main, surface, rules) {
  rules.forEach((rule) => {
    main.querySelectorAll(rule.selector).forEach((container, index) => nameContainer(container, rule, surface, index));
  });
}

function prepareStatusBoundaries(main) {
  main.querySelectorAll('[role="status"], [role="alert"]').forEach((status) => {
    if (!(status instanceof HTMLElement)) return;
    status.removeAttribute('aria-labelledby');
    status.dataset.navLiveBoundary = status.getAttribute('role') || 'status';
  });
}

function exposeHeadingSequence(main) {
  const sequence = [...main.querySelectorAll('h1,h2,h3,[role="heading"][aria-level]')]
    .map((heading) => {
      const level = /^H[1-6]$/.test(heading.tagName)
        ? heading.tagName.slice(1)
        : heading.getAttribute('aria-level');
      return `${level}:${elementText(heading).slice(0, 80)}`;
    });
  main.dataset.navHeadingSequence = sequence.join('|');
}

export function applyLandmarkStructure(root = document) {
  if (typeof document === 'undefined') return;
  const main = directPageMain(root);
  if (!(main instanceof HTMLElement)) return;
  const surface = surfaceForMain(main);
  if (!surface) return;
  const policy = landmarkStructurePolicy(surface);
  prepareMain(main, surface, policy);
  prepareRules(main, surface, policy.regions);
  prepareRules(main, surface, policy.articles);
  prepareStatusBoundaries(main);
  exposeHeadingSequence(main);
}
