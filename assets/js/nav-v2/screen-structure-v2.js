import {
  contextualRegionName,
  normalizeScreenSurface,
  screenStructureId,
  screenStructurePolicy
} from './screen-structure-model-v2.js?v=20260715-01';
import { applyFormAssociations } from './form-association-v2.js?v=20260715-01';

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function surfaceFromMain(main) {
  if (!(main instanceof HTMLElement)) return '';
  if (main.classList.contains('mobile-first-screen-dashboard')) return 'dashboard';
  if (main.classList.contains('mobile-first-screen-deals')) return 'deals';
  if (main.classList.contains('mobile-first-screen-card')) return 'deal_card';
  if (main.classList.contains('mobile-first-screen-manager')) return 'manager';
  return normalizeScreenSurface(document.documentElement.dataset.navUxSurface || '');
}

function ensureId(element, preferred) {
  if (!(element instanceof HTMLElement)) return '';
  if (!element.id) element.id = preferred;
  return element.id;
}

function prepareHeading(element, level, id) {
  if (!(element instanceof HTMLElement)) return '';
  const tag = element.tagName.toLowerCase();
  const nativeHeading = /^h[1-6]$/.test(tag);
  if (!nativeHeading) {
    element.setAttribute('role', 'heading');
    element.setAttribute('aria-level', String(level));
  }
  return ensureId(element, id);
}

function connectRegion(region, heading, id) {
  if (!(region instanceof HTMLElement) || !(heading instanceof HTMLElement)) return;
  const headingId = ensureId(heading, id);
  if (!headingId) return;
  region.setAttribute('aria-labelledby', headingId);
  region.removeAttribute('aria-label');
}

function applyMainName(main, policy) {
  const headings = [...main.querySelectorAll('h1')];
  if (headings.length !== 1) return;
  const title = headings[0];
  const titleId = ensureId(title, policy.titleId);
  if (titleId) main.setAttribute('aria-labelledby', titleId);
  main.dataset.navScreenStructure = policy.key;
}

function applySectionRules(main, policy) {
  policy.sections.forEach((rule) => {
    const regions = rule.multiple
      ? [...main.querySelectorAll(rule.selector)]
      : [main.querySelector(rule.selector)].filter(Boolean);
    regions.forEach((region, index) => {
      if (!(region instanceof HTMLElement)) return;
      if (region.matches('[role="status"], [role="alert"]')) return;
      const heading = region.querySelector(rule.heading);
      if (!(heading instanceof HTMLElement)) return;
      const id = screenStructureId(policy.key, rule.key, index);
      prepareHeading(heading, Number(heading.tagName.slice(1)) || 2, `${id}-title`);
      connectRegion(region, heading, `${id}-title`);
    });
  });
}

function applyItemRules(main, policy) {
  policy.items.forEach((rule) => {
    main.querySelectorAll(rule.selector).forEach((item, index) => {
      if (!(item instanceof HTMLElement)) return;
      const heading = item.querySelector(rule.heading);
      if (!(heading instanceof HTMLElement)) return;
      const id = screenStructureId(policy.key, rule.key, index);
      prepareHeading(heading, rule.level || 3, `${id}-title`);
      connectRegion(item, heading, `${id}-title`);
    });
  });
}

function applyKpiNames(main, policy) {
  main.querySelectorAll('.kpi-row').forEach((row, index) => {
    if (!(row instanceof HTMLElement)) return;
    row.setAttribute('role', 'group');
    if (!row.getAttribute('aria-label')) {
      row.setAttribute('aria-label', index ? `${policy.kpiLabel}, дополнительная группа` : policy.kpiLabel);
    }
    row.removeAttribute('aria-labelledby');
  });
}

function parentItemTitle(region) {
  const item = region.closest('.manager-decision-card, .manager-confirmed-card');
  if (!(item instanceof HTMLElement)) return '';
  const labelledBy = item.getAttribute('aria-labelledby');
  const labelled = labelledBy ? document.getElementById(labelledBy) : null;
  if (labelled instanceof HTMLElement) return cleanText(labelled.textContent);
  return cleanText(item.querySelector('h3, [role="heading"], .manager-decision-head b')?.textContent);
}

function applyContextualManagerRegions(main) {
  main.querySelectorAll('.manager-main-action').forEach((region) => {
    if (!(region instanceof HTMLElement)) return;
    region.setAttribute('aria-label', contextualRegionName('Главное действие', parentItemTitle(region)));
    region.removeAttribute('aria-labelledby');
  });
  main.querySelectorAll('.manager-confirmed-next').forEach((region) => {
    if (!(region instanceof HTMLElement)) return;
    region.setAttribute('aria-label', contextualRegionName('Следующий шаг', parentItemTitle(region)));
    region.removeAttribute('aria-labelledby');
  });
}

function preserveLiveOnlySemantics(main) {
  main.querySelectorAll('[role="status"], [role="alert"]').forEach((live) => {
    if (!(live instanceof HTMLElement)) return;
    live.removeAttribute('aria-labelledby');
    if (live.tagName.toLowerCase() === 'section') live.dataset.navLiveOnly = 'true';
  });
}

export function applyScreenStructure(root = document) {
  const mains = root instanceof HTMLElement && root.matches('main')
    ? [root]
    : [...root.querySelectorAll('main')];
  if (mains.length !== 1) return false;
  const main = mains[0];
  const policy = screenStructurePolicy(surfaceFromMain(main));
  if (!policy) return false;
  applyMainName(main, policy);
  applySectionRules(main, policy);
  applyItemRules(main, policy);
  applyKpiNames(main, policy);
  if (policy.key === 'manager') applyContextualManagerRegions(main);
  applyFormAssociations(main);
  preserveLiveOnlySemantics(main);
  return true;
}
